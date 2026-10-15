#!/usr/bin/env node
/**
 * Gera a "câmera falsa" da portaria: um vídeo .y4m do celular do torcedor mostrando o ingresso (QR REAL capturado do
 * produto), que o Chromium usa como câmera (`cameraFalsa` no roteiro do gravar-produto.mjs). O leitor de QR do produto
 * decodifica esse vídeo como faria com uma câmera de verdade.
 *
 * Uso: node scripts/camera-falsa.mjs <ingresso-qr.png> <saida.y4m>
 *
 * - 1280×720 a 15 fps: o leitor pede câmera de pelo menos 1024 px de largura (como a traseira de um celular);
 *   abaixo disso o pedido falha e cai em outras tentativas.
 * - Linha do tempo (26 s, o Chromium repete o arquivo): 0–2 s sem nada → 2–7 s celular na frente (1ª leitura) →
 *   7–12 s celular abaixado → 12–17 s o MESMO QR de novo (2ª leitura) → resto sem nada. A portaria só aceita o mesmo
 *   QR depois de 3 s fora da câmera (DEBOUNCE_MS), por isso o vão de 5 s.
 * - Fundo escuro com ruído, vinheta, leve tremor de mão e desfoque de lente: parece câmera, não tela.
 * - Espelhado de propósito: a câmera falsa não diz que é a traseira, e o leitor espelha câmera sem lado (como faz com a
 *   frontal). Espelhando na origem, a tela mostra o ingresso como num celular de verdade com a câmera traseira.
 * Pesa ~540 MB: gere no scratchpad, nunca no Git.
 */
import {rodar} from './lib/ff.mjs';
import {dirname, join} from 'node:path';

const [png, saida] = process.argv.slice(2);
if (!png || !saida) {
  console.error('Uso: node scripts/camera-falsa.mjs <ingresso-qr.png> <saida.y4m>');
  process.exit(1);
}
const celular = join(dirname(saida), 'camera-celular.png');
// recorte do cartão do ingresso (título, QR e código) na captura 1170×2532
rodar('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', 'crop=1170:1360:0:230,scale=-2:600,pad=iw+30:ih+30:15:15:color=0x05070B', celular]);
const aparece = (a, b) => `clip((t-${a})/0.4,0,1)*clip((${b}-t)/0.4,0,1)`;
const y = `60+10*sin(1.7*t)+680*(1-${aparece(2, 7)}-${aparece(12, 17)})`;
rodar('ffmpeg', [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'color=c=0x101418:s=1280x720:r=15:d=26',
  '-loop', '1', '-i', celular,
  '-filter_complex', `[0]noise=alls=10:allf=t,vignette=PI/4[f];[1]format=rgba[c];[f][c]overlay=x='(W-w)/2+16*sin(1.3*t)':y='${y}':shortest=1,gblur=sigma=1,hflip,format=yuv420p`,
  '-t', '26', '-f', 'yuv4mpegpipe', saida,
]);
console.log(`Câmera falsa → ${saida}`);
