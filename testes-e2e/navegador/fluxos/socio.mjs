// Fluxo 5: o torcedor do fluxo 4 vira sócio no Pix (plano criado no fluxo 3): carteirinha com QR e os benefícios
// do plano; sai, pede "Esqueci minha senha" pelo CPF, troca a senha pelo link do e-mail e entra pelo site da
// torcida com CPF + senha nova: carteirinha e ingressos.
// Fluxo 7b (pendente): sem internet, /socio e /conta recarregadas ainda mostram a carteirinha e o ingresso com QR.
import assert from "node:assert/strict";
import {
  BASE, novaPagina, conferir, comErrosEsperados, entrar, aguardar, fsLer, pagarPixNaPagarme, mascaraCpf,
  fsConsultar, ERROS_SEM_INTERNET, esperarServiceWorker, evidencia,
} from "../lib.mjs";
import { qrVisivel } from "./compra.mjs";

const QR = '[role="img"][aria-label="QR Code"] svg';
const NOVA_SENHA = "nova-senha-456";

/**
 * Carteirinha: o QR fica no verso. O verso existe no DOM mesmo com o cartão de frente (virada em 3D), então
 * "visível" não basta: toca em "Ver QR" e confere que o botão virou "Ver frente".
 */
async function qrDaCarteirinha(t) {
  const verQr = t.getByRole("button", { name: "Ver QR", exact: true });
  const verFrente = t.getByRole("button", { name: "Ver frente", exact: true });
  await verQr.or(verFrente).first().waitFor({ timeout: 30_000 });
  if (await verQr.isVisible()) await verQr.click();
  await verFrente.waitFor({ timeout: 10_000 });
  const qr = t.locator(`${QR} path`).first(); // QR desenhado, não só a moldura
  await qr.waitFor({ timeout: 20_000 });
  await t.locator(QR).first().scrollIntoViewIfNeeded();
}

export async function socio(estado) {
  const { tid } = estado;
  const plano = estado.dados.plano;
  const ev = estado.dados.evento;
  const { aparelho: T, pagina: t, nome, email, cpf, celular, doComprador, doAcompanhante } = estado.dados.compra;

  // ── Site da torcida → "Seja sócio" → plano criado pela diretoria ──
  await t.goto(`${BASE}/brasil`);
  await t.getByRole("tab", { name: /Seja sócio/ }).click();
  const cartaoPlano = t.locator(`a[href="/brasil/associar/${plano.id}"]`);
  await cartaoPlano.waitFor({ timeout: 30_000 });
  for (const b of plano.beneficios) await t.getByText(b, { exact: true }).first().waitFor();
  await conferir(T, t, "aba Seja sócio com o plano e os benefícios", { torcedor: true });
  await cartaoPlano.click();

  // ── Adesão: plano → dados → pagamento ──
  await t.getByRole("radio", { name: new RegExp(plano.nome) }).waitFor({ timeout: 30_000 });
  assert.equal(await t.getByRole("radio", { name: new RegExp(plano.nome) }).getAttribute("aria-checked"), "true", "plano do link já marcado");
  await conferir(T, t, "adesão: passo Plano", { torcedor: true });
  await t.getByRole("button", { name: "Continuar" }).click();
  await t.getByRole("heading", { name: "Dados pessoais" }).waitFor();
  assert.equal(await t.getByLabel("Nome completo").inputValue(), nome, "nome vem da conta");
  await t.getByLabel("CPF").fill(cpf);
  await t.getByLabel("Data de nascimento").fill("1995-05-20");
  await t.getByLabel("Celular (WhatsApp)").fill(celular);
  await t.getByLabel("CEP").fill("41820020");
  await aguardar(async () => (await t.getByLabel("Rua").inputValue()) === "Rua Edgar Santos", { mensagem: "endereço pelo CEP" });
  await t.getByLabel("Número").fill("120");
  assert.equal(await t.getByLabel("Estado").inputValue(), "BA");
  await conferir(T, t, "adesão: passo Seus dados", { torcedor: true });
  await t.reload();
  await t.getByRole("heading", { name: "Dados pessoais" }).waitFor({ timeout: 30_000 });
  assert.equal(await t.getByLabel("CPF").inputValue(), mascaraCpf(cpf), "recarregar mantém o passo e os dados");
  await t.getByRole("button", { name: "Ir para pagamento" }).click();
  await t.getByRole("radio", { name: /Pix/ }).waitFor();
  await conferir(T, t, "adesão: passo Pagamento", { torcedor: true });
  await t.getByLabel(/Li e aceito o estatuto/).check();
  await t.getByRole("button", { name: /^Gerar Pix/ }).click();
  await t.waitForURL(/\/brasil\/pedido\/[^/?#]+/, { timeout: 30_000 });
  const pedidoId = new URL(t.url()).pathname.split("/").pop();
  await t.getByText("Pague com Pix").waitFor({ timeout: 30_000 });
  await t.getByRole("heading", { name: "R$ 27,50" }).waitFor(); // R$ 25,00 + 10%
  await conferir(T, t, "Pix da mensalidade", { torcedor: true });
  await pagarPixNaPagarme(tid, pedidoId);
  await t.getByRole("button", { name: "Já paguei" }).click();
  await t.getByRole("heading", { name: "Pagamento confirmado!" }).waitFor({ timeout: 30_000 });
  await conferir(T, t, "mensalidade paga", { torcedor: true });
  await t.getByRole("link", { name: "Ver minha carteirinha" }).click();

  // ── Carteirinha com QR e os benefícios do plano ──
  await t.waitForURL(/\/brasil\/socio/);
  await t.getByRole("heading", { name: /^Olá, Torcedor/ }).waitFor({ timeout: 30_000 });
  await t.getByText("Sócio em dia").first().waitFor({ timeout: 30_000 });
  await qrDaCarteirinha(t);
  await t.getByText(plano.nome).first().waitFor();
  for (const b of plano.beneficios) await t.getByText(b, { exact: true }).first().waitFor();
  await conferir(T, t, "carteirinha com QR e benefícios", { torcedor: true });
  const ficha = await aguardar(async () => {
    const s = await fsLer(`torcidas/${tid}/socios/${(await fsLer(`torcidas/${tid}/cpfs/${cpf}`))?.uid}`);
    return s?.status === "ativo" ? s : null;
  }, { mensagem: "ficha de sócio ativa" });
  assert.equal(ficha.planoId, plano.id);

  // ── Sai e entra pelo site da torcida com CPF + senha: carteirinha e ingressos ──
  await sair(T, t);
  await t.goto(`${BASE}/brasil`);
  await t.getByRole("link", { name: "Entrar", exact: true }).click();
  await t.getByRole("heading", { name: "Minha conta" }).waitFor({ timeout: 30_000 });
  await conferir(T, t, "site da torcida → Entrar", { torcedor: true });
  await entrar(t, mascaraCpf(cpf));
  await t.waitForURL(/\/brasil\/socio/, { timeout: 30_000 });
  await qrDaCarteirinha(t);
  await conferir(T, t, "entrou com CPF e senha: carteirinha", { torcedor: true });
  await t.getByRole("link", { name: /^Ingressos/ }).click();
  const mostrar = t.getByRole("button", { name: `Mostrar ingresso de ${ev.nome} com o QR Code` });
  await aguardar(async () => (await mostrar.count()) === 2, { mensagem: "2 ingressos (fluxo 4) na aba Ingressos do sócio" });
  await mostrar.first().click();
  await t.locator(`[role="dialog"] ${QR}`).waitFor();
  const codigo = (await t.getByRole("dialog").getByRole("button", { name: "Copiar código" }).textContent()).trim();
  assert.ok([doComprador.codigo, doAcompanhante.codigo].includes(codigo), "QR aberto é de um ingresso do fluxo 4");
  await conferir(T, t, "aba Ingressos do sócio com QR", { torcedor: true });
  await t.keyboard.press("Escape");

  // ── Esqueci minha senha pelo CPF → link do nosso e-mail (/redefinir-senha) → senha nova pela tela ──
  await sair(T, t);
  const [antigo] = await fsConsultar("", "_emulador", [["email", "==", email]]);
  await t.getByLabel("CPF ou e-mail").fill(mascaraCpf(cpf));
  await t.getByRole("button", { name: "Esqueci minha senha" }).click();
  await t.getByText("Se este CPF tiver conta, enviamos o link para o e-mail cadastrado.", { exact: false }).waitFor({ timeout: 30_000 });
  await conferir(T, t, "esqueci minha senha pelo CPF", { torcedor: true });
  const link = await aguardar(async () => {
    const [d] = await fsConsultar("", "_emulador", [["email", "==", email]]);
    return d && d.codigo !== antigo?.codigo ? d : null;
  }, { mensagem: "link de nova senha gravado pelo servidor" });
  assert.equal(link.continuar, "/brasil/conta", "link do e-mail volta para a conta na torcida");
  const destino = new URL(link.url);
  await t.goto(`${BASE}${destino.pathname}${destino.search}`);
  await t.getByRole("heading", { name: "Crie uma nova senha" }).waitFor({ timeout: 30_000 });
  assert.equal(await t.getByLabel("E-mail").inputValue(), email, "a página mostra o e-mail da conta");
  await conferir(T, t, "página de nova senha", { torcedor: true });
  await t.getByLabel("Nova senha").fill(NOVA_SENHA);
  await t.getByRole("button", { name: "Salvar e entrar" }).click();
  await t.waitForURL(/\/brasil\/(conta|socio)/, { timeout: 30_000 });
  await t.getByRole("button", { name: "Menu da conta" }).waitFor({ timeout: 30_000 });
  await conferir(T, t, "salvou a senha nova e entrou", { torcedor: true });
  await sair(T, t);
  // senha antiga não entra mais (testada pelo e-mail, para não gastar as 5 tentativas por CPF a cada 15 min)
  await comErrosEsperados(T, [{ re: /status of 400.*accounts:signInWithPassword/, motivo: "senha antiga depois da troca: o Auth responde 400 (credencial inválida)" }], async () => {
    await entrar(t, email);
    await t.getByText("E-mail ou senha incorretos.").waitFor({ timeout: 30_000 });
  });
  await t.getByLabel("CPF ou e-mail").fill(mascaraCpf(cpf));
  await t.getByLabel("Senha", { exact: true }).fill(NOVA_SENHA);
  await t.getByRole("button", { name: "Entrar", exact: true }).click();
  await t.waitForURL(/\/brasil\/socio/, { timeout: 30_000 });
  await t.getByRole("link", { name: "Carteirinha", exact: true }).click(); // saiu na aba Ingressos: volta para a carteirinha
  await qrDaCarteirinha(t);
  await conferir(T, t, "entrou com CPF e a senha nova: carteirinha", { torcedor: true });
  estado.dados.compra.senha = NOVA_SENHA;
}

async function sair(T, t) {
  await t.getByRole("button", { name: "Menu da conta" }).click();
  await t.getByRole("menuitem", { name: "Sair" }).click();
  await t.getByRole("heading", { name: "Minha conta" }).waitFor({ timeout: 30_000 });
  await conferir(T, t, "saiu da conta", { torcedor: true });
}

/** Pendente: sem internet, carteirinha e ingresso continuam com QR depois de recarregar. */
export async function semInternetSocio(estado) {
  const { aparelho: T, pagina: t, doComprador, doAcompanhante } = estado.dados.compra;
  const ev = estado.dados.evento;
  const codigos = [doComprador.codigo, doAcompanhante.codigo];
  const mostrar = t.getByRole("button", { name: `Mostrar ingresso de ${ev.nome} com o QR Code` });
  // Com internet: carteirinha e ingressos abertos
  await t.goto(`${BASE}/brasil/socio`);
  await qrDaCarteirinha(t);
  await t.goto(`${BASE}/brasil/socio/ingressos`);
  await mostrar.first().waitFor({ timeout: 30_000 });
  await mostrar.first().click();
  await t.locator(`[role="dialog"] ${QR}`).waitFor();
  await t.keyboard.press("Escape");
  await conferir(T, t, "com internet: carteirinha e ingressos abertos", { torcedor: true });
  const sw = await esperarServiceWorker(t);

  await comErrosEsperados(T, ERROS_SEM_INTERNET, async () => {
    await T.ctx.setOffline(true);
    try {
      for (const [caminho, verificar] of [
        ["/brasil/socio", () => qrDaCarteirinha(t)],
        ["/brasil/conta", () => qrDaCarteirinha(t).catch(() => qrVisivel(t, mostrar, "sem internet: /brasil/conta", codigos))],
        ["/brasil/socio/ingressos", () => qrVisivel(t, mostrar, "sem internet: /brasil/socio/ingressos", codigos)],
      ]) {
        await t.goto(`${BASE}${caminho}`, { timeout: 20_000 }).catch((e) => {
          throw new Error(`Sem internet, abrir ${caminho} não carregou o site (${e.message.split("\n")[0]}; ${sw})`);
        });
        await verificar();
        await evidencia(T, t, `fluxo7b-sem-internet${caminho.replace(/\//g, "-")}`);
        await conferir(T, t, `sem internet: ${caminho} mostra o QR`, { torcedor: true });
        await t.keyboard.press("Escape");
      }
    } finally {
      await T.ctx.setOffline(false);
    }
  });
}
