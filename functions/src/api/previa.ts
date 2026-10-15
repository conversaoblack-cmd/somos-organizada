/**
 * Prévia dos links das torcidas no WhatsApp, Instagram e Facebook.
 * Esses apps não rodam JavaScript: leem só as tags <meta> do HTML. O Hosting manda para cá
 * /{torcida}, /{torcida}/e/{codigo} e /{torcida}/evento/{id} (e, no domínio próprio da torcida, /e/{codigo} e
 * /evento/{id}). Esta function devolve o mesmo app.html do site
 * com título, descrição e imagem daquela torcida ou daquele evento. O navegador abre o site normalmente.
 * A resposta fica 5 minutos no cache do Hosting, então só a primeira pessoa de um grupo espera a function.
 */
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { ESCALA_PUBLICA, FUSO, URL_APP } from "../config";
import { db, refs } from "../util/firebase";
import type { Evento, Torcida } from "../dominio/tipos";

export interface Meta {
  titulo: string;
  descricao: string;
  imagem?: string;
  url: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Coloca as tags da torcida/evento no app.html (troca título e descrição, acrescenta Open Graph). */
export function montarPrevia(html: string, m: Meta): string {
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${esc(m.titulo)}" />`,
    `<meta property="og:description" content="${esc(m.descricao)}" />`,
    `<meta property="og:url" content="${esc(m.url)}" />`,
    m.imagem ? `<meta property="og:image" content="${esc(m.imagem)}" />` : "",
    `<meta name="twitter:card" content="${m.imagem ? "summary_large_image" : "summary"}" />`,
  ]
    .filter(Boolean)
    .join("\n    ");
  // Substituição por função: com texto, o replace interpretaria $&, $` e $' vindos do nome do evento/torcida
  // (ex.: "Ingresso $` promo" colaria um pedaço da página dentro da tag).
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(m.titulo)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/, () => `<meta name="description" content="${esc(m.descricao)}" />`)
    .replace("</head>", () => `    ${tags}\n  </head>`);
}

export function metaDoEvento(t: Pick<Torcida, "nome" | "tema">, e: Evento, url: string): Meta {
  const quando = e.data.toDate().toLocaleString("pt-BR", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: FUSO });
  const precos = e.valorSocio < e.valorPublico && e.valorSocio >= 0
    ? `Sócio ${e.valorSocio ? reais(e.valorSocio) : "grátis"} · Público ${reais(e.valorPublico)}`
    : reais(e.valorPublico);
  return {
    titulo: `${e.nome} · ${t.nome}`,
    descricao: [quando, e.local, precos].filter(Boolean).join(" · "),
    imagem: e.imagemUrl || t.tema?.bannerUrl || t.tema?.logoUrl,
    url,
  };
}

export function metaDaTorcida(t: Pick<Torcida, "nome" | "tema" | "textos">, url: string): Meta {
  return {
    titulo: t.textos?.titulo || t.nome,
    descricao: t.textos?.subtitulo || `Ingressos e associação oficial da ${t.nome}.`,
    imagem: t.tema?.bannerUrl || t.tema?.logoUrl,
    url,
  };
}

// Sem cache em memória: o app.html muda a cada implantação e uma cópia velha aponta para scripts que não
// existem mais (o link do WhatsApp abria em branco por alguns minutos depois de cada implantação).
// A busca é ao próprio Hosting (rápida, servida pela CDN).
async function appHtml(): Promise<string> {
  const r = await fetch(`${URL_APP.value()}/app.html`, { signal: AbortSignal.timeout(5000), headers: { "Cache-Control": "no-cache" } });
  if (!r.ok) throw new Error(`app.html respondeu ${r.status}`);
  return r.text();
}

/** Host pedido pelo navegador (o Hosting repassa em X-Forwarded-Host), sem porta. */
export function hostDoPedido(cabecalhos: { get(nome: string): string | undefined }): string {
  const bruto = cabecalhos.get("x-forwarded-host") || cabecalhos.get("host") || "";
  return bruto.split(",")[0]!.trim().toLowerCase().replace(/:\d+$/, "");
}

/**
 * Domínio próprio (vitrine): "/", "/e/{codigo}" e "/evento/{id}" viram os caminhos internos da torcida
 * (/{torcida}, /{torcida}/e/{codigo}...). Endereço padrão e hosts desconhecidos seguem como estão.
 */
/** Pode ser domínio próprio de torcida? (não é o endereço padrão, nem endereço do Firebase/Google, nem IP) */
export function talvezDominioProprio(host: string, principal: string): boolean {
  if (!host || host === principal || host === `www.${principal}`) return false;
  if (/(^|\.)(web\.app|firebaseapp\.com|run\.app|cloudfunctions\.net|localhost)$/.test(host) || /^[\d.]+$/.test(host)) return false;
  return /^[a-z0-9.-]{3,253}$/.test(host);
}

function hostPrincipal(): string {
  try {
    return new URL(URL_APP.value()).hostname;
  } catch {
    return "";
  }
}

async function caminhoInterno(host: string, caminho: string): Promise<{ caminho: string; url: string }> {
  const padrao = { caminho, url: `${URL_APP.value()}${caminho}` };
  if (!talvezDominioProprio(host, hostPrincipal())) return padrao;
  const d = (await db.doc(`dominios/${host}`).get()).data() as { slug?: string; tipo?: string } | undefined;
  if (!d?.slug || d.tipo === "painel") return padrao;
  const resto = caminho === "/" ? "" : caminho.replace(/\/$/, "");
  return { caminho: `/${d.slug}${resto}`, url: `https://${host}${caminho}` };
}

async function metaDoCaminho(caminhoPedido: string, host = ""): Promise<Meta | null> {
  const { caminho, url } = await caminhoInterno(host, caminhoPedido);
  const m = /^\/([a-z0-9-]{3,40})(?:\/(?:e\/([a-z0-9]{6})|evento\/([A-Za-z0-9]{10,40})))?\/?$/i.exec(caminho);
  if (!m) return null;
  const [, slug, codigo, eventoId] = m;
  const tid = (await refs.slug(slug.toLowerCase()).get()).get("torcidaId") as string | undefined;
  if (!tid) return null;
  const t = (await refs.torcida(tid).get()).data() as Torcida | undefined;
  if (!t) return null;
  let e: Evento | undefined;
  if (codigo) {
    const q = await db.collection(`torcidas/${tid}/eventos`).where("codigo", "==", codigo.toLowerCase()).where("status", "in", ["publicado", "encerrado"]).limit(1).get();
    e = q.docs[0]?.data() as Evento | undefined;
  } else if (eventoId) {
    const d = (await refs.evento(tid, eventoId).get()).data() as Evento | undefined;
    e = d && (d.status === "publicado" || d.status === "encerrado") ? d : undefined;
  }
  return e ? metaDoEvento(t, e, url) : metaDaTorcida(t, url);
}

/**
 * Manifesto do app da torcida (painel e portaria adicionados à tela de início). Sem ele o iPhone considera que o app
 * vale só a partir do endereço onde foi adicionado: ao ir do painel (/torcida/admin/...) para o leitor
 * (/torcida/portaria) aparecia a barra do Safari, como se tivesse saído do app. Escopo = o site inteiro.
 */
export async function manifestoDaTorcida(slug: string, inicio: string, host: string): Promise<Record<string, unknown> | null> {
  const tid = (await refs.slug(slug.toLowerCase()).get()).get("torcidaId") as string | undefined;
  if (!tid) return null;
  const t = (await refs.torcida(tid).get()).data() as Torcida | undefined;
  if (!t) return null;
  // Subdomínio do painel no domínio próprio: lá o painel é o "/"
  let painelProprio = false;
  if (talvezDominioProprio(host, hostPrincipal())) painelProprio = (await db.doc(`dominios/${host}`).get()).get("tipo") === "painel";
  const portaria = inicio === "portaria";
  const base = painelProprio ? "" : `/${t.slug}`;
  return {
    name: `${t.nome} · ${portaria ? "Portaria" : "Painel"}`,
    short_name: t.nome.slice(0, 30),
    lang: "pt-BR",
    id: `${base}/${portaria ? "portaria" : "admin"}`,
    start_url: portaria ? `${base}/portaria` : painelProprio ? "/" : `${base}/admin`,
    scope: "/",
    display: "standalone",
    background_color: "#070A12",
    theme_color: "#070A12",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}

export const previaLink = onRequest({ memory: "256MiB", timeoutSeconds: 20, ...ESCALA_PUBLICA }, async (req, res) => {
  const pedidoManifesto = /^\/([a-z0-9-]{3,40})\/app\.webmanifest$/i.exec(req.path);
  if (pedidoManifesto) {
    try {
      const m = await manifestoDaTorcida(pedidoManifesto[1]!, String(req.query.inicio ?? ""), hostDoPedido(req));
      if (!m) {
        res.status(404).send("Torcida não encontrada.");
        return;
      }
      res.status(200).set("Content-Type", "application/manifest+json; charset=utf-8").set("Cache-Control", "public, max-age=300").send(JSON.stringify(m));
    } catch (e) {
      logger.warn("previa: manifesto", e);
      res.status(503).set("Retry-After", "5").send("Tente de novo em alguns segundos.");
    }
    return;
  }
  let html: string;
  try {
    html = await appHtml();
  } catch (e) {
    logger.error("previa: sem app.html", e);
    res.status(503).set("Retry-After", "5").send("Tente de novo em alguns segundos.");
    return;
  }
  let meta: Meta | null = null;
  const host = hostDoPedido(req);
  try {
    meta = await metaDoCaminho(req.path, host);
  } catch (e) {
    logger.warn("previa: sem dados da torcida/evento", e);
  }
  // CDN guarda 1 min (o navegador sempre confere). Domínio próprio e os caminhos curtos dele (/e/..., /evento/...)
  // não ficam no cache compartilhado: a mesma URL em outro domínio não pode receber a prévia de outra torcida.
  const cacheCdn = !talvezDominioProprio(host, hostPrincipal()) && !/^\/(e|evento)\//.test(req.path);
  res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", cacheCdn ? "public, max-age=0, s-maxage=60" : "no-cache")
    .send(meta ? montarPrevia(html, meta) : html);
});
