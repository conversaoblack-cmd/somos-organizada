# 03 · Roteiro · Apresentação da Somos Organizada

- **Cadeira:** roteirista (roteiro novo, não avaliação) · 15/10/2026
- **Formato:** Reels 9:16, 1080×1920, **30 fps**, **45,0 s = 1350 frames**
- **Trilha:** percussão do estúdio a ~100 BPM (tempo = 18 frames; compasso = 72 frames). A grade de compasso é
  **ancorada na virada (frame 252)**: o gancho é anacruse (0–108) e o problema são os **2 compassos de "silêncio tenso"**
  (108–252) que a direção de arte pede antes da virada. Todo corte cai num tempo da grade (múltiplo de 18 a partir de 252);
  pilares entram no tempo 1 ou 3.
- **Fontes usadas:** `01-briefing.md`, `02-direcao-de-arte.md`, `conhecimento/verdade-do-produto.md`,
  `conhecimento/produto-na-pratica.md`, `conhecimento/publico.md`, `marca/marca.md`, `src/marca/tokens.ts`,
  `src/biblioteca/Legenda.tsx`, `audio/narrar.mjs`, `audio/alinhar-take.mjs`, `audio/lib/comum.mjs`.

## A ideia em uma linha

A arquibancada começa no escuro com placas vermelhas (o que não entrou); cada coisa que a Somos Organizada resolve acende
placas; o insight da taxa enche o mosaico de amarelo; no fim, a última placa a acender é a da torcida de quem assiste, no
toque em "Cadastre sua torcida".

## 1. Tabela de cenas

Cores: amarelo = o que entra para a torcida · azul = ação/produto · perigo (vermelho) = problema. Toda tela de celular leva o
rótulo **"Torcida Brasil · dados de demonstração"** e cobre a faixa "Ambiente de teste da Pagar.me".

| Nº | Início–fim (s · frame) | Capítulo | O que se VÊ | Frase de impacto (Archivo Black) | VOZ (ElevenLabs) | LEGENDA (`narracao.json`) | SFX / batida |
|---|---|---|---|---|---|---|---|
| 1 | 0,0–3,6 · 0–108 | **Gancho** | Só mosaico + tipografia. Arquibancada à noite, refletor frio fraco de cima; placas apagadas e um punhado **vermelho piscando** (sem padrão, por semente). Dolly lento para frente. Frase **cheia no frame 0** (sem animação de entrada). | `QUANTO DA MENSALIDADE ↵ **NÃO ENTROU**{perigo} ↵ ESTE MÊS?` | "Quanto da mensalidade não entrou este mês?" (frame 0) | `""` (a frase de impacto é a fala inteira; sem texto duplicado no gancho) | Frame 0: um surdo grave seco. Depois só ar de estádio vazio. Cada placa vermelha que pisca: toque grave quase inaudível. |
| 2 | 3,6–8,4 · 108–252 | **Problema** | Só mosaico + tipografia. Corte seco na batida. A câmera desce pela fileira; a cada item falado acende em vermelho um grupo de placas (grupo → caderno → print). | `TORCIDA CRESCEU, ↵ CONTROLE **NÃO**{perigo}.` (entra no frame 114) | "Cobrança no grupo, caravana no caderno, ingresso que vira print." (frame 114) | `Cobrança no grupo, ↵ caravana no caderno, / ingresso que vira **print**{perigo}.` | 2 compassos de **silêncio tenso**: surdo abafado no tempo 1 (frames 108 e 180), sem caixa. Toque grave em cada grupo vermelho. Último tempo (234): repique sobe (anacruse da virada). |
| 3 | 8,4–12,0 · 252–360 | **Virada** | Só mosaico + tipografia. **Virada de placa** em tela cheia (252–270); refletor branco acende de cima e da frente; as **4 placas centrais acendem** azul, amarelo, amarelo, branco (a grade 2×2) e o nome entra embaixo. Vermelhos se apagam. | Logotipo: grade 2×2 + `SOMOS ORGANIZADA` | "Agora a torcida tem um painel só." (frame 260) | `Agora a torcida ↵ tem **um painel só**{azul}.` | Frame 252 (1º tempo forte): estalo de virada em onda + **bateria completa entra** (surdo, caixa, repique). 4 toques suaves nas 4 placas. |
| 4 | 12,0–16,8 · 360–504 | **Solução** (pilar sócio; tela real) | Virada de placa (360–378). Celular 3D entra (≤ 8 frames) com a **Carteirinha** (`/brasil/socio`, socio@brasil.test), **só a frente** (não virar para o QR). Push-in até "Você está em dia — Preço de sócio liberado nos ingressos no seu nome" (396–468, 2,4 s). Atrás, placas acendem **amarelo** em onda. | `MENSALIDADE QUE ↵ SE **COBRA SOZINHA**{amarelo}` | "No cartão, todo mês. No Pix, com lembrete." (frame 380) | `No cartão, **todo mês**{amarelo}. ↵ No Pix, **com lembrete**{azul}.` | Estalo de virada no 360. Toques suaves em colcheia, um por placa amarela. Acorde curto (sem moeda) quando "Você está em dia" fica nítido (~420). |
| 5 | 16,8–22,8 · 504–684 | **Solução** (pilar ingresso + portaria; tela real) | Virada de placa (504–516). **a)** 504–558: **Ingresso com QR** (`/brasil/socio/ingressos` → "Caravana para a Final" → "Mostrar ingresso (QR)"), destaque no **titular**. **b)** 558–612: corte seco para a **Portaria** (`/brasil/portaria`, portaria@brasil.test) em **LIBERADO** "Entrada liberada." (verde só dentro da tela), flash branco curto. **c)** 612–684: corte seco para **JÁ UTILIZADO** "Entrou às HH:MM"; luz vermelha de recorte no celular. Nunca mostrar o campo "Digitar CPF / QR" nem o CPF. | `O SEGUNDO ↵ É **BARRADO**{perigo}` (entra no 618, só na tela c) | "Ingresso no nome de quem vai. Cada QR entra uma vez só." (frame 516; 2ª frase ~597) | `Ingresso no nome ↵ de quem vai. / Cada **QR**{azul} entra ↵ **uma vez só**{azul}.` | Estalo no 504. Frame 558: **duplo bipe agudo** (QR liberado). Frame 612: **zumbido grave curto** (QR barrado). Bateria segue por baixo. |
| 6 | 22,8–27,6 · 684–828 | **Solução** (pilar dinheiro; tela real) | Virada de placa (684–702). Celular com **Recebimentos da subsede** (`/brasil/admin/recebimentos`, subsede4@brasil.test). Do celular saem **feixes amarelos** para grupos de placas nas laterais (as subsedes), que acendem. | `DIRETO NA ↵ **CONTA DA TORCIDA**{amarelo}` | "O dinheiro não passa pela gente. Cada subsede recebe direto." (frame 690) | `O dinheiro não passa ↵ pela gente. / Cada **subsede**{amarelo} ↵ recebe direto.` | Estalo no 684. Sopro grave (passagem) em cada feixe; toque suave quando cada grupo de placas acende. |
| 7a | 27,6–32,4 · 828–972 | **Solução: insight** (over delivery; tela real) | Virada de placa (828–846). Celular na etapa **Pagamento** da compra (`/brasil` → "Caravana para a Final" → "Comprar ingresso"), recorte na linha **"Taxa de serviço (10%)"** e no "Total"; anel **amarelo** na linha (852–906, 1,8 s). O "10%" sai da tela e vira placar grande que conta de 0 a 10 (846–858). | `**10%**{amarelo} ↵ VIRA CAIXA` | "A taxa de dez por cento vira caixa da torcida." (frame 834) | `A taxa de **10%**{amarelo} ↵ vira **caixa da torcida**{amarelo}.` | **Breakdown:** a bateria para no 828; fica só um surdo grave por compasso (828, 900). Tique leve a cada número do placar. |
| 7b | 32,4–36,0 · 972–1080 | **Solução: insight** (tela real) | Corte seco no 972 (tempo 1). Celular na **página do evento** "Caravana para a Final" em `/brasil`: preço de sócio, preço público e o "+ taxa" à parte; push-in no "+ taxa" (984–1038, 1,8 s). O mosaico inteiro **enche de amarelo** de baixo para cima. | `A DIRETORIA ↵ **DECIDE O PREÇO**{azul}` | "O ingresso só precisa pagar o evento." (frame 980) | `O ingresso só precisa ↵ pagar **o evento**{amarelo}.` | Ainda no breakdown: surdo no 972 + toques suaves crescendo com o mosaico; virada de repique no 1062 chamando a volta da bateria. |
| 8 | 36,0–39,6 · 1080–1188 | **Prova** (tela real) | Virada de placa (1080–1098). Celular no **Financeiro** (`/brasil/admin/financeiro`, diretoria@brasil.test): push-in no card "Taxa de serviço — Caixa da diretoria" (1098–1143, 1,5 s; brilho amarelo) e **toque em "Baixar planilha"** com anel azul (1134–1188, 1,8 s). | `PRESTE CONTAS ↵ COM A **PLANILHA**{azul}` | "Caixa e repasses prontos para mostrar." (frame 1092) | `**Caixa**{amarelo} e repasses ↵ prontos para mostrar.` | Frame 1080: **bateria volta cheia**. Toque suave no "Baixar planilha". |
| 9 | 39,6–45,0 · 1188–1350 | **CTA** | Só mosaico + tipografia (`CardMarca`). Última virada de placa (1188–1206): luz cheia, o mosaico completo forma a **grade 2×2**; falta **uma placa**. Entram em degraus: "Somos Organizada" + botão azul **"Cadastre sua torcida"** (1188), `somosorganizada.com.br` (1200), linha legal (1212). **Toque no botão** com o mesmo anel azul da cena 8 (1236–1290, 1,8 s): a última placa vira e acende (é a da torcida de quem assiste). | `**CADASTRE**{azul} SUA TORCIDA` · `somosorganizada.com.br` · linha legal: "Só paga depois de publicar o site. Teste grátis em modo demonstração." | "Somos Organizada. Cadastre sua torcida. Só paga depois de publicar." (frame 1200) | `""` (o `CardMarca` já escreve nome, botão e linha legal) | Estalo de virada no 1188. Toque suave + surdo no acender da última placa (~1260). Surdo final no 1332 (tempo 1) e reverberação até 1350. Sem estrobo. |

### Notas de gravação (para `scripts/gravar-produto.mjs`)

- **Cena 5, continuidade:** o ingresso mostrado em (a) precisa ser **o mesmo** lido em (b) e (c). Confirmar que o CPF
  `39053344705` da tabela é o titular do ingresso do socio@brasil.test na "Caravana para a Final"; se não for, digitar o
  código do próprio bilhete (ex.: o K7QM-2XRA da tela) em "Digitar CPF / QR". Na peça, recortar só as telas de resultado.
- **Cena 5, câmera:** o emulador lê por digitação; por isso a voz **não** diz "câmera". Não encenar câmera lendo QR.
- **Cena 4:** nunca virar a carteirinha (o verso tem o QR de "Conferência"; a portaria não lê carteirinha).
- **Cena 6:** o texto da tela de Recebimentos da subsede não foi conferido por mim; o `produto-review` confere se a tela
  mostra o recebimento na conta da própria subsede (sustenta "Cada subsede recebe direto"). Se não mostrar, trocar pelo
  "saldo por sede" do Financeiro da diretoria **sem** enquadrar "A repassar".
- **Cenas 7a e 8:** a mesma "Caravana para a Final" das cenas 5 e 7b (um evento só na peça inteira).

## 2. Contagem e orçamentos

### Ritmo da fala

Palavras contadas como o `narrar.mjs` conta (`texto`, números por extenso: "dez por cento" = 3).

| Fala | Frame de início | Palavras | Janela até o próximo corte | Duração-alvo | Mínimo (≤ 2,6 p/s) | Máximo (cabe na cena) | p/s no alvo |
|---|---|---|---|---|---|---|---|
| gancho | 0 | 7 | 0–108 | 3,0 s | 2,7 s | 3,5 s | 2,33 |
| problema | 114 | 10 | 114–252 | 4,2 s | 3,9 s | 4,4 s | 2,38 |
| virada | 260 | 7 | 260–360 | 3,0 s | 2,7 s | 3,2 s | 2,33 |
| socio | 380 | 8 | 380–504 | 3,4 s | 3,1 s | 3,9 s | 2,35 |
| ingresso | 516 | 12 | 516–684 | 5,1 s | 4,6 s | 5,4 s | 2,35 |
| dinheiro | 690 | 10 | 690–828 | 4,0 s | 3,9 s | 4,4 s | 2,50 |
| taxa | 834 | 10 | 834–972 | 4,1 s | 3,9 s | 4,4 s | 2,44 |
| evento | 980 | 7 | 980–1080 | 2,9 s | 2,7 s | 3,1 s | 2,41 |
| prova | 1092 | 6 | 1092–1188 | 2,6 s | 2,3 s | 3,0 s | 2,31 |
| cta | 1200 | 10 | 1200–1350 | 4,2 s | 3,9 s | 4,6 s | 2,38 |

- **Total: 87 palavras faladas em 45,0 s = 1,93 palavras/s na peça** (limite 2,6). Somando só o tempo de fala-alvo
  (36,5 s), 2,38 palavras/s.
- Nenhuma frase passa de 12 palavras (a maior tem 10: a do problema).
- As janelas mais justas são **dinheiro** e **taxa** (mínimo 3,9 s, máximo 4,4 s): se o take sair mais rápido que 3,9 s,
  a fala está corrida (veto); se sair mais lento que 4,4 s, invade o corte. Conferir em `audio/<peça>/tempos.json`.

### Orçamento de leitura das frases de impacto (palavras × 0,3 s + 0,5 s)

| Cena | Frase | Palavras | Orçamento | Tempo na tela | Folga |
|---|---|---|---|---|---|
| 1 | QUANTO DA MENSALIDADE NÃO ENTROU ESTE MÊS? | 7 | 2,6 s | 0–108 = 3,6 s | +1,0 s |
| 2 | TORCIDA CRESCEU, CONTROLE NÃO. | 4 | 1,7 s | 114–252 = 4,6 s | +2,9 s |
| 3 | SOMOS ORGANIZADA (logotipo) | 2 | 1,1 s | 264–360 = 3,2 s | +2,1 s |
| 4 | MENSALIDADE QUE SE COBRA SOZINHA | 5 | 2,0 s | 378–504 = 4,2 s | +2,2 s |
| 5 | O SEGUNDO É BARRADO | 4 | 1,7 s | 618–684 = 2,2 s | +0,5 s |
| 6 | DIRETO NA CONTA DA TORCIDA | 5 | 2,0 s | 702–828 = 4,2 s | +2,2 s |
| 7a | 10% VIRA CAIXA | 3 | 1,4 s | 846–972 = 4,2 s | +2,8 s |
| 7b | A DIRETORIA DECIDE O PREÇO | 5 | 2,0 s | 990–1080 = 3,0 s | +1,0 s |
| 8 | PRESTE CONTAS COM A PLANILHA | 5 | 2,0 s | 1098–1188 = 3,0 s | +1,0 s |
| 9 | CADASTRE SUA TORCIDA | 3 | 1,4 s | 1188–1350 = 5,4 s | +4,0 s |
| 9 | somosorganizada.com.br | 1 | 0,8 s | 1200–1350 = 5,0 s | +4,2 s |
| 9 | Só paga depois de publicar o site. Teste grátis em modo demonstração. | 12 | 4,1 s | 1212–1350 = 4,6 s | +0,5 s |

A frase do gancho tem 7 palavras (acima das 2–5 pedidas): é **exceção consciente**, porque ela é a fala inteira e substitui a
legenda (texto e voz idênticos, um texto só na tela nos primeiros 1,5 s). Se o diretor exigir ≤ 5, a alternativa é
`MENSALIDADE: ↵ QUANTO **NÃO ENTROU**{perigo}?` (4 palavras, 1,7 s) com a legenda do gancho de volta na faixa alta.

### Orçamento dos blocos de legenda (régua do `Legenda.tsx`)

Com a fala-alvo de ~2,35 palavras/s, cada palavra leva ~0,43 s, mais que os 0,3 s da régua: nenhum bloco é cortado pelo
seguinte antes do orçamento. Blocos: problema 6 + 4 palavras (2,3 s / 1,7 s); virada 7 (2,6 s); sócio 8 (2,9 s); ingresso
6 + 6 (2,3 s / 2,3 s; o 2º começa ~2,7 s depois do 1º); dinheiro 6 + 4 (2,3 s / 1,7 s; o 2º termina com 1,9 s de folga
até a taxa); taxa 8 (2,9 s; 4,9 s até a próxima); evento 7 (2,6 s; 3,7 s até a próxima); prova 6 (2,3 s; 3,6 s até o CTA).
Nenhum bloco com menos de 4 palavras (bloco curto é o que some antes da régua).

### Recompensa a cada 5–7 s (na prática, a cada ≤ 4,8 s)

0,0 frase do gancho · 3,8 frase do problema e grupos vermelhos · 8,4 virada e logo · 12,6 carteirinha "Você está em dia" ·
16,8 ingresso com QR · 18,6 LIBERADO · 20,4 JÁ UTILIZADO · 23,4 feixes para as subsedes · 28,2 placar 10% · 32,4 mosaico
enche de amarelo · 36,6 caixa no Financeiro · 39,6 grade 2×2 · 42,0 a última placa acende.

## 3. Checklist de vieses, cena a cena

U = usado · — = não se aplica · F = falta

| Item | 1 Gancho | 2 Problema | 3 Virada | 4 Sócio | 5 Ingresso | 6 Dinheiro | 7 Taxa | 8 Prova | 9 CTA |
|---|---|---|---|---|---|---|---|---|---|
| Lacuna de curiosidade | U ("quanto?") | U (e o que se faz?) | U (que painel?) | — | — | — | U (10% vira caixa: como?) | — | — |
| Aversão à perda | U ("não entrou") | U (print, cobrança) | — | U (para de escapar) | U ("barrado") | — | — | — | — |
| Especificidade | U ("este mês") | U (grupo, caderno, print) | — | U (cartão todo mês / Pix com lembrete) | U (JÁ UTILIZADO, "Entrou às") | U (subsede) | U (10%, "+ taxa") | U (planilha) | U (endereço, condição) |
| Autorrelevância | U (tesoureiro sente) | U (palavras da torcida) | U ("a torcida") | U | U (caravana, portaria) | U (subsede) | U ("a diretoria decide") | U | U ("sua torcida") |
| Interrupção de padrão | U (texto cheio + vermelho no escuro no frame 0) | — | U (virada de placa + refletor) | — | U (flash e zumbido) | — | U (a bateria para) | — | — |
| Contraste | U (escuro × vermelho) | U | U (escuro → luz) | — | U (LIBERADO × JÁ UTILIZADO) | — | U (taxa × preço do ingresso) | — | U (mosaico apagado no início × completo) |
| Loops abertos (Zeigarnik) | U (abre "quanto?") | U (abre "o mosaico vai acender?") | U | U (fecha o gancho; mosaico ainda incompleto) | U | U | U (abre "onde fica esse caixa?") | U (fecha o caixa) | U (fecha o mosaico com a última placa) |
| Uma ideia por cena | U | U | U | U | U (ingresso sem fraude; 3 telas, uma ideia) | U | U (7a e 7b: uma ideia em 2 tempos) | U | U |
| Fluência | U | U | U | U | U (cena mais densa: ver riscos) | U | U | U | U |
| Recompensa a cada 5–7 s | U | U | U | U | U | U | U | U | U |
| Gesto ≥ 1,5 s | — | — | U (4 placas + logo, 3,2 s) | U (push-in 2,4 s) | U (LIBERADO 1,8 s; JÁ UTILIZADO 2,4 s) | U (feixes ~2 s) | U (anel 1,8 s; push-in 1,8 s) | U (toque 1,8 s) | U (toque 1,8 s) |
| Payoff do gancho | — | — | — | U ("se cobra sozinha" + "Você está em dia", 12,0 s) | — | — | — | — | — |
| Reciprocidade | — | — | — | — | — | — | U (o modelo de caixa, de graça) | U (dica de prestar contas) | U (teste grátis) |
| Baixo atrito | — | — | — | — | — | — | — | — | U (um passo; só paga depois de publicar) |
| Compromisso e consistência | — | — | — | — | — | — | — | — | U (repete o toque azul da cena 8) |
| Dotação | — | — | U ("a torcida tem um painel") | — | — | U ("conta da torcida") | U ("a diretoria decide") | — | U (a última placa é a da sua torcida) |
| Autoridade | — | — | — | — | — | — | — | — | **F** (de propósito: sem número de cliente, sem depoimento; a única autoridade honesta disponível é o produto real gravado) |
| Falsa escassez | não usado | não usado | não usado | não usado | não usado | não usado | não usado | não usado | não usado |
| Falsa urgência | não usado | não usado | não usado | não usado | não usado | não usado | não usado | não usado | não usado |
| Depoimento inventado | não usado | não usado | não usado | não usado | não usado | não usado | não usado | não usado | não usado |
| Número de cliente inventado | não usado | não usado | não usado | não usado | não usado | não usado | não usado | não usado | não usado |

Números que aparecem: só o "10%" (regra do produto, `functions/src/config.ts:40`) e o que a tela de demonstração mostrar
(preços e valores fictícios, sempre com o rótulo). Nenhum número de cliente.

## 4. Direção de voz (ElevenLabs)

- **Quem fala:** voz adulta (30 a 45 anos), timbre médio-grave, sotaque brasileiro neutro, de quem já foi diretoria e
  conversa com outra diretoria. Não é locutor de banco, de varejo nem de trailer.
- **Modelo e ajustes de partida:** `eleven_multilingual_v2` (o mesmo do pipeline), estabilidade ~50%, similaridade ~75%,
  estilo baixo (15–25%), velocidade ~0,9. Ajuste pela tabela de durações acima: cada fala dentro do mínimo e do máximo.
- **Ritmo:** pausado, com respiro curto nas vírgulas e ~0,3 s entre frases. Alvo de ~2,35 palavras/s.
- **Arco de energia:**
  1. **Gancho:** pergunta séria, olho no olho, sem sorriso. Ênfase em "**não entrou**".
  2. **Problema:** constatação, em tom solidário. **Não rir do problema da torcida:** nada de ironia, suspiro ou "risada
     na voz" em "caderno" e "print". É a realidade de quem toca a torcida no braço.
  3. **Virada:** aqui a energia sobe (1º pico de entusiasmo). "Agora" com ataque; "um painel só" firme, com sorriso na voz.
  4. **Pilares (sócio, ingresso, dinheiro):** confiante, de quem mostra uma coisa que funciona. "Uma vez só" bem separado.
     "O dinheiro não passa pela gente" com franqueza, sem defesa.
  5. **Taxa (breakdown):** mais devagar e mais baixo, quase de confidência: é o momento de anotar. "Dez por cento" claro;
     "caixa da torcida" com peso. "O ingresso só precisa pagar o evento" sem tom de promessa de preço.
  6. **Prova:** firme e curto.
  7. **CTA:** 2º pico de entusiasmo. "Somos Organizada" com orgulho; "Cadastre sua torcida" como convite (não ordem);
     "Só paga depois de publicar" mais leve, tranquilizador.
- **Pronúncia a conferir no take:** "QR" = "quê-érre" (se sair "kiú-ar", escreva `quê-érre` no `texto` e mantenha "QR" na
  legenda); "Pix" = "píks"; "subsede" sem pausa no meio; "dez por cento" (nunca "dez porcento" engolido).
- **Texto para colar (um take, uma fala por linha, nesta ordem):**

```
Quanto da mensalidade não entrou este mês?
Cobrança no grupo, caravana no caderno, ingresso que vira print.
Agora a torcida tem um painel só.
No cartão, todo mês. No Pix, com lembrete.
Ingresso no nome de quem vai. Cada QR entra uma vez só.
O dinheiro não passa pela gente. Cada subsede recebe direto.
A taxa de dez por cento vira caixa da torcida.
O ingresso só precisa pagar o evento.
Caixa e repasses prontos para mostrar.
Somos Organizada. Cadastre sua torcida. Só paga depois de publicar.
```

### Rascunho do `audio/2026-10-15-apresentacao/narracao.json` (para o diretor copiar; não gravei esse arquivo)

```json
{
  "fps": 30,
  "duracaoFrames": 1350,
  "velocidade": 1,
  "voz": {"id": null, "modelo": "eleven_multilingual_v2"},
  "falas": [
    {"id": "gancho", "frame": 0, "texto": "Quanto da mensalidade não entrou este mês?", "legenda": ""},
    {"id": "problema", "frame": 114, "texto": "Cobrança no grupo, caravana no caderno, ingresso que vira print.", "legenda": "Cobrança no grupo, ↵ caravana no caderno, / ingresso que vira **print**{perigo}."},
    {"id": "virada", "frame": 260, "texto": "Agora a torcida tem um painel só.", "legenda": "Agora a torcida ↵ tem **um painel só**{azul}."},
    {"id": "socio", "frame": 380, "texto": "No cartão, todo mês. No Pix, com lembrete.", "legenda": "No cartão, **todo mês**{amarelo}. ↵ No Pix, **com lembrete**{azul}."},
    {"id": "ingresso", "frame": 516, "texto": "Ingresso no nome de quem vai. Cada QR entra uma vez só.", "legenda": "Ingresso no nome ↵ de quem vai. / Cada **QR**{azul} entra ↵ **uma vez só**{azul}."},
    {"id": "dinheiro", "frame": 690, "texto": "O dinheiro não passa pela gente. Cada subsede recebe direto.", "legenda": "O dinheiro não passa ↵ pela gente. / Cada **subsede**{amarelo} ↵ recebe direto."},
    {"id": "taxa", "frame": 834, "texto": "A taxa de dez por cento vira caixa da torcida.", "legenda": "A taxa de **10%**{amarelo} ↵ vira **caixa da torcida**{amarelo}."},
    {"id": "evento", "frame": 980, "texto": "O ingresso só precisa pagar o evento.", "legenda": "O ingresso só precisa ↵ pagar **o evento**{amarelo}."},
    {"id": "prova", "frame": 1092, "texto": "Caixa e repasses prontos para mostrar.", "legenda": "**Caixa**{amarelo} e repasses ↵ prontos para mostrar."},
    {"id": "cta", "frame": 1200, "texto": "Somos Organizada. Cadastre sua torcida. Só paga depois de publicar.", "legenda": ""}
  ]
}
```

`legenda: ""` no gancho e no CTA é intencional: o `narrar.mjs` vai avisar "sem legenda (a tela precisa escrever esta fala)",
e a tela escreve (frase do gancho; `CardMarca`).

## 5. Riscos e o argumento mais forte contra este roteiro

### Riscos que eu mesmo vejo

1. **Gancho sem algarismo.** A regra pede "dor, perda ou promessa concreta com número"; aqui o número é o que o
   tesoureiro tem na cabeça ("quanto?"), e "este mês" dá o recorte. Pôr um número na tela exigiria inventar estatística
   (proibido). A alternativa com número real seria abrir pelos 10% ("10% de cada venda pode virar caixa"), mas isso soa
   promessa de dinheiro e põe a taxa antes do valor (afasta o público). **Métrica que confirma ou derruba:** taxa de pulo
   e retenção nos 3 s.
2. **Frase do gancho com 7 palavras** (pedido: 2–5). Escolhi um texto só na tela em vez de frase curta + legenda. Alternativa
   de 4 palavras na seção 2.
3. **Cena 5 é a mais densa:** tela do produto ("LIBERADO", "JÁ UTILIZADO"), frase de impacto e legenda ao mesmo tempo, em
   6 s e 3 telas. Mitigação: a frase de impacto só entra na tela (c) e a legenda tem 2 blocos de 6 palavras. Se o
   motion-review julgar poluída, tirar a frase de impacto e deixar "JÁ UTILIZADO" falar sozinho.
4. **Verde em tela cheia no LIBERADO.** É status do produto (permitido), mas ocupa o celular inteiro. Manter o celular em
   ≤ 45% da altura do quadro nesse plano, cercado pelo mosaico azul e amarelo, e com 1,8 s só.
5. **"Cada subsede recebe direto"** pressupõe a subsede com conta própria ligada (divisão automática). O Financeiro também
   tem "A repassar" e "Registrar repasse". Se o produto-review achar que é forte demais, a troca é "Cada subsede pode
   receber direto": a fala passa a 11 palavras (mínimo 4,2 s); adiantar o início da fala para o frame 684 (máximo 4,6 s).
6. **Taxa.** "Vira caixa" é a frase aprovada pelo diretor, mas omite que a taxa cobre primeiro as tarifas do Pix e do
   cartão e que é paga pelo torcedor. A tela 7a mostra a linha "Taxa de serviço (10%)" no resumo **antes de pagar**
   (transparência), e a variante longa vai no texto do post. Rótulo do produto diz "Caixa da diretoria" e a voz diz
   "caixa da torcida": coerente com a marca, mas um avaliador pode apontar.
7. **7b não escreve na tela a frase escolhida.** A voz e a legenda dizem "O ingresso só precisa pagar o evento"; a frase
   de impacto diz "A DIRETORIA DECIDE O PREÇO", para complementar (e não repetir) e para deixar explícito que o preço é
   da diretoria (nunca promessa da plataforma). Se o diretor quiser a frase do insight em Archivo Black, trocar por
   `INGRESSO SÓ PAGA ↵ O **EVENTO**{amarelo}` (5 palavras, 2,0 s; cabe) e aceitar a repetição com a legenda.
8. **7a repete a legenda na frase** ("10% vira caixa"): redundância intencional no momento que a hipótese diz que faz salvar.
9. **Nome falado só aos 40 s.** O nome aparece escrito na virada (8,4 s), mas a voz só diz "Somos Organizada" no CTA.
   Quem sai antes não ouve o nome. Pôr o nome na voz da virada custa 2 palavras numa janela que já está justa (3,2 s).
10. **Payoff do gancho pelo lado do torcedor.** O gancho fala com a diretoria ("quanto não entrou"), e a resposta mostra a
    carteirinha do sócio "em dia". Uma tela da diretoria com a lista de sócios e o status pagaria melhor, mas ela não está
    na tabela "Telas para gravar" e eu não a conferi. Se o diretor gravar `/brasil/admin` → Sócios e confirmar o status na
    tela, ela substitui a carteirinha na cena 4.
11. **Take da ElevenLabs fora da janela.** As falas "dinheiro" e "taxa" têm só 0,5 s entre o mínimo (sem correr) e o
    máximo (sem invadir o corte). Se o take sair fora, mexer no frame de início da fala, não na velocidade do áudio.
12. **Telas não abertas por mim:** Recebimentos da subsede, Financeiro e página do evento. Os textos citados vêm de
    `produto-na-pratica.md`; quem confere na gravação é o produto-review.

### O argumento mais forte CONTRA este roteiro

**Ele ainda é uma lista de funcionalidades com fantasia de mosaico.** O briefing aposta que mostrar "a torcida se
organizando" prende mais que um tour, e este roteiro passa por cinco assuntos em 33 s (mensalidade, ingresso, portaria,
dinheiro direto, taxa) e mais a planilha. O gancho promete uma coisa (a mensalidade que não entrou), paga essa promessa aos
12 s e então muda de assunto quatro vezes; quem parou pela dor da mensalidade não tem motivo novo para ficar depois dos
16 s, e no mudo cada cena exige ler três camadas (tela do produto, frase de impacto, legenda). O mosaico que acende é o fio,
mas é um fio visual, não uma pergunta: não há um loop narrativo forte entre 12 s e 28 s. Um roteiro com dois pilares só
(mensalidade e caixa), com a taxa no centro, provavelmente teria retenção média maior e salvaria mais, ao custo de não
"apresentar tudo o que a gente entrega", que é o pedido do dono. **O que confirma ou derruba:** a curva de retenção do
Reels. Queda forte entre 12 s e 22 s (depois do payoff do gancho) dá razão a este argumento; retenção estável até a taxa
(28–36 s) e salvamentos/compartilhamentos acima da média do perfil dão razão ao roteiro.

## 6. Decisões do diretor sobre o roteiro (15/10/2026)

1. **Gancho com 7 palavras: mantido.** Texto e voz idênticos, um texto só na tela; cabe no orçamento (2,6 s em 3,6 s).
2. **7b: mantido "A DIRETORIA DECIDE O PREÇO"** na tela; a voz diz "O ingresso só precisa pagar o evento".
3. **Cena 5, continuidade resolvida:** a portaria foi gravada lendo o **mesmo ingresso** mostrado na conta do sócio
   (Rafael Torcedor, código BCXU-9UAJ, selo SÓCIO): `assets/apresentacao/portaria-rafael/`. Não aparece campo de digitação
   nem CPF digitado: só as telas de resultado.
4. **Cena 6 confirmada no produto:** Recebimentos da subsede (`subsede4@brasil.test`) mostra "Conta de recebimento ·
   Ativa" e "Como o dinheiro é dividido: A Pagar.me divide cada venda na hora, direto entre a torcida e a subsede.
   Ninguém precisa repassar nada à mão.", com o exemplo "Torcedor paga R$ 55 · Vai para a subsede R$ 50 · Taxa de serviço
   (torcida) R$ 5". "Cada subsede recebe direto" fica (vale para subsede com conta ativa, que é o que a tela mostra).
5. **Cena 7a:** usar o resumo da 1ª etapa da compra ("Passo 1 de 3: Ingressos"), que já mostra "Taxa de serviço (10%)" e
   o "Total" **antes de pagar** (`public/apresentacao/telas/compra-1.png`).
6. **Cena 4:** carteirinha mantida (a lista de Sócios da diretoria foi gravada como alternativa:
   `assets/apresentacao/diretoria-2/socios.png`).
7. **Cena 8:** Financeiro com "Baixar planilha" gravado (`financeiro-planilha.png`).

## 7. Decisões do diretor depois da rodada 0 da mesa (estratégia, torcida, marketing; produto pendente)

| Ponto levantado | Decisão |
|---|---|
| Vermelho piscando lê como sinalizador (torcida) | **Aceito.** Placas vermelhas acendem em degrau (4 frames) e ficam; sem cintilação, sem laranja, sem partícula. |
| LIBERADO todo verde (torcida) | **Aceito.** Celular ≤ 45% da altura do quadro na 5b, só 1,8 s, sem nada verde fora da tela. |
| "Mensalidade fixa, sem porcentagem das vendas" fora da peça (estratégia, marketing) | **Aceito.** Entra escrito no CTA (linha do `CardMarca`) e no post. |
| Nome da marca some de 12 s a 39 s (estratégia, marketing) | **Aceito.** Assinatura discreta (grade 2×2 + "Somos Organizada", ~34 px, texto secundário) no topo da zona, frames 360–1188. |
| "O SEGUNDO É BARRADO" culpa uma pessoa (torcida) | **Aceito em parte.** Vira `QR REPETIDO ↵ **BARRADO**{perigo}`. **Recusado** "O PRINT NÃO ENTRA": é falso (print de ingresso ainda não usado entra uma vez). |
| "PRESTE CONTAS COM A PLANILHA" soa como ordem de fora (torcida) | **Aceito.** Vira `CONTAS ABERTAS ↵ NA **PLANILHA**{azul}`. |
| "Caixa e repasses" contradiz "ninguém precisa repassar" (marketing) | **Aceito.** Voz da cena 8: "Caixa e vendas prontos para mostrar." Enquadrar sem "Registrar repasse" e sem "A repassar". |
| "Caixa da diretoria" alimenta desconfiança (torcida, marketing) | **Aceito.** Cena 8 não enquadra esse card; o "caixa" aparece pelo card "Taxa de serviço (caixa)" (Visão geral) ou pela planilha. |
| Carteirinha sem "Você está em dia" e sem coberturas (marketing, torcida) | **Aceito.** Regravada com coberturas; push-in em "Você está em dia" (`carteirinha-em-dia.png`), sem o card de preço do plano. |
| Recebimentos mostra banco e titular (torcida) | **Aceito.** Cena 6 usa só "Como o dinheiro é dividido" + exemplo (`recebimentos-2.png`). |
| Responder a dor da diretoria com a lista de Sócios (marketing) | **Recusado agora.** A lista lê mal no mudo (selos pequenos; estratégia concorda). Fica a carteirinha "em dia"; a voz fala pela diretoria. Reavaliar na v2 pela curva de retenção. |
| Voz do CTA perde "o site" (marketing) | **Aceito.** "Só paga depois de publicar o site." |
| Frase da taxa precisa do aval do dono (marketing) | O dono **delegou a frase ao diretor** em 15/10/2026 ("você decide a frase"). Registrado; a frase vai para a aprovação do dono junto com os styleframes. |
| Perfil, link na bio, post e comentário fixado (estratégia, marketing) | Condição de publicação: vai na `entrega.md` e é perguntado ao dono. |
