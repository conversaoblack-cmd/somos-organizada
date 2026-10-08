import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { metaDaTorcida, metaDoEvento, montarPrevia } from "../src/api/previa";

const APP = `<!doctype html>
<html lang="pt-BR">
  <head>
    <title>Somos Organizada</title>
    <meta name="description" content="Eventos, ingressos e associação oficial da sua torcida organizada." />
  </head>
  <body><div id="root"></div></body>
</html>`;
const TORCIDA = { nome: "Bamor", tema: { corPrimaria: "#000000", corSecundaria: "#000000", corFundo: "#000000", corTexto: "#ffffff", bannerUrl: "https://x/banner.jpg" } };

test("prévia do evento: título, data em Brasília, local, preços e imagem do evento", () => {
  const evento = {
    nome: "Caravana <Final>",
    data: Timestamp.fromDate(new Date("2026-11-28T22:30:00Z")), // 19h30 em Brasília
    local: "Sede Centro",
    valorSocio: 5000,
    valorPublico: 8000,
    imagemUrl: "https://x/evento.jpg",
  } as never;
  const m = metaDoEvento(TORCIDA as never, evento, "https://somosorganizada.com.br/bamor/e/k7p2qx");
  assert.equal(m.titulo, "Caravana <Final> · Bamor");
  assert.match(m.descricao, /28 de novembro/);
  assert.match(m.descricao, /19:30/);
  assert.match(m.descricao, /Sede Centro/);
  assert.match(m.descricao, /Sócio R\$\s?50,00 · Público R\$\s?80,00/);
  assert.equal(m.imagem, "https://x/evento.jpg");

  const html = montarPrevia(APP, m);
  assert.match(html, /<title>Caravana &lt;Final&gt; · Bamor<\/title>/); // escapado
  assert.match(html, /<meta property="og:image" content="https:\/\/x\/evento.jpg" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/somosorganizada.com.br\/bamor\/e\/k7p2qx" \/>/);
  assert.equal((html.match(/name="description"/g) ?? []).length, 1);
  assert.ok(html.indexOf("og:title") < html.indexOf("</head>"));
});

test("prévia da torcida usa textos e banner; sem imagem vira cartão simples", () => {
  const m = metaDaTorcida({ ...TORCIDA, textos: { titulo: "Bamor Oficial", subtitulo: "Caravanas e sócios" } } as never, "https://s/bamor");
  assert.deepEqual([m.titulo, m.descricao, m.imagem], ["Bamor Oficial", "Caravanas e sócios", "https://x/banner.jpg"]);
  const sem = montarPrevia(APP, { titulo: "T", descricao: "D", url: "https://s/x" });
  assert.doesNotMatch(sem, /og:image/);
  assert.match(sem, /twitter:card" content="summary"/);
});

test("código curto de evento gerado no servidor segue o formato das regras", async () => {
  const { codigoEvento } = await import("../src/api/agendados");
  for (let i = 0; i < 200; i++) assert.match(codigoEvento(), /^[a-hjkmnp-z2-9]{6}$/);
});
