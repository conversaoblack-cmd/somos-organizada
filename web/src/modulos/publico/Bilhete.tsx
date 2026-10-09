import { useState } from "react";
import { cpfMascarado, dataExtensa, hora } from "@/lib/formatos";
import { salvarImagemIngresso, type DadosImagemIngresso } from "@/lib/imagemIngresso";
import { Botao, cx, Selo, useToast } from "@/ui";
import { QrCode } from "@/ui/qr";

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

/** Reserva para a portaria sem internet: imagem com o QR na galeria/arquivos do celular. */
export function BotaoSalvarIngresso({ dados, className }: { dados: DadosImagemIngresso; className?: string }) {
  const avisar = useToast();
  const [gerando, setGerando] = useState(false);
  async function salvar() {
    setGerando(true);
    try {
      if (await salvarImagemIngresso(dados)) avisar("Imagem do ingresso salva no celular. Ela abre mesmo sem internet.", "sucesso");
    } catch {
      avisar("Não foi possível gerar a imagem. Tire um print da tela do ingresso.", "erro");
    } finally {
      setGerando(false);
    }
  }
  return (
    <Botao variante="contorno" icone="download" largo carregando={gerando} onClick={salvar} className={className}>
      Salvar ingresso (imagem)
    </Botao>
  );
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
            <h3 className="font-bold text-lg leading-snug mt-1 break-words">{b.eventoNome}</h3>
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
            <p className="font-semibold break-words">{b.titularNome}</p>
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
      {b.status === "valido" && (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <BotaoSalvarIngresso
            dados={{
              torcidaNome,
              eventoNome: b.eventoNome,
              eventoData: b.eventoData,
              titularNome: b.titularNome,
              titularCpf: cpfMascarado(b.titularCpf),
              tipo: b.tipo,
              codigo: b.codigo,
              qr: b.qr,
            }}
          />
        </div>
      )}
    </article>
  );
}
