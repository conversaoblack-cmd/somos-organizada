/** Contexto e utilidades compartilhadas do painel da plataforma. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, mensagemDeErro } from "@/lib/api";
import { nomePlanoSaas, normalizarPlano, PLANOS_SAAS_PADRAO, type PlanoSaas, type Stats, type StatusTorcida } from "@/lib/tipos";
import type { Tom } from "@/ui";

export type Resumo = Awaited<ReturnType<typeof api.resumoPlataforma>>;
export type LinhaTorcida = Resumo["torcidas"][number];

interface CtxResumo {
  resumo: Resumo | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

const Ctx = createContext<CtxResumo>({ resumo: null, carregando: true, erro: null, recarregar: async () => undefined });

export const useResumo = () => useContext(Ctx);

export function ProvedorResumo({ children }: { children: ReactNode }) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setResumo(await api.resumoPlataforma({}));
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    void recarregar();
  }, [recarregar]);
  return <Ctx.Provider value={{ resumo, carregando, erro, recarregar }}>{children}</Ctx.Provider>;
}

export const ROTULO_STATUS_TORCIDA: Record<StatusTorcida, string> = {
  implantacao: "Em implantação",
  ativa: "Ativa",
  suspensa: "Suspensa",
};
export const TOM_STATUS_TORCIDA: Record<StatusTorcida, Tom> = {
  implantacao: "info",
  ativa: "sucesso",
  suspensa: "perigo",
};

/** GMV = ingressos + sócios (centavos). */
export const gmv = (s: Stats | undefined) => (s?.receitaIngressos ?? 0) + (s?.receitaSocios ?? 0);

/** Converte o que vier (ms, Timestamp, {_seconds} serializado pela callable, ISO) em milissegundos. */
export function msDe(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v instanceof Date) return v.getTime();
  const o = v as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof o.toMillis === "function") return o.toMillis();
  if (typeof o._seconds === "number") return o._seconds * 1000;
  if (typeof o.seconds === "number") return o.seconds * 1000;
  return null;
}

/** "2026-10" → "out/26" */
export function rotuloMes(mes: string | undefined, longo = false): string {
  if (!mes) return "";
  const [a, m] = mes.split("-").map(Number);
  if (!a || !m) return mes;
  const d = new Date(a, m - 1, 15);
  if (longo) return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(d);
  return `${new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d).replace(".", "")}/${String(a).slice(2)}`;
}

export { slugDoNome, SLUG_VALIDO } from "@/modulos/inicio/planos";

/** Moeda compacta para KPIs grandes: R$ 12,3 mil */
export function moedaCompacta(centavos: number): string {
  if (Math.abs(centavos) < 1_000_000) return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(centavos / 100);
}

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export const numero = (n: number | undefined) => new Intl.NumberFormat("pt-BR").format(n ?? 0);

export interface AlertaSaude {
  tom: "alerta" | "perigo" | "info";
  titulo: string;
  detalhe: string;
  /** "mensalidades" leva à tela de Mensalidades; padrão: depuração da torcida */
  destino?: "mensalidades";
}

/** Alertas a partir do resumo (dashboard e lista). */
export function alertasDaTorcida(t: LinhaTorcida): AlertaSaude[] {
  const a: AlertaSaude[] = [];
  if (t.status === "ativa" && !t.pagamentos.configurado) {
    a.push({ tom: "perigo", titulo: "Ativa sem pagamentos", detalhe: "A torcida está ativa mas a conta Pagar.me não foi configurada." });
  }
  if (t.pagamentos.configurado && t.pagamentos.ambiente !== "demo" && !t.pagamentos.webhookRecebidoEm) {
    a.push({ tom: "alerta", titulo: "Nenhum webhook recebido", detalhe: "Pagamentos configurados, mas a Pagar.me nunca chamou o nosso webhook." });
  }
  if (t.saas?.situacao === "bloqueada" || t.saas?.bloqueada) {
    a.push({ tom: "perigo", titulo: "Bloqueada por mensalidade", detalhe: "Site fora do ar por atraso na mensalidade da plataforma. Confirme o Pix em Mensalidades.", destino: "mensalidades" });
  } else if (t.saas?.situacao === "atrasada") {
    a.push({ tom: "alerta", titulo: "Mensalidade atrasada", detalhe: "Fatura vencida. Após 7 dias de atraso o site sai do ar.", destino: "mensalidades" });
  }
  if (t.saas?.faturasAbertas.some((f) => f.informadoPagamentoEm)) {
    a.push({ tom: "info", titulo: "Pix informado", detalhe: "A diretoria avisou que pagou a mensalidade. Confira e confirme em Mensalidades.", destino: "mensalidades" });
  }
  if (t.status === "ativa" && t.pagamentos.configurado && t.pagamentos.ambiente === "teste") {
    a.push({ tom: "alerta", titulo: "Ambiente de teste", detalhe: "Torcida ativa usando chaves de teste: as vendas não são reais." });
  }
  return a;
}

// ── Mensalidade Somos Organizada ──────────────────────────
export type SituacaoSaas = NonNullable<LinhaTorcida["saas"]>["situacao"];
export const ROTULO_SITUACAO_SAAS: Record<SituacaoSaas, string> = {
  em_dia: "Em dia",
  aberta: "Fatura aberta",
  atrasada: "Atrasada",
  bloqueada: "Bloqueada",
};
export const TOM_SITUACAO_SAAS: Record<SituacaoSaas, Tom> = {
  em_dia: "sucesso",
  aberta: "info",
  atrasada: "alerta",
  bloqueada: "perigo",
};
/** Nome do plano Somos Organizada (aceita id antigo: pequena/grande/gigante). */
export const rotuloPlanoSaas = (plano: unknown) => nomePlanoSaas(plano);

/** Valor mensal previsto da torcida no plano Somos Organizada (preço configurado pela equipe). */
export function valorPlanoDaTorcida(t: LinhaTorcida, planos: Record<PlanoSaas, { valor: number }>): { plano: PlanoSaas; valor: number } | null {
  if (!t.saas) return null;
  const plano = normalizarPlano(t.saas.plano) ?? "pro";
  return { plano, valor: planos[plano].valor };
}

/** Uso da torcida contra o limite do plano: sócios que ocupam vaga e eventos à venda. */
export function usoDoPlanoDaTorcida(t: LinhaTorcida): { socios: number; eventos: number; limiteSocios: number; limiteEventos: number } | null {
  if (!t.saas) return null;
  const def = PLANOS_SAAS_PADRAO[normalizarPlano(t.saas.plano) ?? "pro"];
  const n = (v: number | undefined) => Math.max(0, v ?? 0);
  const s = t.geral.socios;
  return {
    socios: n(s?.ativo) + n(s?.inadimplente) + n(s?.em_analise),
    eventos: t.saas.eventosAVenda ?? 0,
    limiteSocios: def.socios,
    limiteEventos: def.eventos,
  };
}

export const ROTULO_AMBIENTE: Record<string, string> = { producao: "Produção", teste: "Teste", demo: "Demonstração" };
export const TOM_AMBIENTE: Record<string, Tom> = { producao: "sucesso", teste: "alerta", demo: "info" };
