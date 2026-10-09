/** Planos da mensalidade Somos Organizada (lidos de plataforma/publico, com os valores padrão como reserva). */
import { useDocumento } from "@/hooks/dados";
import { ORDEM_PLANOS_SAAS, PLANOS_SAAS_PADRAO, normalizarPlano, type ConfigPlataforma, type DefinicaoPlanoSaas, type PlanoSaas } from "@/lib/tipos";

export const ORDEM_PLANOS: PlanoSaas[] = ORDEM_PLANOS_SAAS;

export interface PlanosSaas {
  planos: Record<PlanoSaas, DefinicaoPlanoSaas>;
  pix: { chave: string; nome: string; cidade: string };
  /** Nome do plano (aceita id antigo: pequena/grande/gigante). */
  nome: (plano: unknown) => string;
  /** Valor mensal em centavos do plano (aceita id antigo). */
  valor: (plano: unknown) => number;
  carregando: boolean;
  config: ConfigPlataforma | null;
}

/** Só o valor vem da configuração da equipe; nome, limites e descrição são fixos. */
export function mesclarPlanos(c: ConfigPlataforma | null | undefined): Omit<PlanosSaas, "carregando" | "config"> {
  const planos = { ...PLANOS_SAAS_PADRAO };
  for (const k of ORDEM_PLANOS) {
    const v = Number(c?.planos?.[k]?.valor);
    if (Number.isInteger(v) && v > 0) planos[k] = { ...planos[k], valor: v };
  }
  const de = (p: unknown) => planos[normalizarPlano(p) ?? "pro"];
  return {
    planos,
    pix: { chave: c?.pix?.chave ?? "", nome: c?.pix?.nome ?? "", cidade: c?.pix?.cidade ?? "" },
    nome: (p) => (normalizarPlano(p) ? de(p).nome : String(p ?? "")),
    valor: (p) => de(p).valor,
  };
}

/** Leitura pública de plataforma/publico (tempo real). Único hook de planos do sistema. */
export function usePlanosSaas(): PlanosSaas {
  const r = useDocumento<ConfigPlataforma>("plataforma/publico");
  return { ...mesclarPlanos(r.dados), carregando: r.carregando, config: r.dados };
}

/** Próximo plano maior (para "mude para o Torcida Plus"); null no maior. */
export function planoAcima(plano: PlanoSaas): PlanoSaas | null {
  return ORDEM_PLANOS[ORDEM_PLANOS.indexOf(plano) + 1] ?? null;
}

/** "Torcida Jovem São João" → "torcida-jovem-sao-joao" */
export function slugDoNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
export const SLUG_VALIDO = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
