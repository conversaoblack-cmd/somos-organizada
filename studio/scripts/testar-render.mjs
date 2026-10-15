#!/usr/bin/env node
/**
 * Prova do render (seção 9): dois renders da composição de teste com concorrência 1 têm framemd5 idêntico,
 * e mede o tempo de um still 3D (WebGL por software com swangle na nuvem; angle no Mac).
 *
 * Medido na nuvem (15/10/2026): em ~1 de cada 4 renders o Chrome (raster por software) varia ±1 de intensidade em
 * algumas dezenas de pixels na borda de um texto; nenhuma flag elimina (ver docs/limitacoes.md). Por isso o veredito é:
 *   IDÊNTICO        framemd5 igual;
 *   RUÍDO DE RASTER framemd5 diferente, mas o pior quadro tem PSNR ≥ 60 dB (invisível; ±1 em poucos pixels);
 *   DIFERENTE       algum quadro abaixo de 60 dB: há não determinismo de verdade (aleatório, timer, CSS animation).
 * Uso: node scripts/testar-render.mjs   → grava o resultado em docs/testes-ativacao/render-<plataforma>.json
 */
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const RAIZ = new URL('../', import.meta.url).pathname;
const OUT = join(RAIZ, 'out', 'testar-render');
rmSync(OUT, {recursive: true, force: true});
mkdirSync(OUT, {recursive: true});
const npx = (args) => {
  const t = Date.now();
  const r = spawnSync('npx', ['remotion', ...args], {cwd: RAIZ, encoding: 'utf8'});
  if (r.status !== 0) throw new Error(r.stderr.slice(-1500) || r.stdout.slice(-1500));
  return (Date.now() - t) / 1000;
};
const md5 = (mp4) => spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-map', '0', '-f', 'framemd5', '-'], {encoding: 'utf8'}).stdout;

if (spawnSync('npx', ['tsc', '--noEmit'], {cwd: RAIZ}).status !== 0) throw new Error('tsc --noEmit falhou: corrija os tipos antes do render');
const t1 = npx(['render', 'TesteKit', join(OUT, 'a.mp4'), '--concurrency=1']);
const t2 = npx(['render', 'TesteKit', join(OUT, 'b.mp4'), '--concurrency=1']);
const iguais = md5(join(OUT, 'a.mp4')) === md5(join(OUT, 'b.mp4'));
// pior quadro (PSNR por quadro entre os dois renders)
const stats = join(OUT, 'psnr.txt');
spawnSync('ffmpeg', ['-v', 'error', '-i', join(OUT, 'a.mp4'), '-i', join(OUT, 'b.mp4'), '-lavfi', `[0:v][1:v]psnr=stats_file=${stats}`, '-f', 'null', '-']);
const psnrs = readFileSync(stats, 'utf8').trim().split('\n').map((l) => {
  const m = l.match(/psnr_avg:(\S+)/);
  return m[1] === 'inf' ? Infinity : Number(m[1]);
});
const psnrMinimo = Math.min(...psnrs);
const veredito = iguais ? 'IDÊNTICO' : psnrMinimo >= 60 ? 'RUÍDO DE RASTER' : 'DIFERENTE';
const bytesIguais = readFileSync(join(OUT, 'a.mp4')).equals(readFileSync(join(OUT, 'b.mp4')));
const t3d = npx(['still', 'TesteCelular3D', join(OUT, 'cel.png'), '--frame=30']);
const t3dVideo = npx(['render', 'TesteCelular3D', join(OUT, 'cel.mp4'), '--muted', '--concurrency=1']);
const r = {
  data: new Date().toISOString(),
  plataforma: `${process.platform}-${process.arch}`,
  renderTesteKitSegundos: [t1, t2],
  framemd5Identico: iguais,
  psnrMinimoDb: Number.isFinite(psnrMinimo) ? Number(psnrMinimo.toFixed(2)) : 'inf',
  quadrosDiferentes: psnrs.filter((x) => Number.isFinite(x)).length,
  veredito,
  mp4IdenticoByteAByte: bytesIguais,
  still3dSegundos: t3d,
  video3d60QuadrosSegundos: t3dVideo,
};
mkdirSync(join(RAIZ, 'docs', 'testes-ativacao'), {recursive: true});
writeFileSync(join(RAIZ, 'docs', 'testes-ativacao', `render-${process.platform}.json`), JSON.stringify(r, null, 2) + '\n');
console.log(r);
process.exit(veredito === 'DIFERENTE' ? 1 : 0);
