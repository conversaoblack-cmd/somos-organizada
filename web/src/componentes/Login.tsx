import { useState, type FormEvent, type ReactNode } from "react";
import { enviarConfirmacaoEmail, enviarRedefinicaoSenha } from "@/lib/emailsConta";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { emailValido, soDigitos } from "@/lib/formatos";
import { api, ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import { Aviso, Botao, Campo, Cartao, Girando } from "@/ui";
import { useTorcidaOpcional } from "@/hooks/torcida";

/** Erro do login em português: credencial errada tem frase própria; o resto vem de mensagemDeErro. */
function erroDeLogin(err: unknown): string {
  const codigo = String((err as { code?: string })?.code ?? "");
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(codigo)) return "E-mail ou senha incorretos.";
  return mensagemDeErro(err);
}

/** Olho que mostra ou esconde a senha (no celular é fácil errar uma letra sem ver). Vai no `sufixo` do Campo. */
export function BotaoVerSenha({ visivel, alternar }: { visivel: boolean; alternar: () => void }) {
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
      aria-pressed={visivel}
      className="size-11 grid place-items-center rounded-xl text-texto-3 hover:text-texto hover:bg-superficie-3"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        {visivel && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}

/** Formulário de login reutilizado. Com `permitirCadastro`, oferece também "Criar conta" (envia verificação de e-mail). */
export function Login({
  titulo,
  subtitulo,
  rodape,
  extra,
  permitirCadastro,
  aceitaCpf,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  rodape?: ReactNode;
  extra?: ReactNode;
  permitirCadastro?: boolean;
  /** Torcedor pode entrar com CPF no lugar do e-mail. */
  aceitaCpf?: boolean;
}) {
  const tid = useTorcidaOpcional()?.tid;
  const [criando, setCriando] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviandoLink, setEnviandoLink] = useState(false);
  const usaCpf = !!aceitaCpf && !criando;
  /** O que foi digitado é um CPF (sem "@" e com números)? */
  const cpfDigitado = usaCpf && !email.includes("@") ? soDigitos(email) : "";

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    if (cpfDigitado) {
      if (cpfDigitado.length !== 11) return setErro("CPF incompleto: são 11 números.");
      if (!senha) return setErro("Digite sua senha.");
      setCarregando(true);
      try {
        const r = await api.entrarComCpf({ cpf: cpfDigitado, senha });
        await signInWithEmailAndPassword(auth, r.email, senha);
      } catch (err) {
        setErro(erroDeLogin(err));
      } finally {
        setCarregando(false);
      }
      return;
    }
    if (!emailValido(email)) return setErro(usaCpf ? "Informe seu CPF ou e-mail." : "Informe um e-mail válido.");
    if (!senha) return setErro("Digite sua senha.");
    if (criando && senha.length < 8) return setErro("Senha fraca: use pelo menos 8 caracteres.");
    setCarregando(true);
    try {
      if (criando) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
        await enviarConfirmacaoEmail(cred.user, location.href).catch(() => undefined);
        return;
      }
      await signInWithEmailAndPassword(auth, email.trim(), senha);
    } catch (err) {
      setErro(erroDeLogin(err));
    } finally {
      setCarregando(false);
    }
  }

  async function esqueci() {
    if (enviandoLink) return;
    setErro(null);
    setAviso(null);
    if (cpfDigitado) {
      if (cpfDigitado.length !== 11) return setErro("CPF incompleto: são 11 números.");
      setEnviandoLink(true);
      try {
        await api.redefinirSenhaPorCpf({ tid, cpf: cpfDigitado });
        setAviso("Se este CPF tiver conta, enviamos o link para o e-mail cadastrado. Confira também o spam e as promoções.");
      } catch (err) {
        setErro(mensagemDeErro(err));
      } finally {
        setEnviandoLink(false);
      }
      return;
    }
    if (!emailValido(email)) return setErro(usaCpf ? "Digite seu CPF ou e-mail acima para receber o link." : "Digite seu e-mail acima para receber o link.");
    setEnviandoLink(true);
    try {
      await enviarRedefinicaoSenha(email.trim(), `${location.origin}${location.pathname}`);
      setAviso("Enviamos um link para redefinir sua senha. Confira também o spam.");
    } catch (e) {
      // Falha de rede ou excesso de tentativas é erro de verdade; e-mail sem conta segue com a mesma resposta (não revelamos quem tem conta)
      if (ehErroDeConexao(e) || /too-many-requests|quota/.test(String((e as { code?: string })?.code))) setErro(mensagemDeErro(e));
      else setAviso("Se este e-mail estiver cadastrado, você receberá o link em instantes.");
    } finally {
      setEnviandoLink(false);
    }
  }

  return (
    <Cartao className="w-full max-w-md p-7 sm:p-8 animate-surgir">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      {subtitulo && <p className="text-texto-2 mt-1">{subtitulo}</p>}
      <form onSubmit={entrar} className="mt-6 space-y-4" noValidate>
        <Campo
          rotulo={usaCpf ? "CPF ou e-mail" : "E-mail"}
          type={usaCpf ? "text" : "email"}
          autoComplete={usaCpf ? "username" : "email"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          icone="usuario"
          value={email}
          onChange={setEmail}
        />
        <Campo
          rotulo="Senha"
          type={verSenha ? "text" : "password"}
          autoComplete={criando ? "new-password" : "current-password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          icone="cadeado"
          value={senha}
          onChange={setSenha}
          sufixo={<BotaoVerSenha visivel={verSenha} alternar={() => setVerSenha((v) => !v)} />}
        />
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
        {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
        <Botao type="submit" largo tamanho="lg" carregando={carregando}>
          {criando ? "Criar conta" : "Entrar"}
        </Botao>
        {!criando && (
          <button
            type="button"
            onClick={esqueci}
            disabled={enviandoLink}
            aria-busy={enviandoLink}
            className="w-full min-h-11 inline-flex items-center justify-center gap-2 text-sm text-texto-2 hover:text-texto disabled:opacity-70"
          >
            {enviandoLink && <Girando className="size-4" />}
            {enviandoLink ? "Enviando o link…" : "Esqueci minha senha"}
          </button>
        )}
        {permitirCadastro && (
          <button
            type="button"
            onClick={() => {
              setCriando(!criando);
              setErro(null);
              setAviso(null);
            }}
            className="w-full min-h-11 text-sm font-semibold text-primaria-texto"
          >
            {criando ? "Já tenho conta: entrar" : "Primeiro acesso? Criar conta"}
          </button>
        )}
      </form>
      {extra}
      {rodape && <div className="mt-6 pt-5 border-t border-linha text-sm text-texto-2 text-center">{rodape}</div>}
    </Cartao>
  );
}
