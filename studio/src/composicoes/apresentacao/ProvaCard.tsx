import React from 'react';
import {Video} from '@remotion/media';
import {interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Foco} from '../../biblioteca/Foco';
import {hexComAlfa} from '../../biblioteca/Mosaico';
import {RecorteApp} from '../../biblioteca/RecorteApp';
import {escala} from '../../formatos';
import {ENTRADA, FIRME} from '../../lib/movimento';
import {trechoNoQuadro, type Fluxo, type Regiao} from './fluxos';
import type {Prova} from './provas';

/** Andares da direção v2 (px a 1080). */
export const ANDAR = {
  baixo: {x: 120, y: 548, w: 660, h: 532},
  alto: {x: 120, y: 566, w: 840, h: 274},
};
/** Topo do celular na arquibancada (px): de onde sai o feixe. */
export const TOPO_CELULAR = 1278;
/** Eixo do celular (px): o feixe sobe por ele. */
export const EIXO_CELULAR = 450;

/**
 * Recorte de uma GRAVAÇÃO do produto: só a região pedida, ampliada, no tempo certo (trimBefore em quadros da gravação,
 * velocidade do trecho). O vídeo é posicionado inteiro (1170×2532 × s) e o cartão corta o resto.
 */
const RecorteGravacao: React.FC<{arquivo: string; recDe: number; vel: number; regiao: Regiao; s: number}> = ({arquivo, recDe, vel, regiao, s}) => {
  const {fps} = useVideoConfig();
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <Video
        src={staticFile(`apresentacao/fluxos/${arquivo}`)}
        trimBefore={Math.round(recDe * fps)}
        playbackRate={vel}
        muted
        style={{position: 'absolute', left: -regiao.x * s, top: -regiao.y * s, width: 1170 * s, height: 2532 * s, maxWidth: 'none'}}
      />
    </div>
  );
};

/**
 * A prova sobe da tela do celular: o recorte EXATO da captura real (ou de um fluxo GRAVADO), num andar fixo, com
 * recorte de luz na cor da cena e um feixe vertical ligando ao aparelho. Sem `scale` animado (só translate, rotate e
 * opacity). Num fluxo, os trechos têm a mesma proporção: o cartão não muda de tamanho no corte.
 */
export const ProvaCard: React.FC<{prova?: Prova; fluxo?: Fluxo; cor?: string; entrada?: number; saida?: number}> = ({prova, fluxo, cor: corFixa, entrada = 6, saida}) => {
  const frame = useCurrentFrame();
  const {width} = useVideoConfig();
  const k = escala(width);
  const trecho = fluxo ? trechoNoQuadro(fluxo, frame) : null;
  const base = prova ? prova.regiao : fluxo!.trechos[0].regiao;
  const andar = ANDAR[prova ? prova.andar : fluxo!.andar];
  const cor = trecho ? trecho.cor : corFixa ?? '#F1F4FA';
  const anel = trecho ? trecho.anel : prova?.anel;
  const s = Math.min((andar.w * k) / base.w, (andar.h * k) / base.h, (prova?.escalaMax ?? Infinity) * k);
  const w = base.w * s;
  const h = base.h * s;
  const left = andar.x * k + (andar.w * k - w) / 2;
  const top = andar.y * k;
  const p = interpolate(frame, [entrada, entrada + 9], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ENTRADA});
  const sai = saida === undefined ? 0 : interpolate(frame, [saida, saida + 9], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: FIRME});
  if (p <= 0 || sai >= 1) return null;
  const raio = 18 * k;
  const d = trecho ? trecho.destaque : prova?.destaque;
  const focoP = d ? interpolate(frame, [d.de, d.de + 6, d.ate - 6, d.ate], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const feixeTopo = top + h;
  return (
    <>
      {/* feixe: do topo do celular até a base da prova */}
      <div
        style={{
          position: 'absolute',
          left: (EIXO_CELULAR - 40) * k,
          top: feixeTopo,
          width: 80 * k,
          height: Math.max(0, TOPO_CELULAR * k - feixeTopo),
          opacity: 0.55 * p * (1 - sai),
          filter: `blur(${12 * k}px)`,
          mixBlendMode: 'screen',
          backgroundColor: 'rgba(0,0,0,0)',
          backgroundImage: `linear-gradient(to bottom, ${hexComAlfa(cor, 0.0)} 0%, ${hexComAlfa(cor, 0.35)} 45%, ${hexComAlfa(cor, 0.6)} 100%), radial-gradient(ellipse 50% 100% at 50% 100%, ${hexComAlfa(cor, 0.5)}, ${hexComAlfa(cor, 0)})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: w,
          height: h,
          opacity: p * (1 - sai),
          transform: `translateY(${(1 - p) * 70 * k}px) perspective(${1800 * k}px) rotateX(${sai * 80}deg)`,
          transformOrigin: '50% 0%',
          borderRadius: raio,
          boxShadow: `0 0 0 ${(anel ?? 3) * k}px ${cor}, 0 0 ${(anel ? 56 : 46) * k}px ${hexComAlfa(cor, anel ? 0.75 : 0.45)}, 0 ${24 * k}px ${60 * k}px rgba(0,0,0,0.7)`,
        }}
      >
        {prova ? (
          <RecorteApp
            src={staticFile(`apresentacao/telas/${prova.tela}`)}
            larguraReal={1170}
            alturaReal={2532}
            regiao={prova.regiao}
            largura={w}
            raio={raio}
            degrade={{base: prova.degradeBase, direita: prova.degradeDireita, px: 70 * k}}
          />
        ) : (
          <div style={{position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: raio, backgroundColor: '#0B0714'}}>
            {fluxo!.trechos.map((t) => (
              <Sequence key={t.de} from={t.de} durationInFrames={t.ate - t.de} layout="none">
                <RecorteGravacao arquivo={t.arquivo} recDe={t.recDe} vel={t.vel ?? 1} regiao={t.regiao} s={s * (base.w / t.regiao.w)} />
              </Sequence>
            ))}
          </div>
        )}
        {d && (
          // o escurecimento do foco fica DENTRO do cartão (sem vazar sobre a frase e o placar)
          <div style={{position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: raio}}>
            <Foco x={0} y={d.y * s} w={w} h={d.h * s} raio={16 * k} intensidade={focoP * (d.forca ?? 1)} margem={6 * k} contorno={d.contorno ? {cor: d.contorno, opacidade: focoP} : undefined} />
          </div>
        )}
      </div>
    </>
  );
};
