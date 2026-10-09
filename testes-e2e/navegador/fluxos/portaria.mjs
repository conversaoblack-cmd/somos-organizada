// Fluxo 6: portaria escolhe o evento do fluxo 3 e valida o ingresso do acompanhante comprado no fluxo 4:
// código digitado → "Liberado"; o mesmo ingresso pelo conteúdo do QR → "Já utilizado"; código que não existe e
// QR forjado → recusados; sem internet → "Sem conexão" (nunca "Inválido").
import assert from "node:assert/strict";
import { BASE, novoAparelho, fecharAparelho, novaPagina, conferir, comErrosEsperados, entrar, fsLer, ERROS_SEM_INTERNET } from "../lib.mjs";

export async function portaria(estado) {
  const { tid } = estado;
  const ev = estado.dados.evento;
  const { doComprador, doAcompanhante } = estado.dados.compra;

  const P = await novoAparelho(estado, "portaria");
  const p = await novaPagina(P);
  await p.goto(`${BASE}/brasil/portaria`);
  await entrar(p, "portaria@brasil.test");
  await p.getByRole("heading", { name: "Qual evento?" }).waitFor({ timeout: 30_000 });
  await conferir(P, p, "portaria: lista de eventos", { torcedor: true });
  await p.getByRole("button", { name: new RegExp(ev.nome) }).click();
  await p.getByText("Liberei agora").waitFor({ timeout: 30_000 });
  const comecar = p.getByRole("button", { name: /Toque para começar/ });
  if (await comecar.isVisible()) await comecar.click();
  await p.getByRole("tab", { name: /Digitar CPF/ }).click();
  await p.locator("#entrada-manual").waitFor();
  await conferir(P, p, "portaria: leitor do evento", { torcedor: true });

  const resultado = p.getByRole("alertdialog");
  async function validar(texto) {
    await p.locator("#entrada-manual").fill(texto);
    await p.getByRole("button", { name: "Validar entrada" }).click();
    await resultado.waitFor({ timeout: 30_000 });
    return (await resultado.locator("h2").textContent()).trim();
  }
  async function proximo() {
    await resultado.getByRole("button", { name: /Próximo/ }).click();
    await resultado.waitFor({ state: "detached" });
  }

  // 1) código digitado
  assert.equal(await validar(doAcompanhante.codigo), "Liberado", "código do ingresso válido libera");
  await resultado.getByText(doAcompanhante.titularNome).waitFor();
  await conferir(P, p, "portaria: liberado pelo código", { torcedor: true });
  await proximo();
  const usado = await fsLer(`torcidas/${tid}/ingressos/${doAcompanhante.id}`);
  assert.equal(usado.status, "usado");

  // 2) o mesmo ingresso pelo conteúdo do QR (o campo aceita o QR colado)
  assert.equal(await validar(doAcompanhante.qr), "Já utilizado", "segunda leitura (QR) acusa uso");
  await conferir(P, p, "portaria: já utilizado pelo QR", { torcedor: true });
  await proximo();

  // 3) código que não existe e QR forjado: recusados
  const naoExiste = await validar("ZZZZ-ZZZZ");
  assert.ok(["Não encontrado", "Inválido"].includes(naoExiste), `código inexistente recusado (veio "${naoExiste}")`);
  await proximo();
  const forjado = doAcompanhante.qr.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  assert.equal(await validar(forjado), "Inválido", "QR com assinatura alterada é inválido");
  await conferir(P, p, "portaria: recusados", { torcedor: true });
  await proximo();

  // 4) sem internet: ingresso válido (do comprador) → "Sem conexão", nunca "Inválido"
  await comErrosEsperados(P, ERROS_SEM_INTERNET, async () => {
    await P.ctx.setOffline(true);
    try {
      assert.equal(await validar(doComprador.codigo), "Sem conexão", "sem internet não é ingresso inválido");
      await resultado.getByRole("button", { name: "Tentar de novo" }).click();
      await resultado.locator("h2", { hasText: "Sem conexão" }).waitFor({ timeout: 30_000 });
      await conferir(P, p, "portaria: sem conexão", { torcedor: true });
      await proximo();
    } finally {
      await P.ctx.setOffline(false);
    }
  });
  const intacto = await fsLer(`torcidas/${tid}/ingressos/${doComprador.id}`);
  assert.equal(intacto.status, "valido", "a tentativa sem internet não gastou o ingresso");
  await fecharAparelho(P);
}
