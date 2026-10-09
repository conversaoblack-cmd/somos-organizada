import { test } from "node:test";
import assert from "node:assert/strict";
import { escolherSugestoes } from "../src/api/cadastro";

const lista = [
  { slug: "furia-amapa", nome: "Fúria Amapá", logoUrl: null },
  { slug: "bamor", nome: "Torcida Organizada Bamor", logoUrl: null },
  { slug: "imbativeis", nome: "Os Imbatíveis", logoUrl: null },
  { slug: "furia-jovem", nome: "Fúria Jovem", logoUrl: null },
];
const slugs = (t: string) => escolherSugestoes(t, lista).map((s) => s.slug);

test("tudo junto, sem hífen ou com acento acha a torcida", () => {
  assert.equal(slugs("furiaamapa")[0], "furia-amapa");
  assert.equal(slugs("Fúria Amapá")[0], "furia-amapa");
});

test("uma letra trocada ou faltando ainda sugere", () => {
  assert.equal(slugs("furia-amapá")[0], "furia-amapa");
  assert.equal(slugs("bamorr")[0], "bamor");
  assert.equal(slugs("imbatives")[0], "imbativeis");
});

test("parte do nome sugere as que contêm", () => {
  assert.deepEqual(slugs("furia").sort(), ["furia-amapa", "furia-jovem"]);
});

test("nada parecido não sugere; texto curto não busca", () => {
  assert.deepEqual(slugs("gremio-xyz"), []);
  assert.deepEqual(slugs("ab"), []);
});
