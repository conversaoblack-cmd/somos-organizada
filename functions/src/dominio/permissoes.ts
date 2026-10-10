import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { refs } from "../util/firebase";
import { PLATAFORMA_EMAILS } from "../config";

export type Papel = "diretoria" | "subsede" | "portaria";

export interface Membro {
  uid: string;
  papel: Papel;
  sedeId?: string;
  ativo: boolean;
  nome?: string;
  email?: string;
}

export function exigirLogin(req: CallableRequest, { permitirAnonimo = false } = {}): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  if (!permitirAnonimo && req.auth?.token.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "Faça login com e-mail para continuar.");
  }
  return uid;
}

/** E-mails da equipe (parâmetro PLATAFORMA_EMAILS, separado por vírgula). */
export function emailsPlataforma(): string[] {
  return PLATAFORMA_EMAILS.value().split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Equipe Somos Organizada: além da marca na conta (dada por reivindicarPlataforma), o e-mail confirmado ainda
 * precisa estar em PLATAFORMA_EMAILS. Assim, tirar um e-mail da lista corta o acesso nas functions na hora,
 * sem depender de alguém apagar a marca da conta.
 */
export function ehPlataforma(req: CallableRequest): boolean {
  const t = req.auth?.token;
  if (t?.plataforma !== true || t.email_verified !== true) return false;
  return emailsPlataforma().includes(String(t.email ?? "").toLowerCase());
}

export function exigirPlataforma(req: CallableRequest): string {
  const uid = exigirLogin(req);
  if (!ehPlataforma(req)) throw new HttpsError("permission-denied", "Acesso restrito à equipe Somos Organizada.");
  return uid;
}

/** Garante que o usuário é membro ativo do painel da torcida com um dos papéis aceitos. */
export async function exigirMembro(req: CallableRequest, tid: string, papeis: Papel[]): Promise<Membro> {
  const uid = exigirLogin(req);
  const snap = await refs.membro(tid, uid).get();
  const m = snap.data() as Membro | undefined;
  if (!m || !m.ativo || !papeis.includes(m.papel)) {
    throw new HttpsError("permission-denied", "Você não tem permissão para esta ação.");
  }
  return { ...m, uid };
}

/** Subsede só mexe no que é da própria sede; diretoria mexe em tudo. */
export function exigirEscopoSede(m: Membro, sedeId: string | undefined): void {
  if (m.papel === "diretoria") return;
  if (!sedeId || m.sedeId !== sedeId) throw new HttpsError("permission-denied", "Fora do escopo da sua sede.");
}
