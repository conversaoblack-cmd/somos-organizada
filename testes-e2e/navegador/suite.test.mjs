// Suíte de navegador: os fluxos críticos pela INTERFACE, em dois modos (normal e "Chrome novo", em que os métodos
// de rolagem devolvem Promise) e duas larguras (360 px celular, 1280 px computador).
// Rodar: bash testes-e2e/navegador.sh  (detalhes em testes-e2e/navegador/README.md)
import { describe, test, before, after } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  BASE, SAIDA, RODADA, combinacoes, abrirNavegador, tidDoSlug, fotografarFalha, registrarEsperados, resultados, conferir,
  causasProvaveis, novoAparelho, novaPagina, fecharAparelho, ambienteForaDoAr,
} from "./lib.mjs";
import { cadastro } from "./fluxos/cadastro.mjs";
import { aprovacao, conviteSubsede, diretoria } from "./fluxos/diretoria.mjs";
import { compra, semInternetConta } from "./fluxos/compra.mjs";
import { socio, semInternetSocio } from "./fluxos/socio.mjs";
import { portaria } from "./fluxos/portaria.mjs";

const EXIGIR_SEM_INTERNET = process.env.EXIGIR_SEM_INTERNET === "1";
const FILTRO = process.env.NAVEGADOR_FLUXOS ? process.env.NAVEGADOR_FLUXOS.split(",").map((s) => s.trim()) : null;
const MOTIVO_SEM_INTERNET =
  "modo sem internet ainda não existe (service worker + QR guardado no aparelho em implementação). " +
  "Passa a ser obrigatório com EXIGIR_SEM_INTERNET=1";

// Saída da rodada anterior sai antes (só o que esta suíte escreve)
fs.mkdirSync(SAIDA, { recursive: true });
for (const n of ["erros-esperados.jsonl", "resumo.md", "resultados.json", ...combinacoes().map((c) => c.id)]) {
  fs.rmSync(path.join(SAIDA, n), { recursive: true, force: true });
}

/**
 * Declara um fluxo. `requer`: fluxos que precisam ter passado antes (senão este é pulado, com o motivo).
 * `pendente`: teste que ainda deve falhar (todo do node:test): roda e registra, mas não derruba a suíte.
 */
function fluxo(estado, id, nome, requer, fn, { pendente } = {}) {
  const ehPendente = !!pendente && !EXIGIR_SEM_INTERNET;
  test(`${id}. ${nome}`, { timeout: 8 * 60_000, ...(ehPendente ? { todo: pendente } : {}) }, async (t) => {
    const reg = { combo: estado.combo.id, modo: estado.combo.modo, largura: estado.combo.largura, fluxo: id, nome, status: "", detalhe: "", segundos: 0 };
    resultados.push(reg);
    if (FILTRO && !FILTRO.includes(id)) {
      reg.status = "NÃO RODOU";
      return t.skip("fora de NAVEGADOR_FLUXOS");
    }
    const faltando = requer.filter((r) => !estado.ok[r]);
    if (faltando.length) {
      reg.status = "PULADO";
      reg.detalhe = `depende do fluxo ${faltando.join(", ")}, que não passou`;
      return t.skip(reg.detalhe);
    }
    const inicio = Date.now();
    estado.fluxoAtual = id;
    const foraAntes = await ambienteForaDoAr();
    if (foraAntes.length) {
      reg.status = "NÃO RODOU";
      reg.detalhe = `ambiente fora do ar: ${foraAntes.join(", ")} não responde (o fluxo não foi testado)`;
      throw new Error(reg.detalhe);
    }
    try {
      await fn(estado);
      // erro que chegou depois do último ponto de conferência também reprova o fluxo
      for (const ap of estado.aparelhos) {
        const pagina = ap.paginas.findLast((p) => !p.isClosed());
        if (ap.erros.length && pagina) await conferir(ap, pagina, "fim do fluxo");
        else if (ap.erros.length) throw new Error(`[${ap.rotulo}] erros no navegador: ${ap.erros.map((e) => e.texto).join(" | ")}`);
      }
      estado.ok[id] = true;
      reg.status = ehPendente ? "PASSOU (era pendente: pode virar obrigatório)" : "PASSOU";
    } catch (e) {
      reg.status = ehPendente ? "FALHOU (pendente, esperado)" : "FALHOU";
      // Tempo esgotado esperando a tela costuma ser consequência: junta o que o navegador registrou (erros e tela de erro)
      const causas = await causasProvaveis(estado, id);
      const fora = await ambienteForaDoAr();
      if (fora.length) causas.unshift(`AMBIENTE FORA DO AR durante o fluxo: ${fora.join(", ")} não responde. A falha pode não ser do site.`);
      const msg = String(e?.message ?? e).split("\n").slice(0, 10).join("\n");
      reg.detalhe = causas.length ? `${msg}\nCausa provável (registrado no navegador):\n  ${causas.slice(0, 6).join("\n  ")}` : msg;
      reg.fotos = await fotografarFalha(estado, `fluxo${id}`);
      for (const ap of estado.aparelhos) ap.erros.length = 0;
      if (causas.length && e instanceof Error) e.message = reg.detalhe;
      throw e;
    } finally {
      reg.segundos = Math.round((Date.now() - inicio) / 1000);
      registrarEsperados(estado, id);
    }
  });
}

for (const combo of combinacoes()) {
  describe(`${combo.modo} · ${combo.largura}px`, () => {
    const estado = { combo, aparelhos: [], ok: {}, dados: {} };
    before(async () => {
      estado.navegador = await abrirNavegador();
      estado.tid = await tidDoSlug("brasil");
      // O modo "Chrome novo" não pode virar enfeite: confere que a rolagem devolve mesmo uma Promise
      estado.fluxoAtual = "preparo";
      const ap = await novoAparelho(estado, "conferencia-modo");
      const p = await novaPagina(ap);
      await p.goto(`${BASE}/cadastro`);
      const devolve = await p.evaluate(() => [document.body.scrollIntoView(), window.scrollTo(0, 0), document.body.scrollBy?.(0, 0)].map((x) => x instanceof Promise));
      await fecharAparelho(ap);
      if (estado.combo.modo === "chrome-novo" && devolve.includes(false)) throw new Error(`modo chrome-novo não ativou: ${devolve}`);
      if (estado.combo.modo === "normal" && devolve.includes(true)) {
        console.log(`  (aviso) este Chromium já devolve Promise na rolagem: o modo "normal" equivale ao "chrome-novo"`);
      }
    });
    after(async () => {
      for (const ap of estado.aparelhos) await ap.ctx.close().catch(() => undefined);
      await estado.navegador?.close();
    });

    fluxo(estado, "1", "cadastro de diretoria (conta → e-mail → torcida → pessoa → entidade → revisão → vídeo de verificação → em análise)", [], cadastro);
    fluxo(estado, "2", "equipe aprova a solicitação e a diretoria entra no painel", ["1"], aprovacao);
    fluxo(estado, "3", "diretoria cria plano com benefícios, cria e publica evento, link e QR", [], diretoria);
    fluxo(estado, "4", "torcedor não sócio compra no Pix pelo link do evento, ingresso com QR, conta e e-mail", ["3"], compra);
    fluxo(estado, "7a", "sem internet: /conta recarregada mostra o QR do ingresso", ["4"], semInternetConta, { pendente: MOTIVO_SEM_INTERNET });
    fluxo(estado, "5", "torcedor vira sócio no Pix, carteirinha com QR e benefícios, entra com CPF, esqueci a senha", ["3", "4"], socio);
    fluxo(estado, "6", "portaria valida o ingresso (código e QR), já utilizado, inválido e sem conexão", ["4"], portaria);
    fluxo(estado, "8", "diretoria cria subsede e convida o responsável; convidado cria a senha pelo /convite e vê o painel da subsede", [], conviteSubsede);
    fluxo(estado, "7b", "sem internet: /socio e /conta recarregadas mostram carteirinha e ingresso com QR", ["5"], semInternetSocio, { pendente: MOTIVO_SEM_INTERNET });
  });
}

after(() => {
  const combos = combinacoes().map((c) => c.id);
  const fluxos = [...new Map(resultados.map((r) => [r.fluxo, r.nome])).entries()];
  const celula = (f, c) => resultados.find((r) => r.fluxo === f && r.combo === c)?.status || "—";
  const linhas = [
    `# Suíte de navegador · rodada ${RODADA} · ${new Date().toISOString()}`,
    `Site: ${BASE}`,
    "",
    `| Fluxo | ${combos.join(" | ")} |`,
    `|---|${combos.map(() => "---").join("|")}|`,
    ...fluxos.map(([f, nome]) => `| ${f}. ${nome} | ${combos.map((c) => celula(f, c)).join(" | ")} |`),
    "",
    ...resultados
      .filter((r) => r.status !== "PASSOU" && r.detalhe)
      .map((r) => `## ${r.fluxo} · ${r.combo}: ${r.status}\n${r.detalhe}${r.fotos?.length ? `\nTelas: ${r.fotos.join(", ")}` : ""}\n`),
  ];
  const texto = linhas.join("\n");
  fs.writeFileSync(path.join(SAIDA, "resumo.md"), texto + "\n");
  fs.writeFileSync(path.join(SAIDA, "resultados.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n${texto}\n\nResumo e telas das falhas: ${SAIDA}`);
});
