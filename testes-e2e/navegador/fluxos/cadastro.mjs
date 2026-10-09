// Fluxo 1: cadastro de diretoria pela página principal, do "Criar conta" até marcar a chamada de verificação em vídeo e
// chegar em "Cadastro em análise".
// Inclui: recarregar em cada passo volta no mesmo passo; outro navegador com o mesmo e-mail continua de onde
// parou; "Entrar" com cadastro em andamento oferece continuar.
import assert from "node:assert/strict";
import {
  BASE, SENHA, RODADA, novoAparelho, fecharAparelho, novaPagina, conferir, comErrosEsperados, entrar, esperar,
  novoCodigoOob, cpfAleatorio, celularAleatorio, mascaraCpf, fsConsultar, aguardar,
} from "../lib.mjs";

const passoAtual = (p) => p.locator('[aria-label="Etapas"] li[aria-current="step"]').innerText().catch(() => "");

/** Espera a tela do passo pelo título (h1) e confere que nada quebrou. */
async function noPasso(ap, p, titulo, contexto) {
  await p.getByRole("heading", { name: titulo, exact: true }).waitFor({ timeout: 30_000 });
  await conferir(ap, p, contexto);
}

/** Recarrega e confere que voltou no mesmo passo. O rascunho da conta é gravado 0,7 s depois da última mudança. */
async function recarregarNoPasso(ap, p, titulo) {
  await esperar(1500);
  await p.reload();
  await noPasso(ap, p, titulo, `recarregou no passo "${titulo}"`);
}

export async function cadastro(estado) {
  const { combo } = estado;
  const sufixo = `${RODADA}${combo.modo === "normal" ? "n" : "c"}${combo.largura}`;
  const email = `diretor.${sufixo}@navegador.test`;
  const nomeTorcida = `Torcida Navegador ${sufixo.toUpperCase()}`;
  const slug = `torcida-navegador-${sufixo}`;
  const cpf = cpfAleatorio();
  const celular = celularAleatorio();
  // Os dois tipos de entidade vão para a equipe aprovar: modo normal envia com CNPJ, chrome-novo sem CNPJ
  const enviaComCnpj = combo.modo === "normal";
  estado.dados.cadastro = { email, nomeTorcida, slug };

  // ── Aparelho A: cria a conta ──
  const A = await novoAparelho(estado, "diretor-A");
  const a = await novaPagina(A);
  await a.goto(`${BASE}/cadastro`);
  await a.getByRole("heading", { name: "Cadastre sua torcida" }).waitFor();
  await conferir(A, a, "abriu /cadastro");
  await a.getByLabel("Seu nome completo").fill("Diretor Navegador Teste");
  await a.getByLabel("E-mail").fill(email);
  await a.getByLabel("Crie uma senha").fill(SENHA);
  await a.getByRole("button", { name: "Criar conta e continuar" }).click();
  await noPasso(A, a, "Confirme seu e-mail", "criou a conta");
  await a.getByText(email).first().waitFor();
  await recarregarNoPasso(A, a, "Confirme seu e-mail");

  // ── Confirma o e-mail: abre o link do e-mail (/verificar) numa aba nova, como a pessoa faria ──
  const codigo = await novoCodigoOob(email, "VERIFY_EMAIL");
  const v = await novaPagina(A);
  await v.goto(`${BASE}/verificar?oobCode=${encodeURIComponent(codigo.oobCode)}&continuar=${encodeURIComponent("/cadastro")}`);
  await v.getByRole("heading", { name: "E-mail confirmado!" }).waitFor({ timeout: 30_000 });
  await noPasso(A, v, "Sua torcida", "/verificar continuou o cadastro na mesma aba");
  // A aba onde a pessoa começou segue sozinha
  await a.getByRole("heading", { name: "Sua torcida", exact: true }).waitFor({ timeout: 20_000 });
  await conferir(A, a, "aba original seguiu sozinha depois da confirmação");
  await a.close();
  const p = v;

  // ── Passo Torcida: nome, endereço e cores (paleta e seletor de cor) ──
  await p.getByLabel("Nome da torcida").fill(nomeTorcida);
  await p.getByText(`Disponível: somosorganizada.com.br/${slug}`).waitFor({ timeout: 20_000 });
  assert.equal(await p.locator("#cad-slug").inputValue(), slug, "endereço gerado a partir do nome");
  await p.getByRole("button", { name: "Rubro-negro" }).click();
  assert.equal(await p.getByRole("button", { name: "Rubro-negro" }).getAttribute("aria-pressed"), "true", "paleta marcada");
  // Seletor de cor livre: cor principal e secundária
  await p.getByLabel(/^Cor principal/).fill("#c81e3c");
  await p.getByLabel(/^Cor secundária/).fill("#ffcc00");
  await p.getByText("#C81E3C").waitFor();
  await p.getByText("#FFCC00").waitFor();
  assert.equal(await p.getByRole("button", { name: "Rubro-negro" }).getAttribute("aria-pressed"), "false", "cor própria desmarca a paleta");
  await p.getByRole("button", { name: "Fundo claro" }).click();
  await p.getByLabel("Sócios (estimativa)").fill("450");
  await p.getByLabel("Subsedes").fill("3");
  await conferir(A, p, "preencheu o passo Torcida");
  await recarregarNoPasso(A, p, "Sua torcida");
  assert.equal(await p.getByLabel("Nome da torcida").inputValue(), nomeTorcida, "nome da torcida mantido ao recarregar");
  await p.getByText("#C81E3C").waitFor();
  assert.equal(await p.getByRole("button", { name: "Fundo claro" }).getAttribute("aria-pressed"), "true", "fundo claro mantido ao recarregar");
  await p.getByRole("button", { name: "Continuar" }).click();

  // ── Passo Pessoa ──
  await noPasso(A, p, "Responsável", "avançou para o passo Pessoa (troca de passo rola a tela)");
  assert.equal(await p.getByLabel("Nome completo").inputValue(), "Diretor Navegador Teste", "nome vem da conta");
  await p.getByLabel("CPF").fill(cpf);
  await p.getByLabel("Celular (WhatsApp)").fill(celular);
  await p.getByLabel("Cargo na torcida").fill("Presidente");
  await recarregarNoPasso(A, p, "Responsável");
  assert.equal(await p.getByLabel("CPF").inputValue(), mascaraCpf(cpf), "CPF mantido ao recarregar");
  assert.equal(await p.getByLabel("Cargo na torcida").inputValue(), "Presidente");
  await p.getByRole("button", { name: "Continuar" }).click();

  // ── Passo Entidade: primeiro com CNPJ (inválido e depois válido), endereço pelo CEP ──
  await noPasso(A, p, "Entidade e endereço", "avançou para o passo Entidade");
  await p.getByRole("radio", { name: /Tem CNPJ/ }).click();
  await p.getByLabel("CNPJ", { exact: true }).fill("11.222.333/0001-00");
  await p.getByLabel("Razão social").fill("Associação Torcida Navegador");
  await p.getByLabel("CEP").fill("40050000");
  await aguardar(async () => (await p.getByLabel("Rua / avenida").inputValue()) === "Avenida Sete de Setembro", { mensagem: "endereço preenchido pelo CEP" });
  assert.equal(await p.getByLabel("Cidade").inputValue(), "Salvador");
  await p.getByLabel("Número").fill("123");
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.getByText("CNPJ inválido.").waitFor();
  await p.getByLabel("CNPJ", { exact: true }).fill("11222333000181");
  await recarregarNoPasso(A, p, "Entidade e endereço");
  assert.equal(await p.getByLabel("Número").inputValue(), "123", "número mantido ao recarregar");
  assert.equal(await p.getByLabel("CNPJ", { exact: true }).inputValue(), "11.222.333/0001-81", "CNPJ mantido ao recarregar");
  await esperar(1500); // rascunho na conta (vale para o outro navegador)

  // ── Outro navegador, limpo: tenta criar conta com o mesmo e-mail → "Continuar meu cadastro" ──
  const B = await novoAparelho(estado, "diretor-B");
  const b = await novaPagina(B);
  await b.goto(`${BASE}/cadastro`);
  await b.getByLabel("Seu nome completo").fill("Diretor Navegador Teste");
  await b.getByLabel("E-mail").fill(email);
  await b.getByLabel("Crie uma senha").fill("outra-senha-123");
  await comErrosEsperados(B, [{ re: /status of 400.*accounts:signUp/, motivo: "criar conta com e-mail que já existe: o Auth responde 400 EMAIL_EXISTS e a tela oferece continuar" }], async () => {
    await b.getByRole("button", { name: "Criar conta e continuar" }).click();
    await b.getByRole("heading", { name: "Continuar meu cadastro" }).waitFor();
  });
  assert.equal(await b.getByLabel("E-mail").inputValue(), email, "e-mail já preenchido");
  await conferir(B, b, "e-mail existente oferece continuar o cadastro");
  await entrar(b, email);
  await noPasso(B, b, "Entidade e endereço", "outro navegador continuou no mesmo passo");
  assert.equal(await b.getByLabel("Número").inputValue(), "123", "outro navegador: número preenchido");
  assert.equal(await b.getByLabel("Razão social").inputValue(), "Associação Torcida Navegador");
  await b.getByRole("button", { name: "Voltar" }).click();
  await noPasso(B, b, "Responsável", "outro navegador voltou ao passo Pessoa");
  assert.equal(await b.getByLabel("CPF").inputValue(), mascaraCpf(cpf), "outro navegador: CPF veio da conta");
  await b.getByRole("button", { name: "Continuar" }).click();
  await noPasso(B, b, "Entidade e endereço", "outro navegador avançou de novo");
  await esperar(1500);
  await fecharAparelho(B);

  // ── "Entrar" (página do painel) com cadastro em andamento oferece continuar ──
  const C = await novoAparelho(estado, "diretor-C");
  const c = await novaPagina(C);
  await c.goto(`${BASE}/entrar`);
  await c.getByRole("button", { name: "Não lembro o endereço: entrar com e-mail" }).click();
  await entrar(c, email);
  await c.getByRole("link", { name: /Continuar o cadastro da minha torcida/ }).click();
  await noPasso(C, c, "Entidade e endereço", "/entrar → continuar cadastro voltou no mesmo passo");
  assert.equal(await c.getByLabel("Número").inputValue(), "123");
  await fecharAparelho(C);

  // ── Revisão (no aparelho A): com CNPJ; depois edita a entidade e, no chrome-novo, troca para sem CNPJ ──
  await p.reload();
  await noPasso(A, p, "Entidade e endereço", "aparelho A recarregou");
  await p.getByRole("button", { name: "Continuar" }).click();
  await noPasso(A, p, "Revise e envie", "avançou para a Revisão");
  await p.getByText("11.222.333/0001-81 · Associação Torcida Navegador").waitFor();
  await recarregarNoPasso(A, p, "Revise e envie");
  if (!enviaComCnpj) {
    await p.getByRole("button", { name: "Editar entidade e endereço" }).click();
    await noPasso(A, p, "Entidade e endereço", "Editar entidade volta ao passo");
    await p.getByRole("radio", { name: /Ainda sem CNPJ/ }).click();
    assert.equal(await p.getByLabel("CNPJ", { exact: true }).count(), 0, "sem CNPJ esconde o campo");
    await p.getByRole("button", { name: "Continuar" }).click();
    await noPasso(A, p, "Revise e envie", "voltou para a Revisão sem CNPJ");
    await p.getByText("Ainda sem CNPJ").waitFor();
  }
  const enviar = p.getByRole("button", { name: "Enviar e marcar a chamada" });
  assert.equal(await enviar.isDisabled(), true, "enviar exige a declaração");
  await p.getByLabel(/Declaro que represento esta torcida/).check();
  await enviar.click();
  // Último passo: chamada de verificação em vídeo (dados de torcida são públicos; confirma quem é o responsável)
  const tituloVideo = p.getByRole("heading", { name: "Último passo: chamada de verificação" });
  await tituloVideo.waitFor({ timeout: 30_000 });
  await conferir(A, p, "chegou na verificação em vídeo");
  await p.reload();
  await tituloVideo.waitFor({ timeout: 30_000 });
  await conferir(A, p, "recarregou e voltou para a verificação em vídeo");
  await p.getByRole("radiogroup", { name: "Horário da chamada" }).getByRole("radio").first().waitFor({ timeout: 30_000 });
  const segundoDia = p.getByRole("radiogroup", { name: "Dia da chamada" }).getByRole("radio").nth(1);
  if (await segundoDia.count()) await segundoDia.click();
  await p.getByRole("radiogroup", { name: "Horário da chamada" }).getByRole("radio").first().click();
  await p.getByRole("button", { name: /^Confirmar / }).click();
  await p.getByRole("heading", { name: "Cadastro em análise" }).waitFor({ timeout: 30_000 });
  await p.getByText("Chamada de verificação marcada").waitFor();
  await conferir(A, p, "marcou a chamada e foi para análise");
  await p.getByText(`somosorganizada.com.br/${slug}`).waitFor();
  await p.reload();
  await p.getByRole("heading", { name: "Cadastro em análise" }).waitFor({ timeout: 30_000 });
  await conferir(A, p, "recarregou em Em análise");

  const [sol] = await fsConsultar("", "solicitacoes", [["slug", "==", slug]]);
  assert.ok(sol, "solicitação gravada");
  assert.equal(sol.status, "pendente");
  assert.equal(sol.entidade?.tipo, enviaComCnpj ? "cnpj" : "sem_cnpj");
  assert.equal(sol.tema?.corPrimaria, "#C81E3C");
  assert.equal(sol.verificacao?.status, "agendada", "chamada de verificação marcada");
  assert.ok(sol.verificacao?.horarioId, "horário reservado");
  estado.dados.cadastro.solicitacaoId = sol._id;
  estado.dados.cadastro.aparelho = A;
  estado.dados.cadastro.pagina = p;
  return { passo: await passoAtual(p) };
}
