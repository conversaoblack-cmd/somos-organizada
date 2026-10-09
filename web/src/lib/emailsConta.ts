/**
 * E-mails de conta do Firebase Auth (confirmar e-mail, redefinir senha) com link de volta para o site.
 * O link de volta só funciona se o domínio estiver em Authentication → Configurações → Domínios autorizados.
 * Se não estiver (projeto novo, domínio novo), o e-mail sai mesmo assim, sem o botão de voltar, e o erro
 * fica registrado para a equipe corrigir: o cadastro nunca trava por isso.
 */
import { sendEmailVerification, sendPasswordResetEmail, type User } from "firebase/auth";
import { auth } from "./firebase";
import { registrarErro } from "./erros";
import { api, ehErroDeConexao } from "./api";

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

/**
 * Confirmação de e-mail: primeiro pelo nosso e-mail (Brevo, com a identidade da torcida ou da plataforma e link
 * para /verificar, que continua o cadastro na mesma aba). Se o servidor não tiver provedor de e-mail ou falhar
 * por motivo interno, cai no e-mail padrão do Firebase. Limite de reenvio e falta de internet viram mensagem.
 */
export async function enviarConfirmacaoEmail(usuario: User, url: string) {
  const destino = new URL(url, location.origin);
  try {
    const r = await api.enviarConfirmacaoEmail({ continuar: destino.pathname + destino.search });
    if (r.enviado) return;
  } catch (e) {
    const codigo = String((e as { code?: string })?.code ?? "");
    if (/resource-exhausted/.test(codigo) || ehErroDeConexao(e)) throw e;
    registrarErro(e, "confirmacao-email-propria");
  }
  await comVolta((comLink) => (comLink ? sendEmailVerification(usuario, { url: destino.href }) : sendEmailVerification(usuario)));
}

/** Avisa as outras abas abertas (ex.: a do cadastro) que o e-mail foi confirmado, para continuarem na hora. */
export const CANAL_CONTA = "somos-organizada-conta";
export function avisarEmailConfirmado() {
  try {
    const c = new BroadcastChannel(CANAL_CONTA);
    c.postMessage("email-confirmado");
    c.close();
  } catch {
    /* navegador sem BroadcastChannel: a aba do cadastro confere sozinha a cada 5 s */
  }
}

/**
 * Esqueci minha senha: o servidor manda o nosso e-mail (cores da torcida, botão para /redefinir-senha) e, sem
 * provedor, ele mesmo cai no e-mail do Firebase. Se a chamada falhar por motivo interno (ex.: versão antiga do
 * servidor), o site pede o e-mail padrão do Firebase. Sem internet e excesso de pedidos viram mensagem.
 */
export async function enviarRedefinicaoSenha(email: string, url: string, tid?: string | null) {
  const destino = new URL(url, location.origin);
  try {
    await api.redefinirSenhaPorEmail({ email, continuar: destino.pathname, ...(tid ? { tid } : {}) });
    return;
  } catch (e) {
    const codigo = String((e as { code?: string })?.code ?? "");
    if (/resource-exhausted|invalid-argument/.test(codigo) || ehErroDeConexao(e)) throw e;
    registrarErro(e, "redefinicao-senha-propria");
  }
  await comVolta((comLink) => (comLink ? sendPasswordResetEmail(auth, email, { url: destino.href }) : sendPasswordResetEmail(auth, email)));
}
