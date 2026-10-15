/**
 * Destino do botão "Copiar código Pix" dos e-mails (somosorganizada.com.br/pix?c=<código>).
 * E-mail não roda código, então não copia nada sozinho: esta página mostra o QR, quem recebe e o valor (lidos do
 * próprio código) e copia com um toque. Só aceita código Pix válido (CRC conferido), nada vai para o servidor.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { aplicarTema, TEMA_PAINEL } from "@/lib/tema";
import { copiarTexto } from "@/lib/servicos";
import { moeda } from "@/lib/formatos";
import { Botao, Cartao, Icone } from "@/ui";
import { QrCode } from "@/ui/qr";

/** CRC16-CCITT do padrão Pix (o mesmo de functions/src/util/pix.ts). */
function crc16(dados: string): string {
  let crc = 0xffff;
  // bytes em UTF-8, como o servidor (Buffer) e os bancos calculam
  for (const byte of new TextEncoder().encode(dados)) {
    crc ^= byte << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Lê os campos do código (ID de 2 dígitos + tamanho de 2 dígitos + valor). */
function campos(c: string): Record<string, string> {
  const r: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= c.length) {
    const id = c.slice(i, i + 2);
    const n = Number(c.slice(i + 2, i + 4));
    if (!Number.isFinite(n)) break;
    r[id] = c.slice(i + 4, i + 4 + n);
    i += 4 + n;
  }
  return r;
}

export function lerPix(c: string): { valido: boolean; recebedor?: string; cidade?: string; valorCentavos?: number } {
  const m = /6304([0-9A-F]{4})$/.exec(c);
  if (c.length < 50 || c.length > 512 || !c.startsWith("000201") || !m || crc16(c.slice(0, -4)) !== m[1]) return { valido: false };
  const f = campos(c);
  const valor = f["54"] ? Math.round(parseFloat(f["54"]) * 100) : undefined;
  return { valido: true, recebedor: f["59"]?.trim(), cidade: f["60"]?.trim(), valorCentavos: Number.isFinite(valor) ? valor : undefined };
}

export default function PaginaPix() {
  const [params] = useSearchParams();
  const codigo = (params.get("c") ?? "").trim();
  const pix = useMemo(() => lerPix(codigo), [codigo]);
  const [copiado, setCopiado] = useState<boolean | null>(null);

  useEffect(() => {
    aplicarTema(TEMA_PAINEL);
    document.title = "Pagar com Pix · Somos Organizada";
  }, []);

  if (!pix.valido) {
    return (
      <div className="min-h-dvh grid place-items-center px-4 py-10">
        <Cartao className="w-full max-w-md p-7 text-center space-y-3">
          <span className="mx-auto size-12 rounded-2xl bg-perigo/15 text-perigo grid place-items-center">
            <Icone nome="alerta" className="size-6" />
          </span>
          <h1 className="text-xl font-bold">Código Pix incompleto</h1>
          <p className="text-sm text-texto-2">Abra de novo pelo botão do e-mail. Se continuar assim, pague pelo painel ou fale com a equipe.</p>
        </Cartao>
      </div>
    );
  }

  return (
    <div className="min-h-dvh grid items-start justify-items-center sm:items-center px-4 pt-[calc(var(--topo-seguro)+2rem)] pb-10 sm:py-10">
      <Cartao className="w-full max-w-md p-6 sm:p-7 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-primaria-texto">Pagar com Pix</p>
        {pix.valorCentavos ? <p className="mt-2 font-display text-4xl numeros">{moeda(pix.valorCentavos)}</p> : null}
        {pix.recebedor && (
          <p className="mt-1 text-sm text-texto-2">
            Para <strong className="text-texto">{pix.recebedor}</strong>
            {pix.cidade ? ` · ${pix.cidade}` : ""}
          </p>
        )}
        <div className="mt-5 mx-auto w-56 rounded-2xl bg-white p-3">
          <QrCode valor={codigo} className="w-full" />
        </div>
        <Botao
          className="mt-6"
          largo
          tamanho="lg"
          icone={copiado ? "check" : "copiar"}
          onClick={async () => setCopiado(await copiarTexto(codigo))}
          data-copiar-pix
        >
          {copiado ? "Código copiado" : "Copiar código Pix"}
        </Botao>
        <p className="mt-3 text-sm text-texto-2" aria-live="polite">
          {copiado
            ? "Agora abra o app do banco, escolha Pix → Pix copia e cola e cole o código."
            : copiado === false
              ? "Não deu para copiar neste navegador. Use o QR Code acima no app do banco."
              : "No computador, leia o QR Code com o app do banco. No celular, copie o código e use Pix copia e cola."}
        </p>
      </Cartao>
    </div>
  );
}
