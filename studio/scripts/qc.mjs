#!/usr/bin/env node
/**
 * QC técnico automático de um render (seção 9).
 * Uso: node scripts/qc.mjs <video.mp4> <saida.json | pasta> --dur <segundos> [--formato vertical] [--fps 30]
 *
 * Mede: resolução, fps, codec, pixel format, tag de cor, duração, presença de áudio, loudness EBU R128 integrado
 * (alvo −14 LUFS ± 1), true peak (≤ −1 dBTP), segmentos pretos, quadros congelados ≥ 1 s, deriva áudio × vídeo e
 * áudio mudo. Escreve qc.json com a nota técnica (0 a 10).
 * Falha crítica (spec errada, render mudo, sem áudio) = nota 0 e saída ≠ 0.
 */
import {mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fracao, loudness, rodar, segmentos, sonda} from './lib/ff.mjs';

const DADOS = JSON.parse(readFileSync(new URL('../src/formatos.json', import.meta.url), 'utf8'));
const FORMATOS = Object.fromEntries(Object.entries(DADOS).filter(([k]) => !k.startsWith('_')).map(([k, f]) => [k, [f.width, f.height]]));
export const ALVO = {lufs: -14, toleranciaLufs: 1, truePeakMax: -1, fps: 30, toleranciaDuracao: 0.1, derivaMax: 0.1};
const DESCONTO = {critica: 10, alta: 2, media: 1, baixa: 0.5, cosmetica: 0};

function args(argv) {
  const pos = [];
  const op = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) op[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
    else pos.push(argv[i]);
  }
  return {pos, op};
}

export function qc(video, {dur, formato = 'vertical', fps = ALVO.fps} = {}) {
  const problemas = [];
  const p = (gravidade, criterio, descricao, evidencia) => problemas.push({gravidade, criterio, descricao, evidencia});
  const info = sonda(video);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  const duracao = Number(info.format.duration);
  const medidas = {arquivo: video, bytes: statSync(video).size, duracao};

  if (!v) p('critica', 'tecnica', 'sem trilha de vídeo', 'ffprobe');
  else {
    const [W, H] = FORMATOS[formato] ?? FORMATOS.vertical;
    const fpsReal = fracao(v.avg_frame_rate);
    Object.assign(medidas, {
      largura: v.width,
      altura: v.height,
      fps: fpsReal,
      codec: v.codec_name,
      pixFmt: v.pix_fmt,
      espacoDeCor: v.color_space ?? null,
      primarias: v.color_primaries ?? null,
      transferencia: v.color_transfer ?? null,
      bitrateVideo: Number(v.bit_rate ?? 0),
    });
    if (v.width !== W || v.height !== H) p('critica', 'tecnica', `resolução ${v.width}×${v.height}, esperado ${W}×${H} (${formato})`, 'ffprobe');
    if (Math.abs(fpsReal - fps) > 0.01) p('critica', 'tecnica', `fps ${fpsReal.toFixed(3)}, esperado ${fps}`, 'ffprobe');
    if (v.codec_name !== 'h264') p('critica', 'tecnica', `codec ${v.codec_name}, esperado h264`, 'ffprobe');
    if (v.pix_fmt !== 'yuv420p') p('critica', 'tecnica', `pix_fmt ${v.pix_fmt}, esperado yuv420p`, 'ffprobe');
    if (v.color_space !== 'bt709' || v.color_primaries !== 'bt709') {
      p('media', 'tecnica', `tag de cor ${v.color_space}/${v.color_primaries}, esperado bt709 (azul e amarelo podem deslocar)`, 'ffprobe');
    }
  }
  if (dur !== undefined && Math.abs(duracao - Number(dur)) > ALVO.toleranciaDuracao) {
    p('critica', 'tecnica', `duração ${duracao.toFixed(3)} s, esperado ${Number(dur).toFixed(3)} s`, 'ffprobe');
  }

  if (!a) p('critica', 'tecnica', 'sem trilha de áudio (composição sem a prop de áudio ligada?)', 'ffprobe');
  else {
    const durAudio = Number(a.duration ?? duracao);
    const durVideo = Number(v?.duration ?? duracao);
    medidas.deriva = Number((durAudio - durVideo).toFixed(3));
    if (Math.abs(medidas.deriva) > ALVO.derivaMax) p('alta', 'tecnica', `deriva áudio × vídeo de ${medidas.deriva} s`, 'ffprobe');
    Object.assign(medidas, loudness(video));
    const vol = rodar('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], {
      permitirFalha: true,
    }).stderr;
    const media = vol.match(/mean_volume:\s+(-?[\d.]+|-inf) dB/);
    medidas.volumeMedioDb = media ? Number(media[1]) : null;
    if (medidas.volumeMedioDb === null || !Number.isFinite(medidas.volumeMedioDb) || medidas.volumeMedioDb < -60) {
      p('critica', 'tecnica', 'áudio mudo (render sem som)', 'volumedetect');
    } else {
      if (medidas.integradoLufs === null || Math.abs(medidas.integradoLufs - ALVO.lufs) > ALVO.toleranciaLufs) {
        p('alta', 'tecnica', `loudness ${medidas.integradoLufs} LUFS, alvo ${ALVO.lufs} ± ${ALVO.toleranciaLufs}`, 'ebur128');
      }
      if (medidas.truePeakDbtp === null || medidas.truePeakDbtp > ALVO.truePeakMax) {
        p('alta', 'tecnica', `true peak ${medidas.truePeakDbtp} dBTP, máximo ${ALVO.truePeakMax}`, 'ebur128');
      }
    }
  }

  if (v) {
    const det = rodar(
      'ffmpeg',
      ['-hide_banner', '-nostats', '-i', video, '-map', '0:v:0', '-vf', 'blackdetect=d=0.25:pix_th=0.06,freezedetect=n=0.0005:d=1', '-f', 'null', '-'],
      {permitirFalha: true},
    ).stderr;
    const pretos = [...det.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => ({inicio: Number(m[1]), fim: Number(m[2])}));
    const congelados = segmentos(det, /freeze_start: ([\d.]+)/g, /freeze_end: ([\d.]+)/g).map((s) => ({
      inicio: s.inicio,
      fim: s.fim ?? duracao,
    }));
    medidas.segmentosPretos = pretos;
    medidas.congelados = congelados;
    for (const s of pretos) p('alta', 'tecnica', `tela preta de ${s.inicio.toFixed(2)} a ${s.fim.toFixed(2)} s`, 'blackdetect');
    for (const s of congelados) {
      p('media', 'visual', `quadro parado de ${s.inicio.toFixed(2)} a ${s.fim.toFixed(2)} s (≥ 1 s sem movimento; tem motivo?)`, 'freezedetect');
    }
  }

  const critico = problemas.some((x) => x.gravidade === 'critica');
  const desconto = problemas.reduce((t, x) => t + DESCONTO[x.gravidade], 0);
  const nota = critico ? 0 : Math.max(0, Number((10 - desconto).toFixed(1)));
  return {gerado: new Date().toISOString(), alvo: ALVO, formato, medidas, problemas, nota, falhaCritica: critico};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const {pos, op} = args(process.argv.slice(2));
  if (pos.length < 1) {
    console.error('Uso: node scripts/qc.mjs <video.mp4> <saida.json|pasta> --dur <s> [--formato vertical] [--fps 30]');
    process.exit(2);
  }
  const [video, saidaArg = '.'] = pos;
  const saida = saidaArg.endsWith('.json') ? saidaArg : join(saidaArg, 'qc.json');
  const r = qc(video, {dur: op.dur, formato: op.formato, fps: op.fps ? Number(op.fps) : undefined});
  mkdirSync(dirname(saida), {recursive: true});
  writeFileSync(saida, JSON.stringify(r, null, 2) + '\n');
  const m = r.medidas;
  console.log(
    `QC ${video}: nota ${r.nota}/10 · ${m.largura}×${m.altura} ${m.fps?.toFixed?.(2)} fps ${m.codec} · ${m.duracao?.toFixed(2)} s · ` +
      `${m.integradoLufs ?? '–'} LUFS · TP ${m.truePeakDbtp ?? '–'} dBTP`,
  );
  for (const x of r.problemas) console.log(`  [${x.gravidade}] ${x.descricao}`);
  console.log(`→ ${saida}`);
  process.exit(r.falhaCritica ? 1 : 0);
}
