import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {COR_ZONA, evidencias} from '../evidencias.mjs';
import {qc} from '../qc.mjs';

const tmp = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'qc-'));
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
};

// vídeo válido: 9:16, 30 fps, h264 yuv420p bt709, imagem em movimento, áudio normalizado a −14 LUFS
const valido = join(tmp, 'valido.mp4');
ff([
  '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=4',
  '-f', 'lavfi', '-i', 'anoisesrc=color=pink:sample_rate=48000:amplitude=0.3:seed=7:d=4',
  '-af', 'loudnorm=I=-14:TP=-2:LRA=7:linear=true,aresample=48000',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', valido,
]);

test('QC: vídeo válido tira 10', () => {
  const r = qc(valido, {dur: 4});
  assert.deepEqual(r.problemas, []);
  assert.equal(r.nota, 10);
  assert.equal(r.falhaCritica, false);
});

test('QC: spec errada (resolução, duração) e render mudo = nota 0 e falha crítica', () => {
  const errado = join(tmp, 'errado.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=1080x1080:r=25:d=2', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-shortest', errado]);
  const r = qc(errado, {dur: 4});
  assert.equal(r.nota, 0);
  assert.equal(r.falhaCritica, true);
  const textos = r.problemas.map((x) => x.descricao).join(' | ');
  assert.match(textos, /resolução/);
  assert.match(textos, /fps/);
  assert.match(textos, /duração/);
  assert.match(textos, /mudo/);
});

test('QC (CLI): sai com código ≠ 0 em spec errada', () => {
  const r = spawnSync('node', [new URL('../qc.mjs', import.meta.url).pathname, join(tmp, 'errado.mp4'), join(tmp, 'qc.json'), '--dur', '4']);
  assert.notEqual(r.status, 0);
});

test('QC: quadro parado ≥ 1 s é apontado', () => {
  const parado = join(tmp, 'parado.mp4');
  ff([
    '-f', 'lavfi', '-i', 'color=c=0x070A12:s=1080x1920:r=30:d=3',
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:sample_rate=48000:amplitude=0.3:seed=7:d=3',
    '-af', 'loudnorm=I=-14:TP=-2:linear=true,aresample=48000',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', parado,
  ]);
  const r = qc(parado, {dur: 3});
  assert.ok(r.medidas.congelados.length >= 1);
});

test('Evidências: gera tudo e a zona sai alinhada', () => {
  const pasta = join(tmp, 'evid');
  const r = evidencias(valido, pasta);
  assert.equal(r.quadros.length, 8);
  for (const f of ['folha.png', 'folha-zona.png', 'onda.png', 'evidencias.json', 'frames/t000.0.png', 'frames/t003.5.png']) {
    assert.ok(existsSync(join(pasta, f)), f);
  }
  // 1º quadro da folha começa em (8,8); canto superior esquerdo da zona superior do 9:16: (120,270) × 0,5
  const pixel = (x, y) => {
    const s = spawnSync('ffmpeg', ['-v', 'error', '-i', join(pasta, 'folha-zona.png'), '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {});
    return [...s.stdout];
  };
  const alvo = [0xc6, 0xff, 0x00];
  const perto = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 40);
  assert.ok(perto(pixel(8 + 60 + 1, 8 + 135 + 1), alvo), `zona superior: ${pixel(8 + 61, 8 + 136)}`);
  // canto inferior direito da zona inferior: (780,1250) × 0,5
  assert.ok(perto(pixel(8 + 390 - 2, 8 + 625 - 2), alvo), `zona inferior: ${pixel(8 + 388, 8 + 623)}`);
  assert.equal(COR_ZONA, '0xC6FF00');
});
