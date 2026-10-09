import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { Icone, type NomeIcone } from "./icones";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variante = "primaria" | "secundaria" | "contorno" | "fantasma" | "perigo" | "suave";
type Tamanho = "sm" | "md" | "lg";

const VARIANTES: Record<Variante, string> = {
  primaria: "bg-primaria text-sobre-primaria hover:brightness-110 shadow-[0_8px_30px_-12px_var(--color-primaria)]",
  secundaria: "bg-secundaria text-sobre-secundaria hover:brightness-105",
  contorno: "border border-linha-forte text-texto hover:bg-superficie-2",
  fantasma: "text-texto-2 hover:text-texto hover:bg-superficie-2",
  perigo: "bg-perigo/12 text-perigo hover:bg-perigo/20 border border-perigo/25",
  suave: "bg-superficie-2 text-texto hover:bg-superficie-3",
};
const TAMANHOS: Record<Tamanho, string> = {
  // 44 px no celular (dedo), 36 px no computador
  sm: "min-h-11 sm:min-h-9 py-1.5 px-3.5 text-sm gap-1.5 rounded-xl",
  md: "min-h-11 py-2 px-5 text-[15px] gap-2 rounded-2xl",
  lg: "min-h-14 py-2 px-7 text-base gap-2.5 rounded-2xl",
};

export function classesBotao(variante: Variante = "primaria", tamanho: Tamanho = "md", largo = false) {
  return cx(
    // No celular o texto pode quebrar (o botão cresce na altura): texto longo nunca empurra a tela para o lado
    "inline-flex items-center justify-center font-semibold max-w-full text-center leading-tight whitespace-normal sm:whitespace-nowrap select-none transition-[transform,filter,background-color,color,box-shadow] duration-150",
    "active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
    VARIANTES[variante],
    TAMANHOS[tamanho],
    largo && "w-full",
  );
}

interface PropsBotao extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  largo?: boolean;
  carregando?: boolean;
  icone?: NomeIcone;
  iconeDireita?: NomeIcone;
}

export const Botao = forwardRef<HTMLButtonElement, PropsBotao>(function Botao(
  { variante, tamanho = "md", largo, carregando, icone, iconeDireita, className, children, disabled, type = "button", ...props },
  ref,
) {
  const tamIcone = tamanho === "sm" ? "size-4" : "size-5";
  return (
    <button ref={ref} type={type} disabled={disabled || carregando} className={cx(classesBotao(variante, tamanho, largo), className)} {...props}>
      {carregando ? <Girando className={cx(tamIcone, "shrink-0")} /> : icone && <Icone nome={icone} className={cx(tamIcone, "shrink-0")} />}
      {children}
      {iconeDireita && !carregando && <Icone nome={iconeDireita} className={cx(tamIcone, "shrink-0")} />}
    </button>
  );
});

export function BotaoLink({
  variante,
  tamanho = "md",
  largo,
  icone,
  iconeDireita,
  className,
  children,
  ...props
}: LinkProps & { variante?: Variante; tamanho?: Tamanho; largo?: boolean; icone?: NomeIcone; iconeDireita?: NomeIcone }) {
  const tamIcone = tamanho === "sm" ? "size-4" : "size-5";
  return (
    <Link className={cx(classesBotao(variante, tamanho, largo), className)} {...props}>
      {icone && <Icone nome={icone} className={cx(tamIcone, "shrink-0")} />}
      {children}
      {iconeDireita && <Icone nome={iconeDireita} className={cx(tamIcone, "shrink-0")} />}
    </Link>
  );
}

export function BotaoIcone({
  icone,
  rotulo,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icone: NomeIcone; rotulo: string }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      className={cx(
        "inline-grid place-items-center size-11 sm:size-10 rounded-xl text-texto-2 hover:text-texto hover:bg-superficie-2 transition-colors disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <Icone nome={icone} className="size-5" />
    </button>
  );
}

export function Girando({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Carregando({ texto, className }: { texto?: string; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-3 py-16 text-texto-3", className)} role="status">
      <Girando className="size-7 text-primaria-texto" />
      {texto && <p className="text-sm">{texto}</p>}
    </div>
  );
}

export function TelaCarregando() {
  return (
    <div className="min-h-dvh grid place-items-center">
      <div className="grid grid-cols-4 gap-1.5" role="status" aria-label="Carregando">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <span
            key={i}
            className="size-3.5 rounded-[4px] animate-pulse"
            style={{
              animationDelay: `${i * 90}ms`,
              background: ["var(--color-primaria)", "var(--color-secundaria)", "var(--color-texto)"][i % 3],
              opacity: 0.85,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-superficie-2", className)} />;
}

export function Cartao({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-cartao border border-linha bg-superficie", className)} {...props}>
      {children}
    </div>
  );
}

export type Tom = "sucesso" | "alerta" | "perigo" | "info" | "neutro" | "primaria";

const TONS: Record<Tom, string> = {
  sucesso: "bg-sucesso/12 text-sucesso border-sucesso/25",
  alerta: "bg-alerta/12 text-alerta border-alerta/25",
  perigo: "bg-perigo/12 text-perigo border-perigo/25",
  info: "bg-info/12 text-info border-info/25",
  neutro: "bg-superficie-2 text-texto-2 border-linha",
  primaria: "bg-primaria/15 text-primaria-texto border-primaria/30",
};

export function Selo({ tom = "neutro", children, className, ponto }: { tom?: Tom; children: ReactNode; className?: string; ponto?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONS[tom], className)}>
      {ponto && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Aviso({
  tom = "info",
  titulo,
  children,
  className,
  acao,
}: {
  tom?: Exclude<Tom, "neutro" | "primaria">;
  titulo?: ReactNode;
  children?: ReactNode;
  className?: string;
  acao?: ReactNode;
}) {
  const icone: NomeIcone = tom === "sucesso" ? "checkCirculo" : tom === "perigo" ? "xCirculo" : tom === "alerta" ? "alerta" : "info";
  return (
    <div className={cx("flex gap-3 rounded-2xl border p-4 text-sm", TONS[tom], className)} role={tom === "perigo" ? "alert" : "status"}>
      <Icone nome={icone} className="size-5 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1 text-texto">
        {titulo && <p className="font-semibold mb-0.5">{titulo}</p>}
        {children && <div className="text-texto-2">{children}</div>}
        {acao && <div className="mt-3">{acao}</div>}
      </div>
    </div>
  );
}

export function Vazio({ icone = "info", titulo, children, acao }: { icone?: NomeIcone; titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="size-14 rounded-2xl bg-superficie-2 grid place-items-center text-texto-3 mb-4">
        <Icone nome={icone} className="size-7" />
      </div>
      <p className="font-semibold text-lg">{titulo}</p>
      {children && <div className="text-texto-2 text-sm mt-1 max-w-sm">{children}</div>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

/** Bloco de KPI para dashboards. */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  icone,
  tom,
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone?: NomeIcone;
  tom?: Tom;
  className?: string;
}) {
  return (
    <Cartao className={cx("p-5", className)}>
      <div className="flex items-center justify-between gap-2 text-texto-2 text-sm">
        <span>{rotulo}</span>
        {icone && (
          <span className={cx("size-8 rounded-xl grid place-items-center", tom ? TONS[tom] : "bg-superficie-2 text-texto-2")}>
            <Icone nome={icone} className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-2 text-[28px] leading-tight font-bold numeros tracking-tight">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-texto-3">{detalhe}</p>}
    </Cartao>
  );
}

export function Avatar({ nome, url, tamanho = "size-10", className }: { nome: string; url?: string | null; tamanho?: string; className?: string }) {
  const ini = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return url ? (
    <img src={url} alt="" className={cx(tamanho, "rounded-full object-cover bg-superficie-2", className)} />
  ) : (
    <span className={cx(tamanho, "rounded-full grid place-items-center bg-primaria/15 text-primaria-texto font-bold text-sm", className)}>{ini}</span>
  );
}

export function Divisor({ className }: { className?: string }) {
  return <hr className={cx("border-linha", className)} />;
}

/** Título de seção de página de painel. */
export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight">{titulo}</h1>
        {descricao && <p className="text-texto-2 mt-1 text-sm sm:text-base">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}
