import "./config";

// Chamadas do site: todas pela porta única "api" (ver api/central.ts). Separadas ficam só as que
// o Google chama direto: o aviso da Pagar.me (webhook), a prévia dos links (WhatsApp) e as rotinas agendadas.
export { api } from "./api/central";
export { pagarmeWebhook } from "./api/webhook";
export { previaLink } from "./api/previa";
export { rotinaSaas } from "./api/saas";
export { expirarPedidos, rotinaSocios } from "./api/agendados";
