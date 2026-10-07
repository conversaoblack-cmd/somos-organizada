/**
 * Mensalidade da plataforma Somos Organizada (paga pela diretoria, só em Pix, sem multa nem juros).
 *
 *  - Planos: Torcida pequena R$ 500, Torcida grande R$ 1.000 (escolha da diretoria) e Torcida gigante
 *    R$ 1.500 (automático acima de 3.000 sócios ativos).
 *  - A cobrança começa ao PUBLICAR o site: 1ª fatura vence em 7 dias; depois, todo mês no mesmo dia.
 *  - Pix estático (chave da plataforma). A diretoria avisa que pagou; a equipe confirma no painel.
 *  - 7 dias após o vencimento sem pagamento: o site e as vendas da torcida saem do ar até a confirmação.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { FUSO } from "../config";
import { db, refs, FieldValue, Timestamp } from "../util/firebase";
import { dias } from "../util/datas";
import { texto, umDe } from "../util/validacao";
import { pixCopiaECola } from "../util/pix";
import { avancarCiclo } from "../dominio/precos";
import { exigirMembro, exigirPlataforma } from "../dominio/permissoes";
import type { Torcida } from "../dominio/tipos";

export type PlanoSaas = "pequena" | "grande" | "gigante";

export const SAAS_PADRAO = {
  planos: {
    pequena: { nome: "Torcida pequena", valor: 50000 },
    grande: { nome: "Torcida grande", valor: 100000 },
    gigante: { nome: "Torcida gigante", valor: 150000 },
  } as Record<PlanoSaas, { nome: string; valor: number }>,
  limiteGigante: 3000,
  diasPrimeiraFatura: 7,
  diasTolerancia: 7,
  diasGerarAntes: 5,
  pix: { chave: "", nome: "SOMOS ORGANIZADA", cidade: "SALVADOR" },
};

export interface ConfigSaas {
  planos: Record<PlanoSaas, { nome: string; valor: number }>;
  limiteGigante: number;
  diasPrimeiraFatura: number;
  diasTolerancia: number;
  diasGerarAntes: number;
  pix: { chave: string; nome: string; cidade: string };
}

export interface AssinaturaSaas {
  plano: Exclude<PlanoSaas, "gigante">;
  diaVencimento: number;
  proximoVencimento: Timestamp;
  situacao: "em_dia" | "aberta" | "atrasada" | "bloqueada";
  faturaAbertaId?: string | null;
  criadaEm: Timestamp;
}

export interface FaturaSaas {
  competencia: string;
  plano: PlanoSaas;
  valor: number;
  sociosAtivos: number;
  vencimento: Timestamp;
  status: "aberta" | "paga" | "cancelada";
  pixCopiaECola: string | null;
  txid: string;
  criadaEm: Timestamp;
  informadoPagamentoEm?: Timestamp;
  pagaEm?: Timestamp;
  confirmadaPor?: string;
}

const refsSaas = {
  config: () => db.doc("plataforma/publico"),
  assinatura: (tid: string) => db.doc(`torcidas/${tid}/saas/assinatura`),
  cadastro: (tid: string) => db.doc(`torcidas/${tid}/saas/cadastro`),
  faturas: (tid: string) => db.collection(`torcidas/${tid}/faturasSaas`),
  fatura: (tid: string, id: string) => db.doc(`torcidas/${tid}/faturasSaas/${id}`),
};
export { refsSaas };

export async function configSaas(): Promise<ConfigSaas> {
  const c = (await refsSaas.config().get()).data() ?? {};
  const planos = { ...SAAS_PADRAO.planos };
  for (const k of Object.keys(planos) as PlanoSaas[]) {
    const v = Number(c.planos?.[k]?.valor);
    if (Number.isInteger(v) && v > 0) planos[k] = { ...planos[k], valor: v };
  }
  return {
    ...SAAS_PADRAO,
    planos,
    limiteGigante: Number(c.limiteGigante) > 0 ? Number(c.limiteGigante) : SAAS_PADRAO.limiteGigante,
    pix: { ...SAAS_PADRAO.pix, ...(c.pix ?? {}) },
  };
}

export function planoEfetivo(escolhido: Exclude<PlanoSaas, "gigante">, sociosAtivos: number, limite: number): PlanoSaas {
  return sociosAtivos > limite ? "gigante" : escolhido;
}

const idFatura = (venc: Date) => venc.toISOString().slice(0, 10);

async function sociosAtivos(tid: string): Promise<number> {
  const g = (await refs.statsGeral(tid).get()).data();
  return Math.max(0, Number(g?.socios?.ativo ?? 0));
}

/** Cria (se ainda não existir) a fatura com o vencimento dado. Idempotente pelo id = data do vencimento. */
export async function gerarFatura(tid: string, vencimento: Date, cfg: ConfigSaas): Promise<string> {
  const id = idFatura(vencimento);
  const ref = refsSaas.fatura(tid, id);
  const ass = (await refsSaas.assinatura(tid).get()).data() as AssinaturaSaas | undefined;
  if (!ass) throw new Error("Torcida sem assinatura");
  const qtd = await sociosAtivos(tid);
  const plano = planoEfetivo(ass.plano, qtd, cfg.limiteGigante);
  const valor = cfg.planos[plano].valor;
  const torcida = (await refs.torcida(tid).get()).data() as Torcida;
  const txid = `SO${tid.slice(0, 8)}${id.replace(/-/g, "")}`.replace(/[^A-Za-z0-9]/g, "");
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return;
    const fatura: FaturaSaas = {
      competencia: id.slice(0, 7),
      plano,
      valor,
      sociosAtivos: qtd,
      vencimento: Timestamp.fromDate(vencimento),
      status: "aberta",
      pixCopiaECola: cfg.pix.chave
        ? pixCopiaECola({ chave: cfg.pix.chave, valorCentavos: valor, nome: cfg.pix.nome, cidade: cfg.pix.cidade, txid, descricao: `Somos Organizada ${torcida.slug}` })
        : null,
      txid,
      criadaEm: Timestamp.now(),
    };
    tx.set(ref, fatura);
    tx.set(refsSaas.assinatura(tid), { situacao: "aberta", faturaAbertaId: id }, { merge: true });
  });
  return id;
}

function proximoMes(venc: Date, dia: number): Date {
  const d = avancarCiclo(venc, "mes", 1);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

/** Publica o site: na 1ª vez cria a assinatura (plano escolhido) e a 1ª fatura (vence em 7 dias). */
export const publicarSite = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const membro = await exigirMembro(req, tid, ["diretoria"]);
  const torcida = (await refs.torcida(tid).get()).data() as Torcida & { modulos?: { eventos?: boolean; socios?: boolean }; bloqueioSaas?: boolean };
  if (torcida.bloqueioSaas) throw new HttpsError("failed-precondition", "Há mensalidade da plataforma em atraso. Regularize em Plano Somos Organizada.");
  if (torcida.status === "suspensa") throw new HttpsError("failed-precondition", "Torcida suspensa. Fale com a equipe Somos Organizada.");
  if (!torcida.pagamentos?.configurado) throw new HttpsError("failed-precondition", "Configure os pagamentos antes de publicar.");
  const m = torcida.modulos ?? { eventos: true, socios: true };
  if (!m.eventos && !m.socios) throw new HttpsError("failed-precondition", "Ative pelo menos um módulo: Eventos ou Sócios.");

  const assRef = refsSaas.assinatura(tid);
  if (!(await assRef.get()).exists) {
    const plano = umDe(d.plano, "plano", ["pequena", "grande"] as const);
    const venc = new Date(Date.now() + dias(SAAS_PADRAO.diasPrimeiraFatura));
    venc.setUTCHours(12, 0, 0, 0);
    const ass: AssinaturaSaas = {
      plano,
      diaVencimento: Math.min(venc.getUTCDate(), 28),
      proximoVencimento: Timestamp.fromDate(venc),
      situacao: "em_dia",
      faturaAbertaId: null,
      criadaEm: Timestamp.now(),
    };
    await assRef.set({ ...ass, escolhidoPor: membro.uid });
    const cfg = await configSaas();
    await gerarFatura(tid, venc, cfg);
    await assRef.update({ proximoVencimento: Timestamp.fromDate(proximoMes(venc, ass.diaVencimento)) });
  }
  await refs.torcida(tid).update({
    publicada: true,
    publicadaEm: FieldValue.serverTimestamp(),
    ...(torcida.status === "implantacao" ? { status: "ativa" } : {}),
  });
  return { publicada: true };
});

export const despublicarSite = onCall(async (req) => {
  const tid = texto((req.data ?? {}).tid, "torcida", { max: 40 });
  await exigirMembro(req, tid, ["diretoria"]);
  await refs.torcida(tid).update({ publicada: false });
  return { publicada: false };
});

/** Troca entre Torcida pequena e Torcida grande (vale a partir da próxima fatura). */
export const alterarPlanoSaas = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  await exigirMembro(req, tid, ["diretoria"]);
  const plano = umDe(d.plano, "plano", ["pequena", "grande"] as const);
  const ref = refsSaas.assinatura(tid);
  if (!(await ref.get()).exists) throw new HttpsError("failed-precondition", "O plano é escolhido ao publicar o site.");
  await ref.update({ plano });
  return { plano };
});

/** Diretoria avisa que pagou o Pix (a equipe confere e confirma). */
export const informarPagamentoSaas = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  await exigirMembro(req, tid, ["diretoria"]);
  const id = texto(d.faturaId, "fatura", { max: 20 });
  const ref = refsSaas.fatura(tid, id);
  const f = (await ref.get()).data() as FaturaSaas | undefined;
  if (!f || f.status !== "aberta") throw new HttpsError("failed-precondition", "Fatura não está em aberto.");
  await ref.update({ informadoPagamentoEm: FieldValue.serverTimestamp() });
  return { ok: true };
});

/** Equipe Somos Organizada confirma o Pix recebido. Reativa a torcida se estava bloqueada por atraso. */
export const confirmarFaturaSaas = onCall(async (req) => {
  const quem = exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const id = texto(d.faturaId, "fatura", { max: 20 });
  const ref = refsSaas.fatura(tid, id);
  const f = (await ref.get()).data() as FaturaSaas | undefined;
  if (!f) throw new HttpsError("not-found", "Fatura não encontrada.");
  if (f.status === "paga") return { ok: true };
  await ref.update({ status: "paga", pagaEm: FieldValue.serverTimestamp(), confirmadaPor: quem });
  const abertas = await refsSaas.faturas(tid).where("status", "==", "aberta").get();
  const cfg = await configSaas();
  const vencidaBloqueante = abertas.docs.some((x) => (x.get("vencimento") as Timestamp).toMillis() + dias(cfg.diasTolerancia) < Date.now());
  await refsSaas.assinatura(tid).set(
    { situacao: abertas.empty ? "em_dia" : vencidaBloqueante ? "bloqueada" : "aberta", faturaAbertaId: abertas.empty ? null : abertas.docs[0].id },
    { merge: true },
  );
  if (!vencidaBloqueante) {
    const t = (await refs.torcida(tid).get()).data() as Torcida & { suspensaPor?: string };
    await refs.torcida(tid).update({
      bloqueioSaas: false,
      ...(t.status === "suspensa" && t.suspensaPor === "saas" ? { status: "ativa", suspensaPor: FieldValue.delete() } : {}),
    });
  }
  return { ok: true };
});

/** Gera faturas e aplica bloqueio por atraso em todas as torcidas publicadas. */
export async function processarSaas(agora = Date.now()) {
  const cfg = await configSaas();
  const torcidas = await db.collection("torcidas").where("publicada", "==", true).get();
  const resultado = { faturasGeradas: 0, bloqueadas: 0 };
  for (const t of torcidas.docs) {
    const tid = t.id;
    try {
      const assRef = refsSaas.assinatura(tid);
      const ass = (await assRef.get()).data() as AssinaturaSaas | undefined;
      if (!ass) continue;
      // próxima fatura alguns dias antes do vencimento
      const prox = ass.proximoVencimento.toDate();
      if (agora >= prox.getTime() - dias(cfg.diasGerarAntes)) {
        await gerarFatura(tid, prox, cfg);
        await assRef.update({ proximoVencimento: Timestamp.fromDate(proximoMes(prox, ass.diaVencimento)) });
        resultado.faturasGeradas++;
      }
      // atraso
      const abertas = await refsSaas.faturas(tid).where("status", "==", "aberta").get();
      const vencidas = abertas.docs.filter((f) => (f.get("vencimento") as Timestamp).toMillis() < agora);
      const bloquear = vencidas.some((f) => (f.get("vencimento") as Timestamp).toMillis() + dias(cfg.diasTolerancia) < agora);
      const torcida = t.data() as Torcida & { suspensaPor?: string; bloqueioSaas?: boolean };
      if (bloquear) {
        if (!torcida.bloqueioSaas) {
          await refs.torcida(tid).update({
            bloqueioSaas: true,
            ...(torcida.status !== "suspensa" ? { status: "suspensa", suspensaPor: "saas" } : {}),
          });
          resultado.bloqueadas++;
        }
        await assRef.update({ situacao: "bloqueada" });
      } else if (vencidas.length) {
        await assRef.update({ situacao: "atrasada" });
      }
    } catch (e) {
      logger.error("Falha na rotina da mensalidade", { tid, erro: String(e) });
    }
  }
  return resultado;
}

export const rotinaSaas = onSchedule({ schedule: "20 7 * * *", timeZone: FUSO, timeoutSeconds: 300 }, async () => {
  const r = await processarSaas();
  logger.info("Rotina SaaS", r);
});

/** A equipe pode rodar a rotina na hora (e os testes usam isto). */
export const executarRotinaSaas = onCall(async (req) => {
  exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const agora = typeof d.agora === "number" ? d.agora : Date.now();
  return processarSaas(agora);
});
