// Fluxo D: domínio próprio da torcida. Liga (direto no emulador) vitrine.test → brasil e painel.vitrine.test → painel
// da brasil e abre o site por esses endereços (o Chromium resolve *.test para 127.0.0.1):
// "/" da vitrine mostra a página da torcida (a página inicial estática manda para o app), o link curto do evento
// abre o evento, link no formato antigo vira o curto, "/admin" na vitrine vai para o painel, a raiz do painel é o
// login da diretoria e um endereço não ligado explica o que houve.
import assert from "node:assert/strict";
import { BASE, novoAparelho, fecharAparelho, novaPagina, conferir, fsLer, fsConsultar, fsAtualizar, fsApagar } from "../lib.mjs";

const VITRINE = "vitrine.test";
const PAINEL = "painel.vitrine.test";

export async function dominio(estado) {
  const { tid } = estado;
  const porta = new URL(BASE).port;
  const em = (host, caminho = "/") => `http://${host}${porta ? `:${porta}` : ""}${caminho}`;
  const torcida = await fsLer(`torcidas/${tid}`);
  const ativos = { vitrine: VITRINE, painel: PAINEL };
  await fsAtualizar(`dominios/${VITRINE}`, { tid, slug: "brasil", tipo: "vitrine", status: "ativo", ativos });
  await fsAtualizar(`dominios/${PAINEL}`, { tid, slug: "brasil", tipo: "painel", status: "ativo", ativos });
  const eventos = (await fsConsultar(`torcidas/${tid}`, "eventos", [["status", "==", "publicado"]])).filter((e) => e.data > new Date());
  assert.ok(eventos.length, "a brasil tem evento publicado");
  const ev = eventos[0];
  const curto = ev.codigo ? `/e/${ev.codigo}` : `/evento/${ev._id}`;

  try {
    const T = await novoAparelho(estado, "dominio-torcedor");
    const p = await novaPagina(T);

    // raiz da vitrine: a página inicial estática manda para o app, que mostra "/" com a página da torcida
    await p.goto(em(VITRINE));
    await p.getByRole("heading", { name: new RegExp(torcida.textos?.titulo || torcida.nome, "i") }).first().waitFor({ timeout: 30_000 });
    assert.equal(new URL(p.url()).pathname, "/", "a barra mostra / (não /app.html nem /brasil)");
    assert.equal(new URL(p.url()).hostname, VITRINE);
    await conferir(T, p, "vitrine: página da torcida na raiz", { torcedor: true });
    // links internos já saem curtos
    const hrefs = await p.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    assert.ok(!hrefs.some((h) => h?.startsWith("/brasil/") || h === "/brasil"), `links sem /brasil na vitrine: ${hrefs.filter((h) => h?.startsWith("/brasil")).join(", ")}`);

    // link curto do evento
    await p.goto(em(VITRINE, curto));
    await p.getByRole("heading", { name: ev.nome }).first().waitFor({ timeout: 30_000 });
    assert.equal(new URL(p.url()).pathname, curto);
    await conferir(T, p, "vitrine: link curto do evento", { torcedor: true });

    // link no formato antigo (/brasil/...) vira o curto
    await p.goto(em(VITRINE, `/brasil${curto}`));
    await p.getByRole("heading", { name: ev.nome }).first().waitFor({ timeout: 30_000 });
    assert.equal(new URL(p.url()).pathname, curto, "/brasil/e/... vira /e/...");

    // termos da torcida e conta (sócio) na vitrine
    await p.goto(em(VITRINE, "/termos"));
    await p.getByRole("heading", { name: /Termos/i }).first().waitFor({ timeout: 30_000 });
    assert.equal(new URL(p.url()).pathname, "/termos");
    await conferir(T, p, "vitrine: termos da torcida", { torcedor: true });

    // painel aberto pela vitrine vai para o domínio do painel
    await p.goto(em(VITRINE, "/admin"));
    await p.waitForURL((u) => u.hostname === PAINEL, { timeout: 30_000 });
    await p.locator('input[type="password"]').first().waitFor({ timeout: 30_000 });
    assert.equal(new URL(p.url()).pathname, "/", "raiz do painel mostra /");
    await conferir(T, p, "painel: login da diretoria na raiz");

    // página pública aberta no painel volta para a vitrine
    await p.goto(em(PAINEL, "/socio"));
    await p.waitForURL((u) => u.hostname === VITRINE && u.pathname === "/socio", { timeout: 30_000 });

    // endereço que não está ligado a torcida nenhuma
    await p.goto(em("desconhecido.test"));
    await p.getByText("Endereço ainda não ligado").waitFor({ timeout: 30_000 });
    await conferir(T, p, "endereço não ligado");
    await fecharAparelho(T);
  } finally {
    await fsApagar(`dominios/${VITRINE}`);
    await fsApagar(`dominios/${PAINEL}`);
  }
}
