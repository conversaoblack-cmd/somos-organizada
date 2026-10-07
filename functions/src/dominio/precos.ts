/** Todos os valores em centavos. Nenhum preço vem do navegador: tudo é recalculado aqui. */

export function taxaServico(valorBase: number, pct: number): number {
  return Math.round((valorBase * pct) / 100);
}

export interface EventoPreco {
  valorSocio: number;
  valorPublico: number;
}

export interface Titular {
  nome: string;
  cpf: string;
}

export interface ItemIngresso {
  tipo: "socio" | "publico";
  valorBase: number;
  titularNome: string;
  titularCpf: string;
}

export interface CalculoPedido<T> {
  itens: T[];
  valorBase: number;
  taxa: number;
  total: number;
}

/**
 * Sócio ativo paga o preço de sócio em UM ingresso por evento, que fica no nome dele.
 * Os demais ingressos do mesmo pedido saem pelo preço de público.
 */
export function calcularPedidoIngresso(args: {
  evento: EventoPreco;
  titulares: Titular[];
  socio: Titular | null;
  socioJaUsouPreco: boolean;
  pct: number;
}): CalculoPedido<ItemIngresso> {
  const { evento, titulares, socio, socioJaUsouPreco, pct } = args;
  const itens: ItemIngresso[] = [];
  let precoSocioDisponivel = !!socio && !socioJaUsouPreco;

  for (const t of titulares) {
    if (precoSocioDisponivel && socio && t.cpf === socio.cpf) {
      itens.push({ tipo: "socio", valorBase: evento.valorSocio, titularNome: socio.nome, titularCpf: socio.cpf });
      precoSocioDisponivel = false;
    } else {
      itens.push({ tipo: "publico", valorBase: evento.valorPublico, titularNome: t.nome, titularCpf: t.cpf });
    }
  }
  const valorBase = itens.reduce((s, i) => s + i.valorBase, 0);
  const taxa = itens.reduce((s, i) => s + taxaServico(i.valorBase, pct), 0);
  return { itens, valorBase, taxa, total: valorBase + taxa };
}

export function calcularMensalidade(valorPlano: number, pct: number): { valorBase: number; taxa: number; total: number } {
  const taxa = taxaServico(valorPlano, pct);
  return { valorBase: valorPlano, taxa, total: valorPlano + taxa };
}

export type Intervalo = "mes" | "ano";

/** Avança uma data pelo ciclo do plano (ex.: mensal x1, trimestral = mes x3, anual = ano x1). */
export function avancarCiclo(base: Date, intervalo: Intervalo, qtd: number): Date {
  const d = new Date(base.getTime());
  if (intervalo === "ano") d.setUTCFullYear(d.getUTCFullYear() + qtd);
  else {
    const dia = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + qtd);
    const ultimoDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dia, ultimoDia));
  }
  return d;
}
