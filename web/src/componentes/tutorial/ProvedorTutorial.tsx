import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUsuario } from "@/hooks/dados";
import { cx } from "@/ui";
import { passosVisiveis, Tour, type PassoTour } from "./Tour";

interface Registro {
  id: string;
  passos: PassoTour[];
}

interface ContextoTutorial {
  registrar: (r: Registro) => () => void;
  abrir: (id: string) => void;
  autoIniciar: (id: string) => void;
  atual: Registro | null;
}

const Ctx = createContext<ContextoTutorial | null>(null);
const CHAVE_LOCAL = "tutoriaisVistos";

function lerLocal(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE_LOCAL) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function gravarLocal(s: Set<string>) {
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify([...s]));
  } catch {
    /* navegação privada: fica só na memória */
  }
}

/**
 * Guarda os tours registrados pelas páginas e mostra o que estiver aberto.
 * - Cada página registra o seu tour com usePassoAPasso (o último registrado é o "da página atual").
 * - Primeira visita: abre sozinho e marca como visto em usuarios/{uid}/preferencias/tutoriais (+ localStorage).
 * - ?tour=<id> na URL abre aquele tour (usado pelos "Primeiros passos" e pela gravação dos vídeos).
 */
export function ProvedorTutorial({ children }: { children: ReactNode }) {
  const usuario = useUsuario();
  const uid = usuario && !usuario.isAnonymous ? usuario.uid : null;
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [aberto, setAberto] = useState<Registro | null>(null);
  const [params, setParams] = useSearchParams();
  const vistos = useRef<Set<string>>(lerLocal());
  const remotos = useRef<Promise<Set<string>> | null>(null);
  const registrosRef = useRef(registros);
  registrosRef.current = registros;
  const abertoRef = useRef(aberto);
  abertoRef.current = aberto;

  // Preferências do usuário no Firestore (uma leitura por sessão)
  useEffect(() => {
    remotos.current = null;
  }, [uid]);
  const lerRemotos = useCallback((): Promise<Set<string>> => {
    if (!uid) return Promise.resolve(new Set());
    remotos.current ??= getDoc(doc(db, `usuarios/${uid}/preferencias/tutoriais`))
      .then((s) => new Set(Object.entries(s.data() ?? {}).filter(([, v]) => v === true).map(([k]) => k)))
      .catch(() => new Set<string>());
    return remotos.current;
  }, [uid]);

  const marcarVisto = useCallback(
    (id: string) => {
      vistos.current.add(id);
      gravarLocal(vistos.current);
      if (uid) setDoc(doc(db, `usuarios/${uid}/preferencias/tutoriais`), { [id]: true }, { merge: true }).catch(() => undefined);
    },
    [uid],
  );

  const registrar = useCallback((r: Registro) => {
    setRegistros((l) => [...l.filter((x) => x.id !== r.id), r]);
    return () => setRegistros((l) => l.filter((x) => x.id !== r.id));
  }, []);

  const abrir = useCallback((id: string) => {
    const r = registrosRef.current.find((x) => x.id === id);
    if (r) setAberto({ ...r, passos: passosVisiveis(r.passos) });
  }, []);

  const autoIniciar = useCallback(
    (id: string) => {
      if (vistos.current.has(id) || !uid) return;
      void lerRemotos().then((rem) => {
        if (rem.has(id)) {
          vistos.current.add(id);
          gravarLocal(vistos.current);
          return;
        }
        // espera a página desenhar os dados antes de destacar os elementos
        setTimeout(() => {
          if (abertoRef.current || vistos.current.has(id)) return;
          const r = registrosRef.current.find((x) => x.id === id);
          if (r) setAberto({ ...r, passos: passosVisiveis(r.passos) });
        }, 900);
      });
    },
    [uid, lerRemotos],
  );

  // ?tour=<id>
  const pedido = params.get("tour");
  useEffect(() => {
    if (!pedido) return;
    const r = registros.find((x) => x.id === pedido);
    if (!r) return;
    const t = setTimeout(() => setAberto({ ...r, passos: passosVisiveis(r.passos) }), 500);
    const novos = new URLSearchParams(params);
    novos.delete("tour");
    setParams(novos, { replace: true });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, registros]);

  const encerrar = useCallback(() => {
    if (abertoRef.current) marcarVisto(abertoRef.current.id);
    setAberto(null);
  }, [marcarVisto]);

  const atual = registros.length ? registros[registros.length - 1]! : null;
  const valor = useMemo(() => ({ registrar, abrir, autoIniciar, atual }), [registrar, abrir, autoIniciar, atual]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      <Tour id={aberto?.id ?? ""} passos={aberto?.passos ?? []} aberto={!!aberto} fechar={encerrar} concluir={encerrar} />
    </Ctx.Provider>
  );
}

/**
 * Registra o passo a passo da página. Abre sozinho na primeira visita do usuário (autoIniciar).
 * `passos` deve ser estável (constante do módulo). `ativo: false` desliga (ex.: gaveta fechada).
 */
export function usePassoAPasso(id: string, passos: PassoTour[], { autoIniciar = true, ativo = true }: { autoIniciar?: boolean; ativo?: boolean } = {}) {
  const c = useContext(Ctx);
  useEffect(() => {
    if (!c || !ativo || !passos.length) return;
    const sair = c.registrar({ id, passos });
    if (autoIniciar) c.autoIniciar(id);
    return sair;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, passos, ativo, autoIniciar, c?.registrar]);
  return { abrir: () => c?.abrir(id) };
}

/** Botão "Ver passo a passo" que reabre o tour da página atual. */
export function BotaoPassoAPasso({ className }: { className?: string }) {
  const c = useContext(Ctx);
  if (!c?.atual) return null;
  const id = c.atual.id;
  return (
    <button
      type="button"
      onClick={() => c.abrir(id)}
      data-tour="botao-passo-a-passo"
      className={cx(
        "inline-flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-xl text-sm font-semibold text-texto-2 hover:text-texto bg-superficie-2 hover:bg-superficie-3 border border-linha",
        className,
      )}
      aria-label="Ver passo a passo desta página"
      title="Ver passo a passo desta página"
    >
      <span className="size-6 rounded-full bg-primaria text-sobre-primaria grid place-items-center text-sm font-bold">?</span>
      <span className="hidden sm:inline">Ver passo a passo</span>
    </button>
  );
}
