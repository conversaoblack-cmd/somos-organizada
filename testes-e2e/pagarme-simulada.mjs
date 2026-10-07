// Pagar.me simulada para os testes locais. Imita só o que o sistema usa da API v5.
import http from "node:http";

const pedidos = new Map();
const assinaturas = new Map();
const faturas = new Map();
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
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(dados));
    };

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
    if (req.method === "POST" && url.pathname === "/orders") {
      const amount = json.items.reduce((s, i) => s + i.amount * i.quantity, 0);
      const pay = json.payments[0];
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
          pedido.charges[0].last_transaction = { id: id("tran"), status: "not_authorized", acquirer_message: "Transação não autorizada" };
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
