import React from 'react';
import {COR, FONTE, MARCA} from '../marca/tokens';

/** Grade 2×2 da marca. `tamanho` é o lado total da grade em px. Fundo permitido: escuro (#070A12). */
export const GradeLogo: React.FC<{tamanho: number; acesas?: number; style?: React.CSSProperties}> = ({
  tamanho,
  acesas = 4,
  style,
}) => {
  const vao = tamanho * (4 / 40); // proporção do icone.svg: quadrados 18, vão 4 numa grade de 40
  const lado = (tamanho - vao) / 2;
  return (
    <div style={{display: 'grid', gridTemplateColumns: `${lado}px ${lado}px`, gap: vao, ...style}}>
      {MARCA.grade.map((cor, i) => (
        <div
          key={i}
          style={{
            width: lado,
            height: lado,
            borderRadius: lado * (4 / 18),
            backgroundColor: i < acesas ? cor : COR.superficie3,
          }}
        />
      ))}
    </div>
  );
};

/** Logo completo: grade + nome. Área de respiro: um quadrado da grade em volta (a confirmar com o dono). */
export const Logo: React.FC<{altura: number; style?: React.CSSProperties}> = ({altura, style}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: altura * 0.35, padding: altura * 0.45, ...style}}>
    <GradeLogo tamanho={altura} />
    <span
      style={{
        fontFamily: FONTE.titulo,
        fontSize: altura * 0.56,
        lineHeight: 1,
        color: COR.texto,
        textTransform: 'uppercase',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {MARCA.nome}
    </span>
  </div>
);
