import { useMemo, useState, type FormEvent } from "react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import { moeda, paraData, taxa } from "@/lib/formatos";
import type { ComId, Pedido, Socio, Torcida } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { FormCartao, cartaoVazio, prepararCartao, validarCartao, type EstadoCartao } from "@/modulos/publico/FormCartao";
import { Aviso, Botao, Modal, useToast } from "@/ui";
import { usePagarMensalidade } from "./acoes";

/** Pedidos do sócio (mais recentes primeiro). Mesma consulta usada no histórico — o SDK reaproveita o listener. */
export function usePedidosDoSocio(tid: string, uid: string) {
  const q = useMemo(() => query(collection(db, `torcidas/${tid}/pedidos`), where("uid", "==", uid), orderBy("criadoEm", "desc"), limit(60)), [tid, uid]);
  return useColecao<Pedido>(q, `pedidos-socio-${tid}-${uid}`);
}

/** A torcida aceita cartão e tem a chave pública para tokenizar no navegador. */
export const aceitaCartao = (t: Torcida) => !!t.pagamentos?.cartao && !!t.pagamentos?.chavePublica;

export const valorMensalidade = (ficha: Socio, torcida: Torcida) =>
  ficha.cobranca ? ficha.cobranca.valorBase + ficha.cobranca.taxa : ficha.valorPlano + taxa(ficha.valorPlano, torcida.taxaServicoPct ?? 10);

/**
 * Houve recusa no cartão que ainda não foi resolvida?
 * Considera a falha quando é mais recente que o último pagamento de mensalidade (ou o sócio está inadimplente).
 */
export function useFalhaCobranca(tid: string, ficha: ComId<Socio>) {
  const pedidos = usePedidosDoSocio(tid, ficha.uid);
  const falha = paraData(ficha.ultimaFalhaCobranca)?.getTime();
  if (!falha || pedidos.carregando) return false;
  if (ficha.status === "inadimplente") return true;
  const ultimoPago = pedidos.dados.find((p) => p.tipo === "socio" && p.status === "pago");
  const pagoEm = paraData(ultimoPago?.pagoEm ?? ultimoPago?.criadoEm)?.getTime() ?? 0;
  return falha > pagoEm;
}

/** Modal com o formulário de cartão: troca o cartão salvo e, se a mensalidade estiver em aberto, já cobra nele. */
export function ModalCartao({
  aberto,
  fechar,
  tid,
  torcida,
  ficha,
  titulo,
}: {
  aberto: boolean;
  fechar: () => void;
  tid: string;
  torcida: Torcida;
  ficha: Socio;
  titulo: string;
}) {
  const avisar = useToast();
  const [cartao, setCartao] = useState<EstadoCartao>(cartaoVazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const emDia = ficha.status === "ativo" && (paraData(ficha.validoAte)?.getTime() ?? 0) > Date.now();
  const vaiCobrar = !emDia && ficha.status !== "suspenso" && ficha.status !== "cancelado";

  function sair() {
    if (enviando) return;
    setCartao(cartaoVazio());
    setErros({});
    setErro(null);
    fechar();
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const v = validarCartao(cartao);
    setErros(v);
    if (Object.keys(v).length) return;
    setEnviando(true);
    try {
      const preparado = await prepararCartao(torcida.pagamentos.chavePublica!, cartao);
      const r = await api.atualizarCartao({ tid, cartao: preparado });
      avisar(r.cobrado ? "Cartão atualizado e mensalidade paga" : "Cartão atualizado; a próxima cobrança será nele", "sucesso");
      setEnviando(false);
      setCartao(cartaoVazio());
      fechar();
    } catch (err) {
      const msg = mensagemDeErro(err);
      setErro(msg);
      avisar(msg, "erro");
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      fechar={sair}
      titulo={titulo}
      descricao={
        vaiCobrar
          ? `Vamos cobrar ${moeda(valorMensalidade(ficha, torcida))} agora neste cartão e usá-lo nos próximos períodos.`
          : "Este cartão passa a ser cobrado automaticamente a cada período."
      }
    >
      <form id="form-cartao-socio" onSubmit={enviar} noValidate className="space-y-4">
        <FormCartao valor={cartao} onChange={setCartao} erros={erros} />
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
        <Botao type="submit" largo tamanho="lg" icone="cadeado" carregando={enviando}>
          {vaiCobrar ? `Pagar ${moeda(valorMensalidade(ficha, torcida))} e salvar cartão` : "Salvar cartão"}
        </Botao>
      </form>
    </Modal>
  );
}

/** Aviso de recusa no cartão, com as duas saídas: trocar o cartão ou pagar no Pix. */
export function AvisoFalhaCartao({ tid, torcida, ficha, className }: { tid: string; torcida: Torcida; ficha: ComId<Socio>; className?: string }) {
  const { pagar, carregando } = usePagarMensalidade(tid, torcida.slug, ficha);
  const [modal, setModal] = useState(false);
  return (
    <>
      <Aviso
        tom="perigo"
        className={className}
        titulo="Cobrança recusada"
        acao={
          <div className="flex flex-col sm:flex-row gap-2.5">
            {aceitaCartao(torcida) && (
              <Botao icone="cartao" onClick={() => setModal(true)}>
                Trocar cartão
              </Botao>
            )}
            <Botao variante="suave" icone="pix" carregando={carregando} onClick={() => pagar(true)}>
              Pagar no Pix
            </Botao>
          </div>
        }
      >
        Não conseguimos cobrar sua mensalidade no cartão{ficha.motivoFalhaCobranca ? `: ${ficha.motivoFalhaCobranca}` : ""}. Troque o cartão ou pague no Pix.
      </Aviso>
      <ModalCartao aberto={modal} fechar={() => setModal(false)} tid={tid} torcida={torcida} ficha={ficha} titulo="Trocar cartão" />
    </>
  );
}
