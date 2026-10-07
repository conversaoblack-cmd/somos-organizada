/**
 * Recusas de cartão em linguagem de torcedor.
 *
 * A Pagar.me devolve o motivo em `last_transaction.acquirer_return_code`. Desde 28/08/2026 a API v5 manda o
 * código oficial ABECS (05, 14, 51, 57...); antes mandava códigos próprios (1000, 1011, 1016...).
 * Tratamos os dois (docs.pagar.me → "Códigos de retorno padrão ABECS").
 * "retentar" segue a classificação ABECS: REVERSÍVEL (vale tentar de novo) ou IRREVERSÍVEL (não insistir).
 */
import type { PgTransacao } from "./cliente";

export interface Recusa {
  categoria: "saldo" | "dados" | "cvv" | "vencido" | "bloqueado" | "desbloqueio" | "seguranca" | "indisponivel" | "antifraude" | "generica";
  mensagem: string;
  retentar: boolean;
}

const TEXTOS: Record<Recusa["categoria"], Omit<Recusa, "categoria">> = {
  saldo: { mensagem: "Saldo ou limite insuficiente no cartão. Use outro cartão ou pague com Pix.", retentar: true },
  dados: { mensagem: "Os dados do cartão não conferem (número ou validade). Confira e tente de novo.", retentar: false },
  cvv: { mensagem: "Código de segurança (CVV) incorreto. Confira os 3 ou 4 números no verso do cartão.", retentar: false },
  vencido: { mensagem: "Este cartão está vencido. Use outro cartão ou pague com Pix.", retentar: false },
  bloqueado: { mensagem: "Este cartão está bloqueado ou não permite esta compra. Fale com o seu banco ou use outro cartão.", retentar: false },
  desbloqueio: { mensagem: "Cartão novo ainda não desbloqueado. Desbloqueie no app do banco e tente de novo.", retentar: true },
  seguranca: { mensagem: "O banco recusou por segurança. Libere a compra no app ou na central do cartão, ou pague com Pix.", retentar: true },
  indisponivel: { mensagem: "O banco do cartão não respondeu agora. Tente de novo em alguns minutos ou pague com Pix.", retentar: true },
  antifraude: { mensagem: "Compra não aprovada na análise de segurança. Tente outro cartão ou pague com Pix.", retentar: false },
  generica: { mensagem: "O banco não autorizou a compra. Fale com a central do cartão ou pague com Pix.", retentar: true },
};

// ABECS (códigos curtos ou alfanuméricos)
const ABECS: Record<string, Recusa["categoria"]> = {
  "51": "saldo", "116": "saldo", "61": "saldo", "65": "saldo",
  "1": "dados", "6": "dados", "14": "dados", "15": "dados", "19": "dados", "56": "dados", "70": "dados", "82": "dados", "88": "dados", "111": "dados", "122": "dados",
  "N7": "cvv",
  "54": "vencido", "101": "vencido",
  "4": "bloqueado", "7": "bloqueado", "41": "bloqueado", "43": "bloqueado", "46": "bloqueado", "57": "bloqueado", "58": "bloqueado", "62": "bloqueado", "200": "bloqueado",
  "78": "desbloqueio",
  "59": "seguranca", "63": "seguranca", "83": "seguranca", "93": "seguranca",
  "79": "indisponivel", "80": "indisponivel", "91": "indisponivel", "96": "indisponivel", "911": "indisponivel", "912": "indisponivel",
};
// Códigos próprios da Pagar.me (antes da virada para ABECS) e os de 4 dígitos que a ABECS manteve
const PAGARME: Record<string, Recusa["categoria"]> = {
  "1016": "saldo", "1021": "saldo", "1023": "saldo",
  "1011": "dados", "1007": "dados", "9108": "dados",
  "1045": "cvv",
  "1001": "vencido",
  "2000": "bloqueado", "2008": "bloqueado", "2009": "bloqueado", "1035": "bloqueado", "1019": "bloqueado", "1020": "bloqueado", "1004": "bloqueado", "1040": "bloqueado",
  "1025": "desbloqueio",
  "1022": "seguranca", "1024": "seguranca",
  "9107": "indisponivel", "9109": "indisponivel", "9111": "indisponivel", "9112": "indisponivel",
};

export function classificarRecusa(t: PgTransacao | undefined): Recusa {
  const bruto = String(t?.acquirer_return_code ?? "").trim().toUpperCase();
  const reprovadoAntifraude = /reprov|refused|fraud/i.test(String(t?.antifraud_response?.status ?? ""));
  let categoria: Recusa["categoria"] = "generica";
  if (reprovadoAntifraude) categoria = "antifraude";
  else if (bruto) {
    const n = /^\d+$/.test(bruto) ? String(Number(bruto)) : bruto;
    categoria = (bruto.length === 4 ? PAGARME[bruto] ?? ABECS[n] : ABECS[n] ?? PAGARME[bruto]) ?? "generica";
  }
  return { categoria, ...TEXTOS[categoria] };
}

/** Falha de comunicação (rede, chave, 5xx) numa cobrança automática: o torcedor não precisa ver o detalhe técnico. */
export const FALHA_TECNICA = "Não conseguimos falar com a operadora do cartão. Vamos tentar de novo automaticamente.";
