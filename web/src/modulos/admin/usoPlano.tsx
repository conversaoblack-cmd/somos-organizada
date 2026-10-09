/**
 * Uso do plano Somos Organizada (Torcida Pro, Plus ou Max) no painel da diretoria.
 *  - Sócios que ocupam vaga: ativo + inadimplente + em análise (contador stats/geral, sem ler as fichas).
 *  - Eventos à venda: publicados com data no futuro (contagem no servidor).
 * Aviso amarelo a partir de 90% e vermelho no limite. Os limites só valem depois de publicar o site (assinatura).
 */
import { useMemo, useState } from "react";
import { Timestamp, where } from "firebase/firestore";
import { useDocumento } from "@/hooks/dados";
import { normalizarPlano, type PlanoSaas, type Stats } from "@/lib/tipos";
import { Aviso, BotaoLink, Botao, Cartao, cx, Modal } from "@/ui";
import { planoAcima, usePlanosSaas } from "@/modulos/inicio/planos";
import { usePainel } from "./contexto";
import { contarNoServidor, numero, useAgregado } from "./util";

export type NivelUso = "ok" | "alerta" | "limite";

export function nivelDeUso(uso: number, limite: number): NivelUso {
  if (uso >= limite) return "limite";
  if (uso >= limite * 0.9) return "alerta";
  return "ok";
}

export function sociosQueOcupamVaga(s: Stats["socios"] | undefined): number {
  const n = (v: number | undefined) => Math.max(0, v ?? 0);
  return n(s?.ativo) + n(s?.inadimplente) + n(s?.em_analise);
}

export interface UsoDoPlano {
  carregando: boolean;
  /** Plano da assinatura (ou o escolhido, antes de publicar). */
  plano: PlanoSaas;
  nomePlano: string;
  limites: { socios: number; eventos: number };
  socios: number;
  /** null enquanto a contagem no servidor não chega. */
  eventos: number | null;
  nivelSocios: NivelUso;
  nivelEventos: NivelUso;
  /** Plano maior para sugerir (null no Torcida Max). */
  acima: PlanoSaas | null;
  nomeAcima: string | null;
}

/**
 * Uso atual da torcida. Lê só com a diretoria; `mesmoSemAssinatura` serve para a tela de publicar
 * (antes de existir assinatura) mostrar o que cabe em cada plano.
 */
export function useUsoDoPlano({ ativo = true, mesmoSemAssinatura = false, plano: escolhido }: { ativo?: boolean; mesmoSemAssinatura?: boolean; plano?: PlanoSaas | null } = {}): UsoDoPlano | null {
  const { tid, ehDiretoria, assinatura } = usePainel();
  const planos = usePlanosSaas();
  const ligado = ativo && ehDiretoria && (!!assinatura || mesmoSemAssinatura);
  const geral = useDocumento<Stats>(ligado ? `torcidas/${tid}/stats/geral` : null);
  const agora = useMemo(() => Timestamp.now(), []);
  const eventos = useAgregado(
    ligado ? () => contarNoServidor(`torcidas/${tid}/eventos`, where("status", "==", "publicado"), where("data", ">=", agora)) : null,
    `eventos-a-venda-${tid}`,
  );
  if (!ligado) return null;
  const plano = normalizarPlano(assinatura?.plano) ?? escolhido ?? "pro";
  const def = planos.planos[plano];
  const socios = sociosQueOcupamVaga(geral.dados?.socios);
  const acima = planoAcima(plano);
  return {
    carregando: geral.carregando || eventos.carregando,
    plano,
    nomePlano: def.nome,
    limites: { socios: def.socios, eventos: def.eventos },
    socios,
    eventos: eventos.dados,
    nivelSocios: nivelDeUso(socios, def.socios),
    nivelEventos: eventos.dados === null ? "ok" : nivelDeUso(eventos.dados, def.eventos),
    acima,
    nomeAcima: acima ? planos.planos[acima].nome : null,
  };
}

/** Texto curto do que fazer quando o uso chega no limite. */
export function textoLimite(uso: UsoDoPlano, tipo: "socios" | "eventos"): string {
  const mudar = uso.nomeAcima ? `mude para o ${uso.nomeAcima}` : "fale com a equipe Somos Organizada";
  if (tipo === "socios") {
    return uso.nivelSocios === "limite"
      ? `Novas adesões pausadas: ${mudar}.`
      : `Perto do limite de sócios do ${uso.nomePlano}. Quando chegar em ${numero(uso.limites.socios)}, novas adesões param.`;
  }
  return uso.nivelEventos === "limite"
    ? `Limite de eventos à venda: encerre um evento ou ${mudar}.`
    : `Perto do limite de eventos à venda do ${uso.nomePlano}.`;
}

const COR: Record<NivelUso, string> = { ok: "bg-primaria", alerta: "bg-alerta", limite: "bg-perigo" };

function Medidor({ rotulo, uso, limite, nivel }: { rotulo: string; uso: number | null; limite: number; nivel: NivelUso }) {
  const pct = uso === null ? 0 : Math.min(100, Math.round((uso / limite) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{rotulo}</p>
        <p className={cx("numeros text-sm", nivel === "limite" ? "text-perigo font-semibold" : nivel === "alerta" ? "text-alerta font-semibold" : "text-texto-2")}>
          {uso === null ? "…" : numero(uso)} de {numero(limite)}
        </p>
      </div>
      <div
        className="mt-2 h-2 rounded-full bg-superficie-3 overflow-hidden"
        role="meter"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={uso ?? 0}
        aria-valuetext={uso === null ? "carregando" : `${uso} de ${limite}`}
      >
        <div className={cx("h-full rounded-full", COR[nivel])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** "Sócios: 285 de 300" e "Eventos à venda: 2 de 3", com os avisos de 90% e de limite. */
export function UsoDoPlanoCartao({ uso, className }: { uso: UsoDoPlano; className?: string }) {
  const avisos = (["socios", "eventos"] as const).filter((t) => (t === "socios" ? uso.nivelSocios : uso.nivelEventos) !== "ok");
  return (
    <Cartao className={cx("p-5 sm:p-6", className)} data-tour="plano-uso">
      <h2 className="font-bold text-lg">Uso do plano {uso.nomePlano}</h2>
      <p className="text-sm text-texto-3 mt-0.5 mb-4">Sócios ativos, em análise e em atraso ocupam vaga. Eventos à venda são os publicados com data no futuro.</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <Medidor rotulo="Sócios" uso={uso.socios} limite={uso.limites.socios} nivel={uso.nivelSocios} />
        <Medidor rotulo="Eventos à venda" uso={uso.eventos} limite={uso.limites.eventos} nivel={uso.nivelEventos} />
      </div>
      {avisos.length > 0 && (
        <div className="mt-4 space-y-2">
          {avisos.map((t) => {
            const nivel = t === "socios" ? uso.nivelSocios : uso.nivelEventos;
            return (
              <Aviso key={t} tom={nivel === "limite" ? "perigo" : "alerta"}>
                {textoLimite(uso, t)}
              </Aviso>
            );
          })}
        </div>
      )}
    </Cartao>
  );
}

/** Erro do servidor por limite do plano (publicarEvento, aderirSocio, troca de plano). */
export function ehErroDeLimitePlano(e: unknown): boolean {
  const d = (e as { details?: { limitePlano?: unknown } } | null)?.details;
  return !!d && typeof d.limitePlano === "string";
}

/** Janela para o erro de limite do plano, com o caminho para trocar de plano. */
export function useJanelaLimitePlano() {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const { base } = usePainel();
  const janela = (
    <Modal
      aberto={!!mensagem}
      fechar={() => setMensagem(null)}
      titulo="Limite do plano"
      largura="max-w-md"
      rodape={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Botao variante="fantasma" onClick={() => setMensagem(null)}>
            Agora não
          </Botao>
          <BotaoLink to={`${base}/plano`} iconeDireita="setaDireita" onClick={() => setMensagem(null)}>
            Ver Plano Somos Organizada
          </BotaoLink>
        </div>
      }
    >
      <p className="text-texto-2 text-[15px] leading-relaxed">{mensagem}</p>
    </Modal>
  );
  return { mostrar: setMensagem, janela };
}

/** Aviso na lista de sócios quando o plano está perto do limite ou já chegou nele. */
export function AvisoLimiteSocios({ className }: { className?: string }) {
  const uso = useUsoDoPlano();
  const { base } = usePainel();
  if (!uso || uso.nivelSocios === "ok") return null;
  return (
    <Aviso
      tom={uso.nivelSocios === "limite" ? "perigo" : "alerta"}
      className={className}
      titulo={`Sócios: ${numero(uso.socios)} de ${numero(uso.limites.socios)} no plano ${uso.nomePlano}`}
      acao={
        <BotaoLink to={`${base}/plano`} tamanho="sm" variante="contorno" iconeDireita="setaDireita">
          Ver plano
        </BotaoLink>
      }
    >
      {textoLimite(uso, "socios")}
    </Aviso>
  );
}
