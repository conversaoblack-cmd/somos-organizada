import { useMemo } from "react";
import { Link } from "react-router";
import { collection, documentId, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { dataExtensa, diaDoMes, hora, mesAbrev, moeda, relativo, ROTULO_STATUS_SOCIO } from "@/lib/formatos";
import type { Evento, Lancamento, Pedido, Repasse, Socio, Stats, StatusSocio } from "@/lib/tipos";
import { useColecao, useDocumento } from "@/hooks/dados";
import { Aviso, BotaoLink, CabecalhoPagina, Cartao, Carregando, Icone, Indicador, Selo } from "@/ui";
import { usePainel } from "./contexto";
import { GraficoReceita, type PontoReceita } from "./Grafico";
import { CartaoPrimeirosPassos } from "./PrimeirosPassos";
import { useTourPagina } from "./tours";
import { BarraOcupacao, EstadoLista, mesAtualSP, rotuloMes, ultimosMeses } from "./util";

const ORDEM_STATUS: StatusSocio[] = ["ativo", "em_analise", "inadimplente", "pendente_pagamento", "suspenso", "cancelado"];
const COR_STATUS: Record<StatusSocio, string> = {
  ativo: "bg-sucesso",
  em_analise: "bg-info",
  inadimplente: "bg-alerta",
  pendente_pagamento: "bg-texto-3",
  suspenso: "bg-perigo",
  cancelado: "bg-superficie-3",
};

interface Resumo {
  mes: Stats;
  geral: Stats;
  historico: PontoReceita[];
  carregando: boolean;
  erro: Error | null;
}

/** Números da torcida inteira (diretoria): stats/geral e stats/{mês}. */
function useResumoDiretoria(ativo: boolean): Resumo {
  const { tid } = usePainel();
  const meses = useMemo(() => ultimosMeses(6), []);
  const mes = meses[meses.length - 1]!;
  const geral = useDocumento<Stats>(ativo ? `torcidas/${tid}/stats/geral` : null);
  const hist = useColecao<Stats>(
    ativo ? query(collection(db, `torcidas/${tid}/stats`), where(documentId(), "in", meses)) : null,
    `stats-hist-${tid}-${mes}-${ativo}`,
  );
  return {
    mes: hist.dados.find((s) => s.id === mes) ?? {},
    geral: geral.dados ?? {},
    historico: meses.map((m) => {
      const s = hist.dados.find((x) => x.id === m);
      return { rotulo: rotuloMes(m), ingressos: s?.receitaIngressos ?? 0, socios: s?.receitaSocios ?? 0 };
    }),
    carregando: geral.carregando || hist.carregando,
    erro: geral.erro || hist.erro,
  };
}

/** Números da subsede: calculados a partir dos lançamentos e sócios da própria sede. */
function useResumoSubsede(sedeId: string | null): Resumo & { socios: (Socio & { id: string })[]; saldo: number } {
  const { tid } = usePainel();
  const meses = useMemo(() => ultimosMeses(6), []);
  const mes = meses[meses.length - 1]!;
  const lanc = useColecao<Lancamento>(
    sedeId ? query(collection(db, `torcidas/${tid}/lancamentos`), where("sedeId", "==", sedeId)) : null,
    `lanc-sede-${tid}-${sedeId}`,
  );
  const socios = useColecao<Socio>(
    sedeId ? query(collection(db, `torcidas/${tid}/socios`), where("sedeId", "==", sedeId)) : null,
    `socios-sede-${tid}-${sedeId}`,
  );
  const repasses = useColecao<Repasse>(
    sedeId ? query(collection(db, `torcidas/${tid}/repasses`), where("sedeId", "==", sedeId)) : null,
    `repasses-sede-${tid}-${sedeId}`,
  );
  return useMemo(() => {
    const soma = (filtro: (l: Lancamento) => boolean) => lanc.dados.filter(filtro).reduce((s, l) => s + l.valor, 0);
    const base = (l: Lancamento) => l.natureza === "base";
    const porMes = (m: string | null): Stats => ({
      receitaIngressos: soma((l) => base(l) && l.origem === "ingresso" && (!m || l.competencia === m)),
      receitaSocios: soma((l) => base(l) && l.origem === "socio" && (!m || l.competencia === m)),
      taxaServico: soma((l) => l.natureza === "taxa" && (!m || l.competencia === m)),
    });
    const contagem: Partial<Record<StatusSocio, number>> = {};
    for (const s of socios.dados) contagem[s.status] = (contagem[s.status] ?? 0) + 1;
    const novos = socios.dados.filter((s) => s.criadoEm && mesAtualSP(s.criadoEm.toDate()) === mes && s.status !== "pendente_pagamento").length;
    return {
      mes: { ...porMes(mes), novosSocios: novos },
      geral: { ...porMes(null), socios: contagem },
      historico: meses.map((m) => {
        const s = porMes(m);
        return { rotulo: rotuloMes(m), ingressos: s.receitaIngressos ?? 0, socios: s.receitaSocios ?? 0 };
      }),
      carregando: lanc.carregando || socios.carregando,
      erro: lanc.erro || socios.erro,
      socios: socios.dados,
      // O que caiu direto na conta da subsede (split) não entra no repasse.
      saldo: soma((l) => base(l) && l.liquidacao !== "split") - repasses.dados.reduce((s, r) => s + r.valor, 0),
    };
  }, [lanc, socios, repasses, mes, meses]);
}

export default function VisaoGeral() {
  const { tid, torcida, ehDiretoria, sedeEscopo, nomeSede, base, emAnalise, emAprovacao, membro, sedes, podePublicarNaSede } = usePainel();
  useTourPagina("visao-geral");
  const dir = useResumoDiretoria(ehDiretoria);
  const sub = useResumoSubsede(ehDiretoria ? null : sedeEscopo);
  const r = ehDiretoria ? dir : sub;

  const agora = useMemo(() => Timestamp.now(), []);
  const eventosQ = useColecao<Evento>(
    ehDiretoria
      ? query(collection(db, `torcidas/${tid}/eventos`), where("data", ">=", agora), orderBy("data"), limit(8))
      : sedeEscopo
        ? query(collection(db, `torcidas/${tid}/eventos`), where("sedeId", "==", sedeEscopo), orderBy("data", "desc"), limit(40))
        : null,
    `vg-eventos-${tid}-${sedeEscopo}`,
  );
  const proximos = useMemo(
    () =>
      eventosQ.dados
        .filter((e) => e.data.toMillis() >= agora.toMillis() && e.status !== "cancelado")
        .sort((a, b) => a.data.toMillis() - b.data.toMillis())
        .slice(0, 4),
    [eventosQ.dados, agora],
  );
  const ingressosSubsede = eventosQ.dados.reduce((s, e) => s + (e.vendidos ?? 0), 0);

  const pedidosQ = useColecao<Pedido>(
    ehDiretoria
      ? query(collection(db, `torcidas/${tid}/pedidos`), orderBy("criadoEm", "desc"), limit(30))
      : sedeEscopo
        ? query(collection(db, `torcidas/${tid}/pedidos`), where("sedeId", "==", sedeEscopo), orderBy("criadoEm", "desc"), limit(30))
        : null,
    `vg-pedidos-${tid}-${sedeEscopo}`,
  );
  const pagos = pedidosQ.dados.filter((p) => p.status === "pago").slice(0, 6);

  const socios = r.geral.socios ?? {};
  const totalSocios = ORDEM_STATUS.reduce((s, k) => s + Math.max(0, socios[k] ?? 0), 0);
  const pag = torcida.pagamentos;

  const pendencias: { tom: "alerta" | "info" | "perigo"; titulo: string; texto: string; para: string; acao: string }[] = [];
  if (ehDiretoria && !pag?.configurado)
    pendencias.push({ tom: "perigo", titulo: "Pagamentos não configurados", texto: "Sem a Pagar.me conectada, ninguém consegue comprar ingresso nem virar sócio.", para: `${base}/pagamentos`, acao: "Conectar Pagar.me" });
  if (ehDiretoria && pag?.configurado && !pag.webhookRecebidoEm)
    pendencias.push({ tom: "alerta", titulo: "Webhook nunca recebido", texto: "Sem o webhook, pagamentos por Pix podem demorar a confirmar. Confira o passo 5 em Pagamentos.", para: `${base}/pagamentos`, acao: "Ver instruções" });
  if (ehDiretoria && pag?.configurado && pag.ambiente === "teste")
    pendencias.push({ tom: "info", titulo: "Pagar.me em modo de teste", texto: "As vendas não são reais. Quando estiver tudo certo, cole as chaves de produção.", para: `${base}/pagamentos`, acao: "Ir para Pagamentos" });
  if (ehDiretoria && emAprovacao > 0)
    pendencias.push({
      tom: "alerta",
      titulo: `${emAprovacao} ${emAprovacao === 1 ? "evento aguardando" : "eventos aguardando"} aprovação`,
      texto: "Subsedes enviaram eventos para você conferir e publicar.",
      para: `${base}/eventos?status=em_aprovacao`,
      acao: "Revisar eventos",
    });
  const minhaSede = sedeEscopo ? sedes.find((s) => s.id === sedeEscopo) : undefined;
  if (!ehDiretoria && minhaSede && !podePublicarNaSede(sedeEscopo))
    pendencias.push({
      tom: "alerta",
      titulo: minhaSede.recebedor ? "Conta de recebimento pendente" : "Cadastre a conta de recebimento",
      texto: minhaSede.recebedor
        ? "A conta ainda não está ativa. Sem ela a diretoria não consegue aprovar seus eventos."
        : "É nela que caem as vendas dos eventos da sua subsede. Sem ela a diretoria não consegue aprovar seus eventos.",
      para: `${base}/recebimentos`,
      acao: "Ir para Recebimentos",
    });
  if (emAnalise > 0)
    pendencias.push({ tom: "info", titulo: `${emAnalise} ${emAnalise === 1 ? "sócio aguardando" : "sócios aguardando"} aprovação`, texto: "Pagamento confirmado, falta só a sua aprovação.", para: `${base}/socios?status=em_analise`, acao: "Revisar sócios" });

  const titulo = ehDiretoria ? "Visão geral" : `Visão geral · ${nomeSede(sedeEscopo)}`;
  const mesNome = rotuloMes(mesAtualSP(), true);

  return (
    <div>
      <CabecalhoPagina
        titulo={titulo}
        descricao={`Olá, ${membro.nome?.split(" ")[0] || "diretoria"}. Números de ${mesNome}${ehDiretoria ? "" : " da sua sede"}.`}
        acoes={
          <BotaoLink to={`${base}/eventos?novo=1`} icone="mais" tamanho="sm">
            Novo evento
          </BotaoLink>
        }
      />

      {!ehDiretoria && !sedeEscopo && <Aviso tom="alerta" titulo="Usuário sem sede">Peça para a diretoria vincular seu usuário a uma subsede.</Aviso>}

      <CartaoPrimeirosPassos />

      {pendencias.length > 0 && (
        <div className="grid grid-cols-1 gap-3 mb-6 lg:grid-cols-2" data-tour="pendencias">
          {pendencias.map((p) => (
            <Aviso key={p.titulo} tom={p.tom} titulo={p.titulo} acao={<BotaoLink to={p.para} tamanho="sm" variante="contorno" iconeDireita="setaDireita">{p.acao}</BotaoLink>}>
              {p.texto}
            </Aviso>
          ))}
        </div>
      )}

      {r.erro ? (
        <EstadoLista carregando={false} erro={r.erro} vazio={false} tituloVazio="" />
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4" data-tour="kpis">
          <Indicador
            rotulo="Ingressos (mês)"
            icone="ingresso"
            tom="primaria"
            valor={r.carregando ? "…" : moeda(r.mes.receitaIngressos)}
            detalhe={`Total: ${moeda(r.geral.receitaIngressos)}`}
          />
          <Indicador
            rotulo="Sócios (mês)"
            icone="usuarios"
            tom="primaria"
            valor={r.carregando ? "…" : moeda(r.mes.receitaSocios)}
            detalhe={`Total: ${moeda(r.geral.receitaSocios)}`}
          />
          {ehDiretoria ? (
            <Indicador
              rotulo="Taxa de serviço (caixa)"
              icone="dinheiro"
              tom="sucesso"
              valor={r.carregando ? "…" : moeda(r.mes.taxaServico)}
              detalhe={`Total arrecadado: ${moeda(r.geral.taxaServico)}`}
            />
          ) : (
            <Indicador
              rotulo="A receber da diretoria"
              icone="dinheiro"
              tom={sub.saldo > 0 ? "alerta" : "sucesso"}
              valor={r.carregando ? "…" : moeda(sub.saldo)}
              detalhe={<Link to={`${base}/financeiro`} className="hover:underline">Ver extrato e repasses →</Link>}
            />
          )}
          <Indicador
            rotulo="Ingressos vendidos"
            icone="qr"
            valor={r.carregando ? "…" : ehDiretoria ? (r.mes.ingressosQtd ?? 0) : ingressosSubsede}
            detalhe={ehDiretoria ? `No mês · ${r.geral.ingressosQtd ?? 0} no total` : "Nos eventos da sua sede"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr] mt-4">
        <Cartao className="p-5 sm:p-6 min-w-0" data-tour="grafico-receita">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold">Receita dos últimos 6 meses</h2>
              <p className="text-sm text-texto-3">Valor base, sem a taxa de serviço</p>
            </div>
          </div>
          {r.carregando ? <Carregando /> : <GraficoReceita dados={r.historico} />}
        </Cartao>

        <Cartao className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Sócios</h2>
            <Link to={`${base}/socios`} className="text-sm text-texto-2 hover:text-texto inline-flex items-center gap-1">
              Ver todos <Icone nome="chevronDireita" className="size-4" />
            </Link>
          </div>
          <div className="flex items-end gap-6 mb-4">
            <div>
              <p className="text-[34px] font-bold leading-none numeros">{socios.ativo ?? 0}</p>
              <p className="text-sm text-texto-3 mt-1">ativos</p>
            </div>
            <div>
              <p className="text-xl font-bold leading-none numeros text-primaria">+{r.mes.novosSocios ?? 0}</p>
              <p className="text-sm text-texto-3 mt-1">novos no mês</p>
            </div>
          </div>
          {totalSocios > 0 && (
            <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] mb-4" aria-hidden="true">
              {ORDEM_STATUS.filter((k) => (socios[k] ?? 0) > 0).map((k) => (
                <div key={k} className={COR_STATUS[k]} style={{ width: `${((socios[k] ?? 0) / totalSocios) * 100}%` }} />
              ))}
            </div>
          )}
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {ORDEM_STATUS.map((k) => (
              <li key={k} className="flex items-center justify-between gap-2">
                <Link to={`${base}/socios?status=${k}`} className="flex items-center gap-2 text-texto-2 hover:text-texto min-w-0">
                  <span className={`size-2 rounded-full shrink-0 ${COR_STATUS[k]}`} />
                  <span className="truncate">{ROTULO_STATUS_SOCIO[k]}</span>
                </Link>
                <span className="font-semibold numeros">{Math.max(0, socios[k] ?? 0)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mt-4">
        <Cartao className="p-5 sm:p-6" data-tour="proximos-eventos">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Próximos eventos</h2>
            <Link to={`${base}/eventos`} className="text-sm text-texto-2 hover:text-texto inline-flex items-center gap-1">
              Todos <Icone nome="chevronDireita" className="size-4" />
            </Link>
          </div>
          {eventosQ.carregando || eventosQ.erro || proximos.length === 0 ? (
            <EstadoLista
              carregando={eventosQ.carregando}
              erro={eventosQ.erro}
              vazio
              icone="calendario"
              tituloVazio="Nenhum evento futuro"
              textoVazio="Crie um evento para começar a vender ingressos."
              acaoVazio={<BotaoLink to={`${base}/eventos?novo=1`} tamanho="sm" icone="mais">Criar evento</BotaoLink>}
            />
          ) : (
            <ul className="divide-y divide-linha -my-3">
              {proximos.map((e) => (
                <li key={e.id}>
                  <Link to={`${base}/eventos/${e.id}`} className="flex gap-4 py-3 group">
                    <div className="size-12 shrink-0 rounded-xl bg-superficie-2 grid place-items-center text-center leading-none">
                      <span>
                        <span className="block text-lg font-bold numeros">{diaDoMes(e.data)}</span>
                        <span className="block text-[10px] text-texto-3 font-semibold mt-0.5">{mesAbrev(e.data)}</span>
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate group-hover:text-primaria">{e.nome}</p>
                        {e.status === "rascunho" && <Selo>Rascunho</Selo>}
                      </div>
                      <p className="text-xs text-texto-3 truncate mb-2">
                        {dataExtensa(e.data)} · {hora(e.data)} · {nomeSede(e.sedeId)}
                      </p>
                      <BarraOcupacao vendidos={e.vendidos} reservados={e.reservados} capacidade={e.capacidade} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Últimos pedidos pagos</h2>
            <Link to={`${base}/pedidos`} className="text-sm text-texto-2 hover:text-texto inline-flex items-center gap-1">
              Todos <Icone nome="chevronDireita" className="size-4" />
            </Link>
          </div>
          {pedidosQ.carregando || pedidosQ.erro || pagos.length === 0 ? (
            <EstadoLista carregando={pedidosQ.carregando} erro={pedidosQ.erro} vazio icone="ingresso" tituloVazio="Nenhum pedido pago ainda" />
          ) : (
            <ul className="divide-y divide-linha -my-3">
              {pagos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <span className={`size-10 shrink-0 rounded-xl grid place-items-center ${p.tipo === "ingresso" ? "bg-primaria/12 text-primaria" : "bg-secundaria/15 text-secundaria"}`}>
                    <Icone nome={p.tipo === "ingresso" ? "ingresso" : "estrela"} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.comprador?.nome}</p>
                    <p className="text-xs text-texto-3 truncate">
                      {p.tipo === "ingresso" ? `${p.itens?.length ?? 1}× ${p.eventoNome ?? "Ingresso"}` : "Mensalidade de sócio"} · {relativo(p.pagoEm ?? p.criadoEm)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold numeros">{moeda(p.total)}</p>
                    <p className="text-[11px] text-texto-3 uppercase">{p.metodo === "pix" ? "Pix" : "Cartão"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </div>
  );
}
