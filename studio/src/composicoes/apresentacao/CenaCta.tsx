import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {AnelAlvo} from '../../biblioteca/Toque';
import {escala, formatoPorTamanho} from '../../formatos';
import {ENTRADA} from '../../lib/movimento';
import {COR, FONTE, MARCA} from '../../marca/tokens';
import {FRAME_ULTIMA_PLACA} from './mosaico';
import {CENAS} from './roteiro';

/**
 * CTA: a grade 2×2 já está no mosaico (em cima). Respeita a zona essencial: a chamada fica na parte larga (acima de
 * y 840); botão, endereço e linhas ficam na parte estreita (x 120–780, longe do trilho de ícones), alinhados à esquerda.
 * O botão tem o rótulo REAL do site. O toque no botão acende a última placa (a torcida de quem assiste).
 */
export const CenaCta: React.FC = () => {
  const frame = useCurrentFrame(); // local (0 = 1188)
  const {width, height, fps} = useVideoConfig();
  const k = escala(width);
  const z = formatoPorTamanho(width, height).zona;
  const deg = (de: number) => {
    const p = interpolate(frame, [de, de + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ENTRADA});
    return {opacity: p, transform: `translateY(${(1 - p) * 30 * k}px)`};
  };
  const toque = FRAME_ULTIMA_PLACA - CENAS.cta.de;
  const pressionado = interpolate(frame, [toque, toque + 3, toque + 10], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const x = z.inferior.x;
  const w = z.inferior.w;
  const botaoTop = 870 * k;
  const botaoH = 96 * k;
  return (
    <>
      <div style={{position: 'absolute', left: z.superior.x, width: z.superior.w, top: 660 * k, ...deg(4)}}>
        <div style={{fontFamily: FONTE.titulo, fontSize: 36 * k, textTransform: 'uppercase', color: COR.texto, letterSpacing: '0.04em', textShadow: '0 6px 30px rgba(0,0,0,0.8)'}}>
          {MARCA.nome}
        </div>
        <div style={{marginTop: 14 * k, fontFamily: FONTE.titulo, fontSize: 60 * k, lineHeight: 1, textTransform: 'uppercase', color: COR.texto, textShadow: '0 6px 30px rgba(0,0,0,0.8)'}}>
          <span style={{color: COR.azul}}>Cadastre</span> sua torcida
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: botaoTop,
          width: w,
          height: botaoH,
          borderRadius: 26 * k,
          backgroundColor: COR.azul,
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONTE.corpo,
          fontWeight: 800,
          fontSize: 46 * k,
          boxShadow: `0 ${18 * k}px ${50 * k}px rgba(46,107,255,0.4)`,
          filter: pressionado ? `brightness(${1 + 0.25 * pressionado})` : undefined,
          ...deg(14),
        }}
      >
        {MARCA.botaoSite}
      </div>
      <div style={{position: 'absolute', left: x, width: w, top: 990 * k, fontFamily: FONTE.corpo, fontWeight: 800, fontSize: 46 * k, color: COR.amarelo, textAlign: 'center', ...deg(22)}}>
        {MARCA.site}
      </div>
      <div style={{position: 'absolute', left: x, width: w, top: 1062 * k, fontFamily: FONTE.corpo, fontWeight: 600, fontSize: 34 * k, lineHeight: 1.22, color: COR.texto, textAlign: 'center', textShadow: '0 4px 20px rgba(0,0,0,0.9)', ...deg(30)}}>
        {MARCA.semPorcentagem} {MARCA.linhaLegal}
      </div>
      <AnelAlvo x={x + w / 2} y={botaoTop + botaoH / 2} raio={70 * k} inicio={toque - Math.ceil(1.5 * fps) - 2} toque={toque} cor={COR.texto} />
    </>
  );
};
