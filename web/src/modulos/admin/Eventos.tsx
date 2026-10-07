import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { addDoc, collection, deleteDoc, deleteField, doc, orderBy, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
import { centavosDeTexto, cpfMascarado, dataExtensa, dataHora, diaDoMes, hora, mesAbrev, moeda, taxa } from "@/lib/formatos";
import type { ComId, Evento, Ingresso, StatusEvento } from "@/lib/tipos";
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
  Selecao,
  Selo,
  useToast,
  Vazio,
  type Tom,
} from "@/ui";
import { usePainel } from "./contexto";
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
  publicado: "Publicado",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
};
const TOM_STATUS_EVENTO: Record<StatusEvento, Tom> = {
  rascunho: "neutro",
  publicado: "sucesso",
  encerrado: "info",
  cancelado: "perigo",
};

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
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<"todos" | StatusEvento>("todos");
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
        descricao="Crie eventos, defina preços e acompanhe as vendas."
        acoes={
          <Botao icone="mais" onClick={() => setEditando("novo")}>
            Novo evento
          </Botao>
        }
      />

      <div className="flex flex-col gap-3 mb-5">
        <Pilulas
          valor={status}
          onChange={setStatus}
          opcoes={(["todos", "publicado", "rascunho", "encerrado", "cancelado"] as const).map((s) => ({
            valor: s,
            rotulo: s === "todos" ? "Todos" : ROTULO_STATUS_EVENTO[s],
            contador: contagem[s] ?? 0,
          }))}
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
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
        <div className="space-y-8">
          {filtrados.futuros.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-3">Próximos</h2>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filtrados.futuros.map((e) => (
                  <CartaoEvento key={e.id} e={e} sede={nomeSede(e.sedeId)} para={`${base}/eventos/${e.id}`} editar={() => setEditando(e)} />
                ))}
              </div>
            </section>
          )}
          {filtrados.passados.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-3">Já aconteceram</h2>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filtrados.passados.map((e) => (
                  <CartaoEvento key={e.id} e={e} sede={nomeSede(e.sedeId)} para={`${base}/eventos/${e.id}`} editar={() => setEditando(e)} passado />
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

function CartaoEvento({ e, sede, para, editar, passado }: { e: ComId<Evento>; sede: string; para: string; editar: () => void; passado?: boolean }) {
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
            <span className="text-xs text-texto-3 numeros">
              Sócio {e.valorSocio ? moeda(e.valorSocio) : "grátis"} · Público {moeda(e.valorPublico)}
            </span>
          </div>
        </div>
      </Link>
      <div className="px-4 pb-4 mt-auto flex items-end gap-3">
        <BarraOcupacao vendidos={e.vendidos} reservados={e.reservados} capacidade={e.capacidade} className="flex-1" />
        <BotaoIcone icone="lapis" rotulo="Editar evento" onClick={editar} className="-mb-1 -mr-1" />
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

function FormEvento({ evento, fechar }: { evento: ComId<Evento> | "novo" | null; fechar: () => void }) {
  const { tid, torcida, ehDiretoria, sedeEscopo, sedes, pct } = usePainel();
  const avisar = useToast();
  const existente = evento && evento !== "novo" ? evento : null;
  const sedePadrao = sedeEscopo ?? torcida.sedePrincipalId;
  const [f, setF] = useState<Form>(() => formDe(existente, sedePadrao));
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const [confirmarStatus, setConfirmarStatus] = useState(false);

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
    if (!existente && !["rascunho", "publicado"].includes(f.status)) e.status = "Um evento novo começa como rascunho ou publicado.";
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
    try {
      if (!existente) {
        await addDoc(collection(db, `torcidas/${tid}/eventos`), {
          ...dados,
          ...(f.imagemUrl ? { imagemUrl: f.imagemUrl } : {}),
          vendidos: 0,
          reservados: 0,
          criadoEm: serverTimestamp(),
        });
        avisar(f.status === "publicado" ? "Evento publicado! Já está na página da torcida." : "Rascunho salvo.", "sucesso");
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

  const opcoesStatus: StatusEvento[] = existente ? ["rascunho", "publicado", "encerrado", "cancelado"] : ["rascunho", "publicado"];
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
          <Botao onClick={pedirSalvar} carregando={salvando} icone="check">
            {existente ? "Salvar alterações" : f.status === "publicado" ? "Publicar evento" : "Salvar rascunho"}
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
        <Campo rotulo="Nome do evento" value={f.nome} onChange={(v) => set("nome", v)} erro={erros.nome} maxLength={90} placeholder="Ex.: Caravana para a final" />
        <AreaTexto
          rotulo="Descrição"
          value={f.descricao}
          onChange={(e) => set("descricao", e.target.value)}
          maxLength={2000}
          placeholder="Horário de saída, o que está incluso, regras de entrada..."
        />
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data e hora" type="datetime-local" value={f.data} onChange={(v) => set("data", v)} erro={erros.data} />
          <Campo rotulo="Local" value={f.local} onChange={(v) => set("local", v)} placeholder="Ex.: Sede Central" maxLength={120} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="grid gap-4 sm:grid-cols-2">
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
        <SeletorImagem
          rotulo="Imagem do evento"
          url={f.imagemUrl}
          onChange={(u) => set("imagemUrl", u)}
          pasta={`torcidas/${tid}/publico/eventos`}
          prefixo="evento"
          dica="JPG, PNG ou WebP até 5 MB. Formato horizontal fica melhor."
        />
        <div>
          <p className="block text-sm font-medium text-texto-2 mb-1.5">Situação</p>
          <div className="grid grid-cols-2 gap-2">
            {opcoesStatus.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("status", s)}
                className={cx(
                  "h-12 rounded-2xl border text-sm font-semibold transition-colors",
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
              : f.status === "publicado"
                ? "Publicado aparece na página e pode ser comprado."
                : f.status === "encerrado"
                  ? "Encerrado continua visível, mas sem vendas."
                  : "Cancelado some da página. Estornos são feitos na Pagar.me."}
          </p>
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
  const { tid, torcida, ehDiretoria, sedeEscopo, nomeSede, base, pct } = usePainel();
  const navegar = useNavigate();
  const avisar = useToast();
  const ev = useDocumento<Evento>(`torcidas/${tid}/eventos/${eventoId}`);
  const [editando, setEditando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [busca, setBusca] = useState("");
  const e = ev.dados;
  const podeEditar = !!e && (ehDiretoria || e.sedeId === sedeEscopo);

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

  const linkPublico = `${location.origin}/${torcida.slug}/evento/${e.id}`;
  const validos = ingressos.dados.filter((i) => i.status !== "cancelado");
  const receitaBase = validos.reduce((s, i) => s + (i.valorBase ?? 0), 0);
  const qtdSocio = validos.filter((i) => i.tipo === "socio").length;
  const podeExcluir = e.vendidos === 0 && e.reservados === 0;

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
            <div className="flex flex-wrap gap-2 mt-5">
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

      <Cartao className="p-4 sm:p-5 mb-4">
        <p className="text-sm font-semibold mb-2">Link para divulgar</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <code className="flex-1 min-w-0 truncate rounded-xl bg-superficie-2 border border-linha px-3 h-9 leading-9 text-sm text-texto-2">{linkPublico}</code>
          <div className="flex gap-2">
            <BotaoCopiar texto={linkPublico} rotulo="Copiar link" />
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${e.nome} — ${dataExtensa(e.data)}, ${hora(e.data)}. Garanta seu ingresso: ${linkPublico}`)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold bg-superficie-2 hover:bg-superficie-3"
            >
              <Icone nome="whatsapp" className="size-4" /> WhatsApp
            </a>
          </div>
        </div>
      </Cartao>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <Indicador rotulo="Vendidos" icone="ingresso" tom="primaria" valor={e.vendidos} detalhe={e.capacidade ? `de ${e.capacidade} lugares` : "Sem limite de lugares"} />
        <Indicador rotulo="Reservados" icone="relogio" tom="alerta" valor={e.reservados} detalhe="Aguardando pagamento" />
        <Indicador rotulo="Entradas" icone="qr" tom="info" valor={e.entradas ?? 0} detalhe={e.vendidos ? `${Math.round(((e.entradas ?? 0) / e.vendidos) * 100)}% dos vendidos` : "Na portaria"} />
        <Indicador rotulo="Receita (valor base)" icone="dinheiro" tom="sucesso" valor={moeda(receitaBase)} detalhe={`${qtdSocio} de sócio · ${validos.length - qtdSocio} de público`} />
      </div>
      {e.capacidade ? <BarraOcupacao vendidos={e.vendidos} reservados={e.reservados} capacidade={e.capacidade} className="mb-6" /> : null}

      <Cartao className="p-4 sm:p-5">
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
