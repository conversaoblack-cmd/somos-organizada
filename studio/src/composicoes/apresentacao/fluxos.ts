import {COR} from '../../marca/tokens';

/**
 * Fluxos GRAVADOS do produto real (pedido do dono em 15/10/2026: "a portaria com o leitor de QR, o QR dando já
 * utilizado, o painel da diretoria, a pessoa acessando o menu e criando o evento").
 * Gravações: public/apresentacao/fluxos/ (captura/*.json + scripts/gravar-produto.mjs, build de produção apontado para
 * os emuladores). `<nome>.webm` é a fluida (1× ampliada: tela do celular); `<nome>-nitida.webm` é 3× a ~9 quadros/s
 * (recortes ampliados, texto nítido). Instantes medidos na gravação (cor da tela e quadros), nunca no olho.
 */
export type Regiao = {x: number; y: number; w: number; h: number};

/** Um trecho de gravação dentro de uma cena: de/ate em quadros da cena; recDe em segundos da gravação. */
export type Trecho = {
  de: number;
  ate: number;
  arquivo: string;
  recDe: number;
  vel?: number;
  regiao: Regiao;
  /** cor semântica do anel e da luz (azul = ação, amarelo = o que entra, vermelho = barrado) */
  cor: string;
  /** anel sólido em px (barrado) */
  anel?: number;
  /** linha a destacar (y relativo à região, px da captura); de/ate em quadros da cena */
  destaque?: {y: number; h: number; de: number; ate: number; forca?: number};
};

export type Fluxo = {andar: 'baixo' | 'alto'; trechos: Trecho[]};

const PORTARIA = 'portaria-camera.webm';
const PORTARIA_NITIDA = 'portaria-camera-nitida.webm';
const DIRETORIA_NITIDA = 'diretoria-evento-nitida.webm';
export const DIRETORIA = 'diretoria-evento.webm';

// portaria-camera: LIBERADO aparece aos 9,63 s e JÁ UTILIZADO aos 26,27 s (cor média da tela, gravação de 15/10)
const LIBERADO_S = 9.63;
const JA_UTILIZADO_S = 26.27;
/** quadro (da cena do ingresso) em que cada resultado aparece: casa com o SFX e com as placas vermelhas (612) */
export const NA_CENA = {liberado: 27, jaUtilizado: 108}; // o celular entra na câmera ~0,4 s antes de cada resultado

const CAMERA: Regiao = {x: 45, y: 1130, w: 1080, h: 871}; // o quadro da câmera, onde o celular do torcedor entra
const RESULTADO_LIBERADO: Regiao = {x: 0, y: 560, w: 1170, h: 943}; // ícone, LIBERADO e o cartão do Rafael
const RESULTADO_JA_UTILIZADO: Regiao = {x: 0, y: 520, w: 1170, h: 943}; // ícone, JÁ UTILIZADO, "Entrou às…" e o cartão

const fps = 30;
export const FLUXOS = {
  /** cena 5 (ingresso): a câmera da portaria vê o QR → LIBERADO; o mesmo QR de novo → JÁ UTILIZADO */
  portaria: {
    andar: 'baixo',
    trechos: [
      {de: 0, ate: NA_CENA.liberado, arquivo: PORTARIA, recDe: LIBERADO_S - NA_CENA.liberado / fps, regiao: CAMERA, cor: COR.azul},
      {de: NA_CENA.liberado, ate: 81, arquivo: PORTARIA_NITIDA, recDe: LIBERADO_S, regiao: RESULTADO_LIBERADO, cor: '#F1F4FA'},
      {de: 81, ate: NA_CENA.jaUtilizado, arquivo: PORTARIA, recDe: JA_UTILIZADO_S - (NA_CENA.jaUtilizado - 81) / fps, regiao: CAMERA, cor: COR.azul},
      {de: NA_CENA.jaUtilizado, ate: 180, arquivo: PORTARIA_NITIDA, recDe: JA_UTILIZADO_S, regiao: RESULTADO_JA_UTILIZADO, cor: COR.perigo, anel: 10},
    ],
  },
  /**
   * cena 7a (taxa): a diretoria digita o valor do público e o próprio sistema mostra "Torcedor paga R$ 143,00 (inclui
   * 10% de taxa)". No arquivo nítido o campo chega à tela aos 24,87 s, a digitação vai de 25,0 a 25,4 s e a tela rola
   * para "Publicado" aos 26,37 s: 0,34× para caber. Recorte justo no texto (a linha termina em x≈794): ~35 px.
   */
  taxa: {
    andar: 'alto',
    trechos: [
      {
        de: 0,
        ate: 144,
        arquivo: DIRETORIA_NITIDA,
        recDe: 24.9 - (20 / fps) * 0.34,
        vel: 0.34,
        regiao: {x: 40, y: 1102, w: 800, h: 290},
        cor: COR.amarelo,
        destaque: {y: 228, h: 48, de: 70, ate: 132, forca: 0.45},
      },
    ],
  },
  /** cena 7b (evento): menu aberto → "Novo evento" sendo preenchido → "Publicar evento" e o aviso de publicado */
  evento: {
    andar: 'baixo',
    trechos: [
      // menu aberto (≈5,6 s) até o toque em Eventos (≈7,5 s); nome digitado (15,5 s →); "Publicar evento" (≈27,7 s) e o aviso (≈28,2 s)
      {de: 0, ate: 36, arquivo: DIRETORIA_NITIDA, recDe: 5.9, vel: 1.4, regiao: {x: 0, y: 40, w: 940, h: 758}, cor: COR.azul},
      {de: 36, ate: 72, arquivo: DIRETORIA_NITIDA, recDe: 15.45, vel: 2.2, regiao: {x: 40, y: 120, w: 1100, h: 887}, cor: COR.azul},
      {de: 72, ate: 108, arquivo: DIRETORIA_NITIDA, recDe: 27.4, vel: 1.2, regiao: {x: 0, y: 1589, w: 1170, h: 943}, cor: COR.amarelo},
    ],
  },
} satisfies Record<string, Fluxo>;

/** O trecho no ar num quadro da cena (o último que começou). */
export function trechoNoQuadro(fluxo: Fluxo, quadro: number): Trecho {
  return [...fluxo.trechos].reverse().find((t) => quadro >= t.de) ?? fluxo.trechos[0];
}

/** Para a tela do celular na arquibancada: a gravação FLUIDA no mesmo instante do recorte. */
export function fluida(arquivo: string): string {
  return arquivo.replace('-nitida.webm', '.webm');
}
