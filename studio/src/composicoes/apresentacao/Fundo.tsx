import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {COR} from '../../marca/tokens';
import {ENTRADA} from '../../lib/movimento';
import {Palco, type CelularNaArquibancada} from './Palco';
import {cameraNoFrame} from './camera';
import {linhaDoTempoPlaca} from './mosaico';
import {CENAS} from './roteiro';
import {FLUXOS, fluida, type Fluxo} from './fluxos';

/**
 * A arquibancada da peça inteira (uma só, frame global), com o celular DENTRO dela nas cenas de produto (direção v2).
 * Desfoque mínimo (fileiras e curva sempre legíveis); a cor da luz do aparelho é a da cena.
 */
type Plano = {de: number; tela?: string; cor: string; gravacao?: {arquivo: string; recDe: number; vel: number}};

/** A tela do celular acompanha o recorte: mesma gravação (versão fluida), mesmo instante, mesma cor. */
const doFluxo = (f: Fluxo): Plano[] => f.trechos.map((t) => ({de: t.de, cor: t.cor, gravacao: {arquivo: fluida(t.arquivo), recDe: t.recDe, vel: t.vel ?? 1}}));
const CELULAR: Partial<Record<keyof typeof CENAS, Plano[]>> = {
  // só a frente da carteirinha: a tela "em dia" traz o cartão com o preço do plano do sócio (sem preço na peça)
  socio: [{de: 0, tela: 'carteirinha-frente.png', cor: COR.azul}],
  // a portaria inteira na tela; a cor da luz troca no LIBERADO (branca) e no JÁ UTILIZADO (vermelha)
  ingresso: doFluxo(FLUXOS.portaria),
  dinheiro: [{de: 0, tela: 'recebimentos-2.png', cor: COR.amarelo}],
  taxa: [{de: 0, tela: 'novo-evento-valores.png', cor: COR.amarelo}],
  evento: doFluxo(FLUXOS.evento),
  prova: [{de: 0, tela: 'financeiro-planilha.png', cor: COR.azul}],
};

export function celularNoFrame(frame: number): CelularNaArquibancada | null {
  const cena = (Object.keys(CENAS) as (keyof typeof CENAS)[]).find((k) => frame >= CENAS[k].de && frame < CENAS[k].ate);
  const planos = cena ? CELULAR[cena] : undefined;
  if (!cena || !planos) return null;
  const local = frame - CENAS[cena].de;
  const dur = CENAS[cena].ate - CENAS[cena].de;
  const plano = [...planos].reverse().find((p) => local >= p.de)!;
  const entrada = interpolate(local, [0, 10], [0, 1], {extrapolateRight: 'clamp', easing: ENTRADA}) * interpolate(local, [dur - 8, dur], [1, 0], {extrapolateLeft: 'clamp'});
  const gravacao = plano.gravacao && {...plano.gravacao, inicio: CENAS[cena].de + plano.de};
  return {tela: plano.tela, gravacao, cor: plano.cor, x: 450 /* eixo da legenda e do feixe */, y: 1520, alturaPx: 470, profundidade: 7, giro: interpolate(local, [0, dur], [-0.18, 0.12]), entrada};
}

export const FundoArquibancada: React.FC = () => {
  const frame = useCurrentFrame();
  const celular = celularNoFrame(frame);
  const brilho = frame < CENAS.virada.de ? 0.55 : 1;
  return <Palco placas={linhaDoTempoPlaca} camera={cameraNoFrame(frame)} brilhoRefletores={brilho} desfoque={celular ? 2 : 0} escurecer={celular ? 0.12 : 0} celular={celular} />;
};
