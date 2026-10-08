import { Link } from "react-router";
import { collection, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useColecao } from "@/hooks/dados";
import { socioEmDia, useMinhaFicha, useTorcida } from "@/hooks/torcida";
import type { Evento, Plano, Sede } from "@/lib/tipos";
import { cx, Icone } from "@/ui";

export function useEventosPublicos(tid: string) {
  const q = query(collection(db, `torcidas/${tid}/eventos`), where("status", "==", "publicado"), orderBy("data", "asc"));
  const r = useColecao<Evento>(q, `eventos-pub-${tid}`);
  const limite = Date.now() - 6 * 3600_000;
  return { ...r, dados: r.dados.filter((e) => e.data.toMillis() >= limite) };
}

export function useSedes(tid: string) {
  const q = query(collection(db, `torcidas/${tid}/sedes`), orderBy("ordem", "asc"));
  const r = useColecao<Sede>(q, `sedes-${tid}`);
  return { ...r, dados: r.dados.filter((s) => s.ativa !== false) };
}

export function usePlanosAtivos(tid: string) {
  const r = useColecao<Plano>(collection(db, `torcidas/${tid}/planos`), `planos-${tid}`);
  return { ...r, dados: r.dados.filter((p) => p.ativo).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99)) };
}

export function Marca({ tamanho = "md" }: { tamanho?: "md" | "lg" }) {
  const { torcida } = useTorcida();
  const logo = torcida.tema.logoUrl;
  const sz = tamanho === "lg" ? "size-14" : "size-9";
  return (
    <Link to={`/${torcida.slug}`} className="flex items-center gap-2.5 min-w-0">
      {logo ? (
        <img src={logo} alt="" className={cx(sz, "rounded-xl object-contain bg-superficie-2")} />
      ) : (
        <span className={cx(sz, "rounded-xl grid grid-cols-2 gap-0.5 p-1.5 bg-superficie-2 border border-linha shrink-0")} aria-hidden="true">
          <span className="rounded-[3px] bg-primaria" />
          <span className="rounded-[3px] bg-secundaria" />
          <span className="rounded-[3px] bg-secundaria" />
          <span className="rounded-[3px] bg-texto" />
        </span>
      )}
      <span className={cx("font-display uppercase tracking-tight truncate", tamanho === "lg" ? "text-xl" : "text-[15px]")}>{torcida.nome}</span>
    </Link>
  );
}

export function CabecalhoTorcida() {
  const { tid, torcida } = useTorcida();
  const { ficha, usuario } = useMinhaFicha(tid);
  const ehSocio = socioEmDia(ficha);
  return (
    <header className="sticky top-0 z-30 border-b border-linha bg-fundo/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl h-16 px-4 sm:px-6 flex items-center gap-3">
        <Marca />
        <div className="flex-1" />
        <Link
          to={`/${torcida.slug}/${ficha ? "socio" : "conta"}`}
          className={cx(
            "inline-flex items-center gap-2 h-10 px-3.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 transition-colors",
            ehSocio ? "bg-primaria/15 text-texto border border-primaria/40" : "border border-linha-forte hover:bg-superficie-2",
          )}
        >
          <Icone nome={ehSocio ? "escudo" : "usuario"} className={cx("size-4", ehSocio && "text-primaria-texto")} />
          {ehSocio ? (
            <>
              <span className="sm:hidden">Carteirinha</span>
              <span className="hidden sm:inline">Minha carteirinha</span>
            </>
          ) : usuario && !usuario.isAnonymous ? (
            "Minha conta"
          ) : (
            "Entrar"
          )}
        </Link>
      </div>
    </header>
  );
}

export function RodapeTorcida() {
  const { torcida } = useTorcida();
  const c = torcida.contato ?? {};
  return (
    <footer className="border-t border-linha mt-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row gap-6 sm:items-center justify-between">
        <div>
          <Marca />
          <p className="text-sm text-texto-3 mt-3 max-w-sm">Página oficial de eventos e associação. Pagamentos processados com segurança pela Pagar.me.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.whatsapp && (
            <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-linha hover:bg-superficie-2 text-sm">
              <Icone nome="whatsapp" className="size-4" /> WhatsApp
            </a>
          )}
          {c.instagram && (
            <a href={`https://instagram.com/${c.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-linha hover:bg-superficie-2 text-sm">
              <Icone nome="instagram" className="size-4" /> @{c.instagram.replace(/^@/, "")}
            </a>
          )}
        </div>
      </div>
      <div className="border-t border-linha">
        <p className="mx-auto max-w-6xl px-4 sm:px-6 py-5 text-xs text-texto-3">
          Tecnologia <a href="/" className="font-semibold text-texto-2 hover:text-texto">Somos Organizada</a> · gestão profissional para torcidas organizadas
        </p>
      </div>
    </footer>
  );
}

/** Linha de resumo de valores (checkout). */
export function LinhaValor({ rotulo, valor, forte, sutil }: { rotulo: React.ReactNode; valor: string; forte?: boolean; sutil?: boolean }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4", forte ? "text-lg font-bold pt-3 border-t border-linha" : "text-sm", sutil && "text-texto-3")}>
      <span className={cx(!forte && !sutil && "text-texto-2")}>{rotulo}</span>
      <span className="numeros whitespace-nowrap">{valor}</span>
    </div>
  );
}
