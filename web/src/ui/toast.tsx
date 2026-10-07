import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./basicos";
import { Icone } from "./icones";

type TomToast = "sucesso" | "erro" | "info";
interface ItemToast {
  id: number;
  tom: TomToast;
  texto: string;
}

const Ctx = createContext<(texto: string, tom?: TomToast) => void>(() => undefined);

/** const avisar = useToast(); avisar("Salvo!", "sucesso") */
export const useToast = () => useContext(Ctx);

export function ProvedorToast({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemToast[]>([]);
  const avisar = useCallback((texto: string, tom: TomToast = "info") => {
    const id = Date.now() + Math.random();
    setItens((l) => [...l.slice(-3), { id, tom, texto }]);
    setTimeout(() => setItens((l) => l.filter((i) => i.id !== id)), tom === "erro" ? 6000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      {createPortal(
        <div className="fixed z-[60] bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none" aria-live="polite">
          {itens.map((i) => (
            <div
              key={i.id}
              className={cx(
                "pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl border text-sm font-medium animate-deslizar backdrop-blur",
                i.tom === "sucesso" && "bg-[#0f2a1a]/95 border-sucesso/40 text-white",
                i.tom === "erro" && "bg-[#2a0f12]/95 border-perigo/40 text-white",
                i.tom === "info" && "bg-[#14181e]/95 border-white/15 text-white",
              )}
            >
              <Icone
                nome={i.tom === "sucesso" ? "checkCirculo" : i.tom === "erro" ? "alerta" : "info"}
                className={cx("size-5 shrink-0", i.tom === "sucesso" ? "text-sucesso" : i.tom === "erro" ? "text-perigo" : "text-info")}
              />
              {i.texto}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
