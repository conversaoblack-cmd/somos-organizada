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
import {ProvaCard} from './ProvaCard';
import {FLUXOS, NA_CENA} from './fluxos';
import {PROVAS} from './provas';
import {CenaCta} from './CenaCta';
import {Assinatura, Clarao, FaixaLeitura, Placar, RotuloDemo} from './Sobreposicoes';
import {Audio} from '@remotion/media';
import {staticFile} from 'remotion';

const dur = (c: keyof typeof CENAS) => CENAS[c].ate - CENAS[c].de;
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
        <FraseImpacto entrada={6} saida={136} tamanho={84} linhas={['A torcida', 'cresceu,', 'o **caderno**{perigo} não.']} />
      </Sequence>
      <Sequence from={CENAS.virada.de} durationInFrames={CENAS.virada.ate - CENAS.virada.de} premountFor={fps} name="3 virada">
        <NomeDaMarca />
      </Sequence>
      {/* 4 · SÓCIO: a prova sobe da carteirinha */}
      <Sequence from={CENAS.socio.de} durationInFrames={dur('socio')} premountFor={fps} name="4 socio">
        <FaixaLeitura />
        <FraseImpacto entrada={4} saida={134} topo={TOPO_FRASE} tamanho={72} linhas={['Mensalidade que', 'se **cobra sozinha**{amarelo}']} />
        <ProvaCard prova={PROVAS.socio} cor={COR.azul} entrada={40} saida={134} />
        <RotuloDemo />
      </Sequence>
      {/* 5 · PORTARIA GRAVADA: a câmera do leitor vê o QR → LIBERADO; o mesmo QR de novo → JÁ UTILIZADO (612) */}
      <Sequence from={CENAS.ingresso.de} durationInFrames={dur('ingresso')} premountFor={fps} name="5 portaria">
        <FaixaLeitura />
        <ProvaCard fluxo={FLUXOS.portaria} entrada={0} saida={170} />
        <Clarao em={NA_CENA.liberado} />
        <FraseImpacto entrada={4} saida={NA_CENA.jaUtilizado - 6} topo={TOPO_FRASE} tamanho={80} linhas={['A portaria', '**lê o QR**{azul}']} />
        <Sequence from={NA_CENA.jaUtilizado} layout="none">
          <FraseImpacto entrada={6} saida={62} topo={TOPO_FRASE} tamanho={80} linhas={['QR repetido', '**barrado**{perigo}']} />
        </Sequence>
        <RotuloDemo />
      </Sequence>
      {/* 6 · DINHEIRO */}
      <Sequence from={CENAS.dinheiro.de} durationInFrames={dur('dinheiro')} premountFor={fps} name="6 dinheiro">
        <FaixaLeitura />
        <FraseImpacto entrada={18} saida={134} topo={TOPO_FRASE} tamanho={72} linhas={['Direto na', '**conta da torcida**{amarelo}']} />
        <ProvaCard prova={PROVAS.dinheiro} cor={COR.amarelo} entrada={24} saida={134} />
        <RotuloDemo />
      </Sequence>
      {/* 7a · TAXA (insight; bateria em breakdown) */}
      <Sequence from={CENAS.taxa.de} durationInFrames={dur('taxa')} premountFor={fps} name="7a taxa">
        <FaixaLeitura />
        <Placar de={18} ate={30} inicio={0} fim={10} sufixo="%" topo={338} tamanho={150} esquerda={120} />
        <FraseImpacto entrada={30} saida={134} topo={486} tamanho={72} linhas={['vira **caixa**{amarelo}']} />
        <ProvaCard fluxo={FLUXOS.taxa} entrada={20} saida={134} />
        <RotuloDemo />
      </Sequence>
      {/* 7b · EVENTO GRAVADO: menu → "Novo evento" preenchido → publicado (o ingresso só paga o evento) */}
      <Sequence from={CENAS.evento.de} durationInFrames={dur('evento')} premountFor={fps} name="7b evento">
        <FaixaLeitura />
        <FraseImpacto entrada={6} saida={98} topo={TOPO_FRASE} tamanho={72} linhas={['A diretoria', '**publica o evento**{azul}']} />
        <ProvaCard fluxo={FLUXOS.evento} entrada={0} saida={100} />
        <RotuloDemo />
      </Sequence>
      {/* 8 · PROVA: planilha */}
      <Sequence from={CENAS.prova.de} durationInFrames={dur('prova')} premountFor={fps} name="8 prova">
        <FaixaLeitura />
        <FraseImpacto entrada={6} saida={98} topo={TOPO_FRASE} tamanho={72} linhas={['Contas abertas', 'na **planilha**{azul}']} />
        <ProvaCard prova={PROVAS.planilha} cor={COR.azul} entrada={14} saida={98} />
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
