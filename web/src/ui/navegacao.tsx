import type { ReactNode } from "react";
import { cx } from "./basicos";
import { Icone, type NomeIcone } from "./icones";

/** Controle segmentado (abas em pílula). */
export function Abas<T extends string>({
  valor,
  onChange,
  opcoes,
  className,
  grande,
}: {
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; rotulo: ReactNode; icone?: NomeIcone; contador?: number }[];
  className?: string;
  grande?: boolean;
}) {
  return (
    <div role="tablist" className={cx("inline-flex p-1 rounded-2xl bg-superficie-2 border border-linha", className)}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            role="tab"
            type="button"
            aria-selected={ativo}
            onClick={() => onChange(o.valor)}
            className={cx(
              "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors flex-1 whitespace-nowrap",
              grande ? "h-12 px-6 text-base" : "h-11 sm:h-9 px-4 text-sm",
              ativo ? "bg-primaria text-sobre-primaria shadow" : "text-texto-2 hover:text-texto",
            )}
          >
            {o.icone && <Icone nome={o.icone} className={grande ? "size-5" : "size-4"} />}
            {o.rotulo}
            {o.contador !== undefined && (
              <span className={cx("text-xs rounded-full px-1.5 min-w-5", ativo ? "bg-black/15" : "bg-superficie-3")}>{o.contador}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Indicador de etapas do checkout. */
export function Etapas({ etapas, atual }: { etapas: string[]; atual: number }) {
  const nome = etapas[Math.min(atual, etapas.length - 1)];
  return (
    <div>
    <ol className="flex items-center gap-2" aria-label="Etapas">
      {etapas.map((e, i) => {
        const feito = i < atual;
        const agora = i === atual;
        return (
          <li key={e} className="flex items-center gap-2 flex-1 min-w-0" aria-current={agora ? "step" : undefined}>
            <span
              className={cx(
                "size-7 shrink-0 rounded-full grid place-items-center text-xs font-bold transition-colors",
                feito ? "bg-primaria text-sobre-primaria" : agora ? "bg-secundaria text-sobre-secundaria" : "bg-superficie-3 text-texto-3",
              )}
            >
              {feito ? <Icone nome="check" className="size-4" /> : i + 1}
            </span>
            <span className={cx("text-xs font-semibold truncate hidden sm:block", agora ? "text-texto" : "text-texto-3")}>{e}</span>
            {i < etapas.length - 1 && <span className={cx("h-px flex-1 min-w-3", feito ? "bg-primaria" : "bg-linha-forte")} />}
          </li>
        );
      })}
    </ol>
    {/* No celular os nomes não cabem ao lado das bolinhas: mostra o passo atual por extenso */}
    {atual < etapas.length && (
      <p className="sm:hidden mt-2 text-xs font-semibold text-texto-2" aria-live="polite">
        Passo {atual + 1} de {etapas.length}: <span className="text-texto">{nome}</span>
      </p>
    )}
    </div>
  );
}
