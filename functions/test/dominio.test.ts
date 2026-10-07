import { test } from "node:test";
import assert from "node:assert/strict";
import { avancarCiclo, calcularMensalidade, calcularPedidoIngresso, taxaServico } from "../src/dominio/precos";
import { cifrar, decifrar, gerarQr, lerQr, codigoLegivel } from "../src/util/cripto";
import { cpfValido, mascararCpf, slugValido, telefoneBR } from "../src/util/validacao";
import { statusAposPagamento } from "../src/dominio/processamento";

const CHAVE = "a".repeat(64);
const SOCIO = { nome: "Sócio Teste", cpf: "52998224725" };
const AMIGO = { nome: "Amigo", cpf: "11144477735" };
const EVENTO = { valorSocio: 4000, valorPublico: 5000 };

test("taxa de 10% por cima do valor", () => {
  assert.equal(taxaServico(5000, 10), 500);
  assert.equal(taxaServico(1999, 10), 200); // arredonda
  assert.deepEqual(calcularMensalidade(1000, 10), { valorBase: 1000, taxa: 100, total: 1100 });
});

test("sócio ativo paga preço de sócio só no próprio ingresso", () => {
  const c = calcularPedidoIngresso({ evento: EVENTO, titulares: [SOCIO, AMIGO], socio: SOCIO, socioJaUsouPreco: false, pct: 10 });
  assert.deepEqual(c.itens.map((i) => i.tipo), ["socio", "publico"]);
  assert.equal(c.valorBase, 9000);
  assert.equal(c.taxa, 900);
  assert.equal(c.total, 9900);
});

test("preço de sócio não vale para ingresso em nome de terceiro", () => {
  const c = calcularPedidoIngresso({ evento: EVENTO, titulares: [AMIGO], socio: SOCIO, socioJaUsouPreco: false, pct: 10 });
  assert.equal(c.itens[0].tipo, "publico");
});

test("preço de sócio só uma vez por evento", () => {
  const c = calcularPedidoIngresso({ evento: EVENTO, titulares: [SOCIO], socio: SOCIO, socioJaUsouPreco: true, pct: 10 });
  assert.equal(c.itens[0].tipo, "publico");
  assert.equal(c.total, 5500);
});

test("não sócio paga preço público", () => {
  const c = calcularPedidoIngresso({ evento: EVENTO, titulares: [SOCIO], socio: null, socioJaUsouPreco: false, pct: 10 });
  assert.equal(c.itens[0].tipo, "publico");
});

test("ciclos de plano: mensal, trimestral e anual, inclusive fim de mês", () => {
  const base = new Date(Date.UTC(2026, 0, 31));
  assert.equal(avancarCiclo(base, "mes", 1).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(avancarCiclo(base, "mes", 3).toISOString().slice(0, 10), "2026-04-30");
  assert.equal(avancarCiclo(base, "ano", 1).toISOString().slice(0, 10), "2027-01-31");
});

test("credencial Pagar.me cifrada e decifrada; adulteração é detectada", () => {
  const pacote = cifrar("sk_test_abc123", CHAVE);
  assert.notEqual(pacote.includes("sk_test"), true);
  assert.equal(decifrar(pacote, CHAVE), "sk_test_abc123");
  const partes = pacote.split(".");
  partes[3] = partes[3].slice(0, -2) + (partes[3].endsWith("A") ? "BB" : "AA");
  assert.throws(() => decifrar(partes.join("."), CHAVE));
  assert.throws(() => decifrar(pacote, "b".repeat(64)));
});

test("QR assinado: válido, forjado e de outro tipo", () => {
  const qr = gerarQr("i", "torcidaX", "ing123", "segredo");
  assert.deepEqual(lerQr(qr, "segredo"), { tipo: "i", tid: "torcidaX", id: "ing123" });
  assert.equal(lerQr(qr, "outro-segredo"), null);
  assert.equal(lerQr(qr.replace("ing123", "ing124"), "segredo"), null);
  assert.equal(lerQr("BRASIL|abc|def", "segredo"), null);
});

test("código legível sem caracteres ambíguos", () => {
  const c = codigoLegivel();
  assert.match(c, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
});

test("validações: CPF, telefone e slug", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cpfValido("529.982.247-24"), false);
  assert.equal(mascararCpf("52998224725"), "***.982.247-**");
  assert.deepEqual(telefoneBR("+55 (71) 99409-5784"), { country_code: "55", area_code: "71", number: "994095784" });
  assert.equal(telefoneBR("123"), null);
  assert.equal(slugValido("gavioes-da-fiel"), true);
  assert.equal(slugValido("admin"), false);
  assert.equal(slugValido("Gavioes"), false);
});

test("status do sócio após pagamento", () => {
  assert.equal(statusAposPagamento("pendente_pagamento", false), "ativo");
  assert.equal(statusAposPagamento("pendente_pagamento", true), "em_analise");
  assert.equal(statusAposPagamento("inadimplente", true), "ativo");
  assert.equal(statusAposPagamento("suspenso", false), "suspenso");
  assert.equal(statusAposPagamento("em_analise", false), "em_analise");
});
