import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx, BotaoIcone } from "./basicos";

function useTravarRolagem(aberto: boolean) {
  useEffect(() => {
    if (!aberto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, [aberto]);
}

function useEsc(aberto: boolean, fechar: () => void) {
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [aberto, fechar]);
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
  useTravarRolagem(aberto);
  useEsc(aberto, fechar);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (aberto) ref.current?.focus();
  }, [aberto]);
  if (!aberto) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[surgir_.2s_ease_both]" onClick={fechar} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cx(
          "relative w-full bg-fundo border border-linha shadow-2xl outline-none animate-deslizar",
          "rounded-t-[28px] sm:rounded-[28px] max-h-[92dvh] flex flex-col",
          largura,
        )}
      >
        {(titulo || descricao) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
            <div>
              {titulo && <h2 className="text-xl font-bold">{titulo}</h2>}
              {descricao && <p className="text-sm text-texto-2 mt-1">{descricao}</p>}
            </div>
            <BotaoIcone icone="x" rotulo="Fechar" onClick={fechar} className="-mr-2 -mt-1" />
          </div>
        )}
        <div className="px-6 py-4 overflow-y-auto rolagem-fina">{children}</div>
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
  useTravarRolagem(aberto);
  useEsc(aberto, fechar);
  if (!aberto) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={fechar} />
      <aside
        role="dialog"
        aria-modal="true"
        className={cx("relative h-full w-full bg-fundo border-l border-linha flex flex-col animate-[surgir_.25s_ease_both]", largura)}
      >
        <div className="flex items-center justify-between gap-4 px-6 h-16 border-b border-linha shrink-0">
          <h2 className="text-lg font-bold truncate">{titulo}</h2>
          <BotaoIcone icone="x" rotulo="Fechar" onClick={fechar} />
        </div>
        <div className="flex-1 overflow-y-auto rolagem-fina px-6 py-6">{children}</div>
        {rodape && <div className="px-6 py-4 border-t border-linha shrink-0">{rodape}</div>}
      </aside>
    </div>,
    document.body,
  );
}
