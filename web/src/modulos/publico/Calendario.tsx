import { useMemo } from "react";
import type { ComId, Evento } from "@/lib/tipos";
import { BotaoIcone, cx } from "@/ui";

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const rotuloMes = (d: Date) => {
  const t = fmtMes.format(d);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Chave AAAA-MM-DD no fuso de São Paulo. */
export function chaveDia(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function Calendario({
  mes,
  setMes,
  eventos,
  diaSelecionado,
  setDia,
}: {
  mes: Date; // primeiro dia do mês exibido
  setMes: (d: Date) => void;
  eventos: ComId<Evento>[];
  diaSelecionado: string | null;
  setDia: (d: string | null) => void;
}) {
  const porDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of eventos) {
      const k = chaveDia(e.data.toDate());
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [eventos]);

  const celulas = useMemo(() => {
    const ano = mes.getFullYear();
    const m = mes.getMonth();
    const primeiro = new Date(ano, m, 1);
    const total = new Date(ano, m + 1, 0).getDate();
    const lista: (Date | null)[] = Array(primeiro.getDay()).fill(null);
    for (let d = 1; d <= total; d++) lista.push(new Date(ano, m, d, 12));
    while (lista.length % 7) lista.push(null);
    return lista;
  }, [mes]);

  const hoje = chaveDia(new Date());
  const mesAtual = new Date();
  const noMesAtual = mes.getFullYear() === mesAtual.getFullYear() && mes.getMonth() === mesAtual.getMonth();

  return (
    <div className="rounded-cartao border border-linha bg-superficie p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <BotaoIcone
          icone="chevronEsquerda"
          rotulo="Mês anterior"
          disabled={noMesAtual}
          onClick={() => {
            setDia(null);
            setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1));
          }}
        />
        <p className="font-bold">{rotuloMes(mes)}</p>
        <BotaoIcone
          icone="chevronDireita"
          rotulo="Próximo mês"
          onClick={() => {
            setDia(null);
            setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1));
          }}
        />
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-texto-3 mb-1">
        {DIAS.map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celulas.map((d, i) => {
          if (!d) return <span key={i} />;
          const k = chaveDia(d);
          const qtd = porDia.get(k) ?? 0;
          const sel = diaSelecionado === k;
          const passado = k < hoje;
          return (
            <button
              key={i}
              type="button"
              disabled={!qtd}
              onClick={() => setDia(sel ? null : k)}
              aria-pressed={sel}
              aria-label={`${d.getDate()}${qtd ? `, ${qtd} evento${qtd > 1 ? "s" : ""}` : ""}`}
              className={cx(
                "relative aspect-square rounded-xl text-sm font-semibold grid place-items-center transition-all numeros",
                sel
                  ? "bg-primaria text-sobre-primaria scale-105 shadow-lg"
                  : qtd
                    ? "bg-primaria/12 text-texto hover:bg-primaria/25"
                    : passado
                      ? "text-texto-3/50"
                      : "text-texto-3",
                k === hoje && !sel && "ring-1 ring-secundaria",
              )}
            >
              {d.getDate()}
              {qtd > 0 && (
                <span className={cx("absolute bottom-1 flex gap-0.5")}>
                  {Array.from({ length: Math.min(qtd, 3) }).map((_, j) => (
                    <span key={j} className={cx("size-1 rounded-full", sel ? "bg-sobre-primaria" : "bg-secundaria")} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
