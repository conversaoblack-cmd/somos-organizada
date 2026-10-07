import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { MASTER_KEY, QR_HMAC, PADROES } from "../config";
import { db, refs, FieldValue, Timestamp } from "../util/firebase";
import { gerarQr } from "../util/cripto";
import { cpfValido, endereco, soDigitos, telefoneBR, texto, umDe, type Pessoa } from "../util/validacao";
import { calcularMensalidade } from "../dominio/precos";
import { exigirEscopoSede, exigirLogin, exigirMembro } from "../dominio/permissoes";
import { confirmarFaturaSocio, contarMudancaStatus } from "../dominio/processamento";
import { pagarmeDaTorcida } from "../pagarme/credenciais";
import { clientePg, descritor, enderecoPg } from "../pagarme/montagem";
import { PagarmeErro, type Pagarme } from "../pagarme/cliente";
import { aplicarRespostaPedido, pagamentoPg, torcidaVendendo } from "./ingressos";
import type { Pedido, Plano, Socio, StatusSocio, Torcida } from "../dominio/tipos";

const segredos = [MASTER_KEY, QR_HMAC];
const ATIVOS: StatusSocio[] = ["ativo", "em_analise", "inadimplente", "suspenso"];

function pessoaDoSocio(s: Socio): Pessoa {
  return { nome: s.nome, email: s.email, cpf: s.cpf, telefone: s.telefone };
}

/** Cria um pedido Pix (ou cartão avulso) para um ciclo da mensalidade do sócio. */
export async function criarCobrancaSocio(args: {
  tid: string;
  torcida: Torcida;
  socio: Socio;
  metodo: "pix" | "cartao";
  dadosPagamento?: Record<string, unknown>;
  renovacao: boolean;
  expiraSeg: number;
}) {
  const { tid, torcida, socio, metodo, renovacao, expiraSeg } = args;
  const pct = torcida.taxaServicoPct ?? PADROES.taxaServicoPct;
  const valores = calcularMensalidade(socio.valorPlano, pct);
  const pedidoRef = refs.pedidos(tid).doc();
  const expiraEm = new Date(Date.now() + expiraSeg * 1000);
  const pedido: Pedido = {
    tipo: "socio",
    uid: socio.uid,
    comprador: pessoaDoSocio(socio),
    metodo,
    ...valores,
    status: "criando",
    sedeId: socio.sedeId,
    socioUid: socio.uid,
    planoId: socio.planoId,
    renovacao,
    expiraEm: Timestamp.fromDate(expiraEm),
    criadoEm: Timestamp.now(),
  };
  await pedidoRef.set(pedido);
  await refs.socio(tid, socio.uid).update({ cobrancaAbertaId: pedidoRef.id });

  const pg = await pagarmeDaTorcida(tid);
  const items = [{ amount: valores.valorBase, description: `Sócio · ${socio.planoNome}`.slice(0, 256), quantity: 1, code: "plano" }];
  if (valores.taxa > 0) items.push({ amount: valores.taxa, description: "Taxa de serviço", quantity: 1, code: "taxa" });
  const resposta = await pg.criarPedido({
    code: pedidoRef.id,
    items,
    customer: clientePg(pessoaDoSocio(socio), socio.uid, socio.endereco),
    payments: [pagamentoPg(metodo, torcida, args.dadosPagamento ?? {}, expiraSeg)],
    metadata: { torcidaId: tid, pedidoId: pedidoRef.id, tipo: "socio", socioUid: socio.uid },
  });
  const resultado = await aplicarRespostaPedido(tid, pedidoRef.id, resposta, expiraEm);
  return { pedidoId: pedidoRef.id, resultado };
}

/** Confere as faturas da assinatura na Pagar.me e aplica as pagas (idempotente). */
export async function sincronizarFaturas(tid: string, socio: Socio, pg: Pagarme) {
  const subId = socio.pagarme?.subscriptionId;
  if (!subId) return { pagas: 0 };
  const torcida = (await refs.torcida(tid).get()).data() as Torcida;
  const pct = torcida.taxaServicoPct ?? PADROES.taxaServicoPct;
  const faturas = await pg.listarFaturas(subId);
  let pagas = 0;
  for (const f of faturas.data ?? []) {
    if (f.status !== "paid") continue;
    const cobranca = (socio as Socio & { cobranca?: { valorBase: number; taxa: number } }).cobranca ?? calcularMensalidade(socio.valorPlano, pct);
    const r = await confirmarFaturaSocio(tid, socio.uid, f, cobranca.valorBase, cobranca.taxa);
    if (!("jaProcessado" in r)) pagas++;
  }
  return { pagas, ultimaStatus: faturas.data?.[0]?.status ?? null };
}

/**
 * Adesão de sócio: grava a ficha, trava o CPF na torcida e inicia o pagamento.
 * Pix = cobrança por ciclo gerada pelo sistema. Cartão = assinatura recorrente na Pagar.me.
 */
export const aderirSocio = onCall({ secrets: segredos }, async (req) => {
  const uid = exigirLogin(req);
  const email = String(req.auth?.token.email ?? "").toLowerCase();
  if (!email) throw new HttpsError("failed-precondition", "Sua conta precisa ter e-mail.");
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const planoId = texto(d.planoId, "plano", { max: 40 });
  const sedeId = texto(d.sedeId, "sede", { max: 40 });
  const metodo = umDe(d.metodo, "método", ["pix", "cartao"] as const);
  const dados = (d.dados ?? {}) as Record<string, unknown>;
  const nome = texto(dados.nome, "nome", { min: 3, max: 64 });
  const cpf = soDigitos(dados.cpf);
  if (!cpfValido(cpf)) throw new HttpsError("invalid-argument", "CPF inválido.");
  const telefone = soDigitos(dados.telefone);
  if (!telefoneBR(telefone)) throw new HttpsError("invalid-argument", "Telefone inválido.");
  const nascimento = texto(dados.nascimento, "data de nascimento", { min: 10, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) throw new HttpsError("invalid-argument", "Data de nascimento inválida.");
  const end = endereco(dados.endereco);
  const fotoPath = texto(d.fotoPath, "foto", { max: 200, obrigatorio: false }) || undefined;
  if (fotoPath && !fotoPath.startsWith(`torcidas/${tid}/socios/${uid}/`)) {
    throw new HttpsError("invalid-argument", "Foto inválida.");
  }

  const torcida = await torcidaVendendo(tid);
  const [planoSnap, sedeSnap] = await Promise.all([refs.plano(tid, planoId).get(), refs.sede(tid, sedeId).get()]);
  const plano = planoSnap.data() as Plano | undefined;
  if (!plano?.ativo) throw new HttpsError("failed-precondition", "Plano indisponível.");
  if (!sedeSnap.exists || sedeSnap.get("ativa") === false) throw new HttpsError("failed-precondition", "Sede inválida.");
  if ((metodo === "pix" && !plano.pix) || (metodo === "cartao" && !plano.cartao)) {
    throw new HttpsError("failed-precondition", "Forma de pagamento indisponível para este plano.");
  }

  const pct = torcida.taxaServicoPct ?? PADROES.taxaServicoPct;
  const valores = calcularMensalidade(plano.valor, pct);

  // Ficha + trava de CPF (um CPF = um sócio por torcida)
  const socio = await db.runTransaction(async (tx) => {
    const sRef = refs.socio(tid, uid);
    const cpfRef = refs.cpf(tid, cpf);
    const [sSnap, cSnap] = await Promise.all([tx.get(sRef), tx.get(cpfRef)]);
    const atual = sSnap.data() as Socio | undefined;
    if (atual && ATIVOS.includes(atual.status)) throw new HttpsError("already-exists", "Você já é sócio desta torcida.");
    if (cSnap.exists && cSnap.get("uid") !== uid) throw new HttpsError("already-exists", "Este CPF já está cadastrado como sócio nesta torcida.");
    if (atual && atual.cpf !== cpf) tx.delete(refs.cpf(tid, atual.cpf));
    tx.set(cpfRef, { uid });
    const ficha: Socio = {
      uid, nome, cpf, email, telefone, nascimento, endereco: end, fotoPath: fotoPath ?? atual?.fotoPath,
      sedeId, planoId, planoNome: plano.nome, intervalo: plano.intervalo, intervaloQtd: plano.intervaloQtd,
      valorPlano: plano.valor, metodo, status: "pendente_pagamento", matricula: atual?.matricula,
      validoAte: atual?.validoAte ?? null, cobrancaAbertaId: null, assinaturaCancelada: false,
      criadoEm: atual?.criadoEm ?? Timestamp.now(), atualizadoEm: Timestamp.now(),
    };
    tx.set(sRef, { ...ficha, cobranca: { valorBase: valores.valorBase, taxa: valores.taxa } });
    contarMudancaStatus(tx, tid, atual?.status ?? null, "pendente_pagamento");
    return ficha;
  });

  try {
    if (metodo === "pix") {
      const r = await criarCobrancaSocio({ tid, torcida, socio, metodo, renovacao: false, expiraSeg: PADROES.pixExpiraSegundos });
      return { modo: "pedido", pedidoId: r.pedidoId, status: typeof r.resultado === "string" ? r.resultado : "falhou" };
    }

    // Cartão: assinatura recorrente na Pagar.me (cobra o 1º ciclo na hora)
    const cartao = (d.cartao ?? {}) as Record<string, unknown>;
    if (!torcida.pagamentos.cartao) throw new HttpsError("failed-precondition", "Cartão indisponível nesta torcida.");
    const pg = await pagarmeDaTorcida(tid);
    const items = [{ description: `Sócio · ${plano.nome}`.slice(0, 256), quantity: 1, pricing_scheme: { price: valores.valorBase } }];
    if (valores.taxa > 0) items.push({ description: "Taxa de serviço", quantity: 1, pricing_scheme: { price: valores.taxa } });
    const assinatura = await pg.criarAssinatura({
      code: `${uid}-${Date.now().toString(36)}`.slice(0, 52),
      payment_method: "credit_card",
      interval: plano.intervalo === "ano" ? "year" : "month",
      interval_count: plano.intervaloQtd,
      billing_type: "prepaid",
      installments: 1,
      statement_descriptor: torcida.pagamentos.descritorFatura || descritor(torcida.nome),
      customer: clientePg(pessoaDoSocio(socio), uid, end),
      card_token: texto(cartao.token, "token do cartão", { max: 80 }),
      card: { billing_address: enderecoPg(endereco(cartao.endereco ?? end)) },
      items,
      metadata: { torcidaId: tid, socioUid: uid, planoId },
    });
    await refs.socio(tid, uid).update({
      pagarme: {
        subscriptionId: assinatura.id,
        cartaoFinal: assinatura.card?.last_four_digits ?? null,
        cartaoBandeira: assinatura.card?.brand ?? null,
      },
    });
    if (assinatura.status === "failed" || assinatura.status === "canceled") {
      throw new HttpsError("aborted", "Cartão recusado. Confira os dados ou use outro cartão.");
    }
    const sync = await sincronizarFaturas(tid, { ...socio, pagarme: { subscriptionId: assinatura.id } }, pg);
    if (sync.ultimaStatus === "failed") {
      await pg.cancelarAssinatura(assinatura.id).catch(() => undefined);
      throw new HttpsError("aborted", "Cartão recusado. Confira os dados ou use outro cartão.");
    }
    const atualizado = (await refs.socio(tid, uid).get()).data() as Socio;
    return { modo: "assinatura", status: atualizado.status };
  } catch (e) {
    logger.error("Falha na adesão de sócio", { tid, uid, erro: String(e) });
    if (e instanceof HttpsError) throw e;
    if (e instanceof PagarmeErro) throw new HttpsError("unavailable", `Pagamento recusado: ${e.message}`);
    throw new HttpsError("internal", "Não foi possível concluir a adesão.");
  }
});

/** Sócio no Pix pede a cobrança do próximo ciclo (ou reabre a que está em aberto). */
export const pagarMensalidade = onCall({ secrets: segredos }, async (req) => {
  const uid = exigirLogin(req);
  const tid = texto((req.data ?? {}).tid, "torcida", { max: 40 });
  const torcida = await torcidaVendendo(tid);
  const socio = (await refs.socio(tid, uid).get()).data() as Socio | undefined;
  if (!socio) throw new HttpsError("not-found", "Ficha de sócio não encontrada.");
  if (socio.cobrancaAbertaId) {
    const aberto = (await refs.pedido(tid, socio.cobrancaAbertaId).get()).data() as Pedido | undefined;
    if (aberto?.status === "aguardando" && aberto.pix && aberto.pix.expiraEm.toMillis() > Date.now() + 60_000) {
      return { pedidoId: socio.cobrancaAbertaId, status: "aguardando" };
    }
  }
  const r = await criarCobrancaSocio({
    tid, torcida, socio, metodo: "pix", renovacao: !!socio.matricula, expiraSeg: PADROES.pixRenovacaoExpiraDias * 86400,
  });
  return { pedidoId: r.pedidoId, status: typeof r.resultado === "string" ? r.resultado : "falhou" };
});

export const sincronizarAssinatura = onCall({ secrets: segredos }, async (req) => {
  const uid = exigirLogin(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const alvo = d.socioUid ? texto(d.socioUid, "sócio", { max: 128 }) : uid;
  if (alvo !== uid) await exigirMembro(req, tid, ["diretoria", "subsede"]);
  const socio = (await refs.socio(tid, alvo).get()).data() as Socio | undefined;
  if (!socio) throw new HttpsError("not-found", "Sócio não encontrado.");
  const pg = await pagarmeDaTorcida(tid);
  return sincronizarFaturas(tid, socio, pg);
});

/** Cancela a renovação. O sócio continua ativo até o fim do ciclo já pago. */
export const cancelarAssinatura = onCall({ secrets: [MASTER_KEY] }, async (req) => {
  const uid = exigirLogin(req);
  const tid = texto((req.data ?? {}).tid, "torcida", { max: 40 });
  const socio = (await refs.socio(tid, uid).get()).data() as Socio | undefined;
  if (!socio) throw new HttpsError("not-found", "Ficha de sócio não encontrada.");
  if (socio.pagarme?.subscriptionId) {
    const pg = await pagarmeDaTorcida(tid);
    await pg.cancelarAssinatura(socio.pagarme.subscriptionId);
  }
  await refs.socio(tid, uid).update({ assinaturaCancelada: true, atualizadoEm: FieldValue.serverTimestamp() });
  return { ok: true };
});

/** QR assinado da carteirinha digital (verificável na portaria). */
export const minhaCarteirinha = onCall({ secrets: [QR_HMAC] }, async (req) => {
  const uid = exigirLogin(req);
  const tid = texto((req.data ?? {}).tid, "torcida", { max: 40 });
  const s = (await refs.socio(tid, uid).get()).data() as Socio | undefined;
  if (!s?.matricula) throw new HttpsError("failed-precondition", "Carteirinha disponível após a confirmação do pagamento.");
  return { qr: gerarQr("s", tid, uid, QR_HMAC.value()) };
});

/** Diretoria (ou subsede, na própria sede) aprova, suspende ou reativa sócios. */
export const alterarStatusSocio = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const socioUid = texto(d.socioUid, "sócio", { max: 128 });
  const acao = umDe(d.acao, "ação", ["aprovar", "suspender", "reativar", "cancelar"] as const);
  const membro = await exigirMembro(req, tid, ["diretoria", "subsede"]);
  return db.runTransaction(async (tx) => {
    const sRef = refs.socio(tid, socioUid);
    const s = (await tx.get(sRef)).data() as Socio | undefined;
    if (!s) throw new HttpsError("not-found", "Sócio não encontrado.");
    exigirEscopoSede(membro, s.sedeId);
    const emDia = !!s.validoAte && s.validoAte.toMillis() > Date.now();
    let novo: StatusSocio;
    switch (acao) {
      case "aprovar":
        if (s.status !== "em_analise") throw new HttpsError("failed-precondition", "Só sócios em análise podem ser aprovados.");
        novo = emDia ? "ativo" : "inadimplente";
        break;
      case "suspender":
        novo = "suspenso";
        break;
      case "reativar":
        if (s.status !== "suspenso" && s.status !== "cancelado") throw new HttpsError("failed-precondition", "Sócio não está suspenso.");
        novo = emDia ? "ativo" : "inadimplente";
        break;
      case "cancelar":
        if (membro.papel !== "diretoria") throw new HttpsError("permission-denied", "Só a diretoria cancela sócios.");
        novo = "cancelado";
        break;
    }
    tx.update(sRef, {
      status: novo,
      atualizadoEm: FieldValue.serverTimestamp(),
      historico: FieldValue.arrayUnion({ acao, por: membro.uid, em: Timestamp.now(), de: s.status, para: novo }),
    });
    contarMudancaStatus(tx, tid, s.status, novo);
    return { status: novo };
  });
});
