/**
 * Divisão do pagamento entre a torcida e a subsede (split da Pagar.me, contas PSP).
 *
 *  - Venda de evento de subsede: o valor do ingresso vai para o recebedor da subsede, que paga
 *    as tarifas da Pagar.me e responde por chargeback; a taxa de serviço vai inteira para a torcida.
 *  - Mensalidade: mesma regra quando a torcida escolhe "sede do sócio" e a subsede tem recebedor ativo.
 *  - Sede principal (ou torcida sem split configurado): tudo na conta da torcida, sem regras.
 */
import type { PgSplit } from "../pagarme/cliente";
import type { Liquidacao, Sede, Torcida } from "./tipos";

export const RECEBEDOR_ATIVO = "active";

export const recebedorAtivo = (sede: Sede | undefined | null): boolean =>
  !!sede && sede.tipo === "subsede" && sede.recebedor?.status === RECEBEDOR_ATIVO;

export const splitConfigurado = (t: Torcida): boolean => !!t.pagamentos?.splitAtivo && !!t.pagamentos.recebedorPrincipalId;

export interface Divisao {
  split: PgSplit[] | undefined;
  liquidacao: Liquidacao;
}

export function dividir(torcida: Torcida, sede: Sede | undefined | null, valorBase: number, taxa: number): Divisao {
  if (!splitConfigurado(torcida) || !recebedorAtivo(sede)) return { split: undefined, liquidacao: "torcida" };
  const regras: PgSplit[] = [
    {
      amount: valorBase,
      type: "flat",
      recipient_id: sede!.recebedor!.id,
      options: { liable: true, charge_processing_fee: true, charge_remainder_fee: true },
    },
  ];
  if (taxa > 0) {
    regras.push({
      amount: taxa,
      type: "flat",
      recipient_id: torcida.pagamentos.recebedorPrincipalId!,
      options: { liable: false, charge_processing_fee: false, charge_remainder_fee: false },
    });
  }
  return { split: regras, liquidacao: "split" };
}

/** Evento de subsede só vende com o recebedor dela ativo (e o split da torcida configurado). */
export function subsedePodeVender(torcida: Torcida, sede: Sede | undefined | null): boolean {
  if (!sede || sede.tipo !== "subsede") return true;
  return splitConfigurado(torcida) && recebedorAtivo(sede);
}
