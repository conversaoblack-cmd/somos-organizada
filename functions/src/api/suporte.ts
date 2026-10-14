/**
 * Aviso no celular da equipe quando chega mensagem nova no suporte (botão de ajuda das torcidas).
 * Antes a equipe só via o chamado abrindo o painel da plataforma.
 *
 * O navegador cria o chamado e as mensagens direto no Firestore (regras em firestore.rules, "Suporte") e logo depois
 * chama avisarSuporte, sem esperar a resposta. Aqui conferimos que o chamado é de quem chamou e montamos o aviso a
 * partir do que está gravado (nada do texto vem da chamada). alertarEquipe limita a 1 aviso por chamado a cada 10 min.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../util/firebase";
import { exigirLogin } from "../dominio/permissoes";
import { texto } from "../util/validacao";
import { alertarEquipe } from "./alertas";

/** Trecho da mensagem para a notificação: uma linha só, até ~120 caracteres. */
export function trechoAviso(t: string, max = 120): string {
  const limpo = t.replace(/\s+/g, " ").trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
}

export const avisarSuporte = onCall(async (req) => {
  const uid = exigirLogin(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const chamadoId = texto(d.chamadoId, "chamadoId", { max: 64 });
  if (!/^[\w-]+$/.test(chamadoId)) throw new HttpsError("invalid-argument", "Chamado inválido.");

  const chamado = await db.doc(`suporte/${chamadoId}`).get();
  if (!chamado.exists) throw new HttpsError("not-found", "Chamado não encontrado.");
  if (chamado.get("uid") !== uid) throw new HttpsError("permission-denied", "Este chamado não é seu.");

  // Sem índice composto: as últimas mensagens e, delas, a mais recente do usuário
  const ultimas = await chamado.ref.collection("mensagens").orderBy("criadoEm", "desc").limit(10).get();
  const msg = ultimas.docs.find((m) => m.get("autor") === "usuario");
  if (!msg) return { avisado: false };

  const quem = String(chamado.get("torcidaNome") ?? "").trim() || "Torcedor";
  await alertarEquipe(`suporte-${chamadoId}`, {
    titulo: "Nova mensagem no suporte",
    corpo: `${quem}: ${trechoAviso(String(msg.get("texto") ?? ""))}`,
    url: `/plataforma/suporte/${chamadoId}`,
  });
  return { avisado: true };
});
