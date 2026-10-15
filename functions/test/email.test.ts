import { test } from "node:test";
import assert from "node:assert/strict";
import { montar, semLink } from "../src/email/modelos";
import { MARCA_PLATAFORMA } from "../src/api/verificacao";
import { pixCopiaECola } from "../src/util/pix";
import type { Torcida } from "../src/dominio/tipos";

const torcida = { nome: "Fúria Amapá", slug: "furia-amapa", tema: { corPrimaria: "#1E4FD8", logoUrl: "https://exemplo.test/escudo.png" } } as unknown as Torcida;
const para = { email: "x@y.test", nome: "X" };

test("e-mail da Somos Organizada leva a nossa logo e o nosso nome", () => {
  const m = montar(MARCA_PLATAFORMA, "Fatura", para, { selo: "Mensalidade", titulo: "Sua fatura chegou", paragrafos: ["Oi"], botao: { texto: "Ver", url: "https://somosorganizada.com.br/x/admin/plano" }, conta: true });
  assert.match(m.html, /<img src="[^"]*\/icone-192\.png"/);
  assert.match(m.html, /Somos Organizada/);
  assert.equal(m.nomeRemetente, "Somos Organizada");
});

test("e-mail da torcida leva o escudo da torcida", () => {
  const m = montar(torcida, "Convite", para, { selo: "Convite", titulo: "Oi", paragrafos: ["Oi"], botao: { texto: "Aceitar", url: "https://somosorganizada.com.br/convite?c=abc" }, conta: true });
  assert.match(m.html, /src="https:\/\/exemplo\.test\/escudo\.png"/);
});

test("nenhum endereço em texto: o link é só o botão", () => {
  const url = "https://somosorganizada.com.br/convite?c=abc123";
  const m = montar(torcida, "Convite", para, { selo: "Convite", titulo: "Oi", paragrafos: ["Oi"], botao: { texto: "Aceitar", url }, conta: true });
  assert.equal(m.html.split(url).length - 1, 1, "a URL aparece só no href do botão");
  assert.doesNotMatch(m.html, /Se o botão não abrir/);
});

test("Pix: QR Code em imagem + botão de copiar; o código não aparece em texto no HTML", () => {
  const codigo = pixCopiaECola({ chave: "52000426000149", valorCentavos: 19700, nome: "SOMOS ORGANIZADA", cidade: "SALVADOR", txid: "SOteste" });
  const m = montar(MARCA_PLATAFORMA, "Fatura", para, { selo: "Mensalidade", titulo: "Fatura", paragrafos: ["Oi"], pix: { codigo }, botao: { texto: "Ver", url: "https://x.test" }, conta: true });
  assert.match(m.html, /\/pix\/qr\.png\?c=/);
  assert.match(m.html, />Copiar código Pix</);
  assert.ok(!m.html.includes(`>${codigo}<`), "código Pix não fica como texto");
  assert.ok(m.texto.includes(codigo), "a versão só texto (sem HTML) leva o código");
});

test("endereço citado no texto não vira link no Gmail", () => {
  assert.equal(semLink("somosorganizada.com.br/furia"), "somosorganizada&#8203;.com&#8203;.br/furia");
});
