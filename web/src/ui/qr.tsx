import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cx } from "./basicos";

/** QR Code em SVG (nítido em qualquer tamanho, inclusive impresso). */
export function QrCode({ valor, className, cor = "#0A0C0F", fundo = "#FFFFFF" }: { valor: string; className?: string; cor?: string; fundo?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(valor, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: cor, light: fundo } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [valor, cor, fundo]);
  return (
    <div
      className={cx("aspect-square rounded-2xl overflow-hidden bg-white p-2 [&>svg]:w-full [&>svg]:h-full", className)}
      role="img"
      aria-label="QR Code"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
