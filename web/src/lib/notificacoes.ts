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

/**
 * Painel aberto como app pelo atalho na tela de início (iPhone e Android), sem a barra do navegador.
 * O iPhone lê estas marcações ao criar o atalho e abre na página onde ele foi criado.
 * O cabeçalho dos painéis desce para a área livre (env(safe-area-inset-top)): a faixa da hora e da bateria não recebe toque.
 */
export function modoApp(titulo: string, manifesto?: string) {
  if (manifesto && !document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = manifesto;
    document.head.appendChild(link);
  }
  for (const [nome, valor] of [
    ["apple-mobile-web-app-capable", "yes"],
    ["mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-title", titulo.slice(0, 30)],
    ["apple-mobile-web-app-status-bar-style", "black-translucent"],
  ]) {
    let m = document.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`);
    if (!m) {
      m = document.createElement("meta");
      m.name = nome;
      document.head.appendChild(m);
    }
    m.content = valor;
  }
}

/** Painel da plataforma: ícone "Somos Equipe" com o manifesto próprio (necessário para as notificações no iPhone). */
export function usarManifestoDaPlataforma() {
  modoApp("Somos Equipe", "/plataforma.webmanifest");
}

/** Diagnóstico no próprio celular (sem console): cada elo da corrente até a notificação aparecer. */
export async function diagnosticar(): Promise<{ item: string; ok: boolean; detalhe: string }[]> {
  const r: { item: string; ok: boolean; detalhe: string }[] = [];
  const add = (item: string, ok: boolean, detalhe: string) => r.push({ item, ok, detalhe });
  add("Aberto pelo ícone (app instalado)", instalado(), instalado() ? "sim" : "não: abra pelo ícone da tela de início");
  add("Navegador aceita notificação", "Notification" in window && "PushManager" in window, `${"Notification" in window ? "Notification" : "sem Notification"} · ${"PushManager" in window ? "PushManager" : "sem PushManager"}`);
  add("Permissão", typeof Notification !== "undefined" && Notification.permission === "granted", typeof Notification !== "undefined" ? Notification.permission : "—");
  add("Chave do projeto (VAPID)", !!CHAVE_VAPID, CHAVE_VAPID ? `…${CHAVE_VAPID.slice(-6)}` : "vazia");
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await navigator.serviceWorker?.getRegistration("/");
  } catch {
    reg = undefined;
  }
  add("Service worker ativo", !!reg?.active, reg?.active ? `${new URL(reg.active.scriptURL).pathname} · escopo ${new URL(reg.scope).pathname}` : "nenhum");
  try {
    const sub = await reg?.pushManager.getSubscription();
    add("Inscrição de push no celular", !!sub, sub ? new URL(sub.endpoint).host : "nenhuma");
  } catch (e) {
    add("Inscrição de push no celular", false, String(e).slice(0, 120));
  }
  let token = "";
  try {
    if (reg && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const { getMessaging, getToken } = await import("firebase/messaging");
      token = await getToken(getMessaging(app), { vapidKey: CHAVE_VAPID, serviceWorkerRegistration: reg });
    }
    add("Token do Firebase neste celular", !!token, token ? `…${token.slice(-8)}` : "não gerou");
  } catch (e) {
    add("Token do Firebase neste celular", false, String((e as Error)?.message ?? e).slice(0, 160));
  }
  try {
    const { aparelhos } = await api.diagnosticoNotificacao({});
    const bate = !!token && aparelhos.some((a) => a.finalToken === token.slice(-8));
    add(
      "Registrado no servidor",
      bate,
      aparelhos.length ? `${aparelhos.length} aparelho(s): ${aparelhos.map((a) => `…${a.finalToken}`).join(", ")}${bate ? "" : " · este celular não está na lista"}` : "nenhum aparelho desta conta",
    );
  } catch (e) {
    add("Registrado no servidor", false, String((e as Error)?.message ?? e).slice(0, 160));
  }
  return r;
}

/** Mostra uma notificação direto pelo service worker, sem passar pelo servidor (testa só o celular). */
export async function notificacaoLocal() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) throw new Error("Service worker não está ativo neste celular.");
  await reg.showNotification("Teste local", { body: "Se você está vendo isto, o celular mostra as notificações do app.", icon: "/icone-192.png" });
}
