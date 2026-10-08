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
  return noHostPlataforma() && HOST_PRINCIPAL ? `https://${HOST_PRINCIPAL}` : location.origin;
}
