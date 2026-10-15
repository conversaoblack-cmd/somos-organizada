/**
 * Assinatura dos links de Pix dos e-mails (/pix?c=...&s=... e /pix/qr.png?c=...&s=...).
 * Sem ela, qualquer um montava um link somosorganizada.com.br/pix com o Pix de outra pessoa e a nossa página
 * mostrava o QR e o "Copiar código" como se fosse nosso (golpe com o nosso endereço). Agora só abre o código que o
 * próprio servidor colocou num e-mail.
 *
 * A chave é criada pelo servidor no primeiro uso e guardada em _servidor/pix (as regras não deixam ninguém ler nem
 * gravar). Não é a MASTER_KEY nem a QR_HMAC: trocar esta chave só invalida os botões de Pix de e-mails antigos.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db, FieldValue } from "./firebase";

const docChave = () => db.doc("_servidor/pix");
let chaveEmMemoria: Buffer | null = null;

async function chave(): Promise<Buffer> {
  if (chaveEmMemoria) return chaveEmMemoria;
  let doc = await docChave().get();
  if (!doc.exists) {
    try {
      await docChave().create({ chave: randomBytes(32).toString("base64"), criadoEm: FieldValue.serverTimestamp() });
    } catch {
      /* outro servidor criou antes: usa a dele */
    }
    doc = await docChave().get();
  }
  const k = Buffer.from(String(doc.get("chave") ?? ""), "base64");
  if (k.length < 32) throw new Error("Chave de assinatura do Pix inválida em _servidor/pix.");
  chaveEmMemoria = k;
  return k;
}

/** Assinatura curta (128 bits) de um código Pix com a chave dada. */
export function assinaturaComChave(k: Buffer, codigo: string): string {
  return createHmac("sha256", k).update(`pix:${codigo}`).digest("base64url").slice(0, 22);
}

export function confereComChave(k: Buffer, codigo: string, assinatura: string): boolean {
  if (typeof assinatura !== "string" || assinatura.length !== 22) return false;
  const a = Buffer.from(assinaturaComChave(k, codigo));
  const b = Buffer.from(assinatura);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function assinarPix(codigo: string): Promise<string> {
  return assinaturaComChave(await chave(), codigo);
}

export async function pixAssinado(codigo: string, assinatura: unknown): Promise<boolean> {
  if (typeof assinatura !== "string" || !codigo) return false;
  return confereComChave(await chave(), codigo, assinatura);
}
