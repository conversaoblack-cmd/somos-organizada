import { useState, type FormEvent, type ReactNode } from "react";
import { enviarConfirmacaoEmail, enviarRedefinicaoSenha } from "@/lib/emailsConta";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { emailValido, soDigitos } from "@/lib/formatos";
import { api, ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import { Aviso, Botao, Campo, Cartao } from "@/ui";

function traduzir(codigo: string): string {
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(codigo)) return "E-mail ou senha incorretos.";
  if (/too-many-requests/.test(codigo)) return "Muitas tentativas. Aguarde alguns minutos.";
  if (/network/.test(codigo)) return "Sem conexão. Verifique sua internet.";
  if (/email-already-in-use/.test(codigo)) return "Este e-mail já tem conta. Use Entrar.";
  if (/weak-password/.test(codigo)) return "Senha fraca: use pelo menos 8 caracteres.";
  return "Não foi possível entrar. Tente novamente.";
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
  const [criando, setCriando] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const cpf = aceitaCpf && !criando && !email.includes("@") ? soDigitos(email) : "";
    if (cpf) {
      if (cpf.length !== 11) return setErro("CPF incompleto: são 11 números.");
      if (!senha) return setErro("Digite sua senha.");
      setCarregando(true);
      try {
        const r = await api.entrarComCpf({ cpf, senha });
        await signInWithEmailAndPassword(auth, r.email, senha);
      } catch (err) {
        setErro((err as { code?: string }).code?.startsWith("auth/") ? traduzir(String((err as { code?: string }).code)) : mensagemDeErro(err));
      } finally {
        setCarregando(false);
      }
      return;
    }
    if (!emailValido(email)) return setErro(aceitaCpf ? "Informe seu CPF ou e-mail." : "Informe um e-mail válido.");
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
      setErro(traduzir(String((err as { code?: string }).code ?? err)));
    } finally {
      setCarregando(false);
    }
  }

  async function esqueci() {
    setErro(null);
    if (!emailValido(email)) return setErro(aceitaCpf && !email.includes("@") && email ? "Para redefinir a senha, digite o seu e-mail (não o CPF)." : "Digite seu e-mail acima para receber o link.");
    setAviso(null);
    try {
      await enviarRedefinicaoSenha(email.trim(), `${location.origin}${location.pathname}`);
      setAviso("Enviamos um link para redefinir sua senha. Confira também o spam.");
    } catch (e) {
      // Falha de rede ou excesso de tentativas é erro de verdade; e-mail sem conta segue com a mesma resposta (não revelamos quem tem conta)
      if (ehErroDeConexao(e) || /too-many-requests|quota/.test(String((e as { code?: string })?.code))) setErro(mensagemDeErro(e));
      else setAviso("Se este e-mail estiver cadastrado, você receberá o link em instantes.");
    }
  }

  return (
    <Cartao className="w-full max-w-md p-7 sm:p-8 animate-surgir">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      {subtitulo && <p className="text-texto-2 mt-1">{subtitulo}</p>}
      <form onSubmit={entrar} className="mt-6 space-y-4" noValidate>
        <Campo
          rotulo={aceitaCpf && !criando ? "CPF ou e-mail" : "E-mail"}
          type={aceitaCpf && !criando ? "text" : "email"}
          autoComplete={aceitaCpf && !criando ? "username" : "email"}
          icone="usuario"
          value={email}
          onChange={setEmail}
        />
        <Campo rotulo="Senha" type="password" autoComplete={criando ? "new-password" : "current-password"} icone="cadeado" value={senha} onChange={setSenha} />
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
        {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
        <Botao type="submit" largo tamanho="lg" carregando={carregando}>
          {criando ? "Criar conta" : "Entrar"}
        </Botao>
        {!criando && (
          <button type="button" onClick={esqueci} className="w-full text-sm text-texto-2 hover:text-texto py-1">
            Esqueci minha senha
          </button>
        )}
        {permitirCadastro && (
          <button type="button" onClick={() => { setCriando(!criando); setErro(null); }} className="w-full text-sm font-semibold text-primaria-texto py-1">
            {criando ? "Já tenho conta: entrar" : "Primeiro acesso? Criar conta"}
          </button>
        )}
      </form>
      {extra}
      {rodape && <div className="mt-6 pt-5 border-t border-linha text-sm text-texto-2 text-center">{rodape}</div>}
    </Cartao>
  );
}
