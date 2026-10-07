import { createContext, useContext } from "react";
import type { AssinaturaSaas, ComId, Membro, Papel, Sede, Torcida } from "@/lib/tipos";
import type { ItemPrimeiroPasso } from "./PrimeirosPassos";

export interface ContextoPainel {
  tid: string;
  torcida: ComId<Torcida>;
  uid: string;
  membro: Membro;
  papel: Papel;
  ehDiretoria: boolean;
  /** Sede do membro quando o escopo é restrito (subsede/portaria); null = toda a torcida. */
  sedeEscopo: string | null;
  sedes: ComId<Sede>[];
  nomeSede: (id: string | undefined | null) => string;
  /** "/brasil/admin" */
  base: string;
  /** Percentual da taxa de serviço (padrão 10). */
  pct: number;
  /** Sócios aguardando aprovação no escopo do usuário. */
  emAnalise: number;
  /** Eventos de subsede aguardando aprovação da diretoria (0 para outros papéis). */
  emAprovacao: number;
  /** Regra do Firestore: evento de subsede só é publicado com a conta de recebimento ativa. */
  podePublicarNaSede: (sedeId: string | undefined | null) => boolean;
  /** Primeiros passos com status calculado (diretoria e subsede). */
  primeirosPassos: ItemPrimeiroPasso[];
  /** Mensalidade Somos Organizada (só a diretoria lê). */
  assinatura: ComId<AssinaturaSaas> | null;
  /** Modo demonstração (chaves sk_demo_): nenhum pagamento é real. */
  demo: boolean;
}

export const CtxPainel = createContext<ContextoPainel | null>(null);

export function usePainel(): ContextoPainel {
  const c = useContext(CtxPainel);
  if (!c) throw new Error("usePainel fora do painel");
  return c;
}

export const ROTULO_PAPEL: Record<Papel, string> = {
  diretoria: "Diretoria",
  subsede: "Subsede",
  portaria: "Portaria",
};
