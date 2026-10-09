/**
 * Vídeo de verificação do cadastro da torcida (último passo antes da análise).
 *
 * Por quê: os dados de uma torcida organizada (nome, sede, presidente, CNPJ) são públicos. Qualquer pessoa poderia
 * usá-los para se cadastrar no lugar da diretoria e receber o dinheiro de ingressos e mensalidades. Por isso o
 * responsável grava um vídeo curto na sede, com documento e pelo menos duas testemunhas da diretoria ou do conselho.
 * O vídeo fica guardado com acesso restrito (Storage: verificacoes/{uid}/...; só o próprio e a equipe veem), como
 * prova de quem fez o cadastro. Sem agenda e sem chamada: a equipe assiste e aprova no painel da plataforma.
 *
 * - registrarVideoVerificacao: depois do envio pelo site, confere o arquivo e marca o cadastro como "vídeo enviado".
 * - pedirNovoVideo (equipe): devolve com o motivo (ex.: faltou testemunha); o responsável grava de novo.
 * - A aprovação (cadastro.ts → avaliarSolicitacao) exige vídeo enviado e a conferência da equipe.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getStorage } from "firebase-admin/storage";
import { URL_APP } from "../config";
import { db, FieldValue } from "../util/firebase";
import { exigirLogin, exigirPlataforma } from "../dominio/permissoes";
import { texto } from "../util/validacao";
import { enviarAgora } from "../email/enviar";
import { esc, montar } from "../email/modelos";
import { MARCA_PLATAFORMA } from "./verificacao";
import type { Torcida } from "../dominio/tipos";

export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;

/** O que mostrar e falar no vídeo (o mesmo roteiro aparece no cadastro e no painel da equipe). */
export const ROTEIRO_VIDEO = [
  "Diga a data de hoje e: “Este vídeo é para o cadastro da (torcida) na Somos Organizada”.",
  "Diga seu nome completo, CPF e cargo, e mostre o documento com foto ao lado do rosto.",
  "Mostre a fachada da sede (com o nome ou o símbolo da torcida) e o espaço por dentro.",
  "Mostre pelo menos 2 testemunhas da diretoria ou do conselho: cada uma diz nome e cargo e mostra o documento com foto.",
  "Cada testemunha confirma em voz alta que você representa a torcida e pode criar a conta e receber os valores.",
  "Se tiver, mostre o estatuto, a ata da eleição da diretoria e o cartão do CNPJ.",
  "Termine dizendo: “Eu, (nome), declaro que as informações são verdadeiras e que represento a (torcida)”.",
];

/** Nome e cores escolhidos no cadastro: o e-mail já sai com a cara da torcida. */
export function marcaDaSolicitacao(sol: FirebaseFirestore.DocumentData): Torcida {
  return { ...MARCA_PLATAFORMA, nome: sol.nomeTorcida ?? MARCA_PLATAFORMA.nome, tema: { ...MARCA_PLATAFORMA.tema, ...(sol.tema ?? {}) } } as Torcida;
}

/** Cadastro em análise desta conta (o vídeo só existe para ele). */
async function minhaSolicitacao(uid: string) {
  const snap = await db.collection("solicitacoes").where("uid", "==", uid).where("status", "==", "pendente").limit(1).get();
  const doc = snap.docs[0];
  if (!doc) throw new HttpsError("failed-precondition", "Não encontramos um cadastro em análise nesta conta.");
  return doc;
}

export const registrarVideoVerificacao = onCall(async (req) => {
  const uid = exigirLogin(req);
  const caminho = texto((req.data as Record<string, unknown> | undefined)?.caminho, "vídeo", { max: 300 });
  const solDoc = await minhaSolicitacao(uid);
  const prefixo = `verificacoes/${uid}/${solDoc.id}/`;
  if (!caminho.startsWith(prefixo) || caminho.includes("..")) throw new HttpsError("invalid-argument", "Vídeo inválido. Envie de novo.");

  // Confere que o arquivo existe mesmo e é um vídeo (o site pode ter caído no meio do envio)
  const [meta] = await getStorage()
    .bucket()
    .file(caminho)
    .getMetadata()
    .catch(() => [null] as const);
  if (!meta) throw new HttpsError("failed-precondition", "Não encontramos o vídeo enviado. Envie de novo.");
  const tamanho = Number(meta.size ?? 0);
  if (!String(meta.contentType ?? "").startsWith("video/") || tamanho <= 0) throw new HttpsError("invalid-argument", "O arquivo enviado não é um vídeo.");
  if (tamanho > VIDEO_MAX_BYTES) throw new HttpsError("invalid-argument", "O vídeo passou de 500 MB. Grave de novo em qualidade menor.");

  const sol = await db.runTransaction(async (tx) => {
    const s = (await tx.get(solDoc.ref)).data()!;
    if (s.status !== "pendente") throw new HttpsError("failed-precondition", "Este cadastro já foi avaliado.");
    tx.update(solDoc.ref, {
      verificacao: {
        status: "enviado",
        videoPath: caminho,
        tamanho,
        tipo: meta.contentType,
        enviadoEm: FieldValue.serverTimestamp(),
        envios: (s.verificacao?.envios ?? 0) + 1,
      },
    });
    return s;
  });

  const m = montar(marcaDaSolicitacao(sol), "Recebemos o vídeo: o cadastro está em análise", { email: sol.email, nome: sol.responsavel?.nome }, {
    selo: "Cadastro em análise",
    titulo: "Recebemos o seu vídeo",
    paragrafos: [
      `O cadastro da <strong>${esc(sol.nomeTorcida)}</strong> está completo e foi para a análise da equipe Somos Organizada.`,
      "A equipe assiste ao vídeo, confere os dados e responde normalmente em até 1 dia útil. Você recebe outro e-mail com o resultado.",
    ],
    detalhes: [
      ["Torcida", esc(sol.nomeTorcida)],
      ["Endereço reservado", `somosorganizada.com.br/${esc(sol.slug)}`],
    ],
    botao: { texto: "Ver meu cadastro", url: `${URL_APP.value()}/cadastro` },
    rodape: "O vídeo fica guardado com acesso restrito, só como prova de quem fez o cadastro (prevenção à fraude). Ele não é publicado nem compartilhado.",
    conta: true,
  });
  await enviarAgora(m, `verificacao-video/${solDoc.id}/${caminho}`).catch((e) => logger.error("Falha ao enviar e-mail de vídeo recebido", { erro: String(e) }));
  return { status: "enviado" };
});

/** Equipe: pede um novo vídeo, com o motivo (o responsável vê no cadastro e recebe por e-mail). */
export const pedirNovoVideo = onCall(async (req) => {
  const quem = exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const id = texto(d.id, "solicitação", { max: 40 });
  const motivo = texto(d.motivo, "motivo", { min: 3, max: 500 });
  const ref = db.doc(`solicitacoes/${id}`);
  const sol = (await ref.get()).data();
  if (!sol) throw new HttpsError("not-found", "Solicitação não encontrada.");
  if (sol.status !== "pendente") throw new HttpsError("failed-precondition", "Esta solicitação já foi avaliada.");
  await ref.update({
    "verificacao.status": "refazer",
    "verificacao.motivoRefazer": motivo,
    "verificacao.pedidoPor": quem,
    "verificacao.pedidoEm": FieldValue.serverTimestamp(),
  });
  const m = montar(marcaDaSolicitacao(sol), "Precisamos de um novo vídeo para o cadastro", { email: sol.email, nome: sol.responsavel?.nome }, {
    selo: "Vídeo de verificação",
    titulo: "Falta pouco: grave o vídeo de novo",
    paragrafos: [`A equipe assistiu ao vídeo e pediu um ajuste: <strong>${esc(motivo)}</strong>`, "O resto do cadastro continua salvo. É só gravar e enviar o novo vídeo."],
    botao: { texto: "Enviar novo vídeo", url: `${URL_APP.value()}/cadastro` },
    conta: true,
  });
  await enviarAgora(m, `verificacao-refazer/${id}/${Date.now()}`).catch(() => undefined);
  return { ok: true };
});
