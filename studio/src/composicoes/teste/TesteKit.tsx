import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {Audio} from '@remotion/media';
import React, {useRef} from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CardMarca} from '../../biblioteca/CardMarca';
import {Legenda, type BlocoLegenda} from '../../biblioteca/Legenda';
import {Mosaico, padraoDeArte} from '../../biblioteca/Mosaico';
import {AnelAlvo} from '../../biblioteca/Toque';
import {viradaDePlaca} from '../../biblioteca/transicoes';
import {escala} from '../../formatos';
import {useGsapTimeline} from '../../lib/gsap-ponte';
import {COR, FONTE} from '../../marca/tokens';

/**
 * Composição de TESTE do estúdio (não é peça): exercita mosaico, legenda, anel, ponte GSAP, virada de placa,
 * assinatura e áudio. Serve para provar render determinístico, QC e evidências (seção 9).
 */
const ARTE = ['YYAAAAYY', 'YAAWWAAY', 'AAWYYWAA', 'AAWYYWAA', 'YAAWWAAY', 'YYAAAAYY'];

const BLOCOS: BlocoLegenda[] = [
  {
    id: 'g',
    faixa: 'alta',
    gancho: true,
    palavras: [
      {text: 'Cada', startMs: 0, endMs: 250, timestampMs: 125, confidence: 1},
      {text: 'sócio', startMs: 250, endMs: 600, timestampMs: 425, confidence: 1},
      {text: 'em', startMs: 600, endMs: 750, timestampMs: 675, confidence: 1},
      {text: 'dia', startMs: 750, endMs: 1100, timestampMs: 925, confidence: 1, cor: 'amarelo'},
    ],
  },
  {
    id: 'b',
    faixa: 'baixa',
    palavras: [
      {text: 'acende', startMs: 1800, endMs: 2200, timestampMs: 2000, confidence: 1},
      {text: 'uma', startMs: 2200, endMs: 2350, timestampMs: 2275, confidence: 1},
      {text: 'placa', startMs: 2350, endMs: 2800, timestampMs: 2575, confidence: 1, cor: 'azul'},
    ],
  },
];

const CenaMosaico: React.FC = () => {
  const {width} = useVideoConfig();
  const k = escala(width);
  const frame = useCurrentFrame();
  const titulo = useRef<HTMLDivElement>(null);
  useGsapTimeline((tl) => {
    tl.fromTo(titulo.current, {y: 60, opacity: 0}, {y: 0, opacity: 1, duration: 0.35, ease: 'power3.out'}, 0.9);
  });
  return (
    <AbsoluteFill style={{backgroundColor: COR.fundo, alignItems: 'center', justifyContent: 'center'}}>
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(241,244,250,0.16), rgba(7,10,18,0) 70%)',
        }}
      />
      <Mosaico
        colunas={8}
        linhas={6}
        lado={86 * k}
        padrao={padraoDeArte(ARTE)}
        inicio={4}
        onda={30}
        completo={Math.min(1, 0.4 + frame / 90)}
        inclinacao={18}
        semente="teste"
      />
      <div
        ref={titulo}
        style={{
          position: 'absolute',
          top: 1300 * k,
          fontFamily: FONTE.titulo,
          fontSize: 72 * k,
          color: COR.amarelo,
          textTransform: 'uppercase',
        }}
      >
        Caixa na conta
      </div>
      <AnelAlvo x={540 * k} y={1500 * k} inicio={20} toque={70} />
    </AbsoluteFill>
  );
};

export const TesteKit: React.FC = () => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: COR.fundo}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={110} premountFor={fps}>
          <CenaMosaico />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={viradaDePlaca()} timing={linearTiming({durationInFrames: 14})} />
        <TransitionSeries.Sequence durationInFrames={84} premountFor={fps}>
          <CardMarca />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Legenda blocos={BLOCOS} />
      <Audio src={staticFile('teste/tom.m4a')} />
    </AbsoluteFill>
  );
};
