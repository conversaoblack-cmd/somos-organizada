import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Palco} from './Palco';
import {cameraNoFrame} from './camera';
import {linhaDoTempoPlaca} from './mosaico';
import {CENAS} from './roteiro';

/**
 * A arquibancada da peça inteira (uma só, frame global). O desfoque muda só nos cortes (nunca animado): sem celular na
 * frente, nítida; com celular, profundidade de campo.
 */
const COM_CELULAR: (keyof typeof CENAS)[] = ['socio', 'ingresso', 'dinheiro', 'taxa', 'evento', 'prova'];

export const FundoArquibancada: React.FC = () => {
  const frame = useCurrentFrame();
  const cena = (Object.keys(CENAS) as (keyof typeof CENAS)[]).find((k) => frame >= CENAS[k].de && frame < CENAS[k].ate) ?? 'cta';
  const celular = COM_CELULAR.includes(cena);
  const brilho = frame < CENAS.virada.de ? 0.55 : 1;
  return <Palco placas={linhaDoTempoPlaca} camera={cameraNoFrame(frame)} brilhoRefletores={brilho} desfoque={celular ? 6 : 0} escurecer={celular ? 0.28 : 0} />;
};
