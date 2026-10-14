/**
 * Domínio próprio da torcida: tradução entre o caminho VISÍVEL no endereço da torcida e o caminho INTERNO das
 * rotas do app (sempre /{torcida}/...). Puro (sem DOM nem Firebase): testado em functions/test/enderecos.test.ts.
 *
 * vitrine (furia.com.br):        "/" ↔ /furia      "/e/abc234" ↔ /furia/e/abc234      "/socio" ↔ /furia/socio
 * painel (painel.furia.com.br):  "/" ↔ /furia/admin  "/eventos" ↔ /furia/admin/eventos  "/portaria" ↔ /furia/portaria
 *                                "/admin/portaria" ↔ /furia/admin/portaria (a página Portaria do painel; "/portaria" é o leitor)
 * Caminho visível no formato antigo (/furia/...) também é aceito (link velho, <a href> montado à mão) e vira o curto.
 * Página do outro lado (painel na vitrine e vice-versa) vai para o outro domínio próprio ou, sem ele, para o
 * endereço padrão. /verificar, /convite e /redefinir-senha funcionam em qualquer domínio.
 */

export type TipoHost = "vitrine" | "painel";

export interface HostProprio {
  /** Este endereço (ex.: furia.com.br). */
  host: string;
  tid: string;
  slug: string;
  tipo: TipoHost;
  /** Domínios próprios no ar desta torcida (para mandar a pessoa ao outro lado). */
  ativos: { vitrine?: string; painel?: string };
}

/** Para onde vai um caminho interno: neste mesmo endereço, noutro domínio próprio ou no endereço padrão (host null). */
export interface Destino {
  host: string | null;
  caminho: string;
  mesmo: boolean;
}

/** Primeiros pedaços das páginas públicas da torcida (vitrine). */
const DA_VITRINE = new Set(["e", "evento", "associar", "pedido", "ingressos", "conta", "socio", "termos", "privacidade"]);
/** Páginas gerais que funcionam em qualquer domínio (links de e-mail). */
const GERAIS_LOCAIS = new Set(["verificar", "convite", "redefinir-senha"]);
/** Páginas gerais que só existem no endereço padrão. */
const GERAIS_PADRAO = new Set(["entrar", "cadastro", "plataforma"]);

const primeiro = (caminho: string) => caminho.split("/")[1] ?? "";

/** Caminho visível (só o pathname) → caminho interno das rotas. */
export function paraInterno(h: HostProprio, visivel: string): string {
  let p = visivel || "/";
  if (p === "/app.html" || p === "/index.html") p = "/"; // a página inicial estática manda para /app.html no domínio próprio
  const s1 = primeiro(p);
  if (GERAIS_LOCAIS.has(s1) || GERAIS_PADRAO.has(s1)) return p;
  if (h.tipo === "painel" && (s1 === "termos" || s1 === "privacidade")) return p; // termos da plataforma (diretoria)
  if (s1 === h.slug && !DA_VITRINE.has(s1) && s1 !== "admin" && s1 !== "portaria") return p; // formato antigo
  const sem = p === "/" ? "" : p.replace(/\/+$/, "");
  if (h.tipo === "vitrine") return `/${h.slug}${sem}`;
  if (!sem) return `/${h.slug}/admin`;
  if (s1 === "admin" || s1 === "portaria" || DA_VITRINE.has(s1)) return `/${h.slug}${sem}`;
  return `/${h.slug}/admin${sem}`;
}

/** Caminho da torcida (relativo a /{torcida}) → caminho visível no domínio do tipo dado. */
export function caminhoNoDominio(tipo: TipoHost, rel: string): string {
  if (tipo === "vitrine") return rel || "/";
  if (rel === "/admin" || rel === "/admin/") return "/";
  if (/^\/admin\/portaria(?:\/|$)/.test(rel)) return rel;
  if (rel.startsWith("/admin/")) return rel.slice(6);
  return rel || "/";
}

/** Caminho interno (só o pathname) → onde ele fica visível. */
export function paraVisivel(h: HostProprio, interno: string): Destino {
  const s1 = primeiro(interno);
  if (s1 === h.slug) {
    const rel = interno.slice(h.slug.length + 1);
    const area: TipoHost = /^\/(admin|portaria)(?:\/|$)/.test(rel) ? "painel" : "vitrine";
    const caminho = caminhoNoDominio(area, rel);
    if (area === h.tipo) return { host: h.host, caminho, mesmo: true };
    const outro = h.ativos[area];
    if (outro) return { host: outro, caminho, mesmo: false };
    return { host: null, caminho: interno, mesmo: false };
  }
  if (GERAIS_LOCAIS.has(s1)) return { host: h.host, caminho: interno, mesmo: true };
  if (h.tipo === "painel" && (s1 === "termos" || s1 === "privacidade")) return { host: h.host, caminho: interno, mesmo: true };
  if (s1 === "entrar") return paraVisivel(h, `/${h.slug}/admin`); // login da equipe: o painel desta torcida
  return { host: null, caminho: interno, mesmo: false };
}

/** Endereço completo de uma página da torcida, no domínio próprio da área quando ele está no ar. */
export function urlNoDominio(ativos: HostProprio["ativos"] | null | undefined, rel: string): string | null {
  const [, base = "", resto = ""] = /^([^?#]*)(.*)$/.exec(rel) ?? [];
  const area: TipoHost = /^\/(admin|portaria)(?:\/|$)/.test(base) ? "painel" : "vitrine";
  const host = ativos?.[area];
  return host ? `https://${host}${caminhoNoDominio(area, base)}${resto}` : null;
}

/**
 * Endereços que nunca são domínio de torcida: o principal (e www), o da plataforma, os do Firebase, o
 * computador local e IPs. Neles o app funciona como sempre, sem consultar dominios/{host}.
 */
export function hostDaPlataforma(host: string, conhecidos: string[]): boolean {
  const h = host.toLowerCase();
  if (!h || h === "localhost" || /^[\d.]+$/.test(h) || h.includes(":") || h.endsWith(".localhost")) return true;
  if (/(^|\.)(web\.app|firebaseapp\.com)$/.test(h)) return true;
  return conhecidos.some((c) => c && (h === c || h === `www.${c}`));
}
