/** Conta da calculadora da página inicial (separada para o script da página não carregar o React). */
export const CALCULO_INICIAL = { socios: 200, mensalidade: 30, ingressos: 120, preco: 80 };

/** Taxa de serviço de 10% sobre mensalidades e ingressos do mês, em centavos. */
export function calcularTaxa(c: typeof CALCULO_INICIAL) {
  return Math.round((c.socios * c.mensalidade + c.ingressos * c.preco) * 0.1 * 100);
}

export const reais = (centavos: number) => `R$ ${(centavos / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
