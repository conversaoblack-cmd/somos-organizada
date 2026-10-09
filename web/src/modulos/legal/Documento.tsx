/** Corpo comum das páginas de Termos e Política: título, data, sumário com âncoras e seções numeradas. */
import type { ReactNode } from "react";
import { ATUALIZADO_EM, type Secao } from "./conteudo";

export function Documento({ titulo, subtitulo, secoes, outro }: { titulo: string; subtitulo: ReactNode; secoes: Secao[]; outro: { href: string; texto: string } }) {
  return (
    <article className="mx-auto w-full max-w-3xl min-w-0 px-4 sm:px-6 py-10 sm:py-14" data-documento-legal>
      <p className="text-xs uppercase tracking-wider text-texto-3">Última atualização: {ATUALIZADO_EM}</p>
      <h1 className="mt-2 font-display uppercase tracking-tight text-3xl sm:text-4xl leading-[1.05] break-words">{titulo}</h1>
      <div className="mt-4 text-texto-2 leading-relaxed">{subtitulo}</div>

      <nav aria-label="Nesta página" className="mt-8 rounded-2xl border border-linha bg-superficie p-5">
        <p className="text-sm font-semibold">Nesta página</p>
        <ol className="mt-3 grid gap-1.5 sm:grid-cols-2 text-sm text-texto-2 list-decimal pl-5">
          {secoes.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="hover:text-texto underline-offset-2 hover:underline">
                {s.titulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {secoes.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-bold">
              {i + 1}. {s.titulo}
            </h2>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-texto-2 break-words">{s.corpo}</div>
          </section>
        ))}
      </div>

      <p className="mt-12 pt-6 border-t border-linha text-sm text-texto-2">
        Veja também:{" "}
        <a href={outro.href} className="font-semibold text-primaria-texto underline underline-offset-2">
          {outro.texto}
        </a>
      </p>
    </article>
  );
}
