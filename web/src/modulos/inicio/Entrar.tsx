import { useEffect, useState } from "react";
import { Link } from "react-router";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { aplicarTema, TEMA_PAINEL } from "@/lib/tema";
import { useUsuario } from "@/hooks/dados";
import { Login } from "@/componentes/Login";
import { Botao, Carregando, Cartao, Icone, Vazio } from "@/ui";

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
        <Login titulo="Entrar" subtitulo="Painel da diretoria e equipe da torcida." rodape={<Link to="/" className="hover:text-texto">Somos Organizada</Link>} />
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
            {acessos.map((a) => (
              <PainelLink
                key={a.tid}
                para={a.papel === "portaria" ? `/${a.slug}/portaria` : `/${a.slug}/admin`}
                titulo={a.nome}
                detalhe={ROTULO_PAPEL[a.papel] ?? a.papel}
              />
            ))}
            {!plataforma && !acessos.length && (
              <Vazio icone="cadeado" titulo="Nenhum painel liberado">
                Este e-mail não tem acesso de diretoria. Se você é sócio, entre pela página da sua torcida.
              </Vazio>
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
