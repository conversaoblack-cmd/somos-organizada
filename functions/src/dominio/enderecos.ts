/**
 * Domínio próprio das torcidas (ex.: furiaamapaense.com.br): regras puras, sem Firebase, para testar à parte.
 *
 * - vitrine: o domínio raiz (apex) da torcida. É o site público: eventos, ingressos, sócio, conta.
 *   "www.<apex>" só redireciona para o apex (feito pelo Firebase Hosting).
 * - painel: um subdomínio (ex.: painel.furiaamapaense.com.br) para diretoria, subsedes e portaria.
 * O endereço padrão (somosorganizada.com.br/{torcida}) continua valendo para sempre.
 */

export type TipoHost = "vitrine" | "painel";

/** Domínios da própria plataforma: nunca viram domínio de torcida (nem os subdomínios deles). */
const DOMINIOS_PLATAFORMA = ["somosorganizada.com.br", "web.app", "firebaseapp.com"];
/** Terminações que não existem na internet pública (ou são de teste). */
const TLDS_PROIBIDOS = new Set(["localhost", "local", "internal", "test", "example", "invalid", "lan", "home", "arpa"]);
/**
 * Sufixos de 2 níveis mais comuns (lista curta no lugar da Public Suffix List inteira): neles o domínio raiz tem
 * 3 partes (furia.com.br); nos outros, 2 (furia.com).
 */
const SUFIXOS_DUPLOS = new Set([
  "com.br", "net.br", "org.br", "art.br", "blog.br", "eco.br", "esp.br", "eti.br", "ind.br", "inf.br", "tv.br", "app.br",
  "dev.br", "log.br", "rec.br", "srv.br", "tur.br", "adv.br", "emp.br", "leg.br", "radio.br", "far.br", "fot.br",
  "com.ar", "com.pt", "com.uy", "com.py", "co.uk", "org.uk", "com.mx", "com.co",
]);

const ROTULO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Erro de validação com texto para a equipe (o chamador transforma em HttpsError). */
export class EnderecoInvalido extends Error {}

/**
 * Normaliza e confere um nome de domínio digitado pela equipe. Aceita "https://Furia.com.br/" (tira o protocolo e
 * a barra final) e converte nome com acento para punycode (xn--). Recusa porta, caminho, IP, usuário, domínio da
 * plataforma e terminações de teste.
 */
export function normalizarHost(bruto: unknown, converterIdn: (s: string) => string = (s) => s): string {
  let s = String(bruto ?? "").trim().toLowerCase();
  if (!s) throw new EnderecoInvalido("Informe o domínio.");
  s = s.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\.$/, "");
  if (/[\s/:@?#\\]/.test(s)) throw new EnderecoInvalido(`“${s}” não é um domínio: sem http, porta, barra ou caminho (ex.: furiaamapaense.com.br).`);
  if (/[^\x21-\x7e]/.test(s)) {
    const ascii = converterIdn(s);
    if (!ascii || /[^\x21-\x7e]/.test(ascii)) throw new EnderecoInvalido(`“${s}” tem caracteres que não valem em domínio.`);
    s = ascii.toLowerCase();
  }
  if (s.length > 253) throw new EnderecoInvalido("Domínio longo demais.");
  const rotulos = s.split(".");
  if (rotulos.length < 2) throw new EnderecoInvalido(`“${s}” está incompleto (ex.: furiaamapaense.com.br).`);
  if (!rotulos.every((r) => ROTULO.test(r))) throw new EnderecoInvalido(`“${s}” tem uma parte inválida (use letras, números e hífen).`);
  const tld = rotulos[rotulos.length - 1]!;
  if (/^\d+$/.test(tld)) throw new EnderecoInvalido("Use o nome do domínio, não o número IP.");
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld) || TLDS_PROIBIDOS.has(tld)) throw new EnderecoInvalido(`“.${tld}” não é uma terminação de domínio válida.`);
  if (DOMINIOS_PLATAFORMA.some((d) => s === d || s.endsWith(`.${d}`))) throw new EnderecoInvalido("Esse endereço é da própria plataforma.");
  return s;
}

/** Domínio raiz (apex): "painel.furia.com.br" → "furia.com.br"; "loja.furia.com" → "furia.com". */
export function apexDe(host: string): string {
  const r = host.split(".");
  const duplo = r.length >= 3 && SUFIXOS_DUPLOS.has(r.slice(-2).join("."));
  return r.slice(duplo ? -3 : -2).join(".");
}

/** Domínio da vitrine: precisa ser o domínio raiz (o "www." vem junto, redirecionando). */
export function validarVitrine(bruto: unknown, converterIdn?: (s: string) => string): string {
  let h = normalizarHost(bruto, converterIdn);
  if (h.startsWith("www.") && apexDe(h) === h.slice(4)) h = h.slice(4); // digitou www.furia.com.br: o site fica no raiz
  if (apexDe(h) !== h) throw new EnderecoInvalido(`A vitrine usa o domínio raiz (${apexDe(h)}), não um subdomínio.`);
  if (SUFIXOS_DUPLOS.has(h)) throw new EnderecoInvalido(`“${h}” é só a terminação; falta o nome (ex.: furiaamapaense.${h}).`);
  return h;
}

/** Domínio do painel: precisa ser um subdomínio (ex.: painel.furia.com.br), nunca o "www.". */
export function validarPainel(bruto: unknown, converterIdn?: (s: string) => string): string {
  const h = normalizarHost(bruto, converterIdn);
  const apex = apexDe(h);
  if (apex === h) throw new EnderecoInvalido(`O painel usa um subdomínio, como painel.${h}.`);
  if (h === `www.${apex}`) throw new EnderecoInvalido("O “www.” é da vitrine (redireciona para o domínio raiz). Use outro nome, como painel.");
  return h;
}

/** O "www." que acompanha a vitrine e redireciona para ela. */
export const wwwDe = (vitrine: string) => `www.${vitrine}`;

// ── Caminhos: interno (/{torcida}/...) ↔ visível no domínio próprio ──

/** Caminho da torcida (relativo a /{torcida}) que pertence ao painel: /admin..., /portaria. */
export const ehDoPainel = (caminho: string) => /^\/(admin|portaria)(?:[/?#]|$)/.test(caminho);

/**
 * Caminho visível no domínio próprio para um caminho da torcida (relativo a /{torcida}, com ? e # se houver).
 *  vitrine: "" → "/", "/e/abc123" → "/e/abc123".
 *  painel: "/admin" → "/", "/admin/eventos" → "/eventos", "/portaria" → "/portaria",
 *          "/admin/portaria" → "/admin/portaria" (a página Portaria do painel; "/portaria" é o leitor).
 */
export function caminhoNoDominio(tipo: TipoHost, caminho: string): string {
  const [, base = "", resto = ""] = /^([^?#]*)(.*)$/.exec(caminho) ?? [];
  if (tipo === "vitrine") return (base || "/") + resto;
  if (base === "/admin" || base === "/admin/") return "/" + resto;
  if (/^\/admin\/portaria(?:\/|$)/.test(base)) return base + resto;
  if (base.startsWith("/admin/")) return base.slice(6) + resto;
  return (base || "/") + resto;
}

export interface TorcidaComDominio {
  slug: string;
  dominio?: { vitrine?: string; painel?: string } | null;
}

/**
 * Endereço completo de uma página da torcida para e-mail e aviso: no domínio próprio quando ele está no ar,
 * senão no endereço padrão (base = URL_APP). `caminho` é relativo a /{torcida} ("/socio", "/admin/plano", "").
 */
export function urlDaTorcida(t: TorcidaComDominio, caminho: string, base: string): string {
  const tipo: TipoHost = ehDoPainel(caminho) ? "painel" : "vitrine";
  const host = t.dominio?.[tipo];
  if (host) return `https://${host}${caminhoNoDominio(tipo, caminho)}`;
  return `${base.replace(/\/+$/, "")}/${t.slug}${caminho}`;
}

/**
 * Origem (https://host) para páginas gerais que funcionam em qualquer domínio (/convite, /redefinir-senha,
 * /verificar), no domínio próprio da área quando ele está no ar.
 */
export function origemDaTorcida(t: TorcidaComDominio | null | undefined, tipo: TipoHost, base: string): string {
  const host = t?.dominio?.[tipo];
  return host ? `https://${host}` : base.replace(/\/+$/, "");
}

/** Área (vitrine ou painel) de um caminho interno completo (/{torcida}/...). */
export function areaDoCaminhoInterno(caminho: string): TipoHost {
  return /^\/[^/?#]+\/(admin|portaria)(?:[/?#]|$)/.test(caminho) ? "painel" : "vitrine";
}

// ── Firebase Hosting: estado do domínio na API (customDomains, v1beta1) ──

export type EstadoDominio = "pendente_dns" | "emitindo_certificado" | "ativo" | "erro";

export interface RegistroDns {
  tipo: string;
  nome: string;
  valor: string;
  /** adicionar: falta criar; remover: registro antigo que atrapalha; ok: já está certo. */
  acao: "adicionar" | "remover" | "ok";
}

export interface SituacaoDominio {
  estado: EstadoDominio;
  registros: RegistroDns[];
  erro?: string;
}

interface RegistroHosting {
  domainName?: string;
  type?: string;
  rdata?: string;
  requiredAction?: string;
}
export interface DominioHosting {
  hostState?: string;
  ownershipState?: string;
  cert?: { state?: string };
  requiredDnsUpdates?: { desired?: { domainName?: string; records?: RegistroHosting[] }[] };
  issues?: { message?: string }[];
  deleteTime?: string;
}

/** Converte a resposta da API do Hosting no nosso estado e na lista de registros para mandar à torcida. */
export function situacaoDoHosting(d: DominioHosting): SituacaoDominio {
  const vistos = new Set<string>();
  const registros: RegistroDns[] = [];
  for (const conjunto of d.requiredDnsUpdates?.desired ?? []) {
    for (const r of conjunto.records ?? []) {
      if (!r.type || !r.rdata) continue;
      const nome = String(r.domainName ?? conjunto.domainName ?? "").replace(/\.$/, "");
      const chave = `${r.type}|${nome}|${r.rdata}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      registros.push({ tipo: r.type, nome, valor: r.rdata, acao: r.requiredAction === "ADD" ? "adicionar" : r.requiredAction === "REMOVE" ? "remover" : "ok" });
    }
  }
  const host = d.hostState ?? "";
  const dono = d.ownershipState ?? "";
  const cert = d.cert?.state ?? "";
  if (dono === "OWNERSHIP_CONFLICT" || host === "HOST_CONFLICT") {
    return { estado: "erro", registros, erro: "O domínio está ligado a outro site do Firebase. Ele precisa ser removido de lá antes." };
  }
  if (cert === "CERT_EXPIRED") return { estado: "erro", registros, erro: "O certificado (cadeado) expirou. Confira se o DNS ainda aponta para o Firebase." };
  const hospedado = host === "HOST_ACTIVE" && dono === "OWNERSHIP_ACTIVE";
  if (hospedado && (cert === "CERT_ACTIVE" || cert === "CERT_EXPIRING_SOON")) return { estado: "ativo", registros };
  if (hospedado) return { estado: "emitindo_certificado", registros };
  const aviso = dono === "OWNERSHIP_MISMATCH" ? "O domínio está registrado em outro projeto do Firebase: o registro TXT abaixo prova que ele é desta torcida." : undefined;
  return { estado: "pendente_dns", registros, ...(aviso ? { erro: aviso } : {}) };
}
