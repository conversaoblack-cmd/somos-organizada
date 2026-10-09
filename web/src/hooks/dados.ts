import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, type DocumentReference, type Query } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { registrarErro } from "@/lib/erros";
import type { ComId } from "@/lib/tipos";

/** Usuário logado (undefined = ainda carregando; null = deslogado). */
export function useUsuario(): User | null | undefined {
  const [u, setU] = useState<User | null | undefined>(auth.currentUser ?? undefined);
  useEffect(() => onAuthStateChanged(auth, setU), []); // efeito-devolve-cancelamento
  return u;
}

export interface Estado<T> {
  dados: T;
  carregando: boolean;
  erro: Error | null;
  /**
   * Resposta só do cache do aparelho (sem falar com o servidor) e sem nada guardado: com internet ruim,
   * "não existe" ou "lista vazia" não é verdade. Mostre "Sem conexão" + tentar de novo, não "nada aqui".
   */
  semConexao?: boolean;
}

/** Quanto esperar o servidor antes de concluir "sem conexão" quando o aparelho não tem nada guardado. */
const ESPERA_SERVIDOR_MS = 6000;

/** Documento em tempo real. Passe null para não assinar. */
export function useDocumento<T>(caminho: string | null): Estado<ComId<T> | null> {
  // O estado guarda de qual caminho ele é: logo depois de o caminho mudar (ex.: o login terminou), o render
  // ainda não tem a resposta nova e precisa aparecer como "carregando", não como "documento inexistente".
  const [estado, setEstado] = useState<Estado<ComId<T> | null> & { de: string | null }>({ dados: null, carregando: !!caminho, erro: null, de: caminho });
  useEffect(() => {
    if (!caminho) {
      setEstado({ dados: null, carregando: false, erro: null, de: null });
      return;
    }
    setEstado((e) => ({ ...e, carregando: true, de: caminho }));
    let espera: ReturnType<typeof setTimeout> | undefined;
    const parar = onSnapshot(
      doc(db, caminho) as DocumentReference<T>,
      { includeMetadataChanges: true },
      (s) => {
        clearTimeout(espera);
        const dados = s.exists() ? ({ id: s.id, ...s.data() } as ComId<T>) : null;
        if (!dados && s.metadata.fromCache) {
          // nada no aparelho e o servidor ainda não respondeu: espera um pouco antes de dizer "sem conexão"
          setEstado({ dados: null, carregando: true, erro: null, de: caminho });
          espera = setTimeout(() => setEstado({ dados: null, carregando: false, erro: null, semConexao: true, de: caminho }), navigator.onLine ? ESPERA_SERVIDOR_MS : 0);
          return;
        }
        setEstado({ dados, carregando: false, erro: null, de: caminho });
      },
      (erro) => {
        clearTimeout(espera);
        registrarErro(erro, `doc ${caminho}`);
        setEstado({ dados: null, carregando: false, erro, de: caminho });
      },
    );
    return () => {
      clearTimeout(espera);
      parar();
    };
  }, [caminho]);
  if (estado.de !== caminho) return { dados: null, carregando: !!caminho, erro: null };
  return { dados: estado.dados, carregando: estado.carregando, erro: estado.erro, semConexao: !!estado.semConexao };
}

/**
 * Coleção/consulta em tempo real. `chave` deve mudar quando a consulta mudar
 * (o objeto Query não é comparável entre renders).
 */
export function useColecao<T>(consulta: Query | null, chave: string): Estado<ComId<T>[]> {
  const [estado, setEstado] = useState<Estado<ComId<T>[]>>({ dados: [], carregando: !!consulta, erro: null });
  useEffect(() => {
    if (!consulta) {
      setEstado({ dados: [], carregando: false, erro: null });
      return;
    }
    setEstado((e) => ({ ...e, carregando: true }));
    let espera: ReturnType<typeof setTimeout> | undefined;
    const parar = onSnapshot(
      consulta,
      { includeMetadataChanges: true },
      (s) => {
        clearTimeout(espera);
        if (s.empty && s.metadata.fromCache) {
          setEstado({ dados: [], carregando: true, erro: null });
          espera = setTimeout(() => setEstado({ dados: [], carregando: false, erro: null, semConexao: true }), navigator.onLine ? ESPERA_SERVIDOR_MS : 0);
          return;
        }
        setEstado({ dados: s.docs.map((d) => ({ id: d.id, ...(d.data() as T) })), carregando: false, erro: null });
      },
      (erro) => {
        clearTimeout(espera);
        registrarErro(erro, `query ${chave}`);
        setEstado({ dados: [], carregando: false, erro });
      },
    );
    return () => {
      clearTimeout(espera);
      parar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return estado;
}
