import { useState, type FormEvent, type ReactNode } from "react";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { emailValido } from "@/lib/formatos";
import { Aviso, Botao, Campo, Cartao } from "@/ui";

function traduzir(codigo: string): string {
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(codigo)) return "E-mail ou senha incorretos.";
  if (/too-many-requests/.test(codigo)) return "Muitas tentativas. Aguarde alguns minutos.";
  if (/network/.test(codigo)) return "Sem conexão. Verifique sua internet.";
  return "Não foi possível entrar. Tente novamente.";
}

/** Formulário de login reutilizado (sócio, diretoria, plataforma). */
export function Login({ titulo, subtitulo, rodape, extra }: { titulo: string; subtitulo?: ReactNode; rodape?: ReactNode; extra?: ReactNode }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!emailValido(email)) return setErro("Informe um e-mail válido.");
    setCarregando(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
    } catch (err) {
      setErro(traduzir(String((err as { code?: string }).code ?? err)));
    } finally {
      setCarregando(false);
    }
  }

  async function esqueci() {
    setErro(null);
    if (!emailValido(email)) return setErro("Digite seu e-mail acima para receber o link.");
    try {
      await sendPasswordResetEmail(auth, email.trim(), { url: `${location.origin}${location.pathname}` });
      setAviso("Enviamos um link para redefinir sua senha. Confira também o spam.");
    } catch {
      setAviso("Se este e-mail estiver cadastrado, você receberá o link em instantes.");
    }
  }

  return (
    <Cartao className="w-full max-w-md p-7 sm:p-8 animate-surgir">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      {subtitulo && <p className="text-texto-2 mt-1">{subtitulo}</p>}
      <form onSubmit={entrar} className="mt-6 space-y-4" noValidate>
        <Campo rotulo="E-mail" type="email" autoComplete="email" icone="usuario" value={email} onChange={setEmail} />
        <Campo rotulo="Senha" type="password" autoComplete="current-password" icone="cadeado" value={senha} onChange={setSenha} />
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
        {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
        <Botao type="submit" largo tamanho="lg" carregando={carregando}>
          Entrar
        </Botao>
        <button type="button" onClick={esqueci} className="w-full text-sm text-texto-2 hover:text-texto py-1">
          Esqueci minha senha
        </button>
      </form>
      {extra}
      {rodape && <div className="mt-6 pt-5 border-t border-linha text-sm text-texto-2 text-center">{rodape}</div>}
    </Cartao>
  );
}
