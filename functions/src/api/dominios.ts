/**
 * Domínio próprio da torcida (ex.: furiaamapaense.com.br). Não é autoatendimento: só a equipe liga, pelo painel da
 * plataforma (página da torcida → "Domínio próprio"), depois de combinar com a diretoria pelo comercial.
 *
 * - vitrine: domínio raiz, o site público (eventos, ingressos, sócio, conta). "www." redireciona para ele.
 * - painel: subdomínio para diretoria, subsedes e portaria (ex.: painel.furiaamapaense.com.br).
 * O endereço padrão (somosorganizada.com.br/{torcida}) continua funcionando sempre.
 *
 * Dados:
 *  - dominios/{host} (público, só leitura): { tid, slug, tipo, status, ativos } — o site descobre a torcida pelo endereço.
 *    Nada de segredo aqui. Um host pertence a uma torcida só (transação).
 *  - torcidas/{tid}/privado/dominio (só servidor): registros de DNS, estado por host e histórico.
 *  - torcidas/{tid}.dominio = { vitrine?, painel? } (público, só servidor): os que estão no ar. Os links de e-mail
 *    e de divulgação usam esses endereços (util/urls.ts).
 * A rotina diária (rotinaSaas) confere os pendentes; o Firebase apaga domínio que não fica ativo em 30 dias.
 */
import { createHash } from "node:crypto";
import { domainToASCII } from "node:url";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db, refs, FieldValue, Timestamp } from "../util/firebase";
import { exigirPlataforma } from "../dominio/permissoes";
import { texto } from "../util/validacao";
import { provedorDominio } from "../util/provedorDominio";
import {
  EnderecoInvalido,
  validarPainel,
  validarVitrine,
  wwwDe,
  type EstadoDominio,
  type RegistroDns,
  type SituacaoDominio,
} from "../dominio/enderecos";
import type { Torcida } from "../dominio/tipos";
import { enviarUmaVez } from "../email/enviar";
import { esc, montar, semLink } from "../email/modelos";
import { alertarEquipe } from "./alertas";
import { MARCA_PLATAFORMA } from "./verificacao";

type TipoDoc = "vitrine" | "painel" | "www";

interface HostPrivado {
  tipo: TipoDoc;
  estado: EstadoDominio;
  registros: RegistroDns[];
  erro?: string | null;
  criadoEm: Timestamp;
  atualizadoEm: Timestamp;
  ativoEm?: Timestamp | null;
}
interface DominioPrivado {
  hosts?: Record<string, HostPrivado>;
  historico?: { em: Timestamp; acao: string; host: string; por: string }[];
}

/** Firebase apaga o domínio que não fica ativo em 30 dias: com 25, a equipe é avisada. */
const DIAS_AVISO_PENDENTE = 25;

const refDominio = (host: string) => db.doc(`dominios/${host}`);
const refPrivado = (tid: string) => db.doc(`torcidas/${tid}/privado/dominio`);

function validar<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof EnderecoInvalido) throw new HttpsError("invalid-argument", e.message);
    throw e;
  }
}

async function lerTorcida(tid: string): Promise<Torcida> {
  const t = (await refs.torcida(tid).get()).data() as Torcida | undefined;
  if (!t) throw new HttpsError("not-found", "Torcida não encontrada.");
  return t;
}

async function historico(tid: string, acao: string, host: string, por: string) {
  const ref = refPrivado(tid);
  await db.runTransaction(async (tx) => {
    const atual = ((await tx.get(ref)).get("historico") as DominioPrivado["historico"]) ?? [];
    tx.set(ref, { historico: [...atual, { em: Timestamp.now(), acao, host, por }].slice(-30) }, { merge: true });
  });
}

/** Copia os endereços no ar da torcida para os documentos públicos dela (o site usa para redirecionar entre vitrine e painel). */
async function espelharAtivos(tid: string) {
  const ativos = ((await refs.torcida(tid).get()).get("dominio") as Torcida["dominio"]) ?? {};
  const docs = await db.collection("dominios").where("tid", "==", tid).get();
  await Promise.all(docs.docs.map((d) => d.ref.update({ ativos })));
}

/** Diretores ativos (e-mail do aviso "está no ar"). */
async function diretores(tid: string): Promise<{ email: string; nome?: string }[]> {
  const m = await refs.torcida(tid).collection("membros").where("papel", "==", "diretoria").where("ativo", "==", true).get();
  const lista = new Map<string, { email: string; nome?: string }>();
  for (const d of m.docs) {
    const email = String(d.get("email") ?? "").trim().toLowerCase();
    if (email) lista.set(email, { email, nome: (d.get("nome") as string | undefined) ?? undefined });
  }
  return [...lista.values()];
}

async function avisarNoAr(tid: string, torcida: Torcida, host: string, tipo: "vitrine" | "painel") {
  const url = `https://${host}/`;
  const vitrine = tipo === "vitrine";
  for (const para of await diretores(tid)) {
    // É a Somos Organizada avisando a diretoria: a nossa marca
    const m = montar(MARCA_PLATAFORMA, `Seu endereço próprio está no ar: ${host}`, para, {
      selo: "Domínio próprio",
      titulo: "Seu endereço próprio está no ar",
      paragrafos: [
        vitrine
          ? `O site da <strong>${esc(torcida.nome)}</strong> já abre em <strong>${semLink(host)}</strong>, com cadeado de segurança. Use esse endereço na divulgação: eventos, ingressos e sócio funcionam nele.`
          : `O painel da <strong>${esc(torcida.nome)}</strong> já abre em <strong>${semLink(host)}</strong>. Diretoria, subsedes e portaria entram com o mesmo e-mail e senha de sempre.`,
        `O endereço antigo (${semLink(`somosorganizada.com.br/${torcida.slug}`)}) continua funcionando.`,
      ],
      botao: { texto: vitrine ? "Abrir o site" : "Abrir o painel", url },
      conta: true,
    });
    const quem = createHash("sha256").update(para.email).digest("hex").slice(0, 12);
    await enviarUmaVez(tid, `dominio-ativo-${host}-${quem}`, "dominio_ativo", m);
  }
  await alertarEquipe(`dominio-ativo-${host}`, { titulo: "Domínio próprio no ar", corpo: `${host} (${torcida.nome}) está no ar.`, url: `/plataforma/torcidas/${tid}` });
}

/**
 * Grava a situação de um host (privado + público). Quando a vitrine ou o painel fica "ativo" pela primeira vez,
 * publica em torcidas/{tid}.dominio e avisa a diretoria e a equipe.
 */
async function aplicarSituacao(tid: string, host: string, tipo: TipoDoc, s: SituacaoDominio): Promise<void> {
  const privado = ((await refPrivado(tid).get()).data() as DominioPrivado | undefined)?.hosts?.[host];
  const agora = Timestamp.now();
  const ficouAtivo = s.estado === "ativo" && privado?.estado !== "ativo";
  await refPrivado(tid).set(
    {
      hosts: {
        [host]: {
          tipo,
          estado: s.estado,
          registros: s.registros,
          erro: s.erro ?? null,
          criadoEm: privado?.criadoEm ?? agora,
          atualizadoEm: agora,
          ativoEm: ficouAtivo ? agora : privado?.ativoEm ?? null,
        } satisfies HostPrivado,
      },
    },
    { merge: true },
  );
  await refDominio(host).update({ status: s.estado, atualizadoEm: agora }).catch(() => undefined);
  // Estava no ar e caiu (DNS trocado, certificado vencido, removido do Hosting): sai da torcida, senão e-mails e
  // redirecionamentos continuariam mandando todo mundo para um endereço fora do ar. Volta sozinho quando ficar ativo.
  const caiu = s.estado !== "ativo" && privado?.estado === "ativo";
  if (caiu && tipo !== "www") {
    const atual = ((await refs.torcida(tid).get()).get("dominio") as Torcida["dominio"])?.[tipo];
    if (atual === host) {
      await refs.torcida(tid).update({ [`dominio.${tipo}`]: FieldValue.delete() });
      await espelharAtivos(tid);
    }
    await alertarEquipe(`dominio-caiu-${host}`, { titulo: "Domínio próprio fora do ar", corpo: `${host} parou de responder (${s.erro ?? s.estado}). Links voltaram para o endereço padrão.`, url: `/plataforma/torcidas/${tid}` });
    return;
  }
  if (!ficouAtivo || tipo === "www") return;
  await refs.torcida(tid).update({ [`dominio.${tipo}`]: host });
  await espelharAtivos(tid);
  try {
    await avisarNoAr(tid, await lerTorcida(tid), host, tipo);
  } catch (e) {
    logger.error("Domínio no ar: aviso não enviado", { tid, host, erro: String(e) });
  }
}

interface HostResumo {
  host: string;
  tipo: TipoDoc;
  estado: EstadoDominio;
  registros: RegistroDns[];
  erro: string | null;
  criadoEm: number | null;
  ativoEm: number | null;
}

async function resumo(tid: string) {
  const [p, t] = await Promise.all([refPrivado(tid).get(), refs.torcida(tid).get()]);
  const hosts = ((p.data() as DominioPrivado | undefined)?.hosts ?? {}) as Record<string, HostPrivado>;
  const ordem: Record<TipoDoc, number> = { vitrine: 0, www: 1, painel: 2 };
  const lista: HostResumo[] = Object.entries(hosts)
    .map(([host, h]) => ({
      host,
      tipo: h.tipo,
      estado: h.estado,
      registros: h.registros ?? [],
      erro: h.erro ?? null,
      criadoEm: h.criadoEm?.toMillis() ?? null,
      ativoEm: h.ativoEm?.toMillis() ?? null,
    }))
    .sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
  return { hosts: lista, dominio: (t.get("dominio") as Torcida["dominio"]) ?? null };
}

/** Consulta o provedor e aplica. Domínio que sumiu do provedor vira "erro" (remover e ligar de novo). */
async function atualizarHost(tid: string, host: string, tipo: TipoDoc) {
  const s = await provedorDominio().consultar(host);
  await aplicarSituacao(
    tid,
    host,
    tipo,
    s ?? { estado: "erro", registros: [], erro: "O domínio não existe mais no Firebase Hosting (removido ou expirou sem DNS). Remova e configure de novo." },
  );
}

/** Equipe: liga a vitrine (e o www) e/ou o painel de uma torcida. */
export const configurarDominio = onCall(async (req) => {
  const uid = exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 64 });
  const vitrine = d.vitrine ? validar(() => validarVitrine(d.vitrine, domainToASCII)) : undefined;
  const painel = d.painel ? validar(() => validarPainel(d.painel, domainToASCII)) : undefined;
  if (!vitrine && !painel) throw new HttpsError("invalid-argument", "Informe o domínio da vitrine, do painel ou os dois.");
  if (vitrine && painel && (painel === vitrine || painel === wwwDe(vitrine))) throw new HttpsError("invalid-argument", "O painel precisa ser um subdomínio diferente do site.");
  const torcida = await lerTorcida(tid);
  const atuais = ((await refPrivado(tid).get()).data() as DominioPrivado | undefined)?.hosts ?? {};
  for (const [host, h] of Object.entries(atuais)) {
    if (vitrine && h.tipo === "vitrine" && host !== vitrine) throw new HttpsError("failed-precondition", `A vitrine já usa ${host}. Remova esse domínio antes de trocar.`);
    if (painel && h.tipo === "painel" && host !== painel) throw new HttpsError("failed-precondition", `O painel já usa ${host}. Remova esse domínio antes de trocar.`);
  }

  const novos: { host: string; tipo: TipoDoc; redirecionarPara?: string }[] = [
    ...(vitrine ? [{ host: vitrine, tipo: "vitrine" as const }, { host: wwwDe(vitrine), tipo: "www" as const, redirecionarPara: vitrine }] : []),
    ...(painel ? [{ host: painel, tipo: "painel" as const }] : []),
  ];

  // Reserva: cada endereço é de uma torcida só
  const criados: string[] = await db.runTransaction(async (tx) => {
    const snaps = await Promise.all(novos.map((n) => tx.get(refDominio(n.host))));
    snaps.forEach((s, i) => {
      if (s.exists && s.get("tid") !== tid) throw new HttpsError("already-exists", `O endereço ${novos[i]!.host} já está ligado a outra torcida.`);
      if (s.exists && s.get("tipo") !== novos[i]!.tipo) throw new HttpsError("already-exists", `O endereço ${novos[i]!.host} já é usado como ${s.get("tipo")} desta torcida.`);
    });
    const agora = Timestamp.now();
    const lista: string[] = [];
    snaps.forEach((s, i) => {
      const n = novos[i]!;
      if (s.exists) return;
      lista.push(n.host);
      tx.set(refDominio(n.host), { tid, slug: torcida.slug, tipo: n.tipo, status: "pendente_dns", ativos: torcida.dominio ?? {}, criadoEm: agora, atualizadoEm: agora });
    });
    return lista;
  });

  const provedor = provedorDominio();
  try {
    for (const n of novos) {
      const s = await provedor.criar(n.host, n.redirecionarPara ? { redirecionarPara: n.redirecionarPara } : {});
      await aplicarSituacao(tid, n.host, n.tipo, s);
    }
  } catch (e) {
    // Não deixa reserva pela metade: o que esta chamada criou volta atrás (no provedor e na reserva)
    for (const host of criados) {
      await provedor.remover(host).catch(() => undefined);
      await refDominio(host).delete().catch(() => undefined);
      await refPrivado(tid).set({ hosts: { [host]: FieldValue.delete() } }, { merge: true }).catch(() => undefined);
    }
    throw e;
  }
  for (const n of novos) if (criados.includes(n.host)) await historico(tid, "configurar", n.host, uid);
  return resumo(tid);
});

/** Equipe: confere agora a situação dos domínios da torcida (DNS e certificado). */
export const consultarDominio = onCall(async (req) => {
  exigirPlataforma(req);
  const tid = texto((req.data as Record<string, unknown> | undefined)?.tid, "torcida", { max: 64 });
  const hosts = ((await refPrivado(tid).get()).data() as DominioPrivado | undefined)?.hosts ?? {};
  await Promise.all(Object.entries(hosts).map(([host, h]) => atualizarHost(tid, host, h.tipo)));
  return resumo(tid);
});

/** Equipe: desliga um domínio (a vitrine leva o www junto). O endereço padrão continua valendo. */
export const removerDominio = onCall(async (req) => {
  const uid = exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 64 });
  const host = texto(d.host, "domínio", { max: 253 }).toLowerCase();
  const hosts = ((await refPrivado(tid).get()).data() as DominioPrivado | undefined)?.hosts ?? {};
  const publico = await refDominio(host).get();
  const tipo = hosts[host]?.tipo ?? (publico.get("tid") === tid ? (publico.get("tipo") as TipoDoc) : undefined);
  if (!tipo) throw new HttpsError("not-found", "Esse domínio não está ligado a esta torcida.");
  const remover = tipo === "vitrine" ? [host, wwwDe(host)] : [host];
  const provedor = provedorDominio();
  for (const h of remover) {
    await provedor.remover(h);
    const doc = await refDominio(h).get();
    if (doc.exists && doc.get("tid") === tid) await doc.ref.delete();
    await refPrivado(tid).set({ hosts: { [h]: FieldValue.delete() } }, { merge: true });
  }
  const atual = ((await refs.torcida(tid).get()).get("dominio") as Torcida["dominio"]) ?? {};
  const resto = { ...atual };
  if (tipo !== "www" && resto[tipo] === host) delete resto[tipo];
  await refs.torcida(tid).update({ dominio: Object.keys(resto).length ? resto : FieldValue.delete() });
  await espelharAtivos(tid);
  await historico(tid, "remover", host, uid);
  return resumo(tid);
});

/**
 * Rotina diária (chamada pela rotinaSaas): confere todos os domínios (o que caiu sai da torcida) e avisa a equipe quando
 * um passa de 25 dias pendente (o Firebase apaga com 30).
 */
export async function revisarDominios(agora = Date.now()) {
  // Todos, inclusive os que estão no ar: um domínio ativo pode cair (aplicarSituacao tira da torcida)
  const pendentes = await db.collection("dominios").get();
  const resultado = { conferidos: 0, ativados: 0, avisos: 0 };
  for (const doc of pendentes.docs) {
    const { tid, tipo, criadoEm, avisadoPrazo, status: antes } = doc.data() as { tid: string; tipo: TipoDoc; criadoEm?: Timestamp; avisadoPrazo?: boolean; status?: EstadoDominio };
    try {
      await atualizarHost(tid, doc.id, tipo);
      resultado.conferidos++;
      const status = (await doc.ref.get()).get("status") as EstadoDominio | undefined;
      if (status === "ativo") {
        if (antes !== "ativo") resultado.ativados++;
        continue;
      }
      if (antes === "ativo") continue; // acabou de cair: aplicarSituacao já avisou a equipe
      const dias = criadoEm ? (agora - criadoEm.toMillis()) / 86400_000 : 0;
      if (dias >= DIAS_AVISO_PENDENTE && !avisadoPrazo) {
        const nome = ((await refs.torcida(tid).get()).get("nome") as string | undefined) ?? tid;
        await alertarEquipe(`dominio-prazo-${doc.id}`, {
          titulo: "Domínio próprio parado",
          corpo: `${doc.id} (${nome}) está há ${Math.floor(dias)} dias sem ficar no ar. O Firebase apaga com 30: cobre o DNS da torcida.`,
          url: `/plataforma/torcidas/${tid}`,
        });
        await doc.ref.update({ avisadoPrazo: true });
        resultado.avisos++;
      }
    } catch (e) {
      logger.error("Rotina de domínios: falha ao conferir", { host: doc.id, tid, erro: String(e) });
    }
  }
  return resultado;
}
