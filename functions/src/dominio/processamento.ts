/**
 * Efeitos de um pagamento confirmado (ou falho), sempre em transação e idempotentes:
 * o mesmo evento pode chegar duas vezes (webhook + verificação manual) sem duplicar nada.
 */
import { logger } from "firebase-functions/v2";
import { db, refs, FieldValue, Timestamp } from "../util/firebase";
import { gerarQr, codigoLegivel, tokenAleatorio } from "../util/cripto";
import { competencia } from "../util/datas";
import { avancarCiclo } from "./precos";
import { pagoIntegral, type PgPedido, type PgFatura } from "../pagarme/cliente";
import { notificarPedidoPago } from "../email/avisos";
import { registrarCpfDoPagamento } from "../api/conta";
import type { Evento, Ingresso, Liquidacao, Pedido, Socio, StatusSocio, Torcida } from "./tipos";

type Tx = FirebaseFirestore.Transaction;

interface Lancamento {
  origem: "ingresso" | "socio";
  referencia: string;
  sedeId: string;
  natureza: "base" | "taxa";
  valor: number;
  competencia: string;
  descricao: string;
  /** split = já caiu na conta da subsede pela Pagar.me; torcida = caiu na conta da torcida. */
  liquidacao?: Liquidacao;
}

function lancar(tx: Tx, tid: string, id: string, l: Lancamento) {
  tx.set(refs.lancamento(tid, id), { liquidacao: "torcida", ...l, criadoEm: FieldValue.serverTimestamp() });
}

function somarStats(tx: Tx, tid: string, mes: string, campos: Record<string, number>) {
  const inc: Record<string, FirebaseFirestore.FieldValue | string> = { mes };
  for (const [k, v] of Object.entries(campos)) inc[k] = FieldValue.increment(v);
  tx.set(refs.statsMes(tid, mes), inc, { merge: true });
  tx.set(refs.plataformaMes(mes), inc, { merge: true });
  const geral: Record<string, FirebaseFirestore.FieldValue> = {};
  for (const [k, v] of Object.entries(campos)) geral[k] = FieldValue.increment(v);
  tx.set(refs.statsGeral(tid), geral, { merge: true });
}

/** Mantém o contador de sócios por status (dashboard) consistente a cada mudança. */
export function contarMudancaStatus(tx: Tx, tid: string, de: StatusSocio | null, para: StatusSocio) {
  if (de === para) return;
  // set+merge não interpreta "a.b" como caminho: o mapa precisa ir aninhado
  const socios: Record<string, FirebaseFirestore.FieldValue> = { [para]: FieldValue.increment(1) };
  if (de) socios[de] = FieldValue.increment(-1);
  tx.set(refs.statsGeral(tid), { socios }, { merge: true });
}

export function statusAposPagamento(atual: StatusSocio, aprovacaoManual: boolean): StatusSocio {
  switch (atual) {
    case "pendente_pagamento":
    case "cancelado":
      return aprovacaoManual ? "em_analise" : "ativo";
    case "inadimplente":
      return "ativo";
    default:
      return atual; // ativo, em_analise e suspenso não mudam só porque pagou
  }
}

async function lerTorcida(tx: Tx, tid: string): Promise<Torcida> {
  const t = (await tx.get(refs.torcida(tid))).data() as Torcida | undefined;
  if (!t) throw new Error(`Torcida ${tid} inexistente`);
  return t;
}

/** Pedido avulso (ingresso ou mensalidade via Pix/cartão) confirmado como pago na Pagar.me. */
export async function confirmarPedidoPago(tid: string, pedidoId: string, pg: PgPedido, segredoQr: string) {
  const r = await confirmarNaTransacao(tid, pedidoId, pg, segredoQr);
  // E-mail de confirmação (com chave única: repetir não duplica). Nunca derruba a confirmação.
  await notificarPedidoPago(tid, pedidoId);
  // Liga o CPF de quem pagou à conta dele (para entrar com CPF depois)
  const p = (await refs.pedido(tid, pedidoId).get()).data() as Pedido | undefined;
  if (p?.status === "pago" && p.comprador?.cpf) await registrarCpfDoPagamento(p.uid, p.comprador.cpf).catch(() => undefined);
  return r;
}

function confirmarNaTransacao(tid: string, pedidoId: string, pg: PgPedido, segredoQr: string) {
  return db.runTransaction(async (tx) => {
    const pRef = refs.pedido(tid, pedidoId);
    const p = (await tx.get(pRef)).data() as Pedido | undefined;
    if (!p) throw new Error(`Pedido ${pedidoId} inexistente`);
    if (p.status === "pago" || p.status === "estornado") return { jaProcessado: true };
    if (!pagoIntegral(pg, p.total)) throw new Error(`Pedido ${pedidoId}: valor pago não confere com ${p.total}`);

    const torcida = await lerTorcida(tx, tid);
    const mes = competencia();
    const reservaAtiva = p.status === "aguardando" || p.status === "criando";

    if (p.tipo === "ingresso") {
      const evRef = refs.evento(tid, p.eventoId!);
      const ev = (await tx.get(evRef)).data() as Evento;
      const itens = p.itens ?? [];
      // Ingresso em nome de um sócio (CPF de sócio que já pagou ao menos uma vez) aparece também no painel dele
      const titularUid = new Map<string, string>();
      if (itens.length) {
        const cpfs = await tx.getAll(...itens.map((i) => refs.cpf(tid, i.titularCpf)));
        const uids = cpfs.map((c) => c.get("uid") as string | undefined).filter((u): u is string => !!u && u !== p.uid);
        const fichas = uids.length ? await tx.getAll(...uids.map((u) => refs.socio(tid, u))) : [];
        for (const f of fichas) {
          const s = f.data() as Socio | undefined;
          if (s?.matricula && s.cpf) titularUid.set(s.cpf, f.id);
        }
      }
      const ingressoIds: string[] = [];
      for (const item of itens) {
        const iRef = refs.ingressos(tid).doc();
        ingressoIds.push(iRef.id);
        const ingresso: Ingresso = {
          pedidoId,
          eventoId: p.eventoId!,
          eventoNome: ev.nome,
          eventoData: ev.data,
          sedeId: ev.sedeId,
          tipo: item.tipo,
          titularNome: item.titularNome,
          titularCpf: item.titularCpf,
          uid: p.uid,
          ...(titularUid.has(item.titularCpf) ? { titularUid: titularUid.get(item.titularCpf) } : {}),
          codigo: codigoLegivel(),
          qr: gerarQr("i", tid, iRef.id, segredoQr),
          valorBase: item.valorBase,
          status: "valido",
          criadoEm: Timestamp.now(),
        };
        tx.set(iRef, ingresso);
      }
      tx.update(evRef, {
        vendidos: FieldValue.increment(itens.length),
        ...(reservaAtiva ? { reservados: FieldValue.increment(-itens.length) } : {}),
      });
      if (!reservaAtiva) logger.warn("Pagamento confirmado após expiração da reserva", { tid, pedidoId });

      lancar(tx, tid, `${pedidoId}_base`, {
        origem: "ingresso", referencia: pedidoId, sedeId: ev.sedeId, natureza: "base",
        valor: p.valorBase, competencia: mes, descricao: `Ingressos · ${ev.nome}`, liquidacao: p.liquidacao,
      });
      lancar(tx, tid, `${pedidoId}_taxa`, {
        origem: "ingresso", referencia: pedidoId, sedeId: torcida.sedePrincipalId, natureza: "taxa",
        valor: p.taxa, competencia: mes, descricao: `Taxa de serviço · ${ev.nome}`,
      });
      somarStats(tx, tid, mes, {
        ingressosQtd: itens.length, receitaIngressos: p.valorBase, taxaServico: p.taxa, pedidosPagos: 1,
      });
      tx.update(pRef, {
        status: "pago", pagoEm: FieldValue.serverTimestamp(), ingressoIds,
        chaveAcesso: p.chaveAcesso ?? tokenAleatorio(18),
      });
      return { ingressoIds };
    }

    // Mensalidade de sócio paga por pedido avulso (Pix ou cartão sem recorrência)
    const sRef = refs.socio(tid, p.socioUid!);
    const s = (await tx.get(sRef)).data() as Socio | undefined;
    if (!s) throw new Error(`Sócio ${p.socioUid} inexistente`);
    const agora = new Date();
    const atual = s.validoAte?.toDate();
    const base = atual && atual > agora ? atual : agora;
    // O ciclo é o do plano que ESTE pedido pagou (retrato na cobrança), nunca o plano atual da ficha:
    // trocar de plano depois de gerar um Pix barato não transforma esse Pix num plano mais longo.
    const planoPago = p.plano ?? { nome: s.planoNome, intervalo: s.intervalo, intervaloQtd: s.intervaloQtd, valor: s.valorPlano };
    const validoAte = avancarCiclo(base, planoPago.intervalo, planoPago.intervaloQtd);
    // Cancelado/suspenso pela diretoria continua assim mesmo se uma cobrança antiga for paga
    const novoStatus = s.bloqueadoPelaDiretoria ? s.status : statusAposPagamento(s.status, torcida.aprovacaoManualSocio);
    const primeiraAdesao = !s.matricula;

    const updSocio: Record<string, unknown> = {
      status: novoStatus,
      validoAte: Timestamp.fromDate(validoAte),
      cobrancaAbertaId: null,
      // pagamento confirmado: some o aviso de "cobrança recusada"
      ultimaFalhaCobranca: FieldValue.delete(),
      motivoFalhaCobranca: FieldValue.delete(),
      atualizadoEm: FieldValue.serverTimestamp(),
    };
    if (primeiraAdesao) {
      updSocio.matricula = String(torcida.proximaMatricula ?? 1).padStart(6, "0");
      tx.update(refs.torcida(tid), { proximaMatricula: FieldValue.increment(1) });
    }
    tx.update(sRef, updSocio);
    contarMudancaStatus(tx, tid, s.status, novoStatus);

    const sedeBase = torcida.destinoMensalidade === "principal" ? torcida.sedePrincipalId : s.sedeId;
    lancar(tx, tid, `${pedidoId}_base`, {
      origem: "socio", referencia: pedidoId, sedeId: sedeBase, natureza: "base",
      valor: p.valorBase, competencia: mes, descricao: `Mensalidade · ${planoPago.nome} · ${s.nome}`, liquidacao: p.liquidacao,
    });
    lancar(tx, tid, `${pedidoId}_taxa`, {
      origem: "socio", referencia: pedidoId, sedeId: torcida.sedePrincipalId, natureza: "taxa",
      valor: p.taxa, competencia: mes, descricao: `Taxa de serviço · ${planoPago.nome}`,
    });
    somarStats(tx, tid, mes, {
      receitaSocios: p.valorBase, taxaServico: p.taxa, pedidosPagos: 1, ...(primeiraAdesao ? { novosSocios: 1 } : {}),
    });
    // Guarda o ciclo que este pagamento comprou: se ele for estornado, a validade volta junto
    tx.update(pRef, { status: "pago", pagoEm: FieldValue.serverTimestamp(), cicloAnterior: s.validoAte ?? null, cicloNovo: Timestamp.fromDate(validoAte) });
    return { socioStatus: novoStatus };
  });
}

/** Fatura de assinatura recorrente (cartão) paga. Idempotente pelo id da fatura. */
export async function confirmarFaturaSocio(tid: string, socioUid: string, fatura: PgFatura, valorBase: number, taxa: number) {
  return db.runTransaction(async (tx) => {
    const lancBase = refs.lancamento(tid, `inv_${fatura.id}_base`);
    if ((await tx.get(lancBase)).exists) return { jaProcessado: true };
    const sRef = refs.socio(tid, socioUid);
    const s = (await tx.get(sRef)).data() as Socio | undefined;
    if (!s) throw new Error(`Sócio ${socioUid} inexistente`);
    const torcida = await lerTorcida(tx, tid);
    const mes = competencia();

    const fimCiclo = fatura.cycle?.end_at ? new Date(fatura.cycle.end_at) : avancarCiclo(new Date(), s.intervalo, s.intervaloQtd);
    const novoStatus = s.bloqueadoPelaDiretoria ? s.status : statusAposPagamento(s.status, torcida.aprovacaoManualSocio);
    const primeiraAdesao = !s.matricula;
    const upd: Record<string, unknown> = {
      status: novoStatus,
      validoAte: Timestamp.fromDate(fimCiclo),
      atualizadoEm: FieldValue.serverTimestamp(),
    };
    if (primeiraAdesao) {
      upd.matricula = String(torcida.proximaMatricula ?? 1).padStart(6, "0");
      tx.update(refs.torcida(tid), { proximaMatricula: FieldValue.increment(1) });
    }
    tx.update(sRef, upd);
    contarMudancaStatus(tx, tid, s.status, novoStatus);

    const sedeBase = torcida.destinoMensalidade === "principal" ? torcida.sedePrincipalId : s.sedeId;
    lancar(tx, tid, `inv_${fatura.id}_base`, {
      origem: "socio", referencia: fatura.id, sedeId: sedeBase, natureza: "base",
      valor: valorBase, competencia: mes, descricao: `Mensalidade (cartão) · ${s.planoNome} · ${s.nome}`,
    });
    lancar(tx, tid, `inv_${fatura.id}_taxa`, {
      origem: "socio", referencia: fatura.id, sedeId: torcida.sedePrincipalId, natureza: "taxa",
      valor: taxa, competencia: mes, descricao: `Taxa de serviço · ${s.planoNome}`,
    });
    somarStats(tx, tid, mes, {
      receitaSocios: valorBase, taxaServico: taxa, pedidosPagos: 1, ...(primeiraAdesao ? { novosSocios: 1 } : {}),
    });
    return { socioStatus: novoStatus };
  });
}

/** Pedido não pago (recusado, expirado ou cancelado): libera a reserva de ingressos. */
export async function encerrarPedidoNaoPago(
  tid: string,
  pedidoId: string,
  status: "falhou" | "expirado" | "cancelado",
  motivo?: string,
) {
  return db.runTransaction(async (tx) => {
    const pRef = refs.pedido(tid, pedidoId);
    const p = (await tx.get(pRef)).data() as Pedido | undefined;
    if (!p || (p.status !== "aguardando" && p.status !== "criando")) return false;
    if (p.tipo === "ingresso" && p.eventoId) {
      tx.update(refs.evento(tid, p.eventoId), { reservados: FieldValue.increment(-(p.itens?.length ?? 0)) });
    }
    if (p.tipo === "socio" && p.socioUid) {
      const sRef = refs.socio(tid, p.socioUid);
      const s = (await tx.get(sRef)).data() as Socio | undefined;
      if (s?.cobrancaAbertaId === pedidoId) tx.update(sRef, { cobrancaAbertaId: null });
    }
    tx.update(pRef, { status, motivo: motivo ?? null, encerradoEm: FieldValue.serverTimestamp() });
    return true;
  });
}

/** Estorno feito na Pagar.me: cancela ingressos e lança valores negativos no extrato. */
export async function estornarPedido(tid: string, pedidoId: string, motivo: "estorno" | "chargeback" = "estorno") {
  return db.runTransaction(async (tx) => {
    const pRef = refs.pedido(tid, pedidoId);
    const p = (await tx.get(pRef)).data() as Pedido | undefined;
    if (!p || p.status !== "pago") return false;
    const torcida = await lerTorcida(tx, tid);
    const ingressos = p.ingressoIds?.length
      ? await Promise.all(p.ingressoIds.map((id) => tx.get(refs.ingresso(tid, id))))
      : [];
    const mes = competencia();
    let sedeBase = torcida.sedePrincipalId;
    if (p.tipo === "ingresso" && p.eventoId) {
      const ev = (await tx.get(refs.evento(tid, p.eventoId))).data() as Evento | undefined;
      sedeBase = ev?.sedeId ?? sedeBase;
      tx.update(refs.evento(tid, p.eventoId), { vendidos: FieldValue.increment(-ingressos.length) });
    } else if (p.socioUid) {
      const sRef = refs.socio(tid, p.socioUid);
      const s = (await tx.get(sRef)).data() as Socio | undefined;
      if (s && torcida.destinoMensalidade !== "principal") sedeBase = s.sedeId;
      // Mensalidade estornada (ou chargeback): tira da validade o ciclo que esse pagamento tinha comprado
      if (s?.validoAte && p.cicloNovo) {
        const inicio = p.cicloAnterior?.toMillis() ?? p.pagoEm?.toMillis() ?? p.criadoEm.toMillis();
        const comprado = p.cicloNovo.toMillis() - inicio; // só o ciclo que ESTE pagamento comprou
        const novaValidade = s.validoAte.toMillis() - Math.max(0, comprado);
        let novoStatus = s.status;
        if (!p.cicloAnterior && s.validoAte.toMillis() === p.cicloNovo.toMillis()) novoStatus = "cancelado"; // estornou a adesão
        else if (novaValidade < Date.now() && (s.status === "ativo" || s.status === "em_analise")) novoStatus = "inadimplente";
        tx.update(sRef, { validoAte: Timestamp.fromMillis(novaValidade), status: novoStatus, atualizadoEm: FieldValue.serverTimestamp() });
        if (novoStatus !== s.status) contarMudancaStatus(tx, tid, s.status, novoStatus);
      }
    }
    for (const snap of ingressos) {
      if (snap.exists && snap.get("status") === "valido") tx.update(snap.ref, { status: "cancelado" });
    }
    lancar(tx, tid, `${pedidoId}_estorno_base`, {
      origem: p.tipo, referencia: pedidoId, sedeId: sedeBase, natureza: "base",
      valor: -p.valorBase, competencia: mes, descricao: "Estorno", liquidacao: p.liquidacao,
    });
    lancar(tx, tid, `${pedidoId}_estorno_taxa`, {
      origem: p.tipo, referencia: pedidoId, sedeId: torcida.sedePrincipalId, natureza: "taxa",
      valor: -p.taxa, competencia: mes, descricao: "Estorno da taxa de serviço",
    });
    somarStats(tx, tid, mes, {
      ...(p.tipo === "ingresso"
        ? { ingressosQtd: -ingressos.length, receitaIngressos: -p.valorBase }
        : { receitaSocios: -p.valorBase }),
      taxaServico: -p.taxa,
      estornos: 1,
    });
    tx.update(pRef, { status: "estornado", motivoEstorno: motivo, estornadoEm: FieldValue.serverTimestamp() });
    return true;
  });
}
