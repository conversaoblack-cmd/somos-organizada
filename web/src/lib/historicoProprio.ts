/**
 * Domínio próprio da torcida: descobre a torcida pelo endereço e cria o histórico que mostra os caminhos curtos.
 *
 * As rotas do app continuam todas em /{torcida}/... (nenhuma tela muda). O histórico abaixo fica entre o React Router
 * e o navegador: o router lê e grava caminhos internos e a barra de endereço mostra os curtos (dominioProprio.ts).
 * Usa o unstable_HistoryRouter do próprio react-router (sem biblioteca nova).
 */
import { UNSAFE_createBrowserHistory, type HistoryRouterProps, type Path, type To } from "react-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { paraInterno, paraVisivel, type Destino, type HostProprio, type TipoHost } from "./dominioProprio";
import { HOST_PADRAO } from "./hosts";

type Historico = HistoryRouterProps["history"];

const CHAVE_CACHE = (host: string) => `so-dominio:${host}`;

interface DocDominio {
  tid: string;
  slug: string;
  tipo: TipoHost | "www";
  ativos?: { vitrine?: string; painel?: string };
}

/** Último resultado deste endereço (abre na hora, inclusive sem internet). */
export function lerCacheDominio(host: string): (HostProprio & { www?: boolean }) | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_CACHE(host)) ?? "null") as (HostProprio & { www?: boolean }) | null;
    return v && v.slug && v.tid && (v.tipo === "vitrine" || v.tipo === "painel") ? v : null;
  } catch {
    return null;
  }
}

function gravarCache(host: string, h: (HostProprio & { www?: boolean }) | null) {
  try {
    if (h) localStorage.setItem(CHAVE_CACHE(host), JSON.stringify(h));
    else localStorage.removeItem(CHAVE_CACHE(host));
  } catch {
    /* sem armazenamento: busca de novo na próxima vez */
  }
}

/** Consulta dominios/{host}. null = endereço não ligado a torcida nenhuma. Lança erro sem internet. */
export async function buscarDominio(host: string): Promise<(HostProprio & { www?: boolean }) | null> {
  const consulta = getDoc(doc(db, "dominios", host));
  const limite = new Promise<never>((_, falhar) => setTimeout(() => falhar(new Error("Sem resposta ao buscar o endereço da torcida.")), 12_000));
  const s = await Promise.race([consulta, limite]);
  const d = s.data() as DocDominio | undefined;
  const h = d?.tid && d.slug
    ? { host, tid: d.tid, slug: d.slug, tipo: d.tipo === "painel" ? ("painel" as const) : ("vitrine" as const), ativos: d.ativos ?? {}, ...(d.tipo === "www" ? { www: true } : {}) }
    : null;
  gravarCache(host, h);
  return h;
}

function separar(to: To, atual: string): Path {
  if (typeof to !== "string") return { pathname: to.pathname ?? atual, search: to.search ?? "", hash: to.hash ?? "" };
  const h = to.indexOf("#");
  const semHash = h >= 0 ? to.slice(0, h) : to;
  const q = semHash.indexOf("?");
  return { pathname: (q >= 0 ? semHash.slice(0, q) : semHash) || atual, search: q >= 0 ? semHash.slice(q) : "", hash: h >= 0 ? to.slice(h) : "" };
}

/** Endereço completo de um destino em outro domínio (o mesmo esquema e porta nos domínios próprios; o padrão é https). */
export function urlDoDestino(d: Destino, search = "", hash = ""): string {
  const resto = `${d.caminho}${search}${hash}`;
  if (d.host === null) return `https://${HOST_PADRAO}${resto}`;
  return `${location.protocol}//${d.host}${location.port ? `:${location.port}` : ""}${resto}`;
}

/**
 * Antes de desenhar: caminho curto na barra (troca o formato antigo /{torcida}/... e o /app.html pelo curto) ou,
 * se a página é do outro lado (painel na vitrine), manda para o domínio certo. Devolve false se saiu da página.
 */
export function ajustarEnderecoInicial(h: HostProprio): boolean {
  const interno = paraInterno(h, location.pathname);
  const d = paraVisivel(h, interno);
  if (!d.mesmo) {
    location.replace(urlDoDestino(d, location.search, location.hash));
    return false;
  }
  if (d.caminho !== location.pathname) history.replaceState(history.state, "", `${d.caminho}${location.search}${location.hash}`);
  return true;
}

export function criarHistoricoProprio(h: HostProprio): Historico {
  const base = UNSAFE_createBrowserHistory({ v5Compat: true });
  const traduzir = <L extends { pathname: string }>(l: L): L => ({ ...l, pathname: paraInterno(h, l.pathname) });
  const destino = (to: To) => {
    const p = separar(to, traduzir(base.location).pathname);
    return { d: paraVisivel(h, p.pathname), search: p.search ?? "", hash: p.hash ?? "" };
  };
  const ir = (to: To, state: unknown, trocar: boolean) => {
    const { d, search, hash } = destino(to);
    if (!d.mesmo) {
      // Outra área (vitrine ↔ painel) ou o endereço padrão: página nova em outro domínio
      if (trocar) location.replace(urlDoDestino(d, search, hash));
      else location.assign(urlDoDestino(d, search, hash));
      return;
    }
    const alvo = { pathname: d.caminho, search, hash };
    if (trocar) base.replace(alvo, state);
    else base.push(alvo, state);
  };
  return {
    get action() {
      return base.action;
    },
    get location() {
      return traduzir(base.location);
    },
    createHref(to) {
      const { d, search, hash } = destino(to);
      return d.mesmo ? `${d.caminho}${search}${hash}` : urlDoDestino(d, search, hash);
    },
    createURL(to) {
      return new URL(this.createHref(to), location.origin);
    },
    encodeLocation(to) {
      return base.encodeLocation(to);
    },
    push(to, state) {
      ir(to, state, false);
    },
    replace(to, state) {
      ir(to, state, true);
    },
    go(n) {
      base.go(n);
    },
    listen(ouvinte) {
      return base.listen((u) => ouvinte({ ...u, location: traduzir(u.location) }));
    },
  };
}
