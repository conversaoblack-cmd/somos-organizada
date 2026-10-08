import { rp } from "@/lib/hosts";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { moeda, relativo } from "@/lib/formatos";
import type { Stats } from "@/lib/tipos";
import { Aviso, Botao, CabecalhoPagina, Cartao, Carregando, cx, Icone, Indicador, Selo, Vazio } from "@/ui";
import { alertasDaTorcida, gmv, moedaCompacta, numero, plural, rotuloMes, ROTULO_STATUS_TORCIDA, TOM_STATUS_TORCIDA, useResumo, valorPlanoDaTorcida } from "./comum";
import { usePlanosSaas } from "@/modulos/inicio/planos";

function somar(lista: (Stats | undefined)[]) {
  const t = { ingressos: 0, socios: 0, taxa: 0, ingressosQtd: 0, pedidos: 0, novosSocios: 0, sociosAtivos: 0 };
  for (const s of lista) {
    t.ingressos += s?.receitaIngressos ?? 0;
    t.socios += s?.receitaSocios ?? 0;
    t.taxa += s?.taxaServico ?? 0;
    t.ingressosQtd += s?.ingressosQtd ?? 0;
    t.pedidos += s?.pedidosPagos ?? 0;
    t.novosSocios += s?.novosSocios ?? 0;
    t.sociosAtivos += s?.socios?.ativo ?? 0;
  }
  return t;
}

export default function Dashboard() {
  const { resumo, carregando, erro, recarregar } = useResumo();
  const cfg = usePlanosSaas();

  const kpi = useMemo(() => {
    if (!resumo) return null;
    const ts = resumo.torcidas;
    const mes = somar(ts.map((t) => t.mes));
    const geral = somar(ts.map((t) => t.geral));
    const ativas = ts.filter((t) => t.status === "ativa");
    return {
      mes,
      geral,
      ativas: ativas.length,
      implantacao: ts.filter((t) => t.status === "implantacao").length,
      suspensas: ts.filter((t) => t.status === "suspensa").length,
      mrr: ts.reduce((s, t) => s + (t.saas && !t.saas.bloqueada ? (valorPlanoDaTorcida(t, cfg.planos, cfg.limiteGigante)?.valor ?? 0) : 0), 0),
      assinantes: ts.filter((t) => t.saas && !t.saas.bloqueada).length,
      atrasadas: ts.filter((t) => t.saas && (t.saas.situacao === "atrasada" || t.saas.situacao === "bloqueada")).length,
      publicadas: ts.filter((t) => t.publicada).length,
      chamados: ts.reduce((s, t) => s + (t.chamadosAbertos ?? 0), 0),
      ranking: [...ts].sort((a, b) => gmv(b.mes) - gmv(a.mes)).slice(0, 8),
      alertas: ts.flatMap((t) => alertasDaTorcida(t).map((a) => ({ ...a, torcida: t }))),
    };
  }, [resumo, cfg.planos, cfg.limiteGigante]);

  return (
    <>
      <CabecalhoPagina
        titulo="Visão geral"
        descricao={resumo ? `Consolidado de ${resumo.torcidas.length} torcidas · ${rotuloMes(resumo.mes, true)}` : "Consolidado de todas as torcidas"}
        acoes={
          <Botao variante="contorno" tamanho="sm" icone="atualizar" carregando={carregando} onClick={recarregar}>
            Atualizar
          </Botao>
        }
      />
      {erro && <Aviso tom="perigo" titulo="Não foi possível carregar o resumo" className="mb-6">{erro}</Aviso>}
      {!resumo && carregando && <Carregando texto="Somando os números das torcidas…" />}
      {resumo && kpi && (
        <div className="space-y-8">
          {resumo.solicitacoesPendentes > 0 && (
            <Aviso
              tom="info"
              titulo={`${plural(resumo.solicitacoesPendentes, "cadastro de torcida aguardando", "cadastros de torcida aguardando")} aprovação`}
              acao={
                <Link to={rp("/solicitacoes")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primaria hover:underline">
                  Ver solicitações <Icone nome="setaDireita" className="size-4" />
                </Link>
              }
            >
              Torcidas que se cadastraram pela página principal e esperam a análise da equipe.
            </Aviso>
          )}
          <section aria-labelledby="t-mes">
            <h2 id="t-mes" className="text-sm font-semibold uppercase tracking-wide text-texto-3 mb-3">
              Este mês · {rotuloMes(resumo.mes, true)}
            </h2>
            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
              <Indicador
                rotulo="GMV (ingressos + sócios)"
                valor={moedaCompacta(kpi.mes.ingressos + kpi.mes.socios)}
                detalhe={`${moeda(kpi.mes.ingressos)} ingressos · ${moeda(kpi.mes.socios)} sócios`}
                icone="dinheiro"
                tom="primaria"
              />
              <Indicador rotulo="Taxa de serviço gerada" valor={moedaCompacta(kpi.mes.taxa)} detalhe="Vai para o caixa das torcidas" icone="grafico" tom="info" />
              <Indicador rotulo="Ingressos vendidos" valor={numero(kpi.mes.ingressosQtd)} detalhe={`${numero(kpi.mes.pedidos)} pedidos pagos`} icone="ingresso" />
              <Indicador
                rotulo="MRR da plataforma"
                valor={moedaCompacta(kpi.mrr)}
                detalhe={
                  <Link to={rp("/mensalidades")} className="hover:text-texto">
                    {plural(kpi.assinantes, "assinatura", "assinaturas")}
                    {kpi.atrasadas ? ` · ${kpi.atrasadas} em atraso` : ""}
                  </Link>
                }
                icone="escudo"
                tom={kpi.atrasadas ? "alerta" : "sucesso"}
              />
            </div>
          </section>

          <section aria-labelledby="t-geral">
            <h2 id="t-geral" className="text-sm font-semibold uppercase tracking-wide text-texto-3 mb-3">
              Acumulado e operação
            </h2>
            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
              <Indicador rotulo="GMV acumulado" valor={moedaCompacta(kpi.geral.ingressos + kpi.geral.socios)} detalhe={`Taxa acumulada ${moeda(kpi.geral.taxa)}`} icone="dinheiro" />
              <Indicador rotulo="Sócios ativos" valor={numero(kpi.geral.sociosAtivos)} detalhe={`${numero(kpi.mes.novosSocios)} novos este mês`} icone="usuarios" />
              <Indicador
                rotulo="Torcidas"
                valor={
                  <span>
                    {kpi.ativas}
                    <span className="text-base font-semibold text-texto-3"> {kpi.ativas === 1 ? "ativa" : "ativas"}</span>
                  </span>
                }
                detalhe={`${kpi.publicadas} no ar · ${kpi.implantacao} em implantação${kpi.suspensas ? ` · ${kpi.suspensas} suspensas` : ""}`}
                icone="bandeira"
              />
              <Indicador
                rotulo="Chamados abertos"
                valor={numero(kpi.chamados)}
                detalhe={<Link to={rp("/suporte")} className="underline hover:text-texto">Abrir central de suporte</Link>}
                icone="chat"
                tom={kpi.chamados ? "alerta" : undefined}
              />
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Cartao className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-bold">GMV por mês</h2>
                  <p className="text-sm text-texto-3">Todas as torcidas · até 12 meses · passe o mouse ou toque nas barras</p>
                </div>
              </div>
              <GraficoHistorico historico={resumo.historico} />
            </Cartao>

            <Cartao className="p-5 sm:p-6">
              <h2 className="font-bold">Ranking do mês</h2>
              <p className="text-sm text-texto-3 mb-4">Receita (ingressos + sócios) de cada torcida</p>
              {kpi.ranking.length === 0 ? (
                <p className="text-sm text-texto-3">Nenhuma torcida cadastrada.</p>
              ) : (
                <ol className="space-y-3">
                  {kpi.ranking.map((t, i) => {
                    const max = Math.max(1, gmv(kpi.ranking[0]!.mes));
                    const v = gmv(t.mes);
                    return (
                      <li key={t.id}>
                        <Link to={rp(`/torcidas/${t.id}`)} className="group block">
                          <div className="flex items-center gap-3 text-sm">
                            <span className="w-5 text-texto-3 numeros">{i + 1}º</span>
                            <span className="flex-1 truncate font-medium group-hover:underline">{t.nome}</span>
                            <span className="numeros font-semibold">{moeda(v)}</span>
                          </div>
                          <div className="ml-8 mt-1.5 h-1.5 rounded-full bg-superficie-2 overflow-hidden">
                            <div className="h-full rounded-full bg-primaria" style={{ width: `${(v / max) * 100}%` }} />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Cartao>
          </div>

          <section aria-labelledby="t-saude">
            <h2 id="t-saude" className="font-bold mb-3 flex items-center gap-2">
              Alertas de saúde
              {kpi.alertas.length > 0 && <Selo tom="alerta">{kpi.alertas.length}</Selo>}
            </h2>
            {kpi.alertas.length === 0 ? (
              <Cartao>
                <Vazio icone="checkCirculo" titulo="Tudo em ordem">
                  Nenhuma torcida com pagamentos pendentes, webhook parado, ambiente de teste ou mensalidade em atraso.
                </Vazio>
              </Cartao>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {kpi.alertas.map((a, i) => (
                  <Link
                    key={i}
                    to={a.destino === "mensalidades" ? rp("/mensalidades") : rp(`/torcidas/${a.torcida.id}/depuracao`)}
                    className={cx(
                      "flex gap-3 rounded-2xl border p-4 transition-colors hover:bg-superficie-2",
                      a.tom === "perigo" ? "border-perigo/30 bg-perigo/8" : a.tom === "info" ? "border-info/30 bg-info/8" : "border-alerta/30 bg-alerta/8",
                    )}
                  >
                    <Icone nome={a.tom === "info" ? "info" : "alerta"} className={cx("size-5 shrink-0 mt-0.5", a.tom === "perigo" ? "text-perigo" : a.tom === "info" ? "text-info" : "text-alerta")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{a.torcida.nome}</span>
                        <Selo tom={TOM_STATUS_TORCIDA[a.torcida.status]}>{ROTULO_STATUS_TORCIDA[a.torcida.status]}</Selo>
                      </span>
                      <span className="block text-sm font-medium mt-1">{a.titulo}</span>
                      <span className="block text-sm text-texto-2">{a.detalhe}</span>
                      {a.torcida.pagamentos.webhookRecebidoEm && (
                        <span className="block text-xs text-texto-3 mt-1">Último webhook {relativo(a.torcida.pagamentos.webhookRecebidoEm)}</span>
                      )}
                    </span>
                    <Icone nome="chevronDireita" className="size-5 text-texto-3 self-center" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

/** Barras empilhadas (ingressos + sócios) em SVG próprio, com tooltip e tabela acessível. */
function GraficoHistorico({ historico }: { historico: Stats[] }) {
  const meses = useMemo(() => [...historico].filter((h) => h.mes).sort((a, b) => (a.mes! < b.mes! ? -1 : 1)).slice(-12), [historico]);
  const [foco, setFoco] = useState<number | null>(null);

  if (!meses.length) {
    return <p className="text-sm text-texto-3 py-10 text-center">Ainda não há vendas registradas.</p>;
  }

  const L = 520;
  const A = 220;
  const m = { topo: 14, dir: 6, base: 26, esq: 62 };
  const larg = L - m.esq - m.dir;
  const alt = A - m.topo - m.base;
  const maxBruto = Math.max(...meses.map((h) => gmv(h)), 1);
  const passo = escalaBonita(maxBruto);
  const max = Math.ceil(maxBruto / passo) * passo;
  const linhas = Array.from({ length: Math.round(max / passo) + 1 }, (_, i) => i * passo);
  const banda = larg / meses.length;
  const barra = Math.min(32, banda * 0.62);
  const y = (v: number) => m.topo + alt - (v / max) * alt;
  const sel = foco !== null ? meses[foco] : null;

  return (
    <div>
      <div className="flex flex-wrap gap-4 text-xs text-texto-2 mb-3" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primaria" /> Ingressos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-info" /> Sócios
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${L} ${A}`} className="w-full h-auto" role="img" aria-label="GMV mensal de todas as torcidas" onMouseLeave={() => setFoco(null)}>
          {linhas.map((v) => (
            <g key={v}>
              <line x1={m.esq} x2={L - m.dir} y1={y(v)} y2={y(v)} className="stroke-linha" strokeWidth={1} />
              <text x={m.esq - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-texto-3 text-[12px] numeros">
                {eixo(v)}
              </text>
            </g>
          ))}
          {meses.map((h, i) => {
            const x = m.esq + banda * i + (banda - barra) / 2;
            const ing = h.receitaIngressos ?? 0;
            const soc = h.receitaSocios ?? 0;
            const hIng = (ing / max) * alt;
            const hSoc = (soc / max) * alt;
            const ativo = foco === null || foco === i;
            const gap = hIng > 0 && hSoc > 0 ? 2 : 0;
            return (
              <g key={h.mes} opacity={ativo ? 1 : 0.45}>
                {hIng > 0 && <rect x={x} y={y(ing)} width={barra} height={hIng} rx={hSoc > 0 ? 0 : 4} className="fill-primaria" />}
                {hSoc > 0 && (
                  <rect x={x} y={y(ing + soc)} width={barra} height={Math.max(0, hSoc - gap)} rx={4} className="fill-info" />
                )}
                <text x={x + barra / 2} y={A - 8} textAnchor="middle" className="fill-texto-3 text-[12px]">
                  {rotuloMes(h.mes)}
                </text>
                <rect
                  x={m.esq + banda * i}
                  y={m.topo}
                  width={banda}
                  height={alt + m.base}
                  fill="transparent"
                  onMouseEnter={() => setFoco(i)}
                  onClick={() => setFoco(foco === i ? null : i)}
                />
              </g>
            );
          })}
        </svg>
        {sel && foco !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-xl border border-linha bg-fundo/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
            style={{ left: `clamp(0px, calc(${((m.esq + banda * foco + banda / 2) / L) * 100}% - 80px), calc(100% - 170px))`, width: 170 }}
          >
            <p className="font-semibold mb-1 capitalize">{rotuloMes(sel.mes, true)}</p>
            <p className="flex justify-between gap-2">
              <span className="text-texto-2">Ingressos</span>
              <span className="numeros">{moeda(sel.receitaIngressos)}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-texto-2">Sócios</span>
              <span className="numeros">{moeda(sel.receitaSocios)}</span>
            </p>
            <p className="flex justify-between gap-2 border-t border-linha mt-1 pt-1">
              <span className="text-texto-2">Taxa de serviço</span>
              <span className="numeros">{moeda(sel.taxaServico)}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-texto-2">Ingressos vendidos</span>
              <span className="numeros">{numero(sel.ingressosQtd)}</span>
            </p>
          </div>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-texto-3 hover:text-texto-2">Ver como tabela</summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left numeros">
            <thead className="text-texto-3 text-xs">
              <tr>
                <th className="py-1.5 font-medium">Mês</th>
                <th className="py-1.5 font-medium text-right">Ingressos</th>
                <th className="py-1.5 font-medium text-right">Sócios</th>
                <th className="py-1.5 font-medium text-right">Taxa</th>
                <th className="py-1.5 font-medium text-right">Qtd.</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((h) => (
                <tr key={h.mes} className="border-t border-linha">
                  <td className="py-1.5">{rotuloMes(h.mes)}</td>
                  <td className="py-1.5 text-right">{moeda(h.receitaIngressos)}</td>
                  <td className="py-1.5 text-right">{moeda(h.receitaSocios)}</td>
                  <td className="py-1.5 text-right">{moeda(h.taxaServico)}</td>
                  <td className="py-1.5 text-right">{numero(h.ingressosQtd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Passo "redondo" para as linhas de grade (~4 linhas). */
function escalaBonita(max: number): number {
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / pot;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pot;
}

const eixo = (centavos: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(centavos / 100);
