import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { EMAIL_API_KEY, MASTER_KEY, QR_HMAC, PADROES, ESCALA_PUBLICA } from "../config";
import { db, refs, FieldValue, Timestamp } from "../util/firebase";
import { lerQr, igualSeguro } from "../util/cripto";
import { cpfValido, endereco, mascararCpf, pessoa, soDigitos, texto, umDe } from "../util/validacao";
import { calcularPedidoIngresso, taxaServico, type Titular } from "../dominio/precos";
import { exigirEscopoSede, exigirLogin, exigirMembro } from "../dominio/permissoes";
import { confirmarPedidoPago, encerrarPedidoNaoPago } from "../dominio/processamento";
import { pagarmeDaTorcida } from "../pagarme/credenciais";
import { clientePg, descritor, enderecoPg } from "../pagarme/montagem";
import { motivoRecusa, recusaDefinitiva, PagarmeErro, type PgPagamento, type PgPedido, type PgSplit } from "../pagarme/cliente";
import { dividir, subsedePodeVender } from "../dominio/split";
import type { Evento, Ingresso, Pedido, Sede, Socio, Torcida } from "../dominio/tipos";

const segredos = [MASTER_KEY, QR_HMAC, EMAIL_API_KEY];

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
  const pRef = refs.pedido(tid, pedidoId);
  await db.runTransaction(async (tx) => {
    const atual = (await tx.get(pRef)).data() as Pedido | undefined;
    if (!atual) return;
    const upd: Record<string, unknown> = { pagarme: { orderId: pg.id, chargeId: charge?.id ?? null } };
    // O webhook da Pagar.me pode chegar antes desta resposta e já ter confirmado (ou encerrado) o pedido:
    // nunca volta um pedido pago/encerrado para "aguardando" (isso faria o pagamento ser processado duas vezes).
    if (atual.status === "criando") {
      upd.status = "aguardando";
      if (t?.qr_code) {
        upd.pix = { qrCode: t.qr_code, qrCodeUrl: t.qr_code_url ?? null, expiraEm: Timestamp.fromDate(t.expires_at ? new Date(t.expires_at) : expiraEm) };
      }
    }
    tx.update(pRef, upd);
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

/** Id de documento do Firestore gerado no aparelho para a compra (20 letras e números). */
const ID_COMPRA = /^[A-Za-z0-9]{20}$/;

/** A Pagar.me respondeu recusando (4xx, menos tempo esgotado e excesso de pedidos): a cobrança não foi criada. */
const recusaDaPagarme = (status: number) => status >= 400 && status < 500 && status !== 408 && status !== 429;

/** A mesma compra chegou de novo (resposta anterior perdida): devolve o pedido que já existe, sem cobrar outra vez. */
async function respostaDaCompraRepetida(tid: string, pedidoId: string, p: Pedido, uid: string) {
  if (p.uid !== uid || p.tipo !== "ingresso") throw new HttpsError("already-exists", "Esta compra já foi registrada. Atualize a página.");
  if (p.status === "pago") return { pedidoId, status: "pago" as const };
  if (p.status === "aguardando" || p.status === "criando") return { pedidoId, status: "aguardando" as const };
  // tentativa anterior encerrada (recusada ou expirada): o aparelho gera outro id e tenta de novo
  throw new HttpsError("failed-precondition", "A tentativa anterior não foi concluída. Toque em pagar de novo.");
}

/**
 * Checkout de ingressos. Login anônimo é aceito (compra sem cadastro);
 * se o usuário for sócio ativo, o ingresso dele sai pelo preço de sócio.
 */
export const criarPedidoIngresso = onCall({ secrets: segredos, ...ESCALA_PUBLICA }, async (req) => {
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

  // Id da compra gerado no aparelho: se a resposta se perder (internet ruim) e a pessoa tocar em pagar de novo,
  // a segunda chamada encontra o mesmo pedido em vez de reservar lugares e cobrar outra vez.
  const idCompra = typeof d.idCompra === "string" && ID_COMPRA.test(d.idCompra) ? d.idCompra : null;
  const pedidoRef = idCompra ? refs.pedido(tid, idCompra) : refs.pedidos(tid).doc();
  if (idCompra) {
    const ja = (await pedidoRef.get()).data() as Pedido | undefined;
    if (ja) return await respostaDaCompraRepetida(tid, pedidoRef.id, ja, uid);
  }
  const expiraEm = new Date(Date.now() + PADROES.pixExpiraSegundos * 1000);

  // Reserva de lugares + criação do pedido em transação (evita vender acima da capacidade)
  const calc = await db.runTransaction(async (tx) => {
    if (idCompra && (await tx.get(pedidoRef)).exists) return null; // duas chamadas iguais ao mesmo tempo: só uma reserva
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
    if (c.total < 0 || (c.total === 0 && c.itens.some((i) => i.tipo !== "socio"))) {
      throw new HttpsError("failed-precondition", "Evento sem valor configurado.");
    }
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
  if (!calc) return await respostaDaCompraRepetida(tid, pedidoRef.id, (await pedidoRef.get()).data() as Pedido, uid);

  // Ingresso de sócio grátis (evento com valor de sócio R$ 0): nada a cobrar, emite direto
  if (calc.total === 0) {
    await confirmarPedidoPago(tid, pedidoRef.id, { id: `gratis_${pedidoRef.id}`, status: "paid", charges: [] } as unknown as PgPedido, QR_HMAC.value());
    return { pedidoId: pedidoRef.id, status: "pago" as const };
  }

  let respostaPg: PgPedido | null = null;
  /** Chegou a pedir à Pagar.me: daqui em diante, um erro sem resposta não prova que a cobrança não aconteceu. */
  let pediuPg = false;
  try {
    const pg = await pagarmeDaTorcida(tid);
    const items = calc.itens
      .map((it, i) => ({
        amount: it.valorBase,
        description: `${calc.eventoNome} · ${it.tipo === "socio" ? "Sócio" : "Público"}`.slice(0, 256),
        quantity: 1,
        code: `ing${i + 1}`,
      }))
      .filter((it) => it.amount > 0); // ingresso de sócio grátis junto com pagos: a Pagar.me não aceita item de R$ 0
    if (calc.taxa > 0) items.push({ amount: calc.taxa, description: "Taxa de serviço", quantity: 1, code: "taxa" });
    pediuPg = true;
    const resposta = await pg.criarPedido({
      code: pedidoRef.id,
      items,
      customer: clientePg(comprador, uid),
      payments: [pagamentoPg(metodo, torcida, d, PADROES.pixExpiraSegundos, { split: calc.split })],
      metadata: { torcidaId: tid, pedidoId: pedidoRef.id, tipo: "ingresso" },
    });
    respostaPg = resposta;
    const resultado = await aplicarRespostaPedido(tid, pedidoRef.id, resposta, expiraEm);
    if (typeof resultado === "object") throw new HttpsError("aborted", resultado.falhou);
    return { pedidoId: pedidoRef.id, status: resultado };
  } catch (e) {
    if (e instanceof HttpsError && e.code === "aborted") throw e;
    if (respostaPg) {
      // A cobrança já existe na Pagar.me (pode até já estar paga): não encerra nem libera os lugares.
      // Guarda ao menos o id da Pagar.me para o webhook, o "Já paguei" e a rotina de 15 min conciliarem.
      logger.error("Pedido criado na Pagar.me, mas a confirmação local falhou", { tid, pedidoId: pedidoRef.id, erro: String(e) });
      await refs.pedido(tid, pedidoRef.id).update({ "pagarme.orderId": respostaPg.id }).catch(() => undefined);
      return { pedidoId: pedidoRef.id, status: "aguardando" as const };
    }
    if (pediuPg && !(e instanceof PagarmeErro && recusaDaPagarme(e.status))) {
      // Sem resposta (tempo esgotado, queda de rede, 5xx): a Pagar.me pode ter criado e até cobrado o pedido.
      // Não libera os lugares nem marca como falhou: fica "criando" e a conferência (verificarPedido, rotina de
      // 15 min) pergunta à Pagar.me pelo código do pedido e aplica o que ela disser.
      logger.error("Pagar.me sem resposta ao criar o pedido: fica para conferência", { tid, pedidoId: pedidoRef.id, erro: String(e) });
      return { pedidoId: pedidoRef.id, status: "aguardando" as const };
    }
    await encerrarPedidoNaoPago(tid, pedidoRef.id, "falhou", e instanceof Error ? e.message : "erro").catch(() => undefined);
    logger.error("Falha ao criar pedido na Pagar.me", { tid, pedidoId: pedidoRef.id, erro: String(e) });
    if (e instanceof PagarmeErro) throw new HttpsError("unavailable", mensagemErroPagarme(e));
    throw e instanceof HttpsError ? e : new HttpsError("internal", "Não foi possível iniciar o pagamento.");
  }
});

/** Prévia de preço para o checkout mostrar (o valor final é sempre recalculado em criarPedidoIngresso). */
export const cotarIngresso = onCall(ESCALA_PUBLICA, async (req) => {
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
export const verificarPedido = onCall({ secrets: segredos, ...ESCALA_PUBLICA }, async (req) => {
  const uid = exigirLogin(req, { permitirAnonimo: true });
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const pedidoId = texto(d.pedidoId, "pedido", { max: 40 });
  const p = (await refs.pedido(tid, pedidoId).get()).data() as Pedido | undefined;
  if (!p || p.uid !== uid) throw new HttpsError("not-found", "Pedido não encontrado.");
  if (p.status === "criando") {
    // A criação na Pagar.me ficou sem resposta: pergunta pelo código do pedido
    const pg = await pagarmeDaTorcida(tid);
    const achado = await pg.buscarPedidoPorCodigo(pedidoId).catch(() => undefined);
    if (achado) {
      const r = await aplicarRespostaPedido(tid, pedidoId, achado, p.expiraEm?.toDate() ?? new Date(Date.now() + PADROES.pixExpiraSegundos * 1000));
      return { status: typeof r === "object" ? "falhou" : r };
    }
    // Não existe na Pagar.me (e já passou tempo suficiente para ter aparecido): libera os lugares
    if (achado === null && Date.now() - p.criadoEm.toMillis() > 2 * 60_000) {
      await encerrarPedidoNaoPago(tid, pedidoId, "falhou", "O pagamento não chegou a ser criado. Tente de novo.");
      return { status: "falhou" };
    }
    return { status: "aguardando" };
  }
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
export const ingressosDoPedido = onCall(ESCALA_PUBLICA, async (req) => {
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
 * Ingressos que outra pessoa comprou no CPF do sócio. O CPF do sócio não é verificado (qualquer um pode se
 * associar com o CPF de outra pessoa), então quem é só titular vê que o ingresso existe, mas não recebe o QR
 * nem o código de entrada: esses ficam com quem comprou, que repassa o link dos ingressos ao titular.
 */
export const ingressosNoMeuNome = onCall(ESCALA_PUBLICA, async (req) => {
  const uid = exigirLogin(req);
  const tid = texto((req.data as Record<string, unknown> | undefined)?.tid, "torcida", { max: 40 });
  const snap = await refs.ingressos(tid).where("titularUid", "==", uid).orderBy("eventoData", "desc").limit(50).get();
  return {
    ingressos: snap.docs
      .map((s) => ({ id: s.id, i: s.data() as Ingresso }))
      .filter(({ i }) => i.uid !== uid)
      .map(({ id, i }) => ({
        id,
        pedidoId: i.pedidoId,
        eventoId: i.eventoId,
        eventoNome: i.eventoNome,
        eventoData: i.eventoData.toMillis(),
        tipo: i.tipo,
        titularNome: i.titularNome,
        titularCpf: mascararCpf(i.titularCpf),
        status: i.status,
        usadoEm: i.usadoEm?.toMillis() ?? null,
      })),
  };
});

/**
 * Portaria: valida o QR (ou CPF) e dá baixa na entrada em transação, então o mesmo
 * ingresso não passa duas vezes nem com dois leitores ao mesmo tempo.
 */
export const validarEntrada = onCall({ secrets: [QR_HMAC], ...ESCALA_PUBLICA }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const eventoId = texto(d.eventoId, "evento", { max: 40 });
  const membro = await exigirMembro(req, tid, ["diretoria", "subsede", "portaria"]);
  const confirmar = d.confirmar !== false;
  // Id desta leitura, gerado no aparelho da portaria e repetido no "Tentar de novo": se a baixa foi feita mas a
  // resposta se perdeu (internet ruim), a nova tentativa reconhece a própria baixa e responde "liberado",
  // em vez de "já utilizado" para o mesmo torcedor.
  const leituraId = typeof d.leituraId === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(d.leituraId) ? d.leituraId : null;
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
    if (i.status === "usado" && leituraId && i.usadoLeitura === leituraId) {
      return { resultado: "liberado", mensagem: "Entrada liberada.", ...info };
    }
    if (i.status === "usado") {
      return {
        resultado: "ja_usado",
        mensagem: "Entrada já registrada.",
        usadoEm: i.usadoEm?.toMillis() ?? null,
        ...info,
      };
    }
    if (confirmar) {
      tx.update(ingressoRef, { status: "usado", usadoEm: FieldValue.serverTimestamp(), usadoPor: membro.uid, ...(leituraId ? { usadoLeitura: leituraId } : {}) });
      tx.set(refs.evento(tid, eventoId), { entradas: FieldValue.increment(1) }, { merge: true });
    }
    return { resultado: "liberado", mensagem: "Entrada liberada.", ...info };
  });
});
