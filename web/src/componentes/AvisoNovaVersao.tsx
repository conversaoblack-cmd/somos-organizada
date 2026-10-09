import { useState } from "react";
import { useNovaVersao } from "@/lib/sw";
import { Icone } from "@/ui";

/**
 * Versão nova do site já baixada pelo service worker: avisa sem recarregar sozinho (a pessoa pode estar no
 * meio de uma compra ou mostrando o QR na portaria). Fica à esquerda, longe do botão de ajuda.
 */
export function AvisoNovaVersao() {
  const nova = useNovaVersao();
  const [fechado, setFechado] = useState(false);
  if (!nova || fechado) return null;
  return (
    <div
      role="status"
      className="fixed z-[55] left-3 right-[4.75rem] sm:right-auto sm:left-5 sm:w-80 bottom-[calc(max(.75rem,env(safe-area-inset-bottom))+var(--folga-inferior,0px))] flex items-center rounded-2xl border border-linha-forte bg-superficie text-texto shadow-2xl animate-surgir"
    >
      <button type="button" onClick={() => location.reload()} className="flex-1 min-w-0 flex items-center gap-3 min-h-14 pl-4 pr-2 text-left">
        <Icone nome="atualizar" className="size-5 shrink-0 text-primaria-texto" />
        <span className="min-w-0 text-sm leading-tight">
          <span className="block font-semibold">Nova versão do site</span>
          <span className="block text-texto-2">Toque para atualizar</span>
        </span>
      </button>
      <button type="button" onClick={() => setFechado(true)} aria-label="Agora não" className="size-11 mr-1 shrink-0 grid place-items-center rounded-xl text-texto-3 hover:text-texto">
        <Icone nome="x" className="size-5" />
      </button>
    </div>
  );
}
