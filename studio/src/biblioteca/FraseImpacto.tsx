import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {escala, formatoPorTamanho} from '../formatos';
import {ENTRADA, FIRME} from '../lib/movimento';
import {COR, FONTE, SEMANTICA, type CorSemantica} from '../marca/tokens';

/**
 * Frase de impacto (tipografia de CENA, não de interface): Archivo Black em caixa alta, palavra-chave na cor semântica.
 * Sintaxe das linhas: "TORCIDA CRESCEU," / "CONTROLE **NÃO**{perigo}." (mesma do narracao.json).
 * Entra com "batida" (sobe e assenta em `batida` frames) e sai virando como placa (rotateX) na virada seguinte.
 * Sem `scale` animado (regra do estúdio: só translate/rotate/opacity).
 */
type Pedaco = {t: string; cor?: CorSemantica};

function analisar(linha: string): Pedaco[] {
  const out: Pedaco[] = [];
  const re = /\*\*(.+?)\*\*\{(\w+)\}|[^*]+/g;
  for (const m of linha.matchAll(re)) out.push(m[1] ? {t: m[1], cor: m[2] as CorSemantica} : {t: m[0]});
  return out;
}

export const FraseImpacto: React.FC<{
  linhas: string[];
  /** frame (local) em que entra; null = já está cheia no frame 0 (gancho) */
  entrada?: number | null;
  /** frame (local) em que sai virando */
  saida?: number;
  tamanho?: number;
  /** topo do bloco (px a 1080); padrão: topo da zona essencial */
  topo?: number;
  alinhamento?: 'left' | 'center';
  batida?: number;
}> = ({linhas, entrada = 0, saida, tamanho = 92, topo, alinhamento = 'left', batida = 7}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const k = escala(width);
  const z = formatoPorTamanho(width, height).zona.superior;
  const p = entrada === null ? 1 : interpolate(frame, [entrada, entrada + batida], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ENTRADA});
  const s = saida === undefined ? 0 : interpolate(frame, [saida, saida + 9], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: FIRME});
  if (p <= 0 || s >= 1) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: z.x,
        width: z.w,
        top: (topo ?? z.y / k) * k,
        textAlign: alinhamento,
        fontFamily: FONTE.titulo,
        textTransform: 'uppercase',
        fontSize: tamanho * k,
        lineHeight: 0.98,
        letterSpacing: '-0.01em',
        color: COR.texto,
        opacity: p * (1 - s),
        transform: `translateY(${(1 - p) * 40 * k}px) perspective(${1600 * k}px) rotateX(${s * 90}deg)`,
        transformOrigin: '50% 0%',
        textShadow: '0 6px 30px rgba(0,0,0,0.65)',
      }}
    >
      {linhas.map((l, i) => (
        <div key={i}>
          {analisar(l).map((pd, j) => (
            <span key={j} style={pd.cor ? {color: SEMANTICA[pd.cor]} : undefined}>
              {pd.t}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};
