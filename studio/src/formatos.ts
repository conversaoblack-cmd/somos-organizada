import dados from './formatos.json';

/**
 * Formatos de entrega e zona essencial de cada um. Nunca posicione nada com número fixo pensado só para 1080×1920:
 * use `formatoPorTamanho(...).zona`. Valores em src/formatos.json (fonte única, lida também pelos scripts).
 */
export type IdFormato = 'vertical' | 'retrato' | 'quadrado' | 'paisagem';

export type Retangulo = {x: number; y: number; w: number; h: number};

export type Formato = {
  id: IdFormato;
  rotulo: string;
  width: number;
  height: number;
  /** zona onde todo texto e CTA precisam caber; `inferior` é a parte de baixo, estreitada pelo trilho de ícones */
  zona: {superior: Retangulo; inferior: Retangulo};
};

const ret = ([x1, y1, x2, y2]: number[]): Retangulo => ({x: x1, y: y1, w: x2 - x1, h: y2 - y1});

const montar = (id: IdFormato): Formato => {
  const f = dados[id];
  return {id, rotulo: f.rotulo, width: f.width, height: f.height, zona: {superior: ret(f.superior), inferior: ret(f.inferior)}};
};

export const FORMATOS: Record<IdFormato, Formato> = {
  vertical: montar('vertical'),
  retrato: montar('retrato'),
  quadrado: montar('quadrado'),
  paisagem: montar('paisagem'),
};

export const FPS = 30;

export function formatoPorTamanho(width: number, height: number): Formato {
  const f = Object.values(FORMATOS).find((x) => x.width === width && x.height === height);
  if (!f) throw new Error(`Formato desconhecido: ${width}×${height}`);
  return f;
}

/** Escala de tipografia: 1 = 1080 de largura. */
export const escala = (width: number) => width / 1080;
