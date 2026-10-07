/**
 * Captura de erros do navegador. Alimenta:
 *  - a coleção logsErro (janela de depuração da equipe Somos Organizada);
 *  - o diagnóstico anexado automaticamente quando alguém abre um chamado de suporte.
 */
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db, VERSAO_APP } from "./firebase";

interface ErroCapturado {
  mensagem: string;
  stack?: string;
  url: string;
  em: number;
}

const recentes: ErroCapturado[] = [];
let enviados = 0;
let torcidaAtual: string | null = null;
let contextoAtual = "";

export function definirContextoErros(torcidaId: string | null, contexto = "") {
  torcidaAtual = torcidaId;
  contextoAtual = contexto;
}

export function errosRecentes(): ErroCapturado[] {
  return [...recentes];
}

export function registrarErro(erro: unknown, contexto?: string) {
  const e = erro instanceof Error ? erro : new Error(String(erro));
  const item: ErroCapturado = {
    mensagem: e.message.slice(0, 2000),
    stack: e.stack?.slice(0, 6000),
    url: location.href.slice(0, 500),
    em: Date.now(),
  };
  recentes.push(item);
  if (recentes.length > 15) recentes.shift();
  if (enviados >= 10 || import.meta.env.DEV) return; // limite por sessão
  enviados++;
  addDoc(collection(db, "logsErro"), {
    torcidaId: torcidaAtual,
    uid: auth.currentUser?.uid ?? null,
    mensagem: item.mensagem,
    stack: item.stack ?? "",
    url: item.url,
    navegador: navigator.userAgent.slice(0, 300),
    versao: VERSAO_APP,
    contexto: (contexto ?? contextoAtual).slice(0, 200),
    criadoEm: serverTimestamp(),
  }).catch(() => undefined);
}

export function instalarCapturaDeErros() {
  window.addEventListener("error", (ev) => registrarErro(ev.error ?? ev.message, "window.error"));
  window.addEventListener("unhandledrejection", (ev) => registrarErro(ev.reason, "promise"));
}

/** Resumo técnico anexado ao chamado de suporte. */
export function diagnosticoDoNavegador(): Record<string, unknown> {
  return {
    url: location.href,
    navegador: navigator.userAgent,
    tela: `${window.innerWidth}x${window.innerHeight}`,
    idioma: navigator.language,
    online: navigator.onLine,
    versaoApp: VERSAO_APP,
    torcidaId: torcidaAtual,
    contexto: contextoAtual,
    erros: errosRecentes().map((e) => ({ mensagem: e.mensagem, url: e.url, em: new Date(e.em).toISOString() })),
  };
}
