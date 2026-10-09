/**
 * /termos e /privacidade: Termos de uso e Política de privacidade da Somos Organizada
 * (para quem cadastra e administra torcidas). As da torcida, para o torcedor, ficam em PaginaLegalTorcida.
 */
import { useEffect } from "react";
import { aplicarTema, TEMA_PAINEL } from "@/lib/tema";
import { Documento } from "./Documento";
import { EMPRESA, privacidadePlataforma, termosPlataforma } from "./conteudo";

export default function PaginaLegal({ tipo }: { tipo: "termos" | "privacidade" }) {
  const termos = tipo === "termos";
  const titulo = termos ? "Termos de uso" : "Política de privacidade";
  useEffect(() => {
    aplicarTema(TEMA_PAINEL);
    document.title = `${titulo} · Somos Organizada`;
  }, [titulo]);
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-linha">
        <div className="mx-auto max-w-6xl h-16 px-4 sm:px-6 flex items-center gap-3">
          <a href="/" className="font-display uppercase tracking-tight flex items-center gap-2 text-[15px] min-h-11" aria-label="Somos Organizada, página inicial">
            <span className="grid grid-cols-2 gap-0.5 size-7 p-1 rounded-lg bg-superficie-2 border border-linha" aria-hidden="true">
              <span className="rounded-[2px] bg-primaria" />
              <span className="rounded-[2px] bg-secundaria" />
              <span className="rounded-[2px] bg-secundaria" />
              <span className="rounded-[2px] bg-texto" />
            </span>
            Somos Organizada
          </a>
        </div>
      </header>
      <main className="flex-1">
        <Documento
          titulo={titulo}
          subtitulo={
            termos ? (
              <p>Regras de uso da plataforma Somos Organizada pelas torcidas: diretoria, subsedes e portaria.</p>
            ) : (
              <p>Como a Somos Organizada trata os dados de quem visita o site, cadastra e administra uma torcida.</p>
            )
          }
          secoes={termos ? termosPlataforma() : privacidadePlataforma()}
          outro={termos ? { href: "/privacidade", texto: "Política de privacidade" } : { href: "/termos", texto: "Termos de uso" }}
        />
      </main>
      <footer className="border-t border-linha py-5 px-4 text-center text-xs text-texto-2">
        {EMPRESA.nome} · {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj} ·{" "}
        <a href={`mailto:${EMPRESA.email}`} className="underline underline-offset-2">
          {EMPRESA.email}
        </a>
      </footer>
    </div>
  );
}
