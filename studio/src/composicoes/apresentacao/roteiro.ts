/**
 * Frames da peça (fonte: campanhas/2026-10-15-apresentacao/03-roteiro.md). 30 fps, 45 s.
 * Grade de compasso ancorada na virada (frame 252): tempo = 18 frames (100 BPM), compasso = 72.
 */
export const FPS = 30;
export const DURACAO = 1350;
export const TEMPO = 18;
export const COMPASSO = 72;
export const VIRADA = 252;

export const CENAS = {
  gancho: {de: 0, ate: 108},
  problema: {de: 108, ate: 252},
  virada: {de: 252, ate: 360},
  socio: {de: 360, ate: 504},
  ingresso: {de: 504, ate: 684},
  dinheiro: {de: 684, ate: 828},
  // ordem da roteirista (rodada 3): a diretoria cria o evento e decide o preço; o sistema soma 10% e isso vira caixa
  evento: {de: 828, ate: 936},
  taxa: {de: 936, ate: 1080},
  prova: {de: 1080, ate: 1188},
  cta: {de: 1188, ate: 1350},
} as const;
export type IdCena = keyof typeof CENAS;

/** Viradas de placa (transição de capítulo) e duração da onda. */
export const VIRADAS = [252, 360, 504, 684, 828, 1080, 1188];
export const DURACAO_VIRADA = 18;

/** Momentos do problema em que um grupo de placas acende em vermelho (grupo → caderno → print). */
export const GRUPOS_PROBLEMA = [130, 168, 206];
