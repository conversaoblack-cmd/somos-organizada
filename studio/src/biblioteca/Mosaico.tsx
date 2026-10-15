import React from 'react';
import {interpolate, random, useCurrentFrame} from 'remotion';
import {COR} from '../marca/tokens';
import {ENTRADA} from '../lib/movimento';

/**
 * Território visual da marca: "o mosaico da arquibancada". Os quadrados do logo viram as placas do mosaico
 * (o bandeirão de cartões que a torcida levanta). Cada placa vira (rotateX, como o cartão erguido) e acende.
 *
 * Determinístico: só depende do frame e da `semente`. Sem CSS animation, sem Math.random.
 */
export type PadraoMosaico = (coluna: number, linha: number) => string | null;

export type MosaicoProps = {
  colunas: number;
  linhas: number;
  /** lado de cada placa em px */
  lado: number;
  /** vão entre placas em px */
  vao?: number;
  /** cor de cada placa acesa (null = continua apagada) */
  padrao: PadraoMosaico;
  /** frame em que a primeira placa começa a virar */
  inicio?: number;
  /** quantos frames a onda leva para atravessar o mosaico */
  onda?: number;
  /** frames que cada placa leva para virar */
  virada?: number;
  /** de onde a onda parte, em fração (0..1) */
  origem?: [number, number];
  /** 0..1: fração das placas que podem acender (o "caixa" se completando). Padrão: todas */
  completo?: number;
  /** variação aleatória (frames) por placa, com semente: o mosaico humano nunca vira em sincronia perfeita */
  jitter?: number;
  semente?: string;
  /** inclinação da arquibancada (graus em rotateX do plano inteiro) */
  inclinacao?: number;
  style?: React.CSSProperties;
};

export const Mosaico: React.FC<MosaicoProps> = ({
  colunas,
  linhas,
  lado,
  vao = Math.round(lado * 0.14),
  padrao,
  inicio = 0,
  onda = 24,
  virada = 9,
  origem = [0.5, 1],
  completo = 1,
  jitter = 3,
  semente = 'mosaico',
  inclinacao = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const raio = lado * (4 / 18);
  const distMax = Math.hypot(Math.max(origem[0], 1 - origem[0]), Math.max(origem[1], 1 - origem[1]));

  const placas: React.ReactNode[] = [];
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < colunas; c++) {
      const cor = padrao(c, l);
      const u = colunas > 1 ? c / (colunas - 1) : 0.5;
      const v = linhas > 1 ? l / (linhas - 1) : 0.5;
      const dist = Math.hypot(u - origem[0], v - origem[1]) / distMax;
      const ordem = random(`${semente}-o-${c}-${l}`);
      const pode = cor !== null && ordem < completo;
      const atraso = inicio + dist * onda + random(`${semente}-j-${c}-${l}`) * jitter;
      const p = pode
        ? interpolate(frame, [atraso, atraso + virada], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: ENTRADA,
          })
        : 0;
      // vira de -180° (verso, apagado) para 0° (frente, acesa); na metade troca a face
      const angulo = interpolate(p, [0, 1], [-180, 0]);
      const frente = p >= 0.5;
      const brilho = frente ? interpolate(p, [0.5, 0.75, 1], [1.6, 1.25, 1], {extrapolateRight: 'clamp'}) : 1;
      placas.push(
        <div
          key={`${c}-${l}`}
          style={{
            width: lado,
            height: lado,
            borderRadius: raio,
            backgroundColor: frente && cor ? cor : COR.superficie2,
            border: frente ? 'none' : `1px solid ${COR.superficie3}`,
            transform: `perspective(${lado * 8}px) rotateX(${frente ? angulo : angulo + 180}deg)`,
            filter: brilho !== 1 ? `brightness(${brilho})` : undefined,
            boxShadow: frente && cor ? `0 0 ${lado * 0.5}px ${hexComAlfa(cor, 0.28)}` : undefined,
          }}
        />,
      );
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${colunas}, ${lado}px)`,
        gap: vao,
        transform: inclinacao ? `perspective(${lado * 40}px) rotateX(${inclinacao}deg)` : undefined,
        transformOrigin: '50% 100%',
        ...style,
      }}
    >
      {placas}
    </div>
  );
};

/** #RRGGBB + alfa → rgba(). Cor sólida com alfa, sem color-mix. */
export function hexComAlfa(hex: string, alfa: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

/** Padrão a partir de uma "arte" em texto: cada caractere é uma placa. A=azul, Y=amarelo, W=texto, R=perigo, .=apagada */
export function padraoDeArte(arte: string[]): PadraoMosaico {
  const mapa: Record<string, string> = {A: COR.azul, Y: COR.amarelo, W: COR.texto, R: COR.perigo};
  return (c, l) => mapa[arte[l]?.[c] ?? '.'] ?? null;
}
