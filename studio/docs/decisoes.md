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

**Resultado do portão (rodada 2):** motion-review derrubou o veto (APROVA COM CONDIÇÃO; gancho 7,5, visual 8,0,
fidelidade 7,5, técnica 7,5) e torcida-review APROVA COM CONDIÇÃO (fidelidade 9,0, objetivo 8,0). Aplicado antes de
mandar ao dono: frase da cena 2 "A torcida cresceu, o caderno não." (a falha é da ferramenta, não da torcida); barrado
com a grade a 30% e anel vermelho; celular e feixe no eixo x 450; sócio inteiro; foco da taxa mais leve. Fica para a
produção: torres cortadas no gancho, eixo único na cena da taxa, luz de borda do celular mais forte, "mensalidade" com
dois sentidos (opção "Plano mensal fixo"), prévias do produto e do mergulho do CTA em movimento. A "queda" de áudio em
211–216 é o vão entre batidas do surdo de tensão, não emenda. Mix inteira: −14,1 LUFS, −1,3 dBTP.

## 15/10/2026 · Apresentação: telas do produto GRAVADAS em uso e bateria gravada (pedido do dono)

**Pedido do dono (após aprovar a direção):** as telas não pareciam o sistema; mostrar a portaria com o leitor de QR e o QR
dando "já utilizado", e o painel da diretoria com a pessoa abrindo o menu e criando o evento. A percussão sintetizada
"pode não ficar tão boa": buscar música/percussão sem licença a pagar. Perfil: @somosorganizada.

**Decidido:**
- **Fluxos gravados do produto real** (`captura/portaria-camera.json`, `diretoria-evento.json`, `ingresso.json`) no
  **build de produção apontado para os emuladores** (`vite build/preview --mode emulador`, porta 4173, como o
  `testes-e2e/navegador.sh`). No modo de desenvolvimento o StrictMode monta o leitor duas vezes e a câmera não chega ao vídeo.
- **Portaria com câmera de verdade:** `scripts/camera-falsa.mjs` gera um .y4m 1280×720 (o leitor pede ≥ 1024 px) do
  celular do torcedor com o QR REAL do ingresso, espelhado (o leitor espelha câmera sem lado; espelhado na origem aparece
  como na câmera traseira). O leitor real decodifica: LIBERADO; o mesmo QR depois de 5 s fora da câmera: JÁ UTILIZADO
  (a portaria ignora o mesmo QR enquanto ele não sai 3 s da câmera).
- **Gravador (`gravar-produto.mjs`):** duas gravações simultâneas, fluida (screencast, sempre 1×) e nítida (capturas 3×
  a ~9 quadros/s); prints por captura direta (o `page.screenshot` mexia na emulação e o screencast soltava quadros tortos);
  digitação letra por letra; pt-BR (`LANG` do processo: a data saía "11/07/2026, 01:00 PM"); corretor desligado.
- **Vídeo no Remotion em WebM VP9:** o Chromium daqui não decodifica H.264 pelo WebCodecs; o `@remotion/media` caía no
  `<OffthreadVideo>` (um `<Img>`), que quebra dentro do 3D.
- **Na peça:** cena 5 = a portaria gravada (câmera → LIBERADO no 561 → mesmo QR → JÁ UTILIZADO no 612, com as placas
  vermelhas); cena 7a = a diretoria digitando o valor e o sistema mostrando "Torcedor paga R$ 143,00 (inclui 10% de
  taxa)"; cena 7b = menu → "Novo evento" → "Evento publicado!". O celular na arquibancada toca a mesma gravação. Instantes
  medidos na gravação (cor da tela, mudança de quadro), nunca no olho.
- **Verde do LIBERADO:** é a cor real do produto nesse estado e o dono pediu a tela como ela é; entra dentro do cartão da
  prova e do celular. Anel, feixe e luz continuam brancos (verde segue fora da marca).
- **Bateria gravada CC0** (Felix Blume, "Batucada rehearsal in Chile", Freesound 411465): pulso medido 82,46 BPM, 30
  compassos 2/4 de acento a acento, acelerados 1,2127× sem mudar afinação (rubberband) para a grade de 100 BPM; acentos a
  ±25 ms da grade. Tensão sintetizada antes (−11,8 LUFS de contraste), bateria "lá fora" no breakdown (−9), corte seco
  no 1332 com impacto. `audio/montar-batucada.mjs` + `audio/apresentacao/batucada.json`.
- CTA: "Plano mensal fixo, sem % das vendas." (antes "Mensalidade fixa": "mensalidade" já é a do sócio no gancho).

**Descartado (música):** Wikimedia (CC-BY), discos comerciais com marcação de domínio público falsa, "Public Domain Mark"
sem renúncia formal (Cavro), Pixabay (sem garantia sobre Content ID), gravações com voz de rádio ou canto.

## 15/10/2026 · Apresentação: rodada 3 (peça completa) e a última correção

**Resultado da rodada 3:** 8,16 (meta 9,0), cobertura 100%, sem veto nem bloqueio. produto-review APROVA; motion,
roteirista, marketing, estratégia e torcida APROVA COM CONDIÇÃO. Correção aplicada = 2ª e última rodada permitida.

**Aceito e feito:**
- Cenas 7a/7b na ordem real (roteirista, produto): 828–936 "A diretoria decide o preço" (menu → Eventos → "+ Novo
  evento" com foco → nome → valor) com a voz "O ingresso só precisa pagar o evento"; 936–1080 "10% vira caixa" com o
  close no "Torcedor paga R$ 143,00 (inclui 10% de taxa)" a ~40 px e contorno amarelo, voz da taxa. Mosaico e câmera
  seguem a nova virada (936); SFX de virada leve no 936.
- Fala do CTA no quadro 1176 (marketing, motion, estratégia, roteirista): na voz guia termina no 1343; o take final
  precisa terminar até 1320 (condição da voz).
- Prova da planilha: só o 1º lançamento, inteiro, a 0,78× (antes 0,6× e cortando "+ R$ 12,00 de taxa").
- "Contas prontas na planilha" (antes "abertas": lia-se como prestação de contas pública, que não existe).
- "Direto na conta de cada sede" (o cartão fala em subsede).
- Celular da cena do sócio só com a frente da carteirinha (a tela "em dia" trazia o preço do plano do sócio).
- Cena 8 sai inteira antes do mergulho do CTA (1150–1170).
- Vermelho do barrado apaga antes do amarelo (sem laranja de brasa).
- Sopro baixo no 84 para não deixar ~0,9 s de ar morto no fim do gancho.
- Procedência da bateria arquivada (`audio/biblioteca/*.PROCEDENCIA.md`): tags e descrição sem barra, hinchada,
  clube ou estádio; o dono ainda ouve o trecho.

**Recusado (com motivo):**
- "Teste grátis em modo demonstração" no cartão final (marketing): a 5ª linha sairia da zona (y > 1250) e a estratégia
  mostrou que prometer teste imediato frustra quem depois grava o vídeo de verificação. Vai no texto do post.
- Voz do CTA dizer "Cadastrar minha torcida" (roteirista): a voz convida ("Cadastre sua torcida"), o botão rotula.
- Igualar R$ 130 da Caravana da semifinal com os R$ 120 da planilha (roteirista): são eventos diferentes, ambos reais
  no ambiente de demonstração.
- Regravar a câmera da portaria com celular e mão de verdade (produto, risco): a entrega diz "leitor real, QR real,
  câmera simulada".
- Publicar evento e "Evento publicado!" saíram da peça (a ordem nova termina a 7a no valor; o aviso ficava ≤ 0,6 s).

## 16/10/2026 · Apresentação: voz final (take do dono)

- Take do dono: ElevenLabs, voz "Mário - Excited, Constant and Cheerful", Multilingual v2, speed 0,9, stability 50,
  similarity 75, style 15 (`audio/apresentacao/take/take-elevenlabs.mp3`, no Git: gerar de novo custa crédito e muda a voz).
  O dono gostou da voz. Cortes conferidos pela transcrição (whisper): as 10 falas certas.
- A voz é animada e rápida: 5 falas acima de 2,6 palavras/s (gancho e evento ~3,2). Cada uma desacelerada **só até
  2,6** (fator 0,81–0,95), com `rubberband` de formantes preservados no lugar do `atempo` (soa menos metálico).
  Resultado: todas entre 2,28 e 2,59 palavras/s. O dono precisa ouvir se o gancho e o evento (≈18% mais lentos) ficaram
  naturais; se não, a alternativa é gerar só essas duas falas de novo com speed menor.
- CTA no 1168 (termina no 1327, antes do impacto do 1332, que fica no fim da fala); prova no 1086 (respiro de 0,27 s
  antes do CTA). "Somos Organizada" ficou na voz.
- Mix final: −14,1 LUFS, true peak −1,5 dBTP.
- A transcrição ouviu "subsédio" em "Cada subsede recebe direto": o dono confere a pronúncia.

## 16/10/2026 · Apresentação: conferência final (rodada 4) e fechamento

**Resultado:** 8,49 (meta 9,0) · ABAIXO DA META, sem veto nem bloqueio. produto, marketing e roteirista APROVA; motion,
torcida e estratégia APROVA COM CONDIÇÃO, só de publicação. As 2 rodadas de correção foram usadas; nota sem inflar.
Por critério: objetivo 8,50 · clareza 8,83 · gancho 7,83 · visual 8,00 · fidelidade 8,75 · cta 8,75 · técnica 9,00.

**Para publicar (do dono):** ouvir a bateria (sem canto ou puxador), "subsede" (a transcrição ouviu "subsídio") e a
naturalidade do gancho e do evento desacelerados; confirmar a licença comercial da ElevenLabs; render no Mac com QC
igual e folha conferida (condição da motion). Texto do post corrigido: o teste em modo demonstração vem depois do vídeo
de verificação; o comentário fixado não diz mais "fica com tudo" (na sede principal as tarifas saem do total da torcida).

**Dívidas para a próxima peça (sem rodada para corrigir nesta):** recorte da 7a (828–936) cortando texto nas bordas;
planilha em ~32 px e sem o botão "Baixar planilha"; visor vazio no início da portaria; halo verde do LIBERADO nas
placas; anel de toque sobre o rótulo do botão; torres nas bordas do gancho; a tela mostra "caixa da diretoria" e a voz
diz "caixa da torcida" (termo do produto: avaliar em `dividas-do-produto.md`); valores intermediários da digitação a
~9 quadros/s (R$ 1,30 / R$ 1,43) visíveis numa pausa.

**Aprendizados para o processo:**
- Gravar o produto com duas gravações (fluida 1× para o aparelho, nítida 3× para recortes) e medir instantes no arquivo
  final (WebM), não nas marcas do roteiro (a nítida chega ~0,3 s depois).
- Recorte de gravação precisa de região conferida no quadro do instante usado: o layout rola com o foco do campo.
- Para recortes legíveis (≥ 40 px), a região não pode passar de ~840 px da captura 3×; plano de cena que precisa de texto
  pequeno do produto deve prever o close desde a captura.
- Voz animada da ElevenLabs sai acima de 2,6 palavras/s: pedir speed ~0,8 ao dono ou contar com rubberband até 2,6.
- Render completo na nuvem: ~40 min (3D por software + vídeo); para ajuste localizado, renderizar só o trecho e emendar
  quadro a quadro (conferido por PSNR ~50 dB fora do trecho).

## 16/10/2026 · Apresentação: retorno do dono sobre a versão 8,49 → nova versão (v3), meta 9,5

**O dono (verbatim no essencial):** a narração não ficou nada boa; a legenda não está boa; o mockup do celular navegando
não está bom; "não precisa ter nosso slogan, nosso nome, Torcida Brasil, dados de demonstração" (assinatura e rótulo
fora); alguns recortes do sistema ficaram bons, mas podem ser maiores; ficou poluído (gravação num quadradão, celular
embaixo, arquibancada de quadradinhos chamando atenção atrás, legenda): precisa de harmonia. O roteiro (conteúdo) agrada.
**Meta desta peça: 9,5** (decisão do dono, acima da meta padrão de 9,0).

**Decidido:**
- Nova versão da peça (v3), pedida pelo dono: as rodadas de correção da versão anterior não contam para esta.
- **Voz primeiro:** o dono gera a narração completa com a configuração nova (`audio/apresentacao/take/PARA-ELEVENLABS.md`)
  e o vídeo é montado em cima da voz (cortes no tempo da fala), sem desacelerar voz.
- **Sem assinatura "SOMOS ORGANIZADA" nas cenas e sem o rótulo "Torcida Brasil · dados de demonstração" na tela**
  (decisão do dono; muda a regra do estúdio de rotular na tela). O aviso de dados de exemplo fica só no texto do post.
- Direção de arte v3 (harmonia): um foco por vez; o produto grande e nítido; arquibancada calma nas cenas de produto;
  um só sistema de texto por cena. Detalhes em `02-direcao-de-arte.md` (seção v3) e portão visual antes de produzir.
