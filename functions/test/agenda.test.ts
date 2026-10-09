import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENDA_PADRAO, horariosDaAgenda, instanteDoHorario } from "../src/api/verificacaoVideo";

test("horário de Brasília vira o instante certo (UTC-3)", () => {
  assert.equal(instanteDoHorario("2026-10-12T14:20")!.toISOString(), "2026-10-12T17:20:00.000Z");
  assert.equal(instanteDoHorario("12/10 14h"), null);
});

test("agenda: segunda a sábado, 10h às 21h, de 20 em 20 min, a partir de 3 h", () => {
  // quinta, 08/10/2026, 12:00 em Brasília
  const agora = Date.UTC(2026, 9, 8, 15, 0);
  const h = horariosDaAgenda(AGENDA_PADRAO, agora);
  assert.equal(h[0], "2026-10-08T15:00"); // 3 h depois
  assert.ok(!h.some((x) => x.startsWith("2026-10-11")), "domingo fechado");
  assert.ok(h.includes("2026-10-10T10:00") && h.includes("2026-10-10T21:00"), "sábado das 10h às 21h");
  assert.ok(!h.includes("2026-10-09T21:20"), "último início às 21h");
  assert.equal(h.filter((x) => x.startsWith("2026-10-09")).length, 34, "(21h - 10h) / 20 min + 1");
});

test("horário bloqueado pela equipe some da lista", () => {
  const agora = Date.UTC(2026, 9, 8, 15, 0);
  const h = horariosDaAgenda({ ...AGENDA_PADRAO, bloqueados: ["2026-10-09T10:00"] }, agora);
  assert.ok(!h.includes("2026-10-09T10:00"));
  assert.ok(h.includes("2026-10-09T10:20"));
});
