#!/usr/bin/env node
/**
 * Soma trilha, SFX por cue e voz; ducking por automação; normaliza a −14 LUFS com true peak ≤ −1 dBTP (seção 6.5).
 * Uso: node audio/montar-trilha.mjs <peca>
 *
 * audio/<peca>/mix.json:
 * {
 *   "trilha": {"arquivo": "audio/biblioteca/<faixa>.wav", "ganhoDb": -8, "inicioS": 0, "fadeInS": 0.2, "fadeOutS": 1.2} | null,
 *   "sfx": [{"arquivo": "audio/sfx/<som>.wav", "frame": 42, "ganhoDb": -6}],
 *   "ducking": {"profundidadeDb": -12, "ataqueMs": 80, "preRolagemMs": 120, "releaseMs": 350, "vaoMinimoS": 0.7,
 *               "regioes": [{"deFrame": 0, "ateFrame": 45, "profundidadeDb": -6}]},
 *   "alvo": {"lufs": -14, "truePeakDbtp": -1}
 * }
 * Voz: public/audio/<peca>/voz.wav (narrar.mjs). Fala: audio/<peca>/tempos.json. Saída: public/audio/<peca>/final.wav.
 *
 * - Ducking por AUTOMAÇÃO (curva de ganho calculada pelos tempos reais das falas, não por compressor sidechain):
 *   profundidade por região do roteiro, ataque, pré-rolagem e release. Vãos de fala < 0,7 s continuam abaixados
 *   (a música não "bombeia").
 * - O limitador trabalha a 192 kHz (4×) para segurar o true peak; a 48 kHz ele passa do alvo.
 * - Toda trilha e todo SFX precisam de licença comercial LIDA e registrada em audio/LICENCAS.md.
 */
import {existsSync, mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {decodificar, escreverWav, ff, gravarJson, lerJson, RAIZ, TAXA} from './lib/comum.mjs';

const dbParaLin = (db) => Math.pow(10, db / 20);

/** Curva de ganho (dB) da música por amostra, a partir dos intervalos de fala. */
export function curvaDucking(n, intervalosMs, cfg, fps) {
  const d = {profundidadeDb: -12, ataqueMs: 80, preRolagemMs: 120, releaseMs: 350, vaoMinimoS: 0.7, regioes: [], ...cfg};
  // junta falas com vão menor que o mínimo
  const ints = [...intervalosMs].sort((a, b) => a.inicioMs - b.inicioMs);
  const juntos = [];
  for (const x of ints) {
    const u = juntos[juntos.length - 1];
    if (u && x.inicioMs - u.fimMs < d.vaoMinimoS * 1000) u.fimMs = Math.max(u.fimMs, x.fimMs);
    else juntos.push({...x});
  }
  const profundidadeEm = (ms) => {
    const f = (ms / 1000) * fps;
    const r = d.regioes.find((g) => f >= g.deFrame && f < g.ateFrame);
    return r ? r.profundidadeDb : d.profundidadeDb;
  };
  const g = new Float32Array(n); // 0 dB
  const amostra = (ms) => Math.round((ms / 1000) * TAXA);
  for (const x of juntos) {
    const prof = profundidadeEm(x.inicioMs);
    const a0 = amostra(x.inicioMs - d.preRolagemMs - d.ataqueMs);
    const a1 = amostra(x.inicioMs - d.preRolagemMs);
    const r0 = amostra(x.fimMs);
    const r1 = amostra(x.fimMs + d.releaseMs);
    for (let i = Math.max(0, a0); i < Math.min(n, r1); i++) {
      let v;
      if (i < a1) v = (prof * (i - a0)) / Math.max(1, a1 - a0);
      else if (i < r0) v = prof;
      else v = prof * (1 - (i - r0) / Math.max(1, r1 - r0));
      if (v < g[i]) g[i] = v; // o mais fundo vence onde se sobrepõem
    }
  }
  return g;
}

export function medir(arquivo) {
  const r = ff(['-i', arquivo, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {permitirFalha: true});
  const resumo = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  return {lufs: Number(resumo.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]), truePeak: Number(resumo.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/)?.[1])};
}

export function montarTrilha(peca) {
  const dir = join(RAIZ, 'audio', peca);
  const mix = lerJson(join(dir, 'mix.json'));
  const tempos = lerJson(join(dir, 'tempos.json'));
  const fps = tempos.fps;
  const n = Math.round((tempos.duracaoFrames / fps) * TAXA);
  const alvo = {lufs: -14, truePeakDbtp: -1, ...(mix.alvo ?? {})};
  const soma = new Float32Array(n * 2);

  const vozArq = join(RAIZ, 'public', 'audio', peca, 'voz.wav');
  const voz = decodificar(vozArq, 2);
  for (let i = 0; i < Math.min(voz.length, soma.length); i++) soma[i] += voz[i];

  if (mix.trilha) {
    const t = mix.trilha;
    const arq = join(RAIZ, t.arquivo);
    if (!existsSync(arq)) throw new Error(`trilha não encontrada: ${t.arquivo}`);
    const m = decodificar(arq, 2);
    const curva = curvaDucking(n, tempos.falas, mix.ducking, fps);
    const off = Math.round((t.inicioS ?? 0) * TAXA);
    const fadeIn = Math.round((t.fadeInS ?? 0) * TAXA);
    const fadeOut = Math.round((t.fadeOutS ?? 0) * TAXA);
    const base = dbParaLin(t.ganhoDb ?? 0);
    for (let s = off; s < n; s++) {
      const k = s - off;
      if (k * 2 + 1 >= m.length) break;
      let g = base * dbParaLin(curva[s]);
      if (fadeIn && k < fadeIn) g *= k / fadeIn;
      if (fadeOut && s > n - fadeOut) g *= (n - s) / fadeOut;
      soma[s * 2] += m[k * 2] * g;
      soma[s * 2 + 1] += m[k * 2 + 1] * g;
    }
  }

  for (const c of mix.sfx ?? []) {
    const arq = join(RAIZ, c.arquivo);
    if (!existsSync(arq)) throw new Error(`SFX não encontrado: ${c.arquivo}`);
    const x = decodificar(arq, 2);
    const off = Math.round((c.frame / fps) * TAXA) * 2;
    const g = dbParaLin(c.ganhoDb ?? 0);
    for (let i = 0; i < x.length && off + i < soma.length; i++) soma[off + i] += x[i] * g;
  }

  // normalização: ganho para o alvo + limitador a 192 kHz; repete até bater (o limitador tira um pouco de loudness)
  const tmp = join(dir, '.tmp-mix');
  rmSync(tmp, {recursive: true, force: true});
  mkdirSync(tmp, {recursive: true});
  const bruto = join(tmp, 'bruto.wav');
  escreverWav(bruto, soma, 2);
  const saida = join(RAIZ, 'public', 'audio', peca, 'final.wav');
  const teto = dbParaLin(alvo.truePeakDbtp - 0.5).toFixed(6);
  let medida = medir(bruto);
  let ganho = alvo.lufs - medida.lufs;
  const tentativas = [];
  for (let i = 0; i < 5; i++) {
    ff([
      '-v', 'error', '-y', '-i', bruto,
      '-af', `volume=${ganho.toFixed(3)}dB,aresample=192000,alimiter=limit=${teto}:level=false:attack=1:release=60:asc=1,aresample=${TAXA}`,
      '-c:a', 'pcm_s24le', '-fflags', '+bitexact', '-flags:a', '+bitexact', saida,
    ]);
    medida = medir(saida);
    tentativas.push({ganhoDb: Number(ganho.toFixed(3)), ...medida});
    if (Math.abs(medida.lufs - alvo.lufs) <= 0.3 && medida.truePeak <= alvo.truePeakDbtp) break;
    ganho += alvo.lufs - medida.lufs;
  }
  rmSync(tmp, {recursive: true, force: true});
  const ok = Math.abs(medida.lufs - alvo.lufs) <= 0.5 && medida.truePeak <= alvo.truePeakDbtp;
  const resumo = {saida: `public/audio/${peca}/final.wav`, alvo, medida, ok, tentativas};
  gravarJson(join(dir, 'mix-resultado.json'), resumo);
  return resumo;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const peca = process.argv[2];
  if (!peca) {
    console.error('Uso: node audio/montar-trilha.mjs <peca>');
    process.exit(2);
  }
  const r = montarTrilha(peca);
  console.log(`${r.saida}: ${r.medida.lufs} LUFS · TP ${r.medida.truePeak} dBTP · ${r.ok ? 'OK' : 'FORA DO ALVO'} (${r.tentativas.length} passada(s))`);
  process.exit(r.ok ? 0 : 1);
}
