import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import { dataCurta, dataHora, moeda, periodicidade, ROTULO_STATUS_PEDIDO, taxa } from "@/lib/formatos";
import type { ComId, Pedido, Socio, StatusPedido, Torcida } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Aviso, Botao, Cartao, cx, Esqueleto, Icone, Modal, Selo, useToast, type Tom } from "@/ui";
import { usePagarMensalidade } from "./acoes";
import { diasParaVencer, ROTULO_SITUACAO, situacaoDoSocio, TOM_SITUACAO } from "./comum";

const TOM_PEDIDO: Record<StatusPedido, Tom> = {
  criando: "neutro",
  aguardando: "alerta",
  pago: "sucesso",
  falhou: "perigo",
  expirado: "neutro",
  cancelado: "neutro",
  estornado: "info",
};

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-linha last:border-0">
      <span className="text-texto-2 text-sm">{rotulo}</span>
      <span className="font-semibold text-right min-w-0">{children}</span>
    </div>
  );
}

function Historico({ tid, uid, slug }: { tid: string; uid: string; slug: string }) {
  const q = useMemo(() => query(collection(db, `torcidas/${tid}/pedidos`), where("uid", "==", uid), orderBy("criadoEm", "desc"), limit(60)), [tid, uid]);
  const r = useColecao<Pedido>(q, `pedidos-socio-${tid}-${uid}`);
  const lista = r.dados.filter((p) => p.tipo === "socio" && p.status !== "criando");

  return (
    <Cartao className="p-5 sm:p-6">
      <h3 className="font-bold text-lg">Histórico de pagamentos</h3>
      {r.carregando ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((k) => (
            <Esqueleto key={k} className="h-14" />
          ))}
        </div>
      ) : r.erro ? (
        <Aviso tom="perigo" className="mt-4">
          Não foi possível carregar o histórico agora.
        </Aviso>
      ) : !lista.length ? (
        <p className="mt-3 text-sm text-texto-2">Nenhum pagamento de mensalidade ainda.</p>
      ) : (
        <ul className="mt-3 divide-y divide-linha">
          {lista.map((p) => {
            const conteudo = (
              <>
                <span
                  className={cx(
                    "size-10 shrink-0 rounded-xl grid place-items-center",
                    p.status === "pago" ? "bg-sucesso/12 text-sucesso" : p.status === "aguardando" ? "bg-alerta/12 text-alerta" : "bg-superficie-2 text-texto-3",
                  )}
                >
                  <Icone nome={p.metodo === "pix" ? "pix" : "cartao"} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[15px] truncate">{p.renovacao ? "Renovação" : "Adesão"} · {p.metodo === "pix" ? "Pix" : "Cartão"}</span>
                  <span className="block text-xs text-texto-3">{dataHora(p.pagoEm ?? p.criadoEm)}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block font-bold numeros">{moeda(p.total)}</span>
                  <Selo tom={TOM_PEDIDO[p.status]} className="mt-0.5">
                    {ROTULO_STATUS_PEDIDO[p.status]}
                  </Selo>
                </span>
              </>
            );
            return (
              <li key={p.id}>
                {p.status === "aguardando" ? (
                  <Link to={`/${slug}/pedido/${p.id}`} className="flex items-center gap-3 py-3 -mx-2 px-2 rounded-xl hover:bg-superficie-2">
                    {conteudo}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-3">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Cartao>
  );
}

export default function AbaAssinatura({ tid, torcida, ficha }: { tid: string; torcida: Torcida; ficha: ComId<Socio> }) {
  const avisar = useToast();
  const situacao = situacaoDoSocio(ficha);
  const dias = diasParaVencer(ficha);
  const { pagar, carregando: pagando } = usePagarMensalidade(tid, torcida.slug, ficha);
  const [sincronizando, setSincronizando] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const base = ficha.cobranca?.valorBase ?? ficha.valorPlano;
  const valorTaxa = ficha.cobranca?.taxa ?? taxa(ficha.valorPlano, torcida.taxaServicoPct ?? 10);
  const urgente = dias == null || dias <= 7;
  const pix = ficha.metodo === "pix";
  const encerrada = ficha.status === "cancelado" || ficha.status === "suspenso";

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await api.sincronizarAssinatura({ tid });
      avisar(r.pagas ? `${r.pagas} pagamento${r.pagas > 1 ? "s" : ""} confirmado${r.pagas > 1 ? "s" : ""}.` : "Tudo certo: nenhuma cobrança nova.", "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSincronizando(false);
    }
  }

  async function cancelar() {
    setCancelando(true);
    try {
      await api.cancelarAssinatura({ tid });
      setConfirmarCancelar(false);
      avisar("Renovação cancelada.", "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-start">
      <div className="space-y-5">
        <Cartao className="overflow-hidden">
          <div
            className="p-5 sm:p-6 text-sobre-primaria"
            style={{
              background:
                "radial-gradient(90% 120% at 100% 0%, color-mix(in oklab, var(--color-secundaria) 40%, transparent), transparent 60%), linear-gradient(150deg, var(--color-primaria), color-mix(in oklab, var(--color-primaria), black 40%))",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] opacity-75">Seu plano</p>
                <p className="font-display text-2xl leading-tight mt-1">{ficha.planoNome}</p>
              </div>
              <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-bold text-white">{ROTULO_SITUACAO[situacao]}</span>
            </div>
            <p className="mt-5">
              <span className="font-display text-4xl numeros">{moeda(base + valorTaxa)}</span>
              <span className="ml-1.5 opacity-80">{periodicidade(ficha.intervalo, ficha.intervaloQtd)}</span>
            </p>
            <p className="text-sm opacity-80 mt-1 numeros">
              {moeda(base)} do plano + {moeda(valorTaxa)} de taxa de serviço
            </p>
          </div>
          <div className="px-5 sm:px-6 py-1">
            <Linha rotulo="Situação">
              <Selo tom={TOM_SITUACAO[situacao]} ponto>
                {ROTULO_SITUACAO[situacao]}
              </Selo>
            </Linha>
            <Linha rotulo="Pagamento">
              {pix ? (
                <span className="inline-flex items-center gap-1.5">
                  <Icone nome="pix" className="size-4 text-primaria" /> Pix a cada ciclo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Icone nome="cartao" className="size-4 text-primaria" />
                  {ficha.pagarme?.cartaoBandeira ? `${ficha.pagarme.cartaoBandeira} ` : "Cartão "}
                  <span className="font-mono">•••• {ficha.pagarme?.cartaoFinal ?? "····"}</span>
                </span>
              )}
            </Linha>
            <Linha rotulo="Válida até">
              <span className="numeros">
                {ficha.validoAte ? dataCurta(ficha.validoAte) : "—"}
                {dias != null && (
                  <span className={cx("block text-xs font-medium", dias < 0 ? "text-perigo" : dias <= 7 ? "text-alerta" : "text-texto-3")}>
                    {dias > 1 ? `faltam ${dias} dias` : dias === 1 ? "vence amanhã" : dias === 0 ? "vence hoje" : `vencida há ${-dias} dia${dias === -1 ? "" : "s"}`}
                  </span>
                )}
              </span>
            </Linha>
            <Linha rotulo="Renovação">{ficha.assinaturaCancelada ? "Cancelada" : pix ? "Você paga cada ciclo pelo Pix" : "Automática no cartão"}</Linha>
            {ficha.matricula && (
              <Linha rotulo="Matrícula">
                <span className="font-mono tracking-wider">{ficha.matricula}</span>
              </Linha>
            )}
          </div>
        </Cartao>

        {ficha.assinaturaCancelada && (
          <Aviso tom="alerta" titulo="Renovação cancelada">
            {ficha.validoAte && (dias ?? 0) > 0
              ? `Você continua sócio até ${dataCurta(ficha.validoAte)}. Depois disso a associação é encerrada.`
              : "A associação será encerrada. Para voltar, faça uma nova adesão pela página da torcida."}
            {pix && " Se quiser continuar, é só pagar a próxima mensalidade pelo Pix."}
          </Aviso>
        )}
      </div>

      <div className="space-y-5">
        {!encerrada && (
          <Cartao className={cx("p-5 sm:p-6", pix && urgente && "border-primaria/60 ring-1 ring-primaria/40 shadow-[0_20px_60px_-30px_var(--color-primaria)]")}>
            {pix ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="size-11 shrink-0 rounded-2xl bg-primaria/15 text-primaria grid place-items-center">
                    <Icone nome="pix" className="size-6" />
                  </span>
                  <div>
                    <p className="font-bold text-lg leading-tight">{urgente ? (dias != null && dias < 0 ? "Mensalidade vencida" : "Hora de renovar") : "Próxima mensalidade"}</p>
                    <p className="text-sm text-texto-2">
                      {urgente ? `Pague ${moeda(base + valorTaxa)} pelo Pix e continue com preço de sócio.` : `Pode adiantar quando quiser (${moeda(base + valorTaxa)}): o novo ciclo soma à validade atual.`}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid gap-2.5">
                  {ficha.cobrancaAbertaId && (
                    <Botao largo tamanho="lg" icone="qr" onClick={() => pagar(true)}>
                      Ver cobrança em aberto
                    </Botao>
                  )}
                  <Botao
                    largo
                    tamanho={ficha.cobrancaAbertaId ? "md" : "lg"}
                    variante={urgente && !ficha.cobrancaAbertaId ? "primaria" : "suave"}
                    icone="pix"
                    carregando={pagando}
                    onClick={() => pagar(false)}
                  >
                    Pagar próxima mensalidade
                  </Botao>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="size-11 shrink-0 rounded-2xl bg-primaria/15 text-primaria grid place-items-center">
                    <Icone nome="cartao" className="size-6" />
                  </span>
                  <div>
                    <p className="font-bold text-lg leading-tight">Cobrança automática</p>
                    <p className="text-sm text-texto-2">O cartão é cobrado a cada ciclo. Pagou e não atualizou? Confira aqui.</p>
                  </div>
                </div>
                <Botao className="mt-5" largo variante="suave" icone="atualizar" carregando={sincronizando} onClick={sincronizar}>
                  Atualizar status
                </Botao>
                {(situacao === "vencida" || situacao === "inadimplente") && (
                  <Botao className="mt-2.5" largo icone="pix" carregando={pagando} onClick={() => pagar(true)}>
                    Pagar este ciclo pelo Pix
                  </Botao>
                )}
              </>
            )}
          </Cartao>
        )}

        <Historico tid={tid} uid={ficha.uid} slug={torcida.slug} />

        {!ficha.assinaturaCancelada && !encerrada && ficha.status !== "pendente_pagamento" && (
          <div className="text-center">
            <button type="button" onClick={() => setConfirmarCancelar(true)} className="text-sm text-texto-3 hover:text-perigo underline underline-offset-4 py-2">
              Cancelar renovação
            </button>
          </div>
        )}
      </div>

      <Modal
        aberto={confirmarCancelar}
        fechar={() => !cancelando && setConfirmarCancelar(false)}
        titulo="Cancelar a renovação?"
        rodape={
          <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:justify-end">
            <Botao onClick={() => setConfirmarCancelar(false)} disabled={cancelando}>
              Continuar sócio
            </Botao>
            <Botao variante="perigo" carregando={cancelando} onClick={cancelar}>
              Sim, cancelar renovação
            </Botao>
          </div>
        }
      >
        <div className="space-y-3 text-[15px] text-texto-2">
          <p>
            Você <strong className="text-texto">continua sócio até {ficha.validoAte ? dataCurta(ficha.validoAte) : "o fim do período pago"}</strong>, com carteirinha e preço de
            sócio valendo normalmente.
          </p>
          <p>{pix ? "Depois disso não geramos novas cobranças e a associação é encerrada." : "O cartão não será mais cobrado e, ao fim do período, a associação é encerrada."}</p>
          <p>Sua matrícula fica guardada caso queira voltar.</p>
        </div>
      </Modal>
    </div>
  );
}
