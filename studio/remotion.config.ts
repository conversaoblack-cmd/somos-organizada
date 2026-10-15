import {Config} from '@remotion/cli/config';
import {existsSync} from 'node:fs';

// Nuvem: usa o Chromium que já vem instalado (não baixa outro). Mac: `npx remotion browser ensure`.
const CHROMIUM_NUVEM = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
if (existsSync(CHROMIUM_NUVEM)) Config.setBrowserExecutable(CHROMIUM_NUVEM);

Config.setEntryPoint('src/index.ts');
Config.setOverwriteOutput(true);
Config.setConcurrency(1); // render de ENTREGA com 1 aba = MP4 idêntico byte a byte; rascunho: --concurrency=4
// Menos disputa de CPU durante a captura. A causa real do MP4 não idêntico era `transform: scale` animado sobre
// sombra desfocada (o Chrome reaproveita raster velho conforme o tempo): ver docs/limitacoes.md.
Config.setDisallowParallelEncoding(true);
// Mac usa a GPU; a nuvem não tem GPU e roda o WebGL por software.
Config.setChromiumOpenGlRenderer(process.platform === 'darwin' ? 'angle' : 'swangle');
Config.setVideoImageFormat('png'); // intermediário sem perda
Config.setCodec('h264');
Config.setPixelFormat('yuv420p'); // compatibilidade máxima (Instagram, TikTok, WhatsApp)
Config.setVideoBitrate('10M'); // mestre: degradê escuro precisa de bitrate antes da recompressão da plataforma
Config.setColorSpace('bt709'); // tag de cor explícita: o azul #2E6BFF e o amarelo #FFCC00 não deslocam
