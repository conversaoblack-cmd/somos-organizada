/**
 * Envio de e-mail transacional. O Firebase não tem servidor de e-mail próprio: usamos a API do Brevo ou do
 * Resend, escolhida pelo formato da chave guardada no Secret Manager (EMAIL_API_KEY):
 *   xkeysib-...  → Brevo     re_...  → Resend     "desativado" (ou vazio) → não envia, só registra.
 * Cada e-mail tem uma chave única: o mesmo aviso nunca sai duas vezes (gatilho repetido, rotina rodando de novo).
 * O registro fica em torcidas/{tid}/emails/{chave} (sem conteúdo do e-mail; só destino, assunto e situação).
 */
import { logger } from "firebase-functions/v2";
import { EMAIL_API_KEY, EMAIL_REMETENTE } from "../config";
import { db, FieldValue } from "../util/firebase";

export interface Mensagem {
  para: { email: string; nome?: string };
  assunto: string;
  html: string;
  texto: string;
  /** Nome que aparece como remetente, ex.: "Torcida Brasil". O endereço é o da plataforma. */
  nomeRemetente: string;
  responderPara?: string;
}

type Provedor = "brevo" | "resend" | null;

function provedor(chave: string): Provedor {
  if (chave.startsWith("xkeysib-")) return "brevo";
  if (chave.startsWith("re_")) return "resend";
  return null;
}

function remetente(): { email: string; nome: string } {
  const bruto = EMAIL_REMETENTE.value();
  const m = bruto.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { nome: m[1], email: m[2] } : { nome: "Somos Organizada", email: bruto.trim() };
}

async function postar(url: string, headers: Record<string, string>, corpo: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(15_000) });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 300)}`);
  try {
    return JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Envio direto (sem o controle de "uma vez só" por torcida): e-mails de conta, como a confirmação de e-mail. */
export const enviarAgora = (m: Mensagem, chaveIdem: string) => despachar(m, chaveIdem);

async function despachar(m: Mensagem, chaveIdem: string): Promise<{ provedor: Provedor; id?: string }> {
  let chave = "";
  try {
    chave = (EMAIL_API_KEY.value() ?? "").trim();
  } catch {
    chave = ""; // função sem o segredo ligado (ou emulador sem .secret.local): só registra
  }
  const p = provedor(chave);
  if (!p) return { provedor: null };
  const de = remetente();
  const nomeDe = `${m.nomeRemetente} · Somos Organizada`.slice(0, 70);
  if (p === "brevo") {
    const r = await postar("https://api.brevo.com/v3/smtp/email", { "api-key": chave, accept: "application/json" }, {
      sender: { name: nomeDe, email: de.email },
      to: [{ email: m.para.email, ...(m.para.nome ? { name: m.para.nome } : {}) }],
      subject: m.assunto,
      htmlContent: m.html,
      textContent: m.texto,
      ...(m.responderPara ? { replyTo: { email: m.responderPara } } : {}),
      tags: ["somos-organizada"],
    });
    return { provedor: p, id: r.messageId as string | undefined };
  }
  const r = await postar("https://api.resend.com/emails", { Authorization: `Bearer ${chave}`, "Idempotency-Key": chaveIdem.slice(0, 256) }, {
    from: `${nomeDe} <${de.email}>`,
    to: [m.para.email],
    subject: m.assunto,
    html: m.html,
    text: m.texto,
    ...(m.responderPara ? { reply_to: m.responderPara } : {}),
  });
  return { provedor: p, id: r.id as string | undefined };
}

/**
 * Envia uma única vez por chave. Falha de envio não derruba o fluxo que chamou (pagamento, rotina):
 * fica registrada como "erro" e é tentada de novo na próxima vez que a mesma chave for pedida.
 */
export async function enviarUmaVez(tid: string, chave: string, tipo: string, m: Mensagem): Promise<"enviado" | "ja_enviado" | "sem_provedor" | "erro"> {
  const id = chave.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300);
  const ref = db.doc(`torcidas/${tid}/emails/${id}`);
  const reservou = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const st = s.get("status") as string | undefined;
    if (st === "enviado" || st === "sem_provedor" || st === "enviando") return false;
    tx.set(ref, { tipo, para: m.para.email, assunto: m.assunto, status: "enviando", tentativas: FieldValue.increment(1), atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!reservou) return "ja_enviado";
  try {
    const r = await despachar(m, `${tid}/${id}`);
    const status = r.provedor ? "enviado" : "sem_provedor";
    await ref.update({ status, provedor: r.provedor, idProvedor: r.id ?? null, erro: FieldValue.delete(), atualizadoEm: FieldValue.serverTimestamp() });
    return status;
  } catch (e) {
    logger.error("Falha ao enviar e-mail", { tid, chave: id, tipo, erro: String(e) });
    await ref.update({ status: "erro", erro: String(e).slice(0, 300), atualizadoEm: FieldValue.serverTimestamp() }).catch(() => undefined);
    return "erro";
  }
}
