#!/usr/bin/env node
/**
 * Consolida os pareceres de uma rodada da mesa → resultado.json (seção 7.2).
 * Uso: node auditoria/pontuar.mjs <pasta-da-rodada> [--qc caminho/qc.json]
 *
 * Lê <pasta>/pareceres/*.json (um por cadeira, formato da seção 7.2) e, se existir, <pasta>/qc.json.
 * Regras:
 * - nota fora da competência da cadeira é DESCARTADA (e listada);
 * - nota null não entra (cadeira não conseguiu julgar);
 * - por critério: média das notas válidas; nota final: média ponderada com os pesos renormalizados;
 * - cobertura < 80% do peso = rodada INCONCLUSIVA;
 * - bloqueios valem independentemente da média: gravidade crítica, informacao_falsa, desalinhado_objetivo,
 *   veto em pé, falha crítica no QC;
 * - meta: ≥ 9,0 e nenhum bloqueio. Nunca arredonde para cima para bater meta.
 */
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';

const CRIT = JSON.parse(readFileSync(new URL('./criterios.json', import.meta.url), 'utf8'));

const arred = (x) => (x === null ? null : Math.round(x * 100) / 100);

export function validarParecer(p, origem) {
  const erros = [];
  if (!p || typeof p !== 'object') return [`${origem}: não é um objeto JSON`];
  if (!CRIT.competencias[p.avaliador] || p.avaliador === 'qc') erros.push(`${origem}: avaliador "${p.avaliador}" desconhecido`);
  if (!CRIT.vereditos.includes(p.veredito)) erros.push(`${origem}: veredito "${p.veredito}" inválido (${CRIT.vereditos.join(' | ')})`);
  if (!Array.isArray(p.evidencias_usadas) || p.evidencias_usadas.length === 0) erros.push(`${origem}: evidencias_usadas vazio (declare o que abriu)`);
  if (!p.notas || typeof p.notas !== 'object') erros.push(`${origem}: sem "notas"`);
  else {
    for (const [c, n] of Object.entries(p.notas)) {
      if (!(c in CRIT.pesos)) erros.push(`${origem}: critério "${c}" não existe`);
      else if (n !== null && (typeof n !== 'number' || n < 0 || n > 10)) erros.push(`${origem}: nota de ${c} fora de 0..10`);
    }
  }
  for (const [i, x] of (p.problemas ?? []).entries()) {
    if (!CRIT.gravidades.includes(x.gravidade)) erros.push(`${origem}: problema ${i} com gravidade "${x.gravidade}"`);
  }
  return erros;
}

export function pontuar(pareceres, qc = null) {
  const descartadas = [];
  const porCriterio = Object.fromEntries(Object.keys(CRIT.pesos).map((c) => [c, []]));
  const bloqueios = [];

  for (const p of pareceres) {
    const comp = CRIT.competencias[p.avaliador] ?? [];
    for (const [c, n] of Object.entries(p.notas ?? {})) {
      if (!comp.includes(c)) {
        descartadas.push({avaliador: p.avaliador, criterio: c, nota: n, motivo: 'fora da competência'});
        continue;
      }
      if (n === null || n === undefined) continue;
      porCriterio[c].push({avaliador: p.avaliador, nota: n});
    }
    if (p.veredito === 'VETA') bloqueios.push({tipo: 'veto', avaliador: p.avaliador});
    if (p.informacao_falsa === true) bloqueios.push({tipo: 'informacao_falsa', avaliador: p.avaliador});
    if (p.desalinhado_objetivo === true) bloqueios.push({tipo: 'desalinhado_objetivo', avaliador: p.avaliador});
    for (const x of p.problemas ?? []) {
      if (x.gravidade === 'critica') bloqueios.push({tipo: 'problema_critico', avaliador: p.avaliador, descricao: x.descricao});
    }
  }
  if (qc) {
    porCriterio.tecnica.push({avaliador: 'qc', nota: qc.nota});
    if (qc.falhaCritica) bloqueios.push({tipo: 'qc_critico', avaliador: 'qc', descricao: (qc.problemas ?? []).filter((x) => x.gravidade === 'critica').map((x) => x.descricao).join('; ')});
  }

  const media = (xs) => (xs.length ? xs.reduce((t, x) => t + x.nota, 0) / xs.length : null);
  const criterios = Object.fromEntries(
    Object.entries(porCriterio).map(([c, xs]) => [c, {media: arred(media(xs)), peso: CRIT.pesos[c], natureza: CRIT.natureza[c], notas: xs}]),
  );
  const ponderada = (lista) => {
    let soma = 0;
    let peso = 0;
    for (const c of lista) {
      const m = media(porCriterio[c]);
      if (m === null) continue;
      soma += m * CRIT.pesos[c];
      peso += CRIT.pesos[c];
    }
    const total = lista.reduce((t, c) => t + CRIT.pesos[c], 0);
    return {nota: peso ? soma / peso : null, cobertura: peso / total};
  };
  const geral = ponderada(Object.keys(CRIT.pesos));
  const execucao = ponderada(CRIT.grupos.execucao);
  const previsao = ponderada(CRIT.grupos.previsao_de_conteudo);
  const inconclusiva = geral.cobertura < CRIT.cobertura_minima - 1e-9;
  let situacao;
  if (inconclusiva) situacao = 'INCONCLUSIVA';
  else if (bloqueios.length) situacao = 'BLOQUEADA';
  else if (geral.nota >= CRIT.meta) situacao = 'ATINGE A META';
  else situacao = 'ABAIXO DA META';

  return {
    situacao,
    nota: arred(geral.nota),
    cobertura: arred(geral.cobertura),
    meta: CRIT.meta,
    nota_execucao: {nota: arred(execucao.nota), cobertura: arred(execucao.cobertura), criterios: CRIT.grupos.execucao},
    previsao_de_conteudo: {nota: arred(previsao.nota), cobertura: arred(previsao.cobertura), criterios: CRIT.grupos.previsao_de_conteudo},
    criterios,
    bloqueios,
    descartadas,
    cadeiras: pareceres.map((p) => ({avaliador: p.avaliador, veredito: p.veredito})),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error('Uso: node auditoria/pontuar.mjs <pasta-da-rodada> [--qc qc.json]');
    process.exit(2);
  }
  const iQc = process.argv.indexOf('--qc');
  const caminhoQc = iQc > 0 ? process.argv[iQc + 1] : join(pasta, 'qc.json');
  const dir = join(pasta, 'pareceres');
  const arquivos = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  const pareceres = [];
  const erros = [];
  for (const f of arquivos) {
    let p;
    try {
      p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      erros.push(`${f}: JSON inválido (${e.message})`);
      continue;
    }
    const e = validarParecer(p, basename(f));
    if (e.length) erros.push(...e);
    else pareceres.push(p);
  }
  if (erros.length) {
    console.error('Pareceres com erro (não entram na conta; refaça a cadeira, não invente):\n  ' + erros.join('\n  '));
  }
  const qc = existsSync(caminhoQc) ? JSON.parse(readFileSync(caminhoQc, 'utf8')) : null;
  const r = {...pontuar(pareceres, qc), arquivos, qc: qc ? caminhoQc : null, erros};
  writeFileSync(join(pasta, 'resultado.json'), JSON.stringify(r, null, 2) + '\n');
  console.log(`${r.situacao} · nota ${r.nota ?? '–'} (cobertura ${Math.round((r.cobertura ?? 0) * 100)}%) · execução ${r.nota_execucao.nota ?? '–'} · previsão ${r.previsao_de_conteudo.nota ?? '–'}`);
  for (const b of r.bloqueios) console.log(`  BLOQUEIO ${b.tipo} (${b.avaliador})${b.descricao ? ': ' + b.descricao : ''}`);
  for (const d of r.descartadas) console.log(`  descartada: ${d.avaliador} deu ${d.nota} em ${d.criterio} (${d.motivo})`);
  process.exit(erros.length ? 1 : 0);
}
