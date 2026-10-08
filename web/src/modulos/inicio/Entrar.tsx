import { plataformaSeparada, urlPlataforma } from "@/lib/hosts";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { aplicarTema, TEMA_PAINEL } from "@/lib/tema";
import { useColecao, useUsuario } from "@/hooks/dados";
import { dataHora } from "@/lib/formatos";
import type { SolicitacaoTorcida } from "@/lib/tipos";
import { Login } from "@/componentes/Login";
import { Abas, Botao, Carregando, Cartao, Icone, Selo, Vazio } from "@/ui";
import { slugDoNome } from "./planos";

interface Acesso {
  tid: string;
  nome: string;
  slug: string;
  papel: string;
}

const ROTULO_PAPEL: Record<string, string> = { diretoria: "Diretoria", subsede: "Subsede", portaria: "Portaria" };

type Perfil = "equipe" | "torcedor";

/**
 * Entrada única do site: a equipe da torcida (diretoria, subsede, portaria) faz login aqui e vê os painéis liberados;
 * o sócio ou torcedor informa a torcida e vai para a área dele na página da torcida.
 */
export default function Entrar() {
  const [params, setParams] = useSearchParams();
  const perfil: Perfil = params.get("perfil") === "torcedor" ? "torcedor" : "equipe";
  const mudarPerfil = (p: Perfil) => setParams(p === "torcedor" ? { perfil: "torcedor" } : {}, { replace: true });
  useEffect(() => {
    aplicarTema(TEMA_PAINEL);
    document.title = "Entrar · Somos Organizada";
  }, []);
  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-10">
      <Link to="/" className="font-display uppercase tracking-tight text-sm text-texto-2 hover:text-texto mb-8">
        Somos Organizada
      </Link>
      <Abas<Perfil>
        className="mb-6 flex w-full max-w-md [&>button]:h-11 [&>button]:px-2"
        valor={perfil}
        onChange={mudarPerfil}
        opcoes={[
          { valor: "equipe", rotulo: "Equipe da torcida", icone: "painel" },
          { valor: "torcedor", rotulo: "Sócio ou torcedor", icone: "usuario" },
        ]}
      />
      <div className="w-full flex-1 flex justify-center items-start">{perfil === "torcedor" ? <EntrarTorcedor /> : <EntrarEquipe aoSerTorcedor={() => mudarPerfil("torcedor")} />}</div>
    </div>
  );
}

/** Sócio e torcedor entram pela página da torcida: aqui só descobrimos qual é. */
function EntrarTorcedor() {
  const navegar = useNavigate();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  // Aceita o endereço inteiro colado (somosorganizada.com.br/bamor/socio) ou só o nome da torcida
  const slug = slugDoNome(texto.trim().replace(/^https?:\/\//i, "").replace(/^[^/]*somosorganizada\.com\.br\//i, "").split(/[/?#]/)[0] ?? "");

  async function ir(e: FormEvent) {
    e.preventDefault();
    if (!slug) return setErro("Digite o endereço ou o nome da sua torcida.");
    setErro(null);
    setBuscando(true);
    try {
      const s = await getDoc(doc(db, "slugs", slug));
      if (!s.exists() || !s.get("torcidaId")) return setErro("Não encontramos essa torcida. Confira o endereço com a diretoria (ele aparece no link de compra).");
      navegar(`/${slug}/socio`);
    } catch {
      setErro("Não foi possível conferir agora. Verifique a internet e tente de novo.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Cartao className="w-full max-w-md p-7 h-fit animate-surgir">
      <h1 className="text-2xl font-bold">Área do sócio e do torcedor</h1>
      <p className="text-texto-2 mt-1">Carteirinha, mensalidade e ingressos ficam na página da sua torcida. Qual é ela?</p>
      <form onSubmit={ir} className="mt-6" noValidate>
        <label htmlFor="entrar-torcida" className="block text-sm font-medium text-texto-2 mb-1.5">
          Endereço da torcida
        </label>
        <div className={`flex items-center h-12 rounded-2xl bg-superficie-2 border px-4 focus-within:border-primaria ${erro ? "border-perigo" : "border-linha"}`}>
          <span className="text-texto-3 shrink-0 hidden min-[400px]:inline">somosorganizada.com.br/</span>
          <input
            id="entrar-torcida"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="nome-da-torcida"
            className="flex-1 min-w-0 bg-transparent outline-none font-semibold"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            aria-invalid={!!erro}
            aria-describedby="entrar-torcida-ajuda"
          />
        </div>
        <p id="entrar-torcida-ajuda" className={`text-xs mt-1.5 ${erro ? "text-perigo" : "text-texto-3"}`} aria-live="polite">
          {erro ?? "Pode colar o link que a torcida divulga."}
        </p>
        <Botao type="submit" largo tamanho="lg" className="mt-5" carregando={buscando} iconeDireita="setaDireita">
          Ir para a minha área
        </Botao>
      </form>
      <p className="text-xs text-texto-3 mt-5">Lá você entra com o e-mail ou o CPF e a senha que criou na compra ou na associação.</p>
    </Cartao>
  );
}

function EntrarEquipe({ aoSerTorcedor }: { aoSerTorcedor: () => void }) {
  const usuario = useUsuario();
  const [acessos, setAcessos] = useState<Acesso[] | null>(null);
  const [plataforma, setPlataforma] = useState(false);
  const logado = !!usuario && !usuario.isAnonymous;
  const sols = useColecao<SolicitacaoTorcida>(
    logado ? query(collection(db, "solicitacoes"), where("uid", "==", usuario!.uid)) : null,
    `entrar-solicitacoes-${logado ? usuario!.uid : "-"}`,
  );
  const minhas = [...sols.dados]
    .filter((x) => x.status !== "aprovada")
    .sort((a, b) => (b.criadoEm?.toMillis?.() ?? 0) - (a.criadoEm?.toMillis?.() ?? 0))
    .slice(0, 1);


  useEffect(() => {
    if (!usuario || usuario.isAnonymous) return setAcessos(null);
    usuario.getIdTokenResult().then((t) => setPlataforma(t.claims.plataforma === true));
    getDocs(collection(db, `usuarios/${usuario.uid}/acessos`)).then(async (s) => {
      const lista = await Promise.all(
        s.docs
          .filter((d) => d.get("ativo") !== false)
          .map(async (d) => {
            const t = await getDoc(doc(db, "torcidas", d.id));
            return { tid: d.id, nome: t.get("nome") ?? "Torcida", slug: t.get("slug") ?? "", papel: d.get("papel") as string };
          }),
      );
      setAcessos(lista);
    });
  }, [usuario]);

  return (
    <>
      {usuario === undefined ? (
        <Carregando />
      ) : !usuario || usuario.isAnonymous ? (
        <Login
          titulo="Painel da torcida"
          subtitulo="Diretoria, subsede e portaria."
          rodape={
            <span className="flex flex-col gap-2">
              <Link to="/cadastro" className="font-semibold text-primaria hover:underline">
                Cadastrar minha torcida
              </Link>
              <button type="button" onClick={aoSerTorcedor} className="hover:text-texto">
                Sou sócio ou torcedor
              </button>
            </span>
          }
        />
      ) : !acessos ? (
        <Carregando />
      ) : (
        <Cartao className="w-full max-w-md p-7 animate-surgir">
          <p className="text-sm text-texto-3">Conectado como</p>
          <p className="font-semibold">{usuario.email}</p>
          <div className="mt-6 space-y-2">
            {plataforma && (
              <PainelLink para={urlPlataforma()} titulo="Plataforma Somos Organizada" detalhe={plataformaSeparada ? "Equipe interna · abre no endereço da plataforma" : "Equipe interna"} />
            )}
            {minhas.map((sol) => (
              <CartaoSolicitacao key={sol.id} s={sol} />
            ))}
            {acessos.map((a) => (
              <PainelLink
                key={a.tid}
                para={a.papel === "portaria" ? `/${a.slug}/portaria` : `/${a.slug}/admin`}
                titulo={a.nome}
                detalhe={ROTULO_PAPEL[a.papel] ?? a.papel}
              />
            ))}
            {!plataforma && !acessos.length && !minhas.some((m) => m.status === "pendente") && (
              <Vazio
                icone="cadeado"
                titulo="Nenhum painel liberado"
                acao={
                  <Botao variante="contorno" tamanho="sm" onClick={aoSerTorcedor}>
                    Sou sócio ou torcedor
                  </Botao>
                }
              >
                Este e-mail não tem acesso de diretoria, subsede ou portaria.
              </Vazio>
            )}
            {!plataforma && !acessos.length && !minhas.some((m) => m.status === "pendente") && (
              <Link
                to="/cadastro"
                className="flex items-center gap-3 rounded-2xl border border-dashed border-linha-forte p-4 hover:border-primaria hover:bg-superficie-2 transition-colors"
              >
                <span className="size-10 rounded-xl bg-secundaria/15 text-secundaria grid place-items-center">
                  <Icone nome="bandeira" className="size-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold">Cadastrar minha torcida</span>
                  <span className="block text-sm text-texto-3">Leva uns 5 minutos e passa pela aprovação da equipe.</span>
                </span>
                <Icone nome="chevronDireita" className="size-5 text-texto-3" />
              </Link>
            )}
          </div>
          <Botao variante="fantasma" largo className="mt-4" icone="sair" onClick={() => signOut(auth)}>
            Sair
          </Botao>
        </Cartao>
      )}
    </>
  );
}

function PainelLink({ para, titulo, detalhe }: { para: string; titulo: string; detalhe: string }) {
  const classe = "flex items-center gap-3 rounded-2xl border border-linha p-4 hover:border-primaria hover:bg-superficie-2 transition-colors";
  const conteudo = (
    <>
      <span className="size-10 rounded-xl bg-primaria/15 text-primaria grid place-items-center">
        <Icone nome="painel" className="size-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold truncate">{titulo}</span>
        <span className="block text-sm text-texto-3">{detalhe}</span>
      </span>
      <Icone nome="chevronDireita" className="size-5 text-texto-3" />
    </>
  );
  // O painel da plataforma pode estar em outro domínio (subdomínio próprio): aí é link comum, não rota interna
  return /^https?:/.test(para) ? (
    <a href={para} className={classe}>
      {conteudo}
    </a>
  ) : (
    <Link to={para} className={classe}>
      {conteudo}
    </Link>
  );
}

function CartaoSolicitacao({ s }: { s: SolicitacaoTorcida }) {
  const pendente = s.status === "pendente";
  return (
    <Link
      to="/cadastro"
      className={`block rounded-2xl border p-4 transition-colors hover:bg-superficie-2 ${pendente ? "border-alerta/40 bg-alerta/8" : "border-perigo/40 bg-perigo/8"}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold truncate">{s.nomeTorcida}</span>
        <Selo tom={pendente ? "alerta" : "perigo"}>{pendente ? "Em análise" : "Não aprovado"}</Selo>
      </span>
      <span className="block text-sm text-texto-2 mt-1">
        {pendente
          ? `Cadastro enviado em ${dataHora(s.criadoEm)}. Você será liberado assim que a equipe aprovar.`
          : `Motivo: ${(s.motivo || "não informado").replace(/[.!]+$/, "")}. Toque para ver ou fazer novo cadastro.`}
      </span>
    </Link>
  );
}
