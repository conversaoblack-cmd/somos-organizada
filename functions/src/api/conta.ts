/**
 * Conta do torcedor (sócio ou só comprador de ingresso): entrar com CPF + senha.
 * O Firebase Auth trabalha com e-mail; aqui o CPF vira o e-mail da conta, mas o e-mail só é devolvido
 * depois de a senha ser conferida — assim ninguém descobre o e-mail de outra pessoa pelo CPF.
 * Tentativas erradas por CPF: 5 a cada 15 minutos.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { URL_APP, WEB_API_KEY } from "../config";
import { auth, db, FieldValue, Timestamp } from "../util/firebase";
import { cpfValido, soDigitos } from "../util/validacao";

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 15 * 60_000;
const refLoginCpf = (cpf: string) => db.doc(`loginCpf/${cpf}`);
const INCORRETO = "CPF ou senha incorretos. Se preferir, entre com o seu e-mail.";

/** Registra o CPF da conta (o primeiro que usar fica; sem efeito para login anônimo). */
export async function registrarCpfDaConta(uid: string, cpf: string, anonimo: boolean) {
  if (anonimo || !cpfValido(cpf)) return;
  await refLoginCpf(cpf)
    .create({ uid, criadoEm: Timestamp.now() })
    .catch(() => undefined); // já registrado
}

async function senhaConfere(email: string, senha: string): Promise<boolean> {
  const emulador = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const chave = emulador ? "chave-emulador" : WEB_API_KEY.value();
  if (!chave) throw new HttpsError("failed-precondition", "Entrar com CPF ainda não está disponível. Use o seu e-mail.");
  const base = emulador ? `http://${emulador}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
  const r = await fetch(`${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(chave)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Referer: URL_APP.value() },
    body: JSON.stringify({ email, password: senha, returnSecureToken: false }),
  });
  if (r.ok) return true;
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
  const msg = j.error?.message ?? "";
  if (/INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|USER_DISABLED/.test(msg)) return false;
  logger.error("Falha ao conferir senha no login por CPF", { status: r.status, msg });
  throw new HttpsError("unavailable", "Não foi possível entrar com CPF agora. Use o seu e-mail.");
}

export const entrarComCpf = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const cpf = soDigitos(d.cpf);
  const senha = typeof d.senha === "string" ? d.senha : "";
  if (!cpfValido(cpf) || !senha) throw new HttpsError("invalid-argument", INCORRETO);

  const ref = refLoginCpf(cpf);
  const dados = (await ref.get()).data() as { uid?: string; tentativas?: number; bloqueadoAte?: Timestamp } | undefined;
  if (!dados?.uid) throw new HttpsError("permission-denied", INCORRETO);
  if (dados.bloqueadoAte && dados.bloqueadoAte.toMillis() > Date.now()) {
    throw new HttpsError("resource-exhausted", "Muitas tentativas. Aguarde 15 minutos ou entre com o e-mail.");
  }
  const usuario = await auth.getUser(dados.uid).catch(() => null);
  if (!usuario?.email) throw new HttpsError("permission-denied", INCORRETO);

  if (!(await senhaConfere(usuario.email, senha))) {
    const tentativas = (dados.tentativas ?? 0) + 1;
    await ref.update(
      tentativas >= MAX_TENTATIVAS
        ? { tentativas: 0, bloqueadoAte: Timestamp.fromMillis(Date.now() + BLOQUEIO_MS) }
        : { tentativas },
    );
    throw new HttpsError("permission-denied", INCORRETO);
  }
  await ref.update({ tentativas: 0, bloqueadoAte: FieldValue.delete() });
  return { email: usuario.email };
});
