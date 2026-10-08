/**
 * E-mails de conta do Firebase Auth (confirmar e-mail, redefinir senha) com link de volta para o site.
 * O link de volta só funciona se o domínio estiver em Authentication → Configurações → Domínios autorizados.
 * Se não estiver (projeto novo, domínio novo), o e-mail sai mesmo assim, sem o botão de voltar, e o erro
 * fica registrado para a equipe corrigir: o cadastro nunca trava por isso.
 */
import { sendEmailVerification, sendPasswordResetEmail, type User } from "firebase/auth";
import { auth } from "./firebase";
import { registrarErro } from "./erros";

const DOMINIO_NAO_AUTORIZADO = /auth\/(unauthorized-continue-uri|invalid-continue-uri|unauthorized-domain)/;

async function comVolta(enviar: (comLink: boolean) => Promise<void>) {
  try {
    await enviar(true);
  } catch (e) {
    const codigo = String((e as { code?: string })?.code ?? (e as Error)?.message ?? "");
    if (!DOMINIO_NAO_AUTORIZADO.test(codigo)) throw e;
    registrarErro(new Error(`Domínio ${location.hostname} não autorizado no Firebase Auth (${codigo}): e-mail enviado sem link de volta`), "auth-dominio");
    await enviar(false);
  }
}

export const enviarConfirmacaoEmail = (usuario: User, url: string) =>
  comVolta((comLink) => (comLink ? sendEmailVerification(usuario, { url }) : sendEmailVerification(usuario)));

export const enviarRedefinicaoSenha = (email: string, url: string) =>
  comVolta((comLink) => (comLink ? sendPasswordResetEmail(auth, email, { url }) : sendPasswordResetEmail(auth, email)));
