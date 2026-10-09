/**
 * "Esqueci minha senha" com a nossa cara, para todas as contas (sócio, comprador, diretoria, subsede, portaria,
 * equipe). O Firebase gera o código (oobCode); o e-mail sai pelo nosso provedor, nas cores da torcida quando o pedido
 * vem do site dela, com botão para somosorganizada.com.br/redefinir-senha (a pessoa cria a senha ali e já entra).
 * Sem provedor de e-mail (ou se ele falhar), cai no e-mail padrão do Firebase: a pessoa nunca fica sem o link.
 * A resposta é a mesma com ou sem conta: não revelamos quem tem cadastro.
 */
import { createHash } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { ESCALA_PUBLICA, URL_APP, WEB_API_KEY } from "../config";
import { auth, db, refs, FieldValue, Timestamp } from "../util/firebase";
import { emailValido } from "../util/validacao";
import { enviarAgora } from "../email/enviar";
import { esc, montar } from "../email/modelos";
import { caminhoSeguro, codigoDoLink, MARCA_PLATAFORMA } from "./verificacao";
import type { Torcida } from "../dominio/tipos";

export type ResultadoEnvio = "enviado" | "sem_conta" | "limite";

const INTERVALO_MS = 45_000;
const MAX_POR_HORA = 5;

/** Até 5 links por hora por e-mail, com 45 s entre eles (cota de e-mail e nada de vários links valendo). */
async function reservarEnvio(email: string): Promise<boolean> {
  const ref = db.doc(`redefinicoesSenha/${createHash("sha256").update(email).digest("hex")}`);
  return db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() as { ultimo?: Timestamp; janelaAte?: Timestamp; qtd?: number } | undefined;
    const agora = Date.now();
    if (d?.ultimo && agora - d.ultimo.toMillis() < INTERVALO_MS) return false;
    const janelaAberta = !!d?.janelaAte && d.janelaAte.toMillis() > agora;
    const qtd = janelaAberta ? d?.qtd ?? 0 : 0;
    if (qtd >= MAX_POR_HORA) return false;
    tx.set(ref, { ultimo: FieldValue.serverTimestamp(), qtd: qtd + 1, janelaAte: janelaAberta ? d!.janelaAte : Timestamp.fromMillis(agora + 3600_000) });
    return true;
  });
}

/** Torcida pelo endereço de volta (/{torcida}/...): o e-mail sai com o nome e as cores dela. */
async function marcaDoCaminho(continuar: string, tid?: string | null): Promise<Torcida> {
  if (tid) {
    const t = (await refs.torcida(tid).get().catch(() => null))?.data() as Torcida | undefined;
    if (t) return t;
  }
  const slug = /^\/([a-z0-9-]{3,40})(\/|$)/.exec(continuar)?.[1];
  if (!slug) return MARCA_PLATAFORMA;
  const id = (await refs.slug(slug).get().catch(() => null))?.get("torcidaId") as string | undefined;
  const t = id ? ((await refs.torcida(id).get().catch(() => null))?.data() as Torcida | undefined) : undefined;
  return t ?? MARCA_PLATAFORMA;
}

/** Reserva: e-mail padrão do Firebase (o mesmo de antes). Usado só quando o nosso provedor não manda. */
async function enviarPeloFirebase(email: string, continuar: string): Promise<ResultadoEnvio> {
  const emulador = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const chave = emulador ? "chave-emulador" : WEB_API_KEY.value();
  if (!chave) throw new HttpsError("unavailable", "Não foi possível enviar o link agora. Tente de novo em instantes.");
  const base = emulador ? `http://${emulador}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
  const continueUrl = `${URL_APP.value().replace(/\/+$/, "")}${continuar}`;
  const pedir = (comVolta: boolean) =>
    fetch(`${base}/v1/accounts:sendOobCode?key=${encodeURIComponent(chave)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: URL_APP.value(), "X-Firebase-Locale": "pt-BR" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email, ...(comVolta ? { continueUrl } : {}) }),
    });
  let r = await pedir(true);
  let msg = r.ok ? "" : (((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "");
  // Domínio do link de volta não autorizado no Auth: o e-mail sai mesmo assim, só sem o botão de voltar ao site
  if (!r.ok && /UNAUTHORIZED_DOMAIN|INVALID_CONTINUE_URI|UNAUTHORIZED_CONTINUE_URI/.test(msg)) {
    logger.warn("Link de volta não autorizado no e-mail de redefinição", { msg });
    r = await pedir(false);
    msg = r.ok ? "" : (((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "");
  }
  if (r.ok) return "enviado";
  if (/EMAIL_NOT_FOUND|USER_DISABLED/.test(msg)) return "sem_conta";
  if (/TOO_MANY_ATTEMPTS|RESET_PASSWORD_EXCEED_LIMIT|QUOTA_EXCEEDED/.test(msg)) return "limite";
  logger.error("Falha ao pedir e-mail de redefinição ao Firebase", { status: r.status, msg });
  throw new HttpsError("unavailable", "Não foi possível enviar o link agora. Tente de novo em instantes.");
}

/** Manda o link de nova senha para um e-mail (se houver conta). Usado pelo e-mail e pelo CPF. */
export async function enviarLinkRedefinicao(email: string, opcoes: { continuar: string; tid?: string | null }): Promise<ResultadoEnvio> {
  const usuario = await auth.getUserByEmail(email).catch(() => null);
  if (!usuario || usuario.disabled) return "sem_conta";
  if (!(await reservarEnvio(email))) return "limite";
  const continuar = caminhoSeguro(opcoes.continuar);

  let codigo: string | null = null;
  try {
    codigo = codigoDoLink(await auth.generatePasswordResetLink(email));
  } catch (e) {
    logger.error("Falha ao gerar link de nova senha", { erro: String(e) });
  }
  if (codigo) {
    const marca = await marcaDoCaminho(continuar, opcoes.tid);
    const daTorcida = marca !== MARCA_PLATAFORMA;
    const url = `${URL_APP.value().replace(/\/+$/, "")}/redefinir-senha?oobCode=${encodeURIComponent(codigo)}&continuar=${encodeURIComponent(continuar)}`;
    if (process.env.FUNCTIONS_EMULATOR === "true") await db.doc(`_emulador/senha-${usuario.uid}`).set({ url, codigo, continuar, email });
    const primeiro = (usuario.displayName ?? "").trim().split(/\s+/)[0];
    const m = montar(marca, daTorcida ? `Nova senha da sua conta na ${marca.nome}` : "Nova senha da sua conta na Somos Organizada", { email, nome: usuario.displayName ?? undefined }, {
      selo: "Senha",
      titulo: primeiro ? `${esc(primeiro)}, vamos criar uma nova senha` : "Vamos criar uma nova senha",
      paragrafos: [
        daTorcida
          ? `Recebemos um pedido para trocar a senha da sua conta no site da ${esc(marca.nome)}.`
          : "Recebemos um pedido para trocar a senha da sua conta na Somos Organizada.",
        "Toque no botão, escolha a nova senha e pronto: você já entra na sua conta.",
      ],
      botao: { texto: "Criar nova senha", url },
      nota: "O link vale por 1 hora e funciona uma vez só. Se passar disso, peça outro na tela de entrar.",
      rodape: "Não pediu? Ignore este e-mail: a sua senha continua a mesma.",
      conta: true,
    });
    try {
      const r = await enviarAgora(m, `senha/${usuario.uid}/${Date.now()}`);
      if (r.provedor) return "enviado";
    } catch (e) {
      logger.error("Falha ao enviar e-mail de nova senha pelo provedor", { erro: String(e) });
    }
  }
  return enviarPeloFirebase(email, continuar);
}

/** "Esqueci minha senha" com e-mail (o CPF continua em conta.ts, com o limite próprio). */
export const redefinirSenhaPorEmail = onCall(ESCALA_PUBLICA, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const email = typeof d.email === "string" ? d.email.trim().toLowerCase().slice(0, 120) : "";
  if (!emailValido(email)) throw new HttpsError("invalid-argument", "Digite um e-mail válido.");
  const tid = typeof d.tid === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(d.tid) ? d.tid : null;
  const r = await enviarLinkRedefinicao(email, { continuar: typeof d.continuar === "string" ? d.continuar : "/entrar", tid });
  if (r === "limite") throw new HttpsError("resource-exhausted", "Acabamos de enviar um link. Espere um minuto e confira o seu e-mail (e o spam).");
  // Mesma resposta com ou sem conta
  return { enviado: true };
});
