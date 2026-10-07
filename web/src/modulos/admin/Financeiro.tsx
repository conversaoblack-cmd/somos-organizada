import { useMemo, useState } from "react";
import { addDoc, collection, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { centavosDeTexto, dataCurta, dataHora, moeda } from "@/lib/formatos";
import type { Lancamento, Repasse } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Abas, AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Cartao, cx, Icone, Indicador, Modal, Selecao, Selo, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { baixarCsv, Confirmar, decimalBR, EstadoLista, mesAtualSP, rotuloMes } from "./util";

interface ResumoSede {
  sedeId: string;
  ingressos: number;
  socios: number;
  taxa: number;
  repassado: number;
}

export default function Financeiro() {
  const { tid, ehDiretoria, sedeEscopo, sedes, nomeSede, torcida } = usePainel();
  const lanc = useColecao<Lancamento>(
    ehDiretoria
      ? collection(db, `torcidas/${tid}/lancamentos`)
      : sedeEscopo
        ? query(collection(db, `torcidas/${tid}/lancamentos`), where("sedeId", "==", sedeEscopo))
        : null,
    `fin-lanc-${tid}-${sedeEscopo ?? "todas"}`,
  );
  const repasses = useColecao<Repasse>(
    ehDiretoria
      ? collection(db, `torcidas/${tid}/repasses`)
      : sedeEscopo
        ? query(collection(db, `torcidas/${tid}/repasses`), where("sedeId", "==", sedeEscopo))
        : null,
    `fin-rep-${tid}-${sedeEscopo ?? "todas"}`,
  );

  const [aba, setAba] = useState<"lancamentos" | "repasses">("lancamentos");
  const [mes, setMes] = useState("");
  const [sedeFiltro, setSedeFiltro] = useState("");
  const [novoRepasse, setNovoRepasse] = useState<string | null>(null);
  const [limite, setLimite] = useState(50);

  const principalId = torcida.sedePrincipalId;
  const resumo = useMemo(() => {
    const m = new Map<string, ResumoSede>();
    const pegar = (id: string) => {
      if (!m.has(id)) m.set(id, { sedeId: id, ingressos: 0, socios: 0, taxa: 0, repassado: 0 });
      return m.get(id)!;
    };
    for (const s of sedes) if (ehDiretoria || s.id === sedeEscopo) pegar(s.id);
    for (const l of lanc.dados) {
      const r = pegar(l.sedeId);
      if (l.natureza === "taxa") r.taxa += l.valor;
      else if (l.origem === "ingresso") r.ingressos += l.valor;
      else r.socios += l.valor;
    }
    for (const rp of repasses.dados) pegar(rp.sedeId).repassado += rp.valor;
    return [...m.values()];
  }, [lanc.dados, repasses.dados, sedes, ehDiretoria, sedeEscopo]);

  const subsedes = resumo.filter((r) => r.sedeId !== principalId);
  const principal = resumo.find((r) => r.sedeId === principalId);
  const totalBase = resumo.reduce((s, r) => s + r.ingressos + r.socios, 0);
  const totalTaxa = resumo.reduce((s, r) => s + r.taxa, 0);
  const totalRepassado = resumo.reduce((s, r) => s + r.repassado, 0);
  const aRepassar = subsedes.reduce((s, r) => s + Math.max(0, r.ingressos + r.socios - r.repassado), 0);

  const competencias = useMemo(() => {
    const c = new Set<string>([mesAtualSP()]);
    for (const l of lanc.dados) if (l.competencia) c.add(l.competencia);
    for (const r of repasses.dados) c.add(r.competencia || (r.criadoEm ? mesAtualSP(r.criadoEm.toDate()) : mesAtualSP()));
    return [...c].sort().reverse();
  }, [lanc.dados, repasses.dados]);

  const lancFiltrados = useMemo(
    () =>
      lanc.dados
        .filter((l) => (!mes || l.competencia === mes) && (!sedeFiltro || l.sedeId === sedeFiltro))
        .sort((a, b) => (b.criadoEm?.toMillis() ?? 0) - (a.criadoEm?.toMillis() ?? 0)),
    [lanc.dados, mes, sedeFiltro],
  );
  const compRepasse = (r: Repasse) => r.competencia || (r.criadoEm ? mesAtualSP(r.criadoEm.toDate()) : "");
  const repFiltrados = useMemo(
    () =>
      repasses.dados
        .filter((r) => (!mes || compRepasse(r) === mes) && (!sedeFiltro || r.sedeId === sedeFiltro))
        .sort((a, b) => (b.criadoEm?.toMillis() ?? 0) - (a.criadoEm?.toMillis() ?? 0)),
    [repasses.dados, mes, sedeFiltro],
  );
  const somaFiltro = aba === "lancamentos" ? lancFiltrados.reduce((s, l) => s + l.valor, 0) : repFiltrados.reduce((s, r) => s + r.valor, 0);

  function exportar() {
    const sufixo = `${mes || "tudo"}${sedeFiltro ? "-" + nomeSede(sedeFiltro).replace(/\W+/g, "-").toLowerCase() : ""}`;
    if (aba === "lancamentos") {
      baixarCsv(
        `extrato-${sufixo}`,
        ["Data", "Competência", "Sede", "Origem", "Natureza", "Descrição", "Valor", "Referência"],
        lancFiltrados.map((l) => [
          dataHora(l.criadoEm),
          l.competencia,
          nomeSede(l.sedeId),
          l.origem === "ingresso" ? "Ingresso" : "Sócio",
          l.natureza === "taxa" ? "Taxa de serviço" : "Valor base",
          l.descricao,
          decimalBR(l.valor),
          l.referencia,
        ]),
      );
    } else {
      baixarCsv(
        `repasses-${sufixo}`,
        ["Data", "Competência", "Sede", "Valor", "Observação"],
        repFiltrados.map((r) => [dataHora(r.criadoEm), r.competencia ?? "", nomeSede(r.sedeId), decimalBR(r.valor), r.observacao ?? ""]),
      );
    }
  }

  const carregando = lanc.carregando || repasses.carregando;
  const erro = lanc.erro || repasses.erro;
  const minha = !ehDiretoria ? resumo.find((r) => r.sedeId === sedeEscopo) : null;

  return (
    <div>
      <CabecalhoPagina
        titulo={ehDiretoria ? "Financeiro e repasses" : "Financeiro da sede"}
        descricao={
          ehDiretoria
            ? "O dinheiro cai na conta Pagar.me da diretoria. Aqui você vê quanto é de cada subsede e registra o que já foi repassado."
            : "Quanto a sua sede gerou, o que a diretoria já repassou e o saldo a receber."
        }
        acoes={
          ehDiretoria && (
            <Botao icone="enviar" onClick={() => setNovoRepasse("")} disabled={!subsedes.length}>
              Registrar repasse
            </Botao>
          )
        }
      />

      {erro ? (
        <EstadoLista carregando={false} erro={erro} vazio={false} tituloVazio="" />
      ) : carregando ? (
        <EstadoLista carregando vazio={false} erro={null} tituloVazio="" />
      ) : (
        <>
          {ehDiretoria ? (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <Indicador rotulo="Valor base vendido" icone="grafico" valor={moeda(totalBase)} detalhe="Ingressos + mensalidades" />
              <Indicador rotulo="Taxa de serviço" icone="dinheiro" tom="sucesso" valor={moeda(totalTaxa)} detalhe="Caixa da diretoria" />
              <Indicador rotulo="Já repassado" icone="enviar" tom="info" valor={moeda(totalRepassado)} detalhe="Registrado no painel" />
              <Indicador rotulo="A repassar" icone="alerta" tom={aRepassar > 0 ? "alerta" : "sucesso"} valor={moeda(aRepassar)} detalhe="Soma dos saldos das subsedes" />
            </div>
          ) : (
            minha && (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <Indicador rotulo="Ingressos" icone="ingresso" valor={moeda(minha.ingressos)} detalhe="Eventos da sua sede" />
                <Indicador rotulo="Mensalidades" icone="estrela" valor={moeda(minha.socios)} detalhe="Sócios da sua sede" />
                <Indicador rotulo="Já recebido" icone="checkCirculo" tom="info" valor={moeda(minha.repassado)} detalhe="Repasses da diretoria" />
                <Indicador
                  rotulo="Saldo a receber"
                  icone="dinheiro"
                  tom={minha.ingressos + minha.socios - minha.repassado > 0 ? "alerta" : "sucesso"}
                  valor={moeda(minha.ingressos + minha.socios - minha.repassado)}
                  detalhe="Gerado − recebido"
                />
              </div>
            )
          )}

          {ehDiretoria && (
            <section className="mb-8">
              <h2 className="text-lg font-bold mb-3">Saldo por sede</h2>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {principal && (
                  <Cartao className="p-5 border-primaria/30">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold truncate">{nomeSede(principal.sedeId)}</p>
                      <Selo tom="primaria">Principal</Selo>
                    </div>
                    <p className="text-2xl font-bold numeros mt-3">{moeda(principal.ingressos + principal.socios + principal.taxa)}</p>
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
                      <p className={cx("text-2xl font-bold numeros mt-3", saldo > 0 ? "text-alerta" : saldo < 0 ? "text-perigo" : "")}>{moeda(saldo)}</p>
                      <p className="text-xs text-texto-3">{saldo > 0 ? "A repassar" : saldo < 0 ? "Repassado a mais" : "Em dia"}</p>
                      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                        <ValorMini rotulo="Ingressos" valor={r.ingressos} />
                        <ValorMini rotulo="Sócios" valor={r.socios} />
                        <ValorMini rotulo="Repassado" valor={r.repassado} />
                      </dl>
                      <Botao tamanho="sm" variante="suave" icone="enviar" className="mt-4 self-start" onClick={() => setNovoRepasse(r.sedeId)}>
                        Registrar repasse
                      </Botao>
                    </Cartao>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <div className="flex flex-col lg:flex-row lg:items-end gap-3 justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">Extrato</h2>
                <p className="text-sm text-texto-3 numeros">
                  {aba === "lancamentos" ? lancFiltrados.length : repFiltrados.length} itens · {moeda(somaFiltro)}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
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
                <Botao variante="contorno" icone="download" onClick={exportar} disabled={aba === "lancamentos" ? !lancFiltrados.length : !repFiltrados.length}>
                  CSV
                </Botao>
              </div>
            </div>

            {aba === "lancamentos" ? (
              lancFiltrados.length === 0 ? (
                <EstadoLista carregando={false} erro={null} vazio icone="dinheiro" tituloVazio="Nenhum lançamento" textoVazio="Os lançamentos aparecem quando um pagamento é confirmado." />
              ) : (
                <Cartao className="overflow-hidden">
                  <ul className="divide-y divide-linha">
                    {lancFiltrados.slice(0, limite).map((l) => (
                      <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={cx(
                            "size-9 shrink-0 rounded-xl grid place-items-center",
                            l.natureza === "taxa" ? "bg-sucesso/12 text-sucesso" : l.origem === "ingresso" ? "bg-primaria/12 text-primaria" : "bg-secundaria/15 text-secundaria",
                          )}
                        >
                          <Icone nome={l.natureza === "taxa" ? "dinheiro" : l.origem === "ingresso" ? "ingresso" : "estrela"} className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{l.descricao}</p>
                          <p className="text-xs text-texto-3 truncate">
                            {dataCurta(l.criadoEm)} · {nomeSede(l.sedeId)} · {l.natureza === "taxa" ? "Taxa de serviço" : "Valor base"}
                          </p>
                        </div>
                        <span className={cx("font-semibold numeros shrink-0", l.valor < 0 && "text-perigo")}>{moeda(l.valor)}</span>
                      </li>
                    ))}
                  </ul>
                  {lancFiltrados.length > limite && (
                    <div className="px-4 py-3 border-t border-linha flex items-center justify-between gap-3">
                      <p className="text-xs text-texto-3">
                        Mostrando {limite} de {lancFiltrados.length}
                      </p>
                      <Botao tamanho="sm" variante="suave" onClick={() => setLimite((n) => n + 100)}>
                        Mostrar mais
                      </Botao>
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
                        <p className="text-xs text-texto-3 truncate">
                          {dataCurta(r.criadoEm)}
                          {r.competencia && ` · ref. ${rotuloMes(r.competencia)}`}
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
  const [sedeId, setSedeId] = useState(sedeInicial || opcoes[0]?.id || "");
  const saldo = saldos[sedeId] ?? 0;
  const [valor, setValor] = useState(() => (saldo > 0 ? (saldo / 100).toFixed(2).replace(".", ",") : ""));
  const [competencia, setCompetencia] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const centavos = centavosDeTexto(valor || "0");

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
        <Selecao rotulo="Subsede" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
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
          await addDoc(collection(db, `torcidas/${tid}/repasses`), {
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

