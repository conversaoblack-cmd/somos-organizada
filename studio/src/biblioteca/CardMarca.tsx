import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {formatoPorTamanho, escala} from '../formatos';
import {progresso} from '../lib/movimento';
import {COR, FONTE, MARCA} from '../marca/tokens';
import {GradeLogo} from './Logo';

/**
 * Assinatura do fim de vídeo (seção 2.1): grade 2×2 + "Somos Organizada" + "Cadastre sua torcida" +
 * somosorganizada.com.br + linha legal. SEM PREÇO (decisão do dono, 15/10/2026).
 */
export const CardMarca: React.FC<{entrada?: number}> = ({entrada = 0}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const k = escala(width);
  const z = formatoPorTamanho(width, height).zona;
  const areaX = z.inferior.x;
  const areaW = Math.min(z.superior.w, z.inferior.w + (z.inferior.x - z.superior.x)); // largura que vale para os dois trechos
  const p = (de: number) => progresso(frame, entrada + de, entrada + de + 10);
  const sobe = (de: number) => ({opacity: p(de), transform: `translateY(${(1 - p(de)) * 24 * k}px)`});

  return (
    <AbsoluteFill style={{backgroundColor: COR.fundo}}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(ellipse 80% 45% at 50% 0%, rgba(46,107,255,0.22), rgba(7,10,18,0) 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: areaX,
          top: z.superior.y,
          width: areaW,
          height: z.inferior.y + z.inferior.h - z.superior.y,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 34 * k,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 28 * k, ...sobe(0)}}>
          <GradeLogo tamanho={128 * k} acesas={Math.round(progresso(frame, entrada, entrada + 12) * 4)} />
          <div
            style={{
              fontFamily: FONTE.titulo,
              fontSize: 64 * k,
              lineHeight: 0.95,
              textTransform: 'uppercase',
              color: COR.texto,
            }}
          >
            Somos
            <br />
            Organizada
          </div>
        </div>
        <div
          style={{
            ...sobe(8),
            alignSelf: 'flex-start',
            backgroundColor: COR.azul,
            color: '#FFFFFF',
            fontFamily: FONTE.corpo,
            fontWeight: 800,
            fontSize: 54 * k,
            padding: `${22 * k}px ${34 * k}px`,
            borderRadius: 26 * k,
            boxShadow: `0 ${18 * k}px ${50 * k}px rgba(46,107,255,0.35)`,
          }}
        >
          {MARCA.cta}
        </div>
        <div style={{...sobe(14), fontFamily: FONTE.corpo, fontWeight: 700, fontSize: 48 * k, color: COR.amarelo}}>
          {MARCA.site}
        </div>
        <div
          style={{
            ...sobe(18),
            fontFamily: FONTE.corpo,
            fontWeight: 500,
            fontSize: 44 * k,
            lineHeight: 1.22,
            color: COR.texto2,
            maxWidth: areaW,
          }}
        >
          {MARCA.linhaLegal}
        </div>
      </div>
    </AbsoluteFill>
  );
};
