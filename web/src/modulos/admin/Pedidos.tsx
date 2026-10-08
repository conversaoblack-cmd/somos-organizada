import { useMemo, useState } from "react";
import { Link } from "react-router";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cpfMascarado, dataHora, mascaraTelefone, moeda, relativo, ROTULO_STATUS_PEDIDO, soDigitos } from "@/lib/formatos";
import type { ComId, Pedido, StatusPedido } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Abas, Aviso, Botao, CabecalhoPagina, Campo, Cartao, cx, Gaveta, Icone, Selecao, Selo, useToast } from "@/ui";
import { api, mensagemDeErro } from "@/lib/api";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { baixarCsv, BotaoCopiar, decimalBR, EstadoLista, Linha, normalizar, numero, numeroWhatsapp, TOM_PEDIDO } from "./util";

/** Quantos pedidos buscar por vez (o painel lê do mais recente para o mais antigo). */
const LOTE = 100;

type PedidoPg = Pedido & { pagarme?: { orderId?: string; chargeId?: string } };

export default function Pedidos() {
  const { tid, ehDiretoria, sedeEscopo, nomeSede } = usePainel();
  const [qtd, setQtd] = useState(LOTE);
  const pedidos = useColecao<PedidoPg>(
    ehDiretoria
      ? query(collection(db, `torcidas/${tid}/pedidos`), orderBy("criadoEm", "desc"), limit(qtd))
      : sedeEscopo
        ? query(collection(db, `torcidas/${tid}/pedidos`), where("sedeId", "==", sedeEscopo), orderBy("criadoEm", "desc"), limit(qtd))
        : null,
    `pedidos-${tid}-${sedeEscopo ?? "todas"}-${qtd}`,
  );
  // Veio a página cheia: pode haver pedidos mais antigos que ainda não foram carregados.
  const temMais = pedidos.dados.length >= qtd;
  const carregandoMais = pedidos.carregando && pedidos.dados.length > 0;
  const [tipo, setTipo] = useState<"todos" | "ingresso" | "socio">("todos");
  const [status, setStatus] = useState<"" | StatusPedido>("");
  const [busca, setBusca] = useState("");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const setAberto = (p: ComId<PedidoPg> | null) => setAbertoId(p?.id ?? null);
  useTourPagina("pedidos");

  const filtrados = useMemo(() => {
    const b = normalizar(busca.trim());
    const dig = soDigitos(busca);
    return pedidos.dados.filter((p) => {
      if (tipo !== "todos" && p.tipo !== tipo) return false;
      if (status && p.status !== status) return false;
      if (!b) return true;
      const texto = normalizar(`${p.comprador?.nome} ${p.comprador?.email} ${p.eventoNome ?? ""} ${p.id} ${p.pagarme?.orderId ?? ""}`);
      return texto.includes(b) || (dig.length >= 3 && (p.comprador?.cpf?.includes(dig) || p.comprador?.telefone?.includes(dig)));
    });
  }, [pedidos.dados, tipo, status, busca]);

  const somaPagos = filtrados.filter((p) => p.status === "pago").reduce((s, p) => s + p.total, 0);

  function exportar() {
    baixarCsv(
      `pedidos-${new Date().toISOString().slice(0, 10)}`,
      ["Data", "Pedido", "Tipo", "Evento", "Comprador", "E-mail", "Telefone", "Forma de pagamento", "Situação", "Valor sem taxa", "Taxa de serviço", "Total", "Sede", "Motivo"],
      filtrados.map((p) => [
        dataHora(p.criadoEm),
        p.id,
        p.tipo === "ingresso" ? "Ingresso" : "Sócio",
        p.eventoNome ?? "",
        p.comprador?.nome,
        p.comprador?.email,
        p.comprador?.telefone,
        p.metodo === "pix" ? "Pix" : "Cartão",
        ROTULO_STATUS_PEDIDO[p.status],
        decimalBR(p.valorBase),
        decimalBR(p.taxa),
        decimalBR(p.total),
        nomeSede(p.sedeId),
        p.motivo ?? "",
      ]),
    );
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Pedidos e ingressos"
        descricao="Pedidos de ingressos e de mensalidades, do mais recente para o mais antigo."
        acoes={
          <button
            type="button"
            onClick={exportar}
            disabled={!filtrados.length}
            data-tour="pedidos-exportar"
            className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3.5 rounded-xl text-sm font-semibold border border-linha-forte hover:bg-superficie-2 disabled:opacity-50"
          >
            <Icone nome="download" className="size-4" /> Baixar planilha
          </button>
        }
      />

      <div className="flex flex-col gap-3 mb-5" data-tour="pedidos-filtros">
        <Abas
          valor={tipo}
          onChange={setTipo}
          className="w-full sm:w-auto"
          opcoes={[
            { valor: "todos", rotulo: "Todos" },
            { valor: "ingresso", rotulo: "Ingressos", icone: "ingresso" },
            { valor: "socio", rotulo: "Sócios", icone: "estrela" },
          ]}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_240px]">
          <Campo value={busca} onChange={setBusca} placeholder="Nome, e-mail, CPF, evento ou nº do pedido" icone="busca" aria-label="Buscar pedidos" />
          <Selecao value={status} onChange={(e) => setStatus(e.target.value as StatusPedido | "")} aria-label="Filtrar por situação">
            <option value="">Todas as situações</option>
            {(Object.keys(ROTULO_STATUS_PEDIDO) as StatusPedido[]).map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_PEDIDO[s]}
              </option>
            ))}
          </Selecao>
        </div>
      </div>

      {temMais && !pedidos.erro && (
        <Aviso tom="info" className="mb-4">
          A busca e a planilha consideram só os {numero(pedidos.dados.length)} pedidos mais recentes. Para incluir os mais antigos, toque em “Carregar mais”
          no fim da lista.
        </Aviso>
      )}

      {(pedidos.carregando && !pedidos.dados.length) || pedidos.erro || filtrados.length === 0 ? (
        <>
          <EstadoLista
            carregando={pedidos.carregando && !pedidos.dados.length}
            erro={pedidos.erro}
            semConexao={pedidos.semConexao}
            vazio
            icone="ingresso"
            tituloVazio={pedidos.dados.length ? "Nenhum pedido com esses filtros" : "Nenhum pedido ainda"}
            textoVazio={pedidos.dados.length ? "Mude os filtros ou a busca." : "Quando alguém comprar um ingresso ou virar sócio, o pedido aparece aqui."}
          />
          {temMais && !pedidos.erro && <CarregarMais carregando={carregandoMais} mais={() => setQtd((n) => n + LOTE)} />}
        </>
      ) : (
        <div data-tour="pedidos-lista">
          <p className="text-sm text-texto-3 mb-3 numeros">
            {numero(filtrados.length)} {filtrados.length === 1 ? "pedido" : "pedidos"} · {moeda(somaPagos)} pagos
            {temMais && " · há pedidos mais antigos"}
          </p>
          {/* Tabela (desktop) */}
          <Cartao className="hidden md:block overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-texto-3 text-xs uppercase tracking-wide">
                <tr className="border-b border-linha">
                  <th className="px-4 py-3 font-semibold">Comprador</th>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold">Quando</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id} onClick={() => setAberto(p)} className="border-b border-linha last:border-0 hover:bg-superficie-2 cursor-pointer">
                    <td className="px-4 py-3">
                      {/* botão de verdade na primeira célula: abre o pedido pelo teclado e leitor de tela */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAberto(p);
                        }}
                        className="font-medium text-left hover:underline focus-visible:outline-2 focus-visible:outline-primaria-texto rounded"
                      >
                        {p.comprador?.nome || "Sem nome"}
                      </button>
                      <p className="text-xs text-texto-3">{p.comprador?.email}</p>
                    </td>
                    <td className="px-4 py-3 max-w-64">
                      <p className="truncate">{p.tipo === "ingresso" ? `${p.itens?.length ?? 1}× ${p.eventoNome ?? "Ingresso"}` : p.renovacao ? "Renovação de sócio" : "Adesão de sócio"}</p>
                      <p className="text-xs text-texto-3">{p.metodo === "pix" ? "Pix" : "Cartão"}</p>
                    </td>
                    <td className="px-4 py-3 text-texto-2 whitespace-nowrap">{dataHora(p.criadoEm)}</td>
                    <td className="px-4 py-3">
                      <Selo tom={TOM_PEDIDO[p.status]} ponto>
                        {ROTULO_STATUS_PEDIDO[p.status]}
                      </Selo>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold numeros">{moeda(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
          {/* Cartões (celular) */}
          <div className="md:hidden grid grid-cols-1 gap-2">
            {filtrados.map((p) => (
              <button key={p.id} type="button" onClick={() => setAberto(p)} className="text-left min-w-0 w-full">
                <Cartao className="p-4 flex items-start gap-3 active:bg-superficie-2">
                  <span className={cx("size-10 shrink-0 rounded-xl grid place-items-center", p.tipo === "ingresso" ? "bg-primaria/12 text-primaria-texto" : "bg-secundaria/15 text-secundaria")}>
                    <Icone nome={p.tipo === "ingresso" ? "ingresso" : "estrela"} className="size-5" />
                  </span>
                  {/* nome com a linha inteira; situação e valor embaixo (a etiqueta não espreme mais o nome) */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.comprador?.nome || "Sem nome"}</p>
                    <p className="text-xs text-texto-3 line-clamp-2 break-words">
                      {p.tipo === "ingresso" ? `${p.itens?.length ?? 1}× ${p.eventoNome ?? "Ingresso"}` : p.renovacao ? "Renovação de sócio" : "Adesão de sócio"} · {relativo(p.criadoEm)}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Selo tom={TOM_PEDIDO[p.status]}>{ROTULO_STATUS_PEDIDO[p.status]}</Selo>
                      <p className="font-semibold numeros">{moeda(p.total)}</p>
                    </div>
                  </div>
                </Cartao>
              </button>
            ))}
          </div>
          {temMais && <CarregarMais carregando={carregandoMais} mais={() => setQtd((n) => n + LOTE)} />}
        </div>
      )}

      <DetalhePedido p={abertoId ? (pedidos.dados.find((x) => x.id === abertoId) ?? null) : null} fechar={() => setAberto(null)} />
    </div>
  );
}

function DetalhePedido({ p, fechar }: { p: ComId<PedidoPg> | null; fechar: () => void }) {
  const { tid, torcida, nomeSede, base, demo } = usePainel();
  const avisar = useToast();
  const [simulando, setSimulando] = useState(false);
  if (!p) return <Gaveta aberto={false} fechar={fechar}>{null}</Gaveta>;
  const linkIngressos = p.chaveAcesso ? `${location.origin}/${torcida.slug}/ingressos/${p.id}?k=${p.chaveAcesso}` : null;
  const tel = soDigitos(p.comprador?.telefone ?? "");
  return (
    <Gaveta aberto={!!p} fechar={fechar} titulo={p.tipo === "ingresso" ? "Pedido de ingresso" : "Pedido de sócio"}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="text-3xl font-bold numeros">{moeda(p.total)}</p>
          <p className="text-sm text-texto-3 mt-1">{dataHora(p.criadoEm)}</p>
        </div>
        <Selo tom={TOM_PEDIDO[p.status]} ponto className="text-sm">
          {ROTULO_STATUS_PEDIDO[p.status]}
        </Selo>
      </div>

      {demo && p.status === "aguardando" && (
        <div className="mb-5 rounded-2xl border border-info/30 bg-info/10 p-4">
          <p className="text-sm font-semibold">Modo de demonstração</p>
          <p className="text-sm text-texto-2 mt-0.5 mb-3">Simule o Pix pago para ver o pedido confirmado e os ingressos gerados.</p>
          <Botao
            tamanho="sm"
            icone="pix"
            carregando={simulando}
            onClick={async () => {
              setSimulando(true);
              try {
                await api.simularDemo({ tid, acao: "pagar_pedido", pedidoId: p.id });
                avisar("Pagamento simulado: pedido pago.", "sucesso");
              } catch (e) {
                avisar(mensagemDeErro(e), "erro");
              } finally {
                setSimulando(false);
              }
            }}
          >
            Simular pagamento
          </Botao>
        </div>
      )}

      {p.motivo && (
        <Aviso tom={p.status === "falhou" ? "perigo" : "alerta"} titulo="Motivo informado pela Pagar.me" className="mb-5">
          {p.motivo}
        </Aviso>
      )}

      <h3 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-1">Comprador</h3>
      <div className="mb-6">
        <Linha rotulo="Nome">{p.comprador?.nome}</Linha>
        <Linha rotulo="E-mail">{p.comprador?.email}</Linha>
        <Linha rotulo="CPF">{cpfMascarado(p.comprador?.cpf ?? "")}</Linha>
        <Linha rotulo="Telefone">
          {tel ? (
            <a href={`https://wa.me/${numeroWhatsapp(tel)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-primaria-texto hover:underline">
              <Icone nome="whatsapp" className="size-4" /> {mascaraTelefone(tel)}
            </a>
          ) : (
            "—"
          )}
        </Linha>
      </div>

      {p.tipo === "ingresso" && (
        <>
          <h3 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-1">Itens</h3>
          <p className="text-sm mb-2">
            {p.eventoId ? (
              <Link to={`${base}/eventos/${p.eventoId}`} onClick={fechar} className="font-semibold hover:text-primaria-texto">
                {p.eventoNome}
              </Link>
            ) : (
              p.eventoNome
            )}
          </p>
          <ul className="mb-6 rounded-2xl border border-linha divide-y divide-linha">
            {(p.itens ?? []).map((i, n) => (
              <li key={n} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{i.titularNome}</p>
                  <p className="text-xs text-texto-3">
                    {cpfMascarado(i.titularCpf)} · {i.tipo === "socio" ? "Preço de sócio" : "Público"}
                  </p>
                </div>
                <span className="numeros">{moeda(i.valorBase)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-1">Valores</h3>
      <div className="mb-6">
        <Linha rotulo={p.tipo === "ingresso" ? "Valor dos ingressos" : "Valor da mensalidade"}>{moeda(p.valorBase)}</Linha>
        <Linha rotulo="Taxa de serviço">{moeda(p.taxa)}</Linha>
        <Linha rotulo="Total cobrado">
          <span className="text-base">{moeda(p.total)}</span>
        </Linha>
        <Linha rotulo="Forma de pagamento">{p.metodo === "pix" ? "Pix" : "Cartão de crédito"}</Linha>
        <Linha rotulo="Sede">{nomeSede(p.sedeId)}</Linha>
        {p.pagoEm && <Linha rotulo="Pago em">{dataHora(p.pagoEm)}</Linha>}
      </div>

      <h3 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-1">Identificação</h3>
      <div className="mb-6">
        <Linha rotulo="Nº do pedido">
          <span className="font-mono text-xs">{p.id}</span>
        </Linha>
        <Linha rotulo="Pedido na Pagar.me">
          <span className="font-mono text-xs">{p.pagarme?.orderId ?? "—"}</span>
        </Linha>
        {p.pagarme?.chargeId && (
          <Linha rotulo="Cobrança na Pagar.me">
            <span className="font-mono text-xs">{p.pagarme.chargeId}</span>
          </Linha>
        )}
      </div>

      {linkIngressos && p.status === "pago" && (
        <Cartao className="p-4">
          <p className="text-sm font-semibold">Link dos ingressos</p>
          <p className="text-xs text-texto-3 mt-0.5 mb-3">Envie para o comprador se ele perdeu os ingressos.</p>
          <div className="flex flex-wrap gap-2">
            <BotaoCopiar texto={linkIngressos} rotulo="Copiar link" />
            {tel && (
              <a
                href={`https://wa.me/${numeroWhatsapp(tel)}?text=${encodeURIComponent(`Olá! Seus ingressos para ${p.eventoNome ?? "o evento"}: ${linkIngressos}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3.5 rounded-xl text-sm font-semibold bg-superficie-2 hover:bg-superficie-3"
              >
                <Icone nome="whatsapp" className="size-4" /> Enviar no WhatsApp
              </a>
            )}
          </div>
        </Cartao>
      )}
    </Gaveta>
  );
}

function CarregarMais({ carregando, mais }: { carregando: boolean; mais: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 pt-4">
      <Botao variante="contorno" icone="chevronBaixo" carregando={carregando} onClick={mais}>
        Carregar mais pedidos
      </Botao>
      <p className="text-xs text-texto-3">Busca mais {LOTE} pedidos, dos mais antigos.</p>
    </div>
  );
}
