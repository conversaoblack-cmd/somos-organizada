import { useMemo, useState } from "react";
import { Link } from "react-router";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cpfMascarado, dataHora, mascaraTelefone, moeda, relativo, ROTULO_STATUS_PEDIDO, soDigitos } from "@/lib/formatos";
import type { ComId, Pedido, StatusPedido } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Abas, Aviso, CabecalhoPagina, Campo, Cartao, cx, Gaveta, Icone, Selecao, Selo } from "@/ui";
import { usePainel } from "./contexto";
import { baixarCsv, BotaoCopiar, decimalBR, EstadoLista, Linha, normalizar, numeroWhatsapp, TOM_PEDIDO } from "./util";

type PedidoPg = Pedido & { pagarme?: { orderId?: string; chargeId?: string } };

export default function Pedidos() {
  const { tid, ehDiretoria, sedeEscopo, nomeSede } = usePainel();
  const pedidos = useColecao<PedidoPg>(
    ehDiretoria
      ? query(collection(db, `torcidas/${tid}/pedidos`), orderBy("criadoEm", "desc"), limit(100))
      : sedeEscopo
        ? query(collection(db, `torcidas/${tid}/pedidos`), where("sedeId", "==", sedeEscopo), orderBy("criadoEm", "desc"), limit(100))
        : null,
    `pedidos-${tid}-${sedeEscopo ?? "todas"}`,
  );
  const [tipo, setTipo] = useState<"todos" | "ingresso" | "socio">("todos");
  const [status, setStatus] = useState<"" | StatusPedido>("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<ComId<PedidoPg> | null>(null);

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
      ["Data", "Pedido", "Tipo", "Evento", "Comprador", "E-mail", "Telefone", "Método", "Status", "Valor base", "Taxa", "Total", "Sede", "Motivo"],
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
        descricao="Os 100 pedidos mais recentes, de ingressos e de mensalidades."
        acoes={
          <button
            type="button"
            onClick={exportar}
            disabled={!filtrados.length}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold border border-linha-forte hover:bg-superficie-2 disabled:opacity-50"
          >
            <Icone nome="download" className="size-4" /> Exportar CSV
          </button>
        }
      />

      <div className="flex flex-col gap-3 mb-5">
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

      {pedidos.carregando || pedidos.erro || filtrados.length === 0 ? (
        <EstadoLista
          carregando={pedidos.carregando}
          erro={pedidos.erro}
          vazio
          icone="ingresso"
          tituloVazio={pedidos.dados.length ? "Nenhum pedido com esses filtros" : "Nenhum pedido ainda"}
          textoVazio={pedidos.dados.length ? "Mude os filtros ou a busca." : "Quando alguém comprar um ingresso ou virar sócio, o pedido aparece aqui."}
        />
      ) : (
        <>
          <p className="text-sm text-texto-3 mb-3 numeros">
            {filtrados.length} {filtrados.length === 1 ? "pedido" : "pedidos"} · {moeda(somaPagos)} pagos
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
                      <p className="font-medium">{p.comprador?.nome}</p>
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
                <Cartao className="p-4 flex items-center gap-3 active:bg-superficie-2">
                  <span className={cx("size-10 shrink-0 rounded-xl grid place-items-center", p.tipo === "ingresso" ? "bg-primaria/12 text-primaria" : "bg-secundaria/15 text-secundaria")}>
                    <Icone nome={p.tipo === "ingresso" ? "ingresso" : "estrela"} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.comprador?.nome}</p>
                    <p className="text-xs text-texto-3 truncate">
                      {p.tipo === "ingresso" ? p.eventoNome : "Sócio"} · {relativo(p.criadoEm)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold numeros">{moeda(p.total)}</p>
                    <Selo tom={TOM_PEDIDO[p.status]} className="mt-1">
                      {ROTULO_STATUS_PEDIDO[p.status]}
                    </Selo>
                  </div>
                </Cartao>
              </button>
            ))}
          </div>
        </>
      )}

      <DetalhePedido p={aberto} fechar={() => setAberto(null)} />
    </div>
  );
}

function DetalhePedido({ p, fechar }: { p: ComId<PedidoPg> | null; fechar: () => void }) {
  const { torcida, nomeSede, base } = usePainel();
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
            <a href={`https://wa.me/${numeroWhatsapp(tel)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primaria hover:underline">
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
              <Link to={`${base}/eventos/${p.eventoId}`} onClick={fechar} className="font-semibold hover:text-primaria">
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
        <Linha rotulo="Valor base">{moeda(p.valorBase)}</Linha>
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
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold bg-superficie-2 hover:bg-superficie-3"
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
