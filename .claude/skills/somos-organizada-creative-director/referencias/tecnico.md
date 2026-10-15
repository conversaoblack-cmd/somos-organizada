# Leitura técnica obrigatória antes do primeiro `.tsx`

Caminhos relativos a `studio/`.

## Do estúdio (o que já foi decidido e medido)

1. `docs/limitacoes.md`: o que a nuvem não faz bem (3D por software, ruído de raster, Drive) e as regras que nasceram disso.
2. `docs/decisoes.md`: decisões em vigor.
3. `src/marca/tokens.ts`, `src/formatos.json` (zona essencial), `src/lib/movimento.ts`, `src/lib/gsap-ponte.ts`.
4. `src/biblioteca/`: `Legenda`, `FaixaTexto`, `Mosaico`, `Celular3D`, `RecorteApp`, `Toque` (`AnelAlvo`), `Foco`,
   `CardMarca`, `transicoes` (virada de placa), `Logo`. Reutilize; não reescreva.

## Skills oficiais (em `.claude/skills/`, procedência em `PROCEDENCIA.md`)

- `remotion-markup/SKILL.md` e, conforme a peça: `multi-scene-video.md`, `transitions.md`, `connected-compositions.md`,
  `3d.md`, `effects.md`, `motion-blur.md`, `audio.md`, `voiceover.md`, `sfx.md`, `timing.md`, `sequencing.md`,
  `measuring-text.md`, `local-fonts.md`.
- `remotion-captions/display-captions.md` (o tipo `Caption`).
- `remotion-render/SKILL.md` (parâmetros de saída).
- `gsap-timeline/SKILL.md` e `gsap-core/SKILL.md` (só pela ponte determinística).
- Dúvida de API: `remotion-docs` (busca a documentação atual; a API muda: `useOffthreadVideoTexture` foi descontinuado).

## Regras que já custaram caro

- Animação só por `useCurrentFrame()` + `interpolate()`. Nada de `useFrame`, timer, CSS animation ou aleatório sem semente
  (`random('semente')` do Remotion).
- **Não anime `transform: scale` em elemento com sombra desfocada/filtro** (o Chrome reaproveita raster velho conforme o
  tempo): anime o tamanho real. GSAP sem `translate3d` (`force3D: false` já está na ponte).
- Vídeo como textura 3D: `<Video headless>` do `@remotion/media` + `onVideoFrame` + `advance()` no render (ver
  `Celular3D.tsx`). Gravação mais rápida/lenta: frame calculado na mão (`<Sequence from>`).
- Z-fighting: `near` ≈ 4; objeto 3D no escuro precisa de luz própria e `MeshStandard`.
- Overlay 2D preso a ponto do 3D: projete com a câmera a cada frame.
- Recorte de captura: declare a dimensão real (o `RecorteApp` derruba o render se não bater); cartão inteiro ou degradê.
- Foco: recorte arredondado (`Foco.tsx`), nunca retângulo escuro por cima.
- Anel de toque termina no quadro do toque; gesto essencial ≥ 1,5 s (o `AnelAlvo` derruba o render se for menor).
- Legenda: "pulo" é deslocamento vertical (−0,06 em), nunca escala; régua de leitura (`janelasDosBlocos`).
- Peça acelerada (`<Sequence playbackRate>`): `<Audio>` fora do Sequence; multiplique pela velocidade a régua de leitura
  e o tempo mínimo dos anéis (props `velocidade`).

## Pipeline de áudio (seção 6.5 do prompt)

```
audio/<peca>/narracao.json      (falas: id, frame, texto por extenso, legenda com algarismos)
node audio/gerar-take.mjs <peca> --guia          voz guia (cronometrar; nunca publicar)
node audio/gerar-take.mjs <peca> --elevenlabs    take final (custa créditos; confirme com o dono)
node audio/alinhar-take.mjs <peca>               corta nos silêncios reais (whisper só como guia de ordem)
node audio/narrar.mjs <peca>                     posiciona as falas, mede sobreposição, gera legenda.json
node audio/montar-trilha.mjs <peca>              trilha + SFX + voz, ducking, −14 LUFS, TP ≤ −1 dBTP
```

Render de entrega: `npx remotion render src/index.ts <Id> campanhas/<pasta>/render/<slug>-vN.mp4` (concorrência 1 vem do
`remotion.config.ts`). Na nuvem, 3D custa ~0,4 s por quadro; render pesado de 3D vai para o Mac do dono.
