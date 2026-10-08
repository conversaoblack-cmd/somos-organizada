/**
 * Conta do torcedor (sócio ou só comprador de ingresso): entrar com CPF + senha.
 * O Firebase Auth trabalha com e-mail; aqui o CPF vira o e-mail da conta, mas o e-mail só é devolvido
 * depois de a senha ser conferida — assim ninguém descobre o e-mail de outra pessoa pelo CPF.
 * Tentativas erradas por CPF: 5 a cada 15 minutos.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { URL_APP, WEB_API_KEY, ESCALA_PUBLICA } from "../config";
import { auth, db, Timestamp } from "../util/firebase";
import { cpfValido, soDigitos } from "../util/validacao";

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 15 * 60_000;
const refLoginCpf = (cpf: string) => db.doc(`loginCpf/${cpf}`);
const INCORRETO = "CPF ou senha incorretos. Se preferir, entre com o seu e-mail.";

/**
 * Liga o CPF à conta. O CPF digitado na compra não é verificado, então ele não "pertence" a ninguém: guardamos
 * até 5 contas por CPF e, no login, a senha é conferida em cada uma. Assim, se outra pessoa usar o seu CPF numa
 * compra, o seu login com CPF continua funcionando (sem efeito para login anônimo).
 */
const MAX_CONTAS_POR_CPF = 5;
/** Chamado quando um pedido é PAGO: ligar um CPF a uma conta custa uma compra, não só um pedido em aberto. */
export async function registrarCpfDoPagamento(uid: string, cpf: string) {
  const u = await auth.getUser(uid).catch(() => null);
  await registrarCpfDaConta(uid, cpf, !u?.email || u.providerData.length === 0);
}

export async function registrarCpfDaConta(uid: string, cpf: string, anonimo: boolean) {
  if (anonimo || !cpfValido(cpf)) return;
  const ref = refLoginCpf(cpf);
  await db
    .runTransaction(async (tx) => {
      const d = (await tx.get(ref)).data() as { uids?: string[]; uid?: string } | undefined;
      const uids = [...new Set([...(d?.uids ?? []), ...(d?.uid ? [d.uid] : [])])];
      if (uids.includes(uid) || uids.length >= MAX_CONTAS_POR_CPF) return;
      tx.set(ref, { uids: [...uids, uid], atualizadoEm: Timestamp.now() }, { merge: true });
    })
    .catch(() => undefined);
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

export const entrarComCpf = onCall(ESCALA_PUBLICA, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const cpf = soDigitos(d.cpf);
  const senha = typeof d.senha === "string" ? d.senha : "";
  if (!cpfValido(cpf) || !senha) throw new HttpsError("invalid-argument", INCORRETO);

  // Reserva a tentativa ANTES de conferir a senha, numa transação: pedidos em paralelo não furam o limite.
  const ref = refLoginCpf(cpf);
  const uids = await db.runTransaction(async (tx) => {
    const dados = (await tx.get(ref)).data() as { uids?: string[]; uid?: string; tentativas?: number; janelaAte?: Timestamp } | undefined;
    const lista = [...new Set([...(dados?.uids ?? []), ...(dados?.uid ? [dados.uid] : [])])];
    if (!lista.length) return null;
    const agora = Date.now();
    const janelaAberta = !!dados?.janelaAte && dados.janelaAte.toMillis() > agora;
    const tentativas = janelaAberta ? dados?.tentativas ?? 0 : 0;
    if (tentativas >= MAX_TENTATIVAS) return "bloqueado" as const;
    tx.update(ref, { tentativas: tentativas + 1, janelaAte: janelaAberta ? dados!.janelaAte : Timestamp.fromMillis(agora + BLOQUEIO_MS) });
    return lista;
  });
  if (uids === null) throw new HttpsError("permission-denied", INCORRETO);
  if (uids === "bloqueado") throw new HttpsError("resource-exhausted", "Muitas tentativas. Aguarde 15 minutos ou entre com o e-mail.");

  const emails = [...new Set((await Promise.all(uids.map((u) => auth.getUser(u).catch(() => null)))).map((u) => u?.email).filter((e): e is string => !!e))];
  for (const email of emails) {
    // O contador não zera no acerto: ele é do CPF (compartilhado pelas contas ligadas a ele) e só expira com o tempo.
    if (await senhaConfere(email, senha)) return { email };
  }
  throw new HttpsError("permission-denied", INCORRETO);
});
