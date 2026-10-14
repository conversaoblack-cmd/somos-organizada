/**
 * Alertas para a equipe Somos Organizada por notificação no celular (painel da plataforma instalado na tela de
 * início do iPhone/Android). Antes, erro só aparecia em Depuração e ninguém ficava sabendo a tempo.
 *
 * - registrarNotificacao: o aparelho da equipe guarda o token de envio (plataforma/notificacoes/aparelhos/{hash}).
 * - testarNotificacao: manda uma notificação de teste para todos os aparelhos.
 * - alertarEquipe(): usado pelo servidor (erro inesperado numa ação, falha ao processar aviso da Pagar.me, cadastro
 *   novo para analisar, "Já paguei" da mensalidade). No máximo 1 por tipo a cada 10 minutos (erro em série não vira
 *   enxurrada). Falha de envio nunca derruba quem chamou.
 */
import { createHash } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getMessaging } from "firebase-admin/messaging";
import { db, FieldValue, Timestamp } from "../util/firebase";
import { exigirPlataforma } from "../dominio/permissoes";
import { texto } from "../util/validacao";

const aparelhos = () => db.collection("plataforma/notificacoes/aparelhos");
const INTERVALO_MS = 10 * 60 * 1000;

export const registrarNotificacao = onCall(async (req) => {
  const quem = exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const token = texto(d.token, "token", { max: 4096 });
  const aparelho = texto(d.aparelho, "aparelho", { max: 120, obrigatorio: false });
  const id = createHash("sha256").update(token).digest("hex").slice(0, 40);
  await aparelhos().doc(id).set({ token, uid: quem, aparelho, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const testarNotificacao = onCall(async (req) => {
  exigirPlataforma(req);
  const enviadas = await enviar({ titulo: "Notificações ligadas", corpo: "Este aparelho vai receber os alertas da Somos Organizada.", url: "/plataforma" });
  if (!enviadas) throw new HttpsError("failed-precondition", "Nenhum aparelho com notificação ligada. Toque em “Ativar notificações” primeiro.");
  return { enviadas };
});

interface Alerta {
  titulo: string;
  corpo: string;
  /** Caminho do painel da plataforma aberto ao tocar na notificação. */
  url?: string;
}

async function enviar(a: Alerta): Promise<number> {
  const lista = await aparelhos().get();
  if (lista.empty) return 0;
  const r = await getMessaging().sendEach(
    lista.docs.map((d) => ({
      token: String(d.get("token")),
      notification: { title: a.titulo, body: a.corpo.slice(0, 240) },
      data: { url: a.url ?? "/plataforma" },
      webpush: { fcmOptions: { link: a.url ?? "/plataforma" } },
    })),
  );
  // Aparelho que desinstalou o app ou desligou a permissão: sai da lista
  await Promise.all(
    r.responses.map((x, i) => {
      const codigo = x.error?.code ?? "";
      return /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(codigo) ? lista.docs[i]!.ref.delete() : null;
    }),
  );
  return r.successCount;
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
    if (pode) await enviar(a);
  } catch (e) {
    logger.warn("Alerta para a equipe não enviado", { tipo, erro: String(e) });
  }
}
