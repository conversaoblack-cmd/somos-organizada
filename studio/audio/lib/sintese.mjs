// Síntese determinística de percussão de torcida e SFX (sem amostras de terceiros: zero licença).
// Tudo em Float32 mono a 48 kHz; aleatoriedade só por PRNG com semente.
import {TAXA} from './comum.mjs';

export function prng(semente = 1) {
  let s = semente >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Biquad (RBJ). tipo: 'lp' | 'hp' | 'bp' | 'peak'. */
export function biquad(x, tipo, f, q = 0.707, ganhoDb = 0) {
  const w = (2 * Math.PI * f) / TAXA;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const a = sw / (2 * q);
  const A = Math.pow(10, ganhoDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (tipo === 'lp') [b0, b1, b2, a0, a1, a2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + a, -2 * cw, 1 - a];
  else if (tipo === 'hp') [b0, b1, b2, a0, a1, a2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + a, -2 * cw, 1 - a];
  else if (tipo === 'bp') [b0, b1, b2, a0, a1, a2] = [a, 0, -a, 1 + a, -2 * cw, 1 - a];
  else [b0, b1, b2, a0, a1, a2] = [1 + a * A, -2 * cw, 1 - a * A, 1 + a / A, -2 * cw, 1 - a / A];
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

const amostras = (s) => Math.round(s * TAXA);

function ruido(n, rnd) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rnd() * 2 - 1;
  return x;
}

/** Tom com envelope de altura (de f0 a f1 em tPitch s) e decaimento exponencial (dec s). */
function tom(n, f0, f1, tPitch, dec, fase = 0) {
  const x = new Float32Array(n);
  let ph = fase;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const f = f1 + (f0 - f1) * Math.exp(-t / tPitch);
    ph += (2 * Math.PI * f) / TAXA;
    x[i] = Math.sin(ph) * Math.exp(-t / dec);
  }
  return x;
}

function env(x, ataque, dec) {
  for (let i = 0; i < x.length; i++) {
    const t = i / TAXA;
    x[i] *= Math.min(1, t / Math.max(1e-4, ataque)) * Math.exp(-t / dec);
  }
  return x;
}

function soma(...partes) {
  const n = Math.max(...partes.map(([p]) => p.length));
  const y = new Float32Array(n);
  for (const [p, g] of partes) for (let i = 0; i < p.length; i++) y[i] += p[i] * g;
  return y;
}

/** Instrumentos de bateria de torcida. `v` = intensidade 0..1 (o golpe). */
export const INSTRUMENTOS = {
  // surdo de primeira (grave) e de segunda (um pouco mais agudo)
  surdo1: (rnd, v = 1) => {
    const n = amostras(0.9);
    const corpo = tom(n, 120, 52, 0.035, 0.26);
    const pele = env(biquad(ruido(n, rnd), 'lp', 900), 0.001, 0.02);
    return soma([corpo, 0.95 * v], [pele, 0.35 * v]);
  },
  surdo2: (rnd, v = 1) => {
    const n = amostras(0.8);
    const corpo = tom(n, 145, 68, 0.03, 0.22);
    const pele = env(biquad(ruido(n, rnd), 'lp', 1100), 0.001, 0.018);
    return soma([corpo, 0.85 * v], [pele, 0.3 * v]);
  },
  // caixa: esteira (ruído em banda) + corpo
  caixa: (rnd, v = 1) => {
    const n = amostras(0.32);
    const esteira = env(biquad(biquad(ruido(n, rnd), 'hp', 1800), 'peak', 4200, 1, 4), 0.0008, 0.11);
    const corpo = tom(n, 260, 185, 0.01, 0.07);
    return soma([esteira, 0.55 * v], [corpo, 0.45 * v]);
  },
  repique: (rnd, v = 1) => {
    const n = amostras(0.35);
    const corpo = tom(n, 420, 300, 0.012, 0.12);
    const ataque = env(biquad(ruido(n, rnd), 'bp', 3000, 1.2), 0.0005, 0.03);
    return soma([corpo, 0.6 * v], [ataque, 0.35 * v]);
  },
  tamborim: (rnd, v = 1) => {
    const n = amostras(0.12);
    const corpo = tom(n, 950, 760, 0.004, 0.035);
    const ataque = env(biquad(ruido(n, rnd), 'hp', 4000), 0.0003, 0.012);
    return soma([corpo, 0.5 * v], [ataque, 0.45 * v]);
  },
  ganza: (rnd, v = 1) => {
    const n = amostras(0.09);
    return soma([env(biquad(biquad(ruido(n, rnd), 'hp', 5000), 'lp', 11000), 0.006, 0.03), 0.22 * v]);
  },
};

/** Efeitos sonoros da peça (todos sintetizados). */
export const SFX = {
  // virada de placa: estalo seco de cartão + "flap" curto
  virada: (rnd) => {
    const n = amostras(0.16);
    const estalo = env(biquad(ruido(n, rnd), 'bp', 2600, 0.9), 0.0004, 0.012);
    const flap = env(biquad(ruido(n, rnd), 'bp', 900, 0.8), 0.004, 0.04);
    return soma([estalo, 0.7], [flap, 0.5]);
  },
  // placa acendendo: toque suave e brilhante (sem "moeda")
  acende: (rnd) => {
    const n = amostras(0.5);
    return soma([tom(n, 1320, 1320, 1, 0.18), 0.25], [tom(n, 1980, 1980, 1, 0.12), 0.12], [env(biquad(ruido(n, rnd), 'hp', 6000), 0.001, 0.01), 0.1]);
  },
  // QR liberado: duplo bipe agudo
  liberado: () => {
    const n = amostras(0.32);
    const y = new Float32Array(n);
    const b1 = env(tom(amostras(0.09), 1568, 1568, 1, 10), 0.002, 0.06);
    const b2 = env(tom(amostras(0.12), 2093, 2093, 1, 10), 0.002, 0.08);
    y.set(b1.map((v) => v * 0.35), 0);
    const off = amostras(0.12);
    for (let i = 0; i < b2.length; i++) y[off + i] += b2[i] * 0.35;
    return y;
  },
  // QR barrado: zumbido grave curto (quadrada filtrada)
  barrado: () => {
    const n = amostras(0.35);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sign(Math.sin((2 * Math.PI * 140 * i) / TAXA)) * 0.4;
    return env(biquad(x, 'lp', 1200), 0.004, 0.18);
  },
  // Pix aprovado / dinheiro que entra: acorde curto maior (sem moeda)
  entra: () => {
    const n = amostras(0.7);
    return soma([tom(n, 784, 784, 1, 0.25), 0.18], [tom(n, 988, 988, 1, 0.22), 0.14], [tom(n, 1175, 1175, 1, 0.2), 0.12], [tom(n, 1568, 1568, 1, 0.12), 0.06]);
  },
  // sopro de câmera: ruído com filtro varrendo
  sopro: (rnd) => {
    const n = amostras(0.8);
    const x = ruido(n, rnd);
    const y = new Float32Array(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const f = 300 + 3500 * Math.sin(Math.PI * t);
      const a = Math.exp((-2 * Math.PI * f) / TAXA);
      lp = (1 - a) * x[i] + a * lp;
      y[i] = lp * Math.sin(Math.PI * t) * 0.6;
    }
    return y;
  },
  // impacto grave (virada de capítulo): surdo grande + sub
  impacto: (rnd) => {
    const n = amostras(1.4);
    return soma([tom(n, 90, 38, 0.06, 0.6), 0.9], [env(biquad(ruido(n, rnd), 'lp', 400), 0.002, 0.08), 0.5]);
  },
};

/** Coloca um som mono numa trilha estéreo (Float32 intercalado), com ganho e pan (-1..1). */
export function colocar(trilha, som, inicioS, ganho = 1, pan = 0) {
  const off = Math.round(inicioS * TAXA) * 2;
  const gl = ganho * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = ganho * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < som.length && off + i * 2 + 1 < trilha.length; i++) {
    trilha[off + i * 2] += som[i] * gl;
    trilha[off + i * 2 + 1] += som[i] * gr;
  }
}
