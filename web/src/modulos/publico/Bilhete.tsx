import { cpfMascarado, dataExtensa, hora } from "@/lib/formatos";
import { cx, QrCode, Selo } from "@/ui";

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export interface DadosBilhete {
  id: string;
  eventoNome: string;
  eventoData: Date;
  tipo: "socio" | "publico";
  titularNome: string;
  titularCpf: string;
  codigo: string;
  qr: string;
  status: "valido" | "usado" | "cancelado";
}

/** Ingresso digital com canhoto picotado e QR. */
export function Bilhete({ b, torcidaNome }: { b: DadosBilhete; torcidaNome: string }) {
  const inativo = b.status !== "valido";
  return (
    <article className={cx("relative rounded-[24px] overflow-hidden border border-linha bg-superficie animate-surgir", inativo && "opacity-60")}>
      <div className="h-1.5 flex">
        <span className="flex-[3] bg-primaria" />
        <span className="flex-1 bg-secundaria" />
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-texto-3">{torcidaNome}</p>
            <h3 className="font-bold text-lg leading-snug mt-1">{b.eventoNome}</h3>
            <p className="text-sm text-texto-2">
              {maiuscula(dataExtensa(b.eventoData))} · {hora(b.eventoData)}
            </p>
          </div>
          <Selo tom={b.tipo === "socio" ? "primaria" : "neutro"}>{b.tipo === "socio" ? "Sócio" : "Público"}</Selo>
        </div>
      </div>
      {/* picote */}
      <div className="relative h-6">
        <span className="absolute -left-3 top-0 size-6 rounded-full bg-fundo border border-linha" />
        <span className="absolute -right-3 top-0 size-6 rounded-full bg-fundo border border-linha" />
        <span className="absolute left-5 right-5 top-1/2 border-t-2 border-dashed border-linha-forte" />
      </div>
      <div className="p-5 sm:p-6 pt-3 grid grid-cols-[1fr_auto] gap-5 items-center">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-texto-3">Titular (intransferível)</p>
            <p className="font-semibold truncate">{b.titularNome}</p>
            <p className="text-sm text-texto-2 numeros">{cpfMascarado(b.titularCpf)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-texto-3">Código</p>
            <p className="font-mono font-bold tracking-wider">{b.codigo}</p>
          </div>
          {b.status === "usado" && <Selo tom="info">Entrada registrada</Selo>}
          {b.status === "cancelado" && <Selo tom="perigo">Cancelado</Selo>}
        </div>
        <QrCode valor={b.qr} className="w-32 sm:w-36" />
      </div>
    </article>
  );
}
