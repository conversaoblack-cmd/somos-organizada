import React from 'react';
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {FraseImpacto} from '../../biblioteca/FraseImpacto';
import {Legenda, type BlocoLegenda} from '../../biblioteca/Legenda';
import {escala} from '../../formatos';
import {COR, FONTE} from '../../marca/tokens';
import {carregarFontes} from '../../marca/fontes';
import {FundoArquibancada} from './Fundo';
import legendaJson from './legenda.json';
import {CENAS} from './roteiro';
import {useCurrentFrame, interpolate} from 'remotion';
import {ENTRADA} from '../../lib/movimento';
import {CenaCelular, type ChaveCelular} from './CenaCelular';
import {CenaCta} from './CenaCta';
import {Assinatura, Clarao, FaixaLeitura, Placar, RotuloDemo} from './Sobreposicoes';
import {Audio} from '@remotion/media';
import {staticFile} from 'remotion';

const dur = (c: keyof typeof CENAS) => CENAS[c].ate - CENAS[c].de;
/**
 * Grade das cenas com celular (px a 1080): assinatura 270 · rótulo 314 · frase 360–560 · celular centrado em ~1000 ·
 * legenda na faixa baixa. 1 unidade 3D = 298,6 px (câmera da Frente: fov 30, distância 12).
 * Push-in: para levar à altura Y px o ponto da tela que fica na fração f (de cima) da captura, com escala e:
 *   pos.y = (960 − Y)/298,6 − (0,5 − f) · 4,025 · e  →  `alvo(f, e, Y)`.
 */
const alvo = (f: number, e: number, y = 980) => (960 - y) / 298.6 - (0.5 - f) * 4.025 * e;
const BASE: ChaveCelular = {f: 0, pos: [0, -0.13, 0], rot: [-0.05, -0.2, 0.03], esc: 0.62};
const deriva = (ate: number, extra: Partial<ChaveCelular> = {}): ChaveCelular[] => [
  BASE,
  {...BASE, f: ate, rot: [-0.04, 0.12, 0.02], ...extra},
];
const TOPO_FRASE = 360;

carregarFontes();
const LEGENDA = legendaJson as unknown as BlocoLegenda[];

/** Cena 3 (virada): o nome da marca entra embaixo da grade 2×2 que nasceu no mosaico. */
const NomeDaMarca: React.FC = () => {
  const frame = useCurrentFrame();
  const {width} = useVideoConfig();
  const k = escala(width);
  const p = interpolate(frame, [18, 26], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ENTRADA});
  const s = interpolate(frame, [100, 108], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        width,
        top: 300 * k,
        textAlign: 'center',
        fontFamily: FONTE.titulo,
        textTransform: 'uppercase',
        fontSize: 96 * k,
        lineHeight: 1,
        color: COR.texto,
        letterSpacing: '0.01em',
        opacity: p * (1 - s),
        transform: `translateY(${(1 - p) * 36 * k}px)`,
        textShadow: '0 8px 36px rgba(0,0,0,0.75)',
      }}
    >
      Somos
      <br />
      Organizada
    </div>
  );
};

/** Áudio: `previa` = só trilha e SFX (portão visual); `final` = mix com a voz (guia até chegar o take da ElevenLabs). */
export const Apresentacao: React.FC<{audio?: 'previa' | 'final' | 'nenhum'}> = ({audio = 'previa'}) => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: COR.fundo}}>
      <FundoArquibancada />
      <Sequence from={CENAS.gancho.de} durationInFrames={CENAS.gancho.ate - CENAS.gancho.de} premountFor={fps} name="1 gancho">
        <FraseImpacto entrada={null} saida={100} tamanho={96} linhas={['Quanto da', 'mensalidade', '**não entrou**{perigo}', 'este mês?']} />
      </Sequence>
      <Sequence from={CENAS.problema.de} durationInFrames={CENAS.problema.ate - CENAS.problema.de} premountFor={fps} name="2 problema">
        <FraseImpacto entrada={6} saida={136} linhas={['Torcida cresceu,', 'controle **não**{perigo}.']} />
      </Sequence>
      <Sequence from={CENAS.virada.de} durationInFrames={CENAS.virada.ate - CENAS.virada.de} premountFor={fps} name="3 virada">
        <NomeDaMarca />
      </Sequence>
      {/* 4 · SÓCIO */}
      <Sequence from={CENAS.socio.de} durationInFrames={dur('socio')} premountFor={fps} name="4 socio">
        <CenaCelular
          duracao={dur('socio')}
          telas={[[0, 'carteirinha-frente.png'], [54, 'carteirinha-em-dia.png']]}
          chaves={[BASE, {...BASE, f: 54, rot: [-0.04, -0.05, 0.02]}, {f: 108, pos: [0, alvo(0.63, 0.9), 0.4], rot: [-0.03, 0.02, 0], esc: 0.9}, {f: 144, pos: [0, alvo(0.63, 0.92), 0.45], rot: [-0.03, 0.06, 0], esc: 0.92}]}
        />
        <FaixaLeitura />
        <FraseImpacto entrada={4} saida={134} topo={TOPO_FRASE} tamanho={72} linhas={['Mensalidade que', 'se **cobra sozinha**{amarelo}']} />
        <RotuloDemo />
      </Sequence>
      {/* 5 · INGRESSO + PORTARIA */}
      <Sequence from={CENAS.ingresso.de} durationInFrames={dur('ingresso')} premountFor={fps} name="5 ingresso e portaria">
        <CenaCelular
          duracao={dur('ingresso')}
          telas={[[0, 'ingresso-qr.png'], [54, 'portaria-liberado-rafael.png'], [108, 'portaria-ja-utilizado-rafael.png']]}
          chaves={deriva(dur('ingresso'))}
        />
        <Clarao em={54} />
        <FaixaLeitura />
        <FraseImpacto entrada={114} saida={170} topo={TOPO_FRASE} tamanho={84} linhas={['QR repetido', '**barrado**{perigo}']} />
        <RotuloDemo />
      </Sequence>
      {/* 6 · DINHEIRO */}
      <Sequence from={CENAS.dinheiro.de} durationInFrames={dur('dinheiro')} premountFor={fps} name="6 dinheiro">
        <CenaCelular duracao={dur('dinheiro')} telas={[[0, 'recebimentos-2.png']]} chaves={[BASE, {f: 72, pos: [0, alvo(0.33, 0.85), 0.4], rot: [-0.03, -0.04, 0], esc: 0.85}, {f: 144, pos: [0, alvo(0.33, 0.87), 0.45], rot: [-0.03, 0.04, 0], esc: 0.87}]} />
        <FaixaLeitura />
        <FraseImpacto entrada={18} saida={134} topo={TOPO_FRASE} tamanho={72} linhas={['Direto na', '**conta da torcida**{amarelo}']} />
        <RotuloDemo />
      </Sequence>
      {/* 7a · TAXA (insight; bateria em breakdown) */}
      <Sequence from={CENAS.taxa.de} durationInFrames={dur('taxa')} premountFor={fps} name="7a taxa">
        <CenaCelular duracao={dur('taxa')} telas={[[0, 'compra-1.png']]} chaves={[BASE, {f: 24, pos: [0, alvo(0.92, 0.85, 1040), 0.4], rot: [-0.02, 0, 0], esc: 0.85}, {f: 144, pos: [0, alvo(0.92, 0.87, 1040), 0.45], rot: [-0.02, 0.03, 0], esc: 0.87}]} saida={134} />
        <FaixaLeitura altura={820} />
        <Placar de={18} ate={30} inicio={0} fim={10} sufixo="%" topo={350} tamanho={230} />
        <FraseImpacto entrada={34} saida={134} topo={590} alinhamento="center" tamanho={80} linhas={['vira **caixa**{amarelo}']} />
        <RotuloDemo />
      </Sequence>
      {/* 7b · EVENTO: o ingresso só paga o evento */}
      <Sequence from={CENAS.evento.de} durationInFrames={dur('evento')} premountFor={fps} name="7b evento">
        <CenaCelular duracao={dur('evento')} telas={[[0, 'evento.png']]} chaves={[BASE, {f: 30, pos: [0, alvo(0.6, 0.85), 0.4], rot: [-0.03, -0.04, 0], esc: 0.85}, {f: 108, pos: [0, alvo(0.6, 0.87), 0.45], rot: [-0.03, 0.04, 0], esc: 0.87}]} />
        <FaixaLeitura />
        <FraseImpacto entrada={6} saida={98} topo={TOPO_FRASE} tamanho={72} linhas={['A diretoria', '**decide o preço**{azul}']} />
        <RotuloDemo />
      </Sequence>
      {/* 8 · PROVA: planilha */}
      <Sequence from={CENAS.prova.de} durationInFrames={dur('prova')} premountFor={fps} name="8 prova">
        <CenaCelular duracao={dur('prova')} telas={[[0, 'financeiro-planilha.png']]} chaves={[BASE, {f: 40, pos: [0, alvo(0.43, 0.9), 0.4], rot: [-0.02, 0, 0], esc: 0.9}, {f: 108, pos: [0, alvo(0.43, 0.92), 0.45], rot: [-0.02, 0.02, 0], esc: 0.92}]} />
        <FaixaLeitura />
        <FraseImpacto entrada={6} saida={98} topo={TOPO_FRASE} tamanho={72} linhas={['Contas abertas', 'na **planilha**{azul}']} />
        <RotuloDemo />
      </Sequence>
      {/* 9 · CTA */}
      <Sequence from={CENAS.cta.de} durationInFrames={dur('cta')} premountFor={fps} name="9 cta">
        <CenaCta />
      </Sequence>
      <Assinatura de={CENAS.socio.de} ate={CENAS.prova.ate} />
      <Legenda blocos={LEGENDA} />
      {audio !== 'nenhum' && <Audio src={staticFile(`audio/apresentacao/${audio === 'final' ? 'final' : 'previa-sem-voz'}.wav`)} />}
    </AbsoluteFill>
  );
};
