import { useEffect, useMemo, useRef, useState } from "react";
import { esquecer, useLembrado } from "@/hooks/lembrado";
import { useNavigate } from "react-router";
import { createUserWithEmailAndPassword, EmailAuthProvider, linkWithCredential, signInAnonymously, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { api, ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import type { ComId, Evento, Sede } from "@/lib/tipos";
import { cpfValido, dataExtensa, emailValido, hora, moeda, soDigitos, telefoneValido, mascaraCpf, mascaraTelefone } from "@/lib/formatos";
import { useMinhaFicha, useTorcida } from "@/hooks/torcida";
import { useUsuario } from "@/hooks/dados";
import { Login } from "@/componentes/Login";
import { Aviso, Botao, Campo, Carregando, Contador, Etapas, Icone, Modal, OpcoesCartao, Selo, cx } from "@/ui";
import { LinhaValor, rolarParaErro, useTrocaDeEtapa } from "./comum";
import { disponibilidade } from "./CartaoEvento";
import { cartaoVazio, FormCartao, prepararCartao, validarCartao, type EstadoCartao } from "./FormCartao";

type Cotacao = Awaited<ReturnType<typeof api.cotarIngresso>>;
interface Titular {
  nome: string;
  cpf: string;
}

const ETAPAS = ["Ingressos", "Titulares", "Pagamento"];

/** Checkout faseado de ingressos. Mostrado dentro da página do evento. */
export function CheckoutIngresso({ evento, sede }: { evento: ComId<Evento>; sede?: Sede }) {
  const { tid, torcida } = useTorcida();
  const navegar = useNavigate();
  const usuario = useUsuario();
  const { ficha } = useMinhaFicha(tid);
  const [cot, setCot] = useState<Cotacao | null>(null);
  const [erroCot, setErroCot] = useState<{ mensagem: string; conexao: boolean } | null>(null);
  const [tentativaCot, setTentativaCot] = useState(0);
  // Passo e dados da compra sobrevivem a recarregar a página (sem senha nem cartão)
  const chaveCompra = `compra:${tid}:${evento.id}`;
  const [lembrado, setLembrado] = useLembrado(chaveCompra, {
    etapa: 0,
    qtd: 1,
    titulares: [{ nome: "", cpf: "" }] as Titular[],
    comprador: { nome: "", email: "", cpf: "", telefone: "" },
    metodo: (torcida.pagamentos.pix ? "pix" : "cartao") as "pix" | "cartao",
  });
  const { qtd, titulares, comprador, metodo } = lembrado;
  // o passo de pagamento exige conta: ao recarregar, só volta para ele depois de confirmar o login
  const [etapa, setEtapaEstado] = useState(Math.min(lembrado.etapa, 1));
  const setEtapa = (n: number) => {
    setEtapaEstado(n);
    setLembrado((l) => ({ ...l, etapa: n }));
  };
  const setQtd = (v: number | ((n: number) => number)) => setLembrado((l) => ({ ...l, qtd: typeof v === "function" ? v(l.qtd) : v }));
  const setTitulares = (v: Titular[] | ((t: Titular[]) => Titular[])) => setLembrado((l) => ({ ...l, titulares: typeof v === "function" ? v(l.titulares) : v }));
  const setComprador = (v: typeof comprador | ((c: typeof comprador) => typeof comprador)) =>
    setLembrado((l) => ({ ...l, comprador: typeof v === "function" ? v(l.comprador) : v }));
  const setMetodo = (m: "pix" | "cartao") => setLembrado((l) => ({ ...l, metodo: m }));
  const [cartao, setCartao] = useState<EstadoCartao>(cartaoVazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [loginAberto, setLoginAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [criandoConta, setCriandoConta] = useState(false);
  const topo = useRef<HTMLDivElement>(null);
  const tituloPasso = useRef<HTMLHeadingElement>(null);
  useTrocaDeEtapa(etapa, topo, tituloPasso);

  const uidLogado = usuario && !usuario.isAnonymous ? usuario.uid : null;
  useEffect(() => {
    if (uidLogado && lembrado.etapa === 2 && etapa === 1) setEtapaEstado(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uidLogado]);

  // Cotação (recalcula ao entrar/sair da conta de sócio)
  useEffect(() => {
    let ativo = true;
    setCot(null);
    setErroCot(null);
    api
      .cotarIngresso({ tid, eventoId: evento.id })
      .then((c) => ativo && setCot(c))
      .catch((e) => ativo && setErroCot({ mensagem: mensagemDeErro(e), conexao: ehErroDeConexao(e) }));
    return () => {
      ativo = false;
    };
  }, [tid, evento.id, uidLogado, tentativaCot]);

  const socioPreco = cot?.socio && !cot.socio.jaUsou ? cot.socio : null;

  // Conta logada sem ficha de sócio: pelo menos o e-mail já vem preenchido
  useEffect(() => {
    if (uidLogado && usuario?.email) setComprador((c) => ({ ...c, email: c.email || usuario.email!, nome: c.nome || usuario.displayName || "" }));
  }, [uidLogado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pré-preenche com os dados do sócio logado
  useEffect(() => {
    if (!ficha) return;
    setComprador((c) => ({
      nome: c.nome || ficha.nome,
      email: c.email || ficha.email,
      cpf: c.cpf || mascaraCpf(ficha.cpf),
      telefone: c.telefone || mascaraTelefone(ficha.telefone),
    }));
  }, [ficha]);
  useEffect(() => {
    if (socioPreco) {
      setTitulares((t) => [{ nome: socioPreco.nome, cpf: mascaraCpf(socioPreco.cpf) }, ...t.slice(1)]);
    }
  }, [socioPreco?.cpf]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTitulares((t) => Array.from({ length: qtd }, (_, i) => t[i] ?? { nome: "", cpf: "" }));
  }, [qtd]);

  const itens = useMemo(() => {
    if (!cot) return [];
    return titulares.map((t, i) => {
      const ehSocio = !!socioPreco && i === 0 && soDigitos(t.cpf) === socioPreco.cpf;
      return { ehSocio, base: ehSocio ? cot.valorSocio : cot.valorPublico, taxa: ehSocio ? cot.taxaSocio : cot.taxaPublico };
    });
  }, [cot, titulares, socioPreco]);
  const totalBase = itens.reduce((s, i) => s + i.base, 0);
  const totalTaxa = itens.reduce((s, i) => s + i.taxa, 0);
  const total = totalBase + totalTaxa;

  const disp = disponibilidade(evento);
  const maxQtd = Math.max(1, Math.min(cot?.limitePorPedido ?? 6, cot?.disponiveis ?? 99));
  const vendaEncerrada = !!evento.vendaAte && evento.vendaAte.toMillis() < Date.now();
  const bloqueado = disp.esgotado || vendaEncerrada || !torcida.pagamentos.configurado || torcida.status === "suspensa";

  function validarTitulares() {
    const e: Record<string, string> = {};
    const vistos = new Set<string>();
    titulares.forEach((t, i) => {
      if (t.nome.trim().split(/\s+/).length < 2) e[`t${i}nome`] = "Nome e sobrenome do titular.";
      const c = soDigitos(t.cpf);
      if (!cpfValido(c)) e[`t${i}cpf`] = "CPF inválido.";
      else if (vistos.has(c)) e[`t${i}cpf`] = "Cada ingresso precisa de um CPF diferente.";
      vistos.add(c);
    });
    if (comprador.nome.trim().length < 3) e.cnome = "Informe seu nome.";
    if (!emailValido(comprador.email)) e.cemail = "E-mail inválido.";
    if (!cpfValido(comprador.cpf)) e.ccpf = "CPF inválido.";
    if (!telefoneValido(comprador.telefone)) e.ctel = "Telefone com DDD.";
    setErros(e);
    if (Object.keys(e).length) rolarParaErro();
    return !Object.keys(e).length;
  }

  /**
   * Todo ingresso fica numa conta (e-mail + senha; depois dá para entrar também com o CPF).
   * Se o navegador já tinha sessão anônima, ela vira a conta: nada comprado antes se perde.
   */
  async function avancarParaPagamento() {
    if (!validarTitulares()) return;
    if (uidLogado) return setEtapa(2);
    if (senha.length < 8) {
      setErros((e) => ({ ...e, senha: "Crie uma senha com pelo menos 8 caracteres." }));
      rolarParaErro();
      return;
    }
    setCriandoConta(true);
    try {
      const atual = auth.currentUser;
      const cred = atual?.isAnonymous
        ? await linkWithCredential(atual, EmailAuthProvider.credential(comprador.email.trim(), senha))
        : await createUserWithEmailAndPassword(auth, comprador.email.trim(), senha);
      await updateProfile(cred.user, { displayName: comprador.nome.trim() }).catch(() => undefined);
      setEtapa(2);
    } catch (err) {
      const c = String((err as { code?: string }).code ?? "");
      setErros((e) => ({
        ...e,
        senha: /email-already-in-use|credential-already-in-use/.test(c)
          ? "Este e-mail já tem conta. Toque em “Entrar” logo acima e use sua senha."
          : /weak-password/.test(c)
            ? "Senha fraca: use pelo menos 8 caracteres."
            : /invalid-email/.test(c)
              ? "E-mail inválido."
              : mensagemDeErro(err),
      }));
      rolarParaErro();
    } finally {
      setCriandoConta(false);
    }
  }

  async function pagar() {
    setErroEnvio(null);
    if (metodo === "cartao") {
      const e = validarCartao(cartao);
      setErros(e);
      if (Object.keys(e).length) return rolarParaErro();
    }
    setEnviando(true);
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      const dadosCartao = metodo === "cartao" ? await prepararCartao(torcida.pagamentos.chavePublica!, cartao) : undefined;
      const r = await api.criarPedidoIngresso({
        tid,
        eventoId: evento.id,
        metodo,
        comprador: { nome: comprador.nome.trim(), email: comprador.email.trim(), cpf: soDigitos(comprador.cpf), telefone: soDigitos(comprador.telefone) },
        titulares: titulares.map((t) => ({ nome: t.nome.trim(), cpf: soDigitos(t.cpf) })),
        cartao: dadosCartao,
      });
      esquecer(chaveCompra);
      navegar(`/${torcida.slug}/pedido/${r.pedidoId}`);
    } catch (e) {
      setErroEnvio(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  if (erroCot) {
    return (
      <Aviso
        tom={erroCot.conexao ? "alerta" : "perigo"}
        titulo={erroCot.conexao ? "Sem conexão" : "Não conseguimos calcular os valores"}
        acao={
          <Botao tamanho="sm" icone="atualizar" onClick={() => setTentativaCot((n) => n + 1)}>
            Tentar de novo
          </Botao>
        }
      >
        {erroCot.conexao ? "Confira a internet e toque em “Tentar de novo”." : erroCot.mensagem}
      </Aviso>
    );
  }
  if (!cot) return <Carregando texto="Calculando valores…" />;

  if (bloqueado) {
    return (
      <Aviso tom="alerta" titulo={disp.esgotado ? "Ingressos esgotados" : vendaEncerrada ? "Vendas encerradas" : "Vendas indisponíveis no momento"}>
        {disp.esgotado ? "Fique de olho: ingressos podem voltar se alguma reserva expirar." : "Fale com a diretoria pelos canais oficiais."}
      </Aviso>
    );
  }

  return (
    <div ref={topo} className="space-y-6 min-w-0 scroll-mt-24">
      <Etapas etapas={ETAPAS} atual={etapa} />
      {/* Recebe o foco a cada troca de passo (o leitor de tela anuncia onde a pessoa está) */}
      <h3 ref={tituloPasso} tabIndex={-1} className="sr-only">
        Passo {etapa + 1} de {ETAPAS.length}: {ETAPAS[etapa]}
      </h3>

      {etapa === 0 && (
        <div className="space-y-5 animate-surgir">
          {/* Sócio x público */}
          {socioPreco ? (
            <div className="flex items-center gap-3 rounded-2xl border border-primaria/40 bg-primaria/10 p-4">
              <Icone nome="escudo" className="size-6 text-primaria-texto shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">Preço de sócio liberado</p>
                <p className="text-texto-2">Seu ingresso sai por {moeda(cot.valorSocio)}. Acompanhantes pagam o valor público.</p>
              </div>
            </div>
          ) : cot.socio?.jaUsou ? (
            <Aviso tom="info">Você já usou o preço de sócio neste evento. Novos ingressos saem pelo valor público.</Aviso>
          ) : uidLogado && ficha ? (
            <Aviso tom="alerta" titulo="Sua associação não está em dia">
              Regularize a mensalidade na sua conta para pagar {moeda(cot.valorSocio)}.
            </Aviso>
          ) : (
            <button
              type="button"
              onClick={() => setLoginAberto(true)}
              className="w-full flex items-center gap-3 rounded-2xl border border-dashed border-linha-forte p-4 text-left hover:border-primaria transition-colors"
            >
              <Icone nome="escudo" className="size-6 text-primaria-texto shrink-0" />
              <span className="text-sm flex-1">
                <span className="font-semibold block">É sócio? Pague {moeda(cot.valorSocio)}</span>
                <span className="text-texto-2">Entre na sua conta para liberar o preço de sócio.</span>
              </span>
              <Icone nome="chevronDireita" className="size-5 text-texto-3" />
            </button>
          )}

          <div className="flex items-center justify-between gap-4 rounded-2xl bg-superficie-2 p-4">
            <div>
              <p className="font-semibold">Quantidade</p>
              <p className="text-sm text-texto-3">
                Máx. {maxQtd} por compra{cot.disponiveis != null && cot.disponiveis <= 30 ? ` · restam ${cot.disponiveis}` : ""}
              </p>
            </div>
            <Contador valor={qtd} onChange={setQtd} min={1} max={maxQtd} rotulo="Quantidade de ingressos" />
          </div>

          <div className="space-y-2 rounded-2xl border border-linha p-4">
            {itens.map((it, i) => (
              <LinhaValor key={i} rotulo={`Ingresso ${i + 1} · ${it.ehSocio ? "Sócio" : "Público"}`} valor={moeda(it.base)} />
            ))}
            <LinhaValor rotulo={`Taxa de serviço (${cot.pct}%)`} valor={moeda(totalTaxa)} sutil />
            <LinhaValor rotulo="Total" valor={moeda(total)} forte />
          </div>
          <Botao largo tamanho="lg" iconeDireita="setaDireita" onClick={() => setEtapa(1)}>
            Continuar
          </Botao>
        </div>
      )}

      {etapa === 1 && (
        <div className="space-y-5 animate-surgir">
          <Aviso tom="info">Ingresso nominal e intransferível: o nome e o CPF do titular são conferidos na entrada, com documento com foto.</Aviso>
          {titulares.map((t, i) => {
            const travado = !!socioPreco && i === 0;
            return (
              <fieldset key={i} className="min-w-0 rounded-2xl border border-linha p-4 space-y-3">
                <legend className="px-2 text-sm font-semibold flex items-center gap-2">
                  Ingresso {i + 1} {itens[i]?.ehSocio ? <Selo tom="primaria">Sócio</Selo> : <Selo>Público</Selo>}
                </legend>
                <Campo
                  rotulo="Nome completo do titular"
                  value={t.nome}
                  disabled={travado}
                  onChange={(v) => setTitulares((l) => l.map((x, j) => (j === i ? { ...x, nome: v } : x)))}
                  erro={erros[`t${i}nome`]}
                  autoComplete={i === 0 ? "name" : "off"}
                />
                <Campo
                  rotulo="CPF do titular"
                  mascara="cpf"
                  value={t.cpf}
                  disabled={travado}
                  onChange={(v) => setTitulares((l) => l.map((x, j) => (j === i ? { ...x, cpf: v } : x)))}
                  erro={erros[`t${i}cpf`]}
                  dica={travado ? "Preço de sócio vale para o ingresso no seu nome." : undefined}
                />
              </fieldset>
            );
          })}

          <fieldset className="min-w-0 rounded-2xl border border-linha p-4 space-y-3">
            <legend className="px-2 text-sm font-semibold">Quem está comprando</legend>
            {!uidLogado && (
              <button
                type="button"
                className="inline-flex items-center min-h-11 text-sm text-primaria-texto font-semibold"
                onClick={() => setComprador((c) => ({ ...c, nome: titulares[0].nome, cpf: titulares[0].cpf }))}
              >
                Usar os dados do ingresso 1
              </button>
            )}
            {!uidLogado && (
              <button type="button" className="flex items-center min-h-11 text-sm text-texto-2" onClick={() => setLoginAberto(true)}>
                Já tem conta? <span className="font-semibold text-primaria-texto">Entrar</span>
              </button>
            )}
            <Campo rotulo="Nome" value={comprador.nome} onChange={(v) => setComprador({ ...comprador, nome: v })} erro={erros.cnome} autoComplete="name" />
            <Campo
              rotulo="E-mail"
              type="email"
              value={comprador.email}
              onChange={(v) => setComprador({ ...comprador, email: v })}
              erro={erros.cemail}
              autoComplete="email"
              disabled={!!uidLogado && !!usuario?.email && comprador.email === usuario.email}
              dica={uidLogado ? "Os ingressos ficam na sua conta." : "Será o login da sua conta."}
            />
            <div className="grid sm:grid-cols-2 gap-3 [&>*]:min-w-0">
              <Campo rotulo="CPF" mascara="cpf" value={comprador.cpf} onChange={(v) => setComprador({ ...comprador, cpf: v })} erro={erros.ccpf} />
              <Campo rotulo="Celular (WhatsApp)" mascara="telefone" value={comprador.telefone} onChange={(v) => setComprador({ ...comprador, telefone: v })} erro={erros.ctel} autoComplete="tel" />
            </div>
            {!uidLogado && (
              <Campo
                rotulo="Crie uma senha"
                type="password"
                autoComplete="new-password"
                icone="cadeado"
                value={senha}
                onChange={setSenha}
                erro={erros.senha}
                dica="Com seu CPF (ou e-mail) e esta senha você vê seus ingressos em qualquer celular."
              />
            )}
          </fieldset>

          <div className="flex gap-3">
            <Botao aria-label="Voltar" className="shrink-0 px-4 sm:px-7" variante="contorno" tamanho="lg" onClick={() => setEtapa(0)} icone="setaEsquerda">
              <span className="hidden sm:inline">Voltar</span>
            </Botao>
            <Botao largo tamanho="lg" className="min-w-0 px-4 sm:px-7" iconeDireita="setaDireita" carregando={criandoConta} onClick={avancarParaPagamento}>
              Ir para pagamento
            </Botao>
          </div>
        </div>
      )}

      {etapa === 2 && (
        <div className="space-y-5 animate-surgir">
          <OpcoesCartao
            nome="Forma de pagamento"
            valor={metodo}
            onChange={setMetodo}
            opcoes={[
              ...(torcida.pagamentos.pix
                ? [{ valor: "pix" as const, titulo: "Pix", descricao: "Aprovação na hora", icone: "pix" as const, extra: <Selo tom="primaria" className="mt-2">Recomendado</Selo> }]
                : []),
              ...(torcida.pagamentos.cartao ? [{ valor: "cartao" as const, titulo: "Cartão de crédito", descricao: "À vista", icone: "cartao" as const }] : []),
            ]}
          />
          {metodo === "cartao" && <FormCartao valor={cartao} onChange={setCartao} erros={erros} />}

          <div className="rounded-2xl bg-superficie-2 p-4 space-y-2">
            <p className="font-semibold">{evento.nome}</p>
            <p className="text-sm text-texto-2">
              {dataExtensa(evento.data)} · {hora(evento.data)}
              {sede ? ` · ${sede.nome}` : ""}
            </p>
            <div className="pt-2 space-y-1.5">
              <LinhaValor rotulo={`${qtd} ingresso${qtd > 1 ? "s" : ""}`} valor={moeda(totalBase)} />
              <LinhaValor rotulo={`Taxa de serviço (${cot.pct}%)`} valor={moeda(totalTaxa)} sutil />
              <LinhaValor rotulo="Total" valor={moeda(total)} forte />
            </div>
          </div>

          {erroEnvio && <Aviso tom="perigo" titulo="Pagamento não concluído">{erroEnvio}</Aviso>}

          <div className="flex gap-3">
            <Botao aria-label="Voltar" className="shrink-0 px-4 sm:px-7" variante="contorno" tamanho="lg" onClick={() => setEtapa(1)} icone="setaEsquerda" disabled={enviando}>
              <span className="hidden sm:inline">Voltar</span>
            </Botao>
            <Botao
              largo
              tamanho="lg"
              className="min-w-0 px-4 sm:px-7 whitespace-normal leading-tight text-center"
              carregando={enviando}
              disabled={metodo === "cartao" && !!cartao.buscandoCep}
              icone={metodo === "pix" ? "pix" : "cadeado"}
              onClick={pagar}
            >
              {metodo === "pix" ? "Gerar Pix" : "Pagar"} {moeda(total)}
            </Botao>
          </div>
          {torcida.pagamentos.ambiente === "teste" && (
            <p className={cx("text-xs text-center text-alerta")}>Ambiente de teste: nenhuma cobrança real será feita.</p>
          )}
        </div>
      )}

      <Modal aberto={loginAberto} fechar={() => setLoginAberto(false)} largura="max-w-md">
        <EntrarSocio aoEntrar={() => setLoginAberto(false)} />
      </Modal>
    </div>
  );
}

function EntrarSocio({ aoEntrar }: { aoEntrar: () => void }) {
  const u = useUsuario();
  const { torcida } = useTorcida();
  useEffect(() => {
    if (u && !u.isAnonymous) aoEntrar();
  }, [u, aoEntrar]);
  return (
    <div className="-mx-6 -my-4 [&>div]:border-0 [&>div]:bg-transparent">
      <Login
        titulo="Entrar na sua conta"
        subtitulo="Use seu CPF ou e-mail e a senha. Sócios liberam o preço de sócio."
        aceitaCpf
        rodape={
          <a href={`/${torcida.slug}?aba=socios`} className="font-semibold text-primaria-texto">
            Ainda não é sócio? Conheça os planos
          </a>
        }
      />
    </div>
  );
}
