# Decisões do estúdio (memória entre sessões)

Registre aqui decisão, mudança de arquitetura, risco aceito e conclusão de fase. Não registre conversa nem código.

## 15/10/2026 · Montagem do estúdio (fase 1 concluída; nenhuma peça produzida)

**Estado:** estúdio montado e testado na nuvem; aguardando respostas do dono às perguntas "a definir" e a chave da
ElevenLabs. Nenhuma peça começa antes disso.

**Decidido:**
- **Branch:** o trabalho foi feito em `claude/peaceful-shannon-e5byzc` (a branch que esta sessão da nuvem recebeu), a
  partir do mesmo commit de `claude/firebase-access-oxibba` (`974ac11`). Não foi enviado para a `firebase-access-oxibba`
  para não disputar com a sessão do produto sem o dono pedir. Juntar = um merge (só toca `studio/`, `.claude/agents/`, a
  skill do diretor e 1 linha do `CLAUDE.md`).
- **Stack fixada:** Remotion 4.0.535 (todas as `@remotion/*` iguais), R3F 9.8.2, three 0.186.1, GSAP 3.15.0, React 19.2.0,
  TS 5.9.3, playwright-core 1.56.1 (casa com o Chromium 1194 da nuvem). `@remotion/fonts` entrou para carregar a Archivo local.
- **Vídeo como textura 3D:** `@remotion/media` `<Video headless>` + `advance()` (o `useOffthreadVideoTexture` do prompt
  foi descontinuado).
- **Determinismo:** concorrência 1 + codificação não paralela + regras "sem `scale` animado sobre sombra" e "GSAP sem
  translate3d". Na nuvem, 2D com texto pode variar ±1 em poucos pixels (PSNR ≥ 75 dB): aceito como "ruído de raster";
  o teste reprova só o que passa disso. 3D: idêntico.
- **Áudio fora do Remotion:** mix, ducking e loudness em Node + ffmpeg (`montar-trilha.mjs`), byte a byte reproduzível;
  ducking por curva calculada dos tempos reais das falas (não sidechain). Limitador a 192 kHz: −14,1 LUFS / −1,5 dBTP no teste.
- **Take da ElevenLabs vai para o Git** (`audio/<peca>/take/take-elevenlabs.mp3`, ~1 MB): regerar custa crédito e muda a voz.
  Voz guia e falas cortadas não vão (são refeitas).
- **Zona essencial e rubrica em JSON** (`src/formatos.json`, `auditoria/criterios.json`): fonte única para código, scripts e docs.
- **Entrega:** MP4 final renderizado no Mac e salvo no Drive pelo dono (conector do Drive só aguenta arquivo minúsculo).
  Pasta criada: "Somos Organizada · Motion" (Drive do dono).
- **Mesa:** 6 agentes em `.claude/agents/` com `tools: Read, Glob, Grep, Write` (escrevem só o próprio parecer).
- **Componentes que se protegem sozinhos:** `AnelAlvo` derruba o render com gesto < 1,5 s; `RecorteApp` derruba se a
  dimensão declarada da captura não bater com a real.

**Descartado:** `remotion-maps`, `remotion-saas`, `gsap-scrolltrigger` (fora do escopo); `--gl=swiftshader` e Chrome em
processo único (não resolvem o ruído); esperar "networkidle" na captura (nunca chega).

**Números medidos:** render 2D 180 quadros ≈ 50 s; 3D ≈ 0,4 s/quadro; still 3D ≈ 6 s; build do whisper ≈ 70 s;
pipeline de áudio de teste (3 falas) ≈ 12 s.

**Em aberto (perguntar ao dono):** ver a resposta da sessão de 15/10/2026 (público da 1ª peça, voz, música, perfil do
Instagram, licença do Remotion, frase da taxa de 10%, pessoas filmadas, referências visuais, área de respiro do logo,
semântica completa das cores).

## 15/10/2026 · Apresentação: do roteiro ao portão visual (rodada 2)

**Estado:** peça `campanhas/2026-10-15-apresentacao/` inteira em código (1350 quadros, 45 s). O roteiro passou pela mesa
(rodada 0: todos aprovaram com condição; condições aplicadas). Portão visual: rodada 1 vetada pela motion-review; a
direção de arte das cenas de produto foi refeita (v2) e está na rodada 2 (1ª das 2 correções permitidas).

**Decidido pelo dono:** voz da ElevenLabs só no fim (o dono gera à mão a partir do texto que o estúdio entrega:
`node audio/gerar-take.mjs apresentacao --texto`); Remotion grátis (2 pessoas); a taxa de 10% pode aparecer. Frase:
"A taxa de 10% vira caixa da torcida. O ingresso só precisa pagar o evento."

**Decidido pelo diretor:**
- **Território:** arquibancada 3D de placas que viram (mosaico) e uma câmera global contínua; o 2×2 da marca nasce das
  placas na virada (252). Cor semântica vira luz: vermelho = problema, azul = ação, amarelo = o que entra.
- **v2 das cenas de produto** (aceito o veto "animação de interface"): o celular fica dentro do 3D, posicionado a partir
  da câmera (`pontoNaTela`), com luz pontual na cor da cena acendendo as placas em volta. A prova é o recorte exato da
  captura real (`provas.ts`, regiões medidas em pixel, nunca no olho), num andar fixo, ligada ao celular por um feixe.
  Andares: assinatura 270–335 · frase 350–570 · prova 545–1080 · legenda 1095–1250 (caixa sólida) · celular abaixo.
- **CTA:** câmera calculada por projeção (script de mínimos quadrados sobre a geometria do `Palco`), não por tentativa:
  abaixo da 1ª fileira, olhando para cima, a arquibancada enche o quadro até embaixo. Um eixo (x 120), um CTA (rótulo
  real do site), linhas legais a 44 px com quebra escolhida à mão.
- **Trilha:** leito antes da virada ~11 dB abaixo do pós-virada, com impacto no 252 (a virada precisa soar como chegada).
- **Desvio aceito pelo diretor (levado à mesa):** a linha "Taxa de serviço (10%)" fica com ~38 px, não 44; com a tela
  real, mais que isso só falseando o layout.

**Aprendizados:**
- Medir região de captura em pixel (script), nunca pela imagem exibida no chat: ela vem reduzida e o erro passou de 30 px.
- Sobre `git pull`: usar `git pull --no-rebase` (ou `--rebase=merges`) nesta branch; rebase linear desfazia merges.
- O QC num trecho curto acusa loudness fora do alvo quando o trecho é só a parte cheia; vale a medida da mix inteira.
