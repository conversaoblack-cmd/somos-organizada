import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import { useDocumento, useUsuario } from "@/hooks/dados";
import { useTorcida } from "@/hooks/torcida";
import type { Ingresso, Pedido } from "@/lib/tipos";
import { moeda } from "@/lib/formatos";
import { copiarTexto } from "@/lib/servicos";
import { Aviso, Botao, BotaoLink, Carregando, Cartao, Icone, useToast, Vazio } from "@/ui";
import { QrCode } from "@/ui/qr";
import { CabecalhoTorcida, LinhaValor, SemConexao } from "./comum";
import { Bilhete, type DadosBilhete } from "./Bilhete";

export default function PaginaPedido() {
  // Trocar a chave remonta o conteúdo e assina o pedido de novo ("Tentar de novo" sem recarregar a página)
  const [tentativa, setTentativa] = useState(0);
  return (
    <div className="min-h-dvh">
      <CabecalhoTorcida />
      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8 sm:py-12">
        <ConteudoPedido key={tentativa} tentarDeNovo={() => setTentativa((n) => n + 1)} />
      </main>
    </div>
  );
}

function ConteudoPedido({ tentarDeNovo }: { tentarDeNovo: () => void }) {
  const { pedidoId } = useParams();
  const { tid, torcida } = useTorcida();
  const usuario = useUsuario();
  const p = useDocumento<Pedido>(usuario && pedidoId ? `torcidas/${tid}/pedidos/${pedidoId}` : null);
  const logado = !!usuario && !usuario.isAnonymous;

  if (usuario === undefined || p.carregando) return <Carregando texto="Carregando seu pedido…" />;
  // Internet ruim não é "pedido não encontrado": oferece tentar de novo
  if (usuario && (p.semConexao || (p.erro && ehErroDeConexao(p.erro)))) {
    return (
      <SemConexao tentarDeNovo={tentarDeNovo}>
        Não conseguimos abrir seu pedido agora e ele ainda não está salvo neste celular. Confira a internet e toque em “Tentar de novo”: depois de
        aberto uma vez com internet, o pedido e os ingressos ficam salvos no celular. Se você já pagou, o pagamento não se perde.
      </SemConexao>
    );
  }
  if (!usuario || p.erro || !p.dados) {
    return (
      <Vazio
        icone="ingresso"
        titulo="Pedido não encontrado neste aparelho"
        acao={
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <BotaoLink to={`/${torcida.slug}/conta`} icone="usuario">
              {logado ? "Ver minha conta" : "Entrar na minha conta"}
            </BotaoLink>
            <Botao variante="contorno" icone="atualizar" onClick={tentarDeNovo}>
              Tentar de novo
            </Botao>
          </div>
        }
      >
        Entre na sua conta com CPF (ou e-mail) e senha para ver seus pedidos e ingressos. Ou abra o link dos ingressos que você salvou.
      </Vazio>
    );
  }

  const ped = p.dados;
  if (ped.status === "aguardando" && ped.pix) return <TelaPix pedido={ped} />;
  if (ped.status === "aguardando" || ped.status === "criando") return <Conferindo pedido={ped} />;
  if (ped.status === "pago") return ped.tipo === "ingresso" ? <IngressosEmitidos pedido={ped} /> : <SocioConfirmado />;
  if (ped.status === "estornado") return <PedidoEstornado pedido={ped} />;
  return (
    <div className="space-y-6 text-center py-6">
      <div className="mx-auto size-16 rounded-full bg-perigo/15 text-perigo grid place-items-center">
        <Icone nome="xCirculo" className="size-9" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">
          {ped.status === "expirado" ? (ped.metodo === "cartao" ? "O pagamento não foi concluído" : "O prazo do Pix acabou") : "Pagamento não aprovado"}
        </h1>
        <p className="text-texto-2 mt-2">{ped.motivo || "Nenhum valor foi cobrado."}</p>
      </div>
      <BotaoLink to={ped.tipo === "ingresso" && ped.eventoId ? `/${torcida.slug}/evento/${ped.eventoId}` : `/${torcida.slug}/associar`} tamanho="lg">
        Tentar novamente
      </BotaoLink>
    </div>
  );
}

/**
 * Pagamento sendo conferido: cartão em análise pelo banco, ou a criação na Pagar.me ficou sem resposta (internet).
 * Nunca fica só girando: explica, confere sozinho de tempos em tempos e tem o botão para conferir agora.
 */
function Conferindo({ pedido }: { pedido: Pedido & { id: string } }) {
  const { tid } = useTorcida();
  const avisar = useToast();
  const [verificando, setVerificando] = useState(false);
  async function verificar(manual: boolean) {
    if (manual) setVerificando(true);
    try {
      const r = await api.verificarPedido({ tid, pedidoId: pedido.id });
      if (manual && r.status === "aguardando") avisar("Ainda em análise. Assim que o banco responder, esta tela muda sozinha.", "info");
    } catch (e) {
      if (manual) avisar(mensagemDeErro(e), "erro");
    } finally {
      if (manual) setVerificando(false);
    }
  }
  // Confere sozinho (o aviso automático da Pagar.me pode atrasar): aos 15 s e depois a cada 45 s, por 10 minutos
  useEffect(() => {
    let n = 0;
    const primeiro = setTimeout(() => void verificar(false), 15_000);
    const t = setInterval(() => {
      if (++n > 13) return clearInterval(t);
      void verificar(false);
    }, 45_000);
    return () => {
      clearTimeout(primeiro);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.id]);
  return (
    <div className="text-center py-10 space-y-5 animate-surgir">
      <Carregando texto="Confirmando pagamento…" />
      <p className="text-texto-2 max-w-sm mx-auto">
        {pedido.metodo === "cartao"
          ? "O banco está conferindo o cartão. Pode levar alguns minutos. Não pague de novo: esta tela muda sozinha quando ele responder."
          : "Estamos confirmando o pagamento com o banco. Não pague de novo: esta tela muda sozinha."}
      </p>
      <Botao variante="contorno" icone="atualizar" carregando={verificando} onClick={() => void verificar(true)}>
        Verificar pagamento
      </Botao>
    </div>
  );
}

/** Pagamento devolvido (estorno pedido à Pagar.me ou contestação no cartão): não há o que "tentar de novo". */
function PedidoEstornado({ pedido }: { pedido: Pedido & { id: string } }) {
  const { torcida } = useTorcida();
  // O servidor grava o motivo em `motivoEstorno` ("estorno" | "chargeback")
  const contestado = (pedido as Pedido & { motivoEstorno?: string }).motivoEstorno === "chargeback";
  return (
    <div className="space-y-6 text-center py-6">
      <div className="mx-auto size-16 rounded-full bg-superficie-2 text-texto-2 grid place-items-center">
        <Icone nome="info" className="size-9" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">Pagamento devolvido</h1>
        <p className="text-texto-2 mt-2">
          {contestado
            ? "A compra foi contestada junto ao banco ou ao cartão, e o valor foi devolvido."
            : "O valor foi devolvido ao seu banco ou cartão."}
          {pedido.tipo === "ingresso" ? " Os ingressos deste pedido foram cancelados." : ""}
        </p>
        <p className="text-sm text-texto-3 mt-2">Dúvidas? Fale com a diretoria pelos canais oficiais.</p>
      </div>
      <BotaoLink to={`/${torcida.slug}`} variante="contorno">
        Voltar para a página
      </BotaoLink>
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

  const [verCodigo, setVerCodigo] = useState(false);
  async function copiar() {
    if (await copiarTexto(pedido.pix!.qrCode)) avisar("Código Pix copiado. Cole no app do seu banco.", "sucesso");
    else {
      // Navegador de dentro de outro app (Instagram, WhatsApp) às vezes bloqueia copiar: mostra o código para copiar à mão
      setVerCodigo(true);
      avisar("Não deu para copiar sozinho. Toque e segure o código abaixo para copiar.", "info");
    }
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

      {/* No celular (toque) quem compra paga no mesmo aparelho: "Copiar código" vem antes do QR. No computador, QR primeiro. */}
      <Cartao className="p-6 flex flex-col items-center gap-5">
        <QrCode valor={pedido.pix!.qrCode} className="w-60 max-w-full pointer-coarse:w-44 pointer-coarse:order-3" />
        <div className="flex items-center gap-2 text-sm pointer-coarse:order-1">
          <span className="relative flex size-2.5" aria-hidden="true">
            <span className="absolute inline-flex size-full rounded-full bg-alerta opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2.5 rounded-full bg-alerta" />
          </span>
          {restante > 0 ? (
            <span className="text-texto-2">
              Aguardando pagamento · expira em <b className="numeros text-texto">{texto}</b>
            </span>
          ) : (
            <span className="text-alerta">Prazo encerrado</span>
          )}
        </div>
        <Botao largo tamanho="lg" icone="copiar" onClick={copiar} className="pointer-coarse:order-2">
          Copiar código Pix
        </Botao>
        <p className="hidden pointer-coarse:block pointer-coarse:order-4 text-xs text-texto-3 -mt-2">Ou escaneie o QR Code de outro aparelho.</p>
        <div className="w-full pointer-coarse:order-5">
          {verCodigo ? (
            <textarea
              readOnly
              value={pedido.pix!.qrCode}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Código Pix copia e cola"
              className="w-full h-24 rounded-xl bg-superficie-2 border border-linha p-3 font-mono text-xs break-all"
            />
          ) : (
            <button type="button" className="w-full min-h-11 text-sm text-texto-2 underline" onClick={() => setVerCodigo(true)}>
              Ver o código Pix
            </button>
          )}
        </div>
      </Cartao>

      <ol className="space-y-3">
        {["Toque em “Copiar código Pix”", "Abra o app do seu banco, escolha Pix e “Pix copia e cola” (ou escaneie o QR Code)", "Confirme o pagamento. Esta tela atualiza sozinha"].map((t, i) => (
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
  const [erroLeitura, setErroLeitura] = useState<"conexao" | "outro" | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    setErroLeitura(null);
    Promise.all((pedido.ingressoIds ?? []).map((id) => getDoc(doc(db, `torcidas/${tid}/ingressos/${id}`))))
      .then((snaps) => {
        if (!ativo) return;
        setBilhetes(
          snaps
            .filter((s) => s.exists())
            .map((s) => {
              const i = s.data() as Ingresso;
              return { id: s.id, ...i, eventoData: i.eventoData.toDate() };
            }),
        );
      })
      .catch((e) => ativo && setErroLeitura(ehErroDeConexao(e) ? "conexao" : "outro"));
    return () => {
      ativo = false;
    };
  }, [tid, pedido.ingressoIds, tentativa]);

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

      {erroLeitura ? (
        <Aviso
          tom={erroLeitura === "conexao" ? "alerta" : "perigo"}
          titulo={erroLeitura === "conexao" ? "Sem conexão" : "Não conseguimos mostrar os ingressos aqui"}
          acao={
            <Botao tamanho="sm" icone="atualizar" onClick={() => setTentativa((n) => n + 1)}>
              Tentar de novo
            </Botao>
          }
        >
          {erroLeitura === "conexao"
            ? "Seus ingressos estão garantidos. Abra os ingressos uma vez com internet para eles ficarem salvos no celular: confira a conexão e toque em “Tentar de novo”."
            : "Seus ingressos estão garantidos. Abra o link dos ingressos (botões acima) ou entre na sua conta."}
        </Aviso>
      ) : !bilhetes ? (
        <Carregando texto="Carregando ingressos…" />
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
            : "Bem-vindo! Sua carteirinha digital já está disponível."}
        </p>
      </div>
      <BotaoLink to={`/${torcida.slug}/socio`} tamanho="lg" iconeDireita="setaDireita">
        Ver minha carteirinha
      </BotaoLink>
      <div>
        <Link to={`/${torcida.slug}`} className="inline-flex items-center min-h-11 text-sm text-texto-2 hover:text-texto">
          Ver eventos
        </Link>
      </div>
    </div>
  );
}
