/**
 * Cadastro de torcida pela página principal (público, mobile-first, para quem nunca usou um sistema assim).
 * Fases: conta → verificar e-mail → torcida → responsável → entidade → revisão → em análise.
 * O pedido fica em `solicitacoes` e só vira torcida depois da aprovação da equipe Somos Organizada.
 */
import { enviarConfirmacaoEmail, CANAL_CONTA } from "@/lib/emailsConta";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { createUserWithEmailAndPassword, signOut, updateProfile, type User } from "firebase/auth";
import { collection, doc, getDoc, query, setDoc, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import { aplicarTema, corValida, TEMA_PADRAO } from "@/lib/tema";
import { buscarCep } from "@/lib/servicos";
import { cpfValido, dataHora, emailValido, mascaraCep, mascaraCpf, mascaraTelefone, soDigitos, telefoneValido } from "@/lib/formatos";
import type { ComId, SolicitacaoTorcida } from "@/lib/tipos";
import { useColecao, useUsuario } from "@/hooks/dados";
import { BotaoVerSenha, Login } from "@/componentes/Login";
import { Abas, Aviso, Botao, BotaoLink, Campo, Cartao, Carregando, cx, Etapas, Girando, Icone, OpcoesCartao } from "@/ui";
import { SLUG_VALIDO, slugDoNome } from "./planos";
import { CoresCadastro, type Cores } from "./CoresCadastro";
import { CartaoChamada, PassoVideo } from "./VerificacaoVideo";

const DOMINIO = "somosorganizada.com.br/";
const MSG_SLUG_SEM_CONEXAO = "Não deu para conferir agora. Verifique sua conexão.";
const WHATSAPP = "5571994095784";
const ETAPAS = ["Conta", "E-mail", "Torcida", "Pessoa", "Entidade", "Revisão", "Vídeo", "Análise"];
const RESERVADOS = new Set([
  "admin", "api", "app", "assets", "conta", "login", "plataforma", "suporte", "painel", "portaria",
  "static", "www", "somos", "organizada", "termos", "privacidade", "ajuda", "sobre", "contato", "cadastro", "entrar",
  "verificar", "convite", "redefinir-senha",
]);

interface Dados {
  nomeTorcida: string;
  clube: string;
  slug: string;
  slugEditado: boolean;
  estimativaSocios: string;
  quantidadeSubsedes: string;
  cores: Cores | null;
  respNome: string;
  respCpf: string;
  respTelefone: string;
  respCargo: string;
  temCnpj: "cnpj" | "sem_cnpj" | null;
  cnpj: string;
  razaoSocial: string;
  emailFinanceiro: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}
const VAZIO: Dados = {
  nomeTorcida: "", clube: "", slug: "", slugEditado: false, estimativaSocios: "", quantidadeSubsedes: "", cores: null,
  respNome: "", respCpf: "", respTelefone: "", respCargo: "",
  temCnpj: null, cnpj: "", razaoSocial: "", emailFinanceiro: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
};

// ── Rascunho ────────────────────────────────────────────────────
// Guardado na conta (Firestore, só o dono lê) para continuar de onde parou em qualquer aparelho, mesmo depois
// de erro, queda de internet ou aba fechada; e neste navegador (sem o CPF) para abrir na hora, até sem internet.
// Vale o mais recente dos dois. O servidor apaga o da conta quando o pedido é enviado.
type Passo = 2 | 3 | 4 | 5;
interface Rascunho {
  dados: Dados;
  passo: Passo;
  atualizadoEm: number;
}
const refRascunho = (uid: string) => doc(db, `usuarios/${uid}/rascunhos/cadastroTorcida`);
const chaveLocal = (uid: string) => `somos-cadastro:${uid}`;

/** Rascunho vindo de fora (navegador ou banco) com tipo errado não pode derrubar a tela. */
function sanear(bruto: unknown): Dados {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const d = { ...VAZIO } as Record<string, unknown>;
  for (const k of Object.keys(VAZIO)) if (typeof (VAZIO as unknown as Record<string, unknown>)[k] === "string" && typeof o[k] === "string") d[k] = (o[k] as string).slice(0, 200);
  d.slugEditado = o.slugEditado === true;
  d.temCnpj = o.temCnpj === "cnpj" || o.temCnpj === "sem_cnpj" ? o.temCnpj : null;
  const c = o.cores as Record<string, unknown> | null | undefined;
  d.cores =
    c && typeof c === "object" && (["corPrimaria", "corSecundaria", "corFundo", "corTexto"] as const).every((k) => typeof c[k] === "string" && corValida(c[k] as string))
      ? { corPrimaria: c.corPrimaria, corSecundaria: c.corSecundaria, corFundo: c.corFundo, corTexto: c.corTexto }
      : null;
  return d as unknown as Dados;
}

/** Volta para o primeiro passo que ainda falta: nunca para na revisão com o CPF em branco, por exemplo. */
function passoSeguro(passo: unknown, d: Dados): Passo {
  let p: Passo = passo === 3 || passo === 4 || passo === 5 ? passo : 2;
  if (p > 2 && (d.nomeTorcida.trim().length < 2 || !d.cores)) p = 2;
  if (p > 3 && (!cpfValido(d.respCpf) || !telefoneValido(d.respTelefone) || !d.respCargo.trim())) p = 3;
  return p;
}

function lerLocal(uid: string): Rascunho | null {
  try {
    const novo = localStorage.getItem(chaveLocal(uid));
    if (novo) {
      const r = JSON.parse(novo) as Partial<Rascunho>;
      return { dados: sanear(r.dados), passo: (Number(r.passo) || 2) as Passo, atualizadoEm: Number(r.atualizadoEm) || 0 };
    }
    // versão anterior: rascunho e passo em chaves separadas (quem começou o cadastro antes desta mudança)
    const antigo = localStorage.getItem(`somos-cadastro-rascunho:${uid}`);
    if (!antigo) return null;
    return { dados: sanear(JSON.parse(antigo)), passo: (Number(localStorage.getItem(`somos-cadastro-passo:${uid}`)) || 2) as Passo, atualizadoEm: 0 };
  } catch {
    return null;
  }
}
function gravarLocal(uid: string, r: Rascunho | null) {
  try {
    localStorage.removeItem("somos-cadastro-rascunho"); // versão antiga guardava CPF numa chave só para todos
    localStorage.removeItem(`somos-cadastro-rascunho:${uid}`);
    localStorage.removeItem(`somos-cadastro-passo:${uid}`);
    if (r) localStorage.setItem(chaveLocal(uid), JSON.stringify({ ...r, dados: { ...r.dados, respCpf: undefined } }));
    else localStorage.removeItem(chaveLocal(uid));
  } catch {
    /* sem armazenamento: fica só o rascunho da conta */
  }
}

/** Sair da conta apagando o rascunho deste aparelho (o da conta fica: entrando de novo, continua de onde parou). */
function sairApagandoRascunho() {
  const uid = auth.currentUser?.uid;
  if (uid) gravarLocal(uid, null);
  return signOut(auth).catch(() => undefined);
}

/** Foco automático só com mouse: no celular ele abre o teclado a cada passo e cobre a tela. */
const focoAutomatico = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;

const mascaraCnpj = (s: string) =>
  soDigitos(s)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");

function cnpjValido(v: string): boolean {
  const c = soDigitos(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = base.split("").reduce((s, d, i) => s + Number(d) * pesos[i]!, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(c.slice(0, 12)) === Number(c[12]) && calc(c.slice(0, 13)) === Number(c[13]);
}

const so = (s: string) => s.replace(/\D/g, "");

// ═══════════════════════════════════════════════════════════════
export default function Cadastro() {
  const usuario = useUsuario();
  const [, forcar] = useState(0);
  const [novoCadastro, setNovoCadastro] = useState(false);
  const logado = !!usuario && !usuario.isAnonymous;

  useEffect(() => {
    aplicarTema(TEMA_PADRAO);
    document.title = "Cadastrar torcida · Somos Organizada";
  }, []);

  const sols = useColecao<SolicitacaoTorcida>(
    logado ? query(collection(db, "solicitacoes"), where("uid", "==", usuario!.uid)) : null,
    `minhas-solicitacoes-${logado ? usuario!.uid : "-"}`,
  );
  const ordenadas = useMemo(
    () => [...sols.dados].sort((a, b) => (b.criadoEm?.toMillis?.() ?? Date.now()) - (a.criadoEm?.toMillis?.() ?? Date.now())),
    [sols.dados],
  );
  const ativa = ordenadas.find((s) => s.status === "pendente" || s.status === "aprovada");
  const recusada = !ativa ? ordenadas.find((s) => s.status === "recusada") : undefined;

  let conteudo: ReactNode;
  let etapa = 0;
  if (usuario === undefined || (logado && sols.carregando)) {
    conteudo = <Carregando />;
  } else if (logado && !sols.dados.length && (sols.erro || sols.semConexao)) {
    // Sem saber se já existe pedido enviado, não mostra o formulário (evita cadastro duplicado)
    conteudo = (
      <Cartao className="p-6 sm:p-7 text-center space-y-4">
        <span className="mx-auto size-14 rounded-2xl bg-info/15 text-info grid place-items-center">
          <Icone nome="alerta" className="size-8" />
        </span>
        <h1 className="text-xl font-bold">Sem conexão</h1>
        <p className="text-texto-2">Não conseguimos abrir o seu cadastro agora. Confira a internet e toque de novo: nada do que você preencheu se perdeu.</p>
        <Botao largo tamanho="lg" icone="atualizar" onClick={() => location.reload()}>
          Tentar de novo
        </Botao>
      </Cartao>
    );
  } else if (!logado) {
    conteudo = <PassoConta />;
  } else if (ativa?.status === "pendente" && ativa.verificacao?.status !== "agendada" && ativa.verificacao?.status !== "realizada") {
    // Enviado, mas sem a chamada de verificação marcada: é o último passo antes da análise
    etapa = 6;
    conteudo = <PassoVideo s={ativa} />;
  } else if (ativa || (recusada && !novoCadastro)) {
    etapa = ativa?.status === "aprovada" ? ETAPAS.length : 7;
    conteudo = <EmAnalise s={(ativa ?? recusada)!} aoRecomecar={() => setNovoCadastro(true)} />;
  } else if (!(auth.currentUser?.emailVerified ?? usuario!.emailVerified)) {
    etapa = 1;
    conteudo = <PassoVerificar usuario={usuario!} aoVerificar={() => forcar((n) => n + 1)} />;
  } else {
    conteudo = <Formulario usuario={usuario!} />;
    etapa = -1; // o formulário desenha as próprias etapas
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="mx-auto max-w-4xl w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="font-display uppercase tracking-tight flex items-center gap-2 text-sm sm:text-base">
          <span className="grid grid-cols-2 gap-0.5 size-7 p-1 rounded-lg bg-superficie-2 border border-linha" aria-hidden="true">
            <span className="rounded-[2px] bg-primaria" />
            <span className="rounded-[2px] bg-secundaria" />
            <span className="rounded-[2px] bg-info" />
            <span className="rounded-[2px] bg-texto" />
          </span>
          Somos Organizada
        </Link>
        {logado && (
          <button type="button" onClick={() => void sairApagandoRascunho()} className="min-h-11 px-2 text-sm text-texto-2 hover:text-texto inline-flex items-center gap-1.5">
            <Icone nome="sair" className="size-4" /> Sair
          </button>
        )}
      </header>
      <main className="mx-auto max-w-4xl w-full px-4 sm:px-6 pb-16 flex-1">
        {etapa >= 0 && usuario !== undefined && (
          <div className="mb-6">
            <Etapas etapas={ETAPAS} atual={etapa} />
          </div>
        )}
        {conteudo}
      </main>
    </div>
  );
}

function Titulo({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{titulo}</h1>
      {children && <p className="text-texto-2 mt-2">{children}</p>}
    </div>
  );
}

// ── (a) Conta ───────────────────────────────────────────────────
function traduzirErroConta(e: unknown): string {
  const c = String((e as { code?: string }).code ?? "");
  if (c.includes("email-already-in-use")) return "Este e-mail já tem conta. Toque em “Já tenho conta” e entre com a sua senha.";
  if (c.includes("weak-password")) return "Senha fraca. Use pelo menos 8 caracteres.";
  if (c.includes("invalid-email")) return "E-mail inválido.";
  if (c.includes("network")) return "Sem conexão. Verifique sua internet.";
  return mensagemDeErro(e);
}

/**
 * Envio do e-mail de confirmação feito na criação da conta. Assim que a conta existe, a tela já troca para
 * "Confirme seu e-mail" (antes de este envio terminar): ela espera este em vez de pedir outro e bater no
 * limite de reenvio ("Muitos envios seguidos").
 */
let envioDaCriacao: { email: string; promessa: Promise<boolean> } | null = null;

function PassoConta() {
  const [modo, setModo] = useState<"criar" | "entrar">("criar");
  /** Tentou criar conta com um e-mail que já existe: provavelmente já começou o cadastro. */
  const [jaExiste, setJaExiste] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const erros = {
    nome: nome.trim().split(/\s+/).length < 2 ? "Escreva nome e sobrenome." : null,
    email: !emailValido(email) ? "E-mail inválido." : null,
    senha: senha.length < 8 ? "Use pelo menos 8 caracteres." : null,
  };

  async function criar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    setErro(null);
    if (erros.nome || erros.email || erros.senha) return;
    setCarregando(true);
    try {
      const criacao = (async () => {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
        await updateProfile(cred.user, { displayName: nome.trim() }).catch(() => undefined);
        try {
          await enviarConfirmacaoEmail(cred.user, `${location.origin}/cadastro`);
          try {
            sessionStorage.setItem(`somos-verificacao:${cred.user.uid}`, String(Date.now()));
          } catch {
            /* sem armazenamento */
          }
          return true;
        } catch {
          return false; // o passo seguinte avisa e deixa reenviar na hora
        }
      })();
      envioDaCriacao = { email: email.trim().toLowerCase(), promessa: criacao.catch(() => false) };
      await criacao;
    } catch (err) {
      envioDaCriacao = null; // a conta não foi criada aqui: nada foi enviado
      if (String((err as { code?: string }).code ?? "").includes("email-already-in-use")) {
        setJaExiste(email.trim());
        setModo("entrar");
      } else setErro(traduzirErroConta(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <Titulo titulo="Cadastre sua torcida">
        Leva uns 5 minutos. A equipe Somos Organizada confere os dados e libera o painel da sua torcida. Nada é cobrado até você publicar o site.
      </Titulo>
      <Abas
        className="w-full mb-5"
        valor={modo}
        onChange={setModo}
        opcoes={[
          { valor: "criar", rotulo: "Criar conta", icone: "usuario" },
          { valor: "entrar", rotulo: "Já tenho conta", icone: "cadeado" },
        ]}
      />
      {modo === "entrar" ? (
        <Login
          key={jaExiste ?? "-"}
          titulo={jaExiste ? "Continuar meu cadastro" : "Entrar"}
          subtitulo="Use o e-mail que vai administrar a torcida."
          emailInicial={jaExiste ?? undefined}
          avisoInicial={jaExiste ? "Este e-mail já tem conta. Digite a sua senha e o cadastro continua do passo em que você parou, com os dados já preenchidos." : undefined}
        />
      ) : (
        <Cartao className="p-6 sm:p-7">
          <form onSubmit={criar} className="space-y-4" noValidate>
            <Campo rotulo="Seu nome completo" autoComplete="name" value={nome} onChange={setNome} erro={tentou && erros.nome} icone="usuario" />
            <Campo
              rotulo="E-mail"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={setEmail}
              erro={tentou && erros.email}
              dica="Vai ser o seu login no painel da torcida."
            />
            <Campo
              rotulo="Crie uma senha"
              type={verSenha ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              sufixo={<BotaoVerSenha visivel={verSenha} alternar={() => setVerSenha((v) => !v)} />}
              value={senha}
              onChange={setSenha}
              erro={tentou && erros.senha}
              dica="Mínimo de 8 caracteres."
              icone="cadeado"
            />
            {erro && <Aviso tom="perigo">{erro}</Aviso>}
            <Botao type="submit" largo tamanho="lg" carregando={carregando} iconeDireita="setaDireita">
              Criar conta e continuar
            </Botao>
          </form>
        </Cartao>
      )}
      <p className="text-xs text-texto-3 text-center mt-5">
        Já cadastrou? Entre com a mesma conta para acompanhar a análise. Dúvidas?{" "}
        <a className="underline" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noreferrer">
          Fale com a equipe
        </a>
        .
      </p>
    </>
  );
}

// ── (b) Verificar e-mail ────────────────────────────────────────
function PassoVerificar({ usuario, aoVerificar }: { usuario: User; aoVerificar: () => void }) {
  const [aviso, setAviso] = useState<{ tom: "info" | "sucesso" | "alerta" | "perigo"; texto: string } | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [espera, setEspera] = useState(0);
  const chave = `somos-verificacao:${usuario.uid}`;

  async function enviar() {
    try {
      await enviarConfirmacaoEmail(usuario, `${location.origin}/cadastro`);
      try {
        sessionStorage.setItem(chave, String(Date.now()));
      } catch {
        /* ignora */
      }
      setEspera(60);
      setAviso({ tom: "sucesso", texto: `Enviamos o link para ${usuario.email}. Confira também o spam e as promoções.` });
    } catch (e) {
      const c = String((e as { code?: string }).code ?? "");
      setAviso({ tom: "perigo", texto: c.includes("too-many") ? "Muitos envios seguidos. Aguarde alguns minutos." : mensagemDeErro(e) });
    }
  }

  // envia automaticamente uma vez por sessão (quem entrou pelo "Já tenho conta" ainda não recebeu)
  useEffect(() => {
    let enviado: string | null = null;
    try {
      enviado = sessionStorage.getItem(chave);
    } catch {
      /* ignora */
    }
    if (envioDaCriacao && envioDaCriacao.email === usuario.email?.toLowerCase()) {
      // conta acabou de ser criada: o envio já está em andamento (ou terminou)
      const emAndamento = envioDaCriacao.promessa;
      setAviso({ tom: "info", texto: `Enviando o link para ${usuario.email}…` });
      void emAndamento.then((enviou) => {
        if (enviou) {
          setEspera(60);
          setAviso({ tom: "sucesso", texto: `Enviamos o link para ${usuario.email}. Confira também o spam e as promoções.` });
        } else setAviso({ tom: "alerta", texto: "Não conseguimos enviar o e-mail agora. Toque em “Reenviar e-mail”." });
      });
    } else if (!enviado) void enviar();
    else setAviso({ tom: "info", texto: `Enviamos um link para ${usuario.email}.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  // confere sozinho a cada 5 s (a pessoa costuma clicar no link em outra aba)
  const conferir = useRef(async (_manual: boolean) => false);
  conferir.current = async (manual: boolean) => {
    await usuario.reload().catch(() => undefined);
    if (auth.currentUser?.emailVerified) {
      await auth.currentUser.getIdToken(true).catch(() => undefined); // o servidor exige email_verified no token
      aoVerificar();
      return true;
    }
    if (manual) setAviso({ tom: "alerta", texto: "Ainda não aparece como confirmado. Abra o link do e-mail e toque de novo em “Já verifiquei”." });
    return false;
  };
  useEffect(() => {
    const t = setInterval(() => void conferir.current(false), 5000);
    // confirmou em outra aba (página /verificar): segue na hora, sem esperar os 5 s
    let canal: BroadcastChannel | null = null;
    try {
      canal = new BroadcastChannel(CANAL_CONTA);
      canal.onmessage = (ev) => ev.data === "email-confirmado" && void conferir.current(false);
    } catch {
      /* navegador sem BroadcastChannel: fica a conferência a cada 5 s */
    }
    // voltou para esta aba (ex.: depois de abrir o e-mail no celular): confere na hora
    const aoVoltar = () => document.visibilityState === "visible" && void conferir.current(false);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(t);
      canal?.close();
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  async function jaVerifiquei() {
    setVerificando(true);
    try {
      await conferir.current(true);
    } finally {
      setVerificando(false);
    }
  }

  return (
    <>
      <Titulo titulo="Confirme seu e-mail">Para proteger a torcida, precisamos confirmar que o e-mail é seu.</Titulo>
      <Cartao className="p-6 sm:p-7 space-y-5">
        <div className="flex items-center gap-4">
          <span className="size-14 shrink-0 rounded-2xl bg-primaria/15 text-primaria-texto grid place-items-center">
            <Icone nome="enviar" className="size-7" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-texto-3">Link enviado para</p>
            <p className="font-semibold break-all">{usuario.email}</p>
          </div>
        </div>
        <ol className="space-y-2 text-sm text-texto-2 list-decimal pl-5">
          <li>Abra o seu e-mail (confira também o spam e as promoções).</li>
          <li>Toque em “Confirmar meu e-mail”.</li>
          <li>Pronto: o cadastro continua de onde parou, lá ou aqui. Esta tela segue sozinha.</li>
        </ol>
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
        <Botao largo tamanho="lg" icone="checkCirculo" carregando={verificando} onClick={jaVerifiquei}>
          Já verifiquei
        </Botao>
        <div className="flex flex-col sm:flex-row gap-2">
          <Botao variante="contorno" className="flex-1" icone="enviar" disabled={espera > 0} onClick={enviar}>
            {espera > 0 ? `Reenviar em ${espera}s` : "Reenviar e-mail"}
          </Botao>
          <Botao variante="fantasma" className="flex-1" icone="sair" onClick={() => void sairApagandoRascunho()}>
            Usar outro e-mail
          </Botao>
        </div>
        <p className="text-xs text-texto-3 flex items-center gap-2">
          <Girando className="size-3.5" /> Aguardando a confirmação…
        </p>
      </Cartao>
    </>
  );
}

// ── (c–f) Formulário ────────────────────────────────────────────
type EstadoSlug = { fase: "vazio" } | { fase: "verificando" } | { fase: "ok" } | { fase: "erro"; motivo: string };

/** Abre o rascunho mais recente (deste navegador ou da conta) antes de mostrar o formulário. */
function Formulario({ usuario }: { usuario: User }) {
  const [inicial, setInicial] = useState<Rascunho | null>(null);
  useEffect(() => {
    let vivo = true;
    const local = lerLocal(usuario.uid);
    // getDoc usa o cache do aparelho quando não há internet; com internet muito lenta, segue com o local
    const remoto = getDoc(refRascunho(usuario.uid))
      .then((snap) => {
        const r = snap.data() as Partial<Rascunho> | undefined;
        return r ? { dados: sanear(r.dados), passo: (Number(r.passo) || 2) as Passo, atualizadoEm: Number(r.atualizadoEm) || 0 } : null;
      })
      .catch(() => null);
    void Promise.race([remoto, new Promise<null>((ok) => setTimeout(() => ok(null), 5000))]).then((r) => {
      if (!vivo) return;
      let escolhido = r && (!local || r.atualizadoEm >= local.atualizadoEm) ? r : local;
      // O CPF não fica no navegador: se o rascunho da conta tem e é o mesmo cadastro, aproveita
      if (escolhido && !escolhido.dados.respCpf && r?.dados.respCpf) escolhido = { ...escolhido, dados: { ...escolhido.dados, respCpf: r.dados.respCpf } };
      const dados = escolhido?.dados ?? VAZIO;
      setInicial({ dados: { ...dados, respNome: dados.respNome || usuario.displayName || "" }, passo: passoSeguro(escolhido?.passo, dados), atualizadoEm: Date.now() });
    });
    return () => {
      vivo = false;
    };
  }, [usuario.uid, usuario.displayName]);
  if (!inicial) return <Carregando texto="Abrindo o seu cadastro…" />;
  return <FormularioTorcida usuario={usuario} inicial={inicial} />;
}

function FormularioTorcida({ usuario, inicial }: { usuario: User; inicial: Rascunho }) {
  const [d, setD] = useState<Dados>(inicial.dados);
  const [passo, setPasso] = useState<Passo>(inicial.passo);
  const [tentou, setTentou] = useState<Record<number, boolean>>({});
  const [slug, setSlug] = useState<EstadoSlug>({ fase: "vazio" });
  const [tentativaSlug, setTentativaSlug] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [declaro, setDeclaro] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  /** Tocou em Continuar enquanto o endereço ainda era conferido: avança sozinho quando a checagem terminar. */
  const [esperandoSlug, setEsperandoSlug] = useState(false);
  const topo = useRef<HTMLDivElement>(null);

  const mudar = <K extends keyof Dados>(k: K, v: Dados[K]) => setD((x) => ({ ...x, [k]: v }));
  const enviado = useRef(false);
  // Cada mudança vai para este navegador na hora e para a conta logo depois (sem internet, o Firestore guarda
  // e envia quando a conexão voltar)
  useEffect(() => {
    if (enviado.current) return;
    const r: Rascunho = { dados: d, passo, atualizadoEm: Date.now() };
    gravarLocal(usuario.uid, r);
    const t = setTimeout(() => {
      if (!enviado.current) void setDoc(refRascunho(usuario.uid), r).catch(() => undefined);
    }, 700);
    return () => clearTimeout(t);
  }, [usuario.uid, d, passo]);
  // Chaves obrigatórias: no Chrome novo scrollIntoView devolve uma Promise, e efeito que devolve algo que não é
  // função derruba a tela na troca de passo ("destroy is not a function"). Ver scripts/checar-efeitos.mjs.
  useEffect(() => {
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [passo]);

  const slugFinal = d.slugEditado ? d.slug : slugDoNome(d.nomeTorcida);

  // checagem do endereço ao vivo (debounce)
  useEffect(() => {
    if (!slugFinal) return setSlug({ fase: "vazio" });
    if (!SLUG_VALIDO.test(slugFinal)) return setSlug({ fase: "erro", motivo: "Use de 3 a 40 letras minúsculas, números e hífen (sem hífen no começo ou no fim)." });
    if (RESERVADOS.has(slugFinal)) return setSlug({ fase: "erro", motivo: "Este endereço é reservado. Escolha outro." });
    setSlug({ fase: "verificando" });
    let vivo = true;
    const t = setTimeout(() => {
      api
        .slugDisponivel({ slug: slugFinal })
        .then((r) => vivo && setSlug(r.disponivel ? { fase: "ok" } : { fase: "erro", motivo: r.motivo ?? "Este endereço já está em uso." }))
        .catch(() => vivo && setSlug({ fase: "erro", motivo: MSG_SLUG_SEM_CONEXAO }));
    }, 450);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [slugFinal, tentativaSlug]);

  const errosTorcida = {
    nome: d.nomeTorcida.trim().length < 2 ? "Informe o nome da torcida." : null,
    slug: slug.fase === "erro" ? slug.motivo : slug.fase === "vazio" ? "Escolha o endereço." : slug.fase === "verificando" ? "Conferindo o endereço…" : null,
    socios: d.estimativaSocios && !/^\d+$/.test(d.estimativaSocios) ? "Só números." : null,
    cores: !d.cores ? "Escolha as cores da torcida (pode ajustar depois)." : null,
  };
  const errosResp = {
    nome: d.respNome.trim().length < 5 || d.respNome.trim().split(/\s+/).length < 2 ? "Nome e sobrenome." : null,
    cpf: !cpfValido(d.respCpf) ? "CPF inválido." : null,
    tel: !telefoneValido(d.respTelefone) ? "Celular com DDD." : null,
    cargo: !d.respCargo.trim() ? "Informe o cargo." : null,
  };
  const errosEnt = {
    tipo: !d.temCnpj ? "Escolha uma opção." : null,
    cnpj: d.temCnpj === "cnpj" && !cnpjValido(d.cnpj) ? "CNPJ inválido." : null,
    razao: d.temCnpj === "cnpj" && d.razaoSocial.trim().length < 3 ? "Informe a razão social." : null,
    emailFin: d.emailFinanceiro.trim() && !emailValido(d.emailFinanceiro) ? "E-mail inválido." : null,
    cep: so(d.cep).length !== 8 ? "CEP inválido." : null,
    logradouro: !d.logradouro.trim() ? "Obrigatório." : null,
    numero: !d.numero.trim() ? "Obrigatório (use S/N se não houver)." : null,
    bairro: !d.bairro.trim() ? "Obrigatório." : null,
    cidade: !d.cidade.trim() ? "Obrigatório." : null,
    uf: !/^[A-Za-z]{2}$/.test(d.uf.trim()) ? "UF" : null,
  };
  const temErro = (o: Record<string, string | null>) => Object.values(o).some(Boolean);
  const errosDoPasso = passo === 2 ? errosTorcida : passo === 3 ? errosResp : passo === 4 ? errosEnt : {};
  const t = !!tentou[passo];

  function avancar(e?: FormEvent) {
    e?.preventDefault();
    setTentou((x) => ({ ...x, [passo]: true }));
    if (passo === 2 && slug.fase === "verificando" && !temErro({ ...errosTorcida, slug: null })) {
      setEsperandoSlug(true);
      return;
    }
    if (temErro(errosDoPasso)) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-erro] input, [aria-invalid=true]")?.focus());
      return;
    }
    if (passo === 2 && !d.slugEditado) mudar("slug", slugFinal);
    setPasso((p) => (p < 5 ? ((p + 1) as Passo) : p));
  }

  useEffect(() => {
    if (!esperandoSlug || slug.fase === "verificando") return;
    setEsperandoSlug(false);
    avancar(); // endereço livre: segue; com erro, avancar mostra o motivo e põe o foco no campo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperandoSlug, slug.fase]);

  const cepPedido = useRef("");
  async function aoMudarCep(v: string) {
    mudar("cep", v);
    cepPedido.current = so(v);
    if (so(v).length !== 8) return setBuscandoCep(false);
    setBuscandoCep(true);
    const r = await buscarCep(v);
    if (cepPedido.current !== so(v)) return; // a pessoa já trocou o CEP: esta resposta é velha
    setBuscandoCep(false);
    if (r)
      setD((x) => ({
        ...x,
        logradouro: r.logradouro || x.logradouro,
        bairro: r.bairro || x.bairro,
        cidade: r.cidade || x.cidade,
        uf: r.uf || x.uf,
      }));
  }

  async function enviar() {
    setErroEnvio(null);
    setEnviando(true);
    try {
      await api.solicitarTorcida({
        nomeTorcida: d.nomeTorcida.trim(),
        slug: slugFinal,
        clube: d.clube.trim() || undefined,
        estimativaSocios: Number(d.estimativaSocios || 0),
        quantidadeSubsedes: Number(d.quantidadeSubsedes || 0),
        tema: d.cores ?? undefined,
        responsavel: { nome: d.respNome.trim(), cpf: so(d.respCpf), telefone: so(d.respTelefone), cargo: d.respCargo.trim() },
        entidade:
          d.temCnpj === "cnpj"
            ? { tipo: "cnpj", cnpj: so(d.cnpj), razaoSocial: d.razaoSocial.trim(), emailFinanceiro: d.emailFinanceiro.trim() || undefined }
            : { tipo: "sem_cnpj", emailFinanceiro: d.emailFinanceiro.trim() || undefined },
        endereco: {
          cep: so(d.cep),
          logradouro: d.logradouro.trim(),
          numero: d.numero.trim(),
          complemento: d.complemento.trim() || undefined,
          bairro: d.bairro.trim(),
          cidade: d.cidade.trim(),
          uf: d.uf.trim().toUpperCase(),
        },
      });
      enviado.current = true; // o servidor já apagou o rascunho da conta junto com o envio
      gravarLocal(usuario.uid, null);
      // a tela "Em análise" aparece sozinha quando a solicitação chega pelo tempo real
    } catch (e) {
      const msg = mensagemDeErro(e);
      setErroEnvio(msg);
      if (/endereço/i.test(msg)) {
        setPasso(2);
        setSlug({ fase: "erro", motivo: msg });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div ref={topo} className="scroll-mt-4">
      <div className="mb-6">
        <Etapas etapas={ETAPAS} atual={passo} />
      </div>

      {passo === 2 && (
        <form onSubmit={avancar} noValidate>
          <Titulo titulo="Sua torcida">Como a torcida é conhecida e qual vai ser o endereço do site.</Titulo>
          <Cartao className="p-6 sm:p-7 space-y-5">
            <Campo
              rotulo="Nome da torcida"
              value={d.nomeTorcida}
              onChange={(v) => mudar("nomeTorcida", v)}
              placeholder="Ex.: Fúria Jovem"
              erro={t && errosTorcida.nome}
              autoFocus={focoAutomatico()}
              maxLength={80}
            />
            <Campo rotulo="Clube que a torcida apoia" value={d.clube} onChange={(v) => mudar("clube", v)} placeholder="Ex.: Esporte Clube Bahia" maxLength={80} dica="Opcional." />
            <div>
              <label htmlFor="cad-slug" className="block text-sm font-medium text-texto-2 mb-1.5">
                Endereço do site
              </label>
              <div
                className={cx(
                  "flex items-center h-12 rounded-2xl bg-superficie-2 border px-4 text-[15px] transition-colors focus-within:border-primaria",
                  slug.fase === "erro" && (t || d.slugEditado) ? "border-perigo" : "border-linha",
                )}
              >
                <span className="text-texto-3 shrink-0 hidden min-[400px]:inline">{DOMINIO}</span>
                <span className="text-texto-3 shrink-0 min-[400px]:hidden">…/</span>
                <input
                  id="cad-slug"
                  value={slugFinal}
                  onChange={(e) => {
                    mudar("slugEditado", true);
                    mudar("slug", e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40));
                  }}
                  aria-invalid={slug.fase === "erro"}
                  aria-describedby="cad-slug-status"
                  placeholder="nome-da-torcida"
                  className="flex-1 min-w-0 bg-transparent outline-none font-semibold"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <span className="shrink-0 ml-2" aria-hidden="true">
                  {slug.fase === "verificando" && <Girando className="size-4 text-texto-3" />}
                  {slug.fase === "ok" && <Icone nome="checkCirculo" className="size-5 text-sucesso" />}
                  {slug.fase === "erro" && <Icone nome="xCirculo" className="size-5 text-perigo" />}
                </span>
              </div>
              <p id="cad-slug-status" className={cx("text-xs mt-1.5", slug.fase === "ok" ? "text-sucesso" : slug.fase === "erro" ? "text-perigo" : "text-texto-3")} aria-live="polite">
                {slug.fase === "ok"
                  ? `Disponível: ${DOMINIO}${slugFinal}`
                  : slug.fase === "erro"
                    ? slug.motivo
                    : slug.fase === "verificando"
                      ? "Conferindo se está livre…"
                      : "Geramos a partir do nome. Você pode ajustar."}
              </p>
              {slug.fase === "erro" && slug.motivo === MSG_SLUG_SEM_CONEXAO && (
                <Botao variante="contorno" tamanho="sm" icone="atualizar" className="mt-2" onClick={() => setTentativaSlug((n) => n + 1)}>
                  Conferir de novo
                </Botao>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo
                rotulo="Sócios (estimativa)"
                inputMode="numeric"
                value={d.estimativaSocios}
                onChange={(v) => mudar("estimativaSocios", v.replace(/\D/g, "").slice(0, 7))}
                placeholder="Ex.: 300"
                erro={t && errosTorcida.socios}
              />
              <Campo
                rotulo="Subsedes"
                inputMode="numeric"
                value={d.quantidadeSubsedes}
                onChange={(v) => mudar("quantidadeSubsedes", v.replace(/\D/g, "").slice(0, 3))}
                placeholder="Ex.: 4"
                dica="0 se for só a sede."
              />
            </div>
            <CoresCadastro cores={d.cores} onChange={(c) => mudar("cores", c)} erro={t && errosTorcida.cores} />
          </Cartao>
          <Navegacao conferindo={esperandoSlug} />
        </form>
      )}

      {passo === 3 && (
        <form onSubmit={avancar} noValidate>
          <Titulo titulo="Responsável">Quem responde pela torcida perante a Somos Organizada.</Titulo>
          <Cartao className="p-6 sm:p-7 space-y-5">
            <Campo rotulo="Nome completo" autoComplete="name" value={d.respNome} onChange={(v) => mudar("respNome", v)} erro={t && errosResp.nome} autoFocus={focoAutomatico()} maxLength={64} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="CPF" mascara="cpf" value={d.respCpf} onChange={(v) => mudar("respCpf", v)} erro={t && errosResp.cpf} placeholder="000.000.000-00" />
              <Campo
                rotulo="Celular (WhatsApp)"
                mascara="telefone"
                autoComplete="tel-national"
                value={d.respTelefone}
                onChange={(v) => mudar("respTelefone", v)}
                erro={t && errosResp.tel}
                placeholder="(71) 99999-9999"
              />
            </div>
            <Campo
              rotulo="Cargo na torcida"
              value={d.respCargo}
              onChange={(v) => mudar("respCargo", v)}
              erro={t && errosResp.cargo}
              list="cad-cargos"
              placeholder="Ex.: Presidente"
              maxLength={40}
            />
            <datalist id="cad-cargos">
              {["Presidente", "Vice-presidente", "Diretor", "Diretor financeiro", "Tesoureiro", "Secretário"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-xs text-texto-3 flex gap-2">
              <Icone nome="cadeado" className="size-4 shrink-0" /> O CPF é usado só para confirmar quem é o responsável e não aparece no site.
            </p>
          </Cartao>
          <Navegacao voltar={() => setPasso(2)} />
        </form>
      )}

      {passo === 4 && (
        <form onSubmit={avancar} noValidate>
          <Titulo titulo="Entidade e endereço">Dados da associação da torcida e endereço da sede.</Titulo>
          <Cartao className="p-6 sm:p-7 space-y-5">
            <div>
              <p className="text-sm font-medium text-texto-2 mb-2">A torcida tem CNPJ?</p>
              <OpcoesCartao<"cnpj" | "sem_cnpj">
                nome="A torcida tem CNPJ?"
                valor={d.temCnpj}
                onChange={(v) => mudar("temCnpj", v)}
                opcoes={[
                  { valor: "cnpj", titulo: "Tem CNPJ", descricao: "Associação registrada.", icone: "escudo" },
                  { valor: "sem_cnpj", titulo: "Ainda sem CNPJ", descricao: "Tudo bem, dá para começar assim.", icone: "usuarios" },
                ]}
              />
              {t && errosEnt.tipo && <p className="text-xs text-perigo mt-1.5">{errosEnt.tipo}</p>}
            </div>
            {d.temCnpj === "cnpj" && (
              <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                <Campo
                  rotulo="CNPJ"
                  inputMode="numeric"
                  value={d.cnpj}
                  onChange={(v) => mudar("cnpj", mascaraCnpj(v))}
                  erro={t && errosEnt.cnpj}
                  placeholder="00.000.000/0000-00"
                />
                <Campo rotulo="Razão social" value={d.razaoSocial} onChange={(v) => mudar("razaoSocial", v)} erro={t && errosEnt.razao} maxLength={120} />
              </div>
            )}
            <Campo
              rotulo="E-mail financeiro"
              type="email"
              value={d.emailFinanceiro}
              onChange={(v) => mudar("emailFinanceiro", v)}
              erro={t && errosEnt.emailFin}
              placeholder={usuario.email ?? ""}
              dica="Para avisos de mensalidade. Se deixar vazio, usamos o seu e-mail."
            />
            <div className="pt-1 space-y-4">
              <p className="text-sm font-semibold">Endereço da sede</p>
              <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[200px_1fr] gap-4 items-start">
                <Campo
                  rotulo="CEP"
                  mascara="cep"
                  autoComplete="postal-code"
                  value={d.cep}
                  onChange={(v) => void aoMudarCep(v)}
                  erro={t && errosEnt.cep}
                  placeholder="00000-000"
                  sufixo={buscandoCep ? <Girando className="size-4 text-texto-3 mr-2" /> : undefined}
                />
                <a
                  href="https://buscacepinter.correios.com.br/"
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-11 inline-flex items-center text-xs text-texto-3 underline mt-6 sm:justify-self-start"
                >
                  Não sei o CEP
                </a>
              </div>
              <Campo rotulo="Rua / avenida" autoComplete="address-line1" value={d.logradouro} onChange={(v) => mudar("logradouro", v)} erro={t && errosEnt.logradouro} maxLength={120} />
              <div className="grid grid-cols-[110px_1fr] gap-4">
                <Campo rotulo="Número" value={d.numero} onChange={(v) => mudar("numero", v)} erro={t && errosEnt.numero} maxLength={12} />
                <Campo rotulo="Complemento" autoComplete="address-line2" value={d.complemento} onChange={(v) => mudar("complemento", v)} maxLength={60} dica="Opcional." />
              </div>
              <Campo rotulo="Bairro" autoComplete="address-level3" value={d.bairro} onChange={(v) => mudar("bairro", v)} erro={t && errosEnt.bairro} maxLength={80} />
              <div className="grid grid-cols-[1fr_90px] gap-4">
                <Campo rotulo="Cidade" autoComplete="address-level2" value={d.cidade} onChange={(v) => mudar("cidade", v)} erro={t && errosEnt.cidade} maxLength={64} />
                <Campo rotulo="UF" autoComplete="address-level1" value={d.uf} onChange={(v) => mudar("uf", v.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase())} erro={t && errosEnt.uf} placeholder="BA" />
              </div>
            </div>
          </Cartao>
          <Navegacao voltar={() => setPasso(3)} />
        </form>
      )}

      {passo === 5 && (
        <div>
          <Titulo titulo="Revise e envie">Confira tudo. Depois de enviar, a equipe analisa e você acompanha por aqui.</Titulo>
          <div className="space-y-4">
            <Resumo titulo="Torcida" editar={() => setPasso(2)}>
              <Linha r="Nome" v={d.nomeTorcida} />
              <Linha r="Clube" v={d.clube || "—"} />
              <Linha r="Endereço" v={`${DOMINIO}${slugFinal}`} />
              <Linha r="Sócios (estimativa)" v={d.estimativaSocios || "0"} />
              <Linha r="Subsedes" v={d.quantidadeSubsedes || "0"} />
              {d.cores && (
                <Linha
                  r="Cores"
                  v={
                    <span className="inline-flex gap-1 align-middle">
                      {[d.cores.corPrimaria, d.cores.corSecundaria, d.cores.corFundo].map((c, i) => (
                        <span key={i} className="size-4 rounded-full border border-linha-forte" style={{ background: c }} />
                      ))}
                    </span>
                  }
                />
              )}
            </Resumo>
            <Resumo titulo="Responsável" editar={() => setPasso(3)}>
              <Linha r="Nome" v={d.respNome} />
              <Linha r="CPF" v={mascaraCpf(d.respCpf)} />
              <Linha r="Celular" v={mascaraTelefone(d.respTelefone)} />
              <Linha r="Cargo" v={d.respCargo} />
              <Linha r="Login" v={usuario.email ?? ""} />
            </Resumo>
            <Resumo titulo="Entidade e endereço" editar={() => setPasso(4)}>
              <Linha r="CNPJ" v={d.temCnpj === "cnpj" ? `${mascaraCnpj(d.cnpj)} · ${d.razaoSocial}` : "Ainda sem CNPJ"} />
              <Linha r="E-mail financeiro" v={d.emailFinanceiro || usuario.email || ""} />
              <Linha
                r="Endereço"
                v={`${d.logradouro}, ${d.numero}${d.complemento ? `, ${d.complemento}` : ""} · ${d.bairro} · ${d.cidade}/${d.uf} · ${mascaraCep(d.cep)}`}
              />
            </Resumo>
            <Cartao className="p-5 space-y-3 text-sm">
              <p className="font-semibold">Como funciona a cobrança</p>
              <ul className="space-y-1.5 text-texto-2">
                <li className="flex gap-2">
                  <Icone nome="check" className="size-4 text-primaria-texto shrink-0 mt-0.5" /> Nada é cobrado até você publicar o site.
                </li>
                <li className="flex gap-2">
                  <Icone nome="check" className="size-4 text-primaria-texto shrink-0 mt-0.5" /> Mensalidade fixa, paga só no Pix, sem multa nem juros.
                </li>
                <li className="flex gap-2">
                  <Icone nome="check" className="size-4 text-primaria-texto shrink-0 mt-0.5" /> O dinheiro de ingressos e sócios cai direto na conta da torcida.
                </li>
              </ul>
              <label className="flex gap-3 items-start pt-2 min-h-11 cursor-pointer">
                <input type="checkbox" checked={declaro} onChange={(e) => setDeclaro(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-primaria)]" />
                <span>Declaro que represento esta torcida e que os dados acima são verdadeiros.</span>
              </label>
            </Cartao>
            {erroEnvio && <Aviso tom="perigo">{erroEnvio}</Aviso>}
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Botao variante="contorno" icone="setaEsquerda" onClick={() => setPasso(4)}>
                Voltar
              </Botao>
              <Botao
                className="sm:flex-1"
                tamanho="lg"
                icone="enviar"
                disabled={!declaro}
                carregando={enviando}
                onClick={enviar}
                aria-describedby={!declaro ? "cad-dica-declaracao" : undefined}
              >
                Enviar e marcar a chamada
              </Botao>
            </div>
            {!declaro && (
              <p id="cad-dica-declaracao" className="text-sm text-texto-2 text-center">
                Marque a declaração acima para enviar.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

}

function Navegacao({ voltar, conferindo }: { voltar?: () => void; conferindo?: boolean }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5">
      {voltar && (
        <Botao variante="contorno" icone="setaEsquerda" onClick={voltar}>
          Voltar
        </Botao>
      )}
      <Botao type="submit" tamanho="lg" className="sm:flex-1" iconeDireita={conferindo ? undefined : "setaDireita"} carregando={conferindo}>
        {conferindo ? "Conferindo o endereço…" : "Continuar"}
      </Botao>
    </div>
  );
}

function Resumo({ titulo, editar, children }: { titulo: string; editar: () => void; children: ReactNode }) {
  return (
    <Cartao className="p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">{titulo}</h2>
        <button type="button" onClick={editar} aria-label={`Editar ${titulo.toLowerCase()}`} className="min-h-11 -mr-2 px-2 text-sm text-primaria-texto font-semibold inline-flex items-center gap-1 hover:underline">
          <Icone nome="lapis" className="size-4" /> Editar
        </button>
      </div>
      <dl className="divide-y divide-linha text-sm">{children}</dl>
    </Cartao>
  );
}
function Linha({ r, v }: { r: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-texto-3 shrink-0">{r}</dt>
      <dd className="text-right min-w-0 break-words">{v}</dd>
    </div>
  );
}

// ── (g) Em análise / aprovada / recusada ────────────────────────
function EmAnalise({ s, aoRecomecar }: { s: ComId<SolicitacaoTorcida>; aoRecomecar: () => void }) {
  const [remarcando, setRemarcando] = useState(false);
  const contato = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Olá! Sobre o cadastro da ${s.nomeTorcida} (/${s.slug}).`)}`;

  if (s.status === "aprovada") {
    return (
      <Cartao className="p-6 sm:p-8 text-center animate-surgir">
        <span className="mx-auto size-16 rounded-3xl bg-sucesso/15 text-sucesso grid place-items-center">
          <Icone nome="checkCirculo" className="size-9" />
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold mt-5">{s.nomeTorcida} aprovada!</h1>
        <p className="text-texto-2 mt-2 max-w-md mx-auto">
          O painel da torcida já está liberado para <strong className="text-texto">{s.email}</strong>. Entre com esta mesma conta, sem senha nova.
        </p>
        <BotaoLink to={`/${s.slug}/admin`} tamanho="lg" largo className="mt-7" iconeDireita="setaDireita">
          Entrar no painel da torcida
        </BotaoLink>
        <ol className="text-left text-sm text-texto-2 mt-7 space-y-2 max-w-md mx-auto">
          <PassoLista n={1}>Configure a conta Pagar.me da torcida (o dinheiro cai direto nela).</PassoLista>
          <PassoLista n={2}>Cadastre eventos, planos de sócio e as subsedes.</PassoLista>
          <PassoLista n={3}>Publique o site e escolha o plano. A 1ª mensalidade vence 7 dias depois.</PassoLista>
        </ol>
        <p className="text-xs text-texto-3 mt-6">Endereço: {DOMINIO}{s.slug}</p>
      </Cartao>
    );
  }

  if (s.status === "recusada") {
    return (
      <Cartao className="p-6 sm:p-8 animate-surgir">
        <span className="size-14 rounded-2xl bg-perigo/12 text-perigo grid place-items-center">
          <Icone nome="xCirculo" className="size-8" />
        </span>
        <h1 className="text-2xl font-bold mt-5">Cadastro não aprovado</h1>
        <p className="text-texto-2 mt-1">
          {s.nomeTorcida} · {DOMINIO}
          {s.slug}
        </p>
        <Aviso tom="perigo" titulo="Motivo informado pela equipe" className="mt-5">
          {s.motivo || "Sem motivo informado."}
        </Aviso>
        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <a
            href={contato}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl font-semibold border border-linha-forte hover:bg-superficie-2 sm:flex-1"
          >
            <Icone nome="whatsapp" className="size-5" /> Falar com a equipe
          </a>
          <Botao className="sm:flex-1" icone="atualizar" onClick={aoRecomecar}>
            Fazer novo cadastro
          </Botao>
        </div>
      </Cartao>
    );
  }

  if (remarcando) return <PassoVideo s={s} remarcando aoCancelar={() => setRemarcando(false)} />;

  return (
    <Cartao className="p-6 sm:p-8 animate-surgir">
      <div className="flex items-center gap-4">
        <span className="relative size-14 shrink-0 rounded-2xl bg-alerta/12 text-alerta grid place-items-center">
          <Icone nome="relogio" className="size-8" />
          <span className="absolute -top-1 -right-1 size-3 rounded-full bg-alerta animate-pulse" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Cadastro em análise</h1>
          <p className="text-texto-2 text-sm">Enviado em {dataHora(s.criadoEm)}</p>
        </div>
      </div>
      <dl className="mt-6 rounded-2xl border border-linha divide-y divide-linha text-sm">
        <div className="flex justify-between gap-3 px-4 py-3">
          <dt className="text-texto-3">Torcida</dt>
          <dd className="font-semibold text-right">{s.nomeTorcida}</dd>
        </div>
        <div className="flex justify-between gap-3 px-4 py-3">
          <dt className="text-texto-3">Endereço reservado</dt>
          <dd className="font-semibold text-right break-all">
            {DOMINIO}
            {s.slug}
          </dd>
        </div>
        <div className="flex justify-between gap-3 px-4 py-3">
          <dt className="text-texto-3">Login</dt>
          <dd className="text-right break-all">{s.email}</dd>
        </div>
      </dl>
      <CartaoChamada s={s} aoRemarcar={() => setRemarcando(true)} />
      <h2 className="font-semibold mt-6">O que acontece agora</h2>
      <ol className="text-sm text-texto-2 mt-3 space-y-2">
        <PassoLista n={1}>Na hora marcada, a equipe faz a chamada de vídeo com você na sede, com as testemunhas. Leva de 2 a 5 minutos.</PassoLista>
        <PassoLista n={2}>A equipe confere os dados e aprova, normalmente em até 1 dia útil depois da chamada. Esta página muda sozinha e você recebe um e-mail.</PassoLista>
        <PassoLista n={3}>Você entra com este mesmo e-mail e senha. Pode fechar a página e voltar depois em {location.host}/cadastro.</PassoLista>
      </ol>
      <a href={contato} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-primaria-texto hover:underline">
        <Icone nome="whatsapp" className="size-4" /> Tem pressa? Fale com a equipe
      </a>
    </Cartao>
  );
}

function PassoLista({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="size-6 shrink-0 rounded-full bg-superficie-3 text-texto text-xs font-bold grid place-items-center">{n}</span>
      <span>{children}</span>
    </li>
  );
}
