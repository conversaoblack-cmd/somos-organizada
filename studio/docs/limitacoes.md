# Limitações conhecidas (medidas, não suposições)

## Nuvem × Mac

| Assunto | Nuvem (Linux, 4 núcleos, 15 GB, sem GPU) | Mac do dono |
|---|---|---|
| WebGL / 3D | por software (`swangle`): still 3D em ~6 s; **~0,4 s por quadro** (60 quadros em 32 s). Peça de 30 s com 3D o tempo todo ≈ 6 min de render | GPU (`angle`): mais rápido; medir com `node scripts/testar-render.mjs` e registrar aqui |
| Render 2D (TesteKit, 180 quadros 1080×1920) | ~50 s | a medir |
| Voz guia | espeak-ng (robótica; só cronometra) | `say -v Luciana` |
| Ouvir a voz final | não dá (sem alto-falante) | sim |
| Whisper | `ggml-small` (0,5 GB; baixa de novo a cada contêiner) | `ggml-large-v3-turbo` |

## Determinismo do render (medido em 15/10/2026)

- **3D (`TesteCelular3D`):** dois renders com framemd5 idêntico.
- **2D com texto (`TesteKit`):** em cerca de 1 a cada 4 renders, o Chrome (raster por software) varia **±1 de intensidade
  em algumas dezenas de pixels na borda de um texto**. PSNR do pior quadro: 75 dB (invisível). Testado e **não resolve**:
  `--gl=swiftshader` (pior), processo único do Chrome, `--muted`, codificação não paralela. A sequência PNG tem a mesma
  oscilação, só mais rara.
- Por isso `scripts/testar-render.mjs` dá 3 vereditos: **IDÊNTICO**, **RUÍDO DE RASTER** (PSNR mínimo ≥ 60 dB) ou
  **DIFERENTE** (não determinismo de verdade: aleatório, timer, CSS animation). "DIFERENTE" reprova.
- Achados que viraram regra (e reduziram a oscilação):
  1. **não animar `transform: scale` em elemento com sombra desfocada ou filtro**: o Chrome reaproveita o raster da
     escala anterior conforme o tempo de CPU; animar o tamanho real (`AnelAlvo` já faz isso);
  2. **GSAP sem `translate3d`** (`gsap.config({force3D: false})` na ponte): camada de GPU dá raster dependente do tempo;
  3. codificação paralela desligada (`Config.setDisallowParallelEncoding(true)`): menos disputa de CPU na captura.
- Consequência prática: dois MP4 de entrega podem não ser idênticos byte a byte na nuvem; o conteúdo visual é. Para
  comparar versões, use PSNR/framemd5 por cena, não o hash do arquivo.

## Google Drive (entrega)

- O conector do Google Drive desta conta **funciona**, mas recebe o arquivo **em base64 dentro da própria chamada**
  (passa pelo texto do modelo). Testado em 15/10/2026 com um MP4 de 12 KB: chegou íntegro (mesmo tamanho) em
  "Somos Organizada · Motion/2026-10-15-teste-estudio/teste-estudio-v0.mp4".
- Um MP4 de entrega (dezenas de MB) viraria milhões de tokens: **inviável pela nuvem**. Decisão (seção 10.1 do prompt):
  o **render de entrega é feito no Mac do dono** e salvo na pasta do Drive; a nuvem entrega o código pronto e o comando
  exato. Prévias leves (PNG de styleframe, MP4 de rascunho pequeno) podem ir pelo chat.

## Áudio

- A legenda é distribuída no tempo **falado** da fala, com peso pelo tamanho da palavra. Se a legenda **resume** a fala
  (palavras diferentes), o tempo das palavras fica aproximado: o `alinhar-take.mjs` avisa. Regra: legenda acompanha a
  fala palavra por palavra (só os números mudam: "dez" → "10").
- O whisper só guia o corte (ordem). O tempo dentro da frase vem dos silêncios reais.
- ElevenLabs: não testada (sem `ELEVENLABS_API_KEY`). O `gerar-take.mjs --elevenlabs` está escrito pela API documentada
  (`POST /v1/text-to-speech/{voz}`); testar com a chave antes da primeira peça.

## Captura do produto

- "networkidle" nunca chega (o Firestore mantém conexão aberta): o `gravar-produto.mjs` espera elementos visíveis.
- No celular, o menu lateral escondido repete textos ("Visão geral"): o script sempre pega o primeiro alvo **visível**.
- O tour do 1º acesso aparece uma vez por conta: passo `opcional`.
- Ambiente local mostra avisos de modo de teste da Pagar.me: cortar ou cobrir na peça.
- A gravação do Playwright sai em 1170×2532 (taxa variável → convertida para 30 fps constantes); conferida com ffprobe.

## API do Remotion que mudou

- `useOffthreadVideoTexture` (citado no prompt) foi **descontinuado**. Vídeo como textura 3D agora é
  `<Video headless>` do `@remotion/media` + `onVideoFrame` + `advance()` no render (`Celular3D.tsx`). Ainda não testado
  com uma gravação real dentro do 3D (só imagem); testar na primeira peça que precisar.

## Zona essencial

- Valores 9:16 conservadores (`src/formatos.json`). **Conferir com um print atual do Instagram antes de publicar.**
