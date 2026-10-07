import { Link } from "react-router";
import type { ComId, Evento, Sede } from "@/lib/tipos";
import { diaDoMes, hora, mesAbrev, moedaCurta, dataExtensa } from "@/lib/formatos";
import { cx, Icone, Selo } from "@/ui";

export function disponibilidade(e: Evento): { restantes: number | null; esgotado: boolean; poucos: boolean } {
  if (!e.capacidade) return { restantes: null, esgotado: false, poucos: false };
  const restantes = Math.max(0, e.capacidade - (e.vendidos ?? 0) - (e.reservados ?? 0));
  return { restantes, esgotado: restantes === 0, poucos: restantes > 0 && restantes <= Math.max(10, e.capacidade * 0.1) };
}

export function CartaoEvento({ evento, sede, slug, destaque }: { evento: ComId<Evento>; sede?: Sede; slug: string; destaque?: boolean }) {
  const d = disponibilidade(evento);
  const vendaEncerrada = !!evento.vendaAte && evento.vendaAte.toMillis() < Date.now();
  return (
    <Link
      to={`/${slug}/evento/${evento.id}`}
      className={cx(
        "group relative flex overflow-hidden rounded-cartao border border-linha bg-superficie transition-all",
        "hover:border-primaria/60 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-25px_var(--color-primaria)]",
        destaque ? "flex-col" : "flex-row",
      )}
    >
      {destaque && (
        <div className={cx("relative overflow-hidden bg-superficie-2", evento.imagemUrl ? "h-44 sm:h-56" : "h-24 sm:h-28")}>
          {evento.imagemUrl ? (
            <img src={evento.imagemUrl} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="absolute inset-0 brilho-primaria">
              <div className="absolute inset-0 grade-fundo opacity-60" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-superficie via-superficie/20 to-transparent" />
        </div>
      )}

      {/* Bloco de data */}
      <div
        className={cx(
          "shrink-0 flex flex-col items-center justify-center text-center",
          destaque ? "absolute top-4 left-4 rounded-2xl bg-fundo/85 backdrop-blur px-3 py-2 border border-linha" : "w-20 sm:w-24 border-r border-dashed border-linha-forte bg-superficie-2/60",
        )}
      >
        <span className="text-[11px] font-bold tracking-widest text-primaria">{mesAbrev(evento.data)}</span>
        <span className="font-display text-3xl leading-none numeros">{diaDoMes(evento.data)}</span>
        <span className="text-[11px] text-texto-3 mt-1">{hora(evento.data)}</span>
      </div>

      <div className="flex-1 min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          {sede && <span className="text-xs font-semibold text-texto-3 truncate">{sede.nome}</span>}
          {d.esgotado ? (
            <Selo tom="perigo">Esgotado</Selo>
          ) : vendaEncerrada ? (
            <Selo>Vendas encerradas</Selo>
          ) : d.poucos ? (
            <Selo tom="alerta" ponto>
              Últimos {d.restantes}
            </Selo>
          ) : null}
        </div>
        <h3 className="font-bold text-[17px] leading-snug group-hover:text-primaria transition-colors line-clamp-2">{evento.nome}</h3>
        <p className="text-sm text-texto-2 mt-1 flex items-center gap-1.5 truncate">
          <Icone nome="local" className="size-4 shrink-0 text-texto-3" />
          <span className="truncate">{evento.local || dataExtensa(evento.data)}</span>
        </p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex gap-4 text-sm">
            <span>
              <span className="block text-[11px] uppercase tracking-wide text-texto-3">Sócio</span>
              <span className="font-bold text-primaria numeros">{evento.valorSocio ? moedaCurta(evento.valorSocio) : "Grátis"}</span>
            </span>
            <span>
              <span className="block text-[11px] uppercase tracking-wide text-texto-3">Público</span>
              <span className="font-bold numeros">{moedaCurta(evento.valorPublico)}</span>
            </span>
          </div>
          <span className="size-9 shrink-0 rounded-full bg-superficie-2 grid place-items-center group-hover:bg-primaria group-hover:text-sobre-primaria transition-colors">
            <Icone nome="setaDireita" className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
