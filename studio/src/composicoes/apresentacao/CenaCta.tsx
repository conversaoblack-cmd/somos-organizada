import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {AnelAlvo} from '../../biblioteca/Toque';
import {escala, formatoPorTamanho} from '../../formatos';
import {ENTRADA} from '../../lib/movimento';
import {COR, FONTE, MARCA} from '../../marca/tokens';
import {FRAME_ULTIMA_PLACA} from './mosaico';
import {CENAS} from './roteiro';

/**
 * CTA (direção v2): um eixo só (tudo alinhado em x 120), um CTA só (o botão com o rótulo REAL do site; a voz convida
 * "Cadastre sua torcida"), "SOMOS ORGANIZADA" ≥ 96 px e linhas ≥ 44 px dentro da zona (abaixo de y 840, até x 780).
 * O toque no botão acende a última placa da grade (a torcida de quem assiste).
 */
export const CenaCta: React.FC = () => {
  const frame = useCurrentFrame(); // local (0 = 1188)
  const {width, height, fps} = useVideoConfig();
  const k = escala(width);
  const z = formatoPorTamanho(width, height).zona;
  const x = z.inferior.x;
  const deg = (de: number) => {
    const p = interpolate(frame, [de, de + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ENTRADA});
    return {opacity: p, transform: `translateY(${(1 - p) * 30 * k}px)`};
  };
  const toque = FRAME_ULTIMA_PLACA - CENAS.cta.de;
  const pressionado = interpolate(frame, [toque, toque + 3, toque + 10], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const botao = {top: 852 * k, w: 580 * k, h: 92 * k};
  const sombra = '0 6px 30px rgba(0,0,0,0.85)';
  return (
    <>
      <div style={{position: 'absolute', left: x, top: 628 * k, fontFamily: FONTE.titulo, fontSize: 96 * k, lineHeight: 0.98, textTransform: 'uppercase', color: COR.texto, textShadow: sombra, ...deg(4)}}>
        Somos
        <br />
        Organizada
      </div>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: botao.top,
          width: botao.w,
          height: botao.h,
          borderRadius: 24 * k,
          backgroundColor: COR.azul,
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONTE.corpo,
          fontWeight: 800,
          fontSize: 44 * k,
          boxShadow: `0 ${18 * k}px ${50 * k}px rgba(46,107,255,0.45)`,
          filter: pressionado ? `brightness(${1 + 0.25 * pressionado})` : undefined,
          ...deg(14),
        }}
      >
        {MARCA.botaoSite}
      </div>
      <div style={{position: 'absolute', left: x, top: 962 * k, fontFamily: FONTE.corpo, fontWeight: 800, fontSize: 44 * k, color: COR.texto, textShadow: sombra, ...deg(22)}}>
        {MARCA.site}
      </div>
      <div style={{position: 'absolute', left: x, width: z.inferior.w, top: 1026 * k, fontFamily: FONTE.corpo, fontWeight: 700, fontSize: 44 * k, lineHeight: 1.12, textShadow: sombra, ...deg(30)}}>
        {/* Quebra escolhida à mão: a automática deixava "site." sozinho na linha. */}
        <div style={{color: COR.amarelo}}>
          {MARCA.semPorcentagem.split(', ')[0]},<br />
          {MARCA.semPorcentagem.split(', ').slice(1).join(', ')}
        </div>
        <div style={{color: COR.texto, marginTop: 8 * k}}>
          Só paga depois
          <br />
          de publicar o site.
        </div>
      </div>
      <AnelAlvo x={x + botao.w / 2} y={botao.top + botao.h / 2} raio={68 * k} inicio={toque - Math.ceil(1.5 * fps) - 2} toque={toque} cor={COR.texto} />
    </>
  );
};
