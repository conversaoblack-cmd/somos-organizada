# 02 · Direção de arte · Apresentação

## A imagem em uma frase

**Uma arquibancada à noite onde cada placa do mosaico vira e acende quando algo da torcida dá certo, até o mosaico
inteiro formar a grade 2×2 da Somos Organizada.**

O produto aparece na frente disso, num celular real (tela gravada do ambiente de demonstração), como a ferramenta que
faz cada placa acender.

## Referências estudadas e o princípio tirado de cada uma (nunca copiar)

| Referência | Princípio que levamos |
|---|---|
| Mosaicos de cartões em arquibancada (o "bandeirão" de placas que a torcida levanta) | milhares de gestos individuais viram **uma** imagem; a revelação é por **acúmulo**, não por corte |
| Filmes de produto de celular (lançamentos de smartphone) | o aparelho é o herói com luz de recorte limpa; uma ideia por plano; detalhe de tela em close |
| Grafismo de transmissão esportiva (placar, número de público) | número grande em tipo pesado, que sobe contando e se lê num relance |
| Comerciais de esporte cortados na batida da bateria | cortes e viradas **no tempo da percussão**; frase de impacto ocupa a tela inteira |
| Vídeos de banco digital que mostram o dinheiro andando | dinheiro como **trajeto visível com cor** (sai do torcedor, cai na conta da torcida e da subsede); nada de cédula ou moeda |

## Luz (por cena)

| Cena | Luz | Motivo |
|---|---|---|
| Gancho / problema | refletor frio, fraco, de cima; placas apagadas e algumas **vermelhas piscando** | a torcida está no escuro: calote, print, caderno |
| Virada | um refletor branco acende de cima e da frente; 4 placas centrais acendem (azul, amarelo, amarelo, branco) | nasce a marca |
| Sócio | brilho **amarelo** sobe a cada placa que acende (sócio em dia = dinheiro que entra) | amarelo = o que entra para a torcida |
| Ingresso / portaria | recorte **azul** no celular (ação); flash branco curto no "entrada liberada"; vermelho no "QR já utilizado" | azul = o que a pessoa faz; vermelho = problema barrado |
| Dinheiro / taxa | feixes amarelos do celular para as placas das subsedes; o mosaico enche | caixa da torcida |
| CTA | luz cheia, mosaico completo forma a grade 2×2 | fecho da marca |

Nunca luz de balada ou cassino: nada de neon colorido piscando sem motivo, nada de estrobo.

## Paleta de luz

Base `#070A12` (noite de estádio). Ação `#2E6BFF`. O que entra `#FFCC00`. Problema `#EF4444`. Texto `#F1F4FA`.
Torcida de exemplo (dentro do celular) em roxo e branco (`#7C3AED`), para ficar claro que **cada torcida tem a cara dela**
e que a Somos Organizada é a ferramenta por trás. Verde só se aparecer dentro de tela do produto (status "pago").

## Tipografia de cena

- **Archivo Black**, caixa alta, 96 a 140 px a 1080 de largura, para as frases-chave (2 a 5 palavras), com palavra-chave
  na cor semântica. Entra com "batida" (sobe 40 px e assenta em 6 frames), nunca com fade lento.
- **Números** em Archivo Black, contando (placar).
- **Legenda** em Archivo 800, 60 px, na faixa baixa (`Legenda.tsx`), sempre presente quando há voz.
- Nada de tipografia de interface (botões, cartões) fora do celular.

## Planos de profundidade (3 no mínimo, em todas as cenas)

1. **Fundo:** o mosaico da arquibancada em 3D (placas instanciadas em perspectiva, fileiras que somem no escuro, leve
   desfoque de profundidade), com a câmera em movimento lento contínuo.
2. **Meio:** o celular 3D com a tela real gravada, ou um cartão real do painel (`RecorteApp`).
3. **Frente:** frase de impacto e legenda em faixa.

## Movimento

- Coletivo e firme: placas viram em **onda** (com variação por semente: torcida de verdade não vira em sincronia
  perfeita), números sobem, blocos se alinham.
- Câmera: dolly lento e contínuo no mosaico (nada fica parado 1 s ou mais); push-in no celular nos momentos de prova.
- Entrada rápida (≤ 8 frames), assentamento curto. Só o essencial se mexe ao mesmo tempo.

## Transição

- **Virada de placa** em tela cheia: a cena se quebra em placas que viram em onda e revelam a próxima (a transição É o
  território). Usada nas mudanças de capítulo (problema → virada, pilar → pilar).
- **Corte seco na batida** dentro do mesmo capítulo.
- Proibido: wipe, slide genérico, zoom de apresentação.

## Música e SFX

- **Trilha:** percussão de bateria de torcida **sintetizada pelo próprio estúdio** (surdo, caixa, repique, tamborim),
  ~100 BPM, sem melodia de terceiros e sem cântico. Sem licença de terceiros envolvida (registrar em `audio/LICENCAS.md`).
  O dono pode trocar por uma faixa licenciada depois (a peça é amarrada às âncoras de compasso, não à faixa).
- **Âncoras:** a virada (frase "Agora a torcida tem um painel só") cai no 1º tempo forte depois de 2 compassos de
  "silêncio tenso"; cada pilar entra num compasso; a frase da taxa ganha a pausa da bateria (breakdown) para respirar.
- **SFX (todos sintetizados):** virada de placa (estalo curto de cartão), placa acendendo (toque suave), QR liberado
  (duplo bipe agudo), QR barrado (zumbido grave curto), Pix aprovado (acorde curto, sem moeda), passagem de câmera
  (sopro grave). Sempre abaixo da voz.

## Orçamento de leitura

Palavras × 0,3 s + 0,5 s ("R$ x" conta como 2). Frase de impacto de 4 palavras = 1,7 s mínimo na tela. Calculado por
cena no roteiro (`03-roteiro.md`) e conferido no QC pela régua do `Legenda.tsx`.

## O que derruba esta direção

Se os styleframes parecerem "animação de interface" (cartões flutuando sobre fundo escuro) ou se o mosaico não for lido
como arquibancada, a direção é refeita antes de polir qualquer execução.

## v2 das cenas de produto (portão visual, rodada 1: veto da motion-review)

**Diagnóstico aceito:** nas cenas 4 a 8, o celular grande e plano na frente de um mosaico desfocado virou "animação de
interface". Sem luz trocada entre aparelho e arquibancada, com texto de interface vazando sob a frase e a legenda.

**Nova imagem das cenas de produto:** *o celular é mais uma placa erguida na arquibancada; a luz dele acende as placas em
volta, e a prova sobe da tela como um cartaz legível.*

- **Celular dentro do 3D** (mesma cena da arquibancada), pequeno, na base do quadro, de frente para a câmera, com luz
  própria na cor semântica da cena (azul na ação, amarelo no que entra, vermelho no barrado) que **espalha nas placas**
  próximas. Fundo com desfoque mínimo (fileiras e curva sempre legíveis); profundidade pela névoa.
- **A prova sobe da tela:** o elemento exato da tela real (recorte em pixels reais, cartão inteiro, texto ≥ 44 px) entra
  num andar fixo, ligado ao aparelho por um feixe de luz vertical na cor da cena.
- **Andares fixos (px a 1080):** assinatura 270–335 · frase 350–570 · prova 590–1080 · legenda 1095–1250 (caixa sólida
  #0F131B ≥ 0,92, máx. 2 linhas) · celular abaixo da legenda (contexto, fora da zona essencial).
- **Barrado (612–684):** recorte vermelho, placas próximas em vermelho em degrau (sem piscar), amarelos ao fundo ≤ 30%.
- **Taxa (852–906):** foco com recorte arredondado na linha "Taxa de serviço (10%)" do recorte ampliado.
- **Virada:** a grade nasce **completa**; a placa que falta só se apaga no CTA (1188) e acende no toque (~1262).
- **CTA:** a arquibancada preenche o quadro até embaixo; um eixo só; um CTA só (botão com o rótulo real do site
  "Cadastrar minha torcida"; a voz convida "Cadastre sua torcida"); "SOMOS ORGANIZADA" ≥ 96 px; linhas ≥ 44 px
  ("Plano mensal fixo, sem % das vendas." em amarelo — antes "Mensalidade fixa", trocado na rodada 2 porque "mensalidade" já é a do sócio no gancho; "Só paga depois de publicar o site." em branco).
- **Estrutura:** marquise com volume (não linha de 1 px); torres de refletor inteiras dentro do quadro.
- **Som:** leito de 108–234 cerca de 8–10 dB abaixo do pós-virada; ataque claro no 252 (surdo grande + estalo).
