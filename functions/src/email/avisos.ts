/**
 * Quando cada e-mail sai. Nada aqui interrompe pagamento ou rotina: qualquer falha vira registro.
 */
import { logger } from "firebase-functions/v2";
import { URL_APP } from "../config";
import { auth, refs } from "../util/firebase";
import type { Evento, Ingresso, Pedido, Socio, Torcida } from "../dominio/tipos";
import { enviarUmaVez } from "./enviar";
import { emailCartaoRecusado, emailIngressoComprado, emailIngressoNoSeuNome, emailRenovacaoPix, emailSocioConfirmado } from "./modelos";

const link = (t: Torcida, caminho: string) => `${URL_APP.value().replace(/\/+$/, "")}/${t.slug}${caminho}`;

async function seguro(o: string, f: () => Promise<unknown>) {
  try {
    await f();
  } catch (e) {
    logger.error(`E-mail não enviado (${o})`, { erro: String(e) });
  }
}

/** Conta com login (e-mail e senha)? Compra anônima antiga não tem conta para onde mandar a pessoa. */
async function temConta(uid: string) {
  const u = await auth.getUser(uid).catch(() => null);
  return !!u?.email && u.providerData.length > 0;
}

/** Chamado depois que um pedido é confirmado como pago (ingresso ou sócio). Idempotente. */
export function notificarPedidoPago(tid: string, pedidoId: string) {
  return seguro("pedido pago", async () => {
    const [tSnap, pSnap] = await Promise.all([refs.torcida(tid).get(), refs.pedido(tid, pedidoId).get()]);
    const torcida = tSnap.data() as Torcida | undefined;
    const p = pSnap.data() as Pedido | undefined;
    if (!torcida || !p || p.status !== "pago") return;

    if (p.tipo === "ingresso") {
      const ev = (await refs.evento(tid, p.eventoId!).get()).data() as Evento | undefined;
      if (!ev) return;
      if (p.comprador?.email && (await temConta(p.uid))) {
        await enviarUmaVez(tid, `ingresso-${pedidoId}`, "ingresso_comprado", emailIngressoComprado({
          torcida, url: link(torcida, "/conta/ingressos"), nome: p.comprador.nome, email: p.comprador.email,
          eventoNome: ev.nome, data: ev.data.toDate(), local: ev.local, titulares: (p.itens ?? []).map((i) => i.titularNome),
          total: p.total, metodo: p.metodo,
        }));
      }
      // Ingresso no CPF de um sócio: avisa o sócio também
      const ingressos = await Promise.all((p.ingressoIds ?? []).map((id) => refs.ingresso(tid, id).get()));
      for (const s of ingressos) {
        const i = s.data() as Ingresso | undefined;
        if (!i?.titularUid) continue;
        const ficha = (await refs.socio(tid, i.titularUid).get()).data() as Socio | undefined;
        if (!ficha?.email || ficha.email.toLowerCase() === p.comprador?.email?.toLowerCase()) continue;
        await enviarUmaVez(tid, `ingresso-titular-${s.id}`, "ingresso_no_seu_nome", emailIngressoNoSeuNome({
          torcida, url: link(torcida, "/socio/ingressos"), nome: ficha.nome, email: ficha.email,
          compradorNome: p.comprador.nome, eventoNome: ev.nome, data: ev.data.toDate(), local: ev.local,
        }));
      }
      return;
    }

    const ficha = (await refs.socio(tid, p.socioUid ?? p.uid).get()).data() as Socio | undefined;
    if (!ficha?.email) return;
    await enviarUmaVez(tid, `socio-pago-${pedidoId}`, "socio_confirmado", emailSocioConfirmado({
      torcida, url: link(torcida, "/socio"), nome: ficha.nome, email: ficha.email, renovacao: !!p.renovacao,
      plano: ficha.planoNome, validoAte: ficha.validoAte?.toDate() ?? null, total: p.total, matricula: ficha.matricula,
      emAnalise: ficha.status === "em_analise",
    }));
  });
}

/** Lembrete do Pix da mensalidade: quando a cobrança é gerada (antes do vencimento) e no dia do vencimento. */
export function avisarRenovacaoPix(tid: string, torcida: Torcida, socio: Socio, total: number, hoje: boolean) {
  return seguro("renovação Pix", async () => {
    if (!socio.email || !socio.validoAte) return;
    const vence = socio.validoAte.toDate();
    const ciclo = vence.toISOString().slice(0, 10);
    await enviarUmaVez(tid, `renovacao-${socio.uid}-${ciclo}-${hoje ? "dia" : "aviso"}`, hoje ? "renovacao_vence_hoje" : "renovacao_pix", emailRenovacaoPix({
      torcida, url: link(torcida, "/socio/assinatura"), nome: socio.nome, email: socio.email, vence, total, hoje,
    }));
  });
}

/** Cartão recusado na renovação: avisa na 1ª recusa do ciclo e quando a recusa vira definitiva. */
export function avisarCartaoRecusado(tid: string, torcida: Torcida, socio: Socio, motivo: string, definitiva: boolean) {
  return seguro("cartão recusado", async () => {
    if (!socio.email) return;
    const ciclo = socio.validoAte ? socio.validoAte.toDate().toISOString().slice(0, 10) : "sem-ciclo";
    await enviarUmaVez(tid, `cartao-recusado-${socio.uid}-${ciclo}-${definitiva ? "definitiva" : "1"}`, "cartao_recusado", emailCartaoRecusado({
      torcida, url: link(torcida, "/socio/assinatura"), nome: socio.nome, email: socio.email, motivo, definitiva,
    }));
  });
}
