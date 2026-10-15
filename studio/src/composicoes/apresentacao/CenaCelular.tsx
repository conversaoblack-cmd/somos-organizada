import React from 'react';
import {interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Celular3D} from '../../biblioteca/Celular3D';
import {ENTRADA, FIRME} from '../../lib/movimento';
import {Frente} from './Palco';

/**
 * O celular 3D com a tela REAL do produto. Troca de tela por corte seco (na batida); entra subindo em ≤ 8 frames e sai
 * virando como placa. Push-in = o aparelho se aproxima e desloca (3D, sem scale CSS).
 * `pose` por frame local: [posição, rotação, escala] interpolados entre chaves.
 */
export type ChaveCelular = {f: number; pos: [number, number, number]; rot: [number, number, number]; esc: number};

function poseNoFrame(chaves: ChaveCelular[], frame: number) {
  let i = 0;
  while (i < chaves.length - 2 && frame >= chaves[i + 1].f) i++;
  const a = chaves[i];
  const b = chaves[Math.min(i + 1, chaves.length - 1)];
  const t = a === b ? 0 : FIRME(interpolate(frame, [a.f, b.f], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const mix = (x: number[], y: number[]) => x.map((v, k) => v + (y[k] - v) * t) as [number, number, number];
  return {pos: mix(a.pos, b.pos), rot: mix(a.rot, b.rot), esc: a.esc + (b.esc - a.esc) * t};
}

export const CenaCelular: React.FC<{
  /** telas por corte seco: [frame local de início, arquivo em public/apresentacao/telas] */
  telas: [number, string][];
  chaves: ChaveCelular[];
  duracao: number;
  /** frame local em que o celular sai virando (padrão: 10 frames antes do fim) */
  saida?: number;
}> = ({telas, chaves, duracao, saida = duracao - 10}) => {
  const frame = useCurrentFrame();
  const pose = poseNoFrame(chaves, frame);
  const entrada = interpolate(frame, [0, 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ENTRADA});
  const sai = interpolate(frame, [saida, saida + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: FIRME});
  const y = pose.pos[1] - (1 - entrada) * 2.2;
  const rx = pose.rot[0] - sai * Math.PI * 0.5;
  return (
    <Frente>
      {telas.map(([de, arquivo], i) => {
        const ate = telas[i + 1]?.[0] ?? duracao;
        return (
          <Sequence key={arquivo + de} from={de} durationInFrames={ate - de} layout="none">
            <Celular3D tela={staticFile(`apresentacao/telas/${arquivo}`)} posicao={[pose.pos[0], y, pose.pos[2]]} rotacao={[rx, pose.rot[1], pose.rot[2]]} escala={pose.esc * (1 - sai * 0.15)} />
          </Sequence>
        );
      })}
    </Frente>
  );
};
