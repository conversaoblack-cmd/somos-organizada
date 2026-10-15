/**
 * Notificações da equipe no celular (painel da plataforma).
 * No iPhone só funciona com o painel adicionado à tela de início (iOS 16.4+), aberto por esse atalho.
 *
 * Web Push padrão, sem Firebase Cloud Messaging: o celular se inscreve direto no pushManager do service worker com a
 * chave pública VAPID do servidor (ação chaveNotificacao) e manda a inscrição (endpoint + chaves p256dh/auth) para
 * registrarNotificacao. O servidor envia com a biblioteca web-push (functions/src/api/alertas.ts) e o sw.js mostra.
 */
import { api } from "./api";

export type SituacaoNotificacao = "sem_suporte" | "instalar_no_iphone" | "negada" | "ligada" | "desligada";

const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalado = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;

export function situacaoNotificacao(): SituacaoNotificacao {
  if (ehIphone() && !instalado()) return "instalar_no_iphone";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "sem_suporte";
  if (Notification.permission === "denied") return "negada";
  return Notification.permission === "granted" ? "ligada" : "desligada";
}

/** Chave VAPID (base64url) → bytes, como o pushManager pede. */
function bytesDaChave(chave: string): Uint8Array<ArrayBuffer> {
  const b64 = (chave + "=".repeat((4 - (chave.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** A inscrição foi feita com esta chave? (null: o navegador não informa) */
function mesmaChave(sub: PushSubscription, chave: string): boolean | null {
  const atual = sub.options?.applicationServerKey;
  if (!atual) return null;
  const a = new Uint8Array(atual);
  const b = bytesDaChave(chave);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Service worker do app pronto (registra se ainda não houver). Sem ele não existe notificação. */
async function servicoDoApp(): Promise<ServiceWorkerRegistration> {
  const sw = navigator.serviceWorker;
  if (!(await sw.getRegistration("/"))) await sw.register("/sw.js", { scope: "/" });
  const pronto = await Promise.race([sw.ready, new Promise<null>((ok) => setTimeout(() => ok(null), 20_000))]);
  if (!pronto) throw new Error("O app ainda está terminando de instalar neste celular. Feche, abra de novo pelo ícone e tente outra vez.");
  return pronto;
}

/** Pede a permissão (tem que ser no toque do botão) e inscreve este aparelho para receber os alertas. */
export async function ativarNotificacoes(): Promise<void> {
  const pedidoChave = api.chaveNotificacao({}); // já sai buscando; a permissão precisa ser o primeiro passo do toque
  pedidoChave.catch(() => undefined);
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error("Permissão negada. Libere as notificações nos Ajustes do celular.");
  const { chave } = await pedidoChave;
  const reg = await servicoDoApp();
  let sub = await reg.pushManager.getSubscription();
  // Inscrição antiga (feita com a chave do Firebase) não recebe nada: troca pela da chave atual
  if (sub && mesmaChave(sub, chave) !== true) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDaChave(chave) });
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error("O celular não liberou o envio de notificações. Tente de novo.");
  await api.registrarNotificacao({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, chave, aparelho: navigator.userAgent.slice(0, 120) });
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
  const erro = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 160);
  add("Aberto pelo ícone (app instalado)", instalado(), instalado() ? "sim" : "não: abra pelo ícone da tela de início");
  add("Navegador aceita notificação", "Notification" in window && "PushManager" in window, `${"Notification" in window ? "Notification" : "sem Notification"} · ${"PushManager" in window ? "PushManager" : "sem PushManager"}`);
  add("Permissão", typeof Notification !== "undefined" && Notification.permission === "granted", typeof Notification !== "undefined" ? Notification.permission : "—");
  let chave = "";
  try {
    chave = (await api.chaveNotificacao({})).chave;
    add("Chave do servidor (VAPID)", !!chave, chave ? `…${chave.slice(-6)}` : "vazia");
  } catch (e) {
    add("Chave do servidor (VAPID)", false, erro(e));
  }
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await navigator.serviceWorker?.getRegistration("/");
  } catch {
    reg = undefined;
  }
  add("Service worker ativo", !!reg?.active, reg?.active ? `${new URL(reg.active.scriptURL).pathname} · escopo ${new URL(reg.scope).pathname}` : reg ? "instalando (ainda não ativo)" : "nenhum");
  let sub: PushSubscription | null | undefined;
  try {
    sub = await reg?.pushManager.getSubscription();
    add("Inscrição de push no celular", !!sub, sub ? new URL(sub.endpoint).host : "nenhuma: toque em “Registrar de novo”");
  } catch (e) {
    add("Inscrição de push no celular", false, erro(e));
  }
  if (sub && chave) {
    const igual = mesmaChave(sub, chave);
    add("Inscrição feita com a chave atual", igual !== false, igual === null ? "o navegador não informa" : igual ? "sim" : "não: toque em “Registrar de novo”");
  }
  try {
    const { aparelhos } = await api.diagnosticoNotificacao({});
    const bate = !!sub && aparelhos.some((a) => a.final === sub!.endpoint.slice(-8));
    add(
      "Registrado no servidor",
      bate,
      aparelhos.length ? `${aparelhos.length} aparelho(s): ${aparelhos.map((a) => `${a.servico} …${a.final}`).join(", ")}${bate ? "" : " · este celular não está na lista"}` : "nenhum aparelho desta conta",
    );
  } catch (e) {
    add("Registrado no servidor", false, erro(e));
  }
  return r;
}

/** Mostra uma notificação direto pelo service worker, sem passar pelo servidor (testa só o celular). */
export async function notificacaoLocal() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) throw new Error("Service worker não está ativo neste celular.");
  await reg.showNotification("Teste local", { body: "Se você está vendo isto, o celular mostra as notificações do app.", icon: "/icone-192.png" });
}
