import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { addDoc, collection, deleteDoc, deleteField, doc, orderBy, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
import { centavosDeTexto, cpfMascarado, dataExtensa, dataHora, diaDoMes, hora, mesAbrev, moeda, taxa } from "@/lib/formatos";
import type { ComId, Evento, Ingresso, StatusEvento } from "@/lib/tipos";
import { linkEvento, novoCodigoEvento } from "@/lib/eventos";
import { QrCode } from "@/ui/qr";
import QRCodeLib from "qrcode";
import { useColecao, useDocumento } from "@/hooks/dados";
import {
  AreaTexto,
  Aviso,
  Botao,
  BotaoIcone,
  BotaoLink,
  CabecalhoPagina,
  Campo,
  Carregando,
  Cartao,
  cx,
  Gaveta,
  Icone,
  Indicador,
  Modal,
  Selecao,
  Selo,
  useToast,
  Vazio,
  type Tom,
} from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import {
  BarraOcupacao,
  BotaoCopiar,
  Confirmar,
  deInputDataHora,
  EstadoLista,
  normalizar,
  paraInputDataHora,
  Pilulas,
  SeletorImagem,
  textoMoeda,
} from "./util";

export const ROTULO_STATUS_EVENTO: Record<StatusEvento, string> = {
  rascunho: "Rascunho",
  em_aprovacao: "Aguardando aprovação",
  publicado: "Publicado",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
};
const TOM_STATUS_EVENTO: Record<StatusEvento, Tom> = {
  rascunho: "neutro",
  em_aprovacao: "alerta",
  publicado: "sucesso",
  encerrado: "info",
  cancelado: "perigo",
};

/** Campos extras do fluxo de aprovação (gravados pela diretoria). */
type EventoAdm = Evento & { motivoDevolucao?: string; devolvidoEm?: Timestamp; aprovadoEm?: Timestamp };

const EDITAVEL_SUBSEDE: StatusEvento[] = ["rascunho", "em_aprovacao"];

/** Subsede só mexe nos próprios eventos enquanto rascunho ou aguardando aprovação. */
function usePodeEditar() {
  const { ehDiretoria, sedeEscopo } = usePainel();
  return (e: Evento) => ehDiretoria || (e.sedeId === sedeEscopo && EDITAVEL_SUBSEDE.includes(e.status));
}

/** Aviso para a subsede sem conta de recebimento ativa. */
function AvisoContaSubsede() {
  const { ehDiretoria, sedeEscopo, podePublicarNaSede, base } = usePainel();
  if (ehDiretoria || !sedeEscopo || podePublicarNaSede(sedeEscopo)) return null;
  return (
    <div data-tour="aviso-conta">
    <Aviso
      tom="alerta"
      titulo="Sua subsede ainda não tem conta de recebimento ativa"
      className="mb-5"
      acao={
        <BotaoLink to={`${base}/recebimentos`} tamanho="sm" variante="contorno" iconeDireita="setaDireita">
          Ir para Recebimentos
        </BotaoLink>
      }
    >
      Sem conta de recebimento ativa a diretoria não consegue aprovar seus eventos. Você pode criar e enviar para aprovação mesmo assim.
    </Aviso>
    </div>
  );
}

/** Consulta de eventos no escopo do usuário (subsede: só a própria sede). */
function useEventos() {
  const { tid, ehDiretoria, sedeEscopo } = usePainel();
  return useColecao<Evento>(
    ehDiretoria
      ? query(collection(db, `torcidas/${tid}/eventos`), orderBy("data", "desc"))
      : sedeEscopo
        ? query(collection(db, `torcidas/${tid}/eventos`), where("sedeId", "==", sedeEscopo), orderBy("data", "desc"))
        : null,
    `eventos-${tid}-${sedeEscopo ?? "todas"}`,
  );
}

export default function Eventos() {
  const { ehDiretoria, sedes, nomeSede, base } = usePainel();
  const eventos = useEventos();
  const podeEditar = usePodeEditar();
  useTourPagina("eventos");
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<"todos" | StatusEvento>(() => (params.get("status") as StatusEvento) || "todos");
  const [sede, setSede] = useState("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ComId<Evento> | "novo" | null>(null);

  useEffect(() => {
    if (params.get("novo")) {
      setEditando("novo");
      params.delete("novo");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: eventos.dados.length };
    for (const e of eventos.dados) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [eventos.dados]);

  const filtrados = useMemo(() => {
    const b = normalizar(busca.trim());
    const agora = Date.now();
    const lista = eventos.dados.filter(
      (e) => (status === "todos" || e.status === status) && (!sede || e.sedeId === sede) && (!b || normalizar(`${e.nome} ${e.local ?? ""}`).includes(b)),
    );
    // Futuros primeiro (mais próximos no topo), depois os passados (mais recentes primeiro)
    const futuros = lista.filter((e) => e.data.toMillis() >= agora).sort((a, b2) => a.data.toMillis() - b2.data.toMillis());
    const passados = lista.filter((e) => e.data.toMillis() < agora);
    return { futuros, passados };
  }, [eventos.dados, status, sede, busca]);

  const total = filtrados.futuros.length + filtrados.passados.length;

  return (
    <div>
      <CabecalhoPagina
        titulo="Eventos"
        descricao={
          ehDiretoria
            ? "Crie eventos, aprove os das subsedes e acompanhe as vendas."
            : "Crie os eventos da sua sede e envie para a diretoria aprovar."
        }
        acoes={
          <Botao icone="mais" onClick={() => setEditando("novo")} data-tour="novo-evento">
            Novo evento
          </Botao>
        }
      />

      <AvisoContaSubsede />

      <div className="flex flex-col gap-3 mb-5" data-tour="filtros-eventos">
        <Pilulas
          valor={status}
          onChange={setStatus}
          opcoes={(["todos", "em_aprovacao", "publicado", "rascunho", "encerrado", "cancelado"] as const).map((s) => ({
            valor: s,
            rotulo: s === "todos" ? "Todos" : ROTULO_STATUS_EVENTO[s],
            contador: contagem[s] ?? 0,
          }))}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_260px]">
          <Campo value={busca} onChange={setBusca} placeholder="Buscar por nome ou local" icone="busca" aria-label="Buscar eventos" />
          {ehDiretoria && (
            <Selecao value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Filtrar por sede">
              <option value="">Todas as sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Selecao>
          )}
        </div>
      </div>

      {eventos.carregando || eventos.erro || total === 0 ? (
        <EstadoLista
          carregando={eventos.carregando}
          erro={eventos.erro}
          vazio
          icone="calendario"
          tituloVazio={eventos.dados.length ? "Nenhum evento com esses filtros" : "Nenhum evento ainda"}
          textoVazio={eventos.dados.length ? "Mude os filtros ou a busca." : "Crie o primeiro evento: caravana, festa, churrasco, jogo..."}
          acaoVazio={
            !eventos.dados.length && (
              <Botao icone="mais" onClick={() => setEditando("novo")}>
                Criar evento
              </Botao>
            )
          }
        />
      ) : (
        <div className="space-y-8" data-tour="lista-eventos">
          {filtrados.futuros.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-3">Próximos</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filtrados.futuros.map((e) => (
                  <CartaoEvento key={e.id} e={e} sede={nomeSede(e.sedeId)} para={`${base}/eventos/${e.id}`} editar={podeEditar(e) ? () => setEditando(e) : undefined} />
                ))}
              </div>
            </section>
          )}
          {filtrados.passados.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-3">Já aconteceram</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filtrados.passados.map((e) => (
                  <CartaoEvento key={e.id} e={e} sede={nomeSede(e.sedeId)} para={`${base}/eventos/${e.id}`} editar={podeEditar(e) ? () => setEditando(e) : undefined} passado />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <FormEvento evento={editando} fechar={() => setEditando(null)} />
    </div>
  );
}

function CartaoEvento({ e, sede, para, editar, passado }: { e: ComId<EventoAdm>; sede: string; para: string; editar?: () => void; passado?: boolean }) {
  return (
    <Cartao className={cx("relative overflow-hidden flex flex-col transition-colors hover:border-linha-forte", passado && "opacity-75")}>
      <Link to={para} className="flex gap-4 p-4 pb-3 min-w-0">
        <div className="relative size-20 sm:size-24 shrink-0 rounded-2xl overflow-hidden bg-superficie-2">
          {e.imagemUrl ? (
            <img src={e.imagemUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="size-full grid place-items-center text-center leading-none">
              <span>
                <span className="block text-2xl font-bold numeros">{diaDoMes(e.data)}</span>
                <span className="block text-xs text-texto-3 font-semibold mt-1">{mesAbrev(e.data)}</span>
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 justify-between">
            <p className="font-semibold leading-snug line-clamp-2">{e.nome}</p>
          </div>
          <p className="text-sm text-texto-2 mt-1 truncate">
            {dataExtensa(e.data)} · {hora(e.data)}
          </p>
          <p className="text-xs text-texto-3 truncate mt-0.5">{sede}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Selo tom={TOM_STATUS_EVENTO[e.status]} ponto>
              {ROTULO_STATUS_EVENTO[e.status]}
            </Selo>
            {e.status === "rascunho" && e.motivoDevolucao && <Selo tom="perigo">Devolvido</Selo>}
            <span className="text-xs text-texto-3 numeros">
              Sócio {e.valorSocio ? moeda(e.valorSocio) : "grátis"} · Público {moeda(e.valorPublico)}
            </span>
          </div>
        </div>
      </Link>
      <div className="px-4 pb-4 mt-auto flex items-end gap-3">
        <BarraOcupacao vendidos={e.vendidos} reservados={e.reservados} capacidade={e.capacidade} className="flex-1" />
        {editar ? (
          <BotaoIcone icone="lapis" rotulo="Editar evento" onClick={editar} className="-mb-1 -mr-1" />
        ) : (
          <span className="size-10 grid place-items-center text-texto-3 -mb-1 -mr-1" title="Só a diretoria altera eventos publicados">
            <Icone nome="cadeado" className="size-4" />
          </span>
        )}
      </div>
    </Cartao>
  );
}

// ── Formulário ───────────────────────────────────────────────

interface Form {
  nome: string;
  descricao: string;
  sedeId: string;
  data: string;
  local: string;
  valorSocio: string;
  valorPublico: string;
  capacidade: string;
  limitePorPedido: string;
  vendaAte: string;
  imagemUrl: string | null;
  status: StatusEvento;
}

function formDe(e: ComId<Evento> | null, sedePadrao: string): Form {
  return {
    nome: e?.nome ?? "",
    descricao: e?.descricao ?? "",
    sedeId: e?.sedeId ?? sedePadrao,
    data: e ? paraInputDataHora(e.data) : "",
    local: e?.local ?? "",
    valorSocio: e ? textoMoeda(e.valorSocio) : "",
    valorPublico: e ? textoMoeda(e.valorPublico) : "",
    capacidade: e?.capacidade ? String(e.capacidade) : "",
    limitePorPedido: String(e?.limitePorPedido ?? 6),
    vendaAte: e?.vendaAte ? paraInputDataHora(e.vendaAte) : "",
    imagemUrl: e?.imagemUrl ?? null,
    status: e?.status ?? "rascunho",
  };
}

function FormEvento({ evento, fechar }: { evento: ComId<EventoAdm> | "novo" | null; fechar: () => void }) {
  const { tid, torcida, ehDiretoria, sedeEscopo, sedes, pct, podePublicarNaSede } = usePainel();
  const avisar = useToast();
  const existente = evento && evento !== "novo" ? evento : null;
  const sedePadrao = sedeEscopo ?? torcida.sedePrincipalId;
  const [f, setF] = useState<Form>(() => formDe(existente, sedePadrao));
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const [confirmarStatus, setConfirmarStatus] = useState(false);
  useTourPagina("eventos-criar", { ativo: evento === "novo" });

  useEffect(() => {
    if (evento) {
      setF(formDe(existente, sedePadrao));
      setErros({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const vSocio = centavosDeTexto(f.valorSocio || "0");
  const vPublico = centavosDeTexto(f.valorPublico || "0");
  // Subsede: só rascunho ou "enviar para aprovação". Diretoria: tudo (publicar exige conta ativa em subsede).
  const opcoesStatus: StatusEvento[] = !ehDiretoria
    ? ["rascunho", "em_aprovacao"]
    : existente
      ? existente.status === "em_aprovacao"
        ? ["rascunho", "em_aprovacao", "publicado", "cancelado"]
        : ["rascunho", "publicado", "encerrado", "cancelado"]
      : ["rascunho", "publicado"];
  const publicarBloqueado = ehDiretoria && !podePublicarNaSede(f.sedeId);
  const dica = (v: number) => (v > 0 ? `Torcedor paga ${moeda(v + taxa(v, pct))} (inclui ${pct}% de taxa)` : undefined);

  function validar(): boolean {
    const e: Partial<Record<keyof Form, string>> = {};
    if (f.nome.trim().length < 3) e.nome = "Dê um nome ao evento.";
    const data = deInputDataHora(f.data);
    if (!data) e.data = "Informe a data e a hora.";
    if (vPublico <= 0) e.valorPublico = "O valor para o público precisa ser maior que zero.";
    if (vSocio < 0) e.valorSocio = "Valor inválido.";
    if (f.capacidade) {
      const c = Number(f.capacidade);
      if (!Number.isInteger(c) || c <= 0) e.capacidade = "Use um número inteiro maior que zero.";
      else if (existente && c < existente.vendidos + existente.reservados)
        e.capacidade = `Já existem ${existente.vendidos + existente.reservados} ingressos vendidos ou reservados.`;
    }
    const lim = Number(f.limitePorPedido);
    if (!Number.isInteger(lim) || lim < 1 || lim > 20) e.limitePorPedido = "Entre 1 e 20.";
    if (f.vendaAte) {
      const va = deInputDataHora(f.vendaAte);
      if (!va) e.vendaAte = "Data inválida.";
      else if (data && va.toMillis() > data.toMillis() + 6 * 3600_000) e.vendaAte = "As vendas devem terminar antes (ou pouco depois) do início do evento.";
    }
    if (!f.sedeId) e.sedeId = "Escolha a sede organizadora.";
    if (!opcoesStatus.includes(f.status)) e.status = "Escolha uma situação válida.";
    else if (f.status === "publicado" && !podePublicarNaSede(f.sedeId))
      e.status = "Esta subsede ainda não tem conta de recebimento ativa. Salve como rascunho e publique quando a conta estiver ativa.";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function pedirSalvar() {
    if (!validar()) return;
    if (existente && f.status !== existente.status && (f.status === "cancelado" || f.status === "encerrado")) {
      setConfirmarStatus(true);
      return;
    }
    void salvar();
  }

  async function salvar() {
    setSalvando(true);
    const dados = {
      nome: f.nome.trim(),
      descricao: f.descricao.trim(),
      sedeId: f.sedeId,
      data: deInputDataHora(f.data)!,
      local: f.local.trim(),
      valorSocio: vSocio,
      valorPublico: vPublico,
      capacidade: f.capacidade ? Number(f.capacidade) : null,
      limitePorPedido: Number(f.limitePorPedido),
      vendaAte: f.vendaAte ? deInputDataHora(f.vendaAte) : null,
      status: f.status,
    };
    // Ao reenviar para aprovação (ou publicar), o motivo da devolução anterior deixa de valer.
    const limparDevolucao = !!existente?.motivoDevolucao && f.status !== "rascunho";
    try {
      if (!existente) {
        await addDoc(collection(db, `torcidas/${tid}/eventos`), {
          ...dados,
          codigo: novoCodigoEvento(),
          ...(f.imagemUrl ? { imagemUrl: f.imagemUrl } : {}),
          vendidos: 0,
          reservados: 0,
          criadoEm: serverTimestamp(),
        });
        avisar(
          f.status === "publicado"
            ? "Evento publicado! Já está na página da torcida."
            : f.status === "em_aprovacao"
              ? "Evento enviado para a diretoria aprovar."
              : "Rascunho salvo.",
          "sucesso",
        );
      } else {
        // Só os campos que mudaram — nunca os contadores (vendidos/reservados/entradas), que são do servidor.
        const mudancas: Record<string, unknown> = {};
        const orig = existente as unknown as Record<string, unknown>;
        for (const [k, v] of Object.entries(dados)) {
          const o = orig[k];
          const igual =
            v instanceof Timestamp ? o instanceof Timestamp && o.isEqual(v) : (v ?? null) === (o ?? (k === "descricao" || k === "local" ? "" : null));
          if (!igual) mudancas[k] = v;
        }
        if ((f.imagemUrl ?? null) !== (existente.imagemUrl ?? null)) mudancas.imagemUrl = f.imagemUrl ?? deleteField();
        if (limparDevolucao) mudancas.motivoDevolucao = deleteField();
        if (Object.keys(mudancas).length === 0) {
          fechar();
          return;
        }
        await updateDoc(doc(db, `torcidas/${tid}/eventos/${existente.id}`), { ...mudancas, atualizadoEm: serverTimestamp() });
        avisar("Evento atualizado.", "sucesso");
      }
      fechar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  const sedesPermitidas = ehDiretoria ? sedes.filter((s) => s.ativa !== false || s.id === f.sedeId) : sedes.filter((s) => s.id === sedeEscopo);

  return (
    <Gaveta
      aberto={!!evento}
      fechar={() => !salvando && fechar()}
      titulo={existente ? "Editar evento" : "Novo evento"}
      rodape={
        <div className="flex gap-2 justify-end">
          <Botao variante="fantasma" onClick={fechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao onClick={pedirSalvar} carregando={salvando} icone="check" data-tour="evento-salvar">
            {f.status === "em_aprovacao" && (!existente || existente.status !== "em_aprovacao")
              ? "Enviar para aprovação"
              : existente
                ? "Salvar alterações"
                : f.status === "publicado"
                  ? "Publicar evento"
                  : "Salvar rascunho"}
          </Botao>
        </div>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          pedirSalvar();
        }}
        noValidate
      >
        <div className="space-y-5" data-tour="evento-nome">
        <Campo rotulo="Nome do evento" value={f.nome} onChange={(v) => set("nome", v)} erro={erros.nome} maxLength={90} placeholder="Ex.: Caravana para a final" />
        <AreaTexto
          rotulo="Descrição"
          value={f.descricao}
          onChange={(e) => set("descricao", e.target.value)}
          maxLength={2000}
          placeholder="Horário de saída, o que está incluso, regras de entrada..."
        />
        </div>
        <div data-tour="evento-sede">
        <Selecao
          rotulo="Sede organizadora"
          value={f.sedeId}
          onChange={(e) => set("sedeId", e.target.value)}
          disabled={!ehDiretoria}
          erro={erros.sedeId}
          dica="O valor dos ingressos vai para o extrato desta sede."
        >
          {sedesPermitidas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
              {s.tipo === "principal" ? " (principal)" : ""}
            </option>
          ))}
        </Selecao>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-tour="evento-data">
          <Campo rotulo="Data e hora" type="datetime-local" value={f.data} onChange={(v) => set("data", v)} erro={erros.data} />
          <Campo rotulo="Local" value={f.local} onChange={(v) => set("local", v)} placeholder="Ex.: Sede Central" maxLength={120} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-tour="evento-valores">
          <Campo
            rotulo="Valor para sócio"
            mascara="moeda"
            value={f.valorSocio}
            onChange={(v) => set("valorSocio", v)}
            erro={erros.valorSocio}
            dica={dica(vSocio) ?? "Deixe vazio ou 0 para sócio não pagar."}
            placeholder="0,00"
          />
          <Campo
            rotulo="Valor para o público"
            mascara="moeda"
            value={f.valorPublico}
            onChange={(v) => set("valorPublico", v)}
            erro={erros.valorPublico}
            dica={dica(vPublico)}
            placeholder="0,00"
          />
        </div>
        <Aviso tom="info">
          A taxa de serviço de {pct}% é somada ao valor e fica no caixa da diretoria. O valor do ingresso vai para a sede organizadora.
        </Aviso>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-tour="evento-capacidade">
          <Campo
            rotulo="Capacidade (opcional)"
            inputMode="numeric"
            value={f.capacidade}
            onChange={(v) => set("capacidade", v.replace(/\D/g, ""))}
            erro={erros.capacidade}
            dica="Deixe vazio para vendas sem limite."
          />
          <Campo
            rotulo="Limite por pedido"
            inputMode="numeric"
            value={f.limitePorPedido}
            onChange={(v) => set("limitePorPedido", v.replace(/\D/g, ""))}
            erro={erros.limitePorPedido}
            dica="Máximo de ingressos numa compra."
          />
        </div>
        <Campo
          rotulo="Vender até (opcional)"
          type="datetime-local"
          value={f.vendaAte}
          onChange={(v) => set("vendaAte", v)}
          erro={erros.vendaAte}
          dica="Depois desse horário o botão de compra some."
        />
        <div data-tour="evento-imagem">
        <SeletorImagem
          rotulo="Imagem do evento"
          url={f.imagemUrl}
          onChange={(u) => set("imagemUrl", u)}
          pasta={`torcidas/${tid}/publico/eventos`}
          prefixo="evento"
          dica="JPG, PNG ou WebP até 5 MB. Formato horizontal fica melhor."
        />
        </div>
        <div data-tour="evento-situacao">
          <p className="block text-sm font-medium text-texto-2 mb-1.5">Situação</p>
          {existente?.motivoDevolucao && (
            <Aviso tom="alerta" titulo="A diretoria devolveu este evento" className="mb-3">
              {existente.motivoDevolucao}
            </Aviso>
          )}
          <div className="grid grid-cols-2 gap-2">
            {opcoesStatus.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("status", s)}
                disabled={s === "publicado" && publicarBloqueado && existente?.status !== "publicado"}
                className={cx(
                  "min-h-12 px-2 py-2 rounded-2xl border text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                  f.status === s ? "border-primaria bg-primaria/10 text-texto ring-1 ring-primaria" : "border-linha bg-superficie-2 text-texto-2 hover:border-linha-forte",
                )}
              >
                {ROTULO_STATUS_EVENTO[s]}
              </button>
            ))}
          </div>
          <p className="text-xs text-texto-3 mt-1.5">
            {f.status === "rascunho"
              ? "Rascunho não aparece na página pública."
              : f.status === "em_aprovacao"
                ? "A diretoria confere e publica. Enquanto isso o evento não aparece na página."
                : f.status === "publicado"
                ? "Publicado aparece na página e pode ser comprado."
                : f.status === "encerrado"
                  ? "Encerrado continua visível, mas sem vendas."
                  : "Cancelado some da página. Estornos são feitos na Pagar.me."}
          </p>
          {publicarBloqueado && (
            <p className="text-xs text-alerta mt-1.5">
              Para publicar evento desta subsede, ela precisa de conta de recebimento ativa (a própria subsede cadastra em Recebimentos).
            </p>
          )}
          {erros.status && <p className="text-xs text-perigo mt-1">{erros.status}</p>}
        </div>
      </form>

      <Confirmar
        aberto={confirmarStatus}
        fechar={() => setConfirmarStatus(false)}
        titulo={f.status === "cancelado" ? "Cancelar este evento?" : "Encerrar as vendas?"}
        rotulo={f.status === "cancelado" ? "Sim, cancelar evento" : "Encerrar"}
        perigo={f.status === "cancelado"}
        acao={salvar}
      >
        {f.status === "cancelado" ? (
          <>
            O evento sai da página pública e ninguém mais consegue comprar.
            {existente && existente.vendidos > 0 && (
              <strong className="block mt-2 text-texto">
                Já existem {existente.vendidos} ingressos vendidos. Os estornos precisam ser feitos no painel da Pagar.me.
              </strong>
            )}
          </>
        ) : (
          "O evento continua visível, mas a venda de ingressos é encerrada."
        )}
      </Confirmar>
    </Gaveta>
  );
}

// ── Detalhe ───────────────────────────────────────────────────

const ROTULO_INGRESSO: Record<Ingresso["status"], string> = { valido: "Válido", usado: "Entrou", cancelado: "Cancelado" };
const TOM_INGRESSO: Record<Ingresso["status"], Tom> = { valido: "sucesso", usado: "info", cancelado: "perigo" };

export function DetalheEvento() {
  const { eventoId = "" } = useParams();
  const { tid, uid, torcida, ehDiretoria, sedeEscopo, nomeSede, base, pct, podePublicarNaSede } = usePainel();
  const navegar = useNavigate();
  const avisar = useToast();
  const ev = useDocumento<EventoAdm>(`torcidas/${tid}/eventos/${eventoId}`);
  const [editando, setEditando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [aprovar, setAprovar] = useState(false);
  const [devolver, setDevolver] = useState(false);
  const [enviar, setEnviar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busca, setBusca] = useState("");
  const e = ev.dados;
  const podeEditarFn = usePodeEditar();
  useTourPagina("evento-detalhe");
  const podeEditar = !!e && podeEditarFn(e);
  const [qrAberto, setQrAberto] = useState(false);

  // Evento criado antes do link curto: ganha o código na primeira vez que alguém com permissão abre
  useEffect(() => {
    if (e && !e.codigo && podeEditar) {
      updateDoc(doc(db, `torcidas/${tid}/eventos/${eventoId}`), { codigo: novoCodigoEvento() }).catch(() => {
        /* sem permissão para editar agora: o link antigo (/evento/id) continua valendo */
      });
    }
  }, [e, podeEditar, tid, eventoId]);

  const ingressos = useColecao<Ingresso>(
    !e
      ? null
      : ehDiretoria
        ? query(collection(db, `torcidas/${tid}/ingressos`), where("eventoId", "==", eventoId), orderBy("criadoEm", "desc"))
        : sedeEscopo && e.sedeId === sedeEscopo
          ? query(collection(db, `torcidas/${tid}/ingressos`), where("eventoId", "==", eventoId), where("sedeId", "==", sedeEscopo))
          : null,
    `ingressos-${tid}-${eventoId}-${sedeEscopo}-${!!e}`,
  );
  const lista = useMemo(() => {
    const b = normalizar(busca.trim());
    const dig = busca.replace(/\D/g, "");
    return [...ingressos.dados]
      .sort((a, b2) => (b2.criadoEm?.toMillis() ?? 0) - (a.criadoEm?.toMillis() ?? 0))
      .filter((i) => !b || normalizar(`${i.titularNome} ${i.codigo}`).includes(b) || (dig.length >= 3 && i.titularCpf?.includes(dig)));
  }, [ingressos.dados, busca]);

  if (ev.carregando) return <Carregando />;
  if (!e)
    return (
      <Vazio icone="calendario" titulo="Evento não encontrado" acao={<BotaoLink to={`${base}/eventos`} variante="contorno" icone="setaEsquerda">Voltar aos eventos</BotaoLink>}>
        {ev.erro ? mensagemDeErro(ev.erro) : "Ele pode ter sido excluído."}
      </Vazio>
    );

  const linkPublico = linkEvento(torcida.slug, e);
  const validos = ingressos.dados.filter((i) => i.status !== "cancelado");
  const receitaBase = validos.reduce((s, i) => s + (i.valorBase ?? 0), 0);
  const qtdSocio = validos.filter((i) => i.tipo === "socio").length;
  const podeExcluir = e.vendidos === 0 && e.reservados === 0;
  const refEvento = doc(db, `torcidas/${tid}/eventos/${e.id}`);
  const contaAtiva = podePublicarNaSede(e.sedeId);
  const daSubsede = e.sedeId !== torcida.sedePrincipalId;

  return (
    <div>
      <Link to={`${base}/eventos`} className="inline-flex items-center gap-1.5 text-sm text-texto-2 hover:text-texto mb-4">
        <Icone nome="setaEsquerda" className="size-4" /> Eventos
      </Link>

      <Cartao className="overflow-hidden mb-4">
        <div className="grid md:grid-cols-[280px_1fr]">
          <div className="relative aspect-[16/9] md:aspect-auto md:min-h-full bg-superficie-2">
            {e.imagemUrl ? (
              <img src={e.imagemUrl} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center brilho-primaria">
                <div className="text-center leading-none">
                  <p className="text-5xl font-bold numeros">{diaDoMes(e.data)}</p>
                  <p className="text-sm text-texto-2 font-semibold mt-2">{mesAbrev(e.data)}</p>
                </div>
              </div>
            )}
          </div>
          <div className="p-5 sm:p-6 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Selo tom={TOM_STATUS_EVENTO[e.status]} ponto>
                {ROTULO_STATUS_EVENTO[e.status]}
              </Selo>
              <span className="text-xs text-texto-3">{nomeSede(e.sedeId)}</span>
            </div>
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight leading-tight">{e.nome}</h1>
            <p className="text-texto-2 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Icone nome="calendario" className="size-4" /> {dataHora(e.data)}
              </span>
              {e.local && (
                <span className="inline-flex items-center gap-1.5">
                  <Icone nome="local" className="size-4" /> {e.local}
                </span>
              )}
            </p>
            <p className="text-sm text-texto-3 mt-2 numeros">
              Sócio {e.valorSocio ? moeda(e.valorSocio) : "grátis"} · Público {moeda(e.valorPublico)} · + {pct}% de taxa
              {e.vendaAte && ` · vendas até ${dataHora(e.vendaAte)}`}
            </p>
            <div className="flex flex-wrap gap-2 mt-5" data-tour="evento-acoes">
              {podeEditar && (
                <Botao tamanho="sm" icone="lapis" onClick={() => setEditando(true)}>
                  Editar
                </Botao>
              )}
              <a href={linkPublico} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold bg-superficie-2 hover:bg-superficie-3">
                <Icone nome="externo" className="size-4" /> Ver página
              </a>
              <BotaoLink to={`/${torcida.slug}/portaria`} tamanho="sm" variante="suave" icone="qr">
                Portaria
              </BotaoLink>
              {podeEditar && podeExcluir && (
                <Botao tamanho="sm" variante="perigo" icone="lixeira" onClick={() => setExcluir(true)}>
                  Excluir
                </Botao>
              )}
            </div>
          </div>
        </div>
      </Cartao>

      {/* Fluxo de aprovação */}
      {ehDiretoria && e.status === "em_aprovacao" && (
        <Cartao className="p-5 sm:p-6 mb-4 border-alerta/40" data-tour="evento-aprovacao">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <span className="size-12 shrink-0 rounded-2xl grid place-items-center bg-alerta/15 text-alerta">
              <Icone nome="relogio" className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{nomeSede(e.sedeId)} enviou este evento para aprovação</p>
              <p className="text-sm text-texto-2 mt-0.5">
                Confira nome, data, preços e descrição. Ao aprovar, o evento aparece na página e as vendas começam.
                {daSubsede && contaAtiva && " O valor dos ingressos cai direto na conta da subsede; a taxa de serviço vai para a torcida."}
              </p>
              {!contaAtiva && (
                <p className="text-sm text-alerta mt-2">
                  Não dá para aprovar ainda: a subsede não tem conta de recebimento ativa. Peça para o responsável dela cadastrar em “Recebimentos” no painel
                  da subsede.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Botao variante="contorno" tamanho="sm" icone="setaEsquerda" onClick={() => setDevolver(true)}>
                Devolver para ajustes
              </Botao>
              <Botao tamanho="sm" icone="check" onClick={() => setAprovar(true)} disabled={!contaAtiva} title={contaAtiva ? undefined : "Subsede sem conta de recebimento ativa"}>
                Aprovar e publicar
              </Botao>
            </div>
          </div>
        </Cartao>
      )}
      <div data-tour="evento-situacao-subsede">
      {!ehDiretoria && e.status === "em_aprovacao" && (
        <Aviso tom="info" titulo="Aguardando aprovação da diretoria" className="mb-4">
          Você ainda pode editar. Quando a diretoria aprovar, o evento é publicado e só ela poderá alterar.
          {!contaAtiva && " Atenção: sem conta de recebimento ativa a diretoria não consegue aprovar."}
        </Aviso>
      )}
      {e.status === "rascunho" && e.motivoDevolucao && (
        <Aviso tom="alerta" titulo="Devolvido pela diretoria para ajustes" className="mb-4">
          <span className="whitespace-pre-line">{e.motivoDevolucao}</span>
          {e.devolvidoEm && <span className="block text-xs text-texto-3 mt-1">{dataHora(e.devolvidoEm)}</span>}
        </Aviso>
      )}
      {!ehDiretoria && e.status === "rascunho" && podeEditar && (
        <Cartao className="p-4 sm:p-5 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-texto-2 flex-1">Este evento é um rascunho. Quando estiver pronto, envie para a diretoria aprovar e publicar.</p>
          <Botao tamanho="sm" icone="enviar" onClick={() => setEnviar(true)}>
            Enviar para aprovação
          </Botao>
        </Cartao>
      )}
      {!ehDiretoria && !podeEditar && e.sedeId === sedeEscopo && (
        <Aviso tom="info" titulo="Somente leitura" className="mb-4">
          {e.status === "publicado" ? "Publicado pela diretoria" : `Evento ${ROTULO_STATUS_EVENTO[e.status].toLowerCase()}`}; para alterar, fale com a diretoria.
        </Aviso>
      )}
      </div>

      <Cartao className="p-4 sm:p-5 mb-4" data-tour="evento-link">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="text-sm font-semibold">Link direto do evento</p>
          {e.codigo && (
            <span className="text-xs text-texto-3">
              Código <strong className="font-mono text-texto-2 tracking-wider">{e.codigo.toUpperCase()}</strong>
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <code className="flex-1 min-w-0 truncate rounded-xl bg-superficie-2 border border-linha px-3 h-9 leading-9 text-sm text-texto-2">{linkPublico}</code>
          <div className="flex flex-wrap gap-2">
            <BotaoCopiar texto={linkPublico} rotulo="Copiar link" />
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`*${e.nome}*\n${dataExtensa(e.data)}, ${hora(e.data)}${e.local ? ` · ${e.local}` : ""}\nGaranta seu ingresso: ${linkPublico}`)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold bg-superficie-2 hover:bg-superficie-3"
            >
              <Icone nome="whatsapp" className="size-4" /> WhatsApp
            </a>
            <button
              type="button"
              onClick={() => setQrAberto(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold bg-superficie-2 hover:bg-superficie-3"
            >
              <Icone nome="qr" className="size-4" /> QR Code
            </button>
          </div>
        </div>
        <p className="text-xs text-texto-3 mt-2">Quem abre o link cai direto na página deste evento, pronta para comprar.</p>
      </Cartao>
      <Modal
        aberto={qrAberto}
        fechar={() => setQrAberto(false)}
        titulo="QR Code do evento"
        descricao="Para cartaz, faixa ou tela: quem apontar a câmera cai direto na compra."
        largura="max-w-sm"
      >
        <QrCode valor={linkPublico} className="w-full" />
        <p className="text-center text-sm text-texto-2 mt-3 break-all">{linkPublico.replace(/^https?:\/\//, "")}</p>
        <Botao
          largo
          className="mt-4"
          icone="download"
          onClick={async () => {
            const url = await QRCodeLib.toDataURL(linkPublico, { width: 1200, margin: 2, errorCorrectionLevel: "M" });
            const a = document.createElement("a");
            a.href = url;
            a.download = `qr-${torcida.slug}-${e.codigo ?? e.id}.png`;
            a.click();
          }}
        >
          Baixar imagem
        </Botao>
      </Modal>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4" data-tour="evento-numeros">
        <Indicador rotulo="Vendidos" icone="ingresso" tom="primaria" valor={e.vendidos} detalhe={e.capacidade ? `de ${e.capacidade} lugares` : "Sem limite de lugares"} />
        <Indicador rotulo="Reservados" icone="relogio" tom="alerta" valor={e.reservados} detalhe="Aguardando pagamento" />
        <Indicador rotulo="Entradas" icone="qr" tom="info" valor={e.entradas ?? 0} detalhe={e.vendidos ? `${Math.round(((e.entradas ?? 0) / e.vendidos) * 100)}% dos vendidos` : "Na portaria"} />
        <Indicador rotulo="Receita (valor base)" icone="dinheiro" tom="sucesso" valor={moeda(receitaBase)} detalhe={`${qtdSocio} de sócio · ${validos.length - qtdSocio} de público`} />
      </div>
      {e.capacidade ? <BarraOcupacao vendidos={e.vendidos} reservados={e.reservados} capacidade={e.capacidade} className="mb-6" /> : null}

      <Cartao className="p-4 sm:p-5" data-tour="evento-ingressos">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between mb-4">
          <h2 className="font-bold">
            Ingressos <span className="text-texto-3 font-normal">({ingressos.dados.length})</span>
          </h2>
          <Campo value={busca} onChange={setBusca} placeholder="Nome, código ou CPF" icone="busca" className="sm:w-72" aria-label="Buscar ingresso" />
        </div>
        {!ehDiretoria && e.sedeId !== sedeEscopo ? (
          <Aviso tom="info">Este evento é de outra sede. Você só vê os ingressos dos eventos da sua sede.</Aviso>
        ) : ingressos.carregando || ingressos.erro || lista.length === 0 ? (
          <EstadoLista
            carregando={ingressos.carregando}
            erro={ingressos.erro}
            vazio
            icone="ingresso"
            tituloVazio={busca ? "Nenhum ingresso encontrado" : "Nenhum ingresso vendido ainda"}
            textoVazio={busca ? undefined : "Divulgue o link do evento para começar a vender."}
          />
        ) : (
          <ul className="divide-y divide-linha">
            {lista.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3">
                <span className={cx("size-9 shrink-0 rounded-xl grid place-items-center", i.tipo === "socio" ? "bg-secundaria/15 text-secundaria" : "bg-superficie-2 text-texto-2")}>
                  <Icone nome={i.tipo === "socio" ? "estrela" : "ingresso"} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{i.titularNome}</p>
                  <p className="text-xs text-texto-3 truncate numeros">
                    {i.codigo} · {cpfMascarado(i.titularCpf)} · {i.tipo === "socio" ? "Sócio" : "Público"}
                    {i.usadoEm && ` · entrou ${hora(i.usadoEm)}`}
                  </p>
                </div>
                <Selo tom={TOM_INGRESSO[i.status]}>{ROTULO_INGRESSO[i.status]}</Selo>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <FormEvento evento={editando ? e : null} fechar={() => setEditando(false)} />
      <Confirmar
        aberto={aprovar}
        fechar={() => setAprovar(false)}
        titulo="Aprovar e publicar?"
        rotulo="Aprovar e publicar"
        acao={async () => {
          await updateDoc(refEvento, { status: "publicado", aprovadoEm: serverTimestamp(), aprovadoPor: uid, motivoDevolucao: deleteField() });
          avisar("Evento aprovado e publicado.", "sucesso");
        }}
      >
        “{e.nome}” aparece na página da torcida e começa a vender. Depois de publicado, só a diretoria pode alterar.
      </Confirmar>
      <Confirmar
        aberto={enviar}
        fechar={() => setEnviar(false)}
        titulo="Enviar para aprovação?"
        rotulo="Enviar"
        acao={async () => {
          await updateDoc(refEvento, { status: "em_aprovacao", motivoDevolucao: deleteField() });
          avisar("Enviado! A diretoria vai conferir e publicar.", "sucesso");
        }}
      >
        A diretoria vai conferir os dados de “{e.nome}” e publicar. Enquanto isso, você ainda pode editar.
      </Confirmar>
      <Modal
        aberto={devolver}
        fechar={() => setDevolver(false)}
        titulo="Devolver para ajustes"
        descricao="O evento volta a ser rascunho e a subsede vê o motivo."
        rodape={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setDevolver(false)}>
              Cancelar
            </Botao>
            <Botao
              icone="setaEsquerda"
              disabled={motivo.trim().length < 5}
              onClick={async () => {
                try {
                  await updateDoc(refEvento, { status: "rascunho", motivoDevolucao: motivo.trim(), devolvidoEm: serverTimestamp() });
                  avisar("Evento devolvido para a subsede.", "sucesso");
                  setDevolver(false);
                  setMotivo("");
                } catch (err) {
                  avisar(mensagemDeErro(err), "erro");
                }
              }}
            >
              Devolver
            </Botao>
          </div>
        }
      >
        <AreaTexto
          rotulo="O que precisa ser ajustado?"
          value={motivo}
          onChange={(ev2) => setMotivo(ev2.target.value)}
          maxLength={500}
          placeholder="Ex.: o preço para sócio está acima do combinado; ajuste a descrição com o horário de saída."
        />
      </Modal>
      <Confirmar
        aberto={excluir}
        fechar={() => setExcluir(false)}
        titulo="Excluir evento?"
        rotulo="Excluir definitivamente"
        perigo
        acao={async () => {
          await deleteDoc(doc(db, `torcidas/${tid}/eventos/${e.id}`));
          avisar("Evento excluído.", "sucesso");
          navegar(`${base}/eventos`, { replace: true });
        }}
      >
        “{e.nome}” será apagado. Isso só é possível porque nenhum ingresso foi vendido ou reservado.
      </Confirmar>
    </div>
  );
}
