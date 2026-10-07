import { useEffect, useState } from "react";
import { Link } from "react-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { aplicarTema, TEMA_PAINEL } from "@/lib/tema";
import { useColecao, useUsuario } from "@/hooks/dados";
import { dataHora } from "@/lib/formatos";
import type { SolicitacaoTorcida } from "@/lib/tipos";
import { Login } from "@/componentes/Login";
import { Botao, Carregando, Cartao, Icone, Selo, Vazio } from "@/ui";

interface Acesso {
  tid: string;
  nome: string;
  slug: string;
  papel: string;
}

const ROTULO_PAPEL: Record<string, string> = { diretoria: "Diretoria", subsede: "Subsede", portaria: "Portaria" };

/** Login genérico: depois de entrar, mostra os painéis que a pessoa pode abrir. */
export default function Entrar() {
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
    aplicarTema(TEMA_PAINEL);
    document.title = "Entrar · Somos Organizada";
  }, []);

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
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      {usuario === undefined ? (
        <Carregando />
      ) : !usuario || usuario.isAnonymous ? (
        <Login
          titulo="Entrar"
          subtitulo="Painel da diretoria e equipe da torcida."
          rodape={
            <span className="flex flex-col gap-2">
              <Link to="/cadastro" className="font-semibold text-primaria hover:underline">
                Cadastrar minha torcida
              </Link>
              <Link to="/" className="hover:text-texto">
                Somos Organizada
              </Link>
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
              <PainelLink para="/plataforma" titulo="Plataforma Somos Organizada" detalhe="Equipe interna" />
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
              <Vazio icone="cadeado" titulo="Nenhum painel liberado">
                Este e-mail não tem acesso de diretoria. Se você é sócio, entre pela página da sua torcida.
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
    </div>
  );
}

function PainelLink({ para, titulo, detalhe }: { para: string; titulo: string; detalhe: string }) {
  return (
    <Link to={para} className="flex items-center gap-3 rounded-2xl border border-linha p-4 hover:border-primaria hover:bg-superficie-2 transition-colors">
      <span className="size-10 rounded-xl bg-primaria/15 text-primaria grid place-items-center">
        <Icone nome="painel" className="size-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold truncate">{titulo}</span>
        <span className="block text-sm text-texto-3">{detalhe}</span>
      </span>
      <Icone nome="chevronDireita" className="size-5 text-texto-3" />
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
