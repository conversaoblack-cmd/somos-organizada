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

/** Parâmetros com segredo (chave dos ingressos, código de convite e de senha, Pix assinado) nunca vão para log. */
const SENSIVEIS = ["k", "c", "s", "chave", "token", "oobCode", "apiKey", "codigo"];

/** Endereço sem os segredos (vai para logsErro e para o diagnóstico do suporte, que a equipe lê). */
export function limparUrl(u: string): string {
  try {
    const url = new URL(u);
    for (const p of SENSIVEIS) if (url.searchParams.has(p)) url.searchParams.set(p, "***");
    if (url.hash.length > 1) url.hash = "#***";
    return url.toString();
  } catch {
    return u.replace(/[?#].*$/, "");
  }
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
    url: limparUrl(location.href).slice(0, 500),
    em: Date.now(),
  };
  recentes.push(item);
  if (recentes.length > 15) recentes.shift();
  if (enviados >= 10 || import.meta.env.DEV) return; // limite por sessão
  // As regras só aceitam log de quem tem sessão (anônima serve) e em nome dela mesma
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  enviados++;
  addDoc(collection(db, "logsErro"), {
    torcidaId: torcidaAtual ? torcidaAtual.slice(0, 64) : null,
    uid,
    mensagem: item.mensagem,
    stack: item.stack ?? "",
    url: item.url,
    navegador: navigator.userAgent.slice(0, 300),
    versao: String(VERSAO_APP).slice(0, 100),
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
    url: limparUrl(location.href),
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
