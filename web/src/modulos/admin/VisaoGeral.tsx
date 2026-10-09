import { useMemo } from "react";
import { Link } from "react-router";
import { collection, documentId, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { dataExtensa, diaDoMes, hora, mesAbrev, moeda, relativo, ROTULO_STATUS_SOCIO } from "@/lib/formatos";
import type { Evento, Lancamento, Pedido, Repasse, Socio, Stats, StatusSocio } from "@/lib/tipos";
import { useColecao, useDocumento } from "@/hooks/dados";
import { Aviso, BotaoLink, CabecalhoPagina, Cartao, Carregando, cx, Icone, Indicador, Selo } from "@/ui";
import { usePainel } from "./contexto";
import { GraficoReceita, type PontoReceita } from "./Grafico";
import { CartaoPrimeirosPassos } from "./PrimeirosPassos";
import { useTourPagina } from "./tours";
import { textoLimite, useUsoDoPlano } from "./usoPlano";
import { BarraOcupacao, contarNoServidor, EstadoLista, instanteSP, mesAtualSP, numero, rotuloMes, totaisDaSede, ultimosMeses, useAgregado, ValorKpi } from "./util";

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
  semConexao?: boolean;
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
    semConexao: geral.semConexao && hist.semConexao,
  };
}

/**
 * Números da subsede. Não há estatística agregada por sede no servidor (stats/ é da torcida inteira), então:
 * - receita do mês e gráfico: só os lançamentos dos 6 meses mostrados (não o histórico inteiro);
 * - totais e saldo a receber: somados no servidor (getAggregateFromServer), sem baixar os lançamentos;
 * - sócios por situação: contados no servidor; "novos no mês" lê só os cadastros deste mês.
 */
function useResumoSubsede(sedeId: string | null): Resumo & { saldo: number } {
  const { tid } = usePainel();
  const meses = useMemo(() => ultimosMeses(6), []);
  const mes = meses[meses.length - 1]!;
  const [inicioPeriodo, inicioMes] = useMemo(() => {
    const ts = (c: string) => {
      const [a, m] = c.split("-").map(Number) as [number, number];
      // um dia antes: competência e data de criação podem divergir por minutos na virada do mês
      return Timestamp.fromMillis(instanteSP(a, m, 1).getTime() - 86400_000);
    };
    return [ts(meses[0]!), ts(mes)];
  }, [meses, mes]);
  const lanc = useColecao<Lancamento>(
    sedeId
      ? query(collection(db, `torcidas/${tid}/lancamentos`), where("sedeId", "==", sedeId), where("criadoEm", ">=", inicioPeriodo), orderBy("criadoEm", "desc"))
      : null,
    `lanc-sede-${tid}-${sedeId}-${meses[0]}`,
  );
  const novosQ = useColecao<Socio>(
    sedeId
      ? query(collection(db, `torcidas/${tid}/socios`), where("sedeId", "==", sedeId), where("criadoEm", ">=", inicioMes), orderBy("criadoEm", "desc"))
      : null,
    `socios-novos-sede-${tid}-${sedeId}-${mes}`,
  );
  const repasses = useColecao<Repasse>(
    sedeId ? query(collection(db, `torcidas/${tid}/repasses`), where("sedeId", "==", sedeId)) : null,
    `repasses-sede-${tid}-${sedeId}`,
  );
  // Refaz as somas e contagens quando entra lançamento ou sócio novo na sede.
  const versao = `${lanc.dados[0]?.id ?? ""}-${novosQ.dados.map((s) => s.status).join(",")}`;
  const totais = useAgregado(sedeId ? () => totaisDaSede(tid, sedeId) : null, `totais-sede-${tid}-${sedeId}-${versao}`);
  const contagem = useAgregado<Partial<Record<StatusSocio, number>>>(
    sedeId
      ? async () => {
          const caminho = `torcidas/${tid}/socios`;
          const valores = await Promise.all(ORDEM_STATUS.map((st) => contarNoServidor(caminho, where("sedeId", "==", sedeId), where("status", "==", st))));
          return Object.fromEntries(ORDEM_STATUS.map((st, i) => [st, valores[i]]));
        }
      : null,
    `contagem-sede-${tid}-${sedeId}-${versao}`,
  );
  return useMemo(() => {
    const doMes = (m: string) => lanc.dados.filter((l) => l.competencia === m);
    const soma = (lista: Lancamento[], filtro: (l: Lancamento) => boolean) => lista.filter(filtro).reduce((s, l) => s + l.valor, 0);
    const base = (l: Lancamento) => l.natureza === "base";
    const porMes = (m: string): Stats => {
      const l = doMes(m);
      return {
        receitaIngressos: soma(l, (x) => base(x) && x.origem === "ingresso"),
        receitaSocios: soma(l, (x) => base(x) && x.origem === "socio"),
        taxaServico: soma(l, (x) => x.natureza === "taxa"),
      };
    };
    const t = totais.dados;
    const novos = novosQ.dados.filter((s) => s.criadoEm && mesAtualSP(s.criadoEm.toDate()) === mes && s.status !== "pendente_pagamento").length;
    return {
      mes: { ...porMes(mes), novosSocios: novos },
      geral: { receitaIngressos: t?.baseIngressos ?? 0, receitaSocios: t?.baseSocios ?? 0, taxaServico: t?.taxa ?? 0, socios: contagem.dados ?? {} },
      historico: meses.map((m) => {
        const s = porMes(m);
        return { rotulo: rotuloMes(m), ingressos: s.receitaIngressos ?? 0, socios: s.receitaSocios ?? 0 };
      }),
      carregando: lanc.carregando || novosQ.carregando || (!t && totais.carregando) || (!contagem.dados && contagem.carregando),
      erro: lanc.erro || novosQ.erro || totais.erro || contagem.erro,
      semConexao: lanc.semConexao && novosQ.semConexao,
      // O que caiu direto na conta da subsede (split) não entra no repasse.
      saldo: t ? t.baseIngressos + t.baseSocios - t.splitIngressos - t.splitSocios - repasses.dados.reduce((s, r) => s + r.valor, 0) : 0,
    };
  }, [lanc, novosQ, repasses, totais, contagem, mes, meses]);
}

export default function VisaoGeral() {
  const { tid, torcida, ehDiretoria, sedeEscopo, nomeSede, base, emAnalise, emAprovacao, membro, sedes, podePublicarNaSede } = usePainel();
  useTourPagina("visao-geral");
  const dir = useResumoDiretoria(ehDiretoria);
  const sub = useResumoSubsede(ehDiretoria ? null : sedeEscopo);
  const r = ehDiretoria ? dir : sub;
  const uso = useUsoDoPlano();

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
    pendencias.push({ tom: "perigo", titulo: "Pagamentos não configurados", texto: "Conecte a Pagar.me da torcida ou teste tudo no modo demonstração. Sem isso, ninguém consegue comprar.", para: `${base}/pagamentos?tour=admin-pagamentos`, acao: "Configurar pagamentos" });
  if (ehDiretoria && pag?.configurado && !pag.webhookRecebidoEm)
    pendencias.push({
      tom: "alerta",
      titulo: "Confirmação automática dos pagamentos ainda não chegou",
      texto: "Enquanto a Pagar.me não avisar o sistema sozinha, pagamentos por Pix podem demorar a confirmar. Confira o passo 5 em Pagamentos.",
      para: `${base}/pagamentos`,
      acao: "Ver instruções",
    });
  if (ehDiretoria && pag?.configurado && pag.ambiente === "teste")
    pendencias.push({ tom: "info", titulo: "Pagar.me em modo de teste", texto: "As vendas não são reais. Quando estiver tudo certo, cole as chaves de produção.", para: `${base}/pagamentos`, acao: "Ir para Pagamentos" });
  if (ehDiretoria && emAprovacao > 0)
    pendencias.push({
      tom: "alerta",
      titulo: `${numero(emAprovacao)} ${emAprovacao === 1 ? "evento aguardando" : "eventos aguardando"} aprovação`,
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
  // Limite do plano Somos Organizada: amarelo a partir de 90%, vermelho no limite
  if (ehDiretoria && uso && uso.nivelSocios !== "ok")
    pendencias.push({
      tom: uso.nivelSocios === "limite" ? "perigo" : "alerta",
      titulo: `Sócios: ${numero(uso.socios)} de ${numero(uso.limites.socios)} no plano ${uso.nomePlano}`,
      texto: textoLimite(uso, "socios"),
      para: `${base}/plano`,
      acao: "Ver plano",
    });
  if (ehDiretoria && uso && uso.eventos !== null && uso.nivelEventos !== "ok")
    pendencias.push({
      tom: uso.nivelEventos === "limite" ? "perigo" : "alerta",
      titulo: `Eventos à venda: ${numero(uso.eventos)} de ${numero(uso.limites.eventos)} no plano ${uso.nomePlano}`,
      texto: textoLimite(uso, "eventos"),
      para: `${base}/plano`,
      acao: "Ver plano",
    });
  if (ehDiretoria && emAnalise > 0)
    pendencias.push({ tom: "info", titulo: `${numero(emAnalise)} ${emAnalise === 1 ? "sócio aguardando" : "sócios aguardando"} aprovação`, texto: "Pagamento confirmado, falta só a sua aprovação.", para: `${base}/socios?status=em_analise`, acao: "Revisar sócios" });

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

      {/* Pendências num cartão só: empilhadas, três avisos empurravam os números para fora da tela no celular */}
      {pendencias.length > 0 && (
        <Cartao className="mb-6 px-5 sm:px-6 py-2" data-tour="pendencias">
          <h2 className="pt-3 pb-1 font-bold">
            {pendencias.length === 1 ? "1 coisa precisa da sua atenção" : `${numero(pendencias.length)} coisas precisam da sua atenção`}
          </h2>
          <ul className="divide-y divide-linha">
            {pendencias.map((p) => (
              <li key={p.titulo} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <Icone
                    nome={p.tom === "info" ? "info" : "alerta"}
                    className={cx("size-5 shrink-0 mt-0.5", p.tom === "perigo" ? "text-perigo" : p.tom === "alerta" ? "text-alerta" : "text-info")}
                  />
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{p.titulo}</p>
                    <p className="text-sm text-texto-2 mt-0.5">{p.texto}</p>
                  </div>
                </div>
                <BotaoLink to={p.para} tamanho="sm" variante="contorno" iconeDireita="setaDireita" className="self-start sm:self-center ml-8 sm:ml-0 shrink-0">
                  {p.acao}
                </BotaoLink>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {r.erro || r.semConexao ? (
        <EstadoLista carregando={false} erro={r.erro} semConexao={r.semConexao} vazio={false} tituloVazio="" />
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4" data-tour="kpis">
          <Indicador
            rotulo="Ingressos (mês)"
            icone="ingresso"
            tom="primaria"
            valor={<ValorKpi>{r.carregando ? "…" : moeda(r.mes.receitaIngressos)}</ValorKpi>}
            detalhe={`Total: ${moeda(r.geral.receitaIngressos)}`}
          />
          {ehDiretoria ? (
            <Indicador
              rotulo="Sócios (mês)"
              icone="usuarios"
              tom="primaria"
              valor={<ValorKpi>{r.carregando ? "…" : moeda(r.mes.receitaSocios)}</ValorKpi>}
              detalhe={`Total: ${moeda(r.geral.receitaSocios)}`}
            />
          ) : (
            // Subsede não cuida de sócios (é da diretoria): no lugar, os eventos dela que ainda vão acontecer
            <Indicador
              rotulo="Próximos eventos"
              icone="calendario"
              tom="primaria"
              valor={<ValorKpi>{eventosQ.carregando ? "…" : numero(proximos.length)}</ValorKpi>}
              detalhe="Da sua sede"
            />
          )}
          {ehDiretoria ? (
            <Indicador
              rotulo="Taxa de serviço (caixa)"
              icone="dinheiro"
              tom="sucesso"
              valor={<ValorKpi>{r.carregando ? "…" : moeda(r.mes.taxaServico)}</ValorKpi>}
              detalhe={`Total arrecadado: ${moeda(r.geral.taxaServico)}`}
            />
          ) : (
            <Indicador
              rotulo="A receber da diretoria"
              icone="dinheiro"
              tom={sub.saldo > 0 ? "alerta" : "sucesso"}
              valor={<ValorKpi>{r.carregando ? "…" : moeda(sub.saldo)}</ValorKpi>}
              detalhe={
                <Link to={`${base}/financeiro`} className="inline-flex items-center min-h-11 sm:min-h-0 hover:underline">
                  Ver extrato e repasses →
                </Link>
              }
            />
          )}
          <Indicador
            rotulo="Ingressos vendidos"
            icone="qr"
            valor={<ValorKpi>{r.carregando ? "…" : numero(ehDiretoria ? r.mes.ingressosQtd : ingressosSubsede)}</ValorKpi>}
            detalhe={ehDiretoria ? `No mês · ${numero(r.geral.ingressosQtd)} no total` : "Nos eventos da sua sede"}
          />
        </div>
      )}

      <div className={cx("grid grid-cols-1 gap-4 mt-4", ehDiretoria && "lg:grid-cols-[1.6fr_1fr]")}>
        <Cartao className="p-5 sm:p-6 min-w-0" data-tour="grafico-receita">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold">Receita dos últimos 6 meses</h2>
              <p className="text-sm text-texto-3">Valor dos ingressos e mensalidades, sem a taxa de serviço</p>
            </div>
          </div>
          {r.carregando ? <Carregando /> : <GraficoReceita dados={r.historico} />}
        </Cartao>

        {ehDiretoria && (
          <Cartao className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Sócios</h2>
              <Link to={`${base}/socios`} className="text-sm text-texto-2 hover:text-texto inline-flex items-center gap-1 min-h-11 sm:min-h-0">
                Ver todos <Icone nome="chevronDireita" className="size-4" />
              </Link>
            </div>
            <div className="flex items-end gap-6 mb-4">
              <div>
                <p className="text-[34px] font-bold leading-none numeros">{numero(socios.ativo)}</p>
                <p className="text-sm text-texto-3 mt-1">ativos</p>
              </div>
              <div>
                <p className="text-xl font-bold leading-none numeros text-primaria-texto">+{numero(r.mes.novosSocios)}</p>
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
            {/* 1 coluna no celular estreito: "Aguardando pagamento" não cabe em meia largura de 360 px */}
            <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {ORDEM_STATUS.map((k) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <Link to={`${base}/socios?status=${k}`} className="flex items-center gap-2 text-texto-2 hover:text-texto min-w-0 min-h-11 sm:min-h-0">
                    <span className={`size-2 rounded-full shrink-0 ${COR_STATUS[k]}`} />
                    <span className="leading-snug break-words">{ROTULO_STATUS_SOCIO[k]}</span>
                  </Link>
                  <span className="font-semibold numeros">{numero(Math.max(0, socios[k] ?? 0))}</span>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mt-4">
        <Cartao className="p-5 sm:p-6" data-tour="proximos-eventos">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Próximos eventos</h2>
            <Link to={`${base}/eventos`} className="text-sm text-texto-2 hover:text-texto inline-flex items-center gap-1 min-h-11 sm:min-h-0">
              Todos <Icone nome="chevronDireita" className="size-4" />
            </Link>
          </div>
          {eventosQ.carregando || eventosQ.erro || proximos.length === 0 ? (
            <EstadoLista
              carregando={eventosQ.carregando}
              erro={eventosQ.erro}
              semConexao={eventosQ.semConexao}
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
                        <p className="font-semibold line-clamp-2 break-words group-hover:text-primaria-texto">{e.nome}</p>
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
            <Link to={`${base}/pedidos`} className="text-sm text-texto-2 hover:text-texto inline-flex items-center gap-1 min-h-11 sm:min-h-0">
              Todos <Icone nome="chevronDireita" className="size-4" />
            </Link>
          </div>
          {pedidosQ.carregando || pedidosQ.erro || pagos.length === 0 ? (
            <EstadoLista carregando={pedidosQ.carregando} erro={pedidosQ.erro} semConexao={pedidosQ.semConexao} vazio icone="ingresso" tituloVazio="Nenhum pedido pago ainda" />
          ) : (
            <ul className="divide-y divide-linha -my-3">
              {pagos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <span className={`size-10 shrink-0 rounded-xl grid place-items-center ${p.tipo === "ingresso" ? "bg-primaria/12 text-primaria-texto" : "bg-secundaria/15 text-secundaria"}`}>
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
                    <p className="text-xs text-texto-3">{p.metodo === "pix" ? "Pix" : "Cartão"}</p>
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
