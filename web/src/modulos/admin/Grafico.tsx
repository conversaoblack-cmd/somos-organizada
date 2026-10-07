import { useEffect, useRef, useState } from "react";
import { moeda } from "@/lib/formatos";

export interface PontoReceita {
  rotulo: string;
  ingressos: number;
  socios: number;
}

/** Abrevia valores do eixo: 123456 centavos → "R$ 1,2 mil". */
function eixo(centavos: number): string {
  const r = centavos / 100;
  if (r >= 1_000_000) return `R$ ${(r / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (r >= 1000) return `R$ ${(r / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(r)}`;
}

function escalaBonita(max: number): number {
  if (max <= 0) return 10000;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / exp;
  const passo = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return passo * exp;
}

/** Barras empilhadas (ingressos + sócios) em SVG próprio, com dica ao passar o dedo/mouse. */
export function GraficoReceita({ dados, altura = 220 }: { dados: PontoReceita[]; altura?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(600);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setLargura(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxTotal = Math.max(0, ...dados.map((d) => d.ingressos + d.socios));
  const topo = escalaBonita(maxTotal);
  const margem = { esq: 64, dir: 8, cima: 12, baixo: 28 };
  const w = largura - margem.esq - margem.dir;
  const h = altura - margem.cima - margem.baixo;
  const coluna = w / Math.max(1, dados.length);
  const barra = Math.min(40, coluna * 0.5);
  const y = (v: number) => margem.cima + h - (v / topo) * h;
  const linhas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * topo);
  const GAP = 2;

  // Retângulo com topo arredondado (4px) ancorado na base.
  const barraArredondada = (x: number, y0: number, alt: number, raio: number) => {
    if (alt <= 0) return "";
    const r = Math.min(raio, alt, barra / 2);
    return `M${x},${y0 + alt} V${y0 + r} Q${x},${y0} ${x + r},${y0} H${x + barra - r} Q${x + barra},${y0} ${x + barra},${y0 + r} V${y0 + alt} Z`;
  };

  const d = ativo != null ? dados[ativo] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-texto-2 mb-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primaria" /> Ingressos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-secundaria" /> Sócios
        </span>
      </div>
      <div ref={ref} className="relative w-full" onMouseLeave={() => setAtivo(null)}>
        <svg width={largura} height={altura} role="img" aria-label="Receita dos últimos meses" className="block overflow-visible">
          {linhas.map((v) => (
            <g key={v}>
              <line x1={margem.esq} x2={largura - margem.dir} y1={y(v)} y2={y(v)} stroke="var(--color-linha)" strokeDasharray={v === 0 ? undefined : "3 4"} />
              <text x={margem.esq - 10} y={y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-texto-3)" className="numeros">
                {eixo(v)}
              </text>
            </g>
          ))}
          {dados.map((p, i) => {
            const x = margem.esq + i * coluna + (coluna - barra) / 2;
            const hIng = (p.ingressos / topo) * h;
            const hSoc = (p.socios / topo) * h;
            const base = margem.cima + h;
            const temAmbos = hIng > 0 && hSoc > 0;
            const apagado = ativo != null && ativo !== i;
            return (
              <g key={p.rotulo} opacity={apagado ? 0.45 : 1} style={{ transition: "opacity .15s" }}>
                {/* ingressos embaixo; sócios em cima com 2px de respiro */}
                {hIng > 0 &&
                  (hSoc > 0 ? (
                    <rect x={x} y={base - hIng} width={barra} height={hIng} fill="var(--color-primaria)" />
                  ) : (
                    <path d={barraArredondada(x, base - hIng, hIng, 4)} fill="var(--color-primaria)" />
                  ))}
                {hSoc > 0 && (
                  <path d={barraArredondada(x, base - hIng - hSoc - (temAmbos ? GAP : 0), hSoc, 4)} fill="var(--color-secundaria)" />
                )}
                <text x={x + barra / 2} y={altura - 8} textAnchor="middle" fontSize="11" fill={ativo === i ? "var(--color-texto)" : "var(--color-texto-3)"}>
                  {p.rotulo}
                </text>
                <rect
                  x={margem.esq + i * coluna}
                  y={margem.cima}
                  width={coluna}
                  height={h + margem.baixo}
                  fill="transparent"
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => setAtivo(ativo === i ? null : i)}
                  style={{ cursor: "pointer" }}
                />
              </g>
            );
          })}
        </svg>
        {d && ativo != null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-linha bg-fundo/95 backdrop-blur px-3 py-2 text-xs shadow-xl min-w-40"
            style={{
              left: Math.min(Math.max(margem.esq + ativo * coluna + coluna / 2, 80), largura - 80),
              top: Math.max(0, y(d.ingressos + d.socios) - 78),
            }}
          >
            <p className="font-semibold text-texto mb-1">{d.rotulo}</p>
            <p className="flex justify-between gap-4 text-texto-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-primaria" />
                Ingressos
              </span>
              <span className="numeros text-texto">{moeda(d.ingressos)}</span>
            </p>
            <p className="flex justify-between gap-4 text-texto-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-secundaria" />
                Sócios
              </span>
              <span className="numeros text-texto">{moeda(d.socios)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
