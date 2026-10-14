/**
 * Notificações da equipe no celular (painel da plataforma).
 * No iPhone só funciona com o painel adicionado à tela de início (iOS 16.4+), aberto por esse atalho.
 * A chave pública (VAPID) vem do Firebase: Configurações do projeto → Cloud Messaging → Certificados push da Web.
 */
import { app } from "./firebase";
import { api } from "./api";

/** Chave PÚBLICA do par Web Push (não é segredo). Vazia: notificações ainda não configuradas. */
export const CHAVE_VAPID = "BPTY69o9hUz3vnTvI57eOS0SxZKNW0J4O3lCKE6j3-TILyaOlC0EqELxFbQXEPGpuGB_A1KlG-edfaRY62iStrE";

export type SituacaoNotificacao = "sem_suporte" | "instalar_no_iphone" | "nao_configurado" | "negada" | "ligada" | "desligada";

const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalado = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;

export function situacaoNotificacao(): SituacaoNotificacao {
  if (!CHAVE_VAPID) return "nao_configurado";
  if (ehIphone() && !instalado()) return "instalar_no_iphone";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "sem_suporte";
  if (Notification.permission === "denied") return "negada";
  return Notification.permission === "granted" ? "ligada" : "desligada";
}

/** Pede a permissão (tem que ser no toque do botão) e registra este aparelho para receber os alertas. */
export async function ativarNotificacoes(): Promise<void> {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error("Permissão negada. Libere as notificações nos Ajustes do celular.");
  const { getMessaging, getToken } = await import("firebase/messaging");
  const registro = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: CHAVE_VAPID, serviceWorkerRegistration: registro });
  if (!token) throw new Error("O celular não liberou o envio de notificações. Tente de novo.");
  await api.registrarNotificacao({ token, aparelho: navigator.userAgent.slice(0, 120) });
}

/** iPhone: o atalho na tela de início lê o manifesto ao ser criado; no painel da plataforma ele abre como app. */
export function usarManifestoDaPlataforma() {
  if (document.querySelector('link[rel="manifest"]')) return;
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "/plataforma.webmanifest";
  document.head.appendChild(link);
  for (const [nome, valor] of [
    ["apple-mobile-web-app-capable", "yes"],
    ["mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-title", "Somos Equipe"],
    ["apple-mobile-web-app-status-bar-style", "black-translucent"],
  ]) {
    const m = document.createElement("meta");
    m.name = nome;
    m.content = valor;
    document.head.appendChild(m);
  }
}
