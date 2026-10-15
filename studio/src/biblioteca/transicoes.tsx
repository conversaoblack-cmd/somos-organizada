import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import {FIRME} from '../lib/movimento';

/**
 * "Virada de placa": a cena sai girando como o cartão do mosaico e a próxima entra pelo verso.
 * Única transição de cena da marca além do corte seco no tempo da música. Proibido: wipe genérico.
 */
type Props = {eixo?: 'x' | 'y'};

const ViradaDePlaca: React.FC<TransitionPresentationComponentProps<Props>> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const eixo = passedProps.eixo ?? 'x';
  const p = FIRME(presentationProgress);
  const saindo = presentationDirection === 'exiting';
  // 0..0,5: a cena que sai gira até 90°; 0,5..1: a que entra vem de −90° até 0°
  const angulo = saindo
    ? interpolate(p, [0, 0.5], [0, 90], {extrapolateRight: 'clamp'})
    : interpolate(p, [0.5, 1], [-90, 0], {extrapolateLeft: 'clamp'});
  const visivel = saindo ? p < 0.5 : p >= 0.5;
  const estilo: React.CSSProperties = useMemo(
    () => ({
      transform: `perspective(1800px) rotate${eixo === 'x' ? 'X' : 'Y'}(${angulo}deg)`,
      backfaceVisibility: 'hidden',
      opacity: visivel ? 1 : 0,
      filter: `brightness(${1 - Math.abs(angulo) / 180})`,
    }),
    [angulo, eixo, visivel],
  );
  return <AbsoluteFill style={estilo}>{children}</AbsoluteFill>;
};

export const viradaDePlaca = (props: Props = {}): TransitionPresentation<Props> => ({
  component: ViradaDePlaca,
  props,
});
