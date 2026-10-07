import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDocumento } from "@/hooks/dados";
import { api, mensagemDeErro } from "@/lib/api";
import { centavosDeTexto, moeda } from "@/lib/formatos";
import type { StatusTorcida, Torcida } from "@/lib/tipos";
import { Abas, AreaTexto, Aviso, Botao, Campo, Cartao, Carregando, Icone, Indicador, Modal, OpcoesCartao, Selo, Vazio, useToast } from "@/ui";
import { gmv, numero, ROTULO_STATUS_TORCIDA, TOM_STATUS_TORCIDA, useResumo } from "./comum";
import { SeloPagamentos } from "./Torcidas";
import Depuracao from "./Depuracao";

/** Formata centavos para o campo com máscara de moeda ("1.234,56"). */
const textoMoeda = (c: number) => (c ? moeda(c).replace(/^R\$\s?/, "").trim() : "");

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
        <Vazio icone="bandeira" titulo="Torcida não encontrada" acao={<Link to="/plataforma/torcidas" className="underline">Voltar para a lista</Link>} />
      </Cartao>
    );
  }
  const pagina = `${location.origin}/${torcida.slug}`;

  return (
    <>
      <Link to="/plataforma/torcidas" className="inline-flex items-center gap-1.5 text-sm text-texto-2 hover:text-texto mb-4">
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
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={pagina} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold border border-linha-forte hover:bg-superficie-2">
            <Icone nome="externo" className="size-4" /> Abrir página pública
          </a>
          <a
            href={`${pagina}/admin`}
            target="_blank"
            rel="noreferrer"
            title="Só para visualizar: a equipe da plataforma não tem login na diretoria."
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold border border-linha-forte hover:bg-superficie-2"
          >
            <Icone nome="externo" className="size-4" /> Abrir painel da diretoria
          </a>
        </div>
      </div>

      <Abas
        className="mb-6"
        valor={aba}
        onChange={(v) => navegar(v === "geral" ? `/plataforma/torcidas/${id}` : `/plataforma/torcidas/${id}/depuracao`)}
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
                detalhe={<Link className="underline" to="/plataforma/suporte">Central de suporte</Link>}
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
              <Link to={`/plataforma/torcidas/${id}/depuracao`} className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-primaria hover:underline">
                Ver webhooks e pedidos na depuração <Icone nome="setaDireita" className="size-4" />
              </Link>
            </Cartao>
            <CartaoTaxa tid={id} atual={torcida.taxaServicoPct} aoSalvar={recarregar} />
            <CartaoContrato tid={id} mensalidadeAtual={linha?.mensalidadeSaas ?? 0} aoSalvar={recarregar} />
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

function CartaoContrato({ tid, mensalidadeAtual, aoSalvar }: { tid: string; mensalidadeAtual: number; aoSalvar: () => Promise<void> }) {
  const [mensalidade, setMensalidade] = useState(textoMoeda(mensalidadeAtual));
  const [dia, setDia] = useState("10");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const avisar = useToast();
  useEffect(() => setMensalidade(textoMoeda(mensalidadeAtual)), [mensalidadeAtual]);
  const d = Number(dia);
  const erroDia = !Number.isInteger(d) || d < 1 || d > 28 ? "Escolha um dia entre 1 e 28." : null;

  async function salvar() {
    if (erroDia) return;
    setSalvando(true);
    try {
      await api.atualizarTorcidaPlataforma({ tid, contrato: { mensalidadeSaas: centavosDeTexto(mensalidade), diaVencimento: d, observacoes: obs.trim() } });
      avisar("Contrato salvo.", "sucesso");
      void aoSalvar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Cartao className="p-5 sm:p-6">
      <h2 className="font-bold mb-1">Contrato SaaS</h2>
      <p className="text-sm text-texto-3 mb-4">O que a diretoria paga à Somos Organizada. Guardado em área privada (só o servidor lê).</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Mensalidade" mascara="moeda" value={mensalidade} onChange={setMensalidade} placeholder="0,00" />
        <Campo rotulo="Dia de vencimento" inputMode="numeric" value={dia} onChange={(v) => setDia(v.replace(/\D/g, "").slice(0, 2))} erro={erroDia} />
        <AreaTexto className="sm:col-span-2" rotulo="Observações" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} placeholder="Condições, desconto de implantação, contato financeiro…" />
      </div>
      <p className="text-xs text-texto-3 mt-3">
        O servidor só devolve a mensalidade atual; dia de vencimento e observações são regravados com o que estiver aqui ao salvar.
      </p>
      <Botao className="mt-4" onClick={salvar} carregando={salvando} disabled={!!erroDia} icone="check">
        Salvar contrato
      </Botao>
    </Cartao>
  );
}
