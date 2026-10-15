# Pacote · rodada 2 · PORTÃO VISUAL · Apresentação (correção do veto da rodada 1)

Rodada 1 do portão: **motion-review VETOU** (`auditoria/rodada-1-portao/pareceres/motion-review.json`) e torcida-review
aprovou. O diretor aceitou o diagnóstico e refez a **direção de arte** das cenas de produto (não só a execução): seção
"v2 das cenas de produto" em `02-direcao-de-arte.md`. Esta é a 1ª das 2 rodadas de correção permitidas.

Pergunta do portão (a mesma): *"Isto é padrão de publicidade profissional com linguagem própria, ou animação genérica de
interface?"*

## Evidências (caminhos relativos a /home/user/somos-organizada/studio/campanhas/2026-10-15-apresentacao)

- `04-portao-visual/styleframes.png` e `styleframes-zona.png`: **7** styleframes do código, sem e com a zona essencial
  (contorno verde-limão), nesta ordem: frame 60 (gancho), 320 (virada), 480 (sócio), 640 (barrado), 720 (dinheiro),
  900 (taxa), 1320 (CTA). Em tamanho real: `04-portao-visual/sf-1-gancho.png`, `sf-2-virada.png`, `sf-extra-socio.png`,
  `sf-3-portaria.png`, `sf-extra-dinheiro.png`, `sf-4-taxa.png`, `sf-5-cta.png` (e cada um com `-zona.png`).
- `04-portao-visual/previa-virada.mp4`: prévia de 4 s (frames 200–320, a virada), com trilha e SFX (sem voz). Folha de
  contato a cada 0,25 s: `04-portao-visual/evidencias-previa/folha.png` e `folha-zona.png`; forma de onda:
  `evidencias-previa/onda.png` (o frame 252 cai em x ≈ 520 de 1200).
- `04-portao-visual/qc-previa.json`: QC da prévia.
- `02-direcao-de-arte.md` (seção v2), `03-roteiro.md`, `../../marca/marca.md`, `../../marca/linguagem-visual.md`.

## O que mudou, item por item do veto

| Pedido da rodada 1 | O que foi feito | Onde ver |
|---|---|---|
| Andares sem sobreposição (assinatura 270–335, frase 350–570, prova 590–1080, legenda 1095–1250) | Andares fixos em código (`ProvaCard.tsx`: `ANDAR`); nenhuma interface atrás da frase ou da legenda | 480, 640, 720, 900 |
| Prova por recorte, linha-chave ≥ 44 px; celular inteiro ≤ 490 px e nunca atrás de texto | Prova = recorte exato da captura real (`provas.ts`, regiões medidas em pixel). Celular com 470 px de altura, abaixo da legenda | idem |
| Celular dentro do estádio, luz de recorte na cor semântica espalhando nas placas | O celular agora é um objeto do 3D (mesma cena da arquibancada), com luz pontual na cor da cena atrás dele e luz de borda; a luz acende as placas em volta. Feixe vertical do celular até a prova | 480 (azul), 640 (vermelho), 720 e 900 (amarelo) |
| Mosaico lido como arquibancada (desfoque menor) | Desfoque do fundo de 2 px; fileiras e perspectiva visíveis | idem |
| Legenda sólida, no máximo 2 linhas | Caixa sólida #0F131B a 0,94, 56 px, 2 linhas | todos |
| JÁ UTILIZADO vermelho, sem amarelo competindo | Recorte e luz vermelhos; placas perto do celular em vermelho em degrau (612); o resto apagado (#1A1E2A) até 688 | 640 |
| Sem preço do plano no sócio; "Você está em dia" ≥ 44 px | Recorte só do cartão "Você está em dia" (sem o card de preço), título a ~47 px | 480 |
| Buraco no quadrante branco da virada | Grade nasce completa; a placa que falta só apaga no CTA (1192) e acende no toque (1262) | 320 |
| CTA: metade de baixo vazia, três eixos, CTA duplicado, título pequeno | Câmera calculada por projeção: desce abaixo da 1ª fileira e olha para cima, a arquibancada enche o quadro até y 1920. Um eixo (x 120). Um CTA (botão "Cadastrar minha torcida", rótulo real do site). "SOMOS ORGANIZADA" 96 px | 1320 |
| Linha legal ≥ 44 px | "Mensalidade fixa, sem % das vendas." (amarelo) e "Só paga depois de publicar o site." (branco), 44 px, quebra escolhida à mão | 1320 |
| Marquise de 1 px, refletores cortados | Marquise com volume e 18 luminárias; torres com refletores inteiros dentro do quadro | 60, 320 |
| Destaque na linha da taxa | Foco arredondado na linha "Taxa de serviço (10%)" (852–906), dentro do cartão | 900 |
| Cue fraco no 252 e leito alto antes | Leito de 108–234 só com surdo abafado, ~11 dB abaixo do pós-virada (−24,2 LUFS em 4,0–8,2 s contra −13,3 LUFS em 8,6–12 s na mix); caixa e repique crescendo no último tempo; impacto + virada no 252 | onda.png, previa-virada.mp4 |

## Limites conhecidos e desvios declarados (não julgue como novidade; julgue se aceita)

- **Taxa (900): a linha "Taxa de serviço (10%)" fica com ~38 px, não 44.** Motivo medido: na tela real, rótulo e valor
  ficam nas pontas de um cartão de 870 px (na captura 3×). Para mostrar a linha inteira dentro de 840 px de largura e
  274 px de altura (andar alto, com Ingresso, Taxa e Total juntos, que é a conta 150 + 15 = 165), o teto é ~38 px.
  Montar rótulo e valor mais perto um do outro falsearia a tela. A mensagem fica no placar "10%" (150 px) e na frase
  "vira caixa".
- **QC da prévia acusa −12,2 LUFS** (alvo −14 ± 1): é um trecho de 4 s, quase todo depois da virada, e por isso mais
  alto que a média. A mix inteira mede −14,1 LUFS e TP −1,3 dBTP.
- Sem voz: a legenda vem da voz guia (espeak), só para cronometrar; a voz final será gerada pelo dono na ElevenLabs.
- Trilha e SFX sintetizados pelo estúdio; julgue pela forma de onda e pelos cues.
- 3D renderizado por software (swangle) na nuvem.
- A mudança do CTA ainda não está numa prévia em movimento. A transição 1150–1200 é um mergulho da câmera do plano aberto
  até abaixo da 1ª fileira.

## Instrução

Use o pacote; só vá ao código ou ao produto para contestar um fato, e diga qual. Grave o parecer em
`campanhas/2026-10-15-apresentacao/auditoria/rodada-2-portao/pareceres/<sua-cadeira>.json`.
