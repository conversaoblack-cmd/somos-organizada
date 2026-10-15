/**
 * Alertas para a equipe Somos Organizada por notificação no celular (painel da plataforma instalado na tela de
 * início do iPhone/Android). Antes, erro só aparecia em Depuração e ninguém ficava sabendo a tempo.
 *
 * Web Push padrão (biblioteca web-push), sem Firebase Cloud Messaging: o celular se inscreve direto no
 * pushManager com a nossa chave pública VAPID, e o servidor manda um JSON simples { titulo, corpo, url, tag } para
 * o endereço da inscrição (no iPhone, um endereço da Apple). É o mesmo modelo que já funciona no iPhone em outro
 * sistema do dono; pelo Firebase a notificação era aceita e não chegava.
 *
 * - Par de chaves VAPID: criado pelo próprio servidor no primeiro uso e guardado em _servidor/notificacoes, que as
 *   regras do Firestore não deixam ninguém ler nem gravar (só o servidor). Nenhum passo manual na implantação. A
 *   chave privada só serve para mandar notificação aos aparelhos da equipe: não abre dado nem dinheiro.
 * - chaveNotificacao: a chave pública, para o celular se inscrever.
 * - registrarNotificacao: guarda a inscrição do aparelho em plataforma/notificacoes/inscricoes/{hash do endpoint}.
 * - testarNotificacao: manda uma notificação de teste para todos os aparelhos.
 * - alertarEquipe(): usado pelo servidor (erro inesperado numa ação, falha ao processar aviso da Pagar.me, cadastro
 *   novo para analisar, "Já paguei" da mensalidade). No máximo 1 por tipo a cada 10 minutos (erro em série não vira
 *   enxurrada). Falha de envio nunca derruba quem chamou.
 */
import { createHash } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { Agent } from "node:https";
import webpush from "web-push";
import { db, FieldValue, Timestamp } from "../util/firebase";
import { URL_APP } from "../config";
import { exigirPlataforma } from "../dominio/permissoes";
import { texto } from "../util/validacao";

const inscricoes = () => db.collection("plataforma/notificacoes/inscricoes");
const docChaves = () => db.doc("_servidor/notificacoes");
const INTERVALO_MS = 10 * 60 * 1000;
/** Quem envia (vai no cabeçalho VAPID): precisa ser https; a Apple recusa o resto (no emulador o URL_APP é http). */
const ASSUNTO = () => (/^https:\/\//.test(URL_APP.value()) ? URL_APP.value() : "https://somosorganizada.com.br");

let chavesEmMemoria: { publica: string; privada: string } | null = null;

/** Par VAPID do projeto. Cria na primeira vez; se dois servidores criarem juntos, vale o que gravou primeiro. */
async function chaves(): Promise<{ publica: string; privada: string }> {
  if (chavesEmMemoria) return chavesEmMemoria;
  let doc = await docChaves().get();
  if (!doc.exists) {
    const novo = webpush.generateVAPIDKeys();
    try {
      await docChaves().create({ publica: novo.publicKey, privada: novo.privateKey, criadoEm: FieldValue.serverTimestamp() });
    } catch {
      /* outro servidor criou antes: usa o dele */
    }
    doc = await docChaves().get();
  }
  chavesEmMemoria = { publica: String(doc.get("publica")), privada: String(doc.get("privada")) };
  return chavesEmMemoria;
}

const idDaInscricao = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 40);

export const chaveNotificacao = onCall(async (req) => {
  exigirPlataforma(req);
  return { chave: (await chaves()).publica };
});

export const registrarNotificacao = onCall(async (req) => {
  const quem = exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const endpoint = texto(d.endpoint, "endpoint", { max: 2048 });
  if (!/^https:\/\//.test(endpoint)) throw new HttpsError("invalid-argument", "Inscrição de notificação inválida.");
  const p256dh = texto(d.p256dh, "p256dh", { max: 200 });
  const auth = texto(d.auth, "auth", { max: 100 });
  const aparelho = texto(d.aparelho, "aparelho", { max: 120, obrigatorio: false });
  const chave = texto(d.chave, "chave", { max: 200, obrigatorio: false });
  // Inscrição feita com outra chave (ex.: a antiga do Firebase) seria recusada no envio
  if (chave && chave !== (await chaves()).publica) throw new HttpsError("failed-precondition", "A chave de notificação mudou. Toque em “Registrar de novo”.");
  await inscricoes().doc(idDaInscricao(endpoint)).set({ endpoint, p256dh, auth, uid: quem, aparelho, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const testarNotificacao = onCall(async (req) => {
  exigirPlataforma(req);
  const r = await enviar({ titulo: "Notificações ligadas", corpo: "Este aparelho vai receber os alertas da Somos Organizada.", url: "/plataforma", tag: "teste" });
  if (!r.aparelhos) throw new HttpsError("failed-precondition", "Nenhum aparelho com notificação ligada. Toque em “Ativar notificações” primeiro.");
  // Só a equipe chama: o motivo técnico aparece na tela para corrigir na hora
  if (!r.enviadas) throw new HttpsError("unavailable", `O envio foi recusado (${[...new Set(r.falhas)].join(", ") || "sem detalhe"}). Toque em “Registrar de novo” e teste outra vez.`);
  return { enviadas: r.enviadas, aparelhos: r.aparelhos, falhas: r.falhas };
});

/** Diagnóstico (só equipe): inscrições desta conta, para conferir no celular sem console. */
export const diagnosticoNotificacao = onCall(async (req) => {
  const quem = exigirPlataforma(req);
  const lista = await inscricoes().where("uid", "==", quem).get();
  return {
    aparelhos: lista.docs.map((d) => ({
      final: String(d.get("endpoint")).slice(-8),
      servico: (() => {
        try {
          return new URL(String(d.get("endpoint"))).host;
        } catch {
          return "";
        }
      })(),
      aparelho: String(d.get("aparelho") ?? "").slice(0, 80),
      atualizadoEm: (d.get("atualizadoEm") as Timestamp | undefined)?.toMillis() ?? null,
    })),
  };
});

interface Alerta {
  titulo: string;
  corpo: string;
  /** Caminho do painel da plataforma aberto ao tocar na notificação. */
  url?: string;
  /** Mesma tag substitui a notificação anterior em vez de empilhar. */
  tag?: string;
}

/** Emulador: o teste 21 (testes-e2e/fluxo.test.mjs) recebe num servidor https local com certificado próprio. */
const agenteDoTeste = (endpoint: string) =>
  process.env.FUNCTIONS_EMULATOR === "true" && endpoint.startsWith("https://127.0.0.1:") ? { agent: new Agent({ rejectUnauthorized: false }) } : {};

async function enviar(a: Alerta): Promise<{ aparelhos: number; enviadas: number; falhas: string[] }> {
  const lista = await inscricoes().get();
  if (lista.empty) return { aparelhos: 0, enviadas: 0, falhas: [] };
  const { publica, privada } = await chaves();
  const carga = JSON.stringify({ titulo: a.titulo, corpo: a.corpo.slice(0, 300), url: a.url ?? "/plataforma", tag: a.tag });
  const falhas: string[] = [];
  let enviadas = 0;
  await Promise.all(
    lista.docs.map(async (d) => {
      try {
        await webpush.sendNotification(
          { endpoint: String(d.get("endpoint")), keys: { p256dh: String(d.get("p256dh")), auth: String(d.get("auth")) } },
          carga,
          { TTL: 86400, urgency: "high", vapidDetails: { subject: ASSUNTO(), publicKey: publica, privateKey: privada }, timeout: 15_000, ...agenteDoTeste(String(d.get("endpoint"))) },
        );
        enviadas++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        const corpo = String((e as { body?: string }).body ?? (e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 80);
        falhas.push(status ? `${status} ${corpo}`.trim() : corpo);
        // 404/410: o app foi removido ou a permissão revogada; a inscrição não volta mais
        if (status === 404 || status === 410) await d.ref.delete().catch(() => undefined);
      }
    }),
  );
  if (falhas.length) logger.warn("Notificação da equipe com falha", { falhas });
  return { aparelhos: lista.size, enviadas, falhas };
}

/** Avisa a equipe (no máximo 1 por tipo a cada 10 min). Nunca lança erro. */
export async function alertarEquipe(tipo: string, a: Alerta): Promise<void> {
  try {
    const ref = db.doc(`plataforma/notificacoes/ultimos/${tipo.replace(/[^\w-]/g, "_").slice(0, 80)}`);
    const pode = await db.runTransaction(async (tx) => {
      const ultimo = (await tx.get(ref)).get("em") as Timestamp | undefined;
      if (ultimo && Date.now() - ultimo.toMillis() < INTERVALO_MS) {
        tx.set(ref, { repetidos: FieldValue.increment(1) }, { merge: true });
        return false;
      }
      tx.set(ref, { em: Timestamp.now(), repetidos: 0 });
      return true;
    });
    if (pode) await enviar({ tag: tipo.slice(0, 60), ...a });
  } catch (e) {
    logger.warn("Alerta para a equipe não enviado", { tipo, erro: String(e) });
  }
}
