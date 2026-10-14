/**
 * Onde o domínio próprio da torcida é ligado de verdade. Hoje: Firebase Hosting (o mesmo site do sistema),
 * pela API REST customDomains (v1beta1). No emulador: um provedor de mentira, controlado pelos testes.
 *
 * Permissão: a conta de serviço das functions precisa do papel "Administrador do Firebase Hosting"
 * (roles/firebasehosting.admin) no IAM do Google Cloud. Sem ele a API responde 403 e a equipe vê o passo a passo.
 */
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { applicationDefault } from "firebase-admin/app";
import { db } from "./firebase";
import { DOMINIO_SITE_ID } from "../config";
import { apexDe, situacaoDoHosting, type DominioHosting, type SituacaoDominio } from "../dominio/enderecos";

export interface ProvedorDominio {
  /** Liga o domínio ao site. Idempotente: se já existir, só devolve a situação. */
  criar(host: string, opcoes?: { redirecionarPara?: string }): Promise<SituacaoDominio>;
  /** Situação atual; null se o domínio não existe no provedor. */
  consultar(host: string): Promise<SituacaoDominio | null>;
  /** Desliga o domínio. Sem erro se ele já não existe. */
  remover(host: string): Promise<void>;
}

function projeto(): string {
  const p = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (p) return p;
  try {
    return String((JSON.parse(process.env.FIREBASE_CONFIG ?? "{}") as { projectId?: string }).projectId ?? "");
  } catch {
    return "";
  }
}
const site = () => DOMINIO_SITE_ID.value().trim() || projeto();

// ── Firebase Hosting (produção) ──

const API = "https://firebasehosting.googleapis.com/v1beta1";
const credencial = applicationDefault(); // conta de serviço das functions (escopo cloud-platform)

const SEM_PERMISSAO =
  "O Firebase não deixou a plataforma mexer nos domínios. Uma vez só, no Google Cloud (IAM), dê à conta de serviço das functions " +
  "o papel “Administrador do Firebase Hosting” (roles/firebasehosting.admin). Passo a passo em docs/IMPLANTACAO.md.";

async function chamarHosting(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<{ status: number; dados: Record<string, unknown> }> {
  const { access_token } = await credencial.getAccessToken();
  const r = await fetch(`${API}/${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await r.text();
  let dados: Record<string, unknown> = {};
  try {
    dados = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  } catch {
    dados = {};
  }
  if (r.status === 403) {
    logger.error("Hosting customDomains: 403", { caminho, resposta: texto.slice(0, 300) });
    throw new HttpsError("failed-precondition", SEM_PERMISSAO);
  }
  return { status: r.status, dados };
}

function falha(acao: string, r: { status: number; dados: Record<string, unknown> }): never {
  const msg = String((r.dados.error as { message?: string } | undefined)?.message ?? `HTTP ${r.status}`);
  logger.error(`Hosting customDomains: falha ao ${acao}`, { status: r.status, msg });
  throw new HttpsError("internal", `O Firebase Hosting recusou ${acao} o domínio: ${msg.slice(0, 200)}`);
}

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export const provedorHosting: ProvedorDominio = {
  async consultar(host) {
    const r = await chamarHosting("GET", `projects/${projeto()}/sites/${site()}/customDomains/${host}`);
    if (r.status === 404) return null;
    if (r.status >= 400) falha("consultar", r);
    const d = r.dados as DominioHosting;
    if (d.deleteTime) return null; // apagado (o Firebase guarda por 30 dias antes de sumir)
    return situacaoDoHosting(d);
  },

  async criar(host, opcoes = {}) {
    const caminho = `projects/${projeto()}/sites/${site()}/customDomains`;
    const r = await chamarHosting("POST", `${caminho}?customDomainId=${encodeURIComponent(host)}`, opcoes.redirecionarPara ? { redirectTarget: opcoes.redirecionarPara } : {});
    if (r.status === 409) {
      // Já existe: se estava apagado (até 30 dias), desfaz a remoção; senão, segue com o que existe
      const atual = await chamarHosting("GET", `${caminho}/${host}`);
      if ((atual.dados as DominioHosting).deleteTime) {
        const u = await chamarHosting("POST", `${caminho}/${host}:undelete`, {});
        if (u.status >= 400) falha("religar", u);
      }
    } else if (r.status >= 400) {
      falha("ligar", r);
    }
    // A criação é assíncrona: espera os registros de DNS aparecerem (até ~6 s); "Verificar agora" busca depois
    for (let i = 0; i < 4; i++) {
      const s = await this.consultar(host);
      if (s && s.registros.length) return s;
      await espera(1500);
    }
    return (await this.consultar(host)) ?? { estado: "pendente_dns", registros: [] };
  },

  async remover(host) {
    const r = await chamarHosting("DELETE", `projects/${projeto()}/sites/${site()}/customDomains/${host}`);
    if (r.status === 404) return;
    if (r.status >= 400) falha("remover", r);
  },
};

// ── Emulador (testes): registros fixos; fica "ativo" quando o teste grava _emulador/dominio-{host} { ativar: true } ──

const docEmulador = (host: string) => db.doc(`_emulador/dominio-${host}`);

export const provedorEmulador: ProvedorDominio = {
  async consultar(host) {
    const s = await docEmulador(host).get();
    if (!s.exists) return null;
    const raiz = apexDe(host) === host;
    const registros: SituacaoDominio["registros"] = raiz
      ? [
          { tipo: "A", nome: host, valor: "199.36.158.100", acao: "adicionar" },
          { tipo: "TXT", nome: host, valor: `hosting-site=${site()}`, acao: "adicionar" },
        ]
      : [{ tipo: "CNAME", nome: host, valor: `${site()}.web.app`, acao: "adicionar" }];
    if (s.get("ativar") === true) return { estado: "ativo", registros: registros.map((r) => ({ ...r, acao: "ok" as const })) };
    return { estado: "pendente_dns", registros };
  },
  async criar(host, opcoes = {}) {
    await docEmulador(host).set({ criado: true, redirecionarPara: opcoes.redirecionarPara ?? null }, { merge: true });
    return (await this.consultar(host))!;
  },
  async remover(host) {
    await docEmulador(host).delete();
  },
};

export const provedorDominio = (): ProvedorDominio => (process.env.FUNCTIONS_EMULATOR === "true" ? provedorEmulador : provedorHosting);
