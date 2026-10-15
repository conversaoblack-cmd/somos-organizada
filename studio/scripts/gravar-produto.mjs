#!/usr/bin/env node
/**
 * Grava/captura telas do PRODUTO REAL no ambiente local de demonstração (seção 6.6).
 * Pré-requisito: `bash testes-e2e/dev-local.sh` rodando (em segundo plano, timeout de 2 h) → http://127.0.0.1:5173/brasil
 *
 * Uso: node scripts/gravar-produto.mjs <roteiro.json> <pasta-de-saida> [--sem-video]
 *
 * roteiro.json:
 * {
 *   "base": "http://127.0.0.1:5173",
 *   "conta": "diretoria@brasil.test",          // opcional; senha de todas: senha123456 (testes-e2e/semear.mjs)
 *   "entrarEm": "/brasil/admin",               // página onde fica o formulário de login (com `conta`)
 *   "passos": [
 *     {"acao": "abrir", "url": "/brasil/admin"},
 *     {"acao": "esperar", "texto": "Eventos"},                 // espera um texto aparecer (ou "seletor")
 *     {"acao": "print", "nome": "painel"},                     // PNG 1170×2532
 *     {"acao": "tocar", "nome": "novo-evento", "texto": "Novo evento"},  // ou "seletor"; grava o retângulo
 *     {"acao": "digitar", "seletor": "input[name=nome]", "texto": "Caravana"},
 *     {"acao": "rolar", "y": 600},
 *     {"acao": "pausa", "ms": 800},
 *     {"acao": "tocar", "texto": "Pular", "exato": true, "opcional": true}  // toca se aparecer; não vira marca
 *   ],
 *   "ocultar": [                                 // cobre o que não é assunto da cena (registrado no origem.json)
 *     {"seletor": "button[aria-label^='Ajuda']"},
 *     {"texto": "Ambiente de teste da Pagar.me", "subir": 1}
 *   ]
 * }
 *
 * Saída em <pasta>: <nome>.png (1170×2532 conferido com ffprobe), gravacao.mp4 (h264, 30 fps constantes, 1170×2532),
 * marcas.json (retângulo de cada toque em PIXELS DA CAPTURA + instante `ms` na gravação) e origem.json (de onde veio).
 * O retângulo vale para a tela NO INSTANTE do toque (depois de rolar até o alvo): bate com a gravação; para usar num
 * print, tire o print depois do toque.
 * No ambiente local o site mostra a faixa "Ambiente de teste da Pagar.me": cubra ou corte na peça (é estado de demonstração).
 *
 * Determinismo: viewport 390×844 a 3× (isMobile, touch), fuso America/Bahia, pt-BR, Math.random com semente,
 * animações CSS reduzidas. O estúdio só LÊ o produto; dado diferente = semente própria em studio/scripts/.
 * Dado fictício sempre rotulado na peça ("Torcida Brasil · dados de demonstração").
 */
import {execSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {rodar, sonda} from './lib/ff.mjs';

export const VIEWPORT = {width: 390, height: 844};
export const ESCALA = 3;
export const CAPTURA = {width: VIEWPORT.width * ESCALA, height: VIEWPORT.height * ESCALA};
const SENHA_DEMO = 'senha123456';
const CHROMIUMS = [
  process.env.CHROMIUM,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

// PRNG com semente (mulberry32) injetado antes de qualquer script da página
const SEMENTE_JS = `(() => { let s = 0x50D0A; Math.random = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

/**
 * Cobre (esconde) elementos que não são assunto da cena: botão flutuante de suporte, faixa de "ambiente de teste".
 * Equivale a cobrir/cortar na edição (seção 6.6) e fica registrado no origem.json. Nunca use para esconder estado
 * do produto que mude o sentido da tela.
 */
async function aplicarOcultar(page, ocultar) {
  if (!ocultar?.length) return;
  await page.evaluate((regras) => {
    for (const r of regras) {
      if (r.seletor) document.querySelectorAll(r.seletor).forEach((el) => el.style.setProperty('visibility', 'hidden', 'important'));
      if (r.texto) {
        const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        let el;
        while ((el = andar.nextNode())) {
          if (el.children.length === 0 && el.textContent && el.textContent.includes(r.texto)) {
            // esconde o bloco da faixa inteira (o pai com fundo), não só o texto
            const alvo = r.subir ? Array.from({length: r.subir}).reduce((x) => x.parentElement ?? x, el) : el;
            alvo.style.setProperty('display', 'none', 'important');
          }
        }
      }
    }
  }, ocultar);
}

/** Primeiro alvo VISÍVEL (no celular, o menu lateral escondido repete textos como "Visão geral"). */
function localizar(page, passo) {
  let l;
  if (passo.seletor) l = page.locator(passo.seletor);
  else if (passo.texto) l = page.getByText(passo.texto, {exact: passo.exato ?? false});
  else if (passo.papel) l = page.getByRole(passo.papel, {name: passo.nomeAcessivel});
  else throw new Error(`passo sem alvo: ${JSON.stringify(passo)}`);
  return l.filter({visible: true}).first();
}

async function executar(page, passo, {base, t0, marcas, prints, pasta, ocultar}) {
  switch (passo.acao) {
    case 'abrir':
      await page.goto(base + passo.url, {waitUntil: 'load'});
      await page.waitForTimeout(passo.ms ?? 600);
      await aplicarOcultar(page, ocultar);
      break;
    case 'esperar':
      await localizar(page, passo).waitFor({state: 'visible', timeout: passo.timeout ?? 15000});
      break;
    case 'pausa':
      await page.waitForTimeout(passo.ms ?? 500);
      break;
    case 'rolar':
      await page.evaluate((y) => window.scrollTo({top: y, behavior: 'instant'}), passo.y ?? 0);
      await page.waitForTimeout(200);
      break;
    case 'digitar':
      await localizar(page, passo).fill(passo.texto ?? '');
      break;
    case 'print': {
      await aplicarOcultar(page, ocultar);
      await page.evaluate(() => document.fonts.ready);
      const arq = `${passo.nome}.png`;
      await page.screenshot({path: join(pasta, arq), animations: 'disabled', caret: 'hide'});
      prints.push({nome: passo.nome, arquivo: arq, ms: Date.now() - t0});
      break;
    }
    case 'tocar': {
      const alvo = localizar(page, passo);
      if (passo.opcional) {
        // ex.: tour do 1º acesso (só aparece uma vez por conta): toca se existir, sem marcar
        const ok = await alvo.waitFor({state: 'visible', timeout: passo.timeout ?? 3000}).then(() => true, () => false);
        if (ok) {
          await alvo.tap();
          await page.waitForTimeout(passo.depoisMs ?? 600);
        }
        break;
      }
      await alvo.scrollIntoViewIfNeeded();
      const r = await alvo.boundingBox();
      if (!r) throw new Error(`alvo invisível: ${passo.nome}`);
      marcas.push({
        nome: passo.nome,
        // retângulo em pixels da CAPTURA (1170×2532), arredondado
        x: Math.round(r.x * ESCALA),
        y: Math.round(r.y * ESCALA),
        w: Math.round(r.width * ESCALA),
        h: Math.round(r.height * ESCALA),
        ms: Date.now() - t0,
      });
      if (passo.soMarcar) break;
      await alvo.tap();
      await page.waitForTimeout(passo.depoisMs ?? 600);
      break;
    }
    default:
      throw new Error(`ação desconhecida: ${passo.acao}`);
  }
}

export async function gravar(roteiro, pasta, {video = true} = {}) {
  const exe = CHROMIUMS.find((c) => existsSync(c));
  if (!exe) throw new Error('Chromium não encontrado: defina CHROMIUM=/caminho/do/chrome');
  mkdirSync(pasta, {recursive: true});
  const tmpVideo = join(pasta, '.video');
  rmSync(tmpVideo, {recursive: true, force: true});

  const browser = await chromium.launch({executablePath: exe, args: ['--force-color-profile=srgb', '--font-render-hinting=none']});
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: ESCALA,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Bahia',
    colorScheme: 'dark',
    reducedMotion: roteiro.movimentoReduzido ? 'reduce' : 'no-preference',
    ...(video ? {recordVideo: {dir: tmpVideo, size: CAPTURA}} : {}),
  });
  await context.addInitScript(SEMENTE_JS);
  const page = await context.newPage();
  const base = roteiro.base ?? 'http://127.0.0.1:5173';
  const t0 = Date.now();
  const marcas = [];
  const prints = [];
  const consoleErros = [];
  page.on('console', (m) => m.type() === 'error' && consoleErros.push(m.text()));

  if (roteiro.conta) {
    await page.goto(base + (roteiro.entrarEm ?? '/brasil/admin'), {waitUntil: 'load'});
    await page.locator('input[autocomplete="email"], input[autocomplete="username"]').first().fill(roteiro.conta);
    await page.locator('input[autocomplete="current-password"]').first().fill(roteiro.senha ?? SENHA_DEMO);
    await page.locator('form button[type="submit"]').first().click();
    // o Firestore mantém conexão aberta: "networkidle" nunca chega; espera o formulário sumir
    await page.locator('input[autocomplete="current-password"]').first().waitFor({state: 'detached', timeout: 20000});
    await page.waitForTimeout(800);
  }

  for (const [n, passo] of (roteiro.passos ?? []).entries()) {
    try {
      await executar(page, passo, {base, t0, marcas, prints, pasta, ocultar: roteiro.ocultar});
    } catch (e) {
      // print do estado na falha: sem isso, "Timeout" não diz nada
      await page.screenshot({path: join(pasta, `erro-passo-${n + 1}.png`)}).catch(() => {});
      await context.close();
      await browser.close();
      throw new Error(`passo ${n + 1} (${passo.acao} ${passo.nome ?? passo.texto ?? passo.url ?? ''}): ${e.message.split('\n')[0]} · veja erro-passo-${n + 1}.png`);
    }
  }

  await context.close();
  await browser.close();

  let gravacao = null;
  if (video) {
    const webm = readdirSync(tmpVideo).find((f) => f.endsWith('.webm'));
    gravacao = 'gravacao.mp4';
    // taxa variável → 30 fps constantes; o tempo do Remotion bate com as marcas (ms desde o início)
    rodar('ffmpeg', ['-v', 'error', '-y', '-i', join(tmpVideo, webm), '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', '-an', join(pasta, gravacao)]);
    rmSync(tmpVideo, {recursive: true, force: true});
  }

  // confere a dimensão REAL de tudo (lição: captura com altura errada estica o cartão)
  const dimensoes = {};
  for (const p of prints) {
    const s = sonda(join(pasta, p.arquivo)).streams[0];
    dimensoes[p.arquivo] = [s.width, s.height];
    if (s.width !== CAPTURA.width || s.height !== CAPTURA.height) throw new Error(`${p.arquivo} saiu ${s.width}×${s.height}`);
  }
  if (gravacao) {
    const s = sonda(join(pasta, gravacao)).streams.find((x) => x.codec_type === 'video');
    dimensoes[gravacao] = [s.width, s.height];
  }

  let commit = null;
  try {
    commit = execSync('git rev-parse HEAD', {encoding: 'utf8'}).trim();
  } catch {}
  writeFileSync(join(pasta, 'marcas.json'), JSON.stringify({captura: CAPTURA, escala: ESCALA, marcas}, null, 2) + '\n');
  writeFileSync(
    join(pasta, 'origem.json'),
    JSON.stringify(
      {
        fonte: 'produto real, ambiente local de demonstração (testes-e2e/dev-local.sh)',
        rotulo: 'Torcida Brasil · dados de demonstração',
        base,
        conta: roteiro.conta ?? null,
        commitDoProduto: commit,
        gravadoEm: new Date().toISOString(),
        viewport: VIEWPORT,
        escala: ESCALA,
        navegador: exe,
        dimensoes,
        prints,
        ocultado: roteiro.ocultar ?? [],
        errosNoConsole: consoleErros,
      },
      null,
      2,
    ) + '\n',
  );
  return {marcas, prints, dimensoes, consoleErros};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [arqRoteiro, pasta] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!arqRoteiro || !pasta) {
    console.error('Uso: node scripts/gravar-produto.mjs <roteiro.json> <pasta-de-saida> [--sem-video]');
    process.exit(2);
  }
  const roteiro = JSON.parse(readFileSync(arqRoteiro, 'utf8'));
  const r = await gravar(roteiro, resolve(pasta), {video: !process.argv.includes('--sem-video')});
  console.log(`Gravado em ${pasta}: ${r.prints.length} prints, ${r.marcas.length} toques`);
  for (const [a, d] of Object.entries(r.dimensoes)) console.log(`  ${a}: ${d.join('×')}`);
  if (r.consoleErros.length) console.log(`  ATENÇÃO: ${r.consoleErros.length} erro(s) no console do produto → avaliar studio/docs/dividas-do-produto.md`);
}
