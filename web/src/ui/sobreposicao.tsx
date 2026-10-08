import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx, BotaoIcone } from "./basicos";

// Janelas abertas umas sobre as outras (ex.: confirmar dentro de uma gaveta): só a de cima responde ao Esc
// e prende o foco; a rolagem da página fica travada enquanto houver alguma aberta.
const pilha: symbol[] = [];
let travas = 0;
let overflowAntes = "";

const FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useCamada(aberto: boolean, fechar: () => void, ref: React.RefObject<HTMLElement | null>) {
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  useEffect(() => {
    if (!aberto) return;
    const id = Symbol("camada");
    pilha.push(id);
    if (travas++ === 0) {
      overflowAntes = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const antes = document.activeElement as HTMLElement | null;
    // foca a janela ao abrir (sem abrir teclado no celular: o container, não o primeiro campo)
    requestAnimationFrame(() => ref.current?.focus());
    const tecla = (e: KeyboardEvent) => {
      if (pilha[pilha.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        fecharRef.current();
      } else if (e.key === "Tab" && ref.current) {
        const itens = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((el) => el.offsetParent !== null);
        if (!itens.length) return;
        const [primeiro, ultimo] = [itens[0], itens[itens.length - 1]];
        if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === ref.current)) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("keydown", tecla);
      pilha.splice(pilha.indexOf(id), 1);
      if (--travas === 0) document.body.style.overflow = overflowAntes;
      // devolve o foco a quem abriu (botão "Editar", "Excluir"...)
      if (antes && document.contains(antes)) antes.focus({ preventScroll: true });
    };
  }, [aberto, ref]);
}

/** Modal centralizado (desktop) que vira folha inferior no celular. */
export function Modal({
  aberto,
  fechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = "max-w-lg",
}: {
  aberto: boolean;
  fechar: () => void;
  titulo?: ReactNode;
  descricao?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  useCamada(aberto, fechar, ref);
  if (!aberto) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[surgir_.2s_ease_both]" onClick={fechar} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo ? idTitulo : undefined}
        className={cx(
          "relative w-full bg-fundo border border-linha shadow-2xl outline-none animate-deslizar",
          "rounded-t-[28px] sm:rounded-[28px] max-h-[92dvh] flex flex-col",
          largura,
        )}
      >
        {titulo || descricao ? (
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
            <div className="min-w-0">
              {titulo && (
                <h2 id={idTitulo} className="text-xl font-bold">
                  {titulo}
                </h2>
              )}
              {descricao && <p className="text-sm text-texto-2 mt-1">{descricao}</p>}
            </div>
            <BotaoIcone icone="x" rotulo="Fechar" onClick={fechar} className="-mr-2 -mt-1 shrink-0" />
          </div>
        ) : (
          // sem título: o X continua lá (no celular a folha ocupa quase a tela toda)
          <BotaoIcone icone="x" rotulo="Fechar" onClick={fechar} className="absolute right-3 top-3 z-10" />
        )}
        <div className="px-6 py-4 overflow-y-auto overscroll-contain rolagem-fina">{children}</div>
        {rodape && <div className="px-6 pb-6 pt-2 border-t border-linha mt-auto">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Painel lateral (desktop) / tela cheia (celular). Usado para detalhes e formulários longos. */
export function Gaveta({
  aberto,
  fechar,
  titulo,
  children,
  rodape,
  largura = "sm:max-w-xl",
}: {
  aberto: boolean;
  fechar: () => void;
  titulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const idTitulo = useId();
  useCamada(aberto, fechar, ref);
  if (!aberto) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={fechar} />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className={cx("relative h-full w-full outline-none bg-fundo border-l border-linha flex flex-col animate-[surgir_.25s_ease_both]", largura)}
      >
        <div className="flex items-center justify-between gap-4 px-6 h-16 border-b border-linha shrink-0">
          <h2 id={idTitulo} className="text-lg font-bold truncate">
            {titulo}
          </h2>
          <BotaoIcone icone="x" rotulo="Fechar" onClick={fechar} />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain rolagem-fina px-6 py-6">{children}</div>
        {rodape && <div className="px-6 py-4 border-t border-linha shrink-0">{rodape}</div>}
      </aside>
    </div>,
    document.body,
  );
}
