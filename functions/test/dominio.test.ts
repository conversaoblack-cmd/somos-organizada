import { test } from "node:test";
import assert from "node:assert/strict";
import { avancarCiclo, calcularMensalidade, calcularPedidoIngresso, taxaServico } from "../src/dominio/precos";
import { cifrar, decifrar, gerarQr, lerQr, codigoLegivel } from "../src/util/cripto";
import { cpfValido, mascararCpf, slugValido, telefoneBR } from "../src/util/validacao";
import { statusAposPagamento } from "../src/dominio/processamento";
import { crc16, pixCopiaECola } from "../src/util/pix";
import { dividir, subsedePodeVender } from "../src/dominio/split";
import { cabeNoPlano, limitesDoPlano, mensagemForaDoPlano, normalizarPlano, SAAS_PADRAO, sociosQueOcupamVaga } from "../src/api/saas";

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

test("planos da plataforma: ids antigos viram Pro/Plus/Max", () => {
  assert.equal(normalizarPlano("pro"), "pro");
  assert.equal(normalizarPlano("plus"), "plus");
  assert.equal(normalizarPlano("max"), "max");
  assert.equal(normalizarPlano("pequena"), "pro");
  assert.equal(normalizarPlano("grande"), "plus");
  assert.equal(normalizarPlano("gigante"), "max");
  assert.equal(normalizarPlano("outro"), null);
  assert.equal(normalizarPlano(undefined), null);
});

test("planos da plataforma: preços e limites", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(SAAS_PADRAO.planos).map(([k, p]) => [k, [p.nome, p.valor]])),
    { pro: ["Torcida Pro", 19700], plus: ["Torcida Plus", 34700], max: ["Torcida Max", 99700] },
  );
  assert.deepEqual(limitesDoPlano("pro"), { socios: 300, eventos: 3 });
  assert.deepEqual(limitesDoPlano("plus"), { socios: 600, eventos: 6 });
  assert.deepEqual(limitesDoPlano("max"), { socios: 2000, eventos: 20 });
});

test("planos da plataforma: o uso cabe no plano (limite incluso) e a mensagem diz o que passou", () => {
  assert.deepEqual(cabeNoPlano("pro", { socios: 300, eventos: 3 }), { cabe: true, socios: true, eventos: true });
  assert.deepEqual(cabeNoPlano("pro", { socios: 301, eventos: 3 }), { cabe: false, socios: false, eventos: true });
  assert.deepEqual(cabeNoPlano("pro", { socios: 10, eventos: 4 }), { cabe: false, socios: true, eventos: false });
  assert.equal(cabeNoPlano("plus", { socios: 412, eventos: 4 }).cabe, true);
  assert.equal(mensagemForaDoPlano("plus", { socios: 412, eventos: 4 }), null);
  assert.equal(
    mensagemForaDoPlano("pro", { socios: 412, eventos: 2 }),
    "O plano Torcida Pro vai até 300 sócios e 3 eventos à venda. Hoje vocês têm 412 sócios. Escolha um plano maior.",
  );
  assert.equal(
    mensagemForaDoPlano("plus", { socios: 1200, eventos: 7 }),
    "O plano Torcida Plus vai até 600 sócios e 6 eventos à venda. Hoje vocês têm 1.200 sócios e 7 eventos à venda. Escolha um plano maior.",
  );
});

test("planos da plataforma: sócios que ocupam vaga (ativo, inadimplente e em análise)", () => {
  assert.equal(sociosQueOcupamVaga({ ativo: 280, inadimplente: 12, em_analise: 3, pendente_pagamento: 40, suspenso: 5, cancelado: 90 }), 295);
  assert.equal(sociosQueOcupamVaga({ ativo: -1, inadimplente: 2 }), 2);
  assert.equal(sociosQueOcupamVaga(undefined), 0);
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

test("e-mail: personalizado com a torcida, sem ingresso no corpo e à prova de HTML injetado", async () => {
  const { emailIngressoComprado } = await import("../src/email/modelos");
  const torcida = { nome: "Fúria <b>Jovem</b>", slug: "furia", tema: { corPrimaria: "#facc15", corSecundaria: "#000000", corFundo: "#000000", corTexto: "#ffffff" } } as never;
  const e = emailIngressoComprado({
    torcida, url: "https://x.test/furia/conta/ingressos", nome: "Ana <script>", email: "ana@x.test", eventoNome: "Caravana",
    data: new Date("2026-10-25T22:00:00Z"), titulares: ["Ana"], total: 5500, metodo: "pix",
  });
  assert.ok(!e.html.includes("<script>"));
  assert.ok(e.html.includes("Fúria &lt;b&gt;Jovem&lt;/b&gt;"));
  assert.ok(e.html.includes("#facc15") && e.html.includes("color:#111111")); // botão amarelo com texto escuro
  assert.ok(e.html.includes("https://x.test/furia/conta/ingressos"));
  assert.ok(!/SO1\\.|qr/i.test(e.html.replace(/QR Code/g, ""))); // nada de QR/ingresso no e-mail
  assert.match(e.texto, /Domingo, 25 de outubro, às 19:00/);
  assert.equal(e.assunto, "Ingresso confirmado: Caravana");
});
