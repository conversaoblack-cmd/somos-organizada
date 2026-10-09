import { rp, origemTorcidas } from "@/lib/hosts";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useColecao, useDocumento } from "@/hooks/dados";
import { api, mensagemDeErro } from "@/lib/api";
import { dataCurta, dataHora, moeda } from "@/lib/formatos";
import { collection, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { FaturaSaas, StatusTorcida, Torcida } from "@/lib/tipos";
import { usePlanosSaas } from "@/modulos/inicio/planos";
import { ConfirmarPix } from "./Mensalidades";
import { Abas, AreaTexto, Aviso, Botao, Campo, Cartao, Carregando, Icone, Indicador, Modal, OpcoesCartao, Selo, Vazio, useToast } from "@/ui";
import {
  gmv,
  numero,
  rotuloPlanoSaas,
  usoDoPlanoDaTorcida,
  ROTULO_SITUACAO_SAAS,
  ROTULO_STATUS_TORCIDA,
  TOM_SITUACAO_SAAS,
  TOM_STATUS_TORCIDA,
  useResumo,
  valorPlanoDaTorcida,
  type LinhaTorcida,
} from "./comum";
import { SeloPagamentos, SeloSite } from "./Torcidas";
import Depuracao from "./Depuracao";

/** Formata centavos para o campo com máscara de moeda ("1.234,56"). */

export default function DetalheTorcida({ aba }: { aba: "geral" | "depuracao" }) {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { resumo, recarregar } = useResumo();
  const doc = useDocumento<Torcida>(`torcidas/${id}`);
  const linha = resumo?.torcidas.find((t) => t.id === id);
  const torcida = doc.dados;

  if (doc.carregando) return <Carregando />;
  if (!torcida) {
    return (
      <Cartao>
        <Vazio icone="bandeira" titulo="Torcida não encontrada" acao={<Link to={rp("/torcidas")} className="underline">Voltar para a lista</Link>} />
      </Cartao>
    );
  }
  const pagina = `${origemTorcidas()}/${torcida.slug}`;

  return (
    <>
      <Link to={rp("/torcidas")} className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 text-sm text-texto-2 hover:text-texto mb-4">
        <Icone nome="setaEsquerda" className="size-4" /> Torcidas
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <span
            className="size-14 shrink-0 rounded-2xl grid place-items-center font-display text-lg border border-linha"
            style={{ background: torcida.tema?.corPrimaria, color: torcida.tema?.corTexto }}
            aria-hidden="true"
          >
            {torcida.nome.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight truncate">{torcida.nome}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Selo tom={TOM_STATUS_TORCIDA[torcida.status]}>{ROTULO_STATUS_TORCIDA[torcida.status]}</Selo>
              <span className="text-sm text-texto-3">/{torcida.slug}</span>
              {torcida.bloqueioSaas && <Selo tom="perigo">Bloqueada por mensalidade</Selo>}
            </div>
            {linha && (
              <div className="mt-2">
                <SeloSite t={linha} />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={pagina} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3.5 rounded-xl text-sm font-semibold border border-linha-forte hover:bg-superficie-2">
            <Icone nome="externo" className="size-4" /> Abrir página pública
          </a>
          <a
            href={`${pagina}/admin`}
            target="_blank"
            rel="noreferrer"
            title="Só para visualizar: a equipe da plataforma não tem login na diretoria."
            className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3.5 rounded-xl text-sm font-semibold border border-linha-forte hover:bg-superficie-2"
          >
            <Icone nome="externo" className="size-4" /> Abrir painel da diretoria
          </a>
        </div>
      </div>

      <Abas
        className="mb-6"
        valor={aba}
        onChange={(v) => navegar(v === "geral" ? rp(`/torcidas/${id}`) : rp(`/torcidas/${id}/depuracao`))}
        opcoes={[
          { valor: "geral", rotulo: "Visão geral", icone: "painel" },
          { valor: "depuracao", rotulo: "Depuração", icone: "bug" },
        ]}
      />

      {aba === "depuracao" ? (
        <Depuracao tid={id} />
      ) : (
        <div className="space-y-6">
          {linha && (
            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
              <Indicador rotulo="Receita do mês" valor={moeda(gmv(linha.mes))} detalhe={`Taxa gerada ${moeda(linha.mes.taxaServico)}`} icone="dinheiro" />
              <Indicador rotulo="Ingressos no mês" valor={numero(linha.mes.ingressosQtd)} detalhe={`${numero(linha.geral.ingressosQtd)} no total`} icone="ingresso" />
              <Indicador rotulo="Sócios ativos" valor={numero(linha.geral.socios?.ativo)} detalhe={`${numero(linha.mes.novosSocios)} novos no mês`} icone="usuarios" />
              <Indicador
                rotulo="Chamados abertos"
                valor={numero(linha.chamadosAbertos)}
                detalhe={<Link className="underline" to={rp("/suporte")}>Central de suporte</Link>}
                icone="chat"
              />
            </div>
          )}
          <div className="grid gap-6 xl:grid-cols-2">
            <CartaoStatus tid={id} torcida={torcida} aoSalvar={recarregar} />
            <Cartao className="p-5 sm:p-6">
              <h2 className="font-bold mb-1">Pagamentos</h2>
              <p className="text-sm text-texto-3 mb-4">Conta Pagar.me da própria torcida (configurada pela diretoria).</p>
              {linha ? <SeloPagamentos t={linha} /> : <Selo>—</Selo>}
              <ul className="mt-4 text-sm space-y-1.5 text-texto-2">
                <li>Pix: {torcida.pagamentos?.pix ? "habilitado" : "desabilitado"}</li>
                <li>Cartão: {torcida.pagamentos?.cartao ? "habilitado" : "desabilitado"}</li>
                {torcida.pagamentos?.descritorFatura && <li>Descritor na fatura: {torcida.pagamentos.descritorFatura}</li>}
              </ul>
              <Link to={rp(`/torcidas/${id}/depuracao`)} className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-primaria-texto hover:underline">
                Ver webhooks e pedidos na depuração <Icone nome="setaDireita" className="size-4" />
              </Link>
            </Cartao>
            <CartaoTaxa tid={id} atual={torcida.taxaServicoPct} aoSalvar={recarregar} />
            <CartaoPlanoSomos tid={id} linha={linha} aoSalvar={recarregar} />
          </div>
        </div>
      )}
    </>
  );
}

const DESCRICAO_STATUS: Record<StatusTorcida, string> = {
  implantacao: "Configurando a conta. A página existe, mas ainda não é divulgada.",
  ativa: "Vendendo ingressos e associações normalmente.",
  suspensa: "Vendas bloqueadas (ex.: inadimplência do SaaS ou pedido da diretoria).",
};

function CartaoStatus({ tid, torcida, aoSalvar }: { tid: string; torcida: Torcida; aoSalvar: () => Promise<void> }) {
  const [novo, setNovo] = useState<StatusTorcida | null>(null);
  const [salvando, setSalvando] = useState(false);
  const avisar = useToast();

  async function confirmar() {
    if (!novo) return;
    setSalvando(true);
    try {
      await api.atualizarTorcidaPlataforma({ tid, status: novo });
      avisar(`Status alterado para “${ROTULO_STATUS_TORCIDA[novo]}”.`, "sucesso");
      setNovo(null);
      void aoSalvar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao className="p-5 sm:p-6">
      <h2 className="font-bold mb-1">Status da torcida</h2>
      <p className="text-sm text-texto-3 mb-4">Toda mudança pede confirmação.</p>
      <OpcoesCartao<StatusTorcida>
        nome="Status"
        colunas={1}
        valor={torcida.status}
        onChange={(v) => v !== torcida.status && setNovo(v)}
        opcoes={(["implantacao", "ativa", "suspensa"] as const).map((s) => ({
          valor: s,
          titulo: ROTULO_STATUS_TORCIDA[s],
          descricao: DESCRICAO_STATUS[s],
          icone: s === "ativa" ? "checkCirculo" : s === "suspensa" ? "xCirculo" : "engrenagem",
        }))}
      />
      <Modal
        aberto={!!novo}
        fechar={() => setNovo(null)}
        titulo="Confirmar mudança de status"
        rodape={
          <div className="flex gap-2 justify-end">
            <Botao variante="fantasma" onClick={() => setNovo(null)}>
              Cancelar
            </Botao>
            <Botao variante={novo === "suspensa" ? "perigo" : "primaria"} carregando={salvando} onClick={confirmar}>
              Confirmar
            </Botao>
          </div>
        }
      >
        {novo && (
          <div className="space-y-3 text-sm">
            <p>
              <strong>{torcida.nome}</strong>: {ROTULO_STATUS_TORCIDA[torcida.status]} → <strong>{ROTULO_STATUS_TORCIDA[novo]}</strong>
            </p>
            <p className="text-texto-2">{DESCRICAO_STATUS[novo]}</p>
            {novo === "suspensa" && <Aviso tom="perigo">Torcedores e sócios deixam de conseguir comprar até a torcida ser reativada.</Aviso>}
            {novo === "ativa" && !torcida.pagamentos?.configurado && (
              <Aviso tom="alerta">Os pagamentos desta torcida ainda não foram configurados.</Aviso>
            )}
          </div>
        )}
      </Modal>
    </Cartao>
  );
}

function CartaoTaxa({ tid, atual, aoSalvar }: { tid: string; atual: number; aoSalvar: () => Promise<void> }) {
  const [pct, setPct] = useState(String(atual ?? ""));
  const [salvando, setSalvando] = useState(false);
  const avisar = useToast();
  useEffect(() => setPct(String(atual ?? "")), [atual]);
  const n = Number(pct.replace(",", "."));
  const erro = pct.trim() === "" || !Number.isFinite(n) || n < 0 || n > 30 ? "Informe um percentual entre 0 e 30." : null;

  async function salvar() {
    if (erro) return;
    setSalvando(true);
    try {
      await api.atualizarTorcidaPlataforma({ tid, taxaServicoPct: n });
      avisar("Taxa de serviço atualizada.", "sucesso");
      void aoSalvar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Cartao className="p-5 sm:p-6">
      <h2 className="font-bold mb-1">Taxa de serviço</h2>
      <p className="text-sm text-texto-3 mb-4">Somada ao valor pago pelo torcedor e destinada ao caixa da torcida.</p>
      <div className="flex gap-2 items-start">
        <Campo
          className="flex-1"
          rotulo="Percentual"
          inputMode="decimal"
          value={pct}
          onChange={(v) => setPct(v.replace(/[^\d.,]/g, ""))}
          sufixo={<span className="text-texto-3 pr-2">%</span>}
          erro={erro}
          dica={!erro ? `Ex.: ingresso de R$ 100,00 → taxa de ${moeda(Math.round(100 * n))}` : undefined}
        />
        <Botao className="mt-7" onClick={salvar} carregando={salvando} disabled={!!erro || n === atual}>
          Salvar
        </Botao>
      </div>
    </Cartao>
  );
}

function CartaoPlanoSomos({ tid, linha, aoSalvar }: { tid: string; linha: LinhaTorcida | undefined; aoSalvar: () => Promise<void> }) {
  const cfg = usePlanosSaas();
  const faturas = useColecao<FaturaSaas>(
    query(collection(db, `torcidas/${tid}/faturasSaas`), orderBy("vencimento", "desc"), limit(6)),
    `faturas-saas-${tid}`,
  );
  const contrato = linha?.contrato;
  const [obs, setObs] = useState(contrato?.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const avisar = useToast();
  useEffect(() => setObs(contrato?.observacoes ?? ""), [contrato?.observacoes]);
  const valor = linha ? valorPlanoDaTorcida(linha, cfg.planos) : null;
  const uso = linha ? usoDoPlanoDaTorcida(linha) : null;

  async function salvarObs() {
    setSalvando(true);
    try {
      // o contrato antigo continua no servidor; aqui só mudam as observações internas
      await api.atualizarTorcidaPlataforma({
        tid,
        contrato: { mensalidadeSaas: contrato?.mensalidadeSaas ?? 0, diaVencimento: contrato?.diaVencimento ?? 10, observacoes: obs.trim() },
      });
      avisar("Observações salvas.", "sucesso");
      void aoSalvar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-bold">Plano Somos Organizada</h2>
        {linha?.saas && (
          <Selo tom={TOM_SITUACAO_SAAS[linha.saas.situacao]} ponto>
            {ROTULO_SITUACAO_SAAS[linha.saas.situacao]}
          </Selo>
        )}
      </div>
      {!linha?.saas ? (
        <p className="text-sm text-texto-3 mb-4">
          Sem assinatura: a cobrança começa quando a diretoria publicar o site e escolher o plano (Torcida Pro, Plus ou Max). Até lá, sem limite de sócios
          e eventos.
        </p>
      ) : (
        <>
          <p className="text-sm text-texto-2 mb-4">
            {rotuloPlanoSaas(valor?.plano ?? linha.saas.plano)} · <strong className="text-texto">{moeda(valor?.valor ?? 0)}/mês</strong> · Pix, sem multa nem juros
          </p>
          {uso && (
            <p className="text-sm text-texto-2 -mt-2 mb-4 numeros">
              Sócios: <strong className={uso.socios >= uso.limiteSocios ? "text-perigo" : "text-texto"}>{numero(uso.socios)} de {numero(uso.limiteSocios)}</strong> · Eventos à venda:{" "}
              <strong className={uso.eventos >= uso.limiteEventos ? "text-perigo" : "text-texto"}>{numero(uso.eventos)} de {numero(uso.limiteEventos)}</strong>
            </p>
          )}
          {faturas.dados.length > 0 && (
            <ul className="divide-y divide-linha text-sm mb-4">
              {faturas.dados.map((f) => (
                <li key={f.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="numeros font-semibold w-24">{moeda(f.valor)}</span>
                  <span className="text-texto-2 flex-1 min-w-32">
                    vence {dataCurta(f.vencimento)}
                    {f.informadoPagamentoEm && f.status === "aberta" && (
                      <span className="block text-xs text-info font-semibold">Pagamento informado em {dataHora(f.informadoPagamentoEm)}</span>
                    )}
                    {f.pagaEm && <span className="block text-xs text-texto-3">paga em {dataHora(f.pagaEm)}</span>}
                  </span>
                  <Selo tom={f.status === "paga" ? "sucesso" : f.status === "aberta" ? (f.vencimento.toMillis() < Date.now() ? "perigo" : "info") : "neutro"}>
                    {f.status === "paga" ? "Paga" : f.status === "aberta" ? (f.vencimento.toMillis() < Date.now() ? "Vencida" : "Aberta") : "Cancelada"}
                  </Selo>
                  {f.status === "aberta" && linha && (
                    <ConfirmarPix
                      fatura={{
                        tid,
                        torcidaNome: linha.nome,
                        id: f.id,
                        valor: f.valor,
                        vencimento: f.vencimento.toMillis(),
                        informadoPagamentoEm: f.informadoPagamentoEm?.toMillis() ?? null,
                      }}
                      aoConfirmar={() => void aoSalvar()}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <AreaTexto rotulo="Observações internas" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} rows={3} placeholder="Combinados com a diretoria, contato financeiro…" />
      <Botao className="mt-3" variante="contorno" tamanho="sm" onClick={salvarObs} carregando={salvando} disabled={obs.trim() === (contrato?.observacoes ?? "")} icone="check">
        Salvar observações
      </Botao>
    </Cartao>
  );
}
