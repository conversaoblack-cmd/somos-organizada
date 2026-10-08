/**
 * Cliente mínimo da API Pagar.me v5 (https://docs.pagar.me).
 * Cada torcida tem a própria conta: a chave secreta é decifrada só no momento da chamada.
 */
const BASE =
  process.env.FUNCTIONS_EMULATOR === "true" && process.env.PAGARME_API_URL
    ? process.env.PAGARME_API_URL // Pagar.me simulada nos testes locais
    : "https://api.pagar.me/core/v5";

export class PagarmeErro extends Error {
  constructor(message: string, readonly status: number, readonly corpo: unknown) {
    super(message);
  }
}

import { classificarRecusa } from "./recusas";

export interface PgCustomer {
  name: string;
  email: string;
  document: string;
  document_type: "CPF";
  type: "individual";
  code?: string;
  phones: { mobile_phone: { country_code: string; area_code: string; number: string } };
  address?: PgEndereco;
}

export interface PgEndereco {
  line_1: string;
  line_2?: string;
  zip_code: string;
  city: string;
  state: string;
  country: "BR";
}

export interface PgItem {
  amount: number;
  description: string;
  quantity: number;
  code: string;
}

/** Regra de split (somente contas PSP). Valores "flat" em centavos; a soma deve fechar o total. */
export interface PgSplit {
  amount: number;
  type: "flat";
  recipient_id: string;
  options: { liable: boolean; charge_processing_fee: boolean; charge_remainder_fee: boolean };
}

export type PgPagamento =
  | { payment_method: "pix"; pix: { expires_in?: number; expires_at?: string }; split?: PgSplit[] }
  | {
      payment_method: "credit_card";
      credit_card: {
        installments: number;
        statement_descriptor?: string;
        /** Cartão novo (token do navegador) ou cartão salvo do cliente (card_id). */
        card_token?: string;
        card?: { billing_address: PgEndereco };
        card_id?: string;
        recurrence_cycle?: "first" | "subsequent";
      };
      split?: PgSplit[];
    };

export interface PgRecebedor {
  id: string;
  name?: string;
  status: string;
  code?: string;
  kyc_details?: { status?: string; status_reason?: string };
}

export interface PgTransacao {
  id: string;
  status: string;
  qr_code?: string;
  qr_code_url?: string;
  expires_at?: string;
  acquirer_message?: string;
  acquirer_return_code?: string;
  antifraud_response?: { status?: string };
  gateway_response?: { errors?: { message: string }[] };
}

export interface PgCharge {
  id: string;
  status: string;
  amount: number;
  paid_amount?: number;
  /** valor já devolvido/cancelado (estorno total ou parcial) */
  canceled_amount?: number;
  payment_method: string;
  last_transaction?: PgTransacao;
}

export interface PgPedido {
  id: string;
  code: string;
  amount: number;
  status: "pending" | "paid" | "canceled" | "failed" | string;
  charges?: PgCharge[];
  metadata?: Record<string, string>;
}

export interface PgAssinatura {
  id: string;
  code?: string;
  status: "active" | "canceled" | "future" | "failed" | string;
  current_cycle?: { start_at: string; end_at: string };
  next_billing_at?: string;
  metadata?: Record<string, string>;
  card?: { last_four_digits?: string; brand?: string };
}

export interface PgFatura {
  id: string;
  status: "pending" | "paid" | "canceled" | "scheduled" | "failed" | string;
  amount: number;
  total_paid?: number;
  subscription?: { id: string };
  subscriptionId?: string;
  cycle?: { start_at: string; end_at: string };
  charge?: PgCharge;
}

export class Pagarme {
  constructor(private readonly chaveSecreta: string) {}

  get ambiente(): "teste" | "producao" | "demo" {
    if (this.chaveSecreta.startsWith("sk_demo_")) return "demo";
    return this.chaveSecreta.startsWith("sk_test_") ? "teste" : "producao";
  }

  private async req<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.chaveSecreta}:`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(25_000),
    });
    const textoResp = await res.text();
    let json: unknown = undefined;
    try {
      json = textoResp ? JSON.parse(textoResp) : undefined;
    } catch {
      json = textoResp;
    }
    if (!res.ok) throw new PagarmeErro(mensagemErro(json, res.status), res.status, json);
    return json as T;
  }

  /** Chamada barata só para validar a chave. */
  testar() {
    return this.req<{ data: unknown[] }>("GET", "/orders?size=1");
  }
  criarPedido(corpo: {
    code: string;
    items: PgItem[];
    customer?: PgCustomer;
    customer_id?: string;
    payments: PgPagamento[];
    metadata?: Record<string, string>;
    closed?: boolean;
  }) {
    return this.req<PgPedido>("POST", "/orders", corpo);
  }
  obterPedido(id: string) {
    return this.req<PgPedido>("GET", `/orders/${encodeURIComponent(id)}`);
  }
  cancelarCobranca(chargeId: string) {
    return this.req<PgCharge>("DELETE", `/charges/${encodeURIComponent(chargeId)}`);
  }
  criarAssinatura(corpo: {
    code: string;
    payment_method: "credit_card";
    interval: "month" | "year";
    interval_count: number;
    billing_type: "prepaid";
    installments: 1;
    statement_descriptor?: string;
    customer: PgCustomer;
    card_token: string;
    card: { billing_address: PgEndereco };
    items: { description: string; quantity: number; pricing_scheme: { price: number } }[];
    metadata?: Record<string, string>;
  }) {
    return this.req<PgAssinatura>("POST", "/subscriptions", corpo);
  }
  obterAssinatura(id: string) {
    return this.req<PgAssinatura>("GET", `/subscriptions/${encodeURIComponent(id)}`);
  }
  cancelarAssinatura(id: string) {
    return this.req<PgAssinatura>("DELETE", `/subscriptions/${encodeURIComponent(id)}`, { cancel_pending_invoices: true });
  }
  criarCliente(c: PgCustomer) {
    return this.req<{ id: string }>("POST", "/customers", c);
  }
  /** Salva o cartão (a partir do token gerado no navegador) para cobranças futuras. */
  criarCartao(customerId: string, token: string, billing_address: PgEndereco) {
    return this.req<{ id: string; last_four_digits?: string; brand?: string; status?: string }>(
      "POST",
      `/customers/${encodeURIComponent(customerId)}/cards`,
      { token, billing_address },
    );
  }
  criarRecebedor(corpo: Record<string, unknown>) {
    return this.req<PgRecebedor>("POST", "/recipients", corpo);
  }
  obterRecebedor(id: string) {
    return this.req<PgRecebedor>("GET", `/recipients/${encodeURIComponent(id)}`);
  }
  /** Link (e QR) da prova de vida do recebedor. */
  linkKyc(id: string) {
    return this.req<{ url: string; base64_qrcode?: string; expires_at?: string }>("POST", `/recipients/${encodeURIComponent(id)}/kyc_link`, {});
  }
  obterFatura(id: string) {
    return this.req<PgFatura>("GET", `/invoices/${encodeURIComponent(id)}`);
  }
  listarFaturas(subscriptionId: string) {
    return this.req<{ data: PgFatura[] }>("GET", `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}&size=5`);
  }
}

function mensagemErro(json: unknown, status: number): string {
  const j = json as { message?: string; errors?: Record<string, string[]> } | undefined;
  const detalhes = j?.errors
    ? Object.entries(j.errors)
        .map(([campo, msgs]) => `${campo}: ${msgs.join(", ")}`)
        .join("; ")
    : "";
  return [j?.message ?? `Erro Pagar.me (${status})`, detalhes].filter(Boolean).join(" — ");
}

/** Motivo de recusa legível para mostrar ao comprador. */
export function motivoRecusa(pedido: PgPedido): string {
  const c = pedido.charges?.[0];
  if (c?.payment_method === "pix") return "O Pix não foi concluído dentro do prazo.";
  return classificarRecusa(c?.last_transaction).mensagem;
}

/** Recusa definitiva (cartão vencido, bloqueado, dados errados): não adianta cobrar de novo o mesmo cartão. */
export function recusaDefinitiva(pedido: PgPedido): boolean {
  const c = pedido.charges?.[0];
  return c?.payment_method === "credit_card" && !classificarRecusa(c.last_transaction).retentar;
}

export function pagoIntegral(pedido: PgPedido, totalEsperado: number): boolean {
  if (pedido.status !== "paid") return false;
  const pago = (pedido.charges ?? []).reduce((s, c) => s + (c.status === "paid" ? c.paid_amount ?? c.amount : 0), 0);
  return pago >= totalEsperado;
}
