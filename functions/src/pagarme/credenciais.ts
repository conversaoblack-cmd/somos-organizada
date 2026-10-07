import { HttpsError } from "firebase-functions/v2/https";
import { MASTER_KEY } from "../config";
import { refs } from "../util/firebase";
import { decifrar } from "../util/cripto";
import { Pagarme } from "./cliente";

export interface PrivadoPagarme {
  skCifrada: string;
  webhookToken: string;
  atualizadoEm: FirebaseFirestore.Timestamp;
  atualizadoPor: string;
}

/** Instancia o cliente Pagar.me da torcida. A chave decifrada nunca sai desta função. */
export async function pagarmeDaTorcida(tid: string): Promise<Pagarme> {
  const snap = await refs.privadoPagarme(tid).get();
  const dados = snap.data() as PrivadoPagarme | undefined;
  if (!dados?.skCifrada) {
    throw new HttpsError("failed-precondition", "Esta torcida ainda não configurou os pagamentos.");
  }
  return new Pagarme(decifrar(dados.skCifrada, MASTER_KEY.value()));
}
