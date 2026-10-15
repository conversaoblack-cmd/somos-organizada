import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {GradeLogo} from '../../biblioteca/Logo';
import {escala, formatoPorTamanho} from '../../formatos';
import {ENTRADA} from '../../lib/movimento';
import {COR, FONTE, MARCA} from '../../marca/tokens';

/** Assinatura discreta (grade 2×2 + nome) no topo da zona, para quem sai no meio levar o nome. */
export const Assinatura: React.FC<{de: number; ate: number}> = ({de, ate}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const k = escala(width);
  const z = formatoPorTamanho(width, height).zona.superior;
  const o = interpolate(frame, [de, de + 8, ate - 8, ate], [0, 0.85, 0.85, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (o <= 0) return null;
  return (
    <div style={{position: 'absolute', left: z.x, top: z.y, display: 'flex', alignItems: 'center', gap: 12 * k, opacity: o}}>
      <GradeLogo tamanho={34 * k} />
      <span style={{fontFamily: FONTE.titulo, fontSize: 26 * k, textTransform: 'uppercase', color: COR.texto2, letterSpacing: '0.02em'}}>{MARCA.nome}</span>
    </div>
  );
};

/** Rótulo obrigatório de dado fictício: logo abaixo da assinatura, no topo da zona (nunca briga com a legenda). */
export const RotuloDemo: React.FC = () => {
  const {width, height} = useVideoConfig();
  const k = escala(width);
  const z = formatoPorTamanho(width, height).zona.superior;
  return (
    <div style={{position: 'absolute', left: z.x, top: z.y + 44 * k, fontFamily: FONTE.corpo, fontWeight: 600, fontSize: 22 * k, color: COR.texto3, letterSpacing: '0.03em'}}>
      {MARCA.rotuloDemo}
    </div>
  );
};

/** Faixa de leitura: degradê escuro atrás da assinatura e da frase de impacto quando há celular na cena. */
export const FaixaLeitura: React.FC<{altura?: number}> = ({altura = 760}) => {
  const {width} = useVideoConfig();
  const k = escala(width);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height: altura * k,
        backgroundColor: 'rgba(7,10,18,0)',
        backgroundImage: 'linear-gradient(to bottom, rgba(7,10,18,0.92) 0%, rgba(7,10,18,0.85) 55%, rgba(7,10,18,0) 100%)',
      }}
    />
  );
};

/** Placar que conta (grafismo de transmissão esportiva): número grande em Archivo Black. */
export const Placar: React.FC<{de: number; ate: number; inicio: number; fim: number; sufixo?: string; topo: number; cor?: string; tamanho?: number}> = ({
  de,
  ate,
  inicio,
  fim,
  sufixo = '',
  topo,
  cor = COR.amarelo,
  tamanho = 260,
}) => {
  const frame = useCurrentFrame();
  const {width} = useVideoConfig();
  const k = escala(width);
  const p = interpolate(frame, [de, ate], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ENTRADA});
  const valor = Math.round(inicio + (fim - inicio) * p);
  const o = interpolate(frame, [de, de + 4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 0, width, top: topo * k, textAlign: 'center', fontFamily: FONTE.titulo, fontSize: tamanho * k, lineHeight: 1, color: cor, opacity: o, textShadow: '0 10px 50px rgba(0,0,0,0.7)', fontVariantNumeric: 'tabular-nums'}}>
      {valor}
      {sufixo}
    </div>
  );
};

/** Clarão branco curto (sem estrobo): um só, ≤ 0,15 de opacidade. */
export const Clarao: React.FC<{em: number}> = ({em}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [em, em + 2, em + 8], [0, 0.15, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (o <= 0) return null;
  return <div style={{position: 'absolute', inset: 0, backgroundColor: `rgba(241,244,250,${o})`}} />;
};
