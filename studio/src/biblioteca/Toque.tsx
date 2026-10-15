import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {COR} from '../marca/tokens';
import {hexComAlfa} from './Mosaico';

/**
 * Anel parado e pulsando no alvo ANTES do toque. Lições (seção 6.3):
 * - o anel termina no quadro do toque e não sobra;
 * - o gesto essencial fica ≥ 1,5 s na tela (com a peça acelerada, multiplique pela `velocidade`).
 * Com `essencial` (padrão), um anel curto demais derruba o render em vez de passar despercebido.
 */
export const AnelAlvo: React.FC<{
  x: number;
  y: number;
  raio?: number;
  inicio: number;
  toque: number;
  essencial?: boolean;
  velocidade?: number;
  cor?: string;
}> = ({x, y, raio = 56, inicio, toque, essencial = true, velocidade = 1, cor = COR.azul}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const minimo = Math.ceil(1.5 * fps * velocidade);
  if (essencial && toque - inicio < minimo) {
    throw new Error(`AnelAlvo: gesto essencial com ${toque - inicio} frames; mínimo ${minimo} (1,5 s × velocidade ${velocidade}).`);
  }
  const pressao = interpolate(frame, [toque, toque + 3, toque + 8], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (frame < inicio || frame > toque + 8) return null;
  const antes = frame <= toque;
  const entrada = interpolate(frame, [inicio, inicio + 6], [0, 1], {extrapolateRight: 'clamp'});
  // pulso determinístico a cada 0,8 s
  const fase = ((frame - inicio) % Math.round(0.8 * fps)) / Math.round(0.8 * fps);
  const pulso = 1 + 0.12 * Math.sin(fase * Math.PI);
  const r = Math.round(raio * pulso * (0.7 + 0.3 * entrada) * 10) / 10;
  return (
    <>
      {antes && (
        // tamanho REAL animado (left/top/width/height), nunca transform: scale sobre sombra desfocada:
        // o Chrome reaproveita o raster da escala anterior conforme o tempo de CPU e o MP4 deixa de ser idêntico
        <div
          style={{
            position: 'absolute',
            left: x - r,
            top: y - r,
            width: r * 2,
            height: r * 2,
            borderRadius: '50%',
            border: `${raio * 0.09}px solid ${cor}`,
            boxShadow: `0 0 ${raio * 0.5}px ${hexComAlfa(cor, 0.55)}, inset 0 0 ${raio * 0.4}px ${hexComAlfa(cor, 0.3)}`,
            opacity: entrada,
          }}
        />
      )}
      {pressao > 0 && (
        <div
          style={{
            position: 'absolute',
            left: x - raio * 0.6,
            top: y - raio * 0.6,
            width: raio * 1.2,
            height: raio * 1.2,
            borderRadius: '50%',
            backgroundColor: hexComAlfa(cor, 0.45 * pressao),
          }}
        />
      )}
    </>
  );
};
