import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, getDoc, getDocFromCache, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { aplicarTema, TEMA_PADRAO } from "@/lib/tema";
import { definirContextoErros, registrarErro } from "@/lib/erros";
import type { ComId, Membro, Socio, Torcida } from "@/lib/tipos";
import { useDocumento, useUsuario } from "./dados";

interface ContextoTorcida {
  tid: string;
  torcida: ComId<Torcida>;
}

const Ctx = createContext<ContextoTorcida | null>(null);

/** Torcida da página, quando houver (componentes usados dentro e fora do site da torcida, como o login). */
export function useTorcidaOpcional(): ContextoTorcida | null {
  return useContext(Ctx);
}

/** Dentro das rotas /:slug/* — torcida já carregada e tema aplicado. */
export function useTorcida(): ContextoTorcida {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTorcida fora de <ProvedorTorcida>");
  return c;
}

type EstadoSlug =
  | { fase: "carregando" }
  | { fase: "nao_encontrada" }
  | { fase: "erro"; erro: Error }
  | { fase: "ok"; tid: string; torcida: ComId<Torcida> };

/**
 * Resolve slug → torcida (tempo real) e aplica as cores da torcida na página.
 * Começa pelo que está no aparelho (abre na hora com sinal ruim, sem esperar o servidor desistir) e confere
 * com o servidor em seguida: se o endereço passou a ser de outra torcida ou deixou de existir, a tela acompanha.
 */
export function useTorcidaPorSlug(slug: string | undefined): EstadoSlug {
  const [estado, setEstado] = useState<EstadoSlug>({ fase: "carregando" });
  useEffect(() => {
    if (!slug) return;
    let cancelar: (() => void) | undefined;
    let ativo = true;
    let tidAtual: string | undefined;
    setEstado({ fase: "carregando" });
    const assinar = (tid: string) => {
      if (!ativo || tid === tidAtual) return;
      tidAtual = tid;
      cancelar?.();
      cancelar = onSnapshot(
        doc(db, "torcidas", tid),
        (t) => {
          if (!t.exists()) return setEstado({ fase: "nao_encontrada" });
          const torcida = { id: t.id, ...(t.data() as Torcida) };
          setEstado({ fase: "ok", tid, torcida });
        },
        (erro) => setEstado({ fase: "erro", erro }),
      );
    };
    const ref = doc(db, "slugs", slug.toLowerCase());
    getDocFromCache(ref)
      .then((s) => {
        const tid = s.get("torcidaId") as string | undefined;
        if (tid) assinar(tid);
      })
      .catch(() => undefined); // nada no aparelho: espera o servidor
    getDoc(ref)
      .then((s) => {
        if (!ativo) return;
        const tid = s.get("torcidaId") as string | undefined;
        if (tid) return assinar(tid);
        cancelar?.();
        cancelar = undefined;
        tidAtual = undefined;
        setEstado({ fase: "nao_encontrada" });
      })
      .catch((erro) => {
        if (!ativo || tidAtual) return; // já abriu com o que estava no aparelho
        registrarErro(erro, "slug");
        setEstado({ fase: "erro", erro });
      });
    return () => {
      ativo = false;
      cancelar?.();
    };
  }, [slug]);
  return estado;
}

export function ProvedorTorcida({
  tid,
  torcida,
  aplicarCores = true,
  children,
}: {
  tid: string;
  torcida: ComId<Torcida>;
  aplicarCores?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (aplicarCores) aplicarTema(torcida.tema);
    definirContextoErros(tid, torcida.slug);
    document.title = torcida.nome;
    return () => {
      aplicarTema(TEMA_PADRAO);
      definirContextoErros(null);
    };
  }, [tid, torcida, aplicarCores]);
  return <Ctx.Provider value={{ tid, torcida }}>{children}</Ctx.Provider>;
}

/** Acesso do usuário logado ao painel desta torcida (null = sem acesso). */
export function useMembro(tid: string | null) {
  const u = useUsuario();
  const caminho = tid && u && !u.isAnonymous ? `torcidas/${tid}/membros/${u.uid}` : null;
  const r = useDocumento<Membro>(caminho);
  const carregando = u === undefined || r.carregando;
  // Sem conseguir ler o acesso (internet ruim, celular novo na hora do jogo), "sem membro" não quer dizer
  // "sem acesso": quem usa mostra "Sem conexão" em vez de mandar a pessoa sair da conta.
  const incerto = !r.dados && (!!r.erro || !!r.semConexao);
  return { membro: r.dados?.ativo ? r.dados : null, carregando, usuario: u, incerto };
}

/** Ficha de sócio do usuário logado nesta torcida. */
export function useMinhaFicha(tid: string | null) {
  const u = useUsuario();
  const caminho = tid && u && !u.isAnonymous ? `torcidas/${tid}/socios/${u.uid}` : null;
  const r = useDocumento<Socio>(caminho);
  // Com internet ruim, "sem ficha" não quer dizer "não é sócio": quem usa precisa olhar erro e semConexao
  // antes de concluir algo (ex.: mandar o sócio para /conta e oferecer "Seja sócio").
  return { ficha: r.dados, carregando: u === undefined || r.carregando, usuario: u, erro: r.erro, semConexao: !!r.semConexao };
}

export const socioEmDia = (s: Socio | null | undefined) =>
  !!s && s.status === "ativo" && !!s.validoAte && s.validoAte.toMillis() > Date.now();

export { TEMA_PADRAO };
