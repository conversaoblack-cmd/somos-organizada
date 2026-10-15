#!/usr/bin/env node
/**
 * Posiciona cada fala no seu frame, mede, avisa sobreposição e gera a legenda pelo tempo REAL das palavras (seção 6.5).
 * Uso: node audio/narrar.mjs <peca> [--permitir-sobreposicao]
 *
 * Entrada: audio/<peca>/narracao.json + audio/<peca>/falas.json (de alinhar-take.mjs).
 * Saída:
 *   public/audio/<peca>/voz.wav               (gerado; fora do Git)
 *   src/composicoes/<peca>/legenda.json       (BlocoLegenda[] para <Legenda>)
 *   audio/<peca>/tempos.json                  (início/fim de cada fala em ms e frames; ritmo da narração)
 *
 * Regras: fala que já tem tempo real NÃO é aparada de novo (aparar desloca a legenda);
 * `legenda: ""` = a tela já escreve a fala; `bloco_de: <id>` = a legenda desta fala continua o último bloco da fala <id>.
 * Ritmo: ≤ 2,6 palavras/s na peça inteira (aviso).
 */
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {decodificar, escreverWav, gravarJson, lerJson, normalizar, RAIZ, TAXA} from './lib/comum.mjs';

export const PALAVRAS_POR_SEGUNDO_MAX = 2.6;

export function narrar(peca, {permitirSobreposicao = false} = {}) {
  const dir = join(RAIZ, 'audio', peca);
  const narracao = lerJson(join(dir, 'narracao.json'));
  const alinhado = lerJson(join(dir, 'falas.json'));
  const {fps, duracaoFrames} = narracao;
  const totalMs = (duracaoFrames / fps) * 1000;
  const porId = Object.fromEntries(alinhado.falas.map((f) => [f.id, f]));
  const avisos = [];
  const erros = [];

  const tempos = narracao.falas.map((f) => {
    const a = porId[f.id];
    if (!a) throw new Error(`fala ${f.id} sem áudio alinhado (rode alinhar-take.mjs)`);
    const inicioMs = Math.round((f.frame / fps) * 1000);
    return {id: f.id, frame: f.frame, inicioMs, fimMs: inicioMs + a.duracaoMs, duracaoMs: a.duracaoMs, palavrasFaladas: normalizar(f.texto).length};
  });
  tempos.forEach((t, i) => {
    t.fimFrame = Math.ceil((t.fimMs / 1000) * fps);
    const prox = tempos[i + 1];
    if (prox && t.fimMs > prox.inicioMs) {
      const msg = `sobreposição: ${t.id} termina em ${t.fimMs} ms e ${prox.id} começa em ${prox.inicioMs} ms (${t.fimMs - prox.inicioMs} ms; empurre ${prox.id} para o frame ${t.fimFrame} ou mais)`;
      (permitirSobreposicao ? avisos : erros).push(msg);
    }
    if (t.fimMs > totalMs) erros.push(`${t.id} passa do fim da peça (${t.fimMs} ms > ${Math.round(totalMs)} ms)`);
  });

  // voz posicionada (estéreo, 48 kHz, 24 bits)
  const n = Math.round((totalMs / 1000) * TAXA);
  const voz = new Float32Array(n * 2);
  for (const t of tempos) {
    const s = decodificar(join(dir, porId[t.id].arquivo), 2);
    const off = Math.round((t.inicioMs / 1000) * TAXA) * 2;
    for (let i = 0; i < s.length && off + i < voz.length; i++) voz[off + i] += s[i];
  }
  const pastaPublica = join(RAIZ, 'public', 'audio', peca);
  mkdirSync(pastaPublica, {recursive: true});
  escreverWav(join(pastaPublica, 'voz.wav'), voz, 2);

  // legenda pelo tempo real das palavras
  const blocos = [];
  narracao.falas.forEach((f, i) => {
    const a = porId[f.id];
    const t = tempos[i];
    if (!a.palavras.length) {
      avisos.push(`${f.id}: sem legenda (a tela precisa escrever esta fala; toda fala aparece escrita)`);
      return;
    }
    const grupos = new Map();
    for (const p of a.palavras) {
      if (!grupos.has(p.bloco)) grupos.set(p.bloco, []);
      grupos.get(p.bloco).push({
        text: p.texto,
        startMs: t.inicioMs + p.inicioMs,
        endMs: t.inicioMs + p.fimMs,
        timestampMs: t.inicioMs + Math.round((p.inicioMs + p.fimMs) / 2),
        confidence: 1,
        ...(p.cor ? {cor: p.cor} : {}),
        ...(p.quebraAntes ? {quebraAntes: true} : {}),
      });
    }
    [...grupos.entries()].forEach(([b, palavras], k) => {
      if (k === 0 && f.bloco_de) {
        const alvo = [...blocos].reverse().find((x) => x.id.startsWith(`${f.bloco_de}-`));
        if (!alvo) throw new Error(`${f.id}: bloco_de "${f.bloco_de}" não existe antes dela`);
        alvo.palavras.push(...palavras);
        return;
      }
      blocos.push({id: `${f.id}-${b}`, faixa: f.faixa ?? 'baixa', ...(f.frame === 0 && b === 0 ? {gancho: true} : {}), palavras});
    });
  });
  const pastaComp = join(RAIZ, 'src', 'composicoes', peca);
  mkdirSync(pastaComp, {recursive: true});
  gravarJson(join(pastaComp, 'legenda.json'), blocos);

  const palavras = tempos.reduce((s, t) => s + t.palavrasFaladas, 0);
  const ritmo = palavras / (totalMs / 1000);
  if (ritmo > PALAVRAS_POR_SEGUNDO_MAX) avisos.push(`ritmo ${ritmo.toFixed(2)} palavras/s (máximo ${PALAVRAS_POR_SEGUNDO_MAX})`);
  const resumo = {fps, duracaoFrames, palavrasFaladas: palavras, palavrasPorSegundo: Number(ritmo.toFixed(2)), falas: tempos, avisos, erros};
  gravarJson(join(dir, 'tempos.json'), resumo);
  return resumo;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const peca = process.argv[2];
  if (!peca) {
    console.error('Uso: node audio/narrar.mjs <peca> [--permitir-sobreposicao]');
    process.exit(2);
  }
  const r = narrar(peca, {permitirSobreposicao: process.argv.includes('--permitir-sobreposicao')});
  for (const t of r.falas) console.log(`  ${t.id}: ${t.inicioMs}–${t.fimMs} ms (frames ${t.frame}–${t.fimFrame})`);
  console.log(`Ritmo: ${r.palavrasPorSegundo} palavras/s`);
  for (const a of r.avisos) console.log(`  aviso: ${a}`);
  for (const e of r.erros) console.error(`  ERRO: ${e}`);
  process.exit(r.erros.length ? 1 : 0);
}
