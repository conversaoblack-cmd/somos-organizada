#!/usr/bin/env node
/**
 * Gera o TAKE ÚNICO da narração (todas as falas numa gravação só, para a voz ficar consistente; seção 6.5).
 * Uso:
 *   node audio/gerar-take.mjs <peca> --guia          voz guia do sistema (espeak-ng na nuvem, `say` no Mac): SÓ para cronometrar
 *   node audio/gerar-take.mjs <peca> --elevenlabs    take final pela ElevenLabs (custa créditos; confirme antes)
 *
 * Lê audio/<peca>/narracao.json. Saída: audio/<peca>/take/take-guia.wav ou take-elevenlabs.mp3 + take.json (o que foi pedido).
 * Chave: process.env.ELEVENLABS_API_KEY (nunca em arquivo, chat ou log). Voz: narracao.json → voz.id (a definir com o dono).
 * Nunca publique com a voz guia.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {TAXA, ff, gravarJson, lerJson, RAIZ} from './lib/comum.mjs';

export const PAUSA_ENTRE_FALAS_S = 0.8;

export function textoDoTake(narracao, modelo) {
  const v3 = /v3/.test(modelo);
  // v2: <break> entre falas; v3 não aceita <break>: pausa por pontuação e quebra de linha
  return narracao.falas.map((f) => f.texto.trim()).join(v3 ? '\n\n' : ` <break time="${PAUSA_ENTRE_FALAS_S}s" /> `);
}

function guia(narracao, pasta) {
  const tmp = join(pasta, '.guia');
  rmSync(tmp, {recursive: true, force: true});
  mkdirSync(tmp, {recursive: true});
  const mac = process.platform === 'darwin';
  const lista = [];
  narracao.falas.forEach((f, i) => {
    const bruto = join(tmp, `f${i}.${mac ? 'aiff' : 'wav'}`);
    const r = mac
      ? spawnSync('say', ['-v', narracao.voz?.guiaMac ?? 'Luciana', '-o', bruto, f.texto])
      : spawnSync('espeak-ng', ['-v', 'pt-br', '-s', String(narracao.voz?.guiaPalavrasPorMinuto ?? 165), '-w', bruto, f.texto]);
    if (r.status !== 0) throw new Error(`voz guia falhou (${mac ? 'say' : 'espeak-ng; instale com apt-get install espeak-ng'}): ${r.stderr}`);
    const wav = join(tmp, `n${i}.wav`);
    ff(['-v', 'error', '-y', '-i', bruto, '-ar', String(TAXA), '-ac', '1', wav]);
    lista.push(wav);
  });
  const silencio = join(tmp, 'pausa.wav');
  ff(['-v', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=${TAXA}:cl=mono`, '-t', String(PAUSA_ENTRE_FALAS_S), silencio]);
  const entradas = lista.flatMap((w, i) => (i ? [silencio, w] : [w]));
  const saida = join(pasta, 'take-guia.wav');
  ff([
    '-v', 'error', '-y',
    ...entradas.flatMap((e) => ['-i', e]),
    '-filter_complex', `${entradas.map((_, i) => `[${i}:a]`).join('')}concat=n=${entradas.length}:v=0:a=1`,
    '-fflags', '+bitexact', '-flags:a', '+bitexact', saida,
  ]);
  rmSync(tmp, {recursive: true, force: true});
  return saida;
}

async function elevenlabs(narracao, pasta) {
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) {
    console.error('configure ELEVENLABS_API_KEY no ambiente (menu do ambiente → Edit → variáveis/segredos). Nunca cole a chave no chat.');
    process.exit(3);
  }
  const voz = narracao.voz ?? {};
  if (!voz.id) throw new Error('narracao.json sem voz.id (voz da ElevenLabs a definir com o dono)');
  const modelo = voz.modelo ?? 'eleven_multilingual_v2';
  const formato = voz.formato ?? 'mp3_44100_128';
  const corpo = {
    text: textoDoTake(narracao, modelo),
    model_id: modelo,
    language_code: 'pt',
    ...(voz.semente !== undefined ? {seed: voz.semente} : {}),
    voice_settings: voz.ajustes ?? {stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true},
  };
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz.id)}?output_format=${formato}`, {
    method: 'POST',
    headers: {'xi-api-key': chave, 'content-type': 'application/json', accept: 'audio/mpeg'},
    body: JSON.stringify(corpo),
  });
  if (!r.ok) {
    // não imprime cabeçalhos (a chave vai neles)
    throw new Error(`ElevenLabs respondeu ${r.status}: ${(await r.text()).slice(0, 400)}`);
  }
  const saida = join(pasta, 'take-elevenlabs.mp3');
  writeFileSync(saida, Buffer.from(await r.arrayBuffer()));
  return {saida, pedido: {...corpo, voice_id: voz.id, output_format: formato}};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const peca = process.argv[2];
  if (!peca || peca.startsWith('--')) {
    console.error('Uso: node audio/gerar-take.mjs <peca> --guia | --elevenlabs');
    process.exit(2);
  }
  const dir = join(RAIZ, 'audio', peca);
  const narracao = lerJson(join(dir, 'narracao.json'));
  const pasta = join(dir, 'take');
  mkdirSync(pasta, {recursive: true});
  if (process.argv.includes('--elevenlabs')) {
    const {saida, pedido} = await elevenlabs(narracao, pasta);
    gravarJson(join(pasta, 'take.json'), {tipo: 'elevenlabs', arquivo: 'take-elevenlabs.mp3', geradoEm: new Date().toISOString(), pedido});
    console.log(`Take final → ${saida}`);
  } else {
    const saida = guia(narracao, pasta);
    gravarJson(join(pasta, 'take.json'), {tipo: 'guia', arquivo: 'take-guia.wav', aviso: 'VOZ GUIA: só para cronometrar; nunca publicar'});
    console.log(`Voz guia → ${saida}${existsSync(saida) ? '' : ' (falhou)'}`);
  }
}
