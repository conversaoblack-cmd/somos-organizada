// Fluxo 4: torcedor que não é sócio abre o link do evento, compra 2 ingressos no Pix (cria a conta no checkout),
// paga (Pix simulado), vê os ingressos com QR no pedido e em /{torcida}/conta; e-mail de confirmação registrado e
// o link do e-mail leva para a conta (entrando com CPF e senha em outro aparelho).
// Fluxo 7a (pendente): sem internet, /{torcida}/conta recarregada ainda mostra o QR.
import assert from "node:assert/strict";
import {
  BASE, SENHA, RODADA, novoAparelho, fecharAparelho, novaPagina, conferir, comErrosEsperados, entrar, aguardar, fsLer,
  pagarPixNaPagarme, cpfAleatorio, celularAleatorio, mascaraCpf, ERROS_SEM_INTERNET, esperarServiceWorker, evidencia,
} from "../lib.mjs";

const QR = '[role="img"][aria-label="QR Code"] svg';

export async function compra(estado) {
  const { tid, combo } = estado;
  const ev = estado.dados.evento;
  const sufixo = `${RODADA}${combo.modo === "normal" ? "n" : "c"}${combo.largura}`;
  const nome = `Torcedor Navegador ${sufixo.toUpperCase()}`;
  const acompanhante = `Acompanhante Navegador ${sufixo.toUpperCase()}`;
  const email = `torcedor.${sufixo}@navegador.test`;
  const cpf = cpfAleatorio();
  const cpfAcomp = cpfAleatorio();
  const celular = celularAleatorio();

  const T = await novoAparelho(estado, "torcedor");
  const t = await novaPagina(T);
  await t.goto(ev.link);
  await t.getByRole("heading", { level: 1, name: ev.nome }).waitFor({ timeout: 30_000 });
  const caixa = t.locator("#comprar");
  await caixa.getByRole("button", { name: "Continuar" }).waitFor({ timeout: 30_000 });
  await conferir(T, t, "abriu o link do evento", { torcedor: true });

  // ── Passo 1: quantidade ──
  await caixa.getByRole("group", { name: "Quantidade de ingressos" }).getByRole("button", { name: "Aumentar" }).click();
  await caixa.getByText("Ingresso 2 · Público").waitFor();
  await caixa.getByText("R$ 66,00").waitFor(); // 2 × R$ 30,00 + 10% de taxa
  await caixa.getByRole("button", { name: "Continuar" }).click();

  // ── Passo 2: titulares e quem compra (cria a conta) ──
  await caixa.getByLabel("Nome completo do titular").first().waitFor();
  await conferir(T, t, "passo Titulares", { torcedor: true });
  await caixa.getByLabel("Nome completo do titular").nth(0).fill(nome);
  await caixa.getByLabel("CPF do titular").nth(0).fill(cpf);
  await caixa.getByLabel("Nome completo do titular").nth(1).fill(acompanhante);
  await caixa.getByLabel("CPF do titular").nth(1).fill(cpfAcomp);
  await caixa.getByRole("button", { name: "Usar os dados do ingresso 1" }).click();
  assert.equal(await caixa.getByLabel("Nome", { exact: true }).inputValue(), nome);
  await caixa.getByLabel("E-mail").fill(email);
  await caixa.getByLabel("Celular (WhatsApp)").fill(celular);
  await caixa.getByLabel("Crie uma senha").fill(SENHA);
  await caixa.getByRole("button", { name: "Ir para pagamento" }).click();

  // ── Passo 3: Pix ──
  await caixa.getByRole("radio", { name: /Pix/ }).waitFor({ timeout: 30_000 });
  assert.equal(await caixa.getByRole("radio", { name: /Pix/ }).getAttribute("aria-checked"), "true", "Pix vem marcado");
  await conferir(T, t, "passo Pagamento", { torcedor: true });
  await caixa.getByRole("button", { name: /^Gerar Pix/ }).click();
  await t.waitForURL(/\/brasil\/pedido\/[^/?#]+/, { timeout: 30_000 });
  const pedidoId = new URL(t.url()).pathname.split("/").pop();
  await t.getByText("Pague com Pix").waitFor({ timeout: 30_000 });
  await t.locator(QR).first().waitFor();
  await t.getByRole("heading", { name: "R$ 66,00" }).waitFor();
  await conferir(T, t, "tela do Pix", { torcedor: true });
  await t.reload();
  await t.getByText("Pague com Pix").waitFor({ timeout: 30_000 });
  await conferir(T, t, "recarregou a tela do Pix", { torcedor: true });

  // ── O cliente paga no banco (Pagar.me simulada) e toca em "Já paguei" ──
  await pagarPixNaPagarme(tid, pedidoId);
  await t.getByRole("button", { name: "Já paguei" }).click();
  await t.getByRole("heading", { name: "Pagamento confirmado!" }).waitFor({ timeout: 30_000 });
  const bilhetes = t.locator("article").filter({ has: t.locator(QR) });
  await aguardar(async () => (await bilhetes.count()) === 2, { mensagem: "2 ingressos com QR no pedido" });
  const codigosTela = (await t.locator("article p.font-mono").allTextContents()).map((s) => s.trim());
  await conferir(T, t, "pedido pago mostra os ingressos com QR", { torcedor: true });

  const pedido = await fsLer(`torcidas/${tid}/pedidos/${pedidoId}`);
  assert.equal(pedido.status, "pago");
  const ingressos = [];
  for (const id of pedido.ingressoIds) ingressos.push({ id, ...(await fsLer(`torcidas/${tid}/ingressos/${id}`)) });
  assert.deepEqual(new Set(codigosTela), new Set(ingressos.map((i) => i.codigo)), "códigos na tela = códigos emitidos");
  const doComprador = ingressos.find((i) => i.titularCpf === cpf);
  const doAcompanhante = ingressos.find((i) => i.titularCpf === cpfAcomp);
  assert.ok(doComprador && doAcompanhante, "um ingresso para cada titular");

  // ── Conta do torcedor (/brasil/conta) pelo botão do topo ──
  await t.getByRole("link", { name: "Minha conta" }).click();
  await t.waitForURL(/\/brasil\/conta/);
  await t.getByRole("heading", { name: "Meus ingressos" }).waitFor({ timeout: 30_000 });
  const mostrar = t.getByRole("button", { name: `Mostrar ingresso de ${ev.nome} com o QR Code` });
  await aguardar(async () => (await mostrar.count()) === 2, { mensagem: "2 ingressos em /conta" });
  await conferir(T, t, "/conta lista os ingressos", { torcedor: true });
  await mostrar.first().click();
  const modal = t.getByRole("dialog", { name: `Ingresso: ${ev.nome}` });
  await modal.locator(QR).waitFor();
  const codigoModal = (await modal.getByRole("button", { name: "Copiar código" }).textContent()).trim();
  assert.ok(ingressos.some((i) => i.codigo === codigoModal), "código do modal é de um ingresso do pedido");
  await conferir(T, t, "/conta abre o ingresso com QR", { torcedor: true });
  await t.keyboard.press("Escape");
  await modal.waitFor({ state: "detached" });

  // ── E-mail de confirmação (no emulador não sai: fica registrado como "sem_provedor") ──
  const registro = await aguardar(async () => {
    const r = await fsLer(`torcidas/${tid}/emails/ingresso-${pedidoId}`);
    return r?.status && r.status !== "enviando" ? r : null;
  }, { mensagem: "registro do e-mail de confirmação da compra" });
  assert.equal(registro.para, email);
  assert.equal(registro.status, "sem_provedor");
  assert.match(registro.assunto, new RegExp(`Ingresso confirmado: ${ev.nome}`));

  // ── O botão do e-mail aponta para /{torcida}/conta/ingressos (functions/src/email/avisos.ts): abre em outro aparelho ──
  const E = await novoAparelho(estado, "torcedor-email");
  const e = await novaPagina(E);
  await e.goto(`${BASE}/brasil/conta/ingressos`);
  await e.getByRole("heading", { name: "Minha conta" }).waitFor({ timeout: 30_000 });
  await conferir(E, e, "link do e-mail abriu o login da conta", { torcedor: true });
  await entrar(e, mascaraCpf(cpf));
  await e.getByRole("heading", { name: "Meus ingressos" }).waitFor({ timeout: 30_000 });
  await aguardar(async () => (await e.getByRole("button", { name: `Mostrar ingresso de ${ev.nome} com o QR Code` }).count()) === 2, {
    mensagem: "ingressos na conta aberta pelo link do e-mail",
  });
  await conferir(E, e, "entrou com CPF e senha e viu os ingressos", { torcedor: true });
  await fecharAparelho(E);

  estado.dados.compra = { aparelho: T, pagina: t, nome, email, cpf, celular, pedidoId, doComprador, doAcompanhante };
}

/** Pendente: sem internet, a conta recarregada precisa continuar mostrando o QR do ingresso. */
export async function semInternetConta(estado) {
  const { aparelho: T, pagina: t } = estado.dados.compra;
  const ev = estado.dados.evento;
  const mostrar = t.getByRole("button", { name: `Mostrar ingresso de ${ev.nome} com o QR Code` });
  // Com internet: abre a conta e o ingresso (é quando o aparelho guarda o que precisa)
  await t.goto(`${BASE}/brasil/conta`);
  await mostrar.first().waitFor({ timeout: 30_000 });
  await mostrar.first().click();
  await t.locator(`[role="dialog"] ${QR}`).waitFor();
  await t.keyboard.press("Escape");
  await conferir(T, t, "com internet: conta e ingresso abertos", { torcedor: true });
  const sw = await esperarServiceWorker(t);

  await comErrosEsperados(T, ERROS_SEM_INTERNET, async () => {
    await T.ctx.setOffline(true);
    try {
      await t.reload({ timeout: 20_000 }).catch((e) => {
        throw new Error(`Sem internet, recarregar /brasil/conta não abriu o site (${e.message.split("\n")[0]}; ${sw})`);
      });
      const { doComprador, doAcompanhante } = estado.dados.compra;
      await qrVisivel(t, mostrar, "sem internet: /brasil/conta", [doComprador.codigo, doAcompanhante.codigo]);
      await evidencia(T, t, "fluxo7a-sem-internet-conta");
      await conferir(T, t, "sem internet: /conta mostra o QR", { torcedor: true });
    } finally {
      await T.ctx.setOffline(false);
    }
  });
  await t.goto(`${BASE}/brasil/conta`);
  await mostrar.first().waitFor({ timeout: 30_000 });
}

/**
 * O QR aparece direto na tela ou depois de tocar em "Mostrar ingresso (QR)". Nunca a tela de erro.
 * Com `codigos`, confere que o ingresso mostrado é um desses (o código fica junto do QR).
 */
export async function qrVisivel(t, botao, onde, codigos) {
  const qr = t.locator(QR).first();
  const achou = await Promise.race([
    qr.waitFor({ timeout: 20_000 }).then(() => "qr"),
    botao.first().waitFor({ timeout: 20_000 }).then(() => "botao"),
  ]).catch(() => null);
  if (!achou) {
    const texto = (await t.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`${onde}: nenhum QR nem ingresso na tela. A tela mostra: "${texto}"`);
  }
  if (achou === "botao" && !(await qr.isVisible())) {
    await botao.first().click();
    await t.locator(`[role="dialog"] ${QR}`).waitFor({ timeout: 10_000 });
  }
  await t.locator(`${QR} path`).first().waitFor({ timeout: 5_000 });
  if (codigos) {
    const texto = await t.locator("body").innerText();
    if (!codigos.some((c) => texto.includes(c))) throw new Error(`${onde}: o QR apareceu, mas sem o código de um dos ingressos (${codigos.join(", ")})`);
  }
}
