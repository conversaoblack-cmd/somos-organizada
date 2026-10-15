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
 *     {"acao": "digitar", "seletor": "input[name=nome]", "texto": "Caravana"},   // "lento": 70 = letra por letra (vídeo)
 *     {"acao": "rolar", "y": 600},
 *     {"acao": "pausa", "ms": 800},
 *     {"acao": "tocar", "texto": "Pular", "exato": true, "opcional": true}  // toca se aparecer; não vira marca
 *   ],
 *   "cameraFalsa": "caminho/qr.y4m",           // opcional: vídeo que o navegador usa como câmera (leitor de QR real)
 *   "ocultar": [                                 // cobre o que não é assunto da cena (registrado no origem.json)
 *     {"seletor": "button[aria-label^='Ajuda']"},
 *     {"texto": "Ambiente de teste da Pagar.me", "subir": 1}
 *   ]
 * }
 *
 * Saída em <pasta>: <nome>.png (1170×2532 conferido com ffprobe), gravacao.mp4 (fluida, gravada em 1× e ampliada) e gravacao-nitida.mp4 (3×, ~9 quadros/s), ambas h264, 30 fps constantes, 1170×2532,
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
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
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

async function executar(page, passo, {base, t0, marcas, prints, pasta, ocultar, capturar}) {
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
    case 'digitar': {
      const campo = localizar(page, passo);
      if (passo.lento) {
        // no vídeo, a pessoa digita: letra por letra (passo.lento = ms entre teclas)
        await campo.scrollIntoViewIfNeeded();
        await campo.focus();
        await campo.fill('');
        await campo.pressSequentially(passo.texto ?? '', {delay: passo.lento});
      } else await campo.fill(passo.texto ?? '');
      await page.waitForTimeout(passo.depoisMs ?? 0);
      break;
    }
    case 'print': {
      await aplicarOcultar(page, ocultar);
      await page.evaluate(() => document.fonts.ready);
      const arq = `${passo.nome}.png`;
      // gravando vídeo: captura direta em 3× (o page.screenshot do Playwright mexe na emulação da tela por um instante
      // e o screencast solta quadros tortos); sem vídeo: o print normal, com animações paradas e sem cursor
      if (capturar) writeFileSync(join(pasta, arq), await capturar());
      else await page.screenshot({path: join(pasta, arq), animations: 'disabled', caret: 'hide'});
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

  // câmera falsa (portaria): o Chromium "filma" um vídeo .y4m/.mjpeg; o leitor real do produto decodifica o QR dele
  const camera = roteiro.cameraFalsa ? resolve(roteiro.cameraFalsa) : null;
  if (camera && !existsSync(camera)) throw new Error(`cameraFalsa não existe: ${camera}`);
  const argsCamera = camera ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${camera}`] : [];
  // LANG do processo: o campo de data do Chromium formata pelo idioma do sistema (sem isso sai "11/07/2026, 01:00 PM")
  const browser = await chromium.launch({executablePath: exe, env: {...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR', LC_ALL: 'pt_BR.UTF-8'}, args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--lang=pt-BR', '--disable-spell-checking', ...argsCamera]});
  const context = await browser.newContext({
    ...(camera ? {permissions: ['camera']} : {}),
    viewport: VIEWPORT,
    deviceScaleFactor: ESCALA,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Bahia',
    colorScheme: 'dark',
    reducedMotion: roteiro.movimentoReduzido ? 'reduce' : 'no-preference',
  });
  await context.addInitScript(SEMENTE_JS);
  // corretor ortográfico do navegador desligado: a nuvem só tem dicionário em inglês e sublinharia "Ônibus" de vermelho
  // (configuração do aparelho, não estado do produto; registrado no origem.json)
  await context.addInitScript(() => {
    document.addEventListener('focusin', (e) => { if (e.target && 'spellcheck' in e.target) e.target.spellcheck = false; }, true);
  });
  const page = await context.newPage();
  const base = roteiro.base ?? 'http://127.0.0.1:5173';
  const t0 = Date.now();
  const marcas = [];
  const prints = [];
  const consoleErros = [];
  page.on('console', (m) => m.type() === 'error' && consoleErros.push(m.text()));

  // DUAS gravações ao mesmo tempo (lição de 15/10/2026):
  // - gravacao.mp4 (fluida): screencast do Chromium (CDP), ~30–60 quadros/s, mas SEMPRE em 1× (390×844) — o
  //   screencast ignora o 3× do aparelho (só alguns quadros logo depois de um print saem em 3×; misturar os dois
  //   tamanhos dava quadros "ampliados"). Por isso ele é fixado em 1× e ampliado no fim: serve para a tela do celular.
  // - gravacao-nitida.mp4: capturas em 3× (clip com scale 3) em laço, ~9 quadros/s: texto nítido para os recortes
  //   ampliados (digitação, telas de resultado). Animação curta (gaveta do menu, aviso) sai em degraus.
  // O recordVideo do Playwright gravava em 1× no canto de um quadro cinza.
  const quadros = [];
  const nitidos = [];
  const gravando = [];
  let cdp = null;
  let parar = false;
  let laco = null;
  let capturar = null;
  if (video) {
    mkdirSync(tmpVideo, {recursive: true});
    cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', ({data, metadata, sessionId}) => {
      const ms = metadata?.timestamp ? metadata.timestamp * 1000 - t0 : Date.now() - t0;
      const arq = join(tmpVideo, `q${String(quadros.length).padStart(5, '0')}.jpg`);
      quadros.push({arq, ms, meta: metadata});
      writeFileSync(arq, Buffer.from(data, 'base64'));
      gravando.push(cdp.send('Page.screencastFrameAck', {sessionId}).catch(() => {}));
    });
    await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 95, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 1});
    const cdpNitido = await context.newCDPSession(page);
    capturar = async () =>
      Buffer.from((await cdpNitido.send('Page.captureScreenshot', {format: 'png', clip: {x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height, scale: ESCALA}})).data, 'base64');
    laco = (async () => {
      while (!parar) {
        const antes = Date.now() - t0;
        const r = await cdpNitido
          .send('Page.captureScreenshot', {format: 'jpeg', quality: 92, clip: {x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height, scale: ESCALA}})
          .catch(() => null);
        if (!r) break;
        const arq = join(tmpVideo, `n${String(nitidos.length).padStart(5, '0')}.jpg`);
        writeFileSync(arq, Buffer.from(r.data, 'base64'));
        nitidos.push({arq, ms: (antes + (Date.now() - t0)) / 2});
      }
    })();
  }

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
      await executar(page, passo, {base, t0, marcas, prints, pasta, ocultar: roteiro.ocultar, capturar});
    } catch (e) {
      // print do estado na falha: sem isso, "Timeout" não diz nada
      await page.screenshot({path: join(pasta, `erro-passo-${n + 1}.png`)}).catch(() => {});
      await context.close();
      await browser.close();
      throw new Error(`passo ${n + 1} (${passo.acao} ${passo.nome ?? passo.texto ?? passo.url ?? ''}): ${e.message.split('\n')[0]} · veja erro-passo-${n + 1}.png`);
    }
  }

  const fimMs = Date.now() - t0;
  parar = true;
  if (cdp) {
    await cdp.send('Page.stopScreencast').catch(() => {});
    await Promise.all(gravando);
    await laco;
  }
  await context.close();
  await browser.close();

  // quadros com instante próprio → 30 fps constantes; o 1º cobre desde o início, então o tempo do vídeo = ms das marcas
  const montarVideo = (lista, nome) => {
    lista.sort((a, b) => a.ms - b.ms);
    const linhas = [];
    lista.forEach((q, i) => {
      const de = i === 0 ? 0 : q.ms;
      const ate = i + 1 < lista.length ? lista[i + 1].ms : fimMs;
      linhas.push(`file '${q.arq}'`, `duration ${Math.max(0.001, (ate - de) / 1000).toFixed(4)}`);
    });
    linhas.push(`file '${lista[lista.length - 1].arq}'`);
    const arqLista = join(tmpVideo, `${nome}.txt`);
    writeFileSync(arqLista, linhas.join('\n') + '\n');
    rodar('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', arqLista, '-vf', `scale=${CAPTURA.width}:${CAPTURA.height}:flags=lanczos,fps=30`, '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', '-an', join(pasta, nome)]);
    return nome;
  };
  const gravacao = video && quadros.length ? montarVideo(quadros, 'gravacao.mp4') : null;
  const gravacaoNitida = video && nitidos.length ? montarVideo(nitidos, 'gravacao-nitida.mp4') : null;
  if (process.env.GUARDAR_QUADROS) writeFileSync(join(tmpVideo, 'quadros.json'), JSON.stringify(quadros.map(({arq, ms, meta}) => ({arq, ms, meta})), null, 1));
  else rmSync(tmpVideo, {recursive: true, force: true});

  // confere a dimensão REAL de tudo (lição: captura com altura errada estica o cartão)
  const dimensoes = {};
  for (const p of prints) {
    const s = sonda(join(pasta, p.arquivo)).streams[0];
    dimensoes[p.arquivo] = [s.width, s.height];
    if (s.width !== CAPTURA.width || s.height !== CAPTURA.height) throw new Error(`${p.arquivo} saiu ${s.width}×${s.height}`);
  }
  for (const g of [gravacao, gravacaoNitida].filter(Boolean)) {
    const s = sonda(join(pasta, g)).streams.find((x) => x.codec_type === 'video');
    dimensoes[g] = [s.width, s.height];
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
        configuracaoDoAparelho: ['idioma pt-BR', 'corretor ortográfico desligado', ...(camera ? [`câmera falsa: ${camera}`] : [])],
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
