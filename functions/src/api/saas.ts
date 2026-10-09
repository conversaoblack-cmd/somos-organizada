/**
 * Mensalidade da plataforma Somos Organizada (paga pela diretoria, só em Pix, sem multa nem juros).
 *
 *  - Planos (todos com todos os recursos; muda só o tamanho):
 *      Torcida Pro  R$ 197: até 300 sócios e 3 eventos à venda ao mesmo tempo;
 *      Torcida Plus R$ 347: até 600 sócios e 6 eventos à venda;
 *      Torcida Max  R$ 997: até 2.000 sócios e 20 eventos à venda.
 *    A equipe pode mudar só o preço (plataforma/publico.planos.{id}.valor); os limites são fixos.
 *  - Sócios que ocupam vaga: ativo + inadimplente + em_analise (stats/geral). No limite, novas adesões param.
 *  - Eventos à venda: status "publicado" com data no futuro. No limite, a diretoria não publica outro.
 *  - Sem assinatura (site ainda não publicado) não há limite.
 *  - A cobrança começa ao PUBLICAR o site: 1ª fatura vence em 7 dias; depois, todo mês no mesmo dia.
 *  - Pix estático (chave da plataforma). A diretoria avisa que pagou; a equipe confirma no painel.
 *  - 7 dias após o vencimento sem pagamento: o site e as vendas da torcida saem do ar até a confirmação.
 *  - Torcidas antigas: pequena → pro, grande → plus, gigante → max (normalizarPlano).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { FUSO } from "../config";
import { db, refs, FieldValue, Timestamp } from "../util/firebase";
import { dias } from "../util/datas";
import { texto } from "../util/validacao";
import { pixCopiaECola } from "../util/pix";
import { avancarCiclo } from "../dominio/precos";
import { exigirMembro, exigirPlataforma } from "../dominio/permissoes";
import type { Torcida } from "../dominio/tipos";

export type PlanoSaas = "pro" | "plus" | "max";
export const PLANOS_SAAS: readonly PlanoSaas[] = ["pro", "plus", "max"];

export interface DefinicaoPlano {
  nome: string;
  /** Centavos por mês. */
  valor: number;
  /** Sócios que ocupam vaga (ativo + inadimplente + em análise). */
  socios: number;
  /** Eventos à venda ao mesmo tempo (publicados com data no futuro). */
  eventos: number;
}

export const SAAS_PADRAO = {
  planos: {
    pro: { nome: "Torcida Pro", valor: 19700, socios: 300, eventos: 3 },
    plus: { nome: "Torcida Plus", valor: 34700, socios: 600, eventos: 6 },
    max: { nome: "Torcida Max", valor: 99700, socios: 2000, eventos: 20 },
  } as Record<PlanoSaas, DefinicaoPlano>,
  diasPrimeiraFatura: 7,
  diasTolerancia: 7,
  diasGerarAntes: 5,
  pix: { chave: "", nome: "SOMOS ORGANIZADA", cidade: "SALVADOR" },
};

export interface ConfigSaas {
  planos: Record<PlanoSaas, DefinicaoPlano>;
  diasPrimeiraFatura: number;
  diasTolerancia: number;
  diasGerarAntes: number;
  pix: { chave: string; nome: string; cidade: string };
}

/** Ids antigos (antes de Pro/Plus/Max) continuam valendo em assinaturas e faturas já gravadas. */
const PLANOS_LEGADOS: Record<string, PlanoSaas> = { pequena: "pro", grande: "plus", gigante: "max" };

/** "pro" | "plus" | "max" (ou id antigo) → id atual; qualquer outra coisa → null. */
export function normalizarPlano(plano: unknown): PlanoSaas | null {
  const p = String(plano ?? "");
  if ((PLANOS_SAAS as readonly string[]).includes(p)) return p as PlanoSaas;
  return PLANOS_LEGADOS[p] ?? null;
}

/** Limites fixos do plano (não mudam com o preço configurado pela equipe). */
export function limitesDoPlano(plano: PlanoSaas): { socios: number; eventos: number } {
  const p = SAAS_PADRAO.planos[plano];
  return { socios: p.socios, eventos: p.eventos };
}

export interface UsoDoPlano {
  /** Sócios que ocupam vaga. */
  socios: number;
  /** Eventos à venda agora. */
  eventos: number;
}

/** O uso atual cabe no plano? (limite incluso: 300 sócios cabem no Torcida Pro.) */
export function cabeNoPlano(plano: PlanoSaas, uso: UsoDoPlano): { cabe: boolean; socios: boolean; eventos: boolean } {
  const lim = limitesDoPlano(plano);
  const socios = uso.socios <= lim.socios;
  const eventos = uso.eventos <= lim.eventos;
  return { cabe: socios && eventos, socios, eventos };
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

/** "O plano Torcida Pro vai até 300 sócios e 3 eventos à venda. Hoje vocês têm 412 sócios. Escolha um plano maior." */
export function mensagemForaDoPlano(plano: PlanoSaas, uso: UsoDoPlano): string | null {
  const c = cabeNoPlano(plano, uso);
  if (c.cabe) return null;
  const p = SAAS_PADRAO.planos[plano];
  const excede = [
    ...(!c.socios ? [`${fmt(uso.socios)} sócios`] : []),
    ...(!c.eventos ? [`${fmt(uso.eventos)} eventos à venda`] : []),
  ].join(" e ");
  return `O plano ${p.nome} vai até ${fmt(p.socios)} sócios e ${fmt(p.eventos)} eventos à venda. Hoje vocês têm ${excede}. Escolha um plano maior.`;
}

/** Sócios que ocupam vaga a partir do contador stats/geral.socios. */
export function sociosQueOcupamVaga(contador: Record<string, unknown> | undefined | null): number {
  const n = (k: string) => Math.max(0, Number(contador?.[k] ?? 0) || 0);
  return n("ativo") + n("inadimplente") + n("em_analise");
}

export interface AssinaturaSaas {
  /** Pode ter id antigo (pequena/grande) em torcidas anteriores aos planos Pro/Plus/Max: use normalizarPlano. */
  plano: PlanoSaas | "pequena" | "grande";
  diaVencimento: number;
  proximoVencimento: Timestamp;
  situacao: "em_dia" | "aberta" | "atrasada" | "bloqueada";
  faturaAbertaId?: string | null;
  criadaEm: Timestamp;
}

export interface FaturaSaas {
  competencia: string;
  /** Faturas antigas podem ter pequena/grande/gigante: use normalizarPlano para exibir. */
  plano: PlanoSaas | "pequena" | "grande" | "gigante";
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

/** Configuração com os preços da equipe (só o valor de cada plano muda; nome e limites são fixos). */
export async function configSaas(): Promise<ConfigSaas> {
  const c = (await refsSaas.config().get()).data() ?? {};
  const planos = { ...SAAS_PADRAO.planos };
  for (const k of PLANOS_SAAS) {
    const v = Number(c.planos?.[k]?.valor);
    if (Number.isInteger(v) && v > 0) planos[k] = { ...planos[k], valor: v };
  }
  return {
    ...SAAS_PADRAO,
    planos,
    pix: { ...SAAS_PADRAO.pix, ...(c.pix ?? {}) },
  };
}

const idFatura = (venc: Date) => venc.toISOString().slice(0, 10);

/** Sócios que ocupam vaga na torcida (contador agregado, sem ler as fichas). */
export async function contarSociosNoPlano(tid: string): Promise<number> {
  const g = (await refs.statsGeral(tid).get()).data();
  return sociosQueOcupamVaga(g?.socios);
}

/** Eventos à venda agora: publicados com data no futuro (contagem no servidor; índice status+data). */
export async function contarEventosAVenda(tid: string): Promise<number> {
  const q = db.collection(`torcidas/${tid}/eventos`).where("status", "==", "publicado").where("data", ">=", Timestamp.now());
  return (await q.count().get()).data().count;
}

export async function usoDoPlano(tid: string): Promise<UsoDoPlano> {
  const [socios, eventos] = await Promise.all([contarSociosNoPlano(tid), contarEventosAVenda(tid)]);
  return { socios, eventos };
}

/** Plano da assinatura da torcida (já normalizado) ou null se ela ainda não publicou o site. */
export async function planoDaTorcida(tid: string): Promise<PlanoSaas | null> {
  const ass = (await refsSaas.assinatura(tid).get()).data() as AssinaturaSaas | undefined;
  if (!ass) return null;
  return normalizarPlano(ass.plano) ?? "pro";
}

function planoEscolhido(v: unknown): PlanoSaas {
  const p = String(v ?? "");
  if (!(PLANOS_SAAS as readonly string[]).includes(p)) {
    throw new HttpsError("invalid-argument", "Escolha um plano: Torcida Pro, Torcida Plus ou Torcida Max.");
  }
  return p as PlanoSaas;
}

/** Recusa a escolha/troca se a torcida já usa mais do que o plano permite. */
async function exigirQueCaiba(tid: string, plano: PlanoSaas) {
  const msg = mensagemForaDoPlano(plano, await usoDoPlano(tid));
  if (msg) throw new HttpsError("failed-precondition", msg, { limitePlano: "troca" });
}

/** Cria (se ainda não existir) a fatura com o vencimento dado. Idempotente pelo id = data do vencimento. */
export async function gerarFatura(tid: string, vencimento: Date, cfg: ConfigSaas): Promise<string> {
  const id = idFatura(vencimento);
  const ref = refsSaas.fatura(tid, id);
  const ass = (await refsSaas.assinatura(tid).get()).data() as AssinaturaSaas | undefined;
  if (!ass) throw new Error("Torcida sem assinatura");
  const qtd = await contarSociosNoPlano(tid);
  const plano = normalizarPlano(ass.plano) ?? "pro";
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
    const plano = planoEscolhido(d.plano);
    await exigirQueCaiba(tid, plano);
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

/**
 * Troca entre Torcida Pro, Plus e Max. O preço novo vale a partir da próxima fatura; os limites, na hora.
 * Não deixa ir para um plano menor do que o uso de hoje (sócios que ocupam vaga e eventos à venda).
 */
export const alterarPlanoSaas = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  await exigirMembro(req, tid, ["diretoria"]);
  const plano = planoEscolhido(d.plano);
  const ref = refsSaas.assinatura(tid);
  if (!(await ref.get()).exists) throw new HttpsError("failed-precondition", "O plano é escolhido ao publicar o site.");
  await exigirQueCaiba(tid, plano);
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
