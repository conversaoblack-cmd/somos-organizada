// Pagar.me simulada para os testes locais. Imita só o que o sistema usa da API v5.
import http from "node:http";

const pedidos = new Map();
const assinaturas = new Map();
const faturas = new Map();
const clientes = new Map();
const cartoes = new Map();
const recebedores = new Map([["rp_principal", { id: "rp_principal", name: "Torcida (principal)", status: "active" }]]);
export const chamadas = [];
let seq = 1;
const id = (p) => `${p}_${String(seq++).padStart(6, "0")}`;

function autorizado(req) {
  const h = req.headers.authorization ?? "";
  const sk = Buffer.from(h.replace(/^Basic /, ""), "base64").toString().replace(/:$/, "");
  return sk.startsWith("sk_test_");
}

function pagar(p) {
  p.status = "paid";
  for (const c of p.charges) {
    c.status = "paid";
    c.paid_amount = c.amount;
    c.last_transaction.status = "paid";
  }
}

export function iniciar(porta = 4010) {
  const server = http.createServer(async (req, res) => {
    let corpo = "";
    for await (const parte of req) corpo += parte;
    const json = corpo ? JSON.parse(corpo) : undefined;
    const url = new URL(req.url, "http://x");
    const responder = (status, dados) => {
      res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(dados));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, GET" });
      return res.end();
    }
    // Tokenização de cartão (navegador, autenticada só pela chave pública). Final 0002 = recusado.
    if (req.method === "POST" && url.pathname === "/tokens") {
      if (!String(url.searchParams.get("appId") ?? "").startsWith("pk_test_")) return responder(401, { message: "appId inválido" });
      const numero = String(json?.card?.number ?? "");
      if (numero.length < 13) return responder(422, { message: "The request is invalid.", errors: { "card.number": ["Número do cartão inválido"] } });
      return responder(200, { id: numero.endsWith("0002") ? "tok_recusado" : id("token"), type: "card" });
    }

    // Controle do teste: aprova a prova de vida de um recebedor
    if (req.method === "POST" && url.pathname.startsWith("/__recebedor/")) {
      const r = recebedores.get(url.pathname.split("/").pop());
      if (!r) return responder(404, {});
      r.status = "active";
      r.kyc_details = { status: "approved" };
      return responder(200, r);
    }
    // Controle do teste: marca um pedido como pago (simula o cliente pagando o Pix)
    if (req.method === "POST" && url.pathname.startsWith("/__pagar/")) {
      const p = pedidos.get(url.pathname.split("/").pop());
      if (!p) return responder(404, {});
      pagar(p);
      return responder(200, p);
    }
    if (!autorizado(req)) return responder(401, { message: "Authorization has been denied for this request." });
    chamadas.push({ metodo: req.method, caminho: url.pathname, corpo: json });

    if (req.method === "GET" && url.pathname === "/orders") return responder(200, { data: [] });
    if (req.method === "POST" && url.pathname === "/customers") {
      const c = { id: id("cus"), ...json };
      clientes.set(c.id, c);
      return responder(200, c);
    }
    if (req.method === "POST" && /^\/customers\/[^/]+\/cards$/.test(url.pathname)) {
      if (!clientes.has(url.pathname.split("/")[2])) return responder(404, { message: "Customer not found" });
      const c = { id: id("card"), last_four_digits: "1111", brand: "Visa", status: "active", recusado: json.token === "tok_recusado" };
      cartoes.set(c.id, c);
      return responder(200, c);
    }
    if (req.method === "POST" && url.pathname === "/recipients") {
      const doc = json.register_information?.document;
      if (!doc || !json.default_bank_account?.account_number) return responder(422, { message: "The request is invalid.", errors: { recipient: ["dados incompletos"] } });
      if (json.default_bank_account.holder_document !== doc) return responder(422, { message: "Titular da conta diferente do recebedor" });
      const r = { id: id("rp"), name: json.register_information.name, code: json.code, status: "registration", kyc_details: { status: "pending" } };
      recebedores.set(r.id, r);
      return responder(200, r);
    }
    if (req.method === "GET" && url.pathname.startsWith("/recipients/")) {
      const r = recebedores.get(url.pathname.split("/")[2]);
      return r ? responder(200, r) : responder(404, { message: "Recipient not found" });
    }
    if (req.method === "POST" && /^\/recipients\/[^/]+\/kyc_link$/.test(url.pathname)) {
      const r = recebedores.get(url.pathname.split("/")[2]);
      if (!r || r.kyc_details?.status === "approved") return responder(404, { errors: [{ message: "no kyc pending" }] });
      return responder(200, { url: `www.pagar.me/kyc/${r.id}`, base64_qrcode: "PHN2Zy8+", expires_at: new Date(Date.now() + 86400000).toISOString() });
    }
    if (req.method === "POST" && url.pathname === "/orders") {
      const amount = json.items.reduce((s, i) => s + i.amount * i.quantity, 0);
      const pay = json.payments[0];
      if (pay.split) {
        const soma = pay.split.reduce((s, r) => s + r.amount, 0);
        if (soma !== amount) return responder(422, { message: `Split não fecha: ${soma} != ${amount}` });
        for (const r of pay.split) if (!recebedores.has(r.recipient_id)) return responder(422, { message: `Recebedor ${r.recipient_id} não existe` });
      }
      if (pay.payment_method === "credit_card" && pay.credit_card.card_id) {
        const c = cartoes.get(pay.credit_card.card_id);
        if (!c) return responder(422, { message: "Card not found" });
        pay.credit_card.card_token = c.recusado ? "tok_recusado" : "tok_salvo";
      }
      const pedido = {
        id: id("or"), code: json.code, amount, status: "pending", metadata: json.metadata, items: json.items,
        charges: [{
          id: id("ch"), status: "pending", amount, payment_method: pay.payment_method,
          last_transaction: pay.payment_method === "pix"
            ? { id: id("tran"), status: "waiting_payment", qr_code: "00020101PIXSIMULADO", qr_code_url: "https://pix.simulado/qr.png", expires_at: new Date(Date.now() + pay.pix.expires_in * 1000).toISOString() }
            : { id: id("tran"), status: "pending" },
        }],
      };
      if (pay.payment_method === "credit_card") {
        if (pay.credit_card.card_token === "tok_recusado") {
          pedido.status = "failed";
          pedido.charges[0].status = "failed";
          pedido.charges[0].last_transaction = { id: id("tran"), status: "not_authorized", acquirer_message: "Saldo insuficiente", acquirer_return_code: "51" };
        } else pagar(pedido);
      }
      pedidos.set(pedido.id, pedido);
      return responder(200, pedido);
    }
    if (req.method === "GET" && url.pathname.startsWith("/orders/")) {
      const p = pedidos.get(url.pathname.split("/").pop());
      return p ? responder(200, p) : responder(404, { message: "Order not found" });
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/charges/")) return responder(200, { status: "canceled" });

    if (req.method === "POST" && url.pathname === "/subscriptions") {
      const total = json.items.reduce((s, i) => s + i.pricing_scheme.price * i.quantity, 0);
      const inicio = new Date();
      const fim = new Date(inicio);
      if (json.interval === "year") fim.setFullYear(fim.getFullYear() + json.interval_count);
      else fim.setMonth(fim.getMonth() + json.interval_count);
      const recusado = json.card_token === "tok_recusado";
      const sub = {
        id: id("sub"), code: json.code, status: recusado ? "failed" : "active", metadata: json.metadata,
        current_cycle: { start_at: inicio.toISOString(), end_at: fim.toISOString() },
        card: { last_four_digits: "4242", brand: "Visa" },
      };
      assinaturas.set(sub.id, sub);
      const fatura = {
        id: id("in"), status: recusado ? "failed" : "paid", amount: total, total_paid: recusado ? 0 : total,
        subscription: { id: sub.id }, cycle: { start_at: inicio.toISOString(), end_at: fim.toISOString() },
      };
      faturas.set(fatura.id, fatura);
      return responder(200, sub);
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/subscriptions/")) {
      const s = assinaturas.get(url.pathname.split("/").pop());
      if (s) s.status = "canceled";
      return responder(200, s ?? {});
    }
    if (req.method === "GET" && url.pathname === "/invoices") {
      const subId = url.searchParams.get("subscription_id");
      return responder(200, { data: [...faturas.values()].filter((f) => f.subscription.id === subId) });
    }
    if (req.method === "GET" && url.pathname.startsWith("/invoices/")) {
      const f = faturas.get(url.pathname.split("/").pop());
      return f ? responder(200, f) : responder(404, {});
    }
    responder(404, { message: `Rota não simulada: ${req.method} ${url.pathname}` });
  });
  return new Promise((ok) => server.listen(porta, "127.0.0.1", () => ok(server)));
}
