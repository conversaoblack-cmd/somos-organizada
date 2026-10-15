#!/usr/bin/env node
/**
 * Corta o take único em uma fala por arquivo e calcula o tempo das palavras (seção 6.5).
 * Uso: node audio/alinhar-take.mjs <peca> [--sem-whisper]
 *
 * - Corte nos SILÊNCIOS REAIS (silencedetect −40 dB, 0,1 s), escolhidos por programação dinâmica guiada pelo whisper.
 *   O whisper acerta a ORDEM mas erra o tempo dentro da frase (palavras com duração zero): serve só de guia.
 *   Sem whisper (ou --sem-whisper), o guia é a proporção de palavras de cada fala.
 * - Palavras da LEGENDA distribuídas no tempo FALADO da fala (pausas puladas), com peso pelo tamanho.
 * - Tratamento: passa-alta 80 Hz; −2 dB em 250 Hz; +3 dB em 3,5 kHz; +2 dB em 10 kHz; compressão 3:1; atempo.
 * - Velocidade global (narracao.velocidade, ex.: 1.1) com exceção por fala (`tempo`, ex.: o insight principal a 1.0).
 * Saída: audio/<peca>/falas/<id>.wav e audio/<peca>/falas.json.
 */
import {existsSync, mkdirSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {
  analisarLegenda,
  distribuirPalavras,
  ff,
  gravarJson,
  lerJson,
  normalizar,
  RAIZ,
  silencios,
  TAXA,
  trechosDeVoz,
  duracao,
} from './lib/comum.mjs';

export const SILENCIO = {db: -40, minimo: 0.1};
export const RESPIRO_MS = 60;
export const TRATAMENTO = [
  'highpass=f=80',
  'equalizer=f=250:t=q:w=1:g=-2',
  'equalizer=f=3500:t=q:w=1:g=3',
  'equalizer=f=10000:t=q:w=1:g=2',
  'acompressor=ratio=3:threshold=-18dB:attack=5:release=80:makeup=2',
];

const WHISPER = join(RAIZ, 'modelos/whisper.cpp/build/bin/whisper-cli');
const MODELOS = ['ggml-large-v3-turbo.bin', 'ggml-small.bin'].map((m) => join(RAIZ, 'modelos', m));

/** Transcrição por palavra (whisper.cpp, -ml 1 -sow). [{t, ini, fim}] em ms, ou null sem whisper. */
export function transcrever(wav, tmp) {
  const modelo = MODELOS.find((m) => existsSync(m));
  if (!existsSync(WHISPER) || !modelo) return null;
  const w16 = join(tmp, 'take16k.wav');
  ff(['-v', 'error', '-y', '-i', wav, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', w16]);
  const base = join(tmp, 'whisper');
  const r = spawnSync(WHISPER, ['-m', modelo, '-l', 'pt', '-ml', '1', '-sow', '-oj', '-of', base, '-t', '4', '-np', '-f', w16], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`whisper falhou: ${r.stderr.slice(-800)}`);
  const j = lerJson(base + '.json');
  return j.transcription
    .map((s) => ({t: normalizar(s.text).join(' '), ini: s.offsets.from, fim: s.offsets.to}))
    .filter((x) => x.t);
}

function lev(a, b) {
  const d = Array.from({length: a.length + 1}, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const parecido = (a, b) => a === b || 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.75;

/** Alinhamento global (Needleman-Wunsch) roteiro × transcrição. Devolve, por palavra do roteiro, a palavra do whisper ou null. */
export function alinhar(roteiro, transcricao) {
  const n = roteiro.length;
  const m = transcricao.length;
  const C = Array.from({length: n + 1}, () => new Float64Array(m + 1));
  const P = Array.from({length: n + 1}, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) (C[i][0] = i), (P[i][0] = 1);
  for (let j = 1; j <= m; j++) (C[0][j] = j), (P[0][j] = 2);
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const diag = C[i - 1][j - 1] + (parecido(roteiro[i - 1].t, transcricao[j - 1].t) ? 0 : 1.5);
      const cima = C[i - 1][j] + 1;
      const esq = C[i][j - 1] + 1;
      C[i][j] = Math.min(diag, cima, esq);
      P[i][j] = C[i][j] === diag ? 0 : C[i][j] === cima ? 1 : 2;
    }
  const par = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 || j > 0; ) {
    if (i > 0 && j > 0 && P[i][j] === 0) {
      if (parecido(roteiro[i - 1].t, transcricao[j - 1].t)) par[i - 1] = transcricao[j - 1];
      i--, j--;
    } else if (i > 0 && (j === 0 || P[i][j] === 1)) i--;
    else j--;
  }
  return par;
}

/**
 * Escolhe N−1 cortes entre os silêncios internos (em ordem) minimizando a distância ao alvo de cada fronteira
 * e premiando pausa longa (a pausa entre falas do take é de 0,8 s). Programação dinâmica O(N·S²).
 */
export function escolherCortes(candidatos, alvos) {
  const N = alvos.length;
  const S = candidatos.length;
  if (S < N) throw new Error(`take com ${S} pausas internas para ${N} cortes: regrave o take com as pausas entre falas`);
  const custo = (k, s) => {
    const c = candidatos[s];
    const meio = (c.inicio + c.fim) / 2;
    return Math.abs(meio - alvos[k]) - 1.5 * Math.min(c.fim - c.inicio, 1);
  };
  const D = Array.from({length: N}, () => new Float64Array(S).fill(Infinity));
  const V = Array.from({length: N}, () => new Int32Array(S).fill(-1));
  for (let s = 0; s < S; s++) D[0][s] = custo(0, s);
  for (let k = 1; k < N; k++)
    for (let s = k; s < S; s++)
      for (let p = k - 1; p < s; p++) {
        const v = D[k - 1][p] + custo(k, s);
        if (v < D[k][s]) (D[k][s] = v), (V[k][s] = p);
      }
  let s = -1;
  let melhor = Infinity;
  for (let x = N - 1; x < S; x++) if (D[N - 1][x] < melhor) (melhor = D[N - 1][x]), (s = x);
  const out = [];
  for (let k = N - 1; k >= 0; k--) {
    out.unshift(candidatos[s]);
    s = V[k][s];
  }
  return out;
}

export function alinharTake(peca, {usarWhisper = true} = {}) {
  const dir = join(RAIZ, 'audio', peca);
  const narracao = lerJson(join(dir, 'narracao.json'));
  const take = lerJson(join(dir, 'take', 'take.json'));
  const tmp = join(dir, '.tmp');
  rmSync(tmp, {recursive: true, force: true});
  mkdirSync(tmp, {recursive: true});
  const wav = join(tmp, 'take.wav');
  ff(['-v', 'error', '-y', '-i', join(dir, 'take', take.arquivo), '-ar', String(TAXA), '-ac', '1', '-c:a', 'pcm_f32le', wav]);
  const dur = duracao(wav);
  const sil = silencios(wav, SILENCIO);
  const internos = sil.filter((s) => s.inicio > 0.05 && s.fim < dur - 0.05);

  // guia: whisper (ordem) ou proporção de palavras
  const falas = narracao.falas;
  const roteiro = falas.flatMap((f, i) => normalizar(f.texto).map((t) => ({t, fala: i})));
  const transcricao = usarWhisper ? transcrever(wav, tmp) : null;
  const totalPal = roteiro.length;
  const acumulado = falas.map((_, i) => roteiro.filter((r) => r.fala <= i).length);
  const alvos = [];
  let guia = 'proporcional';
  if (transcricao && transcricao.length) {
    guia = 'whisper';
    const par = alinhar(roteiro, transcricao);
    for (let i = 0; i < falas.length - 1; i++) {
      const fim = par.filter((p, k) => p && roteiro[k].fala === i).pop();
      const ini = par.find((p, k) => p && roteiro[k].fala === i + 1);
      alvos.push(fim && ini ? (fim.fim + ini.ini) / 2000 : (acumulado[i] / totalPal) * dur);
    }
  } else {
    for (let i = 0; i < falas.length - 1; i++) alvos.push((acumulado[i] / totalPal) * dur);
  }
  const cortes = falas.length > 1 ? escolherCortes(internos, alvos) : [];

  // limites de cada fala no take (corte no meio da pausa) e aparo do silêncio das pontas (com respiro)
  const limites = falas.map((_, i) => ({
    de: i === 0 ? 0 : (cortes[i - 1].inicio + cortes[i - 1].fim) / 2,
    ate: i === falas.length - 1 ? dur : (cortes[i].inicio + cortes[i].fim) / 2,
  }));
  const pastaFalas = join(dir, 'falas');
  rmSync(pastaFalas, {recursive: true, force: true});
  mkdirSync(pastaFalas, {recursive: true});
  const velGlobal = narracao.velocidade ?? 1;
  const avisos = [];
  const saida = falas.map((f, i) => {
    let {de, ate} = limites[i];
    const dentro = sil.filter((s) => s.fim > de && s.inicio < ate);
    const lead = dentro.find((s) => s.inicio <= de + 0.001);
    if (lead) de = Math.max(de, lead.fim - RESPIRO_MS / 1000);
    const trail = dentro.find((s) => s.fim >= ate - 0.001);
    if (trail) ate = Math.min(ate, trail.inicio + RESPIRO_MS / 1000);
    const vel = f.tempo ?? velGlobal;
    const arquivo = `${f.id}.wav`;
    ff([
      '-v', 'error', '-y', '-i', wav,
      '-af', [`atrim=start=${de.toFixed(4)}:end=${ate.toFixed(4)}`, 'asetpts=PTS-STARTPTS', ...TRATAMENTO, ...(vel !== 1 ? [`atempo=${vel}`] : [])].join(','),
      '-ar', String(TAXA), '-c:a', 'pcm_s24le', '-fflags', '+bitexact', '-flags:a', '+bitexact',
      join(pastaFalas, arquivo),
    ]);
    // tempo das palavras: no trecho original (antes do atempo), pulando as pausas; depois dividido pela velocidade
    const silRel = sil
      .filter((s) => s.fim > de && s.inicio < ate)
      .map((s) => ({inicio: Math.max(0, s.inicio - de), fim: Math.min(ate - de, s.fim - de)}));
    const trechos = trechosDeVoz(silRel, (ate - de) * 1000);
    const blocos = analisarLegenda(f.legenda);
    // a legenda precisa seguir a fala palavra por palavra (só os números mudam: "dez" → "10"); resumo = tempo aproximado
    const semNumero = (ts) => ts.filter((t) => !/\d/.test(t));
    const falado = semNumero(normalizar(f.texto));
    const escrito = semNumero(normalizar(blocos.flat().map((p) => p.texto).join(' ')));
    if (escrito.length && Math.abs(falado.length - escrito.length) > 2) {
      avisos.push(`${f.id}: a legenda tem ${escrito.length} palavras e a fala ${falado.length}; legenda que resume a fala fica com tempo aproximado`);
    }
    const planas = blocos.flatMap((b, bi) => b.map((p) => ({...p, bloco: bi})));
    const tempos = distribuirPalavras(planas.map((p) => p.texto), trechos);
    const palavras = planas.map((p, k) => ({...p, inicioMs: Math.round(tempos[k].inicioMs / vel), fimMs: Math.round(tempos[k].fimMs / vel)}));
    return {id: f.id, arquivo: `falas/${arquivo}`, duracaoMs: Math.round(duracao(join(pastaFalas, arquivo)) * 1000), velocidade: vel, noTake: {de, ate}, palavras};
  });
  rmSync(tmp, {recursive: true, force: true});
  const resultado = {take: take.arquivo, tipoTake: take.tipo, guia, silencio: SILENCIO, velocidadeGlobal: velGlobal, cortes, avisos, falas: saida};
  gravarJson(join(dir, 'falas.json'), resultado);
  return resultado;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const peca = process.argv[2];
  if (!peca) {
    console.error('Uso: node audio/alinhar-take.mjs <peca> [--sem-whisper]');
    process.exit(2);
  }
  const r = alinharTake(peca, {usarWhisper: !process.argv.includes('--sem-whisper')});
  console.log(`Take ${r.take} (${r.tipoTake}) cortado em ${r.falas.length} falas · guia: ${r.guia}`);
  for (const f of r.falas) console.log(`  ${f.id}: ${(f.duracaoMs / 1000).toFixed(2)} s a ${f.velocidade}× · ${f.palavras.length} palavras de legenda`);
  for (const a of r.avisos) console.log(`  aviso: ${a}`);
}
