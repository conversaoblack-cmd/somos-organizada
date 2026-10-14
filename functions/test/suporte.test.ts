import { test } from "node:test";
import assert from "node:assert/strict";
import { trechoAviso } from "../src/api/suporte";

test("aviso do suporte: mensagem curta vai inteira, numa linha só", () => {
  assert.equal(trechoAviso("  Paguei o Pix\n\ne não  chegou "), "Paguei o Pix e não chegou");
});

test("aviso do suporte: mensagem longa é cortada em ~120 caracteres com reticências", () => {
  const t = trechoAviso("a".repeat(300));
  assert.equal(t.length, 120);
  assert.ok(t.endsWith("…"));
});
