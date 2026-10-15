/**
 * Aviso no celular da equipe quando chega mensagem nova no suporte (botão de ajuda das torcidas).
 * Antes a equipe só via o chamado abrindo o painel da plataforma.
 *
 * O navegador cria o chamado e as mensagens direto no Firestore (regras em firestore.rules, "Suporte") e logo depois
 * chama avisarSuporte, sem esperar a resposta. Aqui conferimos que o chamado é de quem chamou e montamos o aviso a
 * partir do que está gravado (nada do texto vem da chamada). Uma notificação por mensagem, com a torcida e o assunto.
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

/** "Foto", "2 fotos, Áudio"... para mensagem que só tem anexo. */
export function resumoAnexos(anexos: unknown): string {
  if (!Array.isArray(anexos) || !anexos.length) return "";
  const n = (t: string) => anexos.filter((x) => (x as { tipo?: string })?.tipo === t).length;
  return [
    n("imagem") && (n("imagem") > 1 ? `${n("imagem")} fotos` : "Foto"),
    n("audio") && (n("audio") > 1 ? `${n("audio")} áudios` : "Áudio"),
    n("arquivo") && (n("arquivo") > 1 ? `${n("arquivo")} arquivos` : "Arquivo"),
  ]
    .filter(Boolean)
    .join(", ");
}

/** Título e corpo da notificação: torcida + assunto em cima; quem escreveu e o que escreveu embaixo. */
export function avisoDaMensagem(chamado: { torcidaNome?: unknown; assunto?: unknown; nome?: unknown }, msg: { texto?: unknown; anexos?: unknown; nome?: unknown }) {
  const torcida = String(chamado.torcidaNome ?? "").trim() || "Suporte";
  const assunto = trechoAviso(String(chamado.assunto ?? ""), 70);
  const quem = trechoAviso(String(msg.nome ?? chamado.nome ?? "").trim(), 40) || "Torcedor";
  const texto = String(msg.texto ?? "").trim();
  const anexos = resumoAnexos(msg.anexos);
  const conteudo = [anexos && `[${anexos}]`, texto && trechoAviso(texto)].filter(Boolean).join(" ");
  return { titulo: trechoAviso(assunto ? `${torcida} · ${assunto}` : torcida, 90), corpo: `${quem}: ${conteudo || "mensagem nova"}` };
}

export const avisarSuporte = onCall(async (req) => {
  const uid = exigirLogin(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const chamadoId = texto(d.chamadoId, "chamadoId", { max: 64 });
  const mensagemId = texto(d.mensagemId, "mensagemId", { max: 64, obrigatorio: false });
  if (!/^[\w-]+$/.test(chamadoId) || (mensagemId && !/^[\w-]+$/.test(mensagemId))) throw new HttpsError("invalid-argument", "Chamado inválido.");

  const chamado = await db.doc(`suporte/${chamadoId}`).get();
  if (!chamado.exists) throw new HttpsError("not-found", "Chamado não encontrado.");
  if (chamado.get("uid") !== uid) throw new HttpsError("permission-denied", "Este chamado não é seu.");

  // A mensagem indicada (do próprio usuário) ou, sem ela, a mais recente dele
  let msg: FirebaseFirestore.DocumentSnapshot | undefined;
  if (mensagemId) {
    const m = await chamado.ref.collection("mensagens").doc(mensagemId).get();
    if (m.exists && m.get("autor") === "usuario") msg = m;
  }
  if (!msg) {
    const ultimas = await chamado.ref.collection("mensagens").orderBy("criadoEm", "desc").limit(10).get();
    msg = ultimas.docs.find((m) => m.get("autor") === "usuario");
  }
  if (!msg) return { avisado: false };

  // Uma notificação por mensagem (antes: no máximo 1 a cada 10 min por chamado, e as seguintes se perdiam).
  // No celular a tag do chamado troca a anterior pela nova, sem empilhar.
  await alertarEquipe(`suporte-${chamadoId}-${msg.id}`, {
    ...avisoDaMensagem(chamado.data() ?? {}, msg.data() ?? {}),
    url: `/plataforma/suporte/${chamadoId}`,
    tag: `suporte-${chamadoId}`,
  });
  return { avisado: true };
});
