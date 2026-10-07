/**
 * MODO DEMONSTRAÇÃO (chaves sk_demo_ / pk_demo_): simula a Pagar.me dentro do próprio sistema,
 * para testar e apresentar o fluxo completo sem conta na Pagar.me. Nenhum dinheiro circula.
 *
 * Segue o "Simulador de Cartão de Crédito" da documentação oficial:
 *   4000000000000010 → aprovado; 4000000000000028 → não autorizado; qualquer outro → não autorizado.
 * O número do cartão nunca chega aqui: o navegador gera um token demo que diz só o desfecho.
 * Pix: fica pendente até alguém tocar em "Simular pagamento" (callable simularDemo).
 * Recebedor: nasce em "registration" e fica ativo ao simular a prova de vida.
 * Split: valida que as regras fecham o total, como a Pagar.me faz.
 */
import { db, FieldValue } from "../util/firebase";
import { tokenAleatorio } from "../util/cripto";
import {
  Pagarme,
  PagarmeErro,
  type PgAssinatura,
  type PgCustomer,
  type PgEndereco,
  type PgFatura,
  type PgItem,
  type PgPagamento,
  type PgPedido,
  type PgRecebedor,
  type PgCharge,
} from "./cliente";

export const ehChaveDemo = (sk: string) => sk.startsWith("sk_demo_");
export const RECEBEDOR_PRINCIPAL_DEMO = "rp_demoprincipal";

type Colecao = "orders" | "customers" | "cards" | "recipients";

export class PagarmeDemo extends Pagarme {
  constructor(private readonly tid: string) {
    super("sk_demo_simulado");
  }

  override get ambiente(): "demo" {
    return "demo";
  }

  private col(tipo: Colecao) {
    return db.collection(`torcidas/${this.tid}/demoPagarme`).doc(tipo).collection("itens");
  }
  private async ler<T>(tipo: Colecao, id: string): Promise<T> {
    const s = await this.col(tipo).doc(id).get();
    if (!s.exists) throw new PagarmeErro(`${tipo} ${id} não encontrado (demonstração)`, 404, null);
    return s.data() as T;
  }
  private novoId(prefixo: string) {
    return `${prefixo}_demo${tokenAleatorio(9).replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`;
  }

  override async testar() {
    return { data: [] };
  }

  override async criarPedido(corpo: {
    code: string;
    items: PgItem[];
    customer?: PgCustomer;
    customer_id?: string;
    payments: PgPagamento[];
    metadata?: Record<string, string>;
  }): Promise<PgPedido> {
    const amount = corpo.items.reduce((s, i) => s + i.amount * i.quantity, 0);
    const pay = corpo.payments[0];
    if (pay.split?.length) {
      const soma = pay.split.reduce((s, r) => s + r.amount, 0);
      if (soma !== amount) throw new PagarmeErro(`Split não fecha o total (${soma} ≠ ${amount})`, 422, null);
      for (const r of pay.split) {
        if (r.recipient_id === RECEBEDOR_PRINCIPAL_DEMO) continue;
        const rec = await this.ler<PgRecebedor>("recipients", r.recipient_id);
        if (rec.status !== "active") throw new PagarmeErro(`Recebedor ${r.recipient_id} não está ativo`, 422, null);
      }
    }
    const id = this.novoId("or");
    const charge: PgCharge = { id: this.novoId("ch"), status: "pending", amount, payment_method: pay.payment_method };
    let status: PgPedido["status"] = "pending";
    if (pay.payment_method === "pix") {
      const exp = new Date(Date.now() + (pay.pix.expires_in ?? 1800) * 1000);
      charge.last_transaction = {
        id: this.novoId("tran"),
        status: "waiting_payment",
        qr_code: `00020101021226850014br.gov.bcb.pix2563demo.somosorganizada/${id}5204000053039865406${(amount / 100).toFixed(2)}5802BR5915DEMONSTRACAO6009SAO PAULO62070503***6304DEMO`,
        expires_at: exp.toISOString(),
      };
    } else {
      let aprovado: boolean;
      if (pay.credit_card.card_id) {
        aprovado = (await this.ler<{ aprovado: boolean }>("cards", pay.credit_card.card_id)).aprovado;
      } else {
        aprovado = String(pay.credit_card.card_token ?? "").startsWith("tok_demo_aprovado");
      }
      if (aprovado) {
        status = "paid";
        charge.status = "paid";
        charge.paid_amount = amount;
        charge.last_transaction = { id: this.novoId("tran"), status: "captured" };
      } else {
        status = "failed";
        charge.status = "failed";
        charge.last_transaction = {
          id: this.novoId("tran"),
          status: "not_authorized",
          acquirer_message: "Contate a central do seu cartão",
          acquirer_return_code: "05",
        };
      }
    }
    const pedido: PgPedido = { id, code: corpo.code, amount, status, charges: [charge], metadata: corpo.metadata };
    await this.col("orders").doc(id).set({ ...pedido, criadoEm: FieldValue.serverTimestamp() });
    return pedido;
  }

  override async obterPedido(id: string) {
    return this.ler<PgPedido>("orders", id);
  }

  /** Simula o cliente pagando o Pix. */
  async pagarPix(orderId: string): Promise<PgPedido> {
    const p = await this.obterPedido(orderId);
    if (p.status !== "pending") return p;
    const charge = p.charges![0];
    const pago: PgPedido = {
      ...p,
      status: "paid",
      charges: [{ ...charge, status: "paid", paid_amount: charge.amount, last_transaction: { ...charge.last_transaction!, status: "paid" } }],
    };
    await this.col("orders").doc(orderId).set(pago, { merge: true });
    return pago;
  }

  override async cancelarCobranca(chargeId: string) {
    return { id: chargeId, status: "canceled", amount: 0, payment_method: "pix" } as PgCharge;
  }

  override async criarCliente(c: PgCustomer) {
    const id = this.novoId("cus");
    await this.col("customers").doc(id).set({ id, name: c.name, email: c.email });
    return { id };
  }

  override async criarCartao(customerId: string, token: string, _billing: PgEndereco) {
    await this.ler("customers", customerId);
    if (!token.startsWith("tok_demo_")) throw new PagarmeErro("Token de cartão inválido para a demonstração", 422, null);
    const id = this.novoId("card");
    const ultimos = token.split("_").pop()?.slice(-4) ?? "0000";
    const cartao = { id, last_four_digits: ultimos, brand: "Visa", status: "active", aprovado: token.startsWith("tok_demo_aprovado") };
    await this.col("cards").doc(id).set(cartao);
    return cartao;
  }

  override async criarRecebedor(corpo: Record<string, unknown>): Promise<PgRecebedor> {
    const info = (corpo.register_information ?? {}) as Record<string, unknown>;
    const banco = (corpo.default_bank_account ?? {}) as Record<string, unknown>;
    if (!info.document || !banco.account_number) throw new PagarmeErro("Dados do recebedor incompletos", 422, null);
    if (banco.holder_document !== info.document) throw new PagarmeErro("O titular da conta bancária precisa ser o próprio recebedor", 422, null);
    const id = this.novoId("rp");
    const r: PgRecebedor = { id, name: String(info.name ?? ""), code: String(corpo.code ?? ""), status: "registration", kyc_details: { status: "pending" } };
    await this.col("recipients").doc(id).set(r);
    return r;
  }

  override async obterRecebedor(id: string): Promise<PgRecebedor> {
    if (id === RECEBEDOR_PRINCIPAL_DEMO) return { id, name: "Conta da torcida (demonstração)", status: "active" };
    return this.ler<PgRecebedor>("recipients", id);
  }

  override async linkKyc(id: string) {
    const r = await this.obterRecebedor(id);
    if (r.kyc_details?.status === "approved") throw new PagarmeErro("Nenhuma prova de vida pendente", 404, null);
    return { url: `https://somosorganizada.com.br/demonstracao/prova-de-vida/${id}`, expires_at: new Date(Date.now() + 86_400_000).toISOString() };
  }

  /** Simula a aprovação da prova de vida do recebedor. */
  async aprovarRecebedor(id: string) {
    await this.ler("recipients", id);
    await this.col("recipients").doc(id).set({ status: "active", kyc_details: { status: "approved" } }, { merge: true });
  }

  // Assinaturas da Pagar.me (legado) não existem no modo demonstração
  override async criarAssinatura(): Promise<PgAssinatura> {
    throw new PagarmeErro("Indisponível na demonstração", 400, null);
  }
  override async obterAssinatura(): Promise<PgAssinatura> {
    throw new PagarmeErro("Indisponível na demonstração", 400, null);
  }
  override async cancelarAssinatura(): Promise<PgAssinatura> {
    throw new PagarmeErro("Indisponível na demonstração", 400, null);
  }
  override async obterFatura(): Promise<PgFatura> {
    throw new PagarmeErro("Indisponível na demonstração", 400, null);
  }
  override async listarFaturas() {
    return { data: [] as PgFatura[] };
  }
}
