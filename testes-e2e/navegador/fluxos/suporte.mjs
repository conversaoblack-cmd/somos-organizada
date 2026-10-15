// Fluxo S: suporte com anexos, pela tela, com duas contas (diretoria e equipe), como na vida real.
// - Diretoria cola um print no robô → o robô leva o print para um chamado novo; anexa um PDF pelo "+" e grava um
//   áudio (microfone falso do Chromium); envia e vê "Enviada".
// - Equipe abre o chamado na plataforma: vê os anexos; a diretoria passa a ver "Vista pela equipe" e
//   "A equipe está lendo esta conversa agora". A equipe responde com uma foto e a diretoria recebe.
// - Cada mensagem gera o seu aviso para a equipe (plataforma/notificacoes/ultimos/suporte-{chamado}-{mensagem}).
// - O botão "Copiar código Pix" dos e-mails abre /pix: QR, valor e cópia com um toque; código quebrado é recusado.
// Usa a torcida de demonstração "brasil" (semear.mjs).
import { BASE, novoAparelho, fecharAparelho, novaPagina, conferir, entrar, aguardar, fsConsultar, fsLer } from "../lib.mjs";

// PNG 1×1 de verdade (o site reduz a foto antes de enviar: precisa ser imagem que o navegador lê)
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export async function suporte(estado) {
  const assunto = `Anexos ${estado.combo.id} ${Date.now().toString(36)}`;

  // ── Diretoria ──
  const dir = await novoAparelho(estado, "suporte-diretoria");
  await dir.ctx.grantPermissions(["microphone"], { origin: BASE });
  const p = await novaPagina(dir);
  await p.goto(`${BASE}/brasil/admin`);
  await entrar(p, "diretoria@brasil.test");
  await p.locator("[data-botao-ajuda]").click();
  const chat = p.getByRole("dialog", { name: /Ajuda/ });
  await chat.waitFor();

  // robô: colar print (Ctrl+V / "Colar" no celular)
  const pergunta = chat.getByLabel("Sua pergunta");
  await pergunta.evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "print.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG_B64);
  await chat.locator("[data-anexos-pendentes] li").first().waitFor({ timeout: 5_000 }).catch(() => {
    throw new Error(`[${dir.rotulo}] colar o print no robô não virou anexo`);
  });
  await pergunta.fill("Veja o print da tela");
  await chat.getByRole("button", { name: "Enviar para a equipe" }).click();

  // novo chamado: o print veio junto; + PDF pelo "+", + áudio gravado
  const novo = p.getByRole("dialog", { name: /Falar com a equipe/ });
  await novo.locator("#sup-assunto").waitFor();
  if ((await novo.locator("[data-anexos-pendentes] li").count()) !== 1) throw new Error(`[${dir.rotulo}] o print do robô não chegou ao novo chamado`);
  if ((await novo.locator("#sup-msg").inputValue()) !== "Veja o print da tela") throw new Error(`[${dir.rotulo}] o texto do robô não chegou ao novo chamado`);
  await novo.locator("#sup-assunto").fill(assunto);
  await novo.locator('input[type="file"]').setInputFiles({ name: "comprovante.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") });
  await novo.getByRole("button", { name: "Gravar áudio" }).click();
  await novo.locator("[data-gravando]").waitFor({ timeout: 10_000 });
  await p.waitForTimeout(1_500);
  await novo.getByRole("button", { name: "Parar e anexar o áudio" }).click();
  await aguardar(async () => (await novo.locator("[data-anexos-pendentes] li").count()) === 3, { mensagem: "3 anexos (print, PDF, áudio) no novo chamado", tempo: 10_000 });
  await conferir(dir, p, "novo chamado com 3 anexos");
  await novo.getByRole("button", { name: "Enviar para a equipe" }).click();

  // conversa: anexos na mensagem e "Enviada"
  const conversa = p.getByRole("dialog", { name: /Chamado/ });
  await conversa.locator("[data-anexos-mensagem]").first().waitFor({ timeout: 30_000 });
  await aguardar(async () => (await conversa.locator("[data-anexos-mensagem] img").count()) >= 1 && (await conversa.locator("[data-audio-suporte]").count()) >= 1, {
    mensagem: "foto e áudio na conversa da diretoria",
  });
  await aguardar(async () => /Enviada/.test((await conversa.locator("[data-situacao-envio]").textContent().catch(() => "")) ?? ""), { mensagem: '"Enviada" abaixo da mensagem' });
  await conferir(dir, p, "conversa com anexos");

  const [chamado] = await fsConsultar("", "suporte", [["assunto", "==", assunto]]);
  if (!chamado) throw new Error("chamado não gravado");
  const [primeira] = await fsConsultar(`suporte/${chamado._id}`, "mensagens");
  if (!primeira?.anexos || primeira.anexos.length !== 3) throw new Error(`mensagem gravada com ${primeira?.anexos?.length ?? 0} anexo(s), esperado 3`);
  await aguardar(async () => !!(await fsLer(`plataforma/notificacoes/ultimos/suporte-${chamado._id}-${primeira._id}`)), { mensagem: "aviso da mensagem para a equipe" });

  // ── Equipe ──
  const eq = await novoAparelho(estado, "suporte-equipe");
  const pe = await novaPagina(eq);
  await pe.goto(`${BASE}/plataforma/suporte/${chamado._id}`);
  await entrar(pe, "equipe@somos.test");
  await pe.getByRole("heading", { name: assunto }).waitFor({ timeout: 30_000 });
  await aguardar(async () => (await pe.locator("[data-anexos-mensagem] img").count()) >= 1 && (await pe.locator("[data-audio-suporte]").count()) >= 1, {
    mensagem: "foto e áudio na central da equipe",
  });
  await conferir(eq, pe, "equipe vê os anexos");

  // diretoria vê que a equipe abriu e está lendo
  await aguardar(async () => /Vista pela equipe/.test((await conversa.locator("[data-situacao-envio]").textContent().catch(() => "")) ?? ""), { mensagem: '"Vista pela equipe"' });
  await conversa.locator("[data-equipe-lendo]").waitFor({ timeout: 10_000 });

  // equipe responde com foto
  await pe.locator('form input[type="file"]').setInputFiles({ name: "resposta.png", mimeType: "image/png", buffer: Buffer.from(PNG_B64, "base64") });
  await pe.getByRole("textbox", { name: "Resposta" }).fill("Recebemos, olha este print");
  await pe.getByRole("button", { name: "Enviar resposta" }).click();
  await aguardar(async () => (await conversa.locator("[data-anexos-mensagem] img").count()) >= 2, { mensagem: "foto da equipe na conversa da diretoria" });
  await conferir(dir, p, "resposta da equipe com foto");
  await conferir(eq, pe, "equipe respondeu");

  // Botão "Copiar código Pix" dos e-mails: abre /pix com QR, valor e cópia com um toque
  await dir.ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await p.goto(`${BASE}/pix?c=${encodeURIComponent(pixDeTeste(19700))}`);
  await p.getByText("R$ 197,00").waitFor();
  await p.getByRole("button", { name: "Copiar código Pix" }).click();
  await p.getByRole("button", { name: "Código copiado" }).waitFor({ timeout: 5_000 });
  await conferir(dir, p, "página /pix");
  await p.goto(`${BASE}/pix?c=000201quebrado`);
  await p.getByText("Código Pix incompleto").waitFor();

  await fecharAparelho(eq);
  await fecharAparelho(dir);
}

/** Pix copia e cola válido (EMV + CRC16), como o servidor gera (functions/src/util/pix.ts). */
function pixDeTeste(centavos) {
  const c = (id, v) => `${id}${String(v.length).padStart(2, "0")}${v}`;
  const conta = c("00", "br.gov.bcb.pix") + c("01", "52000426000149");
  const corpo = c("00", "01") + c("26", conta) + c("52", "0000") + c("53", "986") + c("54", (centavos / 100).toFixed(2)) + c("58", "BR") +
    c("59", "SOMOS ORGANIZADA") + c("60", "SALVADOR") + c("62", c("05", "TESTE")) + "6304";
  let crc = 0xffff;
  for (const ch of corpo) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return corpo + crc.toString(16).toUpperCase().padStart(4, "0");
}
