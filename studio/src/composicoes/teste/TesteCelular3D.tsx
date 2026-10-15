import React from 'react';
import {AbsoluteFill, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Celular3D, PalcoCelular} from '../../biblioteca/Celular3D';
import {COR} from '../../marca/tokens';

/** Still 3D de teste: mede o custo do WebGL por software (swangle) na nuvem. */
export const TesteCelular3D: React.FC = () => {
  const frame = useCurrentFrame();
  const giro = interpolate(frame, [0, 60], [-0.45, 0.2]);
  return (
    <AbsoluteFill style={{backgroundColor: COR.fundo}}>
      <AbsoluteFill
        style={{backgroundImage: 'radial-gradient(ellipse 70% 45% at 50% 10%, rgba(46,107,255,0.25), rgba(7,10,18,0) 70%)'}}
      />
      <PalcoCelular>
        <Celular3D tela={staticFile('teste/tela-teste.png')} rotacao={[-0.08, giro, 0.04]} escala={1.15} />
      </PalcoCelular>
    </AbsoluteFill>
  );
};
