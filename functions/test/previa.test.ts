import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { hostDoPedido, metaDaTorcida, metaDoEvento, montarPrevia, talvezDominioProprio } from "../src/api/previa";

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

test("prévia não interpreta $&, $` e $' do texto da torcida (replace com função)", () => {
  const html = montarPrevia(APP, { titulo: "Promo $` $& $'", descricao: "Desc $&", url: "https://x/y", imagem: null } as never);
  assert.ok(html.includes("<title>Promo $` $&amp; $'</title>"), "o texto entra literal");
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
  assert.equal((html.match(/<\/head>/g) ?? []).length, 1);
});

test("prévia no domínio próprio: host vem do X-Forwarded-Host; endereços da plataforma não consultam domínio", () => {
  const cab = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] });
  assert.equal(hostDoPedido(cab({ "x-forwarded-host": "Furia.com.br", host: "previalink-abc.run.app" })), "furia.com.br");
  assert.equal(hostDoPedido(cab({ host: "furia.com.br:443" })), "furia.com.br");
  assert.equal(hostDoPedido(cab({})), "");
  const p = "somosorganizada.com.br";
  assert.equal(talvezDominioProprio("furia.com.br", p), true);
  for (const h of ["", p, `www.${p}`, `plataforma.${p}`, "somos-organizada.web.app", "previalink-x.a.run.app", "127.0.0.1", "localhost"]) assert.equal(talvezDominioProprio(h, p), false, h);
});

test("Pix do e-mail: só código Pix válido vira QR (CRC conferido)", async () => {
  const { pixValido, qrDoPix } = await import("../src/api/previa");
  const { pixCopiaECola } = await import("../src/util/pix");
  const bom = pixCopiaECola({ chave: "52000426000149", valorCentavos: 19700, nome: "SOMOS ORGANIZADA", cidade: "SALVADOR", txid: "SOteste202610" });
  assert.ok(pixValido(bom));
  assert.ok(!pixValido(bom.slice(0, -1) + (bom.endsWith("0") ? "1" : "0")), "CRC errado");
  assert.ok(!pixValido("https://exemplo.com/qualquer-coisa-bem-comprida-para-passar-do-tamanho-minimo"));
  const png = await qrDoPix(bom);
  assert.ok(png && png.subarray(1, 4).toString() === "PNG");
  assert.equal(await qrDoPix("lixo"), null);
});

test("link de Pix assinado: só o código assinado com a chave do servidor confere", async () => {
  const { assinaturaComChave, confereComChave } = await import("../src/util/assinaturaPix");
  const k = Buffer.alloc(32, 7);
  const s = assinaturaComChave(k, "000201abc");
  assert.equal(s.length, 22);
  assert.ok(confereComChave(k, "000201abc", s));
  assert.ok(!confereComChave(k, "000201abd", s), "outro código");
  assert.ok(!confereComChave(Buffer.alloc(32, 8), "000201abc", s), "outra chave");
  assert.ok(!confereComChave(k, "000201abc", ""));
  assert.ok(!confereComChave(k, "000201abc", s.slice(0, 21) + (s.endsWith("A") ? "B" : "A")));
});
