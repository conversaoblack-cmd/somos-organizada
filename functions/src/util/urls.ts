/** Endereços de páginas das torcidas em e-mails e avisos: domínio próprio quando está no ar, senão o padrão (URL_APP). */
import { URL_APP } from "../config";
import { origemDaTorcida as origemPura, urlDaTorcida as urlPura, type TipoHost, type TorcidaComDominio } from "../dominio/enderecos";

/** urlDaTorcida(t, "/socio/assinatura") → https://furia.com.br/socio/assinatura (ou https://somosorganizada.com.br/furia/socio/assinatura). */
export const urlDaTorcida = (t: TorcidaComDominio, caminho = "") => urlPura(t, caminho, URL_APP.value());

/** Origem para páginas gerais (/convite, /redefinir-senha, /verificar) no domínio próprio da área, se houver. */
export const origemDaTorcida = (t: TorcidaComDominio | null | undefined, tipo: TipoHost) => origemPura(t, tipo, URL_APP.value());
