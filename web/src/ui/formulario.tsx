import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "./basicos";
import { Icone, type NomeIcone } from "./icones";
import { mascaraCartao, mascaraCep, mascaraCpf, mascaraTelefone, mascaraValidade } from "@/lib/formatos";

const base =
  // 16 px no celular: abaixo disso o iPhone dá zoom ao tocar no campo
  "w-full h-12 rounded-2xl bg-superficie-2 border border-linha px-4 text-base sm:text-[15px] placeholder:text-texto-3 " +
  "outline-none transition-colors focus:border-primaria focus:bg-superficie-3 focus-visible:ring-2 focus-visible:ring-primaria-texto/60 disabled:opacity-60";

export type Mascara = "cpf" | "telefone" | "cep" | "cartao" | "validade" | "moeda";

function aplicarMascara(m: Mascara | undefined, v: string): string {
  switch (m) {
    case "cpf":
      return mascaraCpf(v);
    case "telefone":
      return mascaraTelefone(v);
    case "cep":
      return mascaraCep(v);
    case "cartao":
      return mascaraCartao(v);
    case "validade":
      return mascaraValidade(v);
    case "moeda": {
      const d = v.replace(/\D/g, "").replace(/^0+/, "");
      if (!d) return "";
      const c = d.padStart(3, "0");
      const inteiro = c.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      return `${inteiro},${c.slice(-2)}`;
    }
    default:
      return v;
  }
}

const MODO: Partial<Record<Mascara, InputHTMLAttributes<HTMLInputElement>["inputMode"]>> = {
  cpf: "numeric",
  telefone: "tel",
  cep: "numeric",
  cartao: "numeric",
  validade: "numeric",
  moeda: "numeric",
};

interface PropsCampo extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  rotulo?: ReactNode;
  dica?: ReactNode;
  erro?: string | null | false;
  mascara?: Mascara;
  icone?: NomeIcone;
  sufixo?: ReactNode;
  value: string;
  onChange: (valor: string) => void;
}

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { rotulo, dica, erro, mascara, icone, sufixo, className, value, onChange, id, ...props },
  ref,
) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  return (
    <div className={className} data-erro={erro ? "" : undefined}>
      {rotulo && (
        <label htmlFor={idCampo} className="block text-sm font-medium text-texto-2 mb-1.5">
          {rotulo}
        </label>
      )}
      <div className="relative">
        {icone && <Icone nome={icone} className="size-5 absolute left-4 top-1/2 -translate-y-1/2 text-texto-3 pointer-events-none" />}
        {mascara === "moeda" && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-texto-3 text-[15px]">R$</span>}
        <input
          ref={ref}
          id={idCampo}
          value={value}
          inputMode={MODO[mascara!] ?? props.inputMode}
          aria-invalid={!!erro}
          aria-describedby={erro || dica ? `${idCampo}-ajuda` : undefined}
          onChange={(e) => onChange(aplicarMascara(mascara, e.target.value))}
          className={cx(base, (icone || mascara === "moeda") && "pl-11", !!sufixo && "pr-12", erro && "border-perigo focus:border-perigo")}
          {...props}
        />
        {sufixo && <div className="absolute right-2 top-1/2 -translate-y-1/2">{sufixo}</div>}
      </div>
      {(erro || dica) && (
        <p id={`${idCampo}-ajuda`} className={cx("text-xs mt-1.5", erro ? "text-perigo" : "text-texto-3")}>
          {erro || dica}
        </p>
      )}
    </div>
  );
});

export function Selecao({
  rotulo,
  erro,
  dica,
  className,
  children,
  id,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { rotulo?: ReactNode; erro?: string | null | false; dica?: ReactNode }) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  return (
    <div className={className} data-erro={erro ? "" : undefined}>
      {rotulo && (
        <label htmlFor={idCampo} className="block text-sm font-medium text-texto-2 mb-1.5">
          {rotulo}
        </label>
      )}
      <div className="relative">
        <select
          id={idCampo}
          aria-invalid={!!erro}
          aria-describedby={erro || dica ? `${idCampo}-ajuda` : undefined}
          className={cx(base, "appearance-none pr-10", erro && "border-perigo")}
          {...props}
        >
          {children}
        </select>
        <Icone nome="chevronBaixo" className="size-4 absolute right-4 top-1/2 -translate-y-1/2 text-texto-3 pointer-events-none" />
      </div>
      {(erro || dica) && (
        <p id={`${idCampo}-ajuda`} className={cx("text-xs mt-1.5", erro ? "text-perigo" : "text-texto-3")}>
          {erro || dica}
        </p>
      )}
    </div>
  );
}

export function AreaTexto({
  rotulo,
  dica,
  erro,
  className,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo?: ReactNode; dica?: ReactNode; erro?: string | null | false }) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  return (
    <div className={className}>
      {rotulo && (
        <label htmlFor={idCampo} className="block text-sm font-medium text-texto-2 mb-1.5">
          {rotulo}
        </label>
      )}
      <textarea
        id={idCampo}
        className={cx(base, "h-auto min-h-28 py-3 leading-relaxed resize-y", erro && "border-perigo")}
        {...props}
      />
      {(erro || dica) && <p className={cx("text-xs mt-1.5", erro ? "text-perigo" : "text-texto-3")}>{erro || dica}</p>}
    </div>
  );
}

export function Interruptor({
  ligado,
  onChange,
  rotulo,
  descricao,
  disabled,
}: {
  ligado: boolean;
  onChange: (v: boolean) => void;
  rotulo: ReactNode;
  descricao?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx("flex items-start justify-between gap-4 cursor-pointer", disabled && "opacity-50 cursor-not-allowed")}>
      <span>
        <span className="block text-[15px] font-medium">{rotulo}</span>
        {descricao && <span className="block text-sm text-texto-3 mt-0.5">{descricao}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        disabled={disabled}
        onClick={() => onChange(!ligado)}
        className={cx("relative shrink-0 h-7 w-12 rounded-full transition-colors", ligado ? "bg-primaria" : "bg-superficie-3")}
      >
        <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", ligado ? "left-6" : "left-1")} />
      </button>
    </label>
  );
}

/** Opções em cartões grandes (rádio). Usado em checkout: plano, forma de pagamento, sede. */
export function OpcoesCartao<T extends string>({
  valor,
  onChange,
  opcoes,
  colunas = 2,
  nome,
}: {
  valor: T | null;
  onChange: (v: T) => void;
  nome: string;
  colunas?: 1 | 2 | 3;
  opcoes: { valor: T; titulo: ReactNode; descricao?: ReactNode; icone?: NomeIcone; extra?: ReactNode; desativado?: boolean }[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={nome}
      className={cx("grid gap-3", colunas === 1 ? "grid-cols-1" : colunas === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}
    >
      {opcoes.map((o) => {
        const sel = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={sel}
            disabled={o.desativado}
            onClick={() => onChange(o.valor)}
            className={cx(
              "text-left rounded-2xl border p-4 transition-all flex gap-3 items-start disabled:opacity-40",
              sel ? "border-primaria bg-primaria/10 ring-1 ring-primaria" : "border-linha bg-superficie-2 hover:border-linha-forte",
            )}
          >
            {o.icone && (
              <span className={cx("size-10 shrink-0 rounded-xl grid place-items-center", sel ? "bg-primaria text-sobre-primaria" : "bg-superficie-3 text-texto-2")}>
                <Icone nome={o.icone} className="size-5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{o.titulo}</span>
              {o.descricao && <span className="block text-sm text-texto-2 mt-0.5">{o.descricao}</span>}
              {o.extra}
            </span>
            <span className={cx("size-5 shrink-0 rounded-full border-2 grid place-items-center mt-0.5", sel ? "border-primaria" : "border-linha-forte")}>
              {sel && <span className="size-2.5 rounded-full bg-primaria" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Seletor numérico −/+ */
export function Contador({ valor, onChange, min = 1, max = 10, rotulo }: { valor: number; onChange: (n: number) => void; min?: number; max?: number; rotulo: string }) {
  return (
    <div className="inline-flex items-center rounded-2xl border border-linha bg-superficie-2" role="group" aria-label={rotulo}>
      <button type="button" className="size-11 grid place-items-center disabled:opacity-30" disabled={valor <= min} onClick={() => onChange(valor - 1)} aria-label="Diminuir">
        <Icone nome="menos" className="size-5" />
      </button>
      <span className="w-10 text-center font-bold text-lg numeros" aria-live="polite">
        {valor}
      </span>
      <button type="button" className="size-11 grid place-items-center disabled:opacity-30" disabled={valor >= max} onClick={() => onChange(valor + 1)} aria-label="Aumentar">
        <Icone nome="mais" className="size-5" />
      </button>
    </div>
  );
}
