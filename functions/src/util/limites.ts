/**
 * Contador simples por janela de tempo (limites contra abuso: e-mails em massa, convites em série).
 * Fica em limites/{resumo da chave}, que as regras do Firestore não deixam ninguém ler nem gravar.
 */
import { createHash } from "node:crypto";
import { db, FieldValue, Timestamp } from "./firebase";

/** Soma 1 e diz se ainda está dentro do limite (false = passou do máximo nesta janela; nada é somado). */
export async function dentroDoLimite(chave: string, max: number, janelaMs: number): Promise<boolean> {
  const ref = db.doc(`limites/${createHash("sha256").update(chave).digest("hex").slice(0, 40)}`);
  return db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() as { qtd?: number; janelaAte?: Timestamp } | undefined;
    const agora = Date.now();
    const aberta = !!d?.janelaAte && d.janelaAte.toMillis() > agora;
    const qtd = aberta ? d?.qtd ?? 0 : 0;
    if (qtd >= max) return false;
    tx.set(ref, { qtd: qtd + 1, janelaAte: aberta ? d!.janelaAte : Timestamp.fromMillis(agora + janelaMs), atualizadoEm: FieldValue.serverTimestamp() });
    return true;
  });
}

export const DIA_MS = 86_400_000;
