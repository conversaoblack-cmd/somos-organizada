/**
 * "Salvar ingresso": imagem PNG com o QR, o evento, a data, o titular e o código, desenhada no próprio celular
 * (canvas, sem biblioteca nova). É a reserva para a portaria sem internet: fica na galeria/arquivos do aparelho.
 */
import QRCode from "qrcode";

export interface DadosImagemIngresso {
  torcidaNome: string;
  eventoNome: string;
  eventoData: Date;
  titularNome: string;
  /** Já mascarado ("***.456.789-**"). */
  titularCpf: string;
  tipo: "socio" | "publico";
  codigo: string;
  qr: string;
}

const LARGURA = 1080;
const MARGEM = 80;
const TEXTO = "#0A0C0F";
const TEXTO_2 = "#3F4652";
const TEXTO_3 = "#646B78";
const SANS = '"Archivo", ui-sans-serif, system-ui, sans-serif';
const TITULO = '"Archivo Black", "Archivo", ui-sans-serif, system-ui, sans-serif';

const fmtSP = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o });

function corDoTema(variavel: string, padrao: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variavel).trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^rgb/i.test(v) ? v : padrao;
}

/** Quebra o texto em linhas que cabem na largura (no máximo `max`, a última com reticências). */
function linhas(ctx: CanvasRenderingContext2D, texto: string, largura: number, max: number): string[] {
  const palavras = texto.trim().split(/\s+/);
  const saida: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(tentativa).width <= largura || !atual) atual = tentativa;
    else {
      saida.push(atual);
      atual = p;
    }
  }
  if (atual) saida.push(atual);
  if (saida.length > max) {
    const cortadas = saida.slice(0, max);
    let ultima = cortadas[max - 1]!;
    while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > largura) ultima = ultima.slice(0, -1);
    cortadas[max - 1] = `${ultima.trimEnd()}…`;
    return cortadas;
  }
  return saida;
}

/** Desenha o ingresso e devolve o PNG. */
export async function desenharIngresso(d: DadosImagemIngresso): Promise<Blob> {
  // As fontes do site já estão no aparelho (guardadas pelo service worker); sem elas, usa a do sistema
  await Promise.all([document.fonts?.load(`64px ${TITULO}`), document.fonts?.load(`700 40px ${SANS}`)].map((p) => p?.catch(() => undefined)));

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA;
  canvas.height = 2400; // cortado no fim, na altura usada
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este celular não conseguiu gerar a imagem. Tire um print do ingresso.");
  const util = LARGURA - MARGEM * 2;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, LARGURA, canvas.height);
  ctx.textBaseline = "alphabetic";

  // Faixa com as cores da torcida
  ctx.fillStyle = corDoTema("--cor-primaria", "#1F4FD1");
  ctx.fillRect(0, 0, LARGURA * 0.75, 28);
  ctx.fillStyle = corDoTema("--cor-secundaria", "#F5C518");
  ctx.fillRect(LARGURA * 0.75, 0, LARGURA * 0.25, 28);

  let y = 28 + 92;
  ctx.fillStyle = TEXTO_3;
  ctx.font = `700 32px ${SANS}`;
  for (const l of linhas(ctx, d.torcidaNome.toUpperCase(), util, 2)) {
    ctx.fillText(l, MARGEM, y);
    y += 42;
  }

  y += 30;
  ctx.fillStyle = TEXTO;
  ctx.font = `64px ${TITULO}`;
  for (const l of linhas(ctx, d.eventoNome, util, 3)) {
    ctx.fillText(l, MARGEM, y);
    y += 76;
  }

  const dia = fmtSP({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d.eventoData);
  const hora = fmtSP({ hour: "2-digit", minute: "2-digit" }).format(d.eventoData);
  y += 6;
  ctx.fillStyle = TEXTO_2;
  ctx.font = `500 38px ${SANS}`;
  for (const l of linhas(ctx, `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, às ${hora}`, util, 2)) {
    ctx.fillText(l, MARGEM, y);
    y += 50;
  }

  // QR grande, preto no branco, com a margem de silêncio que o leitor da portaria precisa
  y += 40;
  const qr = QRCode.create(d.qr, { errorCorrectionLevel: "M" });
  const modulos = qr.modules.size;
  const lado = 760;
  const silencio = 4;
  const passo = Math.floor(lado / (modulos + silencio * 2));
  const ladoReal = passo * (modulos + silencio * 2);
  const x0 = Math.round((LARGURA - ladoReal) / 2);
  ctx.strokeStyle = "#D5D9E0";
  ctx.lineWidth = 3;
  ctx.strokeRect(x0 - 2, y - 2, ladoReal + 4, ladoReal + 4);
  ctx.fillStyle = TEXTO;
  for (let linha = 0; linha < modulos; linha++) {
    for (let coluna = 0; coluna < modulos; coluna++) {
      if (qr.modules.get(linha, coluna)) ctx.fillRect(x0 + (coluna + silencio) * passo, y + (linha + silencio) * passo, passo, passo);
    }
  }
  y += ladoReal + 70;

  ctx.textAlign = "center";
  ctx.fillStyle = TEXTO_3;
  ctx.font = `700 26px ${SANS}`;
  ctx.fillText("CÓDIGO", LARGURA / 2, y);
  y += 66;
  ctx.fillStyle = TEXTO;
  ctx.font = `700 60px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "6px";
  ctx.fillText(d.codigo, LARGURA / 2, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.textAlign = "left";

  // Picote
  y += 56;
  ctx.strokeStyle = "#C3C8D1";
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(MARGEM, y);
  ctx.lineTo(LARGURA - MARGEM, y);
  ctx.stroke();
  ctx.setLineDash([]);

  y += 74;
  ctx.fillStyle = TEXTO_3;
  ctx.font = `700 26px ${SANS}`;
  ctx.fillText("TITULAR (INTRANSFERÍVEL)", MARGEM, y);
  y += 56;
  ctx.fillStyle = TEXTO;
  ctx.font = `700 44px ${SANS}`;
  for (const l of linhas(ctx, d.titularNome, util, 2)) {
    ctx.fillText(l, MARGEM, y);
    y += 54;
  }
  ctx.fillStyle = TEXTO_2;
  ctx.font = `500 34px ${SANS}`;
  ctx.fillText(`CPF ${d.titularCpf}`, MARGEM, y);
  y += 48;
  ctx.fillText(d.tipo === "socio" ? "Ingresso de sócio" : "Ingresso público", MARGEM, y);

  y += 76;
  ctx.fillStyle = TEXTO_3;
  ctx.font = `500 30px ${SANS}`;
  for (const l of linhas(ctx, "Na portaria, mostre este QR com um documento com foto do titular. Aumente o brilho da tela.", util, 3)) {
    ctx.fillText(l, MARGEM, y);
    y += 42;
  }
  y += 50;

  const final = document.createElement("canvas");
  final.width = LARGURA;
  final.height = Math.min(canvas.height, Math.ceil(y));
  final.getContext("2d")!.drawImage(canvas, 0, 0);
  return new Promise((ok, falhou) =>
    final.toBlob((b) => (b ? ok(b) : falhou(new Error("Este celular não conseguiu gerar a imagem. Tire um print do ingresso."))), "image/png"),
  );
}

const ehIphone = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Gera a imagem e entrega ao aparelho: no iPhone abre o compartilhar ("Salvar imagem" vai para Fotos);
 * nos outros, baixa o arquivo (Android guarda em Downloads, que aparece na galeria).
 * Devolve false se a pessoa cancelou.
 */
export async function salvarImagemIngresso(d: DadosImagemIngresso): Promise<boolean> {
  const blob = await desenharIngresso(d);
  const nome = `ingresso-${(d.codigo || "qr").replace(/[^a-z0-9]/gi, "")}.png`;
  const arquivo = new File([blob], nome, { type: "image/png" });
  if (ehIphone() && navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: `Ingresso: ${d.eventoNome}` });
      return true;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return false;
      // compartilhar falhou: cai no download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
