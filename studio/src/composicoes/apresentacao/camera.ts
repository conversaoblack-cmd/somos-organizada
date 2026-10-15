import {interpolate} from 'remotion';
import {FIRME} from '../../lib/movimento';
import type {CameraPalco} from './Palco';

/**
 * Caminho da câmera na arquibancada (frame global). Movimento contínuo e lento (nada parado 1 s ou mais), com
 * mudanças de enquadramento nas viradas. Pontos-chave: [frame, posição, alvo].
 */
type Chave = [number, [number, number, number], [number, number, number]];
const CHAVES: Chave[] = [
  [0, [0, 2.5, 15], [0, 9.5, -8]], // gancho: perto, olhando para cima, no escuro
  [108, [0, 3.2, 13.5], [0, 10, -8]],
  [250, [1.5, 4.5, 11.5], [0, 11, -8]], // problema: avança pela fileira
  [262, [0, 1.6, 19], [0, 8.6, -7]], // virada: recua e revela a arquibancada inteira
  [360, [0, 2.4, 15.2], [0, 9.6, -7]], // virada: push-in contínuo na grade recém-nascida
  [504, [-0.8, 1.6, 18.5], [0, 8.6, -7]],
  [684, [0.8, 1.8, 18], [0, 8.8, -7]],
  [828, [0, 2.2, 16.5], [0, 9.4, -7]], // taxa: aproxima (confidência)
  [972, [0, 1.4, 19.5], [0, 8.4, -7]], // evento: o mosaico enche: abre
  [1188, [0, -1.5, 30], [0, 1.2, -7]], // CTA: recua e abaixa o olhar: a grade sobe e abre espaço para o texto
  [1350, [0, -1.3, 29], [0, 1.3, -7]],
];

export function cameraNoFrame(frame: number): CameraPalco {
  let i = 0;
  while (i < CHAVES.length - 2 && frame >= CHAVES[i + 1][0]) i++;
  const [f0, p0, a0] = CHAVES[i];
  const [f1, p1, a1] = CHAVES[i + 1];
  const t = FIRME(interpolate(frame, [f0, f1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const mix = (a: number[], b: number[]) => a.map((x, k) => x + (b[k] - x) * t) as [number, number, number];
  return {posicao: mix(p0, p1), alvo: mix(a0, a1), fov: 56};
}
