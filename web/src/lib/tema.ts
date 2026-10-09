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

/** Cores de estado (pago, atenção, erro, informação): ajustadas ao fundo de cada torcida para continuarem legíveis. */
const ESTADOS = { sucesso: "#22C55E", alerta: "#F59E0B", perigo: "#EF4444", info: "#3B82F6" } as const;

/**
 * A mesma cor, clareada (fundo escuro) ou escurecida (fundo claro) até ter contraste mínimo com o fundo.
 * Usada para TEXTO na cor da torcida: o vermelho do Rubro-negro ou o azul do Tricolor viram um tom legível.
 */
export function legivel(cor: string, fundo: string, minimo = 4.5): string {
  if (contraste(cor, fundo) >= minimo) return cor;
  const alvoCor = luminancia(fundo) < 0.4 ? "#FFFFFF" : "#000000";
  for (let p = 0.05; p <= 1; p += 0.05) {
    const c = misturar(cor, alvoCor, p);
    if (contraste(c, fundo) >= minimo) return c;
  }
  return alvoCor;
}

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
  alvo.style.setProperty("--cor-primaria-texto", legivel(primaria, fundo));
  for (const [nome, cor] of Object.entries(ESTADOS)) alvo.style.setProperty(`--cor-${nome}`, legivel(cor, fundo));
  // Cores derivadas e canais "r g b" já calculados: navegadores sem color-mix (iPhone com iOS 15, Android antigo)
  // usam estes valores no lugar das misturas do CSS (ver plugins/coresCompat.ts). Os modernos seguem com color-mix.
  for (const [nome, valor] of Object.entries(variaveisCompat(alvo, fundo, ok(t.corTexto, TEMA_PADRAO.corTexto)))) alvo.style.setProperty(nome, valor);
  alvo.style.colorScheme = luminancia(fundo) < 0.4 ? "dark" : "light";
  if (alvo === document.documentElement) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", fundo);
}

// ── Compatibilidade com navegadores sem color-mix ─────────────────────────────────────────────
// Mistura no espaço oklab, a mesma conta que o color-mix(in oklab, ...) do CSS faz, para a cor sair igual.
const paraLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const deLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function paraOklab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => paraLinear(v / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function deOklab([L, A, B]: [number, number, number]): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return "#" + lin.map((c) => Math.round(Math.min(1, Math.max(0, deLinear(c))) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
/** color-mix(in oklab, a, b peso) */
export function misturarOklab(a: string, b: string, peso: number): string {
  const [x, y] = [paraOklab(a), paraOklab(b)];
  return deOklab([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * peso) as [number, number, number]);
}
const canais = (hex: string) => rgb(hex).join(" ");

/** Variáveis usadas no lugar do color-mix quando o navegador não tem color-mix (mesmas contas do index.css). */
export function variaveisCompat(alvo: HTMLElement, fundo: string, texto: string): Record<string, string> {
  const derivadas: Record<string, string> = {
    superficie: misturarOklab(fundo, texto, 0.05),
    "superficie-2": misturarOklab(fundo, texto, 0.09),
    "superficie-3": misturarOklab(fundo, texto, 0.14),
    "texto-2": misturarOklab(texto, fundo, 0.3),
    "texto-3": misturarOklab(texto, fundo, 0.52),
  };
  const v: Record<string, string> = {};
  for (const [nome, cor] of Object.entries(derivadas)) {
    v[`--cor-${nome}`] = cor;
    v[`--cor-${nome}-rgb`] = canais(cor);
  }
  const lidas = ["fundo", "texto", "primaria", "secundaria", "sobre-primaria", "sobre-secundaria", "primaria-texto", ...Object.keys(ESTADOS)];
  for (const nome of lidas) {
    const cor = alvo.style.getPropertyValue(`--cor-${nome}`).trim();
    if (corValida(cor)) v[`--cor-${nome}-rgb`] = canais(cor);
  }
  return v;
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
