import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {after, test} from 'node:test';

const RAIZ = new URL('../../', import.meta.url).pathname;
const PECA = '_teste';
const DIR = join(RAIZ, 'audio', PECA);
const temTts = ['espeak-ng', 'say'].some((c) => spawnSync('which', [c]).status === 0);

const rodar = (script, ...args) => {
  const r = spawnSync('node', [join(RAIZ, 'audio', script), PECA, ...args], {encoding: 'utf8', cwd: RAIZ});
  assert.equal(r.status, 0, `${script}: ${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const ff = (args) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]).status, 0);
const ler = (p) => readFileSync(join(RAIZ, p));

function pipeline() {
  rodar('gerar-take.mjs', '--guia');
  rodar('alinhar-take.mjs');
  rodar('narrar.mjs');
  rodar('montar-trilha.mjs');
  return {
    falas: ['gancho', 'problema', 'virada'].map((id) => ler(`audio/${PECA}/falas/${id}.wav`)),
    voz: ler(`public/audio/${PECA}/voz.wav`),
    final: ler(`public/audio/${PECA}/final.wav`),
    legenda: ler(`src/composicoes/${PECA}/legenda.json`),
  };
}

after(() => {
  for (const p of [DIR, join(RAIZ, 'public/audio', PECA), join(RAIZ, 'src/composicoes', PECA)]) rmSync(p, {recursive: true, force: true});
});

test('Áudio: duas execuções dão arquivos idênticos; −14 LUFS e true peak ≤ −1 dBTP; legenda pelo tempo real', {skip: temTts ? false : 'sem voz guia (espeak-ng/say)', timeout: 600000}, () => {
  mkdirSync(DIR, {recursive: true});
  copyFileSync(new URL('./fixtures/audio/narracao.json', import.meta.url), join(DIR, 'narracao.json'));
  copyFileSync(new URL('./fixtures/audio/mix.json', import.meta.url), join(DIR, 'mix.json'));
  // trilha sintética com "surdo" a cada 0,5 s (determinística) e um SFX curto
  ff(['-f', 'lavfi', '-i', "aevalsrc=0.6*sin(2*PI*55*t)*exp(-9*mod(t\\,0.5))+0.12*sin(2*PI*220*t)*(1+sin(2*PI*0.25*t)):s=48000:d=12", '-ac', '2', '-c:a', 'pcm_s16le', join(DIR, 'trilha-sintetica.wav')]);
  ff(['-f', 'lavfi', '-i', "aevalsrc=0.8*sin(2*PI*880*t)*exp(-25*t):s=48000:d=0.3", '-ac', '2', '-c:a', 'pcm_s16le', join(DIR, 'toque.wav')]);

  const a = pipeline();
  const b = pipeline();
  a.falas.forEach((f, i) => assert.ok(f.equals(b.falas[i]), `fala ${i} diferente`));
  assert.ok(a.voz.equals(b.voz), 'voz.wav diferente');
  assert.ok(a.final.equals(b.final), 'final.wav diferente');
  assert.ok(a.legenda.equals(b.legenda), 'legenda.json diferente');

  const res = JSON.parse(readFileSync(join(DIR, 'mix-resultado.json'), 'utf8'));
  assert.ok(Math.abs(res.medida.lufs + 14) <= 0.5, `LUFS ${res.medida.lufs}`);
  assert.ok(res.medida.truePeak <= -1, `TP ${res.medida.truePeak}`);

  const falas = JSON.parse(readFileSync(join(DIR, 'falas.json'), 'utf8'));
  assert.equal(falas.falas.length, 3);
  assert.equal(falas.falas[2].velocidade, 1.0); // exceção: insight a 1,0×
  assert.equal(falas.falas[0].velocidade, 1.1);
  const tempos = JSON.parse(readFileSync(join(DIR, 'tempos.json'), 'utf8'));
  assert.deepEqual(tempos.erros, []);
  const legenda = JSON.parse(a.legenda.toString());
  assert.equal(legenda[0].gancho, true);
  assert.equal(legenda[0].faixa, 'alta');
  // palavras dentro da fala e em ordem
  for (const bloco of legenda) {
    for (let i = 1; i < bloco.palavras.length; i++) assert.ok(bloco.palavras[i].startMs >= bloco.palavras[i - 1].startMs);
  }
  const destaque = legenda.flatMap((b) => b.palavras).filter((p) => p.cor);
  assert.deepEqual(destaque.map((p) => p.text), ['mensalidade', 'print', 'se', 'cobra', 'sozinha.']);
  assert.ok(existsSync(join(RAIZ, 'public/audio', PECA, 'final.wav')));
});
