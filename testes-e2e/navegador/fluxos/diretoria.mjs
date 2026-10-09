// Fluxo 2: equipe aprova o cadastro do fluxo 1 e a diretoria nova entra no painel.
// Fluxo 3: diretoria da torcida de demonstração ("brasil") cria plano de sócio com benefícios, cria e publica um
// evento (publicar passa pela ação publicarEvento), confere a página do evento, o link e o QR de divulgação.
import assert from "node:assert/strict";
import {
  BASE, RODADA, novoAparelho, fecharAparelho, novaPagina, conferir, entrar, irNoMenu, fsConsultar, fsAtualizar, fsLer, dataHoraLocal, aguardar, evidencia,
} from "../lib.mjs";

export async function aprovacao(estado) {
  const { nomeTorcida, slug, solicitacaoId, aparelho: A, pagina: p } = estado.dados.cadastro;
  const E = await novoAparelho(estado, "equipe");
  const e = await novaPagina(E);
  await e.goto(`${BASE}/plataforma`);
  await entrar(e, "equipe@somos.test");
  await e.getByRole("heading", { name: "Visão geral" }).waitFor({ timeout: 30_000 });
  await conferir(E, e, "equipe entrou na plataforma");
  await irNoMenu(e, "Solicitações");
  await e.getByRole("heading", { name: "Solicitações" }).waitFor();
  await e.getByRole("link", { name: new RegExp(nomeTorcida) }).click();
  await e.waitForURL(new RegExp(`/solicitacoes/${solicitacaoId}`));
  // Verificação em vídeo: sem ela não aprova; a equipe manda o link e registra a chamada feita
  const aprovarBtn = e.getByRole("button", { name: "Aprovar e criar torcida" });
  assert.equal(await aprovarBtn.isDisabled(), true, "aprovar exige a chamada de verificação");
  const quadro = e.locator("[data-verificacao-video]");
  await quadro.getByText("Marcada").waitFor({ timeout: 30_000 });
  await quadro.getByLabel(/Link da chamada/).fill("https://meet.google.com/abc-defg-hij");
  await quadro.getByRole("button", { name: "Enviar link" }).click();
  await e.getByText(/Link (enviado|salvo)/).first().waitFor({ timeout: 30_000 });
  // o diretor vê o link na página do cadastro, sem recarregar
  await p.getByRole("link", { name: "Entrar na chamada" }).waitFor({ timeout: 30_000 });
  await conferir(A, p, "cadastro mostrou o link da chamada");
  await quadro.getByRole("button", { name: "Chamada feita" }).click();
  const reg = e.getByRole("dialog", { name: "Registrar a chamada feita" });
  await reg.getByLabel("Onde ficou a gravação").fill("Drive › Verificações › teste-navegador.mp4");
  await reg.getByLabel(/Conferi o documento/).check();
  await reg.getByLabel(/Vi a sede ao vivo/).check();
  await reg.getByRole("button", { name: "Registrar" }).click();
  await reg.waitFor({ state: "detached", timeout: 30_000 });
  await quadro.getByText("Feita").waitFor({ timeout: 30_000 });
  await conferir(E, e, "equipe registrou a chamada de verificação");
  await aprovarBtn.click();
  await e.getByRole("dialog", { name: "Aprovar cadastro?" }).getByRole("button", { name: "Aprovar", exact: true }).click();
  await e.getByText("Torcida criada").waitFor({ timeout: 30_000 });
  await conferir(E, e, "equipe aprovou a solicitação");
  await fecharAparelho(E);

  // A tela do cadastro (aparelho do diretor) muda sozinha
  await p.getByRole("heading", { name: `${nomeTorcida} aprovada!` }).waitFor({ timeout: 30_000 });
  await conferir(A, p, "cadastro mostrou 'aprovada' sozinho");
  await p.getByRole("link", { name: "Entrar no painel da torcida" }).click();
  await p.waitForURL(new RegExp(`/${slug}/admin`));
  await p.getByRole("heading", { name: "Visão geral" }).waitFor({ timeout: 30_000 });
  await conferir(A, p, "diretoria nova entrou em /{slug}/admin");
  const membro = await aguardar(async () => {
    const t = await fsLer(`slugs/${slug}`);
    return t?.torcidaId ? t : null;
  }, { mensagem: "slug da torcida aprovada" });
  assert.ok(membro.torcidaId);
}

export async function diretoria(estado) {
  const { combo, tid } = estado;
  const sufixo = `${RODADA}${combo.modo === "normal" ? "n" : "c"}${combo.largura}`.toUpperCase();
  const nomePlano = `Sócio Navegador ${sufixo}`;
  const beneficios = [`Camisa oficial ${sufixo}`, "Desconto de sócio nos eventos", "Voto na assembleia"];
  const nomeEvento = `Caravana Navegador ${sufixo}`;

  // Preparação (não é passo de tela): o plano Torcida Plus da "brasil" permite 6 eventos à venda e a semente já
  // publica 5. Eventos que rodadas anteriores desta suíte deixaram à venda são encerrados antes de criar o novo.
  const publicados = await fsConsultar(`torcidas/${tid}`, "eventos", [["status", "==", "publicado"]]);
  for (const ev of publicados.filter((x) => String(x.nome).startsWith("Caravana Navegador"))) {
    await fsAtualizar(`torcidas/${tid}/eventos/${ev._id}`, { status: "encerrado" });
  }

  const D = await novoAparelho(estado, "diretoria-brasil");
  const d = await novaPagina(D);
  await d.goto(`${BASE}/brasil/admin`);
  await entrar(d, "diretoria@brasil.test");
  await d.getByRole("heading", { name: "Visão geral" }).waitFor({ timeout: 30_000 });
  await conferir(D, d, "diretoria entrou no painel");

  // ── Plano de sócio com benefícios ──
  await irNoMenu(d, "Planos de sócio");
  await d.getByRole("heading", { name: "Planos de sócio" }).waitFor();
  await conferir(D, d, "abriu Planos de sócio");
  await d.getByRole("button", { name: "Novo plano" }).first().click();
  const g = d.getByRole("dialog", { name: "Novo plano" });
  await g.getByLabel("Nome do plano").fill(nomePlano);
  await g.getByLabel("Descrição curta").fill("Plano criado pelo teste de navegador.");
  await g.getByLabel("Valor do plano").fill("2500");
  assert.equal(await g.getByLabel("Valor do plano").inputValue(), "25,00", "máscara de moeda");
  await g.getByLabel("Benefício 1").fill(beneficios[0]);
  for (let i = 1; i < beneficios.length; i++) {
    await g.getByRole("button", { name: "Adicionar benefício" }).click();
    await g.getByLabel(`Benefício ${i + 1}`).fill(beneficios[i]);
  }
  await g.getByRole("button", { name: "Criar plano" }).click();
  await d.getByText("Plano criado.").waitFor();
  await g.waitFor({ state: "detached" });
  for (const b of beneficios) await d.getByText(b, { exact: true }).first().waitFor();
  await conferir(D, d, "criou o plano com benefícios");
  const [plano] = await fsConsultar(`torcidas/${tid}`, "planos", [["nome", "==", nomePlano]]);
  assert.ok(plano, "plano gravado");
  assert.deepEqual(plano.beneficios, beneficios);
  assert.equal(plano.valor, 2500);

  // ── Evento: cria já publicado (grava rascunho e chama publicarEvento) ──
  await irNoMenu(d, "Eventos");
  await d.getByRole("heading", { name: "Eventos", exact: true }).waitFor();
  await d.getByRole("button", { name: "Novo evento" }).first().click();
  const f = d.getByRole("dialog", { name: "Novo evento" });
  await f.getByLabel("Nome do evento").fill(nomeEvento);
  await f.getByLabel("Descrição").fill("Saída da Sede Central. Evento criado pelo teste de navegador.");
  await f.getByLabel("Data e hora").fill(dataHoraLocal(10, 20));
  await f.getByLabel("Local").fill("Sede Central");
  await f.getByLabel("Valor para sócio").fill("2000");
  await f.getByLabel("Valor para o público").fill("3000");
  await f.getByLabel("Capacidade (opcional)").fill("80");
  await f.getByRole("button", { name: "Publicado", exact: true }).click();
  await f.getByRole("button", { name: "Publicar evento" }).click();
  await d.getByText("Evento publicado! Já está na página da torcida.").waitFor({ timeout: 30_000 });
  await conferir(D, d, "publicou o evento");
  const [evento] = await fsConsultar(`torcidas/${tid}`, "eventos", [["nome", "==", nomeEvento]]);
  assert.ok(evento, "evento gravado");
  assert.equal(evento.status, "publicado");
  assert.ok(evento.publicadoPor, "publicado pela ação publicarEvento (servidor grava publicadoPor)");
  assert.match(evento.codigo, /^[a-hjkmnp-z2-9]{6}$/);

  // ── Detalhe do evento: link direto e QR de divulgação ──
  await d.getByRole("link", { name: new RegExp(nomeEvento) }).first().click();
  await d.getByText("Link direto do evento").waitFor();
  const link = (await d.locator("code").filter({ hasText: "/brasil/e/" }).first().textContent()).trim();
  assert.equal(link, `${BASE}/brasil/e/${evento.codigo}`, "link direto com o código do evento");
  await d.getByRole("button", { name: "QR Code", exact: true }).click();
  const qr = d.getByRole("dialog", { name: "QR Code do evento" });
  await qr.locator('[role="img"][aria-label="QR Code"] svg').waitFor();
  await qr.getByText(link.replace(/^https?:\/\//, "")).waitFor();
  await conferir(D, d, "abriu o QR de divulgação");
  await d.keyboard.press("Escape");
  await qr.waitFor({ state: "detached" });

  // ── Página pública do evento (visitante, sem conta) ──
  const V = await novoAparelho(estado, "visitante");
  const v = await novaPagina(V);
  await v.goto(link);
  await v.getByRole("heading", { level: 1, name: nomeEvento }).waitFor({ timeout: 30_000 });
  await v.getByRole("heading", { name: "Comprar ingresso" }).waitFor();
  await v.getByText("R$ 30,00").first().waitFor();
  await conferir(V, v, "página pública do evento", { torcedor: true });
  // Calendário da torcida aponta para o link curto
  await v.goto(`${BASE}/brasil`);
  await v.locator(`a[href="/brasil/e/${evento.codigo}"]`).first().waitFor({ timeout: 30_000 });
  await conferir(V, v, "página da torcida com o evento novo", { torcedor: true });
  await fecharAparelho(V);
  await fecharAparelho(D);

  estado.dados.evento = { id: evento._id, codigo: evento.codigo, nome: nomeEvento, link };
  estado.dados.plano = { id: plano._id, nome: nomePlano, beneficios };
}

// Fluxo 8: diretoria cria a subsede e, na mesma tela, convida o responsável. O convidado abre o link do e-mail
// (/convite), vê o e-mail já preenchido com as cores da torcida, cria a senha e cai no painel da subsede, sem Sócios.
export async function conviteSubsede(estado) {
  const { combo, tid } = estado;
  const sufixo = `${RODADA}${combo.modo === "normal" ? "n" : "c"}${combo.largura}`.toLowerCase();
  const nomeSede = `Subsede Navegador ${sufixo.toUpperCase()}`;
  const email = `resp-${sufixo}@brasil.test`;

  const D = await novoAparelho(estado, "diretoria-sedes");
  const d = await novaPagina(D);
  await d.goto(`${BASE}/brasil/admin`);
  await entrar(d, "diretoria@brasil.test");
  await d.getByRole("heading", { name: "Visão geral" }).waitFor({ timeout: 30_000 });
  await irNoMenu(d, "Sedes");
  await d.getByRole("heading", { name: "Sedes", exact: true }).waitFor();
  await d.getByRole("button", { name: "Nova subsede" }).first().click();
  const g = d.getByRole("dialog", { name: "Nova subsede" });
  await g.getByLabel("Nome").fill(nomeSede);
  await g.getByRole("button", { name: "Salvar" }).click();
  // ao salvar, o convite do responsável abre direto (sem passar por "Usuários do painel")
  const m = d.getByRole("dialog", { name: `Convidar responsável · ${nomeSede}` });
  await m.waitFor({ timeout: 30_000 });
  await conferir(D, d, "criou a subsede e abriu o convite do responsável");
  await evidencia(D, d, "8-modal-convite");
  await m.getByLabel("Nome").fill(`Responsável ${sufixo}`);
  await m.getByLabel("E-mail").fill(email);
  await m.getByRole("button", { name: "Enviar convite" }).click();
  await d.getByRole("dialog", { name: "Convite enviado" }).waitFor({ timeout: 30_000 });
  await conferir(D, d, "convite enviado");
  await evidencia(D, d, "8-convite-enviado");
  await d.keyboard.press("Escape");
  await d.getByRole("dialog", { name: "Convite enviado" }).waitFor({ state: "detached" });
  await d.getByText(`(${email})`).waitFor(); // o cartão da subsede mostra o responsável e o "Reenviar convite"
  await evidencia(D, d, "8-sedes");
  await fecharAparelho(D);

  const [membro] = await fsConsultar(`torcidas/${tid}`, "membros", [["email", "==", email]]);
  assert.ok(membro, "membro da subsede gravado");
  assert.equal(membro.papel, "subsede");
  const { token } = await aguardar(() => fsLer(`_emulador/convite-${membro._id}`), { mensagem: "convite gravado pelo servidor" });

  // ── Convidado: abre o botão do e-mail, cria a senha e entra ──
  const C = await novoAparelho(estado, "convidado-subsede");
  const c = await novaPagina(C);
  await c.goto(`${BASE}/convite?c=${encodeURIComponent(token)}`);
  await c.getByRole("heading", { name: /você foi convidado!/ }).waitFor({ timeout: 30_000 });
  assert.equal(await c.getByLabel("E-mail").inputValue(), email, "e-mail já preenchido");
  await c.getByText(nomeSede).first().waitFor();
  await conferir(C, c, "página do convite");
  await evidencia(C, c, "8-pagina-convite");
  await c.getByLabel("Crie sua senha").fill("curta");
  await c.getByRole("button", { name: "Criar senha e entrar" }).click();
  await c.getByText("A senha precisa ter pelo menos 8 caracteres.").waitFor();
  await c.getByLabel("Crie sua senha").fill("SenhaDoConvite123");
  await c.getByRole("button", { name: "Criar senha e entrar" }).click();
  await c.waitForURL(/\/brasil\/admin/, { timeout: 30_000 });
  await c.getByRole("heading", { name: new RegExp(`Visão geral · ${nomeSede}`) }).waitFor({ timeout: 30_000 });
  await conferir(C, c, "convidado entrou no painel da subsede");
  await evidencia(C, c, "8-painel-subsede");

  // Menu da subsede: Recebimentos sim, Sócios / Planos / Domínio não
  const abrir = c.getByRole("button", { name: "Abrir menu" });
  const celular = await abrir.isVisible().catch(() => false);
  if (celular) await abrir.click();
  const menu = celular ? c.getByRole("dialog", { name: "Menu do painel" }) : c.getByRole("navigation", { name: "Menu" });
  await menu.getByRole("link", { name: /Recebimentos/ }).first().waitFor();
  for (const proibido of ["Sócios", "Planos de sócio", "Domínio", "Publicar site", "Personalizar página", "Plano Somos Organizada"]) {
    assert.equal(await menu.getByRole("link", { name: proibido, exact: true }).count(), 0, `subsede não vê "${proibido}"`);
  }
  if (celular) await c.keyboard.press("Escape");
  await c.goto(`${BASE}/brasil/admin/socios`);
  await c.waitForURL((u) => !u.pathname.endsWith("/socios"), { timeout: 30_000 }); // rota fechada para a subsede
  await conferir(C, c, "subsede sem Sócios");

  // O mesmo link não serve duas vezes
  await c.goto(`${BASE}/convite?c=${encodeURIComponent(token)}`);
  await c.getByRole("heading", { name: "Este convite já foi usado" }).waitFor({ timeout: 30_000 });
  await conferir(C, c, "convite usado não vale de novo");
  await fecharAparelho(C);
}
