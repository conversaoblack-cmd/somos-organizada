import { test } from "node:test";
import assert from "node:assert/strict";
import { mascararEmail } from "../src/api/conta";

test("e-mail mascarado no 'Esqueci minha senha' por CPF: só o começo do nome e do domínio", () => {
  assert.equal(mascararEmail("raimundo@gmail.com"), "ra***@g***.com");
  assert.equal(mascararEmail("Socio@Furia.test"), "so***@f***.test");
  assert.equal(mascararEmail("jo@uol.com.br"), "j***@u***.com.br");
  assert.equal(mascararEmail("a@b"), "a***@b***");
  assert.equal(mascararEmail("sem-arroba"), "***");
});

test("confirmação de e-mail: volta só para caminho do próprio site e pega o código do link do Firebase", async () => {
  const { caminhoSeguro, codigoDoLink } = await import("../src/api/verificacao");
  assert.equal(caminhoSeguro("/cadastro"), "/cadastro");
  assert.equal(caminhoSeguro("/bamor/conta"), "/bamor/conta");
  assert.equal(caminhoSeguro("https://golpe.com"), "/cadastro");
  assert.equal(caminhoSeguro("//golpe.com/x"), "/cadastro");
  assert.equal(caminhoSeguro("/a\"><script>"), "/cadastro");
  assert.equal(codigoDoLink("https://p.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=ABC-123_x&apiKey=k&lang=pt"), "ABC-123_x");
  assert.equal(codigoDoLink("não é link"), null);
});
