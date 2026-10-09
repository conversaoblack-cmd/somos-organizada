/**
 * Destino do botão "Aceitar convite e criar senha" (somosorganizada.com.br/convite?c=...).
 * Mostra o convite com as cores da torcida e o e-mail já preenchido; a pessoa cria a senha, o servidor confirma o
 * e-mail (o link só chega a quem é dono dele) e o site entra direto no painel da torcida.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { aplicarTema, TEMA_PAINEL, temaDoPainel } from "@/lib/tema";
import { api, ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import type { Papel } from "@/lib/tipos";
import { BotaoVerSenha } from "@/componentes/Login";
import { Aviso, Botao, Campo, Cartao, Girando, Icone } from "@/ui";

type Dados = Awaited<ReturnType<typeof api.verConvite>>;
type Estado = { fase: "carregando" } | { fase: "sem_internet" } | { fase: "pronto"; dados: Dados };

const FUNCAO: Record<Papel, string> = {
  diretoria: "da diretoria",
  subsede: "responsável pela subsede",
  portaria: "da portaria",
};

const MOTIVO: Record<string, { titulo: string; texto: string }> = {
  usado: { titulo: "Este convite já foi usado", texto: "A senha já foi criada. Entre no painel com o seu e-mail e a senha que você escolheu." },
  expirado: { titulo: "Este convite venceu", texto: "Por segurança, o convite vale por 7 dias. Peça à diretoria para reenviar." },
  invalido: { titulo: "Convite não encontrado", texto: "Confira se abriu o link do e-mail mais recente ou peça à diretoria para reenviar." },
};

export default function Convite() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const codigo = params.get("c") ?? "";
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    setEstado({ fase: "carregando" });
    try {
      if (codigo.length < 20) return setEstado({ fase: "pronto", dados: { valido: false, motivo: "invalido" } });
      setEstado({ fase: "pronto", dados: await api.verConvite({ c: codigo }) });
    } catch (e) {
      if (ehErroDeConexao(e)) setEstado({ fase: "sem_internet" });
      else setEstado({ fase: "pronto", dados: { valido: false, motivo: "invalido" } });
    }
  }

  useEffect(() => {
    aplicarTema(TEMA_PAINEL);
    document.title = "Convite · Somos Organizada";
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dados = estado.fase === "pronto" ? estado.dados : null;
  const torcida = dados?.torcida ?? null;
  useEffect(() => {
    if (!torcida) return;
    aplicarTema(temaDoPainel(torcida.tema ?? undefined));
    document.title = `Convite · ${torcida.nome}`;
  }, [torcida]);

  const painel = torcida ? `/${torcida.slug}/admin` : "/entrar";

  async function aceitar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.aceitarConvite({ c: codigo, senha });
      // outra conta aberta neste navegador: sai dela antes de entrar com a do convite
      if (auth.currentUser && auth.currentUser.email?.toLowerCase() !== r.email.toLowerCase()) await signOut(auth);
      await signInWithEmailAndPassword(auth, r.email, senha);
      navegar(r.slug ? `/${r.slug}/admin` : "/entrar", { replace: true });
    } catch (e) {
      setErro(mensagemDeErro(e));
      // convite usado ou vencido no meio do caminho: mostra a tela certa
      if (!ehErroDeConexao(e)) void api.verConvite({ c: codigo }).then((d) => !d.valido && setEstado({ fase: "pronto", dados: d })).catch(() => undefined);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-10">
      <Link to="/" className="font-display uppercase tracking-tight text-sm text-texto-2 hover:text-texto mb-8">
        Somos Organizada
      </Link>
      <Cartao className="w-full max-w-md p-7 sm:p-8 animate-surgir" aria-live="polite">
        {estado.fase === "carregando" && (
          <div className="text-center">
            <Girando className="size-8 mx-auto text-primaria-texto" />
            <h1 className="text-xl font-bold mt-5">Abrindo o convite…</h1>
          </div>
        )}
        {estado.fase === "sem_internet" && (
          <div className="text-center">
            <span className="mx-auto size-14 rounded-2xl bg-info/15 text-info grid place-items-center">
              <Icone nome="alerta" className="size-8" />
            </span>
            <h1 className="text-2xl font-bold mt-5">Sem internet</h1>
            <p className="text-texto-2 mt-2">Não conseguimos abrir o convite agora. Confira a conexão e toque de novo: o link continua valendo.</p>
            <Botao largo tamanho="lg" className="mt-6" icone="atualizar" onClick={() => void carregar()}>
              Tentar de novo
            </Botao>
          </div>
        )}
        {dados && !dados.valido && (
          <div className="text-center">
            <span className="mx-auto size-14 rounded-2xl bg-alerta/15 text-alerta grid place-items-center">
              <Icone nome="alerta" className="size-8" />
            </span>
            <h1 className="text-2xl font-bold mt-5">{(MOTIVO[dados.motivo ?? "invalido"] ?? MOTIVO.invalido).titulo}</h1>
            <p className="text-texto-2 mt-2">{(MOTIVO[dados.motivo ?? "invalido"] ?? MOTIVO.invalido).texto}</p>
            <Botao largo tamanho="lg" className="mt-6" iconeDireita="setaDireita" onClick={() => navegar(painel)}>
              {torcida ? `Entrar no painel da ${torcida.nome}` : "Entrar"}
            </Botao>
          </div>
        )}
        {dados?.valido && (
          <form onSubmit={aceitar} className="space-y-5" noValidate>
            <div className="text-center">
              {torcida?.tema?.logoUrl ? (
                <img src={torcida.tema.logoUrl} alt="" className="mx-auto size-16 rounded-2xl object-cover" />
              ) : (
                <span className="mx-auto size-14 rounded-2xl bg-primaria/15 text-primaria-texto grid place-items-center">
                  <Icone nome="usuarios" className="size-8" />
                </span>
              )}
              <p className="text-xs font-semibold uppercase tracking-wider text-texto-3 mt-4">{torcida?.nome ?? "Convite"}</p>
              <h1 className="text-2xl font-bold mt-1">{dados.nome ? `${dados.nome.trim().split(/\s+/)[0]}, você foi convidado!` : "Você foi convidado!"}</h1>
              <p className="text-texto-2 mt-2">
                Você vai entrar no painel como {dados.papel ? FUNCAO[dados.papel] : "membro da equipe"}
                {dados.papel === "subsede" && dados.sedeNome ? <strong className="text-texto"> {dados.sedeNome}</strong> : null}. Crie a sua senha para começar.
              </p>
            </div>
            <Campo rotulo="E-mail" type="email" icone="usuario" value={dados.email ?? ""} onChange={() => undefined} readOnly autoComplete="username" />
            <Campo
              rotulo="Crie sua senha"
              dica="Pelo menos 8 caracteres. É com ela que você entra no painel."
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
            <Botao type="submit" largo tamanho="lg" carregando={enviando} iconeDireita="setaDireita">
              Criar senha e entrar
            </Botao>
            <p className="text-xs text-texto-3 text-center">Seu e-mail fica confirmado ao criar a senha.</p>
          </form>
        )}
      </Cartao>
    </div>
  );
}
