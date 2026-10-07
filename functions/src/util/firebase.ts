import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const auth = getAuth();
export { FieldValue, Timestamp };

export const refs = {
  torcida: (tid: string) => db.doc(`torcidas/${tid}`),
  privadoPagarme: (tid: string) => db.doc(`torcidas/${tid}/privado/pagarme`),
  contrato: (tid: string) => db.doc(`torcidas/${tid}/privado/contrato`),
  slug: (slug: string) => db.doc(`slugs/${slug}`),
  sede: (tid: string, id: string) => db.doc(`torcidas/${tid}/sedes/${id}`),
  sedes: (tid: string) => db.collection(`torcidas/${tid}/sedes`),
  plano: (tid: string, id: string) => db.doc(`torcidas/${tid}/planos/${id}`),
  evento: (tid: string, id: string) => db.doc(`torcidas/${tid}/eventos/${id}`),
  socio: (tid: string, uid: string) => db.doc(`torcidas/${tid}/socios/${uid}`),
  socios: (tid: string) => db.collection(`torcidas/${tid}/socios`),
  cpf: (tid: string, cpf: string) => db.doc(`torcidas/${tid}/cpfs/${cpf}`),
  pedido: (tid: string, id: string) => db.doc(`torcidas/${tid}/pedidos/${id}`),
  pedidos: (tid: string) => db.collection(`torcidas/${tid}/pedidos`),
  ingressos: (tid: string) => db.collection(`torcidas/${tid}/ingressos`),
  ingresso: (tid: string, id: string) => db.doc(`torcidas/${tid}/ingressos/${id}`),
  lancamento: (tid: string, id: string) => db.doc(`torcidas/${tid}/lancamentos/${id}`),
  membro: (tid: string, uid: string) => db.doc(`torcidas/${tid}/membros/${uid}`),
  statsMes: (tid: string, mes: string) => db.doc(`torcidas/${tid}/stats/${mes}`),
  statsGeral: (tid: string) => db.doc(`torcidas/${tid}/stats/geral`),
  webhook: (tid: string, id: string) => db.doc(`torcidas/${tid}/webhooks/${id}`),
  plataformaMes: (mes: string) => db.doc(`plataforma/stats/meses/${mes}`),
};
