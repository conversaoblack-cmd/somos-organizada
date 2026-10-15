import React from 'react';
import {COR} from '../marca/tokens';

/**
 * Fundo garantido atrás do texto quando há tela ou imagem atrás.
 * Lição: texto sobre imagem do produto sem fundo vira "R$ 33,36.47".
 */
export const FaixaTexto: React.FC<{
  children: React.ReactNode;
  opacidade?: number;
  raio?: number;
  padding?: string | number;
  style?: React.CSSProperties;
}> = ({children, opacidade = 0.86, raio = 22, padding = '0.32em 0.5em', style}) => (
  <div
    style={{
      display: 'inline-block',
      backgroundColor: `rgba(7, 10, 18, ${opacidade})`,
      border: `1px solid ${COR.superficie3}`,
      borderRadius: raio,
      padding,
      boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
      ...style,
    }}
  >
    {children}
  </div>
);
