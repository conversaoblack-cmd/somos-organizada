/** Contato da equipe Somos Organizada (comercial e suporte). Puro: usado também pela página inicial estática. */

/** WhatsApp da equipe (com DDI). */
export const WHATSAPP_EQUIPE = "5571994095784";

/** Link do WhatsApp da equipe com a mensagem já escrita. */
export const linkWhatsappEquipe = (texto: string) => `https://wa.me/${WHATSAPP_EQUIPE}?text=${encodeURIComponent(texto)}`;
