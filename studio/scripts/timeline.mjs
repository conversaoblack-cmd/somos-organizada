#!/usr/bin/env node
/**
 * Gera a 05-timeline.md de uma peça a partir do CÓDIGO (cenas, trechos gravados do produto) e do áudio (falas, SFX,
 * trilha), para a mesa e para o dono lerem sem abrir o código. Nunca edite a timeline à mão: rode de novo.
 *
 * Uso: node scripts/timeline.mjs <slug-da-composicao> <pasta-da-campanha>
 *      ex.: node scripts/timeline.mjs apresentacao campanhas/2026-10-15-apresentacao
 *
 * Lê: src/composicoes/<slug>/roteiro.ts (CENAS, FPS, DURACAO), src/composicoes/<slug>/fluxos.ts (se houver),
 *     audio/<slug>/narracao.json, audio/<slug>/mix.json, audio/<slug>/tempos.json (se houver).
 */
import {existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const [slug, campanha] = process.argv.slice(2);
if (!slug || !campanha) {
  console.error('Uso: node scripts/timeline.mjs <slug> <pasta-da-campanha>');
  process.exit(1);
}
const raiz = resolve(new URL('..', import.meta.url).pathname);
const comp = join(raiz, 'src/composicoes', slug);

// os módulos de dados são TypeScript: empacota num .mjs temporário e importa
async function importarTs(arquivo) {
  const tmp = mkdtempSync(join(tmpdir(), 'timeline-'));
  const saida = join(tmp, 'm.mjs');
  await build({entryPoints: [arquivo], bundle: true, platform: 'node', format: 'esm', outfile: saida, logLevel: 'silent', external: ['remotion', 'react']});
  const m = await import(pathToFileURL(saida).href);
  rmSync(tmp, {recursive: true, force: true});
  return m;
}

const {CENAS, FPS = 30, DURACAO} = await importarTs(join(comp, 'roteiro.ts'));
const fluxos = existsSync(join(comp, 'fluxos.ts')) ? (await importarTs(join(comp, 'fluxos.ts'))).FLUXOS : {};
const lerJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const narracao = lerJson(join(raiz, 'audio', slug, 'narracao.json'));
const mix = lerJson(join(raiz, 'audio', slug, 'mix.json'));
const tempos = lerJson(join(raiz, 'audio', slug, 'tempos.json'));

const tc = (f) => `${(f / FPS).toFixed(2)} s`;
const nomeSfx = (a) => a.split('/').pop().replace('.wav', '');
const linhas = [];
linhas.push(`# Timeline · ${slug}`, '');
linhas.push(`> Gerada de \`src/composicoes/${slug}/\` e \`audio/${slug}/\` por \`scripts/timeline.mjs\` em ${new Date().toISOString().slice(0, 10)}. Não edite à mão.`, '');
linhas.push(`Duração: ${DURACAO} quadros (${tc(DURACAO)}) a ${FPS} fps.`, '');
linhas.push('| Cena | Quadros | Tempo | Fala (início) | Trechos gravados do produto | SFX |', '|---|---|---|---|---|---|');
for (const [nome, c] of Object.entries(CENAS)) {
  const fala = narracao?.falas?.find((x) => x.id === nome);
  const t = tempos?.falas?.find?.((x) => x.id === nome);
  const fluxo = Object.entries(fluxos).find(([k]) => k === nome || (nome === 'ingresso' && k === 'portaria'));
  const trechos = fluxo
    ? fluxo[1].trechos
        .map((x) => `${c.de + x.de}–${c.de + x.ate}: \`${x.arquivo}\` de ${x.recDe.toFixed(2)} s${x.vel && x.vel !== 1 ? ` a ${x.vel}×` : ''}`)
        .join('<br>')
    : '—';
  const sfx = (mix?.sfx ?? [])
    .filter((s) => s.frame >= c.de && s.frame < c.ate)
    .map((s) => `${s.frame} ${nomeSfx(s.arquivo)}`)
    .join(', ');
  const falaTxt = fala ? `${t ? `${t.frame}–${t.fimFrame}` : fala.frame}: "${fala.texto}"` : '—';
  linhas.push(`| ${nome} | ${c.de}–${c.ate} | ${tc(c.de)}–${tc(c.ate)} | ${falaTxt} | ${trechos} | ${sfx || '—'} |`);
}
if (mix?.trilha) {
  linhas.push('', `Trilha: \`${mix.trilha.arquivo}\` a partir de ${mix.trilha.inicioS} s (quadro ${Math.round(mix.trilha.inicioS * FPS)}), ganho ${mix.trilha.ganhoDb} dB; alvo ${mix.alvo?.lufs} LUFS, true peak ≤ ${mix.alvo?.truePeakDbtp} dBTP.`);
}
const destino = join(raiz, campanha, '05-timeline.md');
writeFileSync(destino, linhas.join('\n') + '\n');
console.log(`Timeline → ${destino}`);
