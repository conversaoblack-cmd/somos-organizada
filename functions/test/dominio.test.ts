import { test } from "node:test";
import assert from "node:assert/strict";
import { avancarCiclo, calcularMensalidade, calcularPedidoIngresso, taxaServico } from "../src/dominio/precos";
import { cifrar, decifrar, gerarQr, lerQr, codigoLegivel } from "../src/util/cripto";
import { cpfValido, mascararCpf, slugValido, telefoneBR } from "../src/util/validacao";
import { statusAposPagamento } from "../src/dominio/processamento";
import { crc16, pixCopiaECola } from "../src/util/pix";
import { dividir, subsedePodeVender } from "../src/dominio/split";
import { planoEfetivo } from "../src/api/saas";

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

test("Pix copia e cola: CRC16 do exemplo oficial do Banco Central e payload com valor", () => {
  const exemplo = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
  assert.equal(crc16(exemplo), "1D3D");
  const p = pixCopiaECola({ chave: "pix@somos.test", valorCentavos: 100000, nome: "Somos Organizada", cidade: "Salvador", txid: "SOabc20261107" });
  assert.match(p, /^000201/);
  assert.ok(p.includes("54071000.00"));
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
});

test("split: subsede ativa recebe o valor do ingresso, torcida recebe a taxa", () => {
  const torcida = { pagamentos: { splitAtivo: true, recebedorPrincipalId: "rp_torcida" } } as never;
  const ativa = { tipo: "subsede", recebedor: { id: "rp_sub", status: "active" } } as never;
  const pendente = { tipo: "subsede", recebedor: { id: "rp_sub", status: "registration" } } as never;
  const principal = { tipo: "principal" } as never;
  const d = dividir(torcida, ativa, 5000, 500);
  assert.equal(d.liquidacao, "split");
  assert.deepEqual(d.split!.map((r) => [r.recipient_id, r.amount, r.options.liable, r.options.charge_processing_fee]), [["rp_sub", 5000, true, true], ["rp_torcida", 500, false, false]]);
  assert.equal(dividir(torcida, principal, 5000, 500).split, undefined);
  assert.equal(subsedePodeVender(torcida, pendente), false);
  assert.equal(subsedePodeVender(torcida, principal), true);
  assert.equal(subsedePodeVender({ pagamentos: {} } as never, ativa), false);
});

test("plano da plataforma: gigante acima de 3.000 sócios ativos", () => {
  assert.equal(planoEfetivo("pequena", 3000, 3000), "pequena");
  assert.equal(planoEfetivo("pequena", 3001, 3000), "gigante");
  assert.equal(planoEfetivo("grande", 120, 3000), "grande");
});

test("recusa de cartão: código ABECS e código antigo da Pagar.me viram mensagem clara", async () => {
  const { classificarRecusa } = await import("../src/pagarme/recusas");
  const t = (acquirer_return_code: string) => ({ id: "t", status: "not_authorized", acquirer_return_code });
  assert.equal(classificarRecusa(t("51")).categoria, "saldo");
  assert.equal(classificarRecusa(t("1016")).categoria, "saldo");
  assert.equal(classificarRecusa(t("54")).categoria, "vencido");
  assert.equal(classificarRecusa(t("54")).retentar, false);
  assert.equal(classificarRecusa(t("N7")).categoria, "cvv");
  assert.equal(classificarRecusa(t("05")).categoria, "generica");
  assert.equal(classificarRecusa(t("05")).retentar, true);
  assert.equal(classificarRecusa(t("91")).categoria, "indisponivel");
  assert.equal(classificarRecusa({ id: "t", status: "failed", antifraud_response: { status: "reproved" } }).categoria, "antifraude");
  assert.equal(classificarRecusa(undefined).categoria, "generica");
});
