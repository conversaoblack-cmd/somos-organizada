import { onCall, HttpsError } from "firebase-functions/v2/https";
import { EMAIL_API_KEY, MASTER_KEY, QR_HMAC } from "../config";
import { refs } from "../util/firebase";
import { texto, umDe } from "../util/validacao";
import { exigirLogin } from "../dominio/permissoes";
import { confirmarPedidoPago } from "../dominio/processamento";
import { pagarmeDaTorcida } from "../pagarme/credenciais";
import { PagarmeDemo } from "../pagarme/demo";
import { paraQuemPediu, sincronizarRecebedor } from "./recebedores";
import type { Membro } from "../dominio/permissoes";
import type { Pedido, Torcida } from "../dominio/tipos";

/**
 * Ações que só existem no MODO DEMONSTRAÇÃO (chaves sk_demo_): simular o pagamento de um Pix e a
 * aprovação da prova de vida de um recebedor. Em torcidas com Pagar.me real, sempre recusa.
 */
export const simularDemo = onCall({ secrets: [MASTER_KEY, QR_HMAC, EMAIL_API_KEY] }, async (req) => {
  const uid = exigirLogin(req, { permitirAnonimo: true });
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const acao = umDe(d.acao, "ação", ["pagar_pedido", "aprovar_recebedor"] as const);
  const torcida = (await refs.torcida(tid).get()).data() as Torcida | undefined;
  if (torcida?.pagamentos?.ambiente !== "demo") throw new HttpsError("failed-precondition", "Disponível só no modo demonstração.");
  const pg = await pagarmeDaTorcida(tid);
  if (!(pg instanceof PagarmeDemo)) throw new HttpsError("failed-precondition", "Disponível só no modo demonstração.");
  const membro = (await refs.membro(tid, uid).get()).data() as Membro | undefined;
  const ativo = membro?.ativo ? membro : undefined;

  if (acao === "pagar_pedido") {
    const pedidoId = texto(d.pedidoId, "pedido", { max: 40 });
    const p = (await refs.pedido(tid, pedidoId).get()).data() as Pedido | undefined;
    if (!p || (p.uid !== uid && !ativo)) throw new HttpsError("not-found", "Pedido não encontrado.");
    if (p.status !== "aguardando" || !p.pagarme?.orderId) return { status: p.status };
    const pago = await pg.pagarPix(p.pagarme.orderId);
    await confirmarPedidoPago(tid, pedidoId, pago, QR_HMAC.value());
    return { status: "pago" };
  }

  // aprovar_recebedor: a própria subsede (ou a diretoria) simula a prova de vida aprovada
  if (!ativo || (ativo.papel !== "diretoria" && ativo.papel !== "subsede")) throw new HttpsError("permission-denied", "Sem permissão.");
  const sedeId = ativo.papel === "subsede" ? ativo.sedeId : texto(d.sedeId, "sede", { max: 40 });
  if (!sedeId) throw new HttpsError("invalid-argument", "Sede não informada.");
  const sede = (await refs.sede(tid, sedeId).get()).data();
  const recebedorId = sede?.recebedor?.id as string | undefined;
  if (!recebedorId) throw new HttpsError("failed-precondition", "Esta sede ainda não cadastrou a conta de recebimento.");
  await pg.aprovarRecebedor(recebedorId);
  const r = await sincronizarRecebedor(tid, sedeId, pg);
  return { recebedor: paraQuemPediu(ativo.papel, r) };
});
