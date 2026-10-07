/** Planos da mensalidade Somos Organizada (lidos de plataforma/publico, com os valores padrão como reserva). */
import { useDocumento } from "@/hooks/dados";
import { PLANOS_SAAS_PADRAO, type ConfigPlataforma, type PlanoSaas } from "@/lib/tipos";

export const ORDEM_PLANOS: PlanoSaas[] = ["pequena", "grande", "gigante"];
export const LIMITE_GIGANTE_PADRAO = 3000;

export interface PlanosSaas {
  planos: Record<PlanoSaas, { nome: string; valor: number; descricao: string }>;
  limiteGigante: number;
  pix: { chave: string; nome: string; cidade: string };
  carregando: boolean;
  config: ConfigPlataforma | null;
}

export function mesclarPlanos(c: ConfigPlataforma | null | undefined): Omit<PlanosSaas, "carregando" | "config"> {
  const planos = { ...PLANOS_SAAS_PADRAO };
  for (const k of ORDEM_PLANOS) {
    const v = Number(c?.planos?.[k]?.valor);
    if (Number.isInteger(v) && v > 0) planos[k] = { ...planos[k], valor: v };
  }
  const limiteGigante = Number(c?.limiteGigante) > 0 ? Number(c?.limiteGigante) : LIMITE_GIGANTE_PADRAO;
  planos.gigante = { ...planos.gigante, descricao: `Automático acima de ${limiteGigante.toLocaleString("pt-BR")} sócios ativos.` };
  return {
    planos,
    limiteGigante,
    pix: { chave: c?.pix?.chave ?? "", nome: c?.pix?.nome ?? "", cidade: c?.pix?.cidade ?? "" },
  };
}

/** Leitura pública de plataforma/publico (tempo real). */
export function usePlanosSaas(): PlanosSaas {
  const r = useDocumento<ConfigPlataforma>("plataforma/publico");
  return { ...mesclarPlanos(r.dados), carregando: r.carregando, config: r.dados };
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
