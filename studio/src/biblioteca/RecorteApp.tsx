import React, {useCallback} from 'react';
import {cancelRender, Img} from 'remotion';

/**
 * Mostra uma região de uma captura do produto, em pixels reais.
 * Lições (seção 6.3 e erros 3 e 4 da seção 11):
 * - declare a dimensão REAL da imagem (confira com `ffprobe`); se não bater, o render PARA (senão o cartão estica);
 * - o recorte mostra o cartão inteiro ou sai num degradê (`degrade`), nunca num corte seco;
 * - não corte ícone nem tooltip pela metade: escolha a região pelo `marcas.json` da gravação.
 */
export const RecorteApp: React.FC<{
  src: string;
  larguraReal: number;
  alturaReal: number;
  /** região em pixels da captura */
  regiao: {x: number; y: number; w: number; h: number};
  /** largura em px na tela do vídeo; a altura sai da proporção da região */
  largura: number;
  raio?: number;
  degrade?: {topo?: boolean; base?: boolean; px?: number};
  style?: React.CSSProperties;
}> = ({src, larguraReal, alturaReal, regiao, largura, raio = 0, degrade, style}) => {
  const k = largura / regiao.w;
  const conferir = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.naturalWidth !== larguraReal || img.naturalHeight !== alturaReal) {
        cancelRender(
          new Error(
            `RecorteApp: ${src} tem ${img.naturalWidth}×${img.naturalHeight}, mas foi declarado ${larguraReal}×${alturaReal}. Meça com ffprobe.`,
          ),
        );
      }
    },
    [src, larguraReal, alturaReal],
  );
  const px = (degrade?.px ?? 60) / Math.max(1, regiao.h * k);
  const paradas = [
    degrade?.topo ? `transparent 0%, black ${px * 100}%` : 'black 0%',
    degrade?.base ? `black ${100 - px * 100}%, transparent 100%` : 'black 100%',
  ].join(', ');
  const mascara = degrade?.topo || degrade?.base ? `linear-gradient(to bottom, ${paradas})` : undefined;
  return (
    <div
      style={{
        width: largura,
        height: regiao.h * k,
        overflow: 'hidden',
        position: 'relative',
        borderRadius: raio,
        maskImage: mascara,
        WebkitMaskImage: mascara,
        ...style,
      }}
    >
      <Img
        src={src}
        onLoad={conferir}
        style={{
          position: 'absolute',
          left: -regiao.x * k,
          top: -regiao.y * k,
          width: larguraReal * k,
          height: alturaReal * k,
          maxWidth: 'none',
        }}
      />
    </div>
  );
};
