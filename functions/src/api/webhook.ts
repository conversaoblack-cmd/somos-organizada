import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { MASTER_KEY, QR_HMAC, PADROES } from "../config";
import { refs, FieldValue } from "../util/firebase";
import { igualSeguro } from "../util/cripto";
import { pagarmeDaTorcida, type PrivadoPagarme } from "../pagarme/credenciais";
import { motivoRecusa, type Pagarme } from "../pagarme/cliente";
import { calcularMensalidade } from "../dominio/precos";
import { confirmarFaturaSocio, confirmarPedidoPago, encerrarPedidoNaoPago, estornarPedido } from "../dominio/processamento";
import type { Socio, Torcida } from "../dominio/tipos";

interface EventoPg {
  id?: string;
  type?: string;
  data?: Record<string, unknown> & { id?: string; code?: string; order?: { id?: string }; subscription?: { id?: string } };
}

/**
 * URL configurada por cada torcida na Pagar.me:
 *   https://<app>/api/pagarme/webhook/<torcidaId>/<token>
 * O corpo do webhook NÃO é confiável (a Pagar.me não assina): ele só diz "algo mudou".
 * O estado real é sempre buscado na API com a chave da própria torcida.
 */
export const pagarmeWebhook = onRequest({ secrets: [MASTER_KEY, QR_HMAC], memory: "256MiB" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Método não permitido");
    return;
  }
  const partes = req.path.split("/").filter(Boolean);
  const [tid, token] = partes.slice(-2);
  if (!tid || !token || !/^[A-Za-z0-9_-]{1,64}$/.test(tid)) {
    res.status(404).send("Não encontrado");
    return;
  }
  const priv = (await refs.privadoPagarme(tid).get()).data() as PrivadoPagarme | undefined;
  if (!priv?.webhookToken || !igualSeguro(token, priv.webhookToken)) {
    res.status(401).send("Não autorizado");
    return;
  }

  const evento = (req.body ?? {}) as EventoPg;
  const tipo = String(evento.type ?? "");
  const eventoId = String(evento.id ?? `${tipo}_${evento.data?.id ?? Date.now()}`).replace(/[^\w-]/g, "_").slice(0, 120);
  const logRef = refs.webhook(tid, eventoId);

  const anterior = await logRef.get();
  if (anterior.exists && anterior.get("processado") === true) {
    res.status(200).json({ ok: true, duplicado: true });
    return;
  }
  await logRef.set(
    { tipo, recebidoEm: FieldValue.serverTimestamp(), processado: false, tentativas: FieldValue.increment(1), objetoId: evento.data?.id ?? null },
    { merge: true },
  );
  await refs.torcida(tid).update({ "pagamentos.webhookRecebidoEm": FieldValue.serverTimestamp() }).catch(() => undefined);

  try {
    const pg = await pagarmeDaTorcida(tid);
    const resultado = await processar(tid, tipo, evento, pg);
    await logRef.set({ processado: true, resultado, processadoEm: FieldValue.serverTimestamp(), erro: null }, { merge: true });
    res.status(200).json({ ok: true });
  } catch (e) {
    logger.error("Erro ao processar webhook", { tid, tipo, eventoId, erro: String(e) });
    await logRef.set({ erro: String(e).slice(0, 500) }, { merge: true });
    res.status(500).json({ ok: false }); // a Pagar.me reenvia
  }
});

async function processar(tid: string, tipo: string, evento: EventoPg, pg: Pagarme): Promise<string> {
  const data = evento.data ?? {};

  if (tipo.startsWith("order.") || tipo.startsWith("charge.")) {
    const orderId = tipo.startsWith("order.") ? data.id : data.order?.id;
    if (!orderId) return "sem_pedido";
    const pedidoPg = await pg.obterPedido(String(orderId));
    const pedidoId = pedidoPg.code || pedidoPg.metadata?.pedidoId;
    if (!pedidoId || !(await refs.pedido(tid, pedidoId).get()).exists) return "pedido_externo";

    if (tipo === "charge.refunded" || tipo === "charge.chargedback") {
      return (await estornarPedido(tid, pedidoId)) ? "estornado" : "ignorado";
    }
    if (pedidoPg.status === "paid") {
      await confirmarPedidoPago(tid, pedidoId, pedidoPg, QR_HMAC.value());
      return "pago";
    }
    if (pedidoPg.status === "failed" || pedidoPg.status === "canceled") {
      await encerrarPedidoNaoPago(tid, pedidoId, pedidoPg.status === "failed" ? "falhou" : "cancelado", motivoRecusa(pedidoPg));
      return "encerrado";
    }
    return `ignorado_${pedidoPg.status}`;
  }

  if (tipo.startsWith("invoice.")) {
    if (!data.id) return "sem_fatura";
    const fatura = await pg.obterFatura(String(data.id));
    const subId = fatura.subscription?.id ?? fatura.subscriptionId;
    if (!subId) return "fatura_sem_assinatura";
    const socioSnap = await refs.socios(tid).where("pagarme.subscriptionId", "==", subId).limit(1).get();
    if (socioSnap.empty) return "assinatura_externa";
    const socio = socioSnap.docs[0].data() as Socio & { cobranca?: { valorBase: number; taxa: number } };
    if (fatura.status === "paid") {
      const torcida = (await refs.torcida(tid).get()).data() as Torcida;
      const c = socio.cobranca ?? calcularMensalidade(socio.valorPlano, torcida.taxaServicoPct ?? PADROES.taxaServicoPct);
      await confirmarFaturaSocio(tid, socio.uid, fatura, c.valorBase, c.taxa);
      return "fatura_paga";
    }
    if (fatura.status === "failed") {
      await socioSnap.docs[0].ref.update({ ultimaFalhaCobranca: FieldValue.serverTimestamp() });
      return "fatura_falhou";
    }
    return `fatura_${fatura.status}`;
  }

  if (tipo === "subscription.canceled") {
    const subId = data.id;
    if (!subId) return "sem_assinatura";
    const socioSnap = await refs.socios(tid).where("pagarme.subscriptionId", "==", subId).limit(1).get();
    if (socioSnap.empty) return "assinatura_externa";
    await socioSnap.docs[0].ref.update({ assinaturaCancelada: true, atualizadoEm: FieldValue.serverTimestamp() });
    return "assinatura_cancelada";
  }

  return "evento_ignorado";
}
