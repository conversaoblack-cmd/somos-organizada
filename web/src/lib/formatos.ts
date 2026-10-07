import type { Timestamp } from "firebase/firestore";
import type { Intervalo, StatusSocio, StatusPedido } from "./tipos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 5500 → "R$ 55,00" */
export const moeda = (centavos: number | null | undefined) => BRL.format((centavos ?? 0) / 100);

/** 5500 → "55" ; 5550 → "55,50" (compacto para cards) */
export const moedaCurta = (centavos: number) => {
  const v = centavos / 100;
  return Number.isInteger(v) ? `R$ ${v}` : BRL.format(v);
};

/** "55,50" / "R$ 1.234,56" → 5550 / 123456 */
export function centavosDeTexto(s: string): number {
  const limpo = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const paraData = (v: Timestamp | Date | number | null | undefined): Date | null => {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  return v.toDate();
};

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o });

export const dataCurta = (v: Parameters<typeof paraData>[0]) => {
  const d = paraData(v);
  return d ? fmt({ day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : "—";
};
export const dataHora = (v: Parameters<typeof paraData>[0]) => {
  const d = paraData(v);
  return d ? fmt({ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d) : "—";
};
export const hora = (v: Parameters<typeof paraData>[0]) => {
  const d = paraData(v);
  return d ? fmt({ hour: "2-digit", minute: "2-digit" }).format(d) : "";
};
/** "sáb., 18 de out." */
export const dataExtensa = (v: Parameters<typeof paraData>[0]) => {
  const d = paraData(v);
  return d ? fmt({ weekday: "short", day: "numeric", month: "short" }).format(d) : "";
};
export const diaDoMes = (v: Parameters<typeof paraData>[0]) => {
  const d = paraData(v);
  return d ? fmt({ day: "2-digit" }).format(d) : "";
};
export const mesAbrev = (v: Parameters<typeof paraData>[0]) => {
  const d = paraData(v);
  return d ? fmt({ month: "short" }).format(d).replace(".", "").toUpperCase() : "";
};
export const relativo = (v: Parameters<typeof paraData>[0]) => {
  const d = paraData(v);
  if (!d) return "";
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
};

export const soDigitos = (s: string) => s.replace(/\D/g, "");

export function mascaraCpf(s: string) {
  const d = soDigitos(s).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
export function mascaraTelefone(s: string) {
  const d = soDigitos(s).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
export function mascaraCep(s: string) {
  return soDigitos(s).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
}
export function mascaraCartao(s: string) {
  return soDigitos(s).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}
export function mascaraValidade(s: string) {
  return soDigitos(s).slice(0, 4).replace(/(\d{2})(\d)/, "$1/$2");
}
export const cpfMascarado = (cpf: string) => {
  const d = soDigitos(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : cpf;
};

export function cpfValido(valor: string): boolean {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, peso: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}
export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
export const telefoneValido = (t: string) => [10, 11].includes(soDigitos(t).length);

export function periodicidade(intervalo: Intervalo, qtd: number): string {
  if (intervalo === "ano") return qtd === 1 ? "por ano" : `a cada ${qtd} anos`;
  if (qtd === 1) return "por mês";
  if (qtd === 3) return "por trimestre";
  if (qtd === 6) return "por semestre";
  if (qtd === 12) return "por ano";
  return `a cada ${qtd} meses`;
}
export function periodicidadeCurta(intervalo: Intervalo, qtd: number): string {
  if (intervalo === "ano" || qtd === 12) return "/ano";
  if (qtd === 1) return "/mês";
  if (qtd === 3) return "/tri";
  if (qtd === 6) return "/sem";
  return `/${qtd} meses`;
}

export const taxa = (centavos: number, pct: number) => Math.round((centavos * pct) / 100);

export const ROTULO_STATUS_SOCIO: Record<StatusSocio, string> = {
  pendente_pagamento: "Aguardando pagamento",
  em_analise: "Em análise",
  ativo: "Ativo",
  inadimplente: "Inadimplente",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
};
export const TOM_STATUS_SOCIO: Record<StatusSocio, "sucesso" | "alerta" | "perigo" | "neutro" | "info"> = {
  pendente_pagamento: "neutro",
  em_analise: "info",
  ativo: "sucesso",
  inadimplente: "alerta",
  suspenso: "perigo",
  cancelado: "neutro",
};
export const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  criando: "Iniciando",
  aguardando: "Aguardando pagamento",
  pago: "Pago",
  falhou: "Recusado",
  expirado: "Expirado",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

export function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
