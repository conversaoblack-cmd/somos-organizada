import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pontuar, validarParecer} from '../../auditoria/pontuar.mjs';

const base = (avaliador, notas, extra = {}) => ({
  avaliador,
  veredito: 'APROVA',
  evidencias_usadas: ['folha-zona.png'],
  notas,
  justificativa: {},
  pontos_fortes: [],
  problemas: [],
  riscos: [],
  informacao_falsa: false,
  desalinhado_objetivo: false,
  ...extra,
});

const mesaBoa = () => [
  base('roteirista', {gancho: 9.5, clareza: 9.5}),
  base('motion-review', {gancho: 9.5, visual: 9.5, fidelidade: 9.5, tecnica: 9.5}),
  base('marketing-review', {objetivo: 9.5, clareza: 9.5, gancho: 9.5, fidelidade: 9.5, cta: 9.5}),
];

test('média 9,5 atinge a meta sem bloqueio', () => {
  const r = pontuar(mesaBoa());
  assert.equal(r.nota, 9.5);
  assert.equal(r.situacao, 'ATINGE A META');
});

test('problema crítico reprova mesmo com média 9,5', () => {
  const m = mesaBoa();
  m[2].problemas = [{descricao: 'mostra preço', gravidade: 'critica', criterio: 'fidelidade', evidencia: 't012.5', correcao: 'tirar'}];
  const r = pontuar(m);
  assert.equal(r.nota, 9.5);
  assert.equal(r.situacao, 'BLOQUEADA');
  assert.equal(r.bloqueios[0].tipo, 'problema_critico');
});

test('veto, informação falsa e QC crítico também bloqueiam', () => {
  for (const mudar of [
    (m) => (m[0].veredito = 'VETA'),
    (m) => (m[1].informacao_falsa = true),
    (m) => (m[1].desalinhado_objetivo = true),
  ]) {
    const m = mesaBoa();
    mudar(m);
    assert.equal(pontuar(m).situacao, 'BLOQUEADA');
  }
  assert.equal(pontuar(mesaBoa(), {nota: 0, falhaCritica: true, problemas: [{gravidade: 'critica', descricao: 'mudo'}]}).situacao, 'BLOQUEADA');
});

test('nota fora da competência é descartada', () => {
  const m = mesaBoa();
  m[0].notas.visual = 2; // roteirista não avalia visual
  const r = pontuar(m);
  assert.equal(r.criterios.visual.media, 9.5);
  assert.deepEqual(r.descartadas.map((d) => [d.avaliador, d.criterio]), [['roteirista', 'visual']]);
});

test('cobertura abaixo de 80% do peso dá inconclusivo', () => {
  // só gancho + clareza = 30% do peso
  const r = pontuar([base('roteirista', {gancho: 10, clareza: 10})]);
  assert.equal(r.cobertura, 0.3);
  assert.equal(r.situacao, 'INCONCLUSIVA');
});

test('null não conta como nota e renormaliza os pesos', () => {
  const m = mesaBoa();
  m[2].notas.cta = null; // cta (10%) sem nota → cobertura 90%
  m[1].notas.visual = 5;
  const r = pontuar(m);
  assert.equal(r.cobertura, 0.9);
  // (0,75 do peso com 9,5 + 0,15 com 5) / 0,90 = 8,75
  assert.equal(r.nota, 8.75);
  assert.equal(r.situacao, 'ABAIXO DA META');
});

test('validação recusa parecer sem evidências ou com veredito inventado', () => {
  assert.ok(validarParecer(base('motion-review', {}, {evidencias_usadas: []}), 'x').length > 0);
  assert.ok(validarParecer(base('motion-review', {}, {veredito: 'OK'}), 'x').length > 0);
  assert.equal(validarParecer(base('motion-review', {visual: 8}), 'x').length, 0);
});

test('gravidade com acento ("média", "crítica") é aceita e "crítica" bloqueia', () => {
  const m = mesaBoa();
  m[0].problemas = [{descricao: 'x', gravidade: 'média'}];
  assert.equal(validarParecer(m[0], 'x').length, 0);
  m[1].problemas = [{descricao: 'y', gravidade: 'crítica'}];
  assert.equal(pontuar(m).situacao, 'BLOQUEADA');
});
