import {Easing, interpolate} from 'remotion';

/** Regra de movimento da marca: entrada rápida, assentamento curto. Nada de "flutuar". */
export const ENTRADA = Easing.bezier(0.16, 1, 0.3, 1);
export const SAIDA = Easing.bezier(0.7, 0, 0.84, 0);
export const FIRME = Easing.bezier(0.65, 0, 0.35, 1);

/** 0..1 entre dois frames, com clamp e easing de entrada. */
export function progresso(frame: number, de: number, ate: number, easing = ENTRADA) {
  return interpolate(frame, [de, ate], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});
}

/** Push-in lento para nada ficar parado 1 s ou mais sem motivo (seção 6.7). */
export function pushIn(frame: number, duracao: number, de = 1, ate = 1.04) {
  return interpolate(frame, [0, Math.max(1, duracao)], [de, ate], {extrapolateRight: 'clamp'});
}
