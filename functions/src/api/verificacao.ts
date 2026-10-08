/**
 * Confirmação de e-mail com a nossa cara, sem a página genérica do Google.
 * O Firebase gera o código de confirmação (oobCode); o e-mail sai pelo nosso provedor (Brevo/Resend) com o
 * botão para somosorganizada.com.br/verificar, que confirma o código e continua o cadastro naquela mesma aba.
 * Sem provedor de e-mail configurado, responde { enviado: false } e o site usa o e-mail padrão do Firebase.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { EMAIL_API_KEY, URL_APP } from "../config";
import { auth, db, refs, FieldValue } from "../util/firebase";
import { exigirLogin } from "../dominio/permissoes";
import { enviarAgora } from "../email/enviar";
import { esc, montar } from "../email/modelos";
import type { Torcida } from "../dominio/tipos";

const ESPERA_REENVIO_MS = 45_000;

/** Para onde voltar depois de confirmar: só caminhos deste site (nada de redirecionar para fora). */
export function caminhoSeguro(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\/[A-Za-z0-9/_?=&.-]{0,120}$/.test(s) && !s.startsWith("//") ? s : "/cadastro";
}

/** Tira o oobCode do link gerado pelo Firebase (o resto do link é a página padrão do Google, que não usamos). */
export function codigoDoLink(link: string): string | null {
  try {
    return new URL(link).searchParams.get("oobCode");
  } catch {
    return null;
  }
}

const MARCA_PLATAFORMA = {
  nome: "Somos Organizada",
  tema: { corPrimaria: "#2E6BFF", corSecundaria: "#FFCC00", corFundo: "#070A12", corTexto: "#F1F4FA" },
} as unknown as Torcida;

export const enviarConfirmacaoEmail = onCall({ secrets: [EMAIL_API_KEY] }, async (req) => {
  const uid = exigirLogin(req);
  const email = String(req.auth?.token.email ?? "").toLowerCase();
  if (!email) throw new HttpsError("failed-precondition", "Esta conta não tem e-mail.");
  if (req.auth?.token.email_verified) return { enviado: true, jaConfirmado: true };
  const d = (req.data ?? {}) as Record<string, unknown>;
  const continuar = caminhoSeguro(d.continuar);

  // Reenvio com intervalo: protege a cota de e-mails e evita vários links válidos ao mesmo tempo
  const controle = db.doc(`usuarios/${uid}/privado/confirmacaoEmail`);
  await db.runTransaction(async (tx) => {
    const ultimo = (await tx.get(controle)).get("ultimoEnvio")?.toMillis?.() ?? 0;
    if (Date.now() - ultimo < ESPERA_REENVIO_MS) {
      throw new HttpsError("resource-exhausted", "Acabamos de enviar. Espere alguns segundos para pedir de novo.");
    }
    tx.set(controle, { ultimoEnvio: FieldValue.serverTimestamp() }, { merge: true });
  });

  // E-mail com a identidade da torcida quando o cadastro é feito no site dela (/{torcida}/...)
  let marca = MARCA_PLATAFORMA;
  const slug = /^\/([a-z0-9-]{3,40})\//.exec(continuar)?.[1];
  if (slug && !["cadastro", "entrar", "plataforma"].includes(slug)) {
    const tid = (await refs.slug(slug).get()).get("torcidaId") as string | undefined;
    const t = tid ? ((await refs.torcida(tid).get()).data() as Torcida | undefined) : undefined;
    if (t) marca = t;
  }

  let codigo: string | null = null;
  try {
    codigo = codigoDoLink(await auth.generateEmailVerificationLink(email));
  } catch (e) {
    logger.error("Falha ao gerar link de confirmação", { uid, erro: String(e) });
  }
  if (!codigo) return { enviado: false };

  const usuario = await auth.getUser(uid).catch(() => null);
  const primeiroNome = (usuario?.displayName ?? "").trim().split(/\s+/)[0];
  const url = `${URL_APP.value()}/verificar?oobCode=${encodeURIComponent(codigo)}&continuar=${encodeURIComponent(continuar)}`;
  const m = montar(marca, "Confirme seu e-mail para continuar", { email, nome: usuario?.displayName ?? undefined }, {
    selo: "Confirmação de e-mail",
    titulo: primeiroNome ? `Falta só confirmar, ${esc(primeiroNome)}!` : "Falta só confirmar seu e-mail",
    paragrafos: [
      marca === MARCA_PLATAFORMA
        ? "Toque no botão abaixo para confirmar que este e-mail é seu. Você volta direto para o cadastro da sua torcida, de onde parou."
        : `Toque no botão abaixo para confirmar que este e-mail é seu e continuar no site da ${esc(marca.nome)}.`,
    ],
    botao: { texto: "Confirmar meu e-mail", url },
    nota: "Pode abrir no celular ou no computador. Se a página do cadastro ainda estiver aberta, ela continua sozinha.",
    rodape: "Se não foi você que pediu, ignore este e-mail: nada acontece sem a confirmação.",
    conta: true,
  });
  try {
    const r = await enviarAgora(m, `confirmacao/${uid}/${Date.now()}`);
    return { enviado: !!r.provedor };
  } catch (e) {
    logger.error("Falha ao enviar confirmação de e-mail", { uid, erro: String(e) });
    return { enviado: false };
  }
});
