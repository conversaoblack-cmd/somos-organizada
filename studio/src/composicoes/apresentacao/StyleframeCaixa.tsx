import React, {useCallback} from 'react';
import {AbsoluteFill, interpolate, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {type EstadoPlaca} from '../../biblioteca/Arquibancada3D';
import {RecorteApp} from '../../biblioteca/RecorteApp';
import {escala, formatoPorTamanho} from '../../formatos';
import {FIRME, progresso} from '../../lib/movimento';
import {COR, FONTE, MARCA} from '../../marca/tokens';
import {Palco} from './Palco';

/**
 * Styleframe do INSIGHT da taxa: o card real "Taxa de serviço (caixa)" do painel na frente; atrás, o mosaico enchendo
 * de amarelo (o que entra para a torcida). Frase: "A taxa vira caixa da torcida."
 */
export const StyleframeCaixa: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const k = escala(width);
  const z = formatoPorTamanho(width, height).zona;
  const placas = useCallback((c: number, l: number): EstadoPlaca[] => {
    const r = random(`caixa-${c}-${l}`);
    // enche de baixo para cima, como um caixa subindo
    return r < 0.8 ? [{cor: r < 0.62 ? COR.amarelo : '#3A3420', de: l * 3 + r * 10 - 40}] : [];
  }, []);
  const t = FIRME(interpolate(frame, [0, 90], [0, 1], {extrapolateRight: 'clamp'}));
  const p = progresso(frame, 4, 12);
  const pc = progresso(frame, 10, 20);
  const largura = 820 * k;
  return (
    <AbsoluteFill style={{backgroundColor: COR.fundo}}>
      <Palco placas={placas} camera={{posicao: [0, 2 + t, 21 - t], alvo: [0, 9, -7], fov: 56}} brilhoRefletores={0.9} desfoque={6} escurecer={0.3} />
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
          opacity: p,
          transform: `translateY(${(1 - p) * 40 * k}px)`,
          textShadow: '0 6px 30px rgba(0,0,0,0.6)',
        }}
      >
        A taxa vira
        <br />
        <span style={{color: COR.amarelo}}>caixa da torcida.</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: (width - largura) / 2,
          top: 820 * k,
          opacity: pc,
          transform: `perspective(${2400 * k}px) rotateX(${6}deg) translateY(${(1 - pc) * 50 * k}px)`,
          borderRadius: (largura / 518) * 60,
          boxShadow: `0 0 0 ${3 * k}px ${COR.amarelo}, 0 ${30 * k}px ${80 * k}px rgba(0,0,0,0.7), 0 0 ${90 * k}px rgba(255,204,0,0.28)`,
        }}
      >
        <RecorteApp
          src={staticFile('apresentacao/telas/visao-geral-caixa.png')}
          larguraReal={1170}
          alturaReal={2532}
          regiao={{x: 49, y: 1157, w: 518, h: 416}}
          largura={largura}
          raio={(largura / 518) * 60}
        />
      </div>
      <div style={{position: 'absolute', left: 0, width, top: 1650 * k, textAlign: 'center', fontFamily: FONTE.corpo, fontWeight: 600, fontSize: 24 * k, color: COR.texto2, letterSpacing: '0.04em'}}>
        Painel da diretoria · {MARCA.rotuloDemo}
      </div>
    </AbsoluteFill>
  );
};
