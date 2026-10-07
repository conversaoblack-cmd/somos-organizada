import { onCall, HttpsError } from "firebase-functions/v2/https";
import { MASTER_KEY, URL_APP } from "../config";
import { auth, db, refs, FieldValue } from "../util/firebase";
import { cifrar, tokenAleatorio } from "../util/cripto";
import { emailValido, texto, umDe } from "../util/validacao";
import { exigirMembro, type Membro, type Papel } from "../dominio/permissoes";
import { Pagarme, PagarmeErro } from "../pagarme/cliente";
import type { PrivadoPagarme } from "../pagarme/credenciais";

export function urlWebhook(tid: string, token: string): string {
  return `${URL_APP.value().replace(/\/$/, "")}/api/pagarme/webhook/${tid}/${token}`;
}

/**
 * Passo final do assistente "Conectar Pagar.me": a diretoria cola as chaves da conta
 * da própria torcida. Validamos na API, ciframos e devolvemos a URL de webhook.
 */
export const salvarCredenciaisPagarme = onCall({ secrets: [MASTER_KEY] }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const membro = await exigirMembro(req, tid, ["diretoria"]);
  const sk = texto(d.chaveSecreta, "chave secreta", { min: 10, max: 200 });
  const pk = texto(d.chavePublica, "chave pública", { min: 10, max: 200 });
  if (!sk.startsWith("sk_")) throw new HttpsError("invalid-argument", "A chave secreta começa com sk_. Confira se não copiou a chave pública.");
  if (!pk.startsWith("pk_")) throw new HttpsError("invalid-argument", "A chave pública começa com pk_.");
  if (sk.startsWith("sk_test_") !== pk.startsWith("pk_test_")) {
    throw new HttpsError("invalid-argument", "As duas chaves precisam ser do mesmo ambiente (as duas de teste ou as duas de produção).");
  }
  const pix = d.pix !== false;
  const cartao = d.cartao !== false;
  if (!pix && !cartao) throw new HttpsError("invalid-argument", "Ative ao menos uma forma de pagamento.");
  const descritorFatura = texto(d.descritorFatura, "nome na fatura", { max: 13, obrigatorio: false }) || undefined;

  const cliente = new Pagarme(sk);
  try {
    await cliente.testar();
  } catch (e) {
    if (e instanceof PagarmeErro && (e.status === 401 || e.status === 403)) {
      throw new HttpsError("invalid-argument", "A Pagar.me recusou esta chave secreta. Copie novamente no painel da Pagar.me.");
    }
    throw new HttpsError("unavailable", "Não foi possível falar com a Pagar.me agora. Tente em alguns minutos.");
  }

  const privRef = refs.privadoPagarme(tid);
  const atual = (await privRef.get()).data() as PrivadoPagarme | undefined;
  const webhookToken = atual?.webhookToken ?? tokenAleatorio(24);
  await privRef.set({
    skCifrada: cifrar(sk, MASTER_KEY.value()),
    webhookToken,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPor: membro.uid,
  });
  await refs.torcida(tid).update({
    "pagamentos.configurado": true,
    "pagamentos.ambiente": cliente.ambiente,
    "pagamentos.chavePublica": pk,
    "pagamentos.pix": pix,
    "pagamentos.cartao": cartao,
    "pagamentos.descritorFatura": descritorFatura ?? FieldValue.delete(),
    "pagamentos.configuradoEm": FieldValue.serverTimestamp(),
  });
  return { ambiente: cliente.ambiente, webhookUrl: urlWebhook(tid, webhookToken) };
});

export const obterWebhookUrl = onCall(async (req) => {
  const tid = texto((req.data ?? {}).tid, "torcida", { max: 40 });
  await exigirMembro(req, tid, ["diretoria"]);
  const priv = (await refs.privadoPagarme(tid).get()).data() as PrivadoPagarme | undefined;
  if (!priv?.webhookToken) return { webhookUrl: null };
  return { webhookUrl: urlWebhook(tid, priv.webhookToken) };
});

/** Cria (ou reaproveita) a conta do usuário e dá acesso ao painel. Devolve link para definir senha. */
export async function concederAcesso(args: {
  tid: string;
  email: string;
  nome: string;
  papel: Papel;
  sedeId?: string;
  convidadoPor: string;
}) {
  const { tid, email, nome, papel, sedeId, convidadoPor } = args;
  let usuario;
  try {
    usuario = await auth.getUserByEmail(email);
  } catch {
    usuario = await auth.createUser({ email, displayName: nome, password: tokenAleatorio(18) });
  }
  const membro: Membro & Record<string, unknown> = {
    uid: usuario.uid,
    email,
    nome,
    papel,
    sedeId: sedeId ?? undefined,
    ativo: true,
    convidadoPor,
    criadoEm: FieldValue.serverTimestamp(),
  };
  await refs.membro(tid, usuario.uid).set(membro, { merge: true });
  await db.doc(`usuarios/${usuario.uid}/acessos/${tid}`).set({ papel, sedeId: sedeId ?? null, ativo: true });
  const link = await auth.generatePasswordResetLink(email, { url: `${URL_APP.value()}/entrar` });
  return { uid: usuario.uid, linkDefinirSenha: link };
}

export const convidarMembro = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const quem = await exigirMembro(req, tid, ["diretoria"]);
  const email = texto(d.email, "e-mail", { max: 64 }).toLowerCase();
  if (!emailValido(email)) throw new HttpsError("invalid-argument", "E-mail inválido.");
  const nome = texto(d.nome, "nome", { min: 2, max: 64 });
  const papel = umDe(d.papel, "papel", ["diretoria", "subsede", "portaria"] as const);
  const sedeId = texto(d.sedeId, "sede", { max: 40, obrigatorio: false }) || undefined;
  if (papel === "subsede" && !sedeId) throw new HttpsError("invalid-argument", "Escolha a subsede deste usuário.");
  if (sedeId && !(await refs.sede(tid, sedeId).get()).exists) throw new HttpsError("invalid-argument", "Sede inválida.");
  return concederAcesso({ tid, email, nome, papel, sedeId, convidadoPor: quem.uid });
});

export const atualizarMembro = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const quem = await exigirMembro(req, tid, ["diretoria"]);
  const uid = texto(d.uid, "usuário", { max: 128 });
  const ref = refs.membro(tid, uid);
  const atual = (await ref.get()).data() as Membro | undefined;
  if (!atual) throw new HttpsError("not-found", "Usuário não encontrado.");
  const upd: Record<string, unknown> = { atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: quem.uid };
  if (d.papel !== undefined) upd.papel = umDe(d.papel, "papel", ["diretoria", "subsede", "portaria"] as const);
  if (d.sedeId !== undefined) upd.sedeId = d.sedeId ? texto(d.sedeId, "sede", { max: 40 }) : FieldValue.delete();
  if (d.ativo !== undefined) upd.ativo = d.ativo === true;
  const ficaraDiretoriaAtiva = (upd.papel ?? atual.papel) === "diretoria" && (upd.ativo ?? atual.ativo);
  if (atual.papel === "diretoria" && atual.ativo && !ficaraDiretoriaAtiva) {
    const diretores = await db.collection(`torcidas/${tid}/membros`).where("papel", "==", "diretoria").where("ativo", "==", true).get();
    if (diretores.size <= 1) throw new HttpsError("failed-precondition", "A torcida precisa de pelo menos um usuário de diretoria ativo.");
  }
  if ((upd.papel ?? atual.papel) === "subsede" && !(upd.sedeId ?? atual.sedeId)) {
    throw new HttpsError("invalid-argument", "Usuário de subsede precisa de uma sede.");
  }
  await ref.update(upd);
  await db.doc(`usuarios/${uid}/acessos/${tid}`).set(
    { papel: upd.papel ?? atual.papel, sedeId: (upd.sedeId as string | undefined) ?? atual.sedeId ?? null, ativo: upd.ativo ?? atual.ativo },
    { merge: true },
  );
  return { ok: true };
});
