/**
 * Registro do service worker (dist/sw.js, gerado no build a partir de web/scripts/sw-modelo.js).
 * Só o sistema (app.html) registra; a página inicial estática ("/") não carrega este arquivo.
 * No dev (vite) não há service worker.
 */
import { useSyncExternalStore } from "react";

let novaVersao = false;
let recarregando = false;
/** A página vai recarregar para pegar a versão nova: a tela de erro e o registro do erro não são necessários. */
export const estaRecarregando = () => recarregando;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

/** Arquivo de entrada desta página (/assets/app-HASH.js): compara com o da versão que o service worker guardou. */
const minhaEntrada = () => {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src;
  return src ? new URL(src).pathname : null;
};

export function registrarServiceWorker() {
  if (!import.meta.env.PROD) return;

  // Pedaço do sistema que não carregou com internet (implantação nova apagou a versão que esta aba usa):
  // recarrega uma vez para pegar a versão nova, em vez de "Algo deu errado". Sem internet, a tela de erro explica.
  window.addEventListener("vite:preloadError", (e) => {
    if (!navigator.onLine) return;
    try {
      if (Date.now() - (Number(sessionStorage.getItem("so-recarregou-em")) || 0) < 60_000) return;
      sessionStorage.setItem("so-recarregou-em", String(Date.now()));
    } catch {
      return;
    }
    e.preventDefault();
    recarregando = true;
    location.reload();
  });

  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;

  // O service worker avisa quando uma versão nova assume. Se esta aba roda outra versão, oferece atualizar
  // (sem recarregar sozinho: pode ser alguém no meio de uma compra ou mostrando o QR na portaria).
  sw.addEventListener("message", (e: MessageEvent<{ tipo?: string; entrada?: string }>) => {
    if (e.data?.tipo !== "versao" || !e.data.entrada) return;
    const minha = minhaEntrada();
    if (minha && minha !== e.data.entrada && !novaVersao) {
      novaVersao = true;
      avisar();
    }
  });

  const registrar = () => {
    sw.register("/sw.js", { scope: "/" })
      .then((reg) => {
        // A primeira visita carregou tudo antes de o service worker existir: manda a lista para ele guardar
        // (vem do cache do navegador, sem gastar dados). Inclui a tela aberta agora, mesmo fora da lista fixa.
        void sw.ready.then((pronto) => {
          const urls = performance
            .getEntriesByType("resource")
            .map((r) => r.name)
            .filter((u) => u.startsWith(`${location.origin}/assets/`));
          pronto.active?.postMessage({ tipo: "guardar", urls });
        });
        // Aba aberta por dias (celular): confere se há versão nova quando ela volta para a frente
        let ultima = Date.now();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible" || !navigator.onLine || Date.now() - ultima < 30 * 60_000) return;
          ultima = Date.now();
          reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined); // sem service worker o site funciona como antes (só não abre sem internet)
  };
  // Depois do carregamento: não disputa a rede com a primeira abertura da página
  if (document.readyState === "complete") registrar();
  else window.addEventListener("load", registrar, { once: true });
}

/** true quando uma versão nova do site já está no aparelho e esta aba ainda roda a anterior. */
export function useNovaVersao(): boolean {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => novaVersao,
    () => false,
  );
}
