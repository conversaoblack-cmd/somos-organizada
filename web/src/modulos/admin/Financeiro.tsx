import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where, type QueryConstraint } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
import { centavosDeTexto, dataCurta, dataHora, moeda } from "@/lib/formatos";
import type { ComId, Lancamento, Repasse } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Abas, AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Cartao, cx, Icone, Indicador, Modal, Selecao, Selo, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { baixarCsv, CarregarMais, Confirmar, decimalBR, EstadoLista, LOTE, mesAtualSP, numero, rotuloMes, textoMoeda, totaisDaSede, ultimosMeses, useAgregado, ValorKpi } from "./util";

/** Uma venda no extrato: o valor do ingresso/mensalidade e a taxa de serviço juntos numa linha só. */
interface LinhaExtrato {
  chave: string;
  base?: ComId<Lancamento>;
  taxa?: ComId<Lancamento>;
  criadoEm: number;
}

/**
 * Por sede. ingressos/socios = valor base que caiu na conta da TORCIDA (entra no repasse);
 * split = valor base que já caiu direto na conta da subsede (não entra no repasse).
 */
interface ResumoSede {
  sedeId: string;
  ingressos: number;
  socios: number;
  split: number;
  taxa: number;
  repassado: number;
}

export default function Financeiro() {
  const { tid, ehDiretoria, sedeEscopo, sedes, nomeSede, torcida } = usePainel();
  const avisar = useToast();
  const [aba, setAba] = useState<"lancamentos" | "repasses">("lancamentos");
  const [mes, setMes] = useState("");
  const [sedeFiltro, setSedeFiltro] = useState("");
  const [novoRepasse, setNovoRepasse] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  // O extrato cresce todo mês: lê 100 lançamentos por vez, do mais recente para o mais antigo.
  const [qtd, setQtd] = useState(LOTE);
  useEffect(() => {
    setQtd(LOTE);
  }, [mes, sedeFiltro]);
  useTourPagina("financeiro");

  const caminhoLanc = `torcidas/${tid}/lancamentos`;
  const podeLer = ehDiretoria || !!sedeEscopo;
  // Subsede só enxerga a própria sede (as regras exigem o filtro); a diretoria pode filtrar por uma sede.
  const sedeDoExtrato = ehDiretoria ? sedeFiltro : sedeEscopo;
  const filtrosExtrato = (): QueryConstraint[] => [
    ...(sedeDoExtrato ? [where("sedeId", "==", sedeDoExtrato)] : []),
    ...(mes ? [where("competencia", "==", mes)] : []),
  ];
  const lanc = useColecao<Lancamento>(
    podeLer ? query(collection(db, caminhoLanc), ...filtrosExtrato(), orderBy("criadoEm", "desc"), limit(qtd)) : null,
    `fin-lanc-${tid}-${sedeDoExtrato || "todas"}-${mes || "tudo"}-${qtd}`,
  );
  // Veio a página cheia: pode haver lançamentos mais antigos ainda não carregados.
  const temMais = lanc.dados.length >= qtd;
  const carregandoMais = lanc.carregando && lanc.dados.length > 0;
  // Último lançamento do escopo (1 leitura, em tempo real): quando muda, os totais são somados de novo.
  const ultimo = useColecao<Lancamento>(
    podeLer
      ? query(collection(db, caminhoLanc), ...(ehDiretoria ? [] : [where("sedeId", "==", sedeEscopo)]), orderBy("criadoEm", "desc"), limit(1))
      : null,
    `fin-ultimo-${tid}-${sedeEscopo ?? "todas"}`,
  );
  // Saldos de cada sede somados no servidor: não depende de quantos lançamentos foram carregados no extrato.
  const sedesDoResumo = useMemo(() => sedes.filter((s) => ehDiretoria || s.id === sedeEscopo).map((s) => s.id), [sedes, ehDiretoria, sedeEscopo]);
  const totais = useAgregado(
    podeLer && !ultimo.carregando ? () => Promise.all(sedesDoResumo.map((id) => totaisDaSede(tid, id))) : null,
    `fin-totais-${tid}-${sedesDoResumo.join(",")}-${ultimo.dados[0]?.id ?? ""}-${ultimo.carregando}`,
  );
  // Repasses são registrados à mão (poucos por mês): continuam lidos inteiros.
  const repasses = useColecao<Repasse>(
    ehDiretoria
      ? collection(db, `torcidas/${tid}/repasses`)
      : sedeEscopo
        ? query(collection(db, `torcidas/${tid}/repasses`), where("sedeId", "==", sedeEscopo))
        : null,
    `fin-rep-${tid}-${sedeEscopo ?? "todas"}`,
  );

  const principalId = torcida.sedePrincipalId;
  const resumo = useMemo(() => {
    const m = new Map<string, ResumoSede>();
    const pegar = (id: string) => {
      if (!m.has(id)) m.set(id, { sedeId: id, ingressos: 0, socios: 0, split: 0, taxa: 0, repassado: 0 });
      return m.get(id)!;
    };
    for (const id of sedesDoResumo) pegar(id);
    for (const t of totais.dados ?? []) {
      const r = pegar(t.sedeId);
      r.taxa = t.taxa;
      r.split = t.splitIngressos + t.splitSocios;
      r.ingressos = t.baseIngressos - t.splitIngressos;
      r.socios = t.baseSocios - t.splitSocios;
    }
    for (const rp of repasses.dados) if (ehDiretoria || rp.sedeId === sedeEscopo) pegar(rp.sedeId).repassado += rp.valor;
    return [...m.values()];
  }, [totais.dados, repasses.dados, sedesDoResumo, ehDiretoria, sedeEscopo]);

  const subsedes = resumo.filter((r) => r.sedeId !== principalId);
  const principal = resumo.find((r) => r.sedeId === principalId);
  const totalBase = resumo.reduce((s, r) => s + r.ingressos + r.socios + r.split, 0);
  const totalSplit = resumo.reduce((s, r) => s + r.split, 0);
  const totalTaxa = resumo.reduce((s, r) => s + r.taxa, 0);
  const totalRepassado = resumo.reduce((s, r) => s + r.repassado, 0);
  const aRepassar = subsedes.reduce((s, r) => s + Math.max(0, r.ingressos + r.socios - r.repassado), 0);

  // Meses do filtro: os últimos 2 anos e qualquer mês mais antigo que já apareceu no extrato ou nos repasses.
  const competencias = useMemo(() => {
    const c = new Set<string>(ultimosMeses(24));
    for (const l of lanc.dados) if (l.competencia) c.add(l.competencia);
    for (const r of repasses.dados) c.add(r.competencia || (r.criadoEm ? mesAtualSP(r.criadoEm.toDate()) : mesAtualSP()));
    return [...c].sort().reverse();
  }, [lanc.dados, repasses.dados]);

  // Mês e sede já vêm filtrados do servidor.
  const lancFiltrados = lanc.dados;
  // Junta base + taxa da mesma venda (mesma referência e mesmo sinal: estorno fica em linha própria).
  const linhasExtrato = useMemo(() => {
    const m = new Map<string, LinhaExtrato>();
    for (const l of lancFiltrados) {
      const chave = `${l.referencia || l.id}|${l.valor < 0 ? "-" : "+"}`;
      const linha = m.get(chave) ?? { chave, criadoEm: l.criadoEm?.toMillis() ?? 0 };
      if (l.natureza === "taxa" && !linha.taxa) linha.taxa = l;
      else if (l.natureza !== "taxa" && !linha.base) linha.base = l;
      else {
        m.set(`${chave}|${l.id}`, { chave: `${chave}|${l.id}`, criadoEm: l.criadoEm?.toMillis() ?? 0, [l.natureza === "taxa" ? "taxa" : "base"]: l });
        continue;
      }
      m.set(chave, linha);
    }
    return [...m.values()].sort((a, b) => b.criadoEm - a.criadoEm);
  }, [lancFiltrados]);
  const compRepasse = (r: Repasse) => r.competencia || (r.criadoEm ? mesAtualSP(r.criadoEm.toDate()) : "");
  const repFiltrados = useMemo(
    () =>
      repasses.dados
        .filter((r) => (!mes || compRepasse(r) === mes) && (!sedeFiltro || r.sedeId === sedeFiltro))
        .sort((a, b) => (b.criadoEm?.toMillis() ?? 0) - (a.criadoEm?.toMillis() ?? 0)),
    [repasses.dados, mes, sedeFiltro],
  );
  const somaFiltro = aba === "lancamentos" ? lancFiltrados.reduce((s, l) => s + l.valor, 0) : repFiltrados.reduce((s, r) => s + r.valor, 0);

  async function exportar() {
    const sufixo = `${mes || "tudo"}${sedeFiltro ? "-" + nomeSede(sedeFiltro).replace(/\W+/g, "-").toLowerCase() : ""}`;
    if (aba === "lancamentos") {
      // Planilha: lê todos os lançamentos do mês/sede escolhidos só na hora de baixar.
      if (!podeLer) return;
      setBaixando(true);
      let todos: ComId<Lancamento>[];
      try {
        const snap = await getDocs(query(collection(db, caminhoLanc), ...filtrosExtrato()));
        todos = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Lancamento) })).sort((a, b) => (b.criadoEm?.toMillis() ?? 0) - (a.criadoEm?.toMillis() ?? 0));
      } catch (e) {
        avisar(mensagemDeErro(e), "erro");
        return;
      } finally {
        setBaixando(false);
      }
      baixarCsv(
        `extrato-${sufixo}`,
        ["Data", "Mês", "Sede", "Origem", "Tipo de valor", "Onde caiu o dinheiro", "Descrição", "Valor", "Referência"],
        todos.map((l) => [
          dataHora(l.criadoEm),
          l.competencia,
          nomeSede(l.sedeId),
          l.origem === "ingresso" ? "Ingresso" : "Sócio",
          l.natureza === "taxa" ? "Taxa de serviço" : l.origem === "ingresso" ? "Valor do ingresso" : "Valor da mensalidade",
          l.liquidacao === "split" ? "Direto na conta da subsede" : "Conta da torcida",
          l.descricao,
          decimalBR(l.valor),
          l.referencia,
        ]),
      );
    } else {
      baixarCsv(
        `repasses-${sufixo}`,
        ["Data", "Mês de referência", "Sede", "Valor", "Observação"],
        repFiltrados.map((r) => [dataHora(r.criadoEm), r.competencia ?? "", nomeSede(r.sedeId), decimalBR(r.valor), r.observacao ?? ""]),
      );
    }
  }

  // Só a primeira carga segura a tela; "Carregar mais" e a soma refeita mantêm o que já está na tela.
  const carregando = (lanc.carregando && !lanc.dados.length) || repasses.carregando || (!totais.dados && (totais.carregando || ultimo.carregando));
  const erro = lanc.erro || repasses.erro || totais.erro;
  const minha = !ehDiretoria ? resumo.find((r) => r.sedeId === sedeEscopo) : null;

  return (
    <div>
      <CabecalhoPagina
        titulo={ehDiretoria ? "Financeiro e repasses" : "Financeiro da sede"}
        descricao={
          ehDiretoria
            ? "Com a divisão direta ativa, o valor dos eventos de cada subsede cai direto na conta dela. O resto cai na conta Pagar.me da torcida: aqui você vê quanto disso é de cada subsede e registra o que já repassou."
            : "Quanto a sua sede gerou, o que a diretoria já repassou e o saldo a receber."
        }
        acoes={
          ehDiretoria && (
            <Botao icone="enviar" onClick={() => setNovoRepasse("")} disabled={!subsedes.length} data-tour="registrar-repasse">
              Registrar repasse
            </Botao>
          )
        }
      />

      {erro ? (
        <EstadoLista carregando={false} erro={erro} vazio={false} tituloVazio="" />
      ) : lanc.semConexao || repasses.semConexao ? (
        <EstadoLista carregando={false} erro={null} semConexao vazio={false} tituloVazio="" />
      ) : carregando ? (
        <EstadoLista carregando vazio={false} erro={null} tituloVazio="" />
      ) : (
        <>
          {ehDiretoria ? (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6" data-tour="fin-resumo">
              <Indicador
                rotulo="Vendido (sem a taxa)"
                icone="grafico"
                valor={<ValorKpi>{moeda(totalBase)}</ValorKpi>}
                detalhe={totalSplit ? `${moeda(totalSplit)} direto nas contas das subsedes` : "Ingressos + mensalidades"}
              />
              <Indicador rotulo="Taxa de serviço" icone="dinheiro" tom="sucesso" valor={<ValorKpi>{moeda(totalTaxa)}</ValorKpi>} detalhe="Caixa da diretoria" />
              <Indicador rotulo="Já repassado" icone="enviar" tom="info" valor={<ValorKpi>{moeda(totalRepassado)}</ValorKpi>} detalhe="Registrado no painel" />
              <Indicador
                rotulo="A repassar"
                icone="alerta"
                tom={aRepassar > 0 ? "alerta" : "sucesso"}
                valor={<ValorKpi>{moeda(aRepassar)}</ValorKpi>}
                detalhe="Só o que caiu na conta da torcida"
              />
            </div>
          ) : (
            minha && (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6" data-tour="fin-resumo">
                <Indicador
                  rotulo="Direto na sua conta"
                  icone="checkCirculo"
                  tom="sucesso"
                  valor={<ValorKpi>{moeda(minha.split)}</ValorKpi>}
                  detalhe="Dividido na hora pela Pagar.me (já é seu)"
                />
                <Indicador
                  rotulo="Pela conta da torcida"
                  icone="dinheiro"
                  valor={<ValorKpi>{moeda(minha.ingressos + minha.socios)}</ValorKpi>}
                  detalhe={`Ingressos ${moeda(minha.ingressos)} · sócios ${moeda(minha.socios)}`}
                />
                <Indicador rotulo="Já repassado" icone="enviar" tom="info" valor={<ValorKpi>{moeda(minha.repassado)}</ValorKpi>} detalhe="Repasses da diretoria" />
                <Indicador
                  rotulo="Saldo a receber"
                  icone="dinheiro"
                  tom={minha.ingressos + minha.socios - minha.repassado > 0 ? "alerta" : "sucesso"}
                  valor={<ValorKpi>{moeda(minha.ingressos + minha.socios - minha.repassado)}</ValorKpi>}
                  detalhe={
                    minha.ingressos + minha.socios - minha.repassado < 0
                      ? "A diretoria já passou mais do que a sua sede tinha a receber"
                      : "Pela conta da torcida, menos o que já foi repassado"
                  }
                />
              </div>
            )
          )}

          {ehDiretoria && (
            <section className="mb-8" data-tour="fin-sedes">
              <h2 className="text-lg font-bold mb-3">Saldo por sede</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {principal && (
                  <Cartao className="p-5 border-primaria/30">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold truncate">{nomeSede(principal.sedeId)}</p>
                      <Selo tom="primaria">Principal</Selo>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold numeros mt-3 break-words">{moeda(principal.ingressos + principal.socios + principal.taxa)}</p>
                    <p className="text-xs text-texto-3">Fica no caixa da diretoria</p>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <ValorMini rotulo="Ingressos" valor={principal.ingressos} />
                      <ValorMini rotulo="Sócios" valor={principal.socios} />
                      <ValorMini rotulo="Taxa" valor={principal.taxa} />
                    </dl>
                  </Cartao>
                )}
                {subsedes.map((r) => {
                  const saldo = r.ingressos + r.socios - r.repassado;
                  return (
                    <Cartao key={r.sedeId} className="p-5 flex flex-col">
                      <p className="font-semibold truncate">{nomeSede(r.sedeId)}</p>
                      <p className={cx("text-xl sm:text-2xl font-bold numeros mt-3 break-words", saldo > 0 ? "text-alerta" : saldo < 0 ? "text-perigo" : "")}>{moeda(saldo)}</p>
                      <p className="text-xs text-texto-3">
                        {saldo > 0 ? "A repassar" : saldo < 0 ? "A diretoria já passou mais do que esta sede tinha a receber" : "Em dia"}
                      </p>
                      <p className="text-xs text-texto-3 mt-4 mb-1.5">Pela conta da torcida</p>
                      <dl className="grid grid-cols-3 gap-2 text-xs">
                        <ValorMini rotulo="Ingressos" valor={r.ingressos} />
                        <ValorMini rotulo="Sócios" valor={r.socios} />
                        <ValorMini rotulo="Repassado" valor={r.repassado} />
                      </dl>
                      <p className="mt-3 text-xs flex items-center justify-between gap-2 rounded-xl border border-sucesso/25 bg-sucesso/8 px-2.5 py-2">
                        <span className="text-texto-2">Recebido direto na conta da subsede</span>
                        <span className="font-semibold numeros">{moeda(r.split)}</span>
                      </p>
                      <Botao tamanho="sm" variante="suave" icone="enviar" className="mt-4 self-start" onClick={() => setNovoRepasse(r.sedeId)}>
                        Registrar repasse
                      </Botao>
                    </Cartao>
                  );
                })}
              </div>
            </section>
          )}

          <section data-tour="fin-extrato">
            <div className="flex flex-col xl:flex-row xl:items-end gap-3 justify-between mb-4">
              <div className="shrink-0">
                <h2 className="text-lg font-bold">Extrato</h2>
                <p className="text-sm text-texto-3 numeros">
                  {numero(aba === "lancamentos" ? linhasExtrato.length : repFiltrados.length)} itens · {moeda(somaFiltro)}
                  {aba === "lancamentos" && temMais && " · há lançamentos mais antigos"}
                </p>
              </div>
              {/* quebra a linha quando não cabe (1024 px com o menu lateral): nunca rola para o lado */}
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center min-w-0">
                <Abas
                  valor={aba}
                  onChange={setAba}
                  opcoes={[
                    { valor: "lancamentos", rotulo: "Lançamentos" },
                    { valor: "repasses", rotulo: ehDiretoria ? "Repasses" : "Recebidos" },
                  ]}
                />
                <Selecao value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês" className="sm:w-44 [&_select]:h-11">
                  <option value="">Todos os meses</option>
                  {competencias.map((c) => (
                    <option key={c} value={c}>
                      {rotuloMes(c, true)}
                    </option>
                  ))}
                </Selecao>
                {ehDiretoria && (
                  <Selecao value={sedeFiltro} onChange={(e) => setSedeFiltro(e.target.value)} aria-label="Sede" className="sm:w-52 [&_select]:h-11">
                    <option value="">Todas as sedes</option>
                    {sedes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </Selecao>
                )}
                <Botao variante="contorno" icone="download" onClick={exportar} carregando={baixando} disabled={aba === "lancamentos" ? !lancFiltrados.length : !repFiltrados.length}>
                  Baixar planilha
                </Botao>
              </div>
            </div>

            {aba === "lancamentos" && temMais && (
              <Aviso tom="info" className="mb-4">
                A lista e o total acima mostram só os {numero(lanc.dados.length)} lançamentos mais recentes{mes ? ` de ${rotuloMes(mes, true)}` : ""}. Os saldos
                lá em cima e a planilha contam todos.
              </Aviso>
            )}
            {aba === "lancamentos" ? (
              lancFiltrados.length === 0 ? (
                <EstadoLista carregando={false} erro={null} vazio icone="dinheiro" tituloVazio="Nenhum lançamento" textoVazio="Os lançamentos aparecem quando um pagamento é confirmado." />
              ) : (
                <Cartao className="overflow-hidden">
                  <ul className="divide-y divide-linha">
                    {linhasExtrato.map((linha) => {
                      const l = (linha.base ?? linha.taxa)!;
                      const soTaxa = !linha.base;
                      return (
                        <li key={linha.chave} className="flex items-start gap-3 px-4 py-3">
                          <span
                            className={cx(
                              "size-9 shrink-0 rounded-xl grid place-items-center",
                              soTaxa ? "bg-superficie-2 text-texto-2" : l.origem === "ingresso" ? "bg-primaria/12 text-primaria-texto" : "bg-secundaria/15 text-secundaria",
                            )}
                          >
                            <Icone nome={soTaxa ? "dinheiro" : l.origem === "ingresso" ? "ingresso" : "estrela"} className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium line-clamp-2 break-words">{l.descricao}</p>
                            <p className="text-xs text-texto-3">
                              {dataCurta(l.criadoEm)} · {nomeSede(l.sedeId)}
                              {soTaxa ? " · só a taxa de serviço" : linha.taxa ? ` · + ${moeda(linha.taxa.valor)} de taxa` : ""}
                              {l.liquidacao === "split" && " · direto na conta da subsede"}
                            </p>
                          </div>
                          <span className={cx("font-semibold numeros shrink-0", l.valor < 0 && "text-perigo")}>{moeda(l.valor)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {temMais && (
                    <div className="px-4 pb-4 border-t border-linha">
                      <CarregarMais rotulo="Carregar mais lançamentos" carregando={carregandoMais} mais={() => setQtd((n) => n + LOTE)} />
                    </div>
                  )}
                </Cartao>
              )
            ) : repFiltrados.length === 0 ? (
              <EstadoLista
                carregando={false}
                erro={null}
                vazio
                icone="enviar"
                tituloVazio="Nenhum repasse registrado"
                textoVazio={ehDiretoria ? "Depois de transferir para uma subsede, registre aqui para manter o saldo em dia." : "Quando a diretoria registrar um repasse, ele aparece aqui."}
              />
            ) : (
              <Cartao className="overflow-hidden">
                <ul className="divide-y divide-linha">
                  {repFiltrados.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="size-9 shrink-0 rounded-xl grid place-items-center bg-info/12 text-info">
                        <Icone nome="enviar" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{nomeSede(r.sedeId)}</p>
                        <p className="text-xs text-texto-3 line-clamp-2 break-words">
                          {dataCurta(r.criadoEm)}
                          {r.competencia && ` · referente a ${rotuloMes(r.competencia)}`}
                          {r.observacao && ` · ${r.observacao}`}
                        </p>
                      </div>
                      <span className="font-semibold numeros shrink-0">{moeda(r.valor)}</span>
                    </li>
                  ))}
                </ul>
              </Cartao>
            )}
          </section>
        </>
      )}

      {ehDiretoria && novoRepasse !== null && (
        <ModalRepasse
          sedeInicial={novoRepasse}
          saldos={Object.fromEntries(subsedes.map((r) => [r.sedeId, r.ingressos + r.socios - r.repassado]))}
          fechar={() => setNovoRepasse(null)}
        />
      )}
    </div>
  );
}

function ValorMini({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-xl bg-superficie-2 px-2.5 py-2 min-w-0">
      <dt className="text-texto-3 truncate">{rotulo}</dt>
      <dd className="font-semibold numeros truncate">{moeda(valor)}</dd>
    </div>
  );
}

function ModalRepasse({ sedeInicial, saldos, fechar }: { sedeInicial: string; saldos: Record<string, number>; fechar: () => void }) {
  const { tid, uid, sedes, nomeSede, torcida } = usePainel();
  const avisar = useToast();
  const opcoes = sedes.filter((s) => s.id !== torcida.sedePrincipalId);
  // Sem sede escolhida, sugere a subsede com maior saldo a receber.
  const sugerida = [...opcoes].sort((a, b) => (saldos[b.id] ?? 0) - (saldos[a.id] ?? 0))[0]?.id ?? "";
  const [sedeId, setSedeId] = useState(sedeInicial || sugerida);
  const saldo = saldos[sedeId] ?? 0;
  const sugerirValor = (id: string) => ((saldos[id] ?? 0) > 0 ? textoMoeda(saldos[id]) : "");
  const [valor, setValor] = useState(() => sugerirValor(sedeInicial || sugerida));
  const [competencia, setCompetencia] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const centavos = centavosDeTexto(valor || "0");
  // id do repasse fixo enquanto o modal está aberto: tentar de novo com internet ruim não registra duas vezes.
  const [refRepasse] = useState(() => doc(collection(db, `torcidas/${tid}/repasses`)));

  function revisar() {
    setErro(null);
    if (!sedeId) return setErro("Escolha a subsede.");
    if (centavos <= 0) return setErro("Informe um valor maior que zero.");
    setConfirmar(true);
  }

  return (
    <Modal
      aberto
      fechar={fechar}
      titulo="Registrar repasse"
      descricao="Registre aqui depois de fazer a transferência (Pix ou dinheiro) para a subsede."
      rodape={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Botao variante="fantasma" onClick={fechar}>
            Cancelar
          </Botao>
          <Botao icone="check" onClick={revisar}>
            Revisar e registrar
          </Botao>
        </div>
      }
    >
      <div className="space-y-4">
        <Selecao
          rotulo="Subsede"
          value={sedeId}
          onChange={(e) => {
            setSedeId(e.target.value);
            setValor(sugerirValor(e.target.value));
          }}
        >
          {opcoes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </Selecao>
        <p className="text-sm text-texto-2 -mt-2">
          Saldo atual: <strong className={cx("numeros", saldo > 0 ? "text-alerta" : "text-texto")}>{moeda(saldo)}</strong>
        </p>
        <Campo rotulo="Valor repassado" mascara="moeda" value={valor} onChange={setValor} placeholder="0,00" />
        {centavos > saldo && saldo >= 0 && centavos > 0 && <Aviso tom="alerta">O valor é maior que o saldo da subsede. Confira antes de registrar.</Aviso>}
        <Campo rotulo="Mês de referência (opcional)" type="month" value={competencia} onChange={setCompetencia} max={mesAtualSP()} />
        <AreaTexto rotulo="Observação" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} placeholder="Ex.: Pix para o coordenador, comprovante no grupo" className="[&_textarea]:min-h-20" />
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </div>
      <Confirmar
        aberto={confirmar}
        fechar={() => setConfirmar(false)}
        titulo="Confirmar repasse?"
        rotulo="Registrar repasse"
        acao={async () => {
          await setDoc(refRepasse, {
            sedeId,
            valor: centavos,
            observacao: observacao.trim(),
            ...(competencia ? { competencia } : {}),
            status: "registrado",
            registradoPor: uid,
            criadoEm: serverTimestamp(),
          });
          avisar("Repasse registrado.", "sucesso");
          fechar();
        }}
      >
        <strong className="text-texto numeros">{moeda(centavos)}</strong> para <strong className="text-texto">{nomeSede(sedeId)}</strong>
        {competencia && ` (referente a ${rotuloMes(competencia, true)})`}. Repasses registrados não podem ser apagados.
      </Confirmar>
    </Modal>
  );
}

