import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { MASTER_KEY, QR_HMAC, PADROES } from "../config";
import { db, refs, FieldValue, Timestamp } from "../util/firebase";
import { lerQr, igualSeguro } from "../util/cripto";
import { cpfValido, endereco, mascararCpf, pessoa, soDigitos, texto, umDe } from "../util/validacao";
import { calcularPedidoIngresso, taxaServico, type Titular } from "../dominio/precos";
import { exigirEscopoSede, exigirLogin, exigirMembro } from "../dominio/permissoes";
import { confirmarPedidoPago, encerrarPedidoNaoPago } from "../dominio/processamento";
import { pagarmeDaTorcida } from "../pagarme/credenciais";
import { clientePg, descritor, enderecoPg } from "../pagarme/montagem";
import { registrarCpfDaConta } from "./conta";
import { motivoRecusa, recusaDefinitiva, PagarmeErro, type PgPagamento, type PgPedido, type PgSplit } from "../pagarme/cliente";
import { dividir, subsedePodeVender } from "../dominio/split";
import type { Evento, Ingresso, Pedido, Sede, Socio, Torcida } from "../dominio/tipos";

const segredos = [MASTER_KEY, QR_HMAC];

/**
 * Torcida apta a vender. Antes de o site ser publicado, só a equipe da própria torcida (membros do
 * painel) consegue comprar — para testar. Módulo desligado (eventos ou sócios) bloqueia a venda.
 */
export async function torcidaVendendo(
  tid: string,
  opcoes: { uid?: string; modulo?: "eventos" | "socios"; permitirNaoPublicada?: boolean } = {},
): Promise<Torcida> {
  const t = (await refs.torcida(tid).get()).data() as (Torcida & { publicada?: boolean; modulos?: { eventos?: boolean; socios?: boolean } }) | undefined;
  if (!t) throw new HttpsError("not-found", "Torcida não encontrada.");
  if (t.status === "suspensa") throw new HttpsError("failed-precondition", "Vendas temporariamente indisponíveis.");
  if (!t.pagamentos?.configurado) throw new HttpsError("failed-precondition", "Esta torcida ainda não ativou os pagamentos.");
  if (opcoes.modulo && t.modulos?.[opcoes.modulo] === false) {
    throw new HttpsError("failed-precondition", opcoes.modulo === "eventos" ? "Venda de ingressos desativada." : "Associação de sócios desativada.");
  }
  if (t.publicada !== true && !opcoes.permitirNaoPublicada) {
    const membro = opcoes.uid ? (await refs.membro(tid, opcoes.uid).get()).data() : undefined;
    if (!membro?.ativo) throw new HttpsError("failed-precondition", "O site desta torcida ainda não foi publicado.");
  }
  return t;
}

export function pagamentoPg(
  metodo: "pix" | "cartao",
  torcida: Torcida,
  dados: Record<string, unknown>,
  expiraSeg: number,
  opcoes: { split?: PgSplit[]; cartaoSalvo?: { cardId: string; ciclo: "first" | "subsequent" } } = {},
): PgPagamento {
  const split = opcoes.split?.length ? opcoes.split : undefined;
  if (metodo === "pix") {
    if (!torcida.pagamentos.pix) throw new HttpsError("failed-precondition", "Pix indisponível nesta torcida.");
    return { payment_method: "pix", pix: { expires_in: expiraSeg }, split };
  }
  if (!torcida.pagamentos.cartao) throw new HttpsError("failed-precondition", "Cartão indisponível nesta torcida.");
  const statement_descriptor = torcida.pagamentos.descritorFatura || descritor(torcida.nome);
  if (opcoes.cartaoSalvo) {
    return {
      payment_method: "credit_card",
      credit_card: { installments: 1, statement_descriptor, card_id: opcoes.cartaoSalvo.cardId, recurrence_cycle: opcoes.cartaoSalvo.ciclo },
      split,
    };
  }
  const cartao = (dados.cartao ?? {}) as Record<string, unknown>;
  const token = texto(cartao.token, "token do cartão", { max: 80 });
  return {
    payment_method: "credit_card",
    credit_card: {
      installments: 1,
      statement_descriptor,
      card_token: token,
      card: { billing_address: enderecoPg(endereco(cartao.endereco)) },
    },
    split,
  };
}

/** Grava o resultado da criação do pedido na Pagar.me e dispara a confirmação se já veio pago (cartão). */
/** Erro da API da Pagar.me (não é recusa do banco) traduzido para o comprador; o detalhe técnico fica no log. */
export function mensagemErroPagarme(e: PagarmeErro): string {
  if (e.status >= 500 || e.status === 0) return "A operadora de pagamento está instável agora. Tente de novo em alguns minutos.";
  if (e.status === 401 || e.status === 403) return "Os pagamentos desta torcida estão em manutenção. Avise a diretoria.";
  return "Não foi possível processar o pagamento com estes dados. Confira o cartão ou pague com Pix.";
}

export async function aplicarRespostaPedido(tid: string, pedidoId: string, pg: PgPedido, expiraEm: Date) {
  const charge = pg.charges?.[0];
  const t = charge?.last_transaction;
  await refs.pedido(tid, pedidoId).update({
    status: "aguardando",
    pagarme: { orderId: pg.id, chargeId: charge?.id ?? null },
    ...(t?.qr_code
      ? { pix: { qrCode: t.qr_code, qrCodeUrl: t.qr_code_url ?? null, expiraEm: Timestamp.fromDate(t.expires_at ? new Date(t.expires_at) : expiraEm) } }
      : {}),
  });
  if (pg.status === "paid") {
    await confirmarPedidoPago(tid, pedidoId, pg, QR_HMAC.value());
    return "pago" as const;
  }
  if (pg.status === "failed" || pg.status === "canceled" || charge?.status === "failed") {
    const motivo = motivoRecusa(pg);
    await encerrarPedidoNaoPago(tid, pedidoId, "falhou", motivo);
    return { falhou: motivo, definitiva: recusaDefinitiva(pg) };
  }
  return "aguardando" as const;
}

/**
 * Checkout de ingressos. Login anônimo é aceito (compra sem cadastro);
 * se o usuário for sócio ativo, o ingresso dele sai pelo preço de sócio.
 */
export const criarPedidoIngresso = onCall({ secrets: segredos }, async (req) => {
  const uid = exigirLogin(req, { permitirAnonimo: true });
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const eventoId = texto(d.eventoId, "evento", { max: 40 });
  const metodo = umDe(d.metodo, "método", ["pix", "cartao"] as const);
  const comprador = pessoa(d.comprador);

  const titularesBrutos = Array.isArray(d.titulares) ? d.titulares : [];
  const titulares: Titular[] = titularesBrutos.map((t, i) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const cpf = soDigitos(o.cpf);
    if (!cpfValido(cpf)) throw new HttpsError("invalid-argument", `CPF do ingresso ${i + 1} inválido.`);
    return { nome: texto(o.nome, `nome do ingresso ${i + 1}`, { min: 3, max: 64 }), cpf };
  });
  if (!titulares.length) throw new HttpsError("invalid-argument", "Informe ao menos um ingresso.");
  if (new Set(titulares.map((t) => t.cpf)).size !== titulares.length) {
    throw new HttpsError("invalid-argument", "Cada ingresso precisa de um CPF diferente (ingresso é intransferível).");
  }

  const torcida = await torcidaVendendo(tid, { uid, modulo: "eventos" });
  const pct = torcida.taxaServicoPct ?? PADROES.taxaServicoPct;

  // Sócio ativo?
  let socio: Titular | null = null;
  let socioJaUsouPreco = false;
  if (req.auth?.token.firebase?.sign_in_provider !== "anonymous") {
    const s = (await refs.socio(tid, uid).get()).data() as Socio | undefined;
    if (s && s.status === "ativo" && s.validoAte && s.validoAte.toMillis() > Date.now()) {
      socio = { nome: s.nome, cpf: s.cpf };
      const [emitidos, pendentes] = await Promise.all([
        refs.ingressos(tid).where("uid", "==", uid).where("eventoId", "==", eventoId).get(),
        refs.pedidos(tid).where("uid", "==", uid).where("eventoId", "==", eventoId).where("status", "==", "aguardando").get(),
      ]);
      socioJaUsouPreco =
        emitidos.docs.some((x) => x.get("tipo") === "socio" && x.get("status") !== "cancelado") ||
        pendentes.docs.some((x) => ((x.get("itens") ?? []) as { tipo: string }[]).some((i) => i.tipo === "socio"));
    }
  }

  const pedidoRef = refs.pedidos(tid).doc();
  const expiraEm = new Date(Date.now() + PADROES.pixExpiraSegundos * 1000);

  // Reserva de lugares + criação do pedido em transação (evita vender acima da capacidade)
  const calc = await db.runTransaction(async (tx) => {
    const evRef = refs.evento(tid, eventoId);
    const ev = (await tx.get(evRef)).data() as Evento | undefined;
    if (!ev || ev.status !== "publicado") throw new HttpsError("failed-precondition", "Evento indisponível para venda.");
    const agora = Date.now();
    if (ev.data.toMillis() < agora - 6 * 3600_000) throw new HttpsError("failed-precondition", "Este evento já aconteceu.");
    if (ev.vendaAte && ev.vendaAte.toMillis() < agora) throw new HttpsError("failed-precondition", "Vendas encerradas para este evento.");
    const limite = ev.limitePorPedido ?? PADROES.limiteIngressosPorPedido;
    if (titulares.length > limite) throw new HttpsError("invalid-argument", `Máximo de ${limite} ingressos por compra.`);
    if (ev.capacidade && (ev.vendidos ?? 0) + (ev.reservados ?? 0) + titulares.length > ev.capacidade) {
      throw new HttpsError("resource-exhausted", "Ingressos esgotados (ou reservados em compras em andamento).");
    }
    const sede = (await tx.get(refs.sede(tid, ev.sedeId))).data() as Sede | undefined;
    if (!subsedePodeVender(torcida, sede)) {
      throw new HttpsError("failed-precondition", "As vendas deste evento ainda não foram liberadas: a conta de recebimento da subsede não está ativa.");
    }
    const c = calcularPedidoIngresso({ evento: ev, titulares, socio, socioJaUsouPreco, pct });
    if (c.total <= 0) throw new HttpsError("failed-precondition", "Evento sem valor configurado.");
    const divisao = dividir(torcida, sede, c.valorBase, c.taxa);
    tx.update(evRef, { reservados: FieldValue.increment(titulares.length) });
    const pedido: Pedido = {
      tipo: "ingresso",
      uid,
      comprador,
      metodo,
      valorBase: c.valorBase,
      taxa: c.taxa,
      total: c.total,
      status: "criando",
      sedeId: ev.sedeId,
      eventoId,
      eventoNome: ev.nome,
      itens: c.itens,
      liquidacao: divisao.liquidacao,
      expiraEm: Timestamp.fromDate(expiraEm),
      criadoEm: Timestamp.now(),
    };
    tx.set(pedidoRef, pedido);
    return { ...c, eventoNome: ev.nome, split: divisao.split };
  });

  try {
    const pg = await pagarmeDaTorcida(tid);
    const items = calc.itens.map((it, i) => ({
      amount: it.valorBase,
      description: `${calc.eventoNome} · ${it.tipo === "socio" ? "Sócio" : "Público"}`.slice(0, 256),
      quantity: 1,
      code: `ing${i + 1}`,
    }));
    if (calc.taxa > 0) items.push({ amount: calc.taxa, description: "Taxa de serviço", quantity: 1, code: "taxa" });
    const resposta = await pg.criarPedido({
      code: pedidoRef.id,
      items,
      customer: clientePg(comprador, uid),
      payments: [pagamentoPg(metodo, torcida, d, PADROES.pixExpiraSegundos, { split: calc.split })],
      metadata: { torcidaId: tid, pedidoId: pedidoRef.id, tipo: "ingresso" },
    });
    await registrarCpfDaConta(uid, comprador.cpf, req.auth?.token.firebase?.sign_in_provider === "anonymous");
    const resultado = await aplicarRespostaPedido(tid, pedidoRef.id, resposta, expiraEm);
    if (typeof resultado === "object") throw new HttpsError("aborted", resultado.falhou);
    return { pedidoId: pedidoRef.id, status: resultado };
  } catch (e) {
    if (e instanceof HttpsError && e.code === "aborted") throw e;
    await encerrarPedidoNaoPago(tid, pedidoRef.id, "falhou", e instanceof Error ? e.message : "erro").catch(() => undefined);
    logger.error("Falha ao criar pedido na Pagar.me", { tid, pedidoId: pedidoRef.id, erro: String(e) });
    if (e instanceof PagarmeErro) throw new HttpsError("unavailable", mensagemErroPagarme(e));
    throw e instanceof HttpsError ? e : new HttpsError("internal", "Não foi possível iniciar o pagamento.");
  }
});

/** Prévia de preço para o checkout mostrar (o valor final é sempre recalculado em criarPedidoIngresso). */
export const cotarIngresso = onCall(async (req) => {
  const uid = req.auth?.uid;
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const eventoId = texto(d.eventoId, "evento", { max: 40 });
  const [tSnap, evSnap] = await Promise.all([refs.torcida(tid).get(), refs.evento(tid, eventoId).get()]);
  const t = tSnap.data() as Torcida | undefined;
  const ev = evSnap.data() as Evento | undefined;
  if (!t || !ev || ev.status !== "publicado") throw new HttpsError("not-found", "Evento indisponível.");
  const pct = t.taxaServicoPct ?? PADROES.taxaServicoPct;
  let socio: { nome: string; cpf: string; jaUsou: boolean } | null = null;
  if (uid && req.auth?.token.firebase?.sign_in_provider !== "anonymous") {
    const s = (await refs.socio(tid, uid).get()).data() as Socio | undefined;
    if (s && s.status === "ativo" && s.validoAte && s.validoAte.toMillis() > Date.now()) {
      const emitidos = await refs.ingressos(tid).where("uid", "==", uid).where("eventoId", "==", eventoId).get();
      socio = {
        nome: s.nome,
        cpf: s.cpf,
        jaUsou: emitidos.docs.some((x) => x.get("tipo") === "socio" && x.get("status") !== "cancelado"),
      };
    }
  }
  const disponiveis = ev.capacidade ? Math.max(0, ev.capacidade - (ev.vendidos ?? 0) - (ev.reservados ?? 0)) : null;
  return {
    pct,
    valorSocio: ev.valorSocio,
    valorPublico: ev.valorPublico,
    taxaSocio: taxaServico(ev.valorSocio, pct),
    taxaPublico: taxaServico(ev.valorPublico, pct),
    limitePorPedido: ev.limitePorPedido ?? PADROES.limiteIngressosPorPedido,
    disponiveis,
    socio,
  };
});

/**
 * Consulta o pedido direto na Pagar.me. Serve de rede de segurança quando o webhook atrasa
 * ou não foi configurado: o botão "Já paguei" do checkout chama isto.
 */
export const verificarPedido = onCall({ secrets: segredos }, async (req) => {
  const uid = exigirLogin(req, { permitirAnonimo: true });
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const pedidoId = texto(d.pedidoId, "pedido", { max: 40 });
  const p = (await refs.pedido(tid, pedidoId).get()).data() as Pedido | undefined;
  if (!p || p.uid !== uid) throw new HttpsError("not-found", "Pedido não encontrado.");
  if (p.status !== "aguardando" || !p.pagarme?.orderId) return { status: p.status };
  const pg = await pagarmeDaTorcida(tid);
  const pedidoPg = await pg.obterPedido(p.pagarme.orderId);
  if (pedidoPg.status === "paid") {
    await confirmarPedidoPago(tid, pedidoId, pedidoPg, QR_HMAC.value());
    return { status: "pago" };
  }
  if (pedidoPg.status === "failed" || pedidoPg.status === "canceled") {
    await encerrarPedidoNaoPago(tid, pedidoId, "falhou", motivoRecusa(pedidoPg));
    return { status: "falhou" };
  }
  return { status: "aguardando" };
});

/** Acesso aos ingressos pelo link enviado ao comprador (funciona em qualquer aparelho, sem login). */
export const ingressosDoPedido = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const pedidoId = texto(d.pedidoId, "pedido", { max: 40 });
  const chave = texto(d.chave, "chave", { max: 60 });
  const p = (await refs.pedido(tid, pedidoId).get()).data() as Pedido | undefined;
  if (!p?.chaveAcesso || !igualSeguro(chave, p.chaveAcesso)) throw new HttpsError("not-found", "Link inválido.");
  const snaps = await Promise.all((p.ingressoIds ?? []).map((id) => refs.ingresso(tid, id).get()));
  return {
    eventoNome: p.eventoNome,
    ingressos: snaps
      .filter((s) => s.exists)
      .map((s) => {
        const i = s.data() as Ingresso;
        return {
          id: s.id,
          eventoNome: i.eventoNome,
          eventoData: i.eventoData.toMillis(),
          tipo: i.tipo,
          titularNome: i.titularNome,
          titularCpf: mascararCpf(i.titularCpf),
          codigo: i.codigo,
          qr: i.qr,
          status: i.status,
        };
      }),
  };
});

/**
 * Portaria: valida o QR (ou CPF) e dá baixa na entrada em transação, então o mesmo
 * ingresso não passa duas vezes nem com dois leitores ao mesmo tempo.
 */
export const validarEntrada = onCall({ secrets: [QR_HMAC] }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const eventoId = texto(d.eventoId, "evento", { max: 40 });
  const membro = await exigirMembro(req, tid, ["diretoria", "subsede", "portaria"]);
  const confirmar = d.confirmar !== false;
  const ev = (await refs.evento(tid, eventoId).get()).data() as Evento | undefined;
  if (!ev) throw new HttpsError("not-found", "Evento não encontrado.");
  // Subsede (e portaria ligada a uma sede) só confere a entrada dos eventos da própria sede
  if (membro.papel === "subsede" || (membro.papel === "portaria" && membro.sedeId)) exigirEscopoSede(membro, ev.sedeId);
  if (ev.status === "cancelado") return { resultado: "cancelado", mensagem: "Este evento foi cancelado." };

  let ingressoRef: FirebaseFirestore.DocumentReference;
  if (d.qr) {
    const qr = lerQr(String(d.qr), QR_HMAC.value());
    if (!qr || qr.tid !== tid) return { resultado: "invalido", mensagem: "QR Code inválido ou de outra torcida." };
    if (qr.tipo === "s") return { resultado: "invalido", mensagem: "Este QR é a carteirinha de sócio, não um ingresso." };
    ingressoRef = refs.ingresso(tid, qr.id);
  } else if (d.codigo) {
    // código legível impresso no ingresso (ex.: K7QM-2XRA)
    const codigo = String(d.codigo).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (codigo.length !== 8) throw new HttpsError("invalid-argument", "Código inválido.");
    const q = await refs.ingressos(tid).where("eventoId", "==", eventoId).where("codigo", "==", `${codigo.slice(0, 4)}-${codigo.slice(4)}`).limit(1).get();
    if (q.empty) return { resultado: "nao_encontrado", mensagem: "Nenhum ingresso com este código neste evento." };
    ingressoRef = q.docs[0].ref;
  } else {
    const cpf = soDigitos(d.cpf);
    if (!cpfValido(cpf)) throw new HttpsError("invalid-argument", "CPF inválido.");
    const q = await refs.ingressos(tid).where("eventoId", "==", eventoId).where("titularCpf", "==", cpf).get();
    const valido = q.docs.find((x) => x.get("status") === "valido") ?? q.docs[0];
    if (!valido) return { resultado: "nao_encontrado", mensagem: "Nenhum ingresso neste CPF para o evento." };
    ingressoRef = valido.ref;
  }

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ingressoRef);
    const i = snap.data() as Ingresso | undefined;
    if (!i) return { resultado: "invalido", mensagem: "Ingresso não encontrado." };
    const info = {
      titularNome: i.titularNome,
      titularCpf: mascararCpf(i.titularCpf),
      tipo: i.tipo,
      codigo: i.codigo,
      eventoNome: i.eventoNome,
    };
    if (i.eventoId !== eventoId) return { resultado: "outro_evento", mensagem: `Ingresso de outro evento: ${i.eventoNome}.`, ...info };
    if (i.status === "cancelado") return { resultado: "cancelado", mensagem: "Ingresso cancelado.", ...info };
    if (i.status === "usado") {
      return {
        resultado: "ja_usado",
        mensagem: "Entrada já registrada.",
        usadoEm: i.usadoEm?.toMillis() ?? null,
        ...info,
      };
    }
    if (confirmar) {
      tx.update(ingressoRef, { status: "usado", usadoEm: FieldValue.serverTimestamp(), usadoPor: membro.uid });
      tx.set(refs.evento(tid, eventoId), { entradas: FieldValue.increment(1) }, { merge: true });
    }
    return { resultado: "liberado", mensagem: "Entrada liberada.", ...info };
  });
});
