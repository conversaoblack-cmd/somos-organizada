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

/** Endereço do painel da equipe (absoluto quando fica em outro domínio). */
export function urlPlataforma(caminho = "/plataforma"): string {
  return plataformaSeparada && !noHostPlataforma() ? `https://${HOST_PLATAFORMA}${caminho}` : caminho;
}

/** Endereço das páginas das torcidas (absoluto quando estamos no subdomínio da plataforma). */
export function urlPrincipal(caminho = "/"): string {
  return noHostPlataforma() && HOST_PRINCIPAL ? `https://${HOST_PRINCIPAL}${caminho}` : caminho;
}
