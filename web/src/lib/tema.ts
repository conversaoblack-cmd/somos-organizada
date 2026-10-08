import type { Tema } from "./tipos";

/** Cores da Somos Organizada: azul e amarelo (sem verde, que é cor de rival para muitas torcidas). */
export const TEMA_PADRAO: Tema = {
  corPrimaria: "#2E6BFF",
  corSecundaria: "#FFCC00",
  corFundo: "#070A12",
  corTexto: "#F1F4FA",
};

/** Tema do painel da plataforma e do login geral. */
export const TEMA_PAINEL: Tema = {
  corPrimaria: "#2E6BFF",
  corSecundaria: "#FACC15",
  corFundo: "#0A0D14",
  corTexto: "#EEF1F7",
};

type Cores = Pick<Tema, "corPrimaria" | "corSecundaria" | "corFundo" | "corTexto">;

/** Paletas prontas (cadastro e personalização). A torcida pode ajustar cada cor depois. */
export const PALETAS: { nome: string; tema: Cores }[] = [
  { nome: "Alvinegro", tema: { corPrimaria: "#FFFFFF", corSecundaria: "#9CA3AF", corFundo: "#050505", corTexto: "#F5F5F5" } },
  { nome: "Rubro-negro", tema: { corPrimaria: "#D7141A", corSecundaria: "#F5F5F5", corFundo: "#0B0B0C", corTexto: "#F4F4F5" } },
  { nome: "Tricolor", tema: { corPrimaria: "#1D4ED8", corSecundaria: "#DC2626", corFundo: "#0A0E1A", corTexto: "#F1F5F9" } },
  { nome: "Azul e branco", tema: { corPrimaria: "#2563EB", corSecundaria: "#FFFFFF", corFundo: "#060B18", corTexto: "#EEF3FB" } },
  { nome: "Celeste", tema: { corPrimaria: "#38BDF8", corSecundaria: "#FFFFFF", corFundo: "#06121D", corTexto: "#EEF6FB" } },
  { nome: "Azul e amarelo", tema: { corPrimaria: TEMA_PADRAO.corPrimaria, corSecundaria: TEMA_PADRAO.corSecundaria, corFundo: TEMA_PADRAO.corFundo, corTexto: TEMA_PADRAO.corTexto } },
  { nome: "Vermelho e branco", tema: { corPrimaria: "#E11D2A", corSecundaria: "#FFFFFF", corFundo: "#0C0707", corTexto: "#F7F2F2" } },
  { nome: "Alviverde", tema: { corPrimaria: "#0B8A3E", corSecundaria: "#FFFFFF", corFundo: "#06100A", corTexto: "#F0F6F2" } },
  { nome: "Claro", tema: { corPrimaria: "#1F4FD1", corSecundaria: "#E8B100", corFundo: "#F7F7F5", corTexto: "#141414" } },
];

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

function misturar(a: string, b: string, peso: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * peso).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Clareia a cor até ela aparecer bem sobre o fundo (azul-marinho num painel escuro, por exemplo). */
function realcar(cor: string, fundo: string, minimo = 3): string {
  for (let p = 0; p <= 1; p += 0.1) {
    const c = misturar(cor, "#FFFFFF", p);
    if (contraste(c, fundo) >= minimo) return c;
  }
  return "#FFFFFF";
}

/**
 * Painéis da torcida (diretoria, subsedes, portaria): as cores da torcida sobre um fundo escuro neutro,
 * levemente tingido pela cor principal. Fundo e texto não seguem o site para o painel continuar legível.
 */
export function temaDoPainel(tema: Partial<Tema> | undefined): Tema {
  const primaria = tema?.corPrimaria && corValida(tema.corPrimaria) ? tema.corPrimaria : TEMA_PAINEL.corPrimaria;
  const secundaria = tema?.corSecundaria && corValida(tema.corSecundaria) ? tema.corSecundaria : TEMA_PAINEL.corSecundaria;
  const fundo = misturar("#090B0F", primaria, 0.05);
  return { corPrimaria: realcar(primaria, fundo), corSecundaria: realcar(secundaria, fundo), corFundo: fundo, corTexto: "#EEF1F5" };
}

/** Avisos para a diretoria quando a combinação de cores fica ilegível. */
export function avisosDeContraste(t: Tema): string[] {
  const avisos: string[] = [];
  if (contraste(t.corTexto, t.corFundo) < 4.5) avisos.push("O texto está com pouco contraste sobre o fundo.");
  if (contraste(t.corPrimaria, t.corFundo) < 2) avisos.push("A cor primária quase some sobre o fundo.");
  return avisos;
}
