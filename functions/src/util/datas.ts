import { FUSO } from "../config";

/** "2026-10" no fuso de São Paulo. Usado como chave dos relatórios mensais. */
export function competencia(d: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" }).formatToParts(d);
  const ano = partes.find((p) => p.type === "year")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  return `${ano}-${mes}`;
}

export const dias = (n: number) => n * 24 * 60 * 60 * 1000;
