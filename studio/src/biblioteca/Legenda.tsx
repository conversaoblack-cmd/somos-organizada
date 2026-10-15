import type {Caption} from '@remotion/captions';
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {escala, formatoPorTamanho} from '../formatos';
import {progresso} from '../lib/movimento';
import {COR, FONTE, SEMANTICA, type CorSemantica} from '../marca/tokens';
import {FaixaTexto} from './FaixaTexto';

/**
 * Legenda por palavra. Gerada por audio/narrar.mjs a partir do tempo REAL das palavras (nunca à mão).
 *
 * Lições embutidas (seção 6.3):
 * - o "pulo" da palavra dita é DESLOCAMENTO VERTICAL (−0,06 em), nunca escala (escala encavala as vizinhas);
 * - o bloco fica até min(início do próximo, max(fim da fala + 400 ms, início + palavras×300 + 500 ms));
 * - o bloco do gancho entra cheio no frame 0;
 * - com a peça acelerada (`<Sequence playbackRate>`), a régua de leitura é multiplicada pela `velocidade`.
 */
export type PalavraLegenda = Caption & {cor?: CorSemantica; quebraAntes?: boolean};
export type BlocoLegenda = {id: string; faixa: 'alta' | 'baixa'; gancho?: boolean; palavras: PalavraLegenda[]};

export const MS_POR_PALAVRA = 300;
export const MS_BASE = 500;
export const MS_APOS_FALA = 400;

/** Janela [início, fim) em ms de cada bloco, aplicando a régua de leitura. Exportada para os testes e a timeline. */
export function janelasDosBlocos(blocos: BlocoLegenda[], velocidade = 1) {
  return blocos.map((b, i) => {
    const inicio = b.gancho ? 0 : b.palavras[0].startMs;
    const fimFala = b.palavras[b.palavras.length - 1].endMs;
    const regua = inicio + (b.palavras.length * MS_POR_PALAVRA + MS_BASE) * velocidade;
    const proprio = Math.max(fimFala + MS_APOS_FALA * velocidade, regua);
    const proximo = blocos[i + 1];
    const fim = proximo ? Math.min(proximo.gancho ? 0 : proximo.palavras[0].startMs, proprio) : proprio;
    return {id: b.id, inicio, fim};
  });
}

export const Legenda: React.FC<{blocos: BlocoLegenda[]; velocidade?: number; tamanho?: number; opacidadeFaixa?: number}> = ({
  blocos,
  velocidade = 1,
  tamanho = 56,
  opacidadeFaixa = 0.94,
}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const k = escala(width);
  const ms = (frame / fps) * 1000;
  const janelas = janelasDosBlocos(blocos, velocidade);
  const i = janelas.findIndex((j) => ms >= j.inicio && ms < j.fim);
  if (i < 0) return null;
  const bloco = blocos[i];
  const zona = formatoPorTamanho(width, height).zona;
  // faixa baixa respeita o trilho de ícones (zona inferior, mais estreita)
  const area = bloco.faixa === 'alta' ? zona.superior : zona.inferior;
  const entrada = bloco.gancho ? 1 : progresso(frame, (janelas[i].inicio / 1000) * fps, (janelas[i].inicio / 1000) * fps + 4);

  return (
    <div
      style={{
        position: 'absolute',
        left: area.x,
        width: area.w,
        ...(bloco.faixa === 'alta' ? {top: area.y} : {bottom: height - (zona.inferior.y + zona.inferior.h)}),
        display: 'flex',
        justifyContent: 'center',
        opacity: entrada,
        transform: `translateY(${(1 - entrada) * 14 * k}px)`,
      }}
    >
      <FaixaTexto opacidade={opacidadeFaixa} style={{textAlign: 'center', maxWidth: area.w, backgroundColor: `rgba(15, 19, 27, ${opacidadeFaixa})`}}>
        <span style={{fontFamily: FONTE.corpo, fontWeight: 800, fontSize: tamanho * k, lineHeight: 1.18, color: COR.texto}}>
          {bloco.palavras.map((p, j) => {
            const dita = ms >= p.startMs && ms < Math.max(p.endMs, p.startMs + 120);
            return (
              <React.Fragment key={j}>
                {p.quebraAntes ? <br /> : j > 0 ? ' ' : null}
                <span
                  style={{
                    display: 'inline-block',
                    color: p.cor ? SEMANTICA[p.cor] : COR.texto,
                    transform: `translateY(${dita ? -0.06 : 0}em)`,
                  }}
                >
                  {p.text.trim()}
                </span>
              </React.Fragment>
            );
          })}
        </span>
      </FaixaTexto>
    </div>
  );
};
