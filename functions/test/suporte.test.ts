import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDaMensagem, resumoAnexos, trechoAviso } from "../src/api/suporte";

test("aviso do suporte: mensagem curta vai inteira, numa linha só", () => {
  assert.equal(trechoAviso("  Paguei o Pix\n\ne não  chegou "), "Paguei o Pix e não chegou");
});

test("aviso do suporte: mensagem longa é cortada em ~120 caracteres com reticências", () => {
  const t = trechoAviso("a".repeat(300));
  assert.equal(t.length, 120);
  assert.ok(t.endsWith("…"));
});

test("aviso do suporte: título com torcida e assunto; corpo com quem escreveu e o que mandou", () => {
  const a = avisoDaMensagem({ torcidaNome: "Fúria Amapá", assunto: "Não sei criar eventos", nome: "João" }, { texto: "Preciso de ajuda", nome: "João Ferreira" });
  assert.equal(a.titulo, "Fúria Amapá · Não sei criar eventos");
  assert.equal(a.corpo, "João Ferreira: Preciso de ajuda");
});

test("aviso do suporte: mensagem só com anexo diz o que foi anexado", () => {
  assert.equal(resumoAnexos([{ tipo: "imagem" }, { tipo: "imagem" }, { tipo: "audio" }]), "2 fotos, Áudio");
  const a = avisoDaMensagem({ torcidaNome: "Fúria", assunto: "Print" }, { texto: "", anexos: [{ tipo: "audio" }], nome: "Ana" });
  assert.equal(a.corpo, "Ana: [Áudio]");
});
