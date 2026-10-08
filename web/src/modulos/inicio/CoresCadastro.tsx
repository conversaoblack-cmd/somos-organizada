import { useEffect, useRef } from "react";
import { aplicarTema, avisosDeContraste, corValida, PALETAS } from "@/lib/tema";
import type { Tema } from "@/lib/tipos";
import { cx, Icone } from "@/ui";

export type Cores = Pick<Tema, "corPrimaria" | "corSecundaria" | "corFundo" | "corTexto">;

const FUNDOS = {
  escuro: { corFundo: "#08090C", corTexto: "#F3F4F6" },
  claro: { corFundo: "#F7F7F5", corTexto: "#141414" },
} as const;

const mesmaPaleta = (a: Cores, b: Cores) =>
  (Object.keys(b) as (keyof Cores)[]).every((k) => a[k].toUpperCase() === b[k].toUpperCase());

/**
 * Cores da torcida no cadastro: paleta pronta ou cor principal e secundária livres, fundo escuro ou claro.
 * Valem para o site e para o painel desde o primeiro acesso; dá para trocar depois em Personalizar.
 */
export function CoresCadastro({ cores, onChange, erro }: { cores: Cores | null; onChange: (c: Cores) => void; erro?: string | false | null }) {
  const previa = useRef<HTMLDivElement>(null);
  const base: Cores = cores ?? PALETAS[0].tema;
  const claro = base.corFundo.toUpperCase() === FUNDOS.claro.corFundo;
  const avisos = cores && corValida(cores.corPrimaria) && corValida(cores.corSecundaria) ? avisosDeContraste(cores as Tema) : [];

  useEffect(() => {
    if (!previa.current || !cores) return;
    aplicarTema(cores, previa.current);
    // aplicarTema também mexe na cor da barra do navegador; a página de cadastro mantém a dela.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#070A12");
  }, [cores]);

  const mudarCor = (k: "corPrimaria" | "corSecundaria", v: string) => onChange({ ...base, [k]: v.toUpperCase() });

  return (
    <div>
      <p className="block text-sm font-medium text-texto-2 mb-1.5">Cores da torcida</p>
      <p className="text-xs text-texto-3 mb-3">Usadas no site e no painel desde o primeiro acesso. Dá para ajustar depois.</p>
      <div className="flex flex-wrap gap-2">
        {PALETAS.map((p) => {
          const ativa = !!cores && mesmaPaleta(cores, p.tema);
          return (
            <button
              key={p.nome}
              type="button"
              aria-pressed={ativa}
              onClick={() => onChange({ ...p.tema })}
              className={cx(
                "inline-flex items-center gap-2 h-11 sm:h-9 pl-2 pr-3 rounded-xl border text-sm font-medium transition-colors",
                ativa ? "border-primaria bg-primaria/10" : "border-linha bg-superficie-2 hover:border-linha-forte",
              )}
            >
              <span className="flex -space-x-1">
                {[p.tema.corFundo, p.tema.corPrimaria, p.tema.corSecundaria].map((c, i) => (
                  <span key={i} className="size-4 rounded-full border border-linha-forte" style={{ background: c }} />
                ))}
              </span>
              {p.nome}
            </button>
          );
        })}
      </div>

      {cores && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            {(
              [
                ["corPrimaria", "Cor principal"],
                ["corSecundaria", "Cor secundária"],
              ] as const
            ).map(([k, rotulo]) => (
              <label key={k} className="flex items-center gap-3 rounded-2xl bg-superficie-2 border border-linha px-3 h-12 cursor-pointer">
                <input
                  type="color"
                  value={corValida(cores[k]) ? cores[k].toLowerCase() : "#000000"}
                  onChange={(e) => mudarCor(k, e.target.value)}
                  className="h-8 w-10 shrink-0 rounded-lg bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-lg"
                />
                <span className="text-sm flex-1">{rotulo}</span>
                <span className="font-mono text-xs text-texto-3">{cores[k].toUpperCase()}</span>
              </label>
            ))}
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Fundo do site">
              {(["escuro", "claro"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={f === "claro" ? claro : !claro}
                  onClick={() => onChange({ ...base, ...FUNDOS[f] })}
                  className={cx(
                    "h-11 sm:h-10 rounded-xl border text-sm font-medium",
                    (f === "claro" ? claro : !claro) ? "border-primaria bg-primaria/10" : "border-linha bg-superficie-2 hover:border-linha-forte",
                  )}
                >
                  Fundo {f}
                </button>
              ))}
            </div>
          </div>

          <div ref={previa} className="rounded-2xl overflow-hidden border border-linha bg-fundo text-texto" aria-hidden="true">
            <div className="h-10 px-3 flex items-center gap-2 border-b border-linha">
              <span className="size-5 rounded-md bg-primaria" />
              <span className="text-xs font-bold uppercase tracking-wide truncate">Prévia</span>
              <span className="ml-auto text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-secundaria text-sobre-secundaria">Sócio</span>
            </div>
            <div className="p-3 space-y-2">
              <div className="h-2.5 w-2/3 rounded bg-texto/80" />
              <div className="h-2 w-1/2 rounded bg-texto-3" />
              <div className="h-9 mt-3 rounded-xl bg-primaria text-sobre-primaria text-xs font-bold grid place-items-center">Comprar ingresso</div>
            </div>
          </div>
        </div>
      )}

      {avisos.length > 0 && (
        <p className="text-xs text-alerta mt-2 flex gap-1.5">
          <Icone nome="alerta" className="size-4 shrink-0" /> {avisos.join(" ")}
        </p>
      )}
      {erro && <p className="text-xs text-perigo mt-2">{erro}</p>}
    </div>
  );
}
