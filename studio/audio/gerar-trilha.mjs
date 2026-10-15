#!/usr/bin/env node
/**
 * Gera a trilha de percussão de torcida do PRÓPRIO estúdio a partir de uma partitura (sem licença de terceiros).
 * Uso: node audio/gerar-trilha.mjs <partitura.json> <saida.wav>
 *
 * partitura.json: {"bpm": 100, "compassos": [{"n": 2, "padrao": "tensao"}, {"n": 4, "padrao": "cheio"}, ...],
 *                  "viradasNoFim": [3, 7]}   // compassos (0-based) que terminam com virada de caixa/repique
 * Padrões: silencio · tensao (só surdo de primeira, pulsando) · base (surdos + ganzá) · cheio (tudo) ·
 *          breakdown (só tamborim e ganzá) · final (cheio + golpe final no 1º tempo do compasso seguinte).
 * Sai WAV 48 kHz estéreo; o montar-trilha.mjs faz ducking e loudness.
 */
import {gravarJson, lerJson, escreverWav, ff, TAXA} from './lib/comum.mjs';
import {colocar, INSTRUMENTOS as I, prng} from './lib/sintese.mjs';
import {rmSync} from 'node:fs';

export function gerarTrilha(partitura) {
  const bpm = partitura.bpm ?? 100;
  const tempo = 60 / bpm; // 1 tempo (semínima)
  const comp = tempo * 4;
  const total = partitura.compassos.reduce((t, c) => t + c.n, 0);
  // k conta compassos inteiros já tocados (índice usado por viradasNoFim)
  const dur = total * comp + 2;
  const out = new Float32Array(Math.round(dur * TAXA) * 2);
  const rnd = prng(1990);
  const s16 = tempo / 4;
  // pequena variação humana determinística (±6 ms e ±10% de intensidade)
  const humano = () => (rnd() - 0.5) * 0.012;
  const vel = (v) => v * (0.9 + rnd() * 0.2);
  let k = 0;
  let inicioBloco = 0;
  const viradas = new Set(partitura.viradasNoFim ?? []);
  const original = colocar;
  let limite = Infinity;
  // compasso fracionado (ex.: n = 3.5): eventos depois do fim do bloco não entram
  const colocarAte = (trilha, som, t, g, pan) => (t < limite - 1e-6 ? original(trilha, som, t, g, pan) : undefined);
  for (const bloco of partitura.compassos) {
    limite = inicioBloco + bloco.n * comp;
    const inteiros = Math.ceil(bloco.n);
    for (let b = 0; b < inteiros; b++, k++) {
      const t0 = inicioBloco + b * comp;
      const colocar = colocarAte;
      const p = bloco.padrao;
      const cheio = p === 'cheio' || p === 'final';
      if (p === 'tensao') {
        // ~9 dB abaixo do resto: a bateria que entra na virada precisa de espaço para soar como chegada
        colocar(out, I.surdo1(rnd, vel(0.8)), t0 + humano(), 0.32, 0);
        colocar(out, I.surdo1(rnd, vel(0.55)), t0 + 2 * tempo + humano(), 0.32, 0);
      }
      if (p === 'base' || cheio) {
        // marcação: segunda no 1 e no 3, primeira no 2 e no 4 (resposta grave)
        colocar(out, I.surdo2(rnd, vel(0.8)), t0 + humano(), 0.85, -0.25);
        colocar(out, I.surdo1(rnd, vel(1)), t0 + tempo + humano(), 1, 0.2);
        colocar(out, I.surdo2(rnd, vel(0.75)), t0 + 2 * tempo + humano(), 0.85, -0.25);
        colocar(out, I.surdo1(rnd, vel(1)), t0 + 3 * tempo + humano(), 1, 0.2);
        for (let i = 0; i < 16; i++) colocar(out, I.ganza(rnd, vel(i % 4 === 0 ? 1 : 0.6)), t0 + i * s16 + humano(), 0.9, 0.35);
      }
      if (cheio) {
        // caixa em semicolcheias com acentos (levada de bateria de torcida)
        const acentos = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
        for (let i = 0; i < 16; i++) colocar(out, I.caixa(rnd, vel(acentos[i] ? 0.9 : 0.35)), t0 + i * s16 + humano(), 0.7, -0.15);
        // repique chamando no 4
        colocar(out, I.repique(rnd, vel(0.9)), t0 + 3.5 * tempo + humano(), 0.6, 0.4);
      }
      if (cheio || p === 'breakdown') {
        // tamborim: frase sincopada
        for (const pos of [0, 3, 6, 8, 11, 14]) colocar(out, I.tamborim(rnd, vel(0.85)), t0 + pos * s16 + humano(), p === 'breakdown' ? 0.6 : 0.45, 0.5);
        if (p === 'breakdown') for (let i = 0; i < 16; i += 2) colocar(out, I.ganza(rnd, vel(0.5)), t0 + i * s16 + humano(), 0.7, 0.35);
      }
      if (viradas.has(k)) {
        // virada: caixa e repique em semicolcheias crescendo no último tempo ANTES do fim do bloco
        const fim = Math.min(t0 + comp, limite);
        for (let i = 0; i < 4; i++) {
          const t = fim - tempo + i * s16;
          colocar(out, I.caixa(rnd, vel(0.5 + i * 0.15)), t, 0.8, -0.1);
          colocar(out, I.repique(rnd, vel(0.4 + i * 0.15)), t + s16 / 2, 0.55, 0.3);
        }
      }
      if (p === 'final' && b === inteiros - 1) {
        // golpe final no 1º tempo do compasso seguinte
        original(out, I.surdo1(rnd, 1), t0 + comp, 1.1, 0);
        original(out, I.surdo2(rnd, 1), t0 + comp, 1, 0);
        original(out, I.caixa(rnd, 1), t0 + comp, 0.9, 0);
      }
    }
    inicioBloco += bloco.n * comp;
  }
  return {amostras: out, duracao: dur, compasso: comp, bpm};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [arqPartitura, saida] = process.argv.slice(2);
  if (!arqPartitura || !saida) {
    console.error('Uso: node audio/gerar-trilha.mjs <partitura.json> <saida.wav>');
    process.exit(2);
  }
  const r = gerarTrilha(lerJson(arqPartitura));
  const bruto = saida.replace(/\.wav$/, '.bruto.wav');
  escreverWav(bruto, r.amostras, 2);
  // sala de estádio: reflexões curtas + leve compressão de barramento (determinístico)
  ff(['-v', 'error', '-y', '-i', bruto, '-af', 'aecho=0.8:0.6:45|90|140:0.22|0.14|0.08,acompressor=ratio=2:threshold=-14dB:attack=10:release=120,alimiter=limit=0.89:level=false', '-c:a', 'pcm_s24le', '-fflags', '+bitexact', '-flags:a', '+bitexact', saida]);
  rmSync(bruto);
  gravarJson(saida.replace(/\.wav$/, '.json'), {bpm: r.bpm, compassoS: r.compasso, duracaoS: r.duracao, origem: 'síntese do estúdio (audio/lib/sintese.mjs), sem amostras de terceiros'});
  console.log(`Trilha → ${saida} (${r.duracao.toFixed(1)} s, ${r.bpm} BPM, compasso ${r.compasso.toFixed(3)} s)`);
}
