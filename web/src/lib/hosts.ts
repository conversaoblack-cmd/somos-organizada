import { hostDaPlataforma, paraInterno, urlNoDominio, type HostProprio } from "./dominioProprio";
/**
 * Endereços separados por segurança: o painel da equipe da plataforma roda num subdomínio próprio
 * (ex.: plataforma.somosorganizada.com.br). O navegador guarda o login por domínio, então a sessão da equipe
 * fica isolada das páginas das torcidas. Sem VITE_HOST_PLATAFORMA (emulador, .web.app), tudo fica num endereço só.
 */
const HOST_PLATAFORMA = (import.meta.env.VITE_HOST_PLATAFORMA ?? "").trim().toLowerCase();
const HOST_PRINCIPAL = (import.meta.env.VITE_HOST_PRINCIPAL ?? "").trim().toLowerCase();

/** Subdomínio da plataforma configurado? */
export const plataformaSeparada = !!HOST_PLATAFORMA;

/** Esta aba está no subdomínio da plataforma? */
export const noHostPlataforma = () => plataformaSeparada && location.hostname.toLowerCase() === HOST_PLATAFORMA;

/** Prefixo das rotas do painel: vazio no subdomínio próprio (plataforma.dominio/torcidas), "/plataforma" no resto. */
export const prefixoPlataforma = () => (noHostPlataforma() ? "" : "/plataforma");

/** Caminho interno do painel da equipe: rp("/torcidas") → "/torcidas" no subdomínio ou "/plataforma/torcidas". */
export function rp(caminho = "/"): string {
  const base = prefixoPlataforma();
  return caminho === "/" ? base || "/" : `${base}${caminho}`;
}

/** Endereço do painel da equipe visto de fora dele (absoluto quando fica no subdomínio). */
export function urlPlataforma(caminho = ""): string {
  return plataformaSeparada && !noHostPlataforma() ? `https://${HOST_PLATAFORMA}${caminho || "/"}` : rp(caminho || "/");
}


/** Origem das páginas das torcidas (https://dominio): no subdomínio da plataforma aponta para o domínio principal. */
export function origemTorcidas(): string {
  if (proprio) return `https://${HOST_PADRAO}`; // num domínio próprio, /{outra-torcida} não existiria
  return noHostPlataforma() && HOST_PRINCIPAL ? `https://${HOST_PRINCIPAL}` : location.origin;
}

// ── Domínio próprio da torcida (ex.: furia.com.br e painel.furia.com.br) ──
// O main.tsx descobre a torcida pelo endereço (dominios/{host}) antes de desenhar as rotas e guarda aqui.


/** Domínio principal (links para a Somos Organizada saindo de um domínio próprio). */
export const HOST_PADRAO = HOST_PRINCIPAL || "somosorganizada.com.br";

let proprio: HostProprio | null = null;
/** Esta aba está num domínio próprio de torcida? (null = endereço da plataforma) */
export const hostProprio = () => proprio;
export const definirHostProprio = (h: HostProprio | null) => {
  proprio = h;
};

/** Endereço que pode ser de torcida (não é o principal, o da plataforma, do Firebase, local nem IP). */
export const talvezDominioProprio = () => !hostDaPlataforma(location.hostname, [HOST_PRINCIPAL, HOST_PLATAFORMA, "somosorganizada.com.br"]);

/** Endereço completo no domínio principal (ex.: rodapé "Somos Organizada" num domínio próprio). */
export const urlPadrao = (caminho = "/") => (proprio ? `https://${HOST_PADRAO}${caminho}` : caminho);

/**
 * Endereço para divulgar uma página da torcida (evento, ingressos, portaria, painel): no domínio próprio da área
 * quando está no ar, senão o endereço padrão. `rel` é relativo a /{torcida} ("", "/e/abc234", "/admin").
 */
export function urlTorcida(t: { slug: string; dominio?: { vitrine?: string; painel?: string } | null }, rel = ""): string {
  return urlNoDominio(t.dominio, rel) ?? `${origemTorcidas()}/${t.slug}${rel}`;
}

/** Caminho interno (/{torcida}/...) da página aberta agora: é o que vai como "continuar" nos e-mails de conta. */
export function caminhoInternoAtual(): string {
  return proprio ? paraInterno(proprio, location.pathname) : location.pathname;
}
