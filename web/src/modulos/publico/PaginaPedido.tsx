import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import { useDocumento, useUsuario } from "@/hooks/dados";
import { useTorcida } from "@/hooks/torcida";
import type { Ingresso, Pedido } from "@/lib/tipos";
import { moeda } from "@/lib/formatos";
import { copiarTexto } from "@/lib/servicos";
import { Aviso, Botao, BotaoLink, Carregando, Cartao, Icone, useToast, Vazio } from "@/ui";
import { QrCode } from "@/ui/qr";
import { CabecalhoTorcida, LinhaValor } from "./comum";
import { Bilhete, type DadosBilhete } from "./Bilhete";

export default function PaginaPedido() {
  const { pedidoId } = useParams();
  const { tid, torcida } = useTorcida();
  const usuario = useUsuario();
  const p = useDocumento<Pedido>(usuario && pedidoId ? `torcidas/${tid}/pedidos/${pedidoId}` : null);

  let conteudo;
  if (usuario === undefined || p.carregando) conteudo = <Carregando texto="Carregando seu pedido..." />;
  else if (!usuario || p.erro || !p.dados) {
    conteudo = (
      <Vazio icone="ingresso" titulo="Pedido não encontrado neste aparelho" acao={<BotaoLink to={`/${torcida.slug}`}>Ver eventos</BotaoLink>}>
        Abra o pedido no mesmo aparelho em que comprou, ou use o link dos ingressos que você salvou.
      </Vazio>
    );
  } else {
    const ped = p.dados;
    if (ped.status === "aguardando" && ped.pix) conteudo = <TelaPix pedido={ped} />;
    else if (ped.status === "aguardando" || ped.status === "criando") conteudo = <Carregando texto="Confirmando pagamento..." />;
    else if (ped.status === "pago") conteudo = ped.tipo === "ingresso" ? <IngressosEmitidos pedido={ped} /> : <SocioConfirmado />;
    else
      conteudo = (
        <div className="space-y-6 text-center py-6">
          <div className="mx-auto size-16 rounded-full bg-perigo/15 text-perigo grid place-items-center">
            <Icone nome="xCirculo" className="size-9" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {ped.status === "expirado" ? "O prazo do Pix acabou" : ped.status === "estornado" ? "Pagamento estornado" : "Pagamento não aprovado"}
            </h1>
            <p className="text-texto-2 mt-2">{ped.motivo || "Nenhum valor foi cobrado."}</p>
          </div>
          <BotaoLink to={ped.tipo === "ingresso" && ped.eventoId ? `/${torcida.slug}/evento/${ped.eventoId}` : `/${torcida.slug}/associar`} tamanho="lg">
            Tentar novamente
          </BotaoLink>
        </div>
      );
  }

  return (
    <div className="min-h-dvh">
      <CabecalhoTorcida />
      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8 sm:py-12">{conteudo}</main>
    </div>
  );
}

function useContagem(alvo: number) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((alvo - agora) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  return { restante: s, texto: h ? `${h}h ${String(m).padStart(2, "0")}min` : `${String(m).padStart(2, "0")}:${String(seg).padStart(2, "0")}` };
}

function TelaPix({ pedido }: { pedido: Pedido & { id: string } }) {
  const { tid, torcida } = useTorcida();
  const avisar = useToast();
  const [verificando, setVerificando] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const demo = torcida.pagamentos?.ambiente === "demo";
  const { restante, texto } = useContagem(pedido.pix!.expiraEm.toMillis());

  async function copiar() {
    if (await copiarTexto(pedido.pix!.qrCode)) avisar("Código Pix copiado. Cole no app do seu banco.", "sucesso");
  }
  async function jaPaguei() {
    setVerificando(true);
    try {
      const r = await api.verificarPedido({ tid, pedidoId: pedido.id });
      if (r.status === "aguardando") avisar("Ainda não recebemos a confirmação. Pode levar alguns segundos.", "info");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setVerificando(false);
    }
  }

  async function simularPagamento() {
    setSimulando(true);
    try {
      await api.simularDemo({ tid, acao: "pagar_pedido", pedidoId: pedido.id });
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSimulando(false);
    }
  }

  return (
    <div className="space-y-6 animate-surgir">
      {demo && (
        <Aviso
          tom="alerta"
          titulo="Demonstração"
          acao={
            <Botao tamanho="sm" icone="pix" carregando={simulando} onClick={simularPagamento} disabled={restante <= 0}>
              Simular pagamento do Pix
            </Botao>
          }
        >
          Este QR Code não é real. Toque no botão para simular o cliente pagando.
        </Aviso>
      )}
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primaria-texto">Pague com Pix</p>
        <h1 className="text-3xl font-bold mt-2 numeros">{moeda(pedido.total)}</h1>
        <p className="text-texto-2 mt-1">{pedido.tipo === "ingresso" ? pedido.eventoNome : "Mensalidade de sócio"}</p>
      </div>

      <Cartao className="p-6 flex flex-col items-center gap-5">
        <QrCode valor={pedido.pix!.qrCode} className="w-60 max-w-full" />
        <div className="flex items-center gap-2 text-sm">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full rounded-full bg-sucesso opacity-75 animate-ping" />
            <span className="relative inline-flex size-2.5 rounded-full bg-sucesso" />
          </span>
          {restante > 0 ? (
            <span className="text-texto-2">
              Aguardando pagamento · expira em <b className="numeros text-texto">{texto}</b>
            </span>
          ) : (
            <span className="text-alerta">Prazo encerrado</span>
          )}
        </div>
        <Botao largo tamanho="lg" icone="copiar" onClick={copiar}>
          Copiar código Pix
        </Botao>
      </Cartao>

      <ol className="space-y-3">
        {["Abra o app do seu banco e escolha Pix", "Use “Pix copia e cola” ou escaneie o QR Code", "Confirme o pagamento. Esta tela atualiza sozinha"].map((t, i) => (
          <li key={t} className="flex gap-3 items-center">
            <span className="size-7 shrink-0 rounded-full bg-superficie-2 grid place-items-center text-sm font-bold">{i + 1}</span>
            <span className="text-texto-2">{t}</span>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl bg-superficie-2 p-4 space-y-1.5">
        <LinhaValor rotulo="Valor" valor={moeda(pedido.valorBase)} />
        <LinhaValor rotulo={`Taxa de serviço (${torcida.taxaServicoPct}%)`} valor={moeda(pedido.taxa)} sutil />
        <LinhaValor rotulo="Total" valor={moeda(pedido.total)} forte />
      </div>

      <Botao largo variante="contorno" carregando={verificando} onClick={jaPaguei} icone="atualizar">
        Já paguei
      </Botao>
    </div>
  );
}

function IngressosEmitidos({ pedido }: { pedido: Pedido & { id: string } }) {
  const { tid, torcida } = useTorcida();
  const avisar = useToast();
  const [bilhetes, setBilhetes] = useState<DadosBilhete[] | null>(null);
  useEffect(() => {
    Promise.all((pedido.ingressoIds ?? []).map((id) => getDoc(doc(db, `torcidas/${tid}/ingressos/${id}`)))).then((snaps) =>
      setBilhetes(
        snaps
          .filter((s) => s.exists())
          .map((s) => {
            const i = s.data() as Ingresso;
            return { id: s.id, ...i, eventoData: i.eventoData.toDate() };
          }),
      ),
    );
  }, [tid, pedido.ingressoIds]);

  const link = `${location.origin}/${torcida.slug}/ingressos/${pedido.id}?k=${pedido.chaveAcesso}`;
  const texto = `Meus ingressos para ${pedido.eventoNome} (${torcida.nome}): ${link}`;

  return (
    <div className="space-y-6 animate-surgir">
      <div className="text-center">
        <div className="mx-auto size-16 rounded-full bg-sucesso/15 text-sucesso grid place-items-center">
          <Icone nome="checkCirculo" className="size-9" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold mt-4">Pagamento confirmado!</h1>
        <p className="text-texto-2 mt-1">
          {pedido.ingressoIds?.length} ingresso{(pedido.ingressoIds?.length ?? 0) > 1 ? "s" : ""} para {pedido.eventoNome}
        </p>
      </div>

      <Aviso tom="alerta" titulo="Salve o link dos seus ingressos">
        Ele abre seus ingressos em qualquer celular. Mande no seu WhatsApp agora.
      </Aviso>
      <div className="grid grid-cols-2 gap-3">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-[#25D366] text-[#0b2e17] font-bold"
        >
          <Icone nome="whatsapp" className="size-5" /> WhatsApp
        </a>
        <Botao
          variante="contorno"
          icone="link"
          onClick={async () => (await copiarTexto(link)) && avisar("Link copiado!", "sucesso")}
        >
          Copiar link
        </Botao>
      </div>

      {!bilhetes ? (
        <Carregando />
      ) : (
        <div className="space-y-4">
          {bilhetes.map((b) => (
            <Bilhete key={b.id} b={b} torcidaNome={torcida.nome} />
          ))}
        </div>
      )}
      <p className="text-sm text-texto-3 text-center">Na entrada, apresente o QR Code e um documento com foto do titular.</p>
      <BotaoLink to={`/${torcida.slug}`} variante="fantasma" largo>
        Voltar para a página
      </BotaoLink>
    </div>
  );
}

function SocioConfirmado() {
  const { torcida } = useTorcida();
  return (
    <div className="space-y-6 text-center py-6 animate-surgir">
      <div className="mx-auto size-20 rounded-full bg-primaria/15 text-primaria-texto grid place-items-center">
        <Icone nome="escudo" className="size-10" />
      </div>
      <div>
        <h1 className="text-3xl font-bold">Pagamento confirmado!</h1>
        <p className="text-texto-2 mt-2">
          {torcida.aprovacaoManualSocio
            ? "Sua ficha foi para a diretoria aprovar. Você recebe acesso completo assim que for aprovada."
            : `Bem-vindo à ${torcida.nome}. Sua carteirinha digital já está disponível.`}
        </p>
      </div>
      <BotaoLink to={`/${torcida.slug}/socio`} tamanho="lg" iconeDireita="setaDireita">
        Ver minha carteirinha
      </BotaoLink>
      <div>
        <Link to={`/${torcida.slug}`} className="text-sm text-texto-2 hover:text-texto">
          Ver eventos
        </Link>
      </div>
    </div>
  );
}
