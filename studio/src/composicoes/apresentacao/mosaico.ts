import {random} from 'remotion';
import type {EstadoPlaca} from '../../biblioteca/Arquibancada3D';
import {COR} from '../../marca/tokens';
import {C, corDaGrade, L} from './Palco';
import {GRUPOS_PROBLEMA, VIRADA} from './roteiro';

/**
 * A linha do tempo de CADA placa da arquibancada na peça inteira (frame global). Um mosaico só, do começo ao fim:
 * no escuro com vermelhos (o que não entrou) → a grade da marca nasce na virada → cada pilar acende mais placas →
 * a taxa enche de amarelo → no CTA o mosaico completa a grade 2×2.
 */
const APAGADA_AZUL = '#1C2742';

// centros dos 3 grupos vermelhos do problema (coluna, fileira)
const CENTROS_PROBLEMA: [number, number][] = [
  [8, 9],
  [30, 14],
  [17, 22],
];

/** A placa que FALTA na grade da marca desde a virada: só acende no toque do CTA (é a torcida de quem assiste). */
export const PLACA_QUE_FALTA = (() => {
  // canto interno do quadrado branco (embaixo, à direita), bem visível
  for (let l = 0; l < L; l++) for (let c = C - 1; c >= 0; c--) if (corDaGrade(c, l) && corDaGrade(c, l) === '#F1F4FA') return {c: c - 3, l: l + 3};
  return {c: 0, l: 0};
})();
export const FRAME_ULTIMA_PLACA = 1262;

export function linhaDoTempoPlaca(c: number, l: number): EstadoPlaca[] {
  // a grade nasce COMPLETA na virada; a placa só se apaga no CTA e acende no toque (a torcida de quem assiste)
  if (c === PLACA_QUE_FALTA.c && l === PLACA_QUE_FALTA.l) {
    const v0 = l / (L - 1);
    return [
      {cor: '#F1F4FA', de: VIRADA + v0 * 14 + Math.abs(c / (C - 1) - 0.5) * 6 + 6},
      {cor: '#151B2B', de: 1192, virada: 6},
      {cor: '#F1F4FA', de: FRAME_ULTIMA_PLACA, virada: 12},
    ];
  }
  const r = random(`peca-${c}-${l}`);
  const r2 = random(`peca2-${c}-${l}`);
  const estados: EstadoPlaca[] = [];
  const grade = corDaGrade(c, l);
  const u = c / (C - 1);
  const v = l / (L - 1);

  // GANCHO (0–108): ~8% das placas em vermelho (o que não entrou)
  const vermelhaGancho = r < 0.08 && !grade;
  // acendem em degrau ao longo do gancho e FICAM acesas (sem cintilar: vermelho piscando no escuro lê como sinalizador)
  if (vermelhaGancho) estados.push({cor: COR.perigo, de: (r / 0.08) * 90 - 10, virada: 4});

  // PROBLEMA (108–252): 3 grupos acendem em vermelho, um por item falado
  CENTROS_PROBLEMA.forEach(([cc, ll], i) => {
    const d = Math.hypot(c - cc, (l - ll) * 1.4);
    if (d < 3.2 + r2 * 0.8) estados.push({cor: COR.perigo, de: GRUPOS_PROBLEMA[i] + d * 1.5, virada: 4});
  });

  // VIRADA (252): onda de baixo para cima apaga os vermelhos; a grade 2×2 acende
  const onda = VIRADA + v * 14 + Math.abs(u - 0.5) * 6;
  if (grade) estados.push({cor: grade, de: onda + 6});
  else if (estados.length) estados.push({cor: APAGADA_AZUL, de: onda});

  // SÓCIO (360–504): placas amarelas em onda, saindo da grade (sócio em dia acende placa)
  if (!grade && r < 0.3) {
    const dist = Math.hypot(u - 0.5, v - 0.55);
    estados.push({cor: r < 0.18 ? COR.amarelo : '#4A3F12', de: 366 + dist * 110 + r2 * 12});
  }

  // INGRESSO (504–684): acentos azuis (ação)
  if (!grade && r >= 0.3 && r < 0.42) estados.push({cor: COR.azul, de: 512 + r2 * 120});

  // QR BARRADO (612–684): perto da base, placas em vermelho (degrau, sem piscar); o resto rebaixa (≤ 30%);
  // em 690 tudo volta ao que era
  if (!grade) {
    const perto = v < 0.2 && Math.abs(u - 0.5) < 0.18;
    const antes = [...estados].reverse().find((e) => e.de < 612);
    if (perto && r2 < 0.45) estados.push({cor: COR.perigo, de: 612 + Math.abs(u - 0.5) * 20 + v * 10, virada: 4});
    else if (antes && antes.cor !== APAGADA_AZUL) estados.push({cor: '#1A1E2A', de: 612 + v * 8, virada: 6});
    if ((perto && r2 < 0.45) || antes) estados.push({cor: antes ? antes.cor : APAGADA_AZUL, de: 688 + v * 10, virada: 6});
  }

  // DINHEIRO (684–828): grupos laterais (as subsedes) acendem em amarelo
  const subsede = (u < 0.18 || u > 0.82) && v > 0.15 && v < 0.85;
  if (!grade && subsede && r2 < 0.55) estados.push({cor: COR.amarelo, de: 720 + Math.abs(v - 0.5) * 60 + r * 20});

  // TAXA / EVENTO (972–1080): o mosaico enche de amarelo de baixo para cima
  if (!grade && r < 0.85) estados.push({cor: r2 < 0.75 ? COR.amarelo : '#5A4B10', de: 978 + v * 70 + r * 8});

  // CTA (1188): luz cheia; a grade 2×2 em destaque e o resto num amarelo mais baixo
  if (!grade) estados.push({cor: r < 0.5 ? '#3B3313' : '#263252', de: 1190 + v * 12});

  return estados;
}
