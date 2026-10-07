import crypto from "node:crypto";

function chave(hex: string): Buffer {
  const k = Buffer.from(hex.trim(), "hex");
  if (k.length !== 32) throw new Error("MASTER_KEY precisa ter 64 caracteres hexadecimais (32 bytes).");
  return k;
}

/** AES-256-GCM. Formato: v1.<iv>.<tag>.<cifrado> em base64url. */
export function cifrar(texto: string, chaveHex: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chave(chaveHex), iv);
  const enc = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decifrar(pacote: string, chaveHex: string): string {
  const [versao, iv, tag, enc] = pacote.split(".");
  if (versao !== "v1" || !iv || !tag || !enc) throw new Error("Pacote cifrado inválido.");
  const d = crypto.createDecipheriv("aes-256-gcm", chave(chaveHex), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

export function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function tokenAleatorio(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Código legível tipo "K7QM-2XRA" (sem 0/O/1/I para não confundir na portaria). */
export function codigoLegivel(blocos = 2, tamanho = 4): string {
  const partes: string[] = [];
  for (let b = 0; b < blocos; b++) {
    let s = "";
    for (let i = 0; i < tamanho; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
    partes.push(s);
  }
  return partes.join("-");
}

/**
 * Conteúdo do QR: "SO1.<tipo>.<torcidaId>.<docId>.<assinatura>".
 * tipo: "i" (ingresso) ou "s" (carteirinha de sócio). A assinatura impede QR forjado ou copiado de outro documento.
 */
export type TipoQr = "i" | "s";

function assinatura(tipo: TipoQr, tid: string, id: string, segredo: string): string {
  return crypto.createHmac("sha256", segredo).update(`${tipo}.${tid}.${id}`).digest("base64url").slice(0, 22);
}

export function gerarQr(tipo: TipoQr, tid: string, id: string, segredo: string): string {
  return `SO1.${tipo}.${tid}.${id}.${assinatura(tipo, tid, id, segredo)}`;
}

export function lerQr(conteudo: string, segredo: string): { tipo: TipoQr; tid: string; id: string } | null {
  const partes = conteudo.trim().split(".");
  if (partes.length !== 5 || partes[0] !== "SO1") return null;
  const [, tipo, tid, id, sig] = partes;
  if ((tipo !== "i" && tipo !== "s") || !tid || !id || !sig) return null;
  if (!igualSeguro(sig, assinatura(tipo, tid, id, segredo))) return null;
  return { tipo, tid, id };
}
