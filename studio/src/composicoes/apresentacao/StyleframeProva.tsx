import React, {useCallback} from 'react';
import {AbsoluteFill, interpolate, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {type EstadoPlaca} from '../../biblioteca/Arquibancada3D';
import {Celular3D} from '../../biblioteca/Celular3D';
import {escala, formatoPorTamanho} from '../../formatos';
import {FIRME, progresso} from '../../lib/movimento';
import {COR, FONTE, MARCA} from '../../marca/tokens';
import {corDaGrade, Frente, Palco} from './Palco';

/**
 * Styleframe da cena de PROVA (portaria): o celular com a tela REAL "LIBERADO" na frente da arquibancada, que acende
 * em azul (ação) atrás; frase de impacto "Cada QR entra uma vez só".
 */
export const StyleframeProva: React.FC<{tela?: string; frase?: [string, string]; corDestaque?: string}> = ({
  tela = 'apresentacao/telas/portaria-ja-utilizado-rafael.png',
  frase = ['Cada QR entra', 'uma vez só.'],
  corDestaque = COR.amarelo,
}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const k = escala(width);
  const z = formatoPorTamanho(width, height).zona;
  const placas = useCallback((c: number, l: number): EstadoPlaca[] => {
    const r = random(`prova-${c}-${l}`);
    const g = corDaGrade(c, l);
    if (g) return [{cor: '#1B2A55', de: -30}];
    return r < 0.35 ? [{cor: r < 0.12 ? COR.azul : '#22305A', de: -30 + r * 40}] : [];
  }, []);
  const t = FIRME(interpolate(frame, [0, 90], [0, 1], {extrapolateRight: 'clamp'}));
  const p = progresso(frame, 4, 12);
  return (
    <AbsoluteFill style={{backgroundColor: COR.fundo}}>
      <Palco placas={placas} camera={{posicao: [0, 1.2, 20 - t * 1.2], alvo: [0, 8.2, -7], fov: 56}} brilhoRefletores={0.8} desfoque={7} escurecer={0.25} />
      <Frente>
        <Celular3D tela={staticFile(tela)} posicao={[0, -0.55, 0]} rotacao={[-0.05, -0.24 + t * 0.14, 0.03]} escala={0.8} />
      </Frente>
      {/* frase de impacto, na zona superior */}
      <div
        style={{
          position: 'absolute',
          left: z.superior.x,
          top: z.superior.y,
          width: z.superior.w,
          fontFamily: FONTE.titulo,
          textTransform: 'uppercase',
          fontSize: 92 * k,
          lineHeight: 0.98,
          color: COR.texto,
          letterSpacing: '-0.01em',
          opacity: p,
          transform: `translateY(${(1 - p) * 40 * k}px)`,
          textShadow: '0 6px 30px rgba(0,0,0,0.6)',
        }}
      >
        {frase[0]}
        <br />
        <span style={{color: corDestaque}}>{frase[1]}</span>
      </div>
      {/* rótulo obrigatório de dado fictício */}
      <div style={{position: 'absolute', left: 0, width, top: 1650 * k, textAlign: 'center', fontFamily: FONTE.corpo, fontWeight: 600, fontSize: 24 * k, color: COR.texto2, letterSpacing: '0.04em'}}>
        {MARCA.rotuloDemo}
      </div>
    </AbsoluteFill>
  );
};
