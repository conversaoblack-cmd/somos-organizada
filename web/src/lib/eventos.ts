/**
 * Link direto de cada evento: somosorganizada.com.br/{torcida}/e/{codigo}.
 * O código tem 6 letras/números sem caracteres que confundem (0/o, 1/l/i), é gerado na criação do evento e não muda.
 * Eventos antigos, sem código, continuam abrindo por /{torcida}/evento/{id}.
 */
import type { ComId, Evento } from "./tipos";
import { urlTorcida } from "./hosts";

const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
export const CODIGO_EVENTO = /^[a-hjkmnp-z2-9]{6}$/;

export function novoCodigoEvento(): string {
  const n = new Uint32Array(6);
  crypto.getRandomValues(n);
  return Array.from(n, (v) => ALFABETO[v % ALFABETO.length]).join("");
}

/** Caminho interno do evento (para <Link>). */
export const caminhoEvento = (slug: string, e: Pick<ComId<Evento>, "id" | "codigo">) =>
  e.codigo ? `/${slug}/e/${e.codigo}` : `/${slug}/evento/${e.id}`;

/** Endereço completo para divulgar (WhatsApp, cartaz, QR Code): no domínio próprio da torcida, se estiver no ar. */
export const linkEvento = (t: { slug: string; dominio?: { vitrine?: string; painel?: string } }, e: Pick<ComId<Evento>, "id" | "codigo">) =>
  urlTorcida(t, caminhoEvento(t.slug, e).slice(t.slug.length + 1));
