/**
 * Convite para o painel da torcida (diretoria, subsede, portaria), com a cara da torcida e sem a página genérica
 * do Google. O servidor cria um convite que vale 7 dias (só o resumo do código fica guardado), manda o e-mail pelo
 * nosso provedor com o botão para somosorganizada.com.br/convite e lá a pessoa vê o e-mail dela já preenchido,
 * cria a senha e entra. Como o link só chega a quem é dono do e-mail, o e-mail fica confirmado.
 */
import { createHash } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { ESCALA_PUBLICA, URL_APP } from "../config";
import { auth, db, refs, FieldValue, Timestamp } from "../util/firebase";
import { tokenAleatorio } from "../util/cripto";
import { texto } from "../util/validacao";
import { enviarAgora } from "../email/enviar";
import { esc, montar } from "../email/modelos";
import type { Torcida } from "../dominio/tipos";
import type { Papel } from "../dominio/permissoes";

const VALIDADE_MS = 7 * 24 * 3600_000;
const resumo = (token: string) => createHash("sha256").update(token).digest("hex");
const refConvite = (token: string) => db.doc(`convites/${resumo(token)}`);

const PAPEL_TEXTO: Record<Papel, string> = {
  diretoria: "da diretoria",
  subsede: "responsável pela subsede",
  portaria: "da portaria",
};

/** Cria o convite e manda o e-mail. Devolve se o e-mail saiu pelo nosso provedor. */
export async function enviarConvite(a: {
  tid: string;
  uid: string;
  email: string;
  nome: string;
  papel: Papel;
  sedeId?: string;
  convidadoPor: string;
  /** a pessoa ainda não tem senha (conta nova ou nunca entrou): convite com "criar senha" */
  precisaSenha: boolean;
}): Promise<boolean> {
  const torcida = (await refs.torcida(a.tid).get()).data() as Torcida | undefined;
  if (!torcida) return false;
  const [quem, sede] = await Promise.all([
    refs.membro(a.tid, a.convidadoPor).get().then((s) => (s.get("nome") as string | undefined) ?? null).catch(() => null),
    a.sedeId ? refs.sede(a.tid, a.sedeId).get().then((s) => (s.get("nome") as string | undefined) ?? null) : Promise.resolve(null),
  ]);
  const quemTexto = quem ? `${esc(quem)}, da diretoria da ${esc(torcida.nome)},` : `A diretoria da ${esc(torcida.nome)}`;
  const funcao = `${PAPEL_TEXTO[a.papel]}${a.papel === "subsede" && sede ? ` <strong>${esc(sede)}</strong>` : ""}`;
  const primeiro = a.nome.trim().split(/\s+/)[0] ?? "";
  const painel = `${URL_APP.value()}/${torcida.slug}/admin`;

  let url = painel;
  if (a.precisaSenha) {
    const token = tokenAleatorio(32);
    await refConvite(token).set({
      uid: a.uid,
      tid: a.tid,
      email: a.email,
      nome: a.nome,
      papel: a.papel,
      sedeId: a.sedeId ?? null,
      convidadoPor: a.convidadoPor,
      criadoEm: FieldValue.serverTimestamp(),
      expiraEm: Timestamp.fromMillis(Date.now() + VALIDADE_MS),
      usado: false,
    });
    url = `${URL_APP.value()}/convite?c=${encodeURIComponent(token)}`;
    // Só no emulador: os testes leem o link daqui (em produção ele existe apenas no e-mail do convidado)
    if (process.env.FUNCTIONS_EMULATOR === "true") await db.doc(`_emulador/convite-${a.uid}`).set({ url, token });
  }
  const m = montar(torcida, a.precisaSenha ? `Você foi convidado para o painel da ${torcida.nome}` : `Seu acesso ao painel da ${torcida.nome}`, { email: a.email, nome: a.nome }, {
    selo: "Convite",
    titulo: primeiro ? `${esc(primeiro)}, você foi convidado!` : "Você foi convidado!",
    paragrafos: [
      `${quemTexto} convidou você para fazer parte do painel da torcida como ${funcao}.`,
      a.precisaSenha
        ? "Toque no botão, crie a sua senha e pronto: você entra direto no painel. O seu e-mail já aparece preenchido."
        : "Você já tem conta na Somos Organizada: entre no painel com o seu e-mail e a senha de sempre.",
    ],
    botao: { texto: a.precisaSenha ? "Aceitar convite e criar senha" : "Abrir o painel", url },
    nota: a.precisaSenha ? "O convite vale por 7 dias. Se passar disso, peça um novo à diretoria." : undefined,
    rodape: "Se você não conhece esta torcida, ignore este e-mail: sem a senha, ninguém entra.",
    conta: true,
  });
  try {
    const r = await enviarAgora(m, `convite/${a.tid}/${a.uid}/${Date.now()}`);
    return !!r.provedor;
  } catch (e) {
    logger.error("Falha ao enviar convite", { tid: a.tid, uid: a.uid, erro: String(e) });
    return false;
  }
}

async function lerConvite(token: string) {
  const ref = refConvite(token);
  const c = (await ref.get()).data();
  if (!c) return { ref, c: null, motivo: "invalido" as const };
  if (c.usado) return { ref, c, motivo: "usado" as const };
  if ((c.expiraEm as Timestamp).toMillis() < Date.now()) return { ref, c, motivo: "expirado" as const };
  return { ref, c, motivo: null };
}

/** Página do convite: mostra para quem é, de qual torcida e com quais cores (sem login). */
export const verConvite = onCall(ESCALA_PUBLICA, async (req) => {
  const token = texto((req.data as Record<string, unknown> | undefined)?.c, "convite", { min: 20, max: 80 });
  const { c, motivo } = await lerConvite(token);
  if (!c) return { valido: false, motivo: "invalido" };
  const t = (await refs.torcida(c.tid).get()).data() as Torcida | undefined;
  const sede = c.sedeId ? ((await refs.sede(c.tid, c.sedeId).get()).get("nome") as string | undefined) : undefined;
  return {
    valido: !motivo,
    motivo: motivo ?? undefined,
    email: c.email as string,
    nome: c.nome as string,
    papel: c.papel as Papel,
    sedeNome: sede ?? null,
    torcida: t ? { nome: t.nome, slug: t.slug, tema: t.tema ?? null } : null,
  };
});

/** Cria a senha do convidado, confirma o e-mail e encerra o convite. Depois o site entra com e-mail e senha. */
export const aceitarConvite = onCall(ESCALA_PUBLICA, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const token = texto(d.c, "convite", { min: 20, max: 80 });
  const senha = typeof d.senha === "string" ? d.senha : "";
  if (senha.length < 8 || senha.length > 128) throw new HttpsError("invalid-argument", "A senha precisa ter pelo menos 8 caracteres.");
  const ref = refConvite(token);
  const c = await db.runTransaction(async (tx) => {
    const dados = (await tx.get(ref)).data();
    if (!dados) throw new HttpsError("not-found", "Este convite não existe. Peça um novo à diretoria.");
    if (dados.usado) throw new HttpsError("failed-precondition", "Este convite já foi usado. Entre com o seu e-mail e a senha que você criou.");
    if ((dados.expiraEm as Timestamp).toMillis() < Date.now()) throw new HttpsError("failed-precondition", "Este convite venceu. Peça um novo à diretoria.");
    tx.update(ref, { usado: true, usadoEm: FieldValue.serverTimestamp() });
    return dados;
  });
  await auth.updateUser(c.uid as string, { password: senha, emailVerified: true });
  const t = (await refs.torcida(c.tid as string).get()).data() as Torcida | undefined;
  return { email: c.email as string, slug: t?.slug ?? null };
});
