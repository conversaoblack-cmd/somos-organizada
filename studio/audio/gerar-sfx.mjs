#!/usr/bin/env node
/** Gera os SFX sintetizados do estúdio em audio/sfx/<nome>.wav (sem licença de terceiros). Uso: node audio/gerar-sfx.mjs */
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {escreverWav, RAIZ} from './lib/comum.mjs';
import {prng, SFX} from './lib/sintese.mjs';

const pasta = join(RAIZ, 'audio', 'sfx');
mkdirSync(pasta, {recursive: true});
for (const [nome, f] of Object.entries(SFX)) {
  const mono = f(prng(nome.length * 7919));
  const est = new Float32Array(mono.length * 2);
  for (let i = 0; i < mono.length; i++) est[i * 2] = est[i * 2 + 1] = mono[i];
  escreverWav(join(pasta, `${nome}.wav`), est, 2);
  console.log(`audio/sfx/${nome}.wav (${(mono.length / 48000).toFixed(2)} s)`);
}
