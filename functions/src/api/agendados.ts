import { avisarCartaoRecusado, avisarRenovacaoPix } from "../email/avisos";
import { aplicarRespostaPedido } from "./ingressos";
import { migrarRecebedoresAntigos } from "./recebedores";
import { PagarmeErro } from "../pagarme/cliente";
import { FALHA_TECNICA } from "../pagarme/recusas";
import { randomInt } from "node:crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { EMAIL_API_KEY, FUSO, MASTER_KEY, PADROES, QR_HMAC } from "../config";
import { db, refs, FieldValue, Timestamp } from "../util/firebase";
import { dias } from "../util/datas";
import { confirmarPedidoPago, contarMudancaStatus, encerrarPedidoNaoPago } from "../dominio/processamento";
import { pagarmeDaTorcida } from "../pagarme/credenciais";
import { criarCobrancaSocio, sincronizarFaturas } from "./socios";
import type { Pedido, Socio, StatusSocio, Torcida } from "../dominio/tipos";

const torcidaDe = (ref: FirebaseFirestore.DocumentReference) => ref.parent.parent!.id;

/** Mesmo alfabeto do link curto (web/src/lib/eventos.ts): sem 0/o, 1/l/i. */
const ALFABETO_EVENTO = "abcdefghjkmnpqrstuvwxyz23456789";
export function codigoEvento(): string {
  return Array.from({ length: 6 }, () => ALFABETO_EVENTO[randomInt(ALFABETO_EVENTO.length)]).join("");
}

/**
 * Eventos criados antes do link curto (/torcida/e/codigo) ganham o código, para todo link divulgado ser curto.
 * Só eventos futuros (os passados não são mais divulgados). Idempotente: quem já tem código não muda.
 */
export async function darCodigoAosEventos(): Promise<number> {
  let n = 0;
  const torcidas = await db.collection("torcidas").select().get();
  for (const t of torcidas.docs) {
    const futuros = await t.ref.collection("eventos").where("data", ">=", Timestamp.fromMillis(Date.now() - dias(1))).get();
    for (const e of futuros.docs) {
      if (e.get("codigo")) continue;
      await db.runTransaction(async (tx) => {
        const atual = await tx.get(e.ref);
        if (!atual.exists || atual.get("codigo")) return;
        tx.update(e.ref, { codigo: codigoEvento() });
        n++;
      });
    }
  }
  return n;
}

/** A cada 15 min: pedidos vencidos. Antes de expirar, confere na Pagar.me se não foram pagos no último segundo. */
export const expirarPedidos = onSchedule(
  { schedule: "every 15 minutes", timeZone: FUSO, secrets: [MASTER_KEY, QR_HMAC, EMAIL_API_KEY] },
  async () => {
    const vencidos = await db
      .collectionGroup("pedidos")
      .where("status", "==", "aguardando")
      .where("expiraEm", "<", Timestamp.now())
      .limit(300)
      .get();
    for (const doc of vencidos.docs) {
      const tid = torcidaDe(doc.ref);
      const p = doc.data() as Pedido;
      try {
        if (p.pagarme?.orderId) {
          const pg = await pagarmeDaTorcida(tid);
          const pedidoPg = await pg.obterPedido(p.pagarme.orderId);
          if (pedidoPg.status === "paid") {
            await confirmarPedidoPago(tid, doc.id, pedidoPg, QR_HMAC.value());
            continue;
          }
          if (pedidoPg.status === "pending" && pedidoPg.charges?.[0]?.id) {
            await pg.cancelarCobranca(pedidoPg.charges[0].id).catch(() => undefined);
          }
        }
        await encerrarPedidoNaoPago(tid, doc.id, "expirado", "Prazo de pagamento encerrado.");
      } catch (e) {
        if (e instanceof PagarmeErro && e.status === 404) {
          // não existe mais na Pagar.me desta torcida (ex.: criado com as chaves de teste): encerra e libera os lugares
          await encerrarPedidoNaoPago(tid, doc.id, "expirado", "Prazo de pagamento encerrado.").catch(() => undefined);
          continue;
        }
        logger.error("Falha ao expirar pedido", { tid, pedidoId: doc.id, erro: String(e) });
      }
    }
    // Pedidos que travaram antes de chegar à Pagar.me
    const travados = await db
      .collectionGroup("pedidos")
      .where("status", "==", "criando")
      .where("criadoEm", "<", Timestamp.fromMillis(Date.now() - 10 * 60_000))
      .limit(100)
      .get();
    for (const doc of travados.docs) {
      const tid = torcidaDe(doc.ref);
      try {
        // Antes de desistir, pergunta à Pagar.me: o pedido pode ter sido criado (e até pago) e só a gravação local falhou
        const p = doc.data() as Pedido;
        const pg = await pagarmeDaTorcida(tid);
        const pedidoPg = p.pagarme?.orderId ? await pg.obterPedido(p.pagarme.orderId) : await pg.buscarPedidoPorCodigo(doc.id);
        if (pedidoPg) {
          await aplicarRespostaPedido(tid, doc.id, pedidoPg, p.expiraEm?.toDate() ?? new Date(Date.now() + PADROES.pixExpiraSegundos * 1000));
          continue;
        }
      } catch (e) {
        logger.error("Falha ao conciliar pedido travado", { tid, pedidoId: doc.id, erro: String(e) });
        // tenta de novo na próxima rodada, sem liberar lugares de algo que pode ter sido pago (até 1 dia)
        if (Date.now() - (doc.get("criadoEm") as Timestamp).toMillis() < dias(1)) continue;
      }
      await encerrarPedidoNaoPago(tid, doc.id, "falhou", "Falha ao iniciar o pagamento.").catch(() => undefined);
    }
  },
);

/** Todo dia 07:10: cobranças de renovação no Pix, inadimplência e fim de assinaturas canceladas. */
export const rotinaSocios = onSchedule(
  { schedule: "10 7 * * *", timeZone: FUSO, secrets: [MASTER_KEY, QR_HMAC, EMAIL_API_KEY], timeoutSeconds: 540 },
  async () => {
    await migrarRecebedoresAntigos().catch((e) => logger.error("Migração de recebedores", { erro: String(e) }));
    await darCodigoAosEventos().catch((e) => logger.error("Código curto dos eventos", { erro: String(e) }));
    const agora = Date.now();
    const torcidas = new Map<string, Torcida | null>();
    const torcida = async (tid: string) => {
      if (!torcidas.has(tid)) torcidas.set(tid, ((await refs.torcida(tid).get()).data() as Torcida) ?? null);
      return torcidas.get(tid)!;
    };

    // 1) Renovação Pix: gera a cobrança alguns dias antes do vencimento
    const aVencer = await db
      .collectionGroup("socios")
      .where("metodo", "==", "pix")
      .where("validoAte", "<=", Timestamp.fromMillis(agora + dias(PADROES.diasAntecedenciaRenovacao)))
      .get();
    for (const doc of aVencer.docs) {
      const s = doc.data() as Socio;
      if (!["ativo", "inadimplente"].includes(s.status) || s.assinaturaCancelada) continue;
      const tid = torcidaDe(doc.ref);
      const t = await torcida(tid);
      if (!t || t.status === "suspensa" || !t.pagamentos?.configurado || !t.pagamentos.pix) continue;
      if (s.cobrancaAbertaId) {
        const aberto = (await refs.pedido(tid, s.cobrancaAbertaId).get()).data() as Pedido | undefined;
        if (aberto?.status === "aguardando") {
          // Ainda não pagou e vence hoje: último lembrete por e-mail
          const v = s.validoAte?.toMillis() ?? 0;
          if (v >= agora - dias(1) && v <= agora + dias(1)) await avisarRenovacaoPix(tid, t, s, aberto.total, true);
          continue;
        }
      }
      // Inadimplente há mais de 60 dias não recebe cobrança automática nova
      if (s.validoAte && s.validoAte.toMillis() < agora - dias(60)) continue;
      try {
        const r = await criarCobrancaSocio({
          tid, torcida: t, socio: s, metodo: "pix", renovacao: true, expiraSeg: PADROES.pixRenovacaoExpiraDias * 86400,
        });
        const novo = (await refs.pedido(tid, r.pedidoId).get()).data() as Pedido | undefined;
        if (novo?.status === "aguardando") await avisarRenovacaoPix(tid, t, s, novo.total, false);
      } catch (e) {
        logger.error("Falha ao gerar renovação Pix", { tid, uid: s.uid, erro: String(e) });
      }
    }

    // 1b) Renovação no cartão salvo: cobra no vencimento; se recusar, tenta de novo a cada dia por até 15 dias
    const cartaoAVencer = await db
      .collectionGroup("socios")
      .where("metodo", "==", "cartao")
      .where("validoAte", "<=", Timestamp.fromMillis(agora + dias(1)))
      .get();
    for (const doc of cartaoAVencer.docs) {
      const s = doc.data() as Socio;
      if (!["ativo", "inadimplente"].includes(s.status) || s.assinaturaCancelada) continue;
      if (!s.pagarme?.cardId || s.pagarme.subscriptionId) continue; // sem cartão salvo, ou assinatura legada
      if (s.cobrancaCartaoPausada) continue; // recusa definitiva (vencido, bloqueado...): só volta com cartão novo ou Pix
      if (s.validoAte && s.validoAte.toMillis() < agora - dias(15)) continue;
      const tid = torcidaDe(doc.ref);
      const t = await torcida(tid);
      if (!t || t.status === "suspensa" || !t.pagamentos?.configurado || !t.pagamentos.cartao) continue;
      if (s.cobrancaAbertaId) {
        const aberto = (await refs.pedido(tid, s.cobrancaAbertaId).get()).data() as Pedido | undefined;
        if (aberto?.status === "aguardando" || aberto?.status === "criando") continue;
      }
      try {
        const r = await criarCobrancaSocio({ tid, torcida: t, socio: s, metodo: "cartao", renovacao: true, expiraSeg: PADROES.pixExpiraSegundos });
        if (typeof r.resultado === "object") {
          // Bandeiras penalizam retentativa de recusa IRREVERSÍVEL (ABECS): nesse caso para e pede cartão novo
          await doc.ref.update({
            ultimaFalhaCobranca: FieldValue.serverTimestamp(),
            motivoFalhaCobranca: r.resultado.falhou,
            ...(r.resultado.definitiva ? { cobrancaCartaoPausada: true } : {}),
          });
          await avisarCartaoRecusado(tid, t, s, r.resultado.falhou, !!r.resultado.definitiva);
        }
      } catch (e) {
        logger.error("Falha na renovação no cartão", { tid, uid: s.uid, erro: String(e) });
        await doc.ref.update({ ultimaFalhaCobranca: FieldValue.serverTimestamp(), motivoFalhaCobranca: FALHA_TECNICA }).catch(() => undefined);
      }
    }

    // 2) Vencidos além da carência → inadimplente (ou cancelado, se pediu cancelamento)
    const vencidos = await db
      .collectionGroup("socios")
      .where("status", "==", "ativo")
      .where("validoAte", "<", Timestamp.fromMillis(agora - dias(PADROES.carenciaInadimplenciaDias)))
      .get();
    for (const doc of vencidos.docs) {
      const tid = torcidaDe(doc.ref);
      let s = doc.data() as Socio;
      try {
        // Assinatura no cartão: o webhook pode ter se perdido; confere antes de marcar
        if (s.pagarme?.subscriptionId && !s.assinaturaCancelada) {
          await sincronizarFaturas(tid, s, await pagarmeDaTorcida(tid));
          s = (await doc.ref.get()).data() as Socio;
          if (s.validoAte && s.validoAte.toMillis() > agora - dias(PADROES.carenciaInadimplenciaDias)) continue;
        }
        const novo: StatusSocio = s.assinaturaCancelada ? "cancelado" : "inadimplente";
        await db.runTransaction(async (tx) => {
          const atual = (await tx.get(doc.ref)).data() as Socio;
          if (atual.status !== "ativo") return;
          tx.update(doc.ref, { status: novo, atualizadoEm: FieldValue.serverTimestamp() });
          contarMudancaStatus(tx, tid, "ativo", novo);
        });
      } catch (e) {
        logger.error("Falha na rotina de inadimplência", { tid, uid: s.uid, erro: String(e) });
      }
    }
  },
);
