import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { collection, limit, orderBy, query, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import { dataHora, relativo } from "@/lib/formatos";
import { useColecao } from "@/hooks/dados";
import { Aviso, Botao, BotaoIcone, BotaoLink, CabecalhoPagina, Campo, Cartao, cx, Icone, Interruptor, Selo, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { BotaoCopiar, Confirmar, EstadoLista } from "./util";

const EVENTOS_WEBHOOK = [
  "order.paid",
  "order.payment_failed",
  "order.canceled",
  "charge.paid",
  "charge.payment_failed",
  "charge.refunded",
  "charge.chargedback",
  "invoice.paid",
  "invoice.payment_failed",
  "subscription.canceled",
  "recipient.created",
  "recipient.updated",
];

interface LogWebhook {
  tipo: string;
  processado: boolean;
  resultado?: string;
  erro?: string | null;
  tentativas?: number;
  recebidoEm?: Timestamp;
}

const ROTULO_RESULTADO: Record<string, string> = {
  pago: "Pagamento confirmado",
  encerrado: "Pedido encerrado (recusado/cancelado)",
  estornado: "Estorno registrado",
  fatura_paga: "Mensalidade no cartão paga",
  fatura_falhou: "Cobrança do cartão falhou",
  assinatura_cancelada: "Assinatura cancelada",
  pedido_externo: "Pedido de fora do app (ignorado)",
  assinatura_externa: "Assinatura de fora do app (ignorada)",
  evento_ignorado: "Evento não usado pelo app",
  ignorado: "Sem mudança",
};

/** Marca de passo concluído guardada só neste navegador (passos que não conseguimos verificar). */
function useMarcado(chave: string): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem(chave) === "1";
    } catch {
      return false;
    }
  });
  return [
    v,
    (nv) => {
      setV(nv);
      try {
        if (nv) localStorage.setItem(chave, "1");
        else localStorage.removeItem(chave);
      } catch {
        /* sem armazenamento: só na sessão */
      }
    },
  ];
}

export default function Pagamentos() {
  const { tid, torcida, base, demo } = usePainel();
  useTourPagina("pagamentos");
  const pag = torcida.pagamentos ?? { configurado: false, pix: true, cartao: true };
  const [sinalTrocar, setSinalTrocar] = useState(0);
  const ambiente = !pag.configurado ? null : demo ? "demo" : pag.ambiente === "producao" ? "producao" : "teste";
  const sairDaDemo = () => {
    setSinalTrocar((n) => n + 1);
    setTimeout(() => document.querySelector('[data-tour="passo-3"]')?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [carregandoUrl, setCarregandoUrl] = useState(false);
  const [dominioFeito, setDominioFeito] = useMarcado(`pagarme-dominio-${tid}`);
  const logs = useColecao<LogWebhook>(query(collection(db, `torcidas/${tid}/webhooks`), orderBy("recebidoEm", "desc"), limit(20)), `webhooks-${tid}`);

  useEffect(() => {
    if (!pag.configurado) return;
    let ativo = true;
    setCarregandoUrl(true);
    api
      .obterWebhookUrl({ tid })
      .then((r) => ativo && setWebhookUrl(r.webhookUrl))
      .catch(() => undefined)
      .finally(() => ativo && setCarregandoUrl(false));
    return () => {
      ativo = false;
    };
  }, [tid, pag.configurado]);

  const webhookOk = !!pag.webhookRecebidoEm;
  const origem = location.origin;

  return (
    <div className="max-w-4xl">
      <CabecalhoPagina
        titulo="Pagamentos"
        descricao="Conecte a conta Pagar.me da torcida. O dinheiro das vendas cai direto na conta de vocês — a Somos Organizada não toca no dinheiro."
      />

      {/* Situação atual */}
      <Cartao
        data-tour="pag-status"
        className={cx("p-5 sm:p-6 mb-6", ambiente === "producao" ? "border-sucesso/40" : ambiente === "demo" ? "border-info/40" : ambiente === "teste" ? "border-alerta/40" : "border-perigo/40")}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span
            className={cx(
              "size-14 shrink-0 rounded-2xl grid place-items-center",
              ambiente === "producao" ? "bg-sucesso/15 text-sucesso" : ambiente === "demo" ? "bg-info/15 text-info" : ambiente === "teste" ? "bg-alerta/15 text-alerta" : "bg-perigo/12 text-perigo",
            )}
          >
            <Icone nome={pag.configurado ? "checkCirculo" : "alerta"} className="size-7" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold">
              {!ambiente
                ? "Pagar.me não conectada"
                : ambiente === "producao"
                  ? "Vendendo de verdade"
                  : ambiente === "demo"
                    ? "Modo demonstração"
                    : "Conectada em modo de teste"}
            </p>
            <p className="text-sm text-texto-2">
              {ambiente === "demo"
                ? "Tudo funciona como se fosse de verdade, mas nenhum pagamento é real. Quando quiser vender, conecte a Pagar.me."
                : !pag.configurado
                ? "Siga os passos abaixo. Leva uns 15 minutos (fora o tempo de aprovação da Pagar.me)."
                : pag.ambiente === "producao"
                  ? "As compras na página da torcida são cobradas de verdade."
                  : "As compras são simuladas: nenhum dinheiro é cobrado. Troque pelas chaves de produção quando estiver pronto."}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <Info rotulo="Ambiente">
            {ambiente === "producao" ? (
              <Selo tom="sucesso">Produção</Selo>
            ) : ambiente === "demo" ? (
              <Selo tom="info">Demonstração</Selo>
            ) : ambiente === "teste" ? (
              <Selo tom="alerta">Teste</Selo>
            ) : (
              "—"
            )}
          </Info>
          <Info rotulo="Formas aceitas">
            {pag.configurado ? [pag.pix && "Pix", pag.cartao && "Cartão"].filter(Boolean).join(" + ") || "—" : "—"}
          </Info>
          <Info rotulo="Chave pública">{pag.chavePublica ? <span className="font-mono text-xs">{pag.chavePublica.slice(0, 12)}…</span> : "—"}</Info>
          <Info rotulo="Último webhook">
            {pag.webhookRecebidoEm ? (
              <span title={dataHora(pag.webhookRecebidoEm)}>{relativo(pag.webhookRecebidoEm)}</span>
            ) : (
              <span className="text-alerta">Nunca recebido</span>
            )}
          </Info>
        </dl>
      </Cartao>

      {(!pag.configurado || demo) && <CartaoDemo demo={demo} sair={sairDaDemo} />}

      <h2 className="text-xl font-bold mb-1">Passo a passo</h2>
      <p className="text-sm text-texto-2 mb-5">Faça na ordem. Você pode voltar aqui quando quiser.</p>

      <ol className="relative">
        <Passo n={1} titulo="Crie a conta da torcida na Pagar.me" feito={pag.configurado && !demo}>
          <p>
            Entre em{" "}
            <a href="https://pagar.me" target="_blank" rel="noreferrer" className="text-primaria font-semibold hover:underline">
              pagar.me
            </a>{" "}
            e clique em <strong>Criar conta</strong>. Use os dados da torcida (CNPJ da associação) ou de quem for responsável pelo dinheiro.
          </p>
          <p>
            Complete o cadastro e envie os documentos que eles pedirem. A Pagar.me verifica a empresa/associação — isso pode levar de algumas horas a
            alguns dias. Enquanto isso, você já consegue testar com as chaves de teste.
          </p>
          <Dica>Informe a conta bancária da torcida: é para lá que a Pagar.me transfere o dinheiro das vendas.</Dica>
        </Passo>

        <Passo n={2} titulo="Copie as duas chaves de acesso" feito={pag.configurado && !demo}>
          <p>
            No painel da Pagar.me, vá em <Caminho>Configurações</Caminho> → <Caminho>Chaves</Caminho>. Você vai ver duas chaves:
          </p>
          <ul className="space-y-2">
            <li className="flex gap-2">
              <Icone nome="cadeado" className="size-4 mt-0.5 shrink-0 text-perigo" />
              <span>
                <strong>Chave secreta</strong> — começa com <code className="font-mono text-texto">sk_</code>. É como a senha do banco: não mande para
                ninguém.
              </span>
            </li>
            <li className="flex gap-2">
              <Icone nome="chave" className="size-4 mt-0.5 shrink-0 text-info" />
              <span>
                <strong>Chave pública</strong> — começa com <code className="font-mono text-texto">pk_</code>. Usada para proteger o cartão do torcedor.
              </span>
            </li>
          </ul>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-alerta/30 bg-alerta/8 p-3">
              <p className="font-semibold text-texto text-sm">Teste</p>
              <p className="text-xs">
                <code className="font-mono">sk_test_…</code> e <code className="font-mono">pk_test_…</code>. Compras de mentira, para experimentar.
              </p>
              <p className="text-xs mt-1.5">
                Exige conta na Pagar.me. No simulador oficial, Pix de até R$ 500 é aprovado e acima disso falha; Pix com divisão (split) não funciona no
                simulador.
              </p>
            </div>
            <div className="rounded-2xl border border-sucesso/30 bg-sucesso/8 p-3">
              <p className="font-semibold text-texto text-sm">Produção</p>
              <p className="text-xs">
                <code className="font-mono">sk_…</code> e <code className="font-mono">pk_…</code> sem “test”. Só aparecem depois que a conta é aprovada.
              </p>
            </div>
          </div>
        </Passo>

        <Passo n={3} titulo="Cole as chaves aqui" feito={pag.configurado && !demo}>
          <FormChaves configurado={pag.configurado && !demo} sinalAbrir={sinalTrocar} aoSalvar={(url) => setWebhookUrl(url)} />
        </Passo>

        <Passo n={4} titulo="Libere o endereço do app para pagamentos com cartão" feito={dominioFeito}>
          <p>
            Para o cartão funcionar, a Pagar.me precisa saber de onde vêm os pagamentos. No painel deles, vá em <Caminho>Configurações</Caminho> →{" "}
            <Caminho>Domínios</Caminho> (em algumas contas fica em <Caminho>Checkout</Caminho>) e adicione:
          </p>
          <CaixaCopiar texto={origem} />
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={dominioFeito} onChange={(e) => setDominioFeito(e.target.checked)} className="size-4 accent-[var(--color-primaria)]" />
            Já cadastrei o domínio
          </label>
          <p className="text-xs text-texto-3">Se só for aceitar Pix, este passo é opcional.</p>
        </Passo>

        <Passo n={5} titulo="Configure o webhook (aviso de pagamento)" feito={webhookOk}>
          <p>É por ele que a Pagar.me avisa na hora que um Pix foi pago ou que uma cobrança foi recusada.</p>
          {demo ? (
            <Aviso tom="info">No modo demonstração não precisa configurar: os pagamentos simulados confirmam na hora.</Aviso>
          ) : !pag.configurado ? (
            <Aviso tom="info">A URL do webhook aparece aqui depois do passo 3.</Aviso>
          ) : carregandoUrl ? (
            <p className="text-sm text-texto-3">Buscando a URL...</p>
          ) : webhookUrl ? (
            <>
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>
                  Na Pagar.me, vá em <Caminho>Configurações</Caminho> → <Caminho>Webhooks</Caminho> → <Caminho>Criar webhook</Caminho>.
                </li>
                <li>Cole esta URL:</li>
              </ol>
              <CaixaCopiar texto={webhookUrl} mono />
              <ol className="list-decimal pl-5 space-y-1.5" start={3}>
                <li>Marque estes eventos (os demais podem ficar desmarcados):</li>
              </ol>
              <div className="flex flex-wrap gap-1.5">
                {EVENTOS_WEBHOOK.map((e) => (
                  <code key={e} className="font-mono text-xs rounded-lg bg-superficie-2 border border-linha px-2 py-1 text-texto">
                    {e}
                  </code>
                ))}
              </div>
              <BotaoCopiar texto={EVENTOS_WEBHOOK.join("\n")} rotulo="Copiar lista de eventos" />
              <ol className="list-decimal pl-5 space-y-1.5" start={4}>
                <li>Salve. Na primeira venda, o “Último webhook” lá em cima passa a mostrar a hora.</li>
              </ol>
            </>
          ) : (
            <Aviso tom="alerta">Não foi possível obter a URL agora. Recarregue a página ou salve as chaves de novo.</Aviso>
          )}
        </Passo>

        <Passo n={6} titulo="Divisão com as subsedes (split)" feito={!!pag.splitAtivo}>
          <PassoSplit configurado={pag.configurado} />
        </Passo>

        <Passo n={7} titulo="Faça uma compra de teste" feito={webhookOk && pag.ambiente === "producao"} ultimo>
          <p>
            Crie um evento de <strong>R$ 1,00</strong> (pode ser rascunho e depois publicado), abra a página da torcida e compre com Pix e com cartão.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Em modo teste, use qualquer cartão de teste da Pagar.me — nada é cobrado.</li>
            <li>Confira se o pedido aparece como “Pago” em Pedidos e se o webhook aparece na lista abaixo.</li>
            <li>Tudo certo? Volte ao passo 3 e cole as chaves de produção. Depois, exclua ou cancele o evento de teste.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <BotaoLink to={`${base}/eventos?novo=1`} tamanho="sm" icone="mais">
              Criar evento de teste
            </BotaoLink>
            <BotaoLink to={`${base}/pedidos`} tamanho="sm" variante="suave">
              Ver pedidos
            </BotaoLink>
          </div>
        </Passo>
      </ol>

      <section className="mt-10">
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold">Últimos webhooks recebidos</h2>
            <p className="text-sm text-texto-3">Os 20 avisos mais recentes da Pagar.me.</p>
          </div>
        </div>
        {logs.carregando || logs.erro || logs.dados.length === 0 ? (
          <EstadoLista
            carregando={logs.carregando}
            erro={logs.erro}
            vazio
            icone="raio"
            tituloVazio="Nenhum webhook recebido ainda"
            textoVazio="Depois de configurar o passo 5, faça uma compra de teste para ver os avisos chegando."
          />
        ) : (
          <Cartao className="overflow-hidden">
            <ul className="divide-y divide-linha">
              {logs.dados.map((w) => (
                <li key={w.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={cx(
                      "mt-0.5 size-8 shrink-0 rounded-lg grid place-items-center",
                      w.erro ? "bg-perigo/12 text-perigo" : w.processado ? "bg-sucesso/12 text-sucesso" : "bg-alerta/12 text-alerta",
                    )}
                  >
                    <Icone nome={w.erro ? "xCirculo" : w.processado ? "check" : "relogio"} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm truncate">{w.tipo || "(sem tipo)"}</p>
                    <p className={cx("text-xs truncate", w.erro ? "text-perigo" : "text-texto-3")}>
                      {w.erro ? w.erro : w.processado ? (ROTULO_RESULTADO[w.resultado ?? ""] ?? w.resultado ?? "Processado") : "Processando..."}
                      {(w.tentativas ?? 1) > 1 && ` · ${w.tentativas} tentativas`}
                    </p>
                  </div>
                  <span className="text-xs text-texto-3 shrink-0" title={dataHora(w.recebidoEm)}>
                    {relativo(w.recebidoEm)}
                  </span>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </section>
    </div>
  );
}

function FormChaves({ configurado, aoSalvar, sinalAbrir }: { configurado: boolean; aoSalvar: (url: string) => void; sinalAbrir: number }) {
  const { tid, torcida } = usePainel();
  const avisar = useToast();
  const pag = torcida.pagamentos;
  const [aberto, setAberto] = useState(!configurado);
  useEffect(() => {
    if (sinalAbrir > 0) setAberto(true);
  }, [sinalAbrir]);
  const [sk, setSk] = useState("");
  const [pk, setPk] = useState("");
  const [verSk, setVerSk] = useState(false);
  const [pix, setPix] = useState(pag?.pix ?? true);
  const [cartao, setCartao] = useState(pag?.cartao ?? true);
  const [descritor, setDescritor] = useState(pag?.descritorFatura ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const skLimpa = sk.trim();
  const pkLimpa = pk.trim();
  const producao = skLimpa.startsWith("sk_") && !skLimpa.startsWith("sk_test_") && !skLimpa.startsWith("sk_demo_");

  function validar(): boolean {
    setErro(null);
    if (!skLimpa.startsWith("sk_")) return (setErro("A chave secreta começa com sk_. Confira se não copiou a chave pública no lugar."), false);
    if (!pkLimpa.startsWith("pk_")) return (setErro("A chave pública começa com pk_."), false);
    if (skLimpa.startsWith("sk_test_") !== pkLimpa.startsWith("pk_test_"))
      return (setErro("As duas chaves precisam ser do mesmo ambiente: as duas de teste ou as duas de produção."), false);
    if (!pix && !cartao) return (setErro("Ative ao menos uma forma de pagamento."), false);
    return true;
  }

  function pedir() {
    if (!validar()) return;
    if (configurado || producao) setConfirmar(true);
    else void salvar().catch((e) => setErro(mensagemDeErro(e)));
  }

  async function salvar() {
    setSalvando(true);
    try {
      const r = await api.salvarCredenciaisPagarme({
        tid,
        chaveSecreta: skLimpa,
        chavePublica: pkLimpa,
        pix,
        cartao,
        ...(descritor.trim() ? { descritorFatura: descritor.trim() } : {}),
      });
      aoSalvar(r.webhookUrl);
      setSk("");
      setPk("");
      setAberto(false);
      avisar(r.ambiente === "producao" ? "Pagar.me conectada em PRODUÇÃO." : "Pagar.me conectada em modo de teste.", "sucesso");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <div className="space-y-3">
        <Aviso tom="sucesso" titulo="Chaves salvas e protegidas">
          As chaves ficam cifradas no servidor. Ninguém consegue vê-las depois — nem a diretoria, nem a equipe Somos Organizada.
        </Aviso>
        <Botao variante="contorno" tamanho="sm" icone="chave" onClick={() => setAberto(true)}>
          Trocar chaves ou formas de pagamento
        </Botao>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        pedir();
      }}
      noValidate
    >
      <Aviso tom="info" titulo="Suas chaves ficam seguras">
        Guardamos a chave secreta cifrada. Depois de salvar, ninguém consegue vê-la — nem a diretoria, nem a equipe Somos Organizada. Se precisar trocar,
        é só colar uma nova.
      </Aviso>
      <Campo
        rotulo="Chave secreta (sk_...)"
        type={verSk ? "text" : "password"}
        value={sk}
        onChange={setSk}
        autoComplete="off"
        spellCheck={false}
        placeholder="sk_test_..."
        className="[&_input]:font-mono"
        sufixo={<BotaoIcone icone="olho" rotulo={verSk ? "Esconder" : "Mostrar"} onClick={() => setVerSk((v) => !v)} className="size-9" />}
      />
      <Campo
        rotulo="Chave pública (pk_...)"
        value={pk}
        onChange={setPk}
        autoComplete="off"
        spellCheck={false}
        placeholder="pk_test_..."
        className="[&_input]:font-mono"
      />
      {skLimpa.startsWith("sk_") && (
        <p className="text-sm">
          Ambiente detectado: {producao ? <Selo tom="sucesso">Produção — vendas reais</Selo> : <Selo tom="alerta">Teste — nada é cobrado</Selo>}
        </p>
      )}
      <Cartao className="p-4 space-y-4">
        <Interruptor ligado={pix} onChange={setPix} rotulo="Aceitar Pix" descricao="Confirmação na hora, sem risco de estorno por fraude." />
        <Interruptor ligado={cartao} onChange={setCartao} rotulo="Aceitar cartão de crédito" descricao="Precisa do passo 4. Permite mensalidade automática." />
      </Cartao>
      <Campo
        rotulo="Nome na fatura do cartão (opcional)"
        value={descritor}
        onChange={(v) => setDescritor(v.slice(0, 13))}
        maxLength={13}
        dica={`Até 13 letras. É o que aparece na fatura do torcedor. ${descritor.length}/13`}
        placeholder="TORCIDABRASIL"
      />
      {erro && <Aviso tom="perigo">{erro}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Botao type="submit" icone="cadeado" carregando={salvando}>
          Salvar e testar chaves
        </Botao>
        {configurado && (
          <Botao variante="fantasma" onClick={() => setAberto(false)}>
            Cancelar
          </Botao>
        )}
      </div>
      <Confirmar
        aberto={confirmar}
        fechar={() => setConfirmar(false)}
        titulo={producao ? "Ativar vendas reais?" : "Trocar as chaves?"}
        rotulo={producao ? "Sim, conectar em produção" : "Trocar chaves"}
        acao={async () => {
          try {
            await salvar();
          } catch (e) {
            setErro(mensagemDeErro(e));
          }
        }}
      >
        {producao
          ? "Com as chaves de produção, as compras na página da torcida passam a ser cobradas de verdade."
          : "As chaves atuais serão substituídas. Pedidos em andamento continuam funcionando."}
        {configurado && " A URL do webhook não muda."}
      </Confirmar>
    </form>
  );
}

function chaveAleatoria(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const v = new Uint32Array(16);
  crypto.getRandomValues(v);
  return Array.from(v, (n) => letras[n % letras.length]).join("");
}

/** Cartão do modo demonstração: ativar (sem conta na Pagar.me) ou, já ativo, como testar e como sair. */
function CartaoDemo({ demo, sair }: { demo: boolean; sair: () => void }) {
  const { tid } = usePainel();
  const avisar = useToast();
  const [ativando, setAtivando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  return (
    <Cartao className="p-5 sm:p-6 mb-8 border-info/40" data-tour="pag-demo">
      <div className="flex items-start gap-4">
        <span className="size-12 shrink-0 rounded-2xl bg-info/15 text-info grid place-items-center">
          <Icone nome="raio" className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{demo ? "Você está no modo demonstração" : "Ainda não tem conta na Pagar.me? Teste tudo em modo demonstração"}</p>
          <p className="text-sm text-texto-2 mt-1">
            Compre ingressos, vire sócio, veja o dinheiro dividido com as subsedes — tudo de mentira, sem conta na Pagar.me. Nada é cobrado.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
        <div className="rounded-2xl bg-superficie-2 border border-linha p-3">
          <p className="font-semibold mb-1">Cartões de teste</p>
          <p className="text-texto-2">
            <code className="font-mono text-texto">4000 0000 0000 0010</code> → aprovado
          </p>
          <p className="text-texto-2">
            <code className="font-mono text-texto">4000 0000 0000 0028</code> → recusado
          </p>
          <p className="text-xs text-texto-3 mt-1">Qualquer outro número é recusado. Validade e CVV: qualquer valor.</p>
        </div>
        <div className="rounded-2xl bg-superficie-2 border border-linha p-3">
          <p className="font-semibold mb-1">Pix</p>
          <p className="text-texto-2">Na tela do Pix e no detalhe do pedido aparece o botão “Simular pagamento”.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {demo ? (
          <Botao variante="contorno" icone="cartao" onClick={sair}>
            Sair da demonstração / conectar Pagar.me real
          </Botao>
        ) : (
          <Botao icone="raio" carregando={ativando} onClick={() => setConfirmar(true)}>
            Ativar modo demonstração
          </Botao>
        )}
      </div>
      <Confirmar
        aberto={confirmar}
        fechar={() => setConfirmar(false)}
        titulo="Ativar o modo demonstração?"
        rotulo="Ativar demonstração"
        acao={async () => {
          setAtivando(true);
          try {
            await api.salvarCredenciaisPagarme({ tid, chaveSecreta: `sk_demo_${chaveAleatoria()}`, chavePublica: `pk_demo_${chaveAleatoria()}`, pix: true, cartao: true });
            avisar("Modo demonstração ativo. Nenhum pagamento é real.", "sucesso");
          } finally {
            setAtivando(false);
          }
        }}
      >
        Os pagamentos passam a ser simulados. Enquanto estiver assim, ninguém consegue pagar de verdade. Para vender, depois é só colar as chaves da Pagar.me
        no passo 3.
      </Confirmar>
    </Cartao>
  );
}

function PassoSplit({ configurado }: { configurado: boolean }) {
  const { tid, torcida, sedes, base } = usePainel();
  const avisar = useToast();
  const pag = torcida.pagamentos;
  const [rp, setRp] = useState(pag?.recebedorPrincipalId ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [desativar, setDesativar] = useState(false);
  const subsedes = sedes.filter((s) => s.tipo === "subsede" && s.ativa !== false);
  const ativas = subsedes.filter((s) => s.recebedor?.status === "active").length;

  async function ativar() {
    setErro(null);
    const v = rp.trim();
    if (!/^rp_[A-Za-z0-9]+$/.test(v)) return setErro("O código do recebedor começa com rp_ (ex.: rp_AbC123...).");
    setSalvando(true);
    try {
      const r = await api.configurarSplit({ tid, recebedorPrincipalId: v });
      avisar(r.nome ? `Divisão ativada. Recebedor principal: ${r.nome}.` : "Divisão de pagamentos ativada.", "sucesso");
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <p>
        Com a divisão ativa, cada subsede recebe o valor dos ingressos dos <strong>próprios eventos</strong> direto na conta bancária dela, e a taxa de serviço vai
        inteira para a torcida. A Pagar.me divide na hora da venda — ninguém precisa repassar à mão.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Disponível para contas <strong>PSP</strong> da Pagar.me. Confirme com o atendimento da Pagar.me que o split está liberado na sua conta.
        </li>
        <li>Cada subsede vira um “recebedor” da sua conta. Quem cadastra é o responsável da subsede, no painel dele (Recebimentos), com prova de vida.</li>
        <li>Eventos da sede principal continuam caindo inteiros na conta da torcida.</li>
      </ul>
      {pag?.splitAtivo ? (
        <div className="space-y-3">
          <Aviso tom="sucesso" titulo="Divisão ativa">
            Recebedor principal: <code className="font-mono text-texto">{pag.recebedorPrincipalId}</code>. {ativas} de {subsedes.length}{" "}
            {subsedes.length === 1 ? "subsede tem" : "subsedes têm"} conta de recebimento ativa.{" "}
            <Link to={`${base}/sedes`} className="underline">
              Ver sedes
            </Link>
          </Aviso>
          <Botao variante="perigo" tamanho="sm" icone="xCirculo" onClick={() => setDesativar(true)}>
            Desativar divisão
          </Botao>
        </div>
      ) : !configurado ? (
        <Aviso tom="info">Primeiro conecte a Pagar.me (passo 3) ou ative o modo demonstração.</Aviso>
      ) : pag?.ambiente === "demo" ? (
        <div className="space-y-3">
          <p>No modo demonstração não precisa de código: ative e teste como as subsedes recebem.</p>
          {erro && <Aviso tom="perigo">{erro}</Aviso>}
          <Botao
            icone="check"
            carregando={salvando}
            onClick={async () => {
              setErro(null);
              setSalvando(true);
              try {
                await api.configurarSplit({ tid });
                avisar("Divisão ativada (demonstração).", "sucesso");
              } catch (e) {
                setErro(mensagemDeErro(e));
              } finally {
                setSalvando(false);
              }
            }}
          >
            Ativar divisão (demonstração)
          </Botao>
        </div>
      ) : (
        <div className="space-y-3">
          <p>
            No painel da Pagar.me, abra o menu <Caminho>Recebedores</Caminho>. O <strong>recebedor principal</strong> é o da própria conta da torcida (normalmente o
            primeiro da lista, com o CNPJ/CPF de vocês). Copie o código que começa com <code className="font-mono text-texto">rp_</code>.
          </p>
          <Campo
            rotulo="ID do recebedor principal"
            value={rp}
            onChange={(v) => setRp(v.trim())}
            placeholder="rp_..."
            className="[&_input]:font-mono"
            spellCheck={false}
            autoComplete="off"
          />
          {erro && <Aviso tom="perigo">{erro}</Aviso>}
          <Botao icone="check" onClick={ativar} carregando={salvando}>
            Ativar divisão
          </Botao>
        </div>
      )}
      <Confirmar
        aberto={desativar}
        fechar={() => setDesativar(false)}
        titulo="Desativar a divisão com as subsedes?"
        rotulo="Desativar"
        perigo
        acao={async () => {
          await api.configurarSplit({ tid, desativar: true });
          avisar("Divisão de pagamentos desativada.", "sucesso");
        }}
      >
        Os eventos das subsedes <strong className="text-texto">param de vender</strong> até a divisão ser ativada de novo (o valor delas só pode cair na conta de
        recebimento de cada uma). Eventos da sede principal continuam normalmente.
      </Confirmar>
    </>
  );
}

function Passo({ n, titulo, feito, ultimo, children }: { n: number; titulo: string; feito?: boolean; ultimo?: boolean; children: ReactNode }) {
  return (
    <li className="relative pl-12 sm:pl-14 pb-8" data-tour={`passo-${n}`}>
      {!ultimo && <span className={cx("absolute left-[17px] sm:left-[19px] top-10 bottom-0 w-px", feito ? "bg-primaria/50" : "bg-linha-forte")} aria-hidden="true" />}
      <span
        className={cx(
          "absolute left-0 top-0 size-9 sm:size-10 rounded-full grid place-items-center font-bold text-sm",
          feito ? "bg-primaria text-sobre-primaria" : "bg-superficie-2 border border-linha-forte text-texto",
        )}
      >
        {feito ? <Icone nome="check" className="size-5" /> : n}
      </span>
      <h3 className="text-lg font-bold pt-1 sm:pt-1.5 flex flex-wrap items-center gap-2">
        {titulo}
        {feito && <Selo tom="sucesso">Feito</Selo>}
      </h3>
      <div className="mt-3 space-y-3 text-[15px] text-texto-2 leading-relaxed">{children}</div>
    </li>
  );
}

function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-superficie-2 px-3 py-2.5 min-w-0">
      <dt className="text-xs text-texto-3">{rotulo}</dt>
      <dd className="text-sm font-semibold mt-0.5 truncate">{children}</dd>
    </div>
  );
}

function Caminho({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded-md bg-superficie-3 px-1.5 py-0.5 text-[13px] font-semibold text-texto whitespace-nowrap">{children}</span>;
}

function Dica({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-2xl bg-superficie-2 border border-linha p-3 text-sm">
      <Icone nome="info" className="size-4 mt-0.5 shrink-0 text-info" />
      <span>{children}</span>
    </p>
  );
}

function CaixaCopiar({ texto, mono }: { texto: string; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <code className={cx("flex-1 min-w-0 break-all rounded-xl bg-superficie-2 border border-linha px-3 py-2 text-sm text-texto", mono && "font-mono text-xs leading-relaxed")}>{texto}</code>
      <BotaoCopiar texto={texto} variante="primaria" className="shrink-0 self-start sm:self-center" />
    </div>
  );
}
