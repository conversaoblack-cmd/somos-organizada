/**
 * Cores em navegadores sem color-mix (iPhone com iOS 15 e 16.0–16.1, Chrome < 111, Samsung Internet antigo).
 *
 * O Tailwind 4 escreve as cores com transparência e as derivadas do tema com color-mix() e põe como reserva a
 * primeira cor CHEIA: "verde a 12%" vira verde cheio (selo com texto verde sobre verde) e a opção escolhida da
 * paleta Alvinegro fica branca com texto branco. Este passo do build acrescenta, logo depois de cada bloco
 * `@supports (color: color-mix(...))`, a versão `@supports not (...)` com a mesma regra usando variáveis já
 * calculadas por lib/tema.ts (--cor-*-rgb e --cor-superficie etc.). Navegadores modernos não mudam nada.
 */
import postcss, { type AtRule, type Declaration, type Rule } from "postcss";
import type { Plugin } from "vite";

const SUPORTA = /^\(color:\s*color-mix\(in lab,\s*red,\s*red\)\)$/;
const NAO_SUPORTA = "not (color:color-mix(in lab,red,red))";

/** Misturas fixas do tema (index.css) → variável calculada por lib/tema.ts. */
const DERIVADAS: [RegExp, string][] = [
  [/color-mix\(in oklab,\s*var\(--cor-fundo\),\s*var\(--cor-texto\) 5%\)/g, "var(--cor-superficie)"],
  [/color-mix\(in oklab,\s*var\(--cor-fundo\),\s*var\(--cor-texto\) 9%\)/g, "var(--cor-superficie-2)"],
  [/color-mix\(in oklab,\s*var\(--cor-fundo\),\s*var\(--cor-texto\) 14%\)/g, "var(--cor-superficie-3)"],
  [/color-mix\(in oklab,\s*var\(--cor-texto\) 70%,\s*var\(--cor-fundo\)\)/g, "var(--cor-texto-2)"],
  [/color-mix\(in oklab,\s*var\(--cor-texto\) 48%,\s*var\(--cor-fundo\)\)/g, "var(--cor-texto-3)"],
];
const COM_CANAIS = new Set([
  "fundo", "texto", "primaria", "secundaria", "sobre-primaria", "sobre-secundaria", "primaria-texto",
  "sucesso", "alerta", "perigo", "info", "superficie", "superficie-2", "superficie-3", "texto-2", "texto-3",
]);
const LITERAIS: Record<string, string> = { black: "0 0 0", white: "255 255 255", "#000": "0 0 0", "#fff": "255 255 255" };

/** Troca as misturas por cores que o navegador antigo entende; devolve null se sobrar alguma que não dá. */
export function traduzir(valor: string): string | null {
  let v = valor;
  for (const [re, troca] of DERIVADAS) v = v.replace(re, troca);
  for (let i = 0; i < 4 && v.includes("color-mix("); i++) {
    const antes = v;
    // cor da torcida (ou derivada) com transparência
    v = v.replace(/color-mix\(in oklab,\s*var\(--cor-([a-z0-9-]+)\)\s+([\d.]+)%,\s*transparent\)/g, (m, nome: string, p: string) =>
      COM_CANAIS.has(nome) ? `rgb(var(--cor-${nome}-rgb) / ${p}%)` : m,
    );
    // preto/branco com transparência (ex.: fundo das janelas)
    v = v.replace(/color-mix\(in oklab,\s*(black|white|#000|#fff|var\(--color-(?:black|white)\))\s+([\d.]+)%,\s*transparent\)/g, (_m, c: string, p: string) =>
      `rgb(${LITERAIS[c.replace(/var\(--color-(\w+)\)/, "$1")]} / ${p}%)`,
    );
    // transparência sobre transparência (ex.: borda-linha a 50%)
    v = v.replace(/color-mix\(in oklab,\s*rgb\(([\d\s]+|var\(--cor-[a-z0-9-]+-rgb\))\s*\/\s*([\d.]+)%\)\s+([\d.]+)%,\s*transparent\)/g, (_m, c: string, a: string, p: string) =>
      `rgb(${c} / ${Math.round(Number(a) * Number(p)) / 100}%)`,
    );
    if (v === antes) break;
  }
  return v.includes("color-mix(") ? null : v;
}

export function compatCores(css: string): string {
  const raiz = postcss.parse(css);
  const blocos: AtRule[] = [];
  raiz.walkAtRules("supports", (b: AtRule) => {
    if (SUPORTA.test(b.params.trim())) blocos.push(b);
  });
  for (const bloco of blocos) {
    const reserva = postcss.atRule({ name: "supports", params: NAO_SUPORTA, nodes: [] });
    bloco.each((no) => {
      if (no.type !== "rule") return;
      const regra = no as Rule;
      const copia = postcss.rule({ selector: regra.selector, nodes: [] });
      regra.walkDecls((d: Declaration) => {
        const v = traduzir(d.value);
        if (v && v !== d.value) copia.append(postcss.decl({ prop: d.prop, value: v, important: d.important }));
      });
      if (copia.nodes.length) reserva.append(copia);
    });
    if (reserva.nodes.length) bloco.after(reserva);
  }
  return raiz.toString();
}

/** Plugin do Vite: aplica no CSS final do build (o dev usa navegador moderno). */
export function coresCompat(): Plugin {
  return {
    name: "cores-compat",
    apply: "build",
    generateBundle(_opcoes, bundle) {
      for (const arq of Object.values(bundle)) {
        if (arq.type === "asset" && arq.fileName.endsWith(".css")) arq.source = compatCores(String(arq.source));
      }
    },
  };
}
