// Base da suíte de navegador: abre "aparelhos" (contextos do Chromium), vigia erros e conversa com os emuladores.
// Nada aqui toca o projeto real: só emuladores (demo-somos), Pagar.me simulada (4010) e o site local.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

export const BASE = (process.env.NAVEGADOR_URL ?? "http://127.0.0.1:5173").replace(/\/+$/, "");
export const PROJETO = "demo-somos";
export const AUTH = "http://127.0.0.1:9099";
export const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${PROJETO}/databases/(default)/documents`;
export const PAGARME = "http://127.0.0.1:4010";
export const SENHA = "senha123456";
export const SAIDA = process.env.NAVEGADOR_SAIDA ?? "/tmp/somos-navegador";
/** Identificador desta rodada: nomes, e-mails e CPFs não colidem com rodadas anteriores no mesmo emulador. */
export const RODADA = Date.now().toString(36).slice(-6);

const MODOS = (process.env.NAVEGADOR_MODOS ?? "normal,chrome-novo").split(",").map((s) => s.trim()).filter(Boolean);
const LARGURAS = (process.env.NAVEGADOR_LARGURAS ?? "360,1280").split(",").map((s) => Number(s.trim())).filter(Boolean);
export const combinacoes = () => MODOS.flatMap((modo) => LARGURAS.map((largura) => ({ modo, largura, id: `${modo}-${largura}` })));

/**
 * Chrome novo: os métodos de rolagem passaram a devolver uma Promise (antes devolviam undefined).
 * Efeito do React que devolve o resultado de scrollIntoView derruba a tela ("q is not a function" no site publicado).
 */
function simularChromeNovo() {
  for (const nome of ["scrollIntoView", "scrollTo", "scrollBy", "scroll"]) {
    for (const alvo of [Element.prototype, window]) {
      const original = alvo[nome];
      if (typeof original !== "function") continue;
      alvo[nome] = function (...args) {
        original.apply(this, args);
        return Promise.resolve();
      };
    }
  }
}

/** CEP sempre com a mesma resposta: o teste não depende do ViaCEP (nem de internet de fora). */
const VIACEP = {
  "40050000": { cep: "40050-000", logradouro: "Avenida Sete de Setembro", bairro: "Centro", localidade: "Salvador", uf: "BA" },
  "41820020": { cep: "41820-020", logradouro: "Rua Edgar Santos", bairro: "Stiep", localidade: "Salvador", uf: "BA" },
};

// ── Navegador e aparelhos ─────────────────────────────────────────

export async function abrirNavegador() {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  return chromium.launch({ executablePath, args: ["--use-fake-device-for-media-stream"] });
}

/**
 * Um "aparelho" = um contexto limpo do navegador (sem login, sem armazenamento), como outro celular/computador.
 * Toda página aberta nele é vigiada: erro de página, console.error, tela "Algo deu errado".
 */
export async function novoAparelho(estado, rotulo, { largura = estado.combo.largura } = {}) {
  const celular = largura <= 480;
  const ctx = await estado.navegador.newContext({
    viewport: { width: largura, height: celular ? 740 : 800 },
    isMobile: celular,
    hasTouch: celular,
    deviceScaleFactor: celular ? 2 : 1,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  if (estado.combo.modo === "chrome-novo") await ctx.addInitScript(simularChromeNovo);
  await ctx.route(/^https:\/\/viacep\.com\.br\//, (rota) => {
    const cep = (rota.request().url().match(/ws\/(\d{8})/) ?? [])[1];
    const corpo = VIACEP[cep] ?? { erro: true };
    return rota.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(corpo) });
  });
  const ap = { rotulo, ctx, largura, estado, erros: [], esperados: [], permissoes: [], paginas: [], diario: [], fluxos: new Set([estado.fluxoAtual]) };
  ctx.setDefaultTimeout(30_000);
  ctx.on("page", (p) => vigiar(ap, p));
  estado.aparelhos.push(ap);
  return ap;
}

/** Fecha o aparelho (contexto) e tira da lista da combinação. */
export async function fecharAparelho(ap) {
  await ap.ctx.close().catch(() => undefined);
  const lista = ap.estado.aparelhos;
  if (lista.includes(ap)) lista.splice(lista.indexOf(ap), 1);
}

/** O que deu errado nos aparelhos deste fluxo: erros do navegador e a tela "Algo deu errado" (com os detalhes). */
export async function causasProvaveis(estado, fluxo) {
  const causas = [];
  for (const ap of estado.aparelhos.filter((a) => a.fluxos.has(fluxo))) {
    for (const p of ap.paginas.filter((x) => !x.isClosed())) {
      if (await p.getByText("Algo deu errado nesta tela").count().catch(() => 0)) {
        const det = await p.locator("details pre").first().textContent({ timeout: 1000 }).catch(() => "");
        causas.push(`[${ap.rotulo}] tela "Algo deu errado nesta tela" em ${p.url()}\n    ${det.replace(/\n/g, "\n    ")}`);
      }
    }
    for (const e of ap.erros) causas.push(`[${ap.rotulo}] (${e.quando}) ${e.tipo} em ${e.url}\n    ${e.texto.replace(/\n/g, "\n    ")}`);
  }
  return causas;
}

export async function novaPagina(ap) {
  const p = await ap.ctx.newPage();
  return p;
}

const DEBUG = process.env.NAVEGADOR_DEBUG === "1";

function vigiar(ap, page) {
  ap.paginas.push(page);
  const quando = () => new Date().toISOString().slice(11, 19);
  // Diário do aparelho (vai para o arquivo da falha): navegações e todo o console, não só os erros
  const anotar = (linha) => {
    ap.diario.push(`${quando()} [p${ap.paginas.indexOf(page)}] ${linha}`);
    if (ap.diario.length > 300) ap.diario.shift();
    if (DEBUG) console.log(`    · ${ap.rotulo} ${linha}`);
  };
  page.on("framenavigated", (f) => f === page.mainFrame() && anotar(`navegou: ${f.url()}`));
  page.on("console", (m) => anotar(`console.${m.type()}: ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => anotar(`pageerror: ${e.message}`));
  page.on("pageerror", (e) => {
    const texto = `${e.name}: ${e.message}`;
    if (permitido(ap, texto)) ap.esperados.push({ quando: quando(), tipo: "pageerror", texto, url: page.url() });
    else ap.erros.push({ quando: quando(), tipo: "pageerror", texto: `${texto}\n${(e.stack ?? "").split("\n").slice(1, 6).join("\n")}`, url: page.url() });
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const loc = m.location();
    const texto = `${m.text()}${loc?.url ? ` [${loc.url}${loc.lineNumber ? `:${loc.lineNumber}` : ""}]` : ""}`;
    if (permitido(ap, texto)) ap.esperados.push({ quando: quando(), tipo: "console.error", texto, url: page.url() });
    else ap.erros.push({ quando: quando(), tipo: "console.error", texto, url: page.url() });
  });
  // Tour de primeira visita do painel: a pessoa toca em "Pular" (Esc) e segue
  page
    .addLocatorHandler(page.locator('[aria-labelledby="tour-titulo"]'), async () => {
      await page.keyboard.press("Escape");
    })
    .catch(() => undefined);
}

function permitido(ap, texto) {
  const agora = Date.now();
  return ap.permissoes.some((p) => p.ate >= agora && p.re.test(texto));
}

/**
 * Erros que o passo provoca de propósito (ex.: tentar criar conta com e-mail que já existe → 400 EMAIL_EXISTS).
 * Valem só durante `fn` (e 2 s depois, para o console atrasado). Ficam registrados como "esperados" no relatório.
 */
export async function comErrosEsperados(ap, lista, fn) {
  const ps = lista.map(({ re, motivo }) => ({ re, motivo, ate: Infinity }));
  ap.permissoes.push(...ps);
  try {
    return await fn();
  } finally {
    const fim = Date.now() + 2000;
    for (const p of ps) p.ate = fim;
  }
}

/**
 * Antes de cortar a internet: se o site registra um service worker (só no build), espera ele ficar pronto e
 * guardar os arquivos, como acontece com quem usa o site com internet antes de chegar ao estádio.
 */
export async function esperarServiceWorker(page) {
  const situacao = await page.evaluate(
    () =>
      new Promise((ok) => {
        if (!("serviceWorker" in navigator)) return ok("navegador sem service worker");
        const fim = setTimeout(() => ok("site sem service worker"), 15_000);
        navigator.serviceWorker.ready.then(() => {
          clearTimeout(fim);
          ok("service worker pronto");
        });
      }),
  );
  if (situacao === "service worker pronto") await esperar(2000);
  return situacao;
}

/** Erros de rede esperados enquanto o aparelho está sem internet (context.setOffline). */
export const ERROS_SEM_INTERNET = [
  { re: /net::ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError|Could not reach Cloud Firestore|client is offline/i, motivo: "aparelho sem internet de propósito" },
];

/**
 * Ponto de conferência: falha se houve erro de página/console, se a tela "Algo deu errado" apareceu ou
 * (celular, telas do torcedor) se a página rola na horizontal.
 */
export async function conferir(ap, page, passo, { torcedor = false } = {}) {
  ap.fluxos.add(ap.estado.fluxoAtual);
  const quebrou = page.getByText("Algo deu errado nesta tela");
  if (await quebrou.count().catch(() => 0)) {
    const det = await page.locator("details pre").first().textContent({ timeout: 1000 }).catch(() => "");
    throw new Error(`[${ap.rotulo}] ${passo}: apareceu a tela "Algo deu errado nesta tela" em ${page.url()}\n${det}`);
  }
  if (ap.erros.length) {
    const lista = ap.erros.map((e) => `  - (${e.quando}) ${e.tipo} em ${e.url}\n    ${e.texto.replace(/\n/g, "\n    ")}`).join("\n");
    throw new Error(`[${ap.rotulo}] ${passo}: ${ap.erros.length} erro(s) no navegador:\n${lista}`);
  }
  if (torcedor && ap.largura <= 480) {
    const r = await page.evaluate((largura) => {
      const sw = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0);
      if (sw <= largura + 1) return null;
      const culpados = [];
      for (const el of document.querySelectorAll("body *")) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.right > largura + 1 && getComputedStyle(el).position !== "fixed") {
          culpados.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (direita ${Math.round(b.right)}px) "${(el.textContent ?? "").trim().slice(0, 40)}"`);
          if (culpados.length >= 5) break;
        }
      }
      return { sw, culpados };
    }, ap.largura);
    if (r) throw new Error(`[${ap.rotulo}] ${passo}: rolagem horizontal em ${ap.largura}px (largura do conteúdo ${r.sw}px) em ${page.url()}\n  ${r.culpados.join("\n  ")}`);
  }
}

/** Abre o menu do painel (no celular fica atrás do botão "Abrir menu") e vai para o item. */
export async function irNoMenu(page, rotulo) {
  const botao = page.getByRole("button", { name: "Abrir menu" });
  if (await botao.isVisible().catch(() => false)) {
    await botao.click();
    await page.getByRole("dialog", { name: "Menu do painel" }).getByRole("link", { name: rotulo, exact: false }).first().click();
  } else {
    await page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: rotulo, exact: false }).first().click();
  }
}

/** Login dos painéis e da conta do torcedor (componente Login). */
export async function entrar(page, usuario, senha = SENHA, { botao = "Entrar" } = {}) {
  const campo = page.getByLabel(/^(E-mail|CPF ou e-mail)$/).first();
  await campo.waitFor({ timeout: 30_000 });
  await campo.fill(usuario);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: botao, exact: true }).click();
}

// ── Emuladores ─────────────────────────────────────────────────────

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Repete `fn` até devolver algo "verdadeiro" (ou estoura com a mensagem). */
export async function aguardar(fn, { tempo = 20_000, intervalo = 500, mensagem = "condição" } = {}) {
  const fim = Date.now() + tempo;
  let ultimo;
  while (Date.now() < fim) {
    try {
      ultimo = await fn();
      if (ultimo) return ultimo;
    } catch (e) {
      ultimo = e;
    }
    await esperar(intervalo);
  }
  throw new Error(`Tempo esgotado esperando: ${mensagem}${ultimo instanceof Error ? ` (último erro: ${ultimo.message})` : ""}`);
}

/** Códigos de e-mail do Auth (VERIFY_EMAIL, PASSWORD_RESET) registrados pelo emulador para um e-mail. */
export async function codigosOob(email, tipo) {
  const r = await (await fetch(`${AUTH}/emulator/v1/projects/${PROJETO}/oobCodes`)).json();
  return (r.oobCodes ?? []).filter((o) => o.email?.toLowerCase() === email.toLowerCase() && o.requestType === tipo);
}
export async function novoCodigoOob(email, tipo, quantosAntes = 0) {
  return aguardar(async () => {
    const c = await codigosOob(email, tipo);
    return c.length > quantosAntes ? c[c.length - 1] : null;
  }, { mensagem: `e-mail ${tipo} para ${email}` });
}

/** Troca a senha com o código do e-mail (o que a página de redefinição do Firebase faz). */
export async function redefinirSenhaComCodigo(oobCode, novaSenha) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oobCode, newPassword: novaSenha }),
  });
  if (!r.ok) throw new Error(`resetPassword falhou: ${r.status} ${await r.text()}`);
}

/** Serviços locais que não respondem (vazio = tudo no ar). Falha com ambiente fora do ar não é culpa do fluxo. */
export async function ambienteForaDoAr() {
  const alvos = {
    "Auth (9099)": `${AUTH}/`,
    "Firestore (8080)": "http://127.0.0.1:8080/",
    "Functions (5001)": "http://127.0.0.1:5001/",
    "Pagar.me simulada (4010)": `${PAGARME}/`,
    [`site (${BASE})`]: `${BASE}/`,
  };
  const fora = [];
  for (const [nome, url] of Object.entries(alvos)) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000) });
    } catch {
      fora.push(nome);
    }
  }
  return fora;
}

// Firestore pela API REST do emulador, com acesso de dono (só para conferir e preparar dados de teste)
const DONO = { Authorization: "Bearer owner", "Content-Type": "application/json" };
function valor(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("referenceValue" in v) return v.referenceValue;
  if ("mapValue" in v) return campos(v.mapValue.fields ?? {});
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(valor);
  return v;
}
const campos = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, valor(v)]));
const documento = (d) => ({ _id: d.name.split("/").pop(), _caminho: d.name.split("/documents/")[1], ...campos(d.fields ?? {}) });
function paraValor(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  throw new Error("tipo não suportado");
}

export async function fsLer(caminho) {
  const r = await fetch(`${FIRESTORE}/${caminho}`, { headers: DONO });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore ${caminho}: ${r.status}`);
  return documento(await r.json());
}
/** Consulta simples: filtros [campo, "==", valor]. `pai` é o caminho do documento pai ("" = raiz). */
export async function fsConsultar(pai, colecao, filtros = []) {
  const where = filtros.length
    ? {
        compositeFilter: {
          op: "AND",
          filters: filtros.map(([campo, , v]) => ({ fieldFilter: { field: { fieldPath: campo }, op: "EQUAL", value: paraValor(v) } })),
        },
      }
    : undefined;
  const r = await fetch(`${FIRESTORE}${pai ? `/${pai}` : ""}:runQuery`, {
    method: "POST",
    headers: DONO,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: colecao }], ...(where ? { where } : {}) } }),
  });
  if (!r.ok) throw new Error(`Consulta ${pai}/${colecao}: ${r.status} ${await r.text()}`);
  return (await r.json()).filter((x) => x.document).map((x) => documento(x.document));
}
export async function fsAtualizar(caminho, dados) {
  const mask = Object.keys(dados).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const r = await fetch(`${FIRESTORE}/${caminho}?${mask}`, {
    method: "PATCH",
    headers: DONO,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, paraValor(v)])) }),
  });
  if (!r.ok) throw new Error(`Atualizar ${caminho}: ${r.status} ${await r.text()}`);
}

export async function tidDoSlug(slug) {
  const s = await fsLer(`slugs/${slug}`);
  if (!s?.torcidaId) throw new Error(`Torcida "${slug}" não existe no emulador. Rode o semear.mjs (dev-local.sh faz isso).`);
  return s.torcidaId;
}

/** Pagar.me simulada: o cliente "paga" o Pix do pedido (o site confere quando a pessoa toca em "Já paguei"). */
export async function pagarPixNaPagarme(tid, pedidoId) {
  const pedido = await aguardar(async () => {
    const p = await fsLer(`torcidas/${tid}/pedidos/${pedidoId}`);
    return p?.pagarme?.orderId ? p : null;
  }, { mensagem: `pedido ${pedidoId} com orderId da Pagar.me` });
  const r = await fetch(`${PAGARME}/__pagar/${pedido.pagarme.orderId}`, { method: "POST" });
  if (!r.ok) throw new Error(`Pagar.me simulada não pagou ${pedido.pagarme.orderId}: ${r.status}`);
  return pedido;
}

// ── Dados de teste ─────────────────────────────────────────────────

export function cpfAleatorio() {
  let n;
  do n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  while (new Set(n).size === 1);
  const dv = (b) => {
    const r = (b.reduce((s, d, i) => s + d * (b.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(dv(n));
  n.push(dv(n));
  return n.join("");
}
export const celularAleatorio = () => `719${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
export const mascaraCpf = (c) => c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

/** Data no formato do campo datetime-local, N dias à frente, no horário de Brasília. */
export function dataHoraLocal(dias, hora = 20) {
  const d = new Date(Date.now() + dias * 86400_000 - 3 * 3600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hora).padStart(2, "0")}:00`;
}

// ── Relatório ──────────────────────────────────────────────────────

export const resultados = [];

export async function fotografarFalha(estado, nome) {
  const pasta = path.join(SAIDA, estado.combo.id);
  fs.mkdirSync(pasta, { recursive: true });
  const arquivos = [];
  for (const ap of estado.aparelhos.filter((a) => a.fluxos.has(estado.fluxoAtual))) {
    const diario = path.join(pasta, `${nome}-${ap.rotulo}-diario.txt`.replace(/[^\w.-]+/g, "_"));
    fs.writeFileSync(diario, ap.diario.join("\n") + "\n");
    arquivos.push(diario);
    for (const [i, p] of ap.paginas.entries()) {
      if (p.isClosed()) continue;
      const arq = path.join(pasta, `${nome}-${ap.rotulo}-${i}.png`.replace(/[^\w.-]+/g, "_"));
      await p.screenshot({ path: arq, fullPage: true, timeout: 10_000 }).then(() => arquivos.push(arq)).catch(() => undefined);
    }
  }
  return arquivos;
}

/** Foto de evidência (também quando passa), ex.: o QR aparecendo sem internet. */
export async function evidencia(ap, page, nome) {
  const pasta = path.join(SAIDA, ap.estado.combo.id);
  fs.mkdirSync(pasta, { recursive: true });
  const arq = path.join(pasta, `${nome}.png`.replace(/[^\w.-]+/g, "_"));
  await page.screenshot({ path: arq, timeout: 10_000 }).catch(() => undefined);
  return arq;
}

export function registrarEsperados(estado, nome) {
  const lista = estado.aparelhos.flatMap((ap) => ap.esperados.map((e) => ({ aparelho: ap.rotulo, ...e })));
  if (!lista.length) return;
  fs.mkdirSync(SAIDA, { recursive: true });
  fs.appendFileSync(path.join(SAIDA, "erros-esperados.jsonl"), lista.map((e) => JSON.stringify({ combo: estado.combo.id, fluxo: nome, ...e })).join("\n") + "\n");
  for (const ap of estado.aparelhos) ap.esperados.length = 0;
}
