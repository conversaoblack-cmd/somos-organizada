/**
 * Conta do torcedor (sócio ou só comprador de ingresso): entrar com CPF + senha.
 * O Firebase Auth trabalha com e-mail; aqui o CPF vira o e-mail da conta, mas o e-mail só é devolvido
 * depois de a senha ser conferida — assim ninguém descobre o e-mail de outra pessoa pelo CPF.
 * Tentativas erradas por CPF: 5 a cada 15 minutos.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { URL_APP, WEB_API_KEY, ESCALA_PUBLICA } from "../config";
import { auth, db, refs, Timestamp } from "../util/firebase";
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
    if (await senhaConfere(email, senha)) {
      // Acertou: devolve só a tentativa que acabou de usar (o contador não zera, porque é do CPF e outras contas
      // podem estar ligadas a ele). Assim o sócio que entra em dois celulares não fica bloqueado por isso;
      // quem tenta adivinhar nunca acerta, então não ganha tentativas.
      await db
        .runTransaction(async (tx) => {
          const t = ((await tx.get(ref)).get("tentativas") as number | undefined) ?? 0;
          if (t > 0) tx.update(ref, { tentativas: t - 1 });
        })
        .catch(() => undefined);
      return { email };
    }
  }
  throw new HttpsError("permission-denied", INCORRETO);
});

/**
 * "ra***@g***.com": mostra só o começo do e-mail, para a pessoa reconhecer para onde foi o link
 * sem entregar o e-mail inteiro de quem tem aquele CPF.
 */
export function mascararEmail(email: string): string {
  const [local = "", dominio = ""] = email.trim().toLowerCase().split("@");
  if (!local || !dominio) return "***";
  const [nome = "", ...resto] = dominio.split(".");
  const inicio = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${inicio}***@${nome.slice(0, 1)}***${resto.length ? `.${resto.join(".")}` : ""}`;
}

type ResultadoEnvio = "enviado" | "sem_conta" | "limite";

/** Pede ao Firebase Auth o e-mail padrão de "redefinir senha" (o mesmo que o site manda quando a pessoa digita o e-mail). */
async function enviarLinkRedefinicao(email: string, continueUrl: string | null): Promise<ResultadoEnvio> {
  const emulador = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const chave = emulador ? "chave-emulador" : WEB_API_KEY.value();
  if (!chave) throw new HttpsError("failed-precondition", "Para receber o link, digite o seu e-mail no lugar do CPF.");
  const base = emulador ? `http://${emulador}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
  const pedir = (comVolta: boolean) =>
    fetch(`${base}/v1/accounts:sendOobCode?key=${encodeURIComponent(chave)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: URL_APP.value(), "X-Firebase-Locale": "pt-BR" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email, ...(comVolta && continueUrl ? { continueUrl } : {}) }),
    });
  let r = await pedir(true);
  let msg = r.ok ? "" : (((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "");
  // Domínio do link de volta não autorizado no Auth: o e-mail sai mesmo assim, só sem o botão de voltar ao site
  if (!r.ok && continueUrl && /UNAUTHORIZED_DOMAIN|INVALID_CONTINUE_URI|UNAUTHORIZED_CONTINUE_URI/.test(msg)) {
    logger.warn("Link de volta não autorizado no e-mail de redefinição por CPF", { msg });
    r = await pedir(false);
    msg = r.ok ? "" : (((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "");
  }
  if (r.ok) return "enviado";
  if (/EMAIL_NOT_FOUND|USER_DISABLED/.test(msg)) return "sem_conta";
  if (/TOO_MANY_ATTEMPTS|RESET_PASSWORD_EXCEED_LIMIT|QUOTA_EXCEEDED/.test(msg)) return "limite";
  logger.error("Falha ao pedir e-mail de redefinição por CPF", { status: r.status, msg });
  throw new HttpsError("unavailable", "Não foi possível enviar o link agora. Tente de novo em instantes.");
}

/** Contas desta torcida ligadas ao CPF: o sócio (ficha) e quem comprou com esse CPF e tem pedido aqui. */
async function contasDoCpf(tid: string, cpf: string, uidsLogin: string[]): Promise<string[]> {
  const doSocio = tid ? ((await refs.cpf(tid, cpf).get().catch(() => null))?.get("uid") as string | undefined) : undefined;
  const naTorcida = tid
    ? (
        await Promise.all(
          uidsLogin.map(async (u) => ((await refs.pedidos(tid).where("uid", "==", u).limit(1).get().catch(() => null))?.empty === false ? u : null)),
        )
      ).filter((u): u is string => !!u)
    : [];
  const daTorcida = [...new Set([...(doSocio ? [doSocio] : []), ...naTorcida])];
  // O login por CPF vale em qualquer torcida: se nenhuma conta tem ligação com esta, vale a conta ligada ao CPF.
  return daTorcida.length ? daTorcida : uidsLogin;
}

/**
 * "Esqueci minha senha" para quem entra com CPF: manda o link de redefinir para o e-mail da conta.
 * Resposta sempre igual ({ enviado: true }), com ou sem conta, e sem mostrar o e-mail (nem mascarado), para
 * ninguém descobrir quem tem cadastro digitando CPFs. Conta no mesmo limite do login por CPF.
 */
export const redefinirSenhaPorCpf = onCall(ESCALA_PUBLICA, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const cpf = soDigitos(d.cpf);
  const tid = typeof d.tid === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(d.tid) ? d.tid : "";
  if (!cpfValido(cpf)) throw new HttpsError("invalid-argument", "CPF inválido. Confira os 11 números.");

  // Mesmo contador do login por CPF (5 a cada 15 minutos), reservado antes de qualquer envio.
  const ref = refLoginCpf(cpf);
  const uidsLogin = await db.runTransaction(async (tx) => {
    const dados = (await tx.get(ref)).data() as { uids?: string[]; uid?: string; tentativas?: number; janelaAte?: Timestamp } | undefined;
    const agora = Date.now();
    const janelaAberta = !!dados?.janelaAte && dados.janelaAte.toMillis() > agora;
    const tentativas = janelaAberta ? dados?.tentativas ?? 0 : 0;
    if (tentativas >= MAX_TENTATIVAS) return "bloqueado" as const;
    tx.set(ref, { tentativas: tentativas + 1, janelaAte: janelaAberta ? dados!.janelaAte : Timestamp.fromMillis(agora + BLOQUEIO_MS) }, { merge: true });
    return [...new Set([...(dados?.uids ?? []), ...(dados?.uid ? [dados.uid] : [])])];
  });
  if (uidsLogin === "bloqueado") throw new HttpsError("resource-exhausted", "Muitas tentativas. Aguarde 15 minutos ou use o seu e-mail.");

  const uids = await contasDoCpf(tid, cpf, uidsLogin);
  const usuarios = await Promise.all(uids.map((u) => auth.getUser(u).catch(() => null)));
  const emails = [...new Set(usuarios.filter((u) => u && !u.disabled && u.providerData.length > 0).map((u) => u!.email).filter((e): e is string => !!e))];
  if (!emails.length) return { enviado: true };

  const slug = tid ? ((await refs.torcida(tid).get().catch(() => null))?.get("slug") as string | undefined) : undefined;
  const continueUrl = slug ? `${URL_APP.value().replace(/\/+$/, "")}/${slug}/conta` : null;
  const resultados = await Promise.all(emails.map((e) => enviarLinkRedefinicao(e, continueUrl)));
  if (resultados.every((r) => r === "limite")) {
    throw new HttpsError("resource-exhausted", "Muitos pedidos de link seguidos. Aguarde alguns minutos e confira o seu e-mail.");
  }
  // Mesma resposta com ou sem conta: não confirmamos a ninguém que um CPF é sócio ou comprou ingresso desta torcida.
  return { enviado: true };
});
