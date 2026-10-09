/**
 * Destino do botão "Criar nova senha" do e-mail (somosorganizada.com.br/redefinir-senha?oobCode=...&continuar=/torcida/conta).
 * Confere o código, mostra para qual e-mail é, a pessoa escolhe a senha e já entra, voltando para onde estava.
 * Com as cores da torcida quando o pedido veio do site dela. Link vencido ou usado: pede outro ali mesmo.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { confirmPasswordReset, signInWithEmailAndPassword, signOut, verifyPasswordResetCode } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { aplicarTema, TEMA_PAINEL, temaDoPainel } from "@/lib/tema";
import { enviarRedefinicaoSenha } from "@/lib/emailsConta";
import { ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import { emailValido } from "@/lib/formatos";
import type { Tema } from "@/lib/tipos";
import { BotaoVerSenha } from "@/componentes/Login";
import { Aviso, Botao, Campo, Cartao, Girando, Icone } from "@/ui";

type Estado = { fase: "conferindo" } | { fase: "pronto"; email: string } | { fase: "vencido" } | { fase: "sem_internet" };

/** Só caminhos deste site: o link do e-mail nunca leva para fora. */
const caminhoSeguro = (v: string | null) => (v && /^\/[A-Za-z0-9/_?=&.-]{0,120}$/.test(v) && !v.startsWith("//") ? v : "/entrar");

export default function RedefinirSenha() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const codigo = params.get("oobCode") ?? "";
  const continuar = caminhoSeguro(params.get("continuar"));
  const [estado, setEstado] = useState<Estado>({ fase: "conferindo" });
  const [marca, setMarca] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [emailNovo, setEmailNovo] = useState("");
  const [pedido, setPedido] = useState<{ enviando: boolean; texto?: string; erro?: boolean }>({ enviando: false });

  // Cores e nome da torcida quando o link volta para o site dela (/{torcida}/...)
  useEffect(() => {
    aplicarTema(TEMA_PAINEL);
    document.title = "Nova senha · Somos Organizada";
    const slug = /^\/([a-z0-9-]{3,40})(\/|$)/.exec(continuar)?.[1];
    if (!slug || ["entrar", "cadastro", "plataforma", "convite", "verificar"].includes(slug)) return;
    let ativo = true;
    getDoc(doc(db, "slugs", slug))
      .then((s) => (s.get("torcidaId") ? getDoc(doc(db, "torcidas", s.get("torcidaId") as string)) : null))
      .then((t) => {
        if (!ativo || !t?.exists()) return;
        aplicarTema(temaDoPainel(t.get("tema") as Partial<Tema> | undefined));
        setMarca(t.get("nome") as string);
        document.title = `Nova senha · ${t.get("nome") as string}`;
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [continuar]);

  async function conferir() {
    setEstado({ fase: "conferindo" });
    try {
      if (!codigo) throw Object.assign(new Error("sem código"), { code: "auth/invalid-action-code" });
      setEstado({ fase: "pronto", email: await verifyPasswordResetCode(auth, codigo) });
    } catch (e) {
      setEstado(ehErroDeConexao(e) ? { fase: "sem_internet" } : { fase: "vencido" });
    }
  }
  useEffect(() => {
    void conferir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (estado.fase !== "pronto") return;
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    setErro(null);
    setSalvando(true);
    try {
      await confirmPasswordReset(auth, codigo, senha);
      // outra conta aberta neste navegador: sai dela antes de entrar com a nova senha
      if (auth.currentUser && auth.currentUser.email?.toLowerCase() !== estado.email.toLowerCase()) await signOut(auth);
      await signInWithEmailAndPassword(auth, estado.email, senha);
      navegar(continuar, { replace: true });
    } catch (e2) {
      const c = String((e2 as { code?: string })?.code ?? "");
      if (/expired-action-code|invalid-action-code/.test(c)) setEstado({ fase: "vencido" });
      else setErro(/weak-password/.test(c) ? "Senha fraca. Use pelo menos 8 caracteres, com letras e números." : mensagemDeErro(e2));
    } finally {
      setSalvando(false);
    }
  }

  async function pedirOutro(e: FormEvent) {
    e.preventDefault();
    if (!emailValido(emailNovo)) return setPedido({ enviando: false, texto: "Digite o seu e-mail.", erro: true });
    setPedido({ enviando: true });
    try {
      await enviarRedefinicaoSenha(emailNovo.trim().toLowerCase(), `${location.origin}${continuar}`);
      setPedido({ enviando: false, texto: "Se este e-mail tiver conta, o link novo chega em instantes. Confira também o spam." });
    } catch (e2) {
      setPedido({ enviando: false, texto: mensagemDeErro(e2), erro: true });
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-10">
      <Link to="/" className="font-display uppercase tracking-tight text-sm text-texto-2 hover:text-texto mb-8">
        {marca ?? "Somos Organizada"}
      </Link>
      <Cartao className="w-full max-w-md p-7 sm:p-8 animate-surgir" aria-live="polite">
        {estado.fase === "conferindo" && (
          <div className="text-center">
            <Girando className="size-8 mx-auto text-primaria-texto" />
            <h1 className="text-xl font-bold mt-5">Abrindo o link…</h1>
          </div>
        )}
        {estado.fase === "sem_internet" && (
          <div className="text-center">
            <span className="mx-auto size-14 rounded-2xl bg-info/15 text-info grid place-items-center">
              <Icone nome="alerta" className="size-8" />
            </span>
            <h1 className="text-2xl font-bold mt-5">Sem internet</h1>
            <p className="text-texto-2 mt-2">Confira a conexão e toque de novo: o link continua valendo.</p>
            <Botao largo tamanho="lg" className="mt-6" icone="atualizar" onClick={() => void conferir()}>
              Tentar de novo
            </Botao>
          </div>
        )}
        {estado.fase === "pronto" && (
          <form onSubmit={salvar} className="space-y-5" noValidate>
            <div>
              <h1 className="text-2xl font-bold">Crie uma nova senha</h1>
              <p className="text-texto-2 mt-1">Depois de salvar, você já entra na sua conta.</p>
            </div>
            <Campo rotulo="E-mail" type="email" icone="usuario" value={estado.email} onChange={() => undefined} readOnly autoComplete="username" />
            <Campo
              rotulo="Nova senha"
              dica="Pelo menos 8 caracteres."
              type={verSenha ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              icone="cadeado"
              value={senha}
              onChange={setSenha}
              autoFocus
              sufixo={<BotaoVerSenha visivel={verSenha} alternar={() => setVerSenha((v) => !v)} />}
            />
            {erro && <Aviso tom="perigo">{erro}</Aviso>}
            <Botao type="submit" largo tamanho="lg" carregando={salvando} iconeDireita="setaDireita">
              Salvar e entrar
            </Botao>
          </form>
        )}
        {estado.fase === "vencido" && (
          <form onSubmit={pedirOutro} className="space-y-5" noValidate>
            <div className="text-center">
              <span className="mx-auto size-14 rounded-2xl bg-alerta/15 text-alerta grid place-items-center">
                <Icone nome="alerta" className="size-8" />
              </span>
              <h1 className="text-2xl font-bold mt-5">Este link não vale mais</h1>
              <p className="text-texto-2 mt-2">Por segurança, ele vale por 1 hora e funciona uma vez só. Peça outro abaixo e use o último que chegar.</p>
            </div>
            <Campo rotulo="Seu e-mail" type="email" icone="usuario" value={emailNovo} onChange={setEmailNovo} autoComplete="email" autoCapitalize="none" spellCheck={false} />
            {pedido.texto && <Aviso tom={pedido.erro ? "perigo" : "sucesso"}>{pedido.texto}</Aviso>}
            <Botao type="submit" largo tamanho="lg" icone="enviar" carregando={pedido.enviando}>
              Enviar novo link
            </Botao>
          </form>
        )}
      </Cartao>
    </div>
  );
}
