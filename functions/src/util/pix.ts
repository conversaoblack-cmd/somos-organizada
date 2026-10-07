/**
 * "Pix copia e cola" ESTÁTICO (padrão BR Code / EMV do Banco Central) para a mensalidade da
 * plataforma: chave Pix fixa + valor + identificador (txid). Não depende de banco nem de API.
 */
function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

/** CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF), exigido no campo 63 do BR Code. */
export function crc16(dados: string): string {
  let crc = 0xffff;
  for (const ch of Buffer.from(dados, "utf8")) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const limpar = (s: string, max: number) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, "").toUpperCase().slice(0, max).trim() || "X";

export function pixCopiaECola(args: { chave: string; valorCentavos: number; nome: string; cidade: string; txid: string; descricao?: string }): string {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", args.chave.trim()) + (args.descricao ? campo("02", limpar(args.descricao, 40)) : "");
  const txid = args.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const payload =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", (args.valorCentavos / 100).toFixed(2)) +
    campo("58", "BR") +
    campo("59", limpar(args.nome, 25)) +
    campo("60", limpar(args.cidade, 15)) +
    campo("62", campo("05", txid)) +
    "6304";
  return payload + crc16(payload);
}
