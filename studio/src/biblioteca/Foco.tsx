import React from 'react';

/**
 * Escurece tudo menos o alvo, com RECORTE ARREDONDADO do tamanho exato do elemento.
 * Lição: retângulo escuro por cima dos itens vira "sombra quadrada" e parece amador.
 * Técnica: box-shadow gigante + border-radius proporcional + borda suave.
 */
export const Foco: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  raio: number;
  /** 0..1: quanto escurece fora do alvo */
  intensidade: number;
  margem?: number;
}> = ({x, y, w, h, raio, intensidade, margem = 10}) => {
  if (intensidade <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - margem,
        top: y - margem,
        width: w + margem * 2,
        height: h + margem * 2,
        borderRadius: raio + margem,
        boxShadow: `0 0 0 3000px rgba(7, 10, 18, ${0.72 * intensidade}), 0 0 24px 6px rgba(7, 10, 18, ${0.5 * intensidade})`,
        border: `2px solid rgba(241, 244, 250, ${0.22 * intensidade})`,
        pointerEvents: 'none',
      }}
    />
  );
};
