// Peças comuns do pipeline de áudio (seção 6.5). Sem dependências externas: ffmpeg + Node.
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';

export const TAXA = 48000;
export const RAIZ = new URL('../../', import.meta.url).pathname; // studio/

export function ff(args, {permitirFalha = false, entrada} = {}) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], {encoding: entrada ? undefined : 'utf8', input: entrada, maxBuffer: 1024 * 1024 * 1024});
  if (r.error) throw r.error;
  if (r.status !== 0 && !permitirFalha) throw new Error(`ffmpeg ${r.status}: ${String(r.stderr).slice(-1500)}`);
  return r;
}

/** Decodifica qualquer áudio para Float32 mono ou estéreo a 48 kHz (intercalado). */
export function decodificar(arquivo, canais = 2) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', arquivo, '-f', 'f32le', '-ac', String(canais), '-ar', String(TAXA), '-'], {maxBuffer: 2 * 1024 * 1024 * 1024});
  if (r.status !== 0) throw new Error(`não decodificou ${arquivo}: ${r.stderr}`);
  const b = r.stdout;
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice();
}

/** Escreve WAV PCM 24 bits (cabeçalho mínimo, sem metadados: mesma entrada = mesmo arquivo, byte a byte). */
export function escreverWav(arquivo, amostras, canais = 2, taxa = TAXA) {
  const n = amostras.length;
  const dados = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, amostras[i]));
    const x = Math.round(v < 0 ? v * 0x800000 : v * 0x7fffff);
    dados.writeIntLE(x, i * 3, 3);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dados.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(canais, 22);
  h.writeUInt32LE(taxa, 24);
  h.writeUInt32LE(taxa * canais * 3, 28);
  h.writeUInt16LE(canais * 3, 32);
  h.writeUInt16LE(24, 34);
  h.write('data', 36);
  h.writeUInt32LE(dados.length, 40);
  writeFileSync(arquivo, Buffer.concat([h, dados]));
}

export function duracao(arquivo) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo], {encoding: 'utf8'});
  return Number(r.stdout.trim());
}

/** Silêncios reais (ffmpeg silencedetect): [{inicio, fim}] em segundos. Padrão do estúdio: −40 dB, 0,1 s. */
export function silencios(arquivo, {db = -40, minimo = 0.1} = {}) {
  const r = ff(['-i', arquivo, '-af', `silencedetect=noise=${db}dB:d=${minimo}`, '-f', 'null', '-'], {permitirFalha: true});
  const ini = [...r.stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
  const fim = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const total = duracao(arquivo);
  return ini.map((a, i) => ({inicio: a, fim: fim[i] ?? total}));
}

export function lerJson(caminho) {
  return JSON.parse(readFileSync(caminho, 'utf8'));
}

export function gravarJson(caminho, obj) {
  writeFileSync(caminho, JSON.stringify(obj, null, 2) + '\n');
}

/**
 * Sintaxe da legenda (seção 6.5): blocos separados por " / ", quebra de linha "↵", destaque `**palavra**{cor}`.
 * Devolve [[{texto, cor?, quebraAntes?}]] (um array de palavras por bloco). `legenda: ""` → [] (a tela já escreve).
 */
export function analisarLegenda(legenda) {
  if (!legenda || !legenda.trim()) return [];
  return legenda.split(' / ').map((bloco) => {
    const palavras = [];
    let quebra = false;
    const re = /\*\*(.+?)\*\*\{(\w+)\}|↵|[^\s↵*]+/g;
    let fimAnterior = -1;
    for (const m of bloco.matchAll(re)) {
      const colado = m.index === fimAnterior;
      fimAnterior = m.index + m[0].length;
      // pontuação colada ao destaque ("**sozinha**{amarelo}.") fica na mesma palavra
      if (colado && !m[1] && m[0] !== '↵' && palavras.length) {
        palavras[palavras.length - 1].texto += m[0];
        continue;
      }
      if (m[0] === '↵') {
        quebra = true;
        continue;
      }
      if (m[1]) {
        // destaque pode ter várias palavras: todas na mesma cor
        m[1].split(/\s+/).forEach((t, i) => {
          palavras.push({texto: t, cor: m[2], ...(quebra && i === 0 ? {quebraAntes: true} : {})});
        });
      } else palavras.push({texto: m[0], ...(quebra ? {quebraAntes: true} : {})});
      quebra = false;
    }
    return palavras;
  });
}

export const CORES_VALIDAS = ['azul', 'amarelo', 'perigo', 'texto'];

/** Peso de leitura/fala de uma palavra da legenda: tamanho, com algarismo pesando como o número por extenso. */
export function pesoDaPalavra(t) {
  const digitos = (t.match(/\d/g) ?? []).length;
  const letras = t.replace(/[^\p{L}]/gu, '').length;
  return Math.max(2, letras + digitos * 4 + (t.includes('R$') ? 5 : 0));
}

/**
 * Distribui palavras no tempo FALADO de uma fala (pausas puladas), com peso pelo tamanho (seção 6.5).
 * `trechos`: [{inicio, fim}] em ms com voz (não silêncio). Devolve [{inicioMs, fimMs}] por palavra.
 */
export function distribuirPalavras(palavras, trechos) {
  const total = trechos.reduce((t, s) => t + (s.fim - s.inicio), 0);
  const pesos = palavras.map(pesoDaPalavra);
  const soma = pesos.reduce((a, b) => a + b, 0) || 1;
  const posicao = (falado) => {
    // tempo falado acumulado → tempo real (pulando as pausas)
    let resto = falado;
    for (const s of trechos) {
      const d = s.fim - s.inicio;
      if (resto <= d + 1e-9) return s.inicio + resto;
      resto -= d;
    }
    return trechos.length ? trechos[trechos.length - 1].fim : 0;
  };
  let acc = 0;
  return pesos.map((p) => {
    const a = (acc / soma) * total;
    acc += p;
    const b = (acc / soma) * total;
    return {inicioMs: Math.round(posicao(a)), fimMs: Math.round(posicao(b))};
  });
}

/** Trechos com voz dentro de [0, dur] a partir dos silêncios. Tudo em ms. */
export function trechosDeVoz(sil, durMs) {
  const out = [];
  let t = 0;
  for (const s of sil.map((x) => ({inicio: x.inicio * 1000, fim: x.fim * 1000})).sort((a, b) => a.inicio - b.inicio)) {
    if (s.inicio > t) out.push({inicio: t, fim: s.inicio});
    t = Math.max(t, s.fim);
  }
  if (t < durMs) out.push({inicio: t, fim: durMs});
  return out.filter((x) => x.fim - x.inicio >= 30);
}

/** Normaliza para comparar texto falado e transcrição. */
export const normalizar = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/<[^>]+>|\[[^\]]+\]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
