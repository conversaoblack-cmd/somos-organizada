#!/usr/bin/env node
/**
 * Evidências para a mesa de avaliadores (seção 9): ninguém da mesa assiste ao vídeo; todos olham isto.
 * Uso: node scripts/evidencias.mjs <video.mp4> <pasta-de-saida> [--passo 0.5] [--largura 540]
 *
 * Gera em <pasta>:
 *   frames/t000.0.png ...      um quadro a cada `passo` s (largura reduzida; o tempo vai no nome)
 *   folha.png                  folha de contato com timecode em cada quadro
 *   folha-zona.png             a mesma folha com a zona essencial sobreposta (verde-limão = fora da paleta de propósito)
 *   onda.png                   forma de onda do áudio, com marcas de segundo
 *   evidencias.json            índice (tempos, arquivos, formato, zona usada)
 */
import {existsSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fracao, rodar, sonda} from './lib/ff.mjs';
import {formatoDoTamanho} from './lib/formatos.mjs';

// cor de sobreposição: propositalmente FORA da paleta (ninguém confunde com a peça)
export const COR_ZONA = '0xC6FF00';
const FONTES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial.ttf',
];

function args(argv) {
  const pos = [];
  const op = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) op[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  return {pos, op};
}

/** Filtro drawbox da zona essencial, já na escala do quadro reduzido. */
export function filtroZona(formato, escala) {
  const box = ([x1, y1, x2, y2]) =>
    `drawbox=x=${Math.round(x1 * escala)}:y=${Math.round(y1 * escala)}:w=${Math.round((x2 - x1) * escala)}:h=${Math.round((y2 - y1) * escala)}:color=${COR_ZONA}@0.9:t=3`;
  return [box(formato.superior), box(formato.inferior)].join(',');
}

export function evidencias(video, pasta, {passo = 0.5, largura = 540} = {}) {
  const info = sonda(video);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  const duracao = Number(info.format.duration);
  const formato = formatoDoTamanho(v.width, v.height);
  const escala = largura / v.width;
  const altura = Math.round(v.height * escala / 2) * 2;
  const fonte = FONTES.find((f) => existsSync(f));
  mkdirSync(pasta, {recursive: true});
  const dirFrames = join(pasta, 'frames');
  rmSync(dirFrames, {recursive: true, force: true});
  mkdirSync(dirFrames, {recursive: true});

  // quadros a cada `passo` s, pelo tempo de apresentação (não por índice: gravação pode ter taxa variável)
  const tempos = [];
  for (let t = 0; t < duracao - 1e-6; t += passo) tempos.push(Number(t.toFixed(3)));
  const fpsSaida = 1 / passo;
  rodar('ffmpeg', [
    '-v', 'error', '-y', '-i', video,
    '-vf', `fps=${fpsSaida}:start_time=0:round=down,scale=${largura}:${altura}:flags=lanczos`,
    '-frames:v', String(tempos.length),
    '-start_number', '0',
    join(dirFrames, 'q%04d.png'),
  ]);
  const gerados = readdirSync(dirFrames).filter((f) => f.startsWith('q')).sort();
  const quadros = gerados.map((f, i) => {
    const t = tempos[i] ?? i * passo;
    const nome = `t${t.toFixed(1).padStart(5, '0')}.png`;
    rodar('mv', [join(dirFrames, f), join(dirFrames, nome)]);
    return {t, arquivo: `frames/${nome}`};
  });

  // folha de contato (com e sem zona)
  const colunas = 6;
  const linhas = Math.ceil(quadros.length / colunas);
  const rotulo = fonte
    ? `drawtext=fontfile='${fonte}':text='%{eif\\:n*${passo}\\:d}.%{eif\\:mod(n*${passo * 10}\\,10)\\:d} s':x=10:y=10:fontsize=${Math.round(largura / 13)}:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=8`
    : 'null';
  const entrada = ['-v', 'error', '-y', '-framerate', String(fpsSaida), '-pattern_type', 'glob', '-i', join(dirFrames, 't*.png')];
  const tile = `tile=${colunas}x${linhas}:padding=8:margin=8:color=0x20242D`;
  rodar('ffmpeg', [...entrada, '-vf', `${rotulo},${tile}`, '-frames:v', '1', join(pasta, 'folha.png')]);
  if (formato) {
    rodar('ffmpeg', [...entrada, '-vf', `${filtroZona(formato, escala)},${rotulo},${tile}`, '-frames:v', '1', join(pasta, 'folha-zona.png')]);
  }

  // forma de onda com marcas de segundo
  if (a) {
    const W = Math.max(1200, Math.round(duracao * 120));
    const marcas = Array.from({length: Math.floor(duracao)}, (_, s) => `drawbox=x=${Math.round((s / duracao) * W)}:y=0:w=1:h=240:color=0x888C93@0.6:t=fill`).join(',');
    rodar('ffmpeg', [
      '-v', 'error', '-y', '-i', video,
      '-filter_complex', `[0:a:0]aformat=channel_layouts=mono,showwavespic=s=${W}x240:colors=0x2E6BFF:scale=sqrt[o];[o]${marcas || 'null'}`,
      '-frames:v', '1', join(pasta, 'onda.png'),
    ]);
  }

  const indice = {
    video,
    duracao,
    fps: fracao(v.avg_frame_rate),
    passo,
    largura,
    escala,
    formato: formato?.id ?? null,
    zona: formato ? {superior: formato.superior, inferior: formato.inferior} : null,
    quadros,
    folha: 'folha.png',
    folhaZona: formato ? 'folha-zona.png' : null,
    onda: a ? 'onda.png' : null,
  };
  writeFileSync(join(pasta, 'evidencias.json'), JSON.stringify(indice, null, 2) + '\n');
  return indice;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const {pos, op} = args(process.argv.slice(2));
  if (pos.length < 2) {
    console.error('Uso: node scripts/evidencias.mjs <video.mp4> <pasta-de-saida> [--passo 0.5] [--largura 540]');
    process.exit(2);
  }
  const r = evidencias(pos[0], pos[1], {passo: op.passo ? Number(op.passo) : undefined, largura: op.largura ? Number(op.largura) : undefined});
  console.log(`Evidências: ${r.quadros.length} quadros (${r.passo} s), folha, ${r.folhaZona ? 'folha com zona, ' : ''}${r.onda ? 'onda' : 'sem áudio'} → ${pos[1]}`);
}
