import type { Tema } from "./tipos";

export const TEMA_PADRAO: Tema = {
  corPrimaria: "#009C3B",
  corSecundaria: "#FFDF00",
  corFundo: "#07090B",
  corTexto: "#F2F5F3",
};

/** Tema neutro dos painéis (diretoria e plataforma). */
export const TEMA_PAINEL: Tema = {
  corPrimaria: "#16A34A",
  corSecundaria: "#FACC15",
  corFundo: "#0A0C0F",
  corTexto: "#EEF2F0",
};

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Preto ou branco, o que tiver mais contraste sobre a cor. */
export const corSobre = (hex: string) => (contraste(hex, "#FFFFFF") >= contraste(hex, "#111111") ? "#FFFFFF" : "#111111");

export const corValida = (c: string) => /^#[0-9A-Fa-f]{6}$/.test(c);

export function aplicarTema(tema: Partial<Tema> | undefined, alvo: HTMLElement = document.documentElement) {
  const t = { ...TEMA_PADRAO, ...(tema ?? {}) };
  const ok = (c: string, padrao: string) => (corValida(c) ? c : padrao);
  const fundo = ok(t.corFundo, TEMA_PADRAO.corFundo);
  const primaria = ok(t.corPrimaria, TEMA_PADRAO.corPrimaria);
  const secundaria = ok(t.corSecundaria, TEMA_PADRAO.corSecundaria);
  alvo.style.setProperty("--cor-fundo", fundo);
  alvo.style.setProperty("--cor-texto", ok(t.corTexto, TEMA_PADRAO.corTexto));
  alvo.style.setProperty("--cor-primaria", primaria);
  alvo.style.setProperty("--cor-secundaria", secundaria);
  alvo.style.setProperty("--cor-sobre-primaria", corSobre(primaria));
  alvo.style.setProperty("--cor-sobre-secundaria", corSobre(secundaria));
  alvo.style.colorScheme = luminancia(fundo) < 0.4 ? "dark" : "light";
  if (alvo === document.documentElement) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", fundo);
}

/** Avisos para a diretoria quando a combinação de cores fica ilegível. */
export function avisosDeContraste(t: Tema): string[] {
  const avisos: string[] = [];
  if (contraste(t.corTexto, t.corFundo) < 4.5) avisos.push("O texto está com pouco contraste sobre o fundo.");
  if (contraste(t.corPrimaria, t.corFundo) < 2) avisos.push("A cor primária quase some sobre o fundo.");
  return avisos;
}
