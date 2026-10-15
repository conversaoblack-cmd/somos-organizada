#!/usr/bin/env node
/**
 * Monta a trilha com BATERIA GRAVADA de verdade (pedido do dono em 15/10/2026: a percussão sintetizada "pode não ficar tão
 * boa"). Junta a tensão sintetizada (trilha.wav, de partitura.json) com um trecho de gravação real de batucada,
 * acelerado sem mudar a afinação para casar com a grade da peça, e com a bateria "lá fora" (abafada) no breakdown.
 *
 * Uso: node audio/montar-batucada.mjs <peca>            (lê audio/<peca>/batucada.json; saída audio/<peca>/trilha-batucada.wav)
 *
 * audio/<peca>/batucada.json:
 * {
 *   "fonte": "audio/biblioteca/<arquivo>",            // licença lida e registrada em audio/LICENCAS.md
 *   "trecho": {"deS": 39.493, "ateS": 83.150},        // na gravação, de acento a acento (medidos, não no olho)
 *   "frameInicioArquivo": 108,                        // quadro da peça em que trilha.wav começa (inicioS do mix)
 *   "deFrame": 252, "ateFrame": 1332,                 // onde o trecho cai na peça (o acento de "deS" cai em deFrame)
 *   "ganhoDb": 0,
 *   "abafar": [{"deFrame": 828, "ateFrame": 1080, "lowpassHz": 450, "ganhoDb": -7, "entradaS": 0.4, "saidaS": 0.6}],
 *   "fimS": 0.06                                      // corte seco no ateFrame (o golpe final é SFX no mix)
 * }
 * A razão de velocidade sai de (ateS − deS) / (ateFrame − deFrame): o trecho entra e sai no acento. A bateria segue o
 * próprio balanço por dentro (variação humana de ±40 ms medida na gravação).
 */
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {ff, lerJson, RAIZ} from './lib/comum.mjs';

const peca = process.argv[2];
if (!peca) {
  console.error('Uso: node audio/montar-batucada.mjs <peca>');
  process.exit(1);
}
const pasta = join(RAIZ, 'audio', peca);
const cfg = lerJson(join(pasta, 'batucada.json'));
const fps = 30;
const fonte = join(RAIZ, cfg.fonte);
const tensao = join(pasta, 'trilha.wav');
if (!existsSync(fonte)) throw new Error(`fonte não encontrada: ${cfg.fonte}`);
if (!existsSync(tensao)) throw new Error('falta audio/<peca>/trilha.wav (rode gerar-trilha.mjs com a partitura antes)');

const durPeca = (cfg.ateFrame - cfg.deFrame) / fps;
const durGravacao = cfg.trecho.ateS - cfg.trecho.deS;
const razao = durGravacao / durPeca;
// tempo relativo ao início do arquivo (quadro frameInicioArquivo)
const s = (frame) => (frame - cfg.frameInicioArquivo) / fps;
const atraso = s(cfg.deFrame);

// mistura seco/abafado por expressão de tempo: m(t) = 1 dentro do breakdown, com rampas de entrada e saída
const termos = (cfg.abafar ?? []).map((a) => {
  const de = s(a.deFrame) - atraso;
  const ate = s(a.ateFrame) - atraso;
  return {expr: `clip((t-${de.toFixed(3)})/${a.entradaS ?? 0.4},0,1)*clip((${ate.toFixed(3)}-t)/${a.saidaS ?? 0.6},0,1)`, a};
});
const m = termos.length ? termos.map((t) => t.expr).join('+') : '0';
const abaf = cfg.abafar?.[0];
const ganhoAbafado = abaf ? Math.pow(10, (abaf.ganhoDb ?? -7) / 20) : 1;

const filtro = [
  `[0:a]atrim=start=${cfg.trecho.deS}:end=${cfg.trecho.ateS},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,` +
    `rubberband=tempo=${razao.toFixed(5)}:transients=crisp:detector=percussive,atrim=end=${durPeca.toFixed(3)},` +
    `volume=${cfg.ganhoDb ?? 0}dB,asplit=2[seco][p]`,
  `[p]lowpass=f=${abaf?.lowpassHz ?? 450}:p=2,lowpass=f=${abaf?.lowpassHz ?? 450}:p=2[abaf]`,
  `[seco]volume='1-(${m})':eval=frame[s1]`,
  `[abaf]volume='${ganhoAbafado.toFixed(4)}*(${m})':eval=frame[a1]`,
  `[s1][a1]amix=inputs=2:normalize=0,afade=t=out:st=${(durPeca - (cfg.fimS ?? 0.06)).toFixed(3)}:d=${cfg.fimS ?? 0.06},` +
    `adelay=${Math.round(atraso * 1000)}|${Math.round(atraso * 1000)}[bat]`,
  `[1:a]aresample=48000,aformat=channel_layouts=stereo[ten]`,
  `[ten][bat]amix=inputs=2:normalize=0:duration=longest[saida]`,
].join(';');

const saida = join(pasta, 'trilha-batucada.wav');
ff(['-v', 'error', '-y', '-i', fonte, '-i', tensao, '-filter_complex', filtro, '-map', '[saida]', '-c:a', 'pcm_s24le', saida]);
console.log(`Trilha com bateria gravada → audio/${peca}/trilha-batucada.wav (razão ${razao.toFixed(4)}×, ${cfg.deFrame}→${cfg.ateFrame})`);
