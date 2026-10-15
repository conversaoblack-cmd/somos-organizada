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
  [828, [0, 2.2, 16.5], [0, 9.4, -7]], // evento: aproxima (a diretoria no painel)
  [936, [0, 1.4, 19.5], [0, 8.4, -7]], // taxa: o mosaico enche de amarelo: abre
  [1150, [0, 1.6, 19], [0, 8.5, -7]],
  // CTA: desce abaixo da primeira fileira e avança olhando para cima. Calculado por projeção (fov 56): grade entre
  // y 280 e 620, fileira da frente perto de y 1300, texto por cima das fileiras de baixo.
  [1200, [0, 0, 5.3], [0, 6, -7]],
  [1350, [0, 0, 4.5], [0, 6, -7]],
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
