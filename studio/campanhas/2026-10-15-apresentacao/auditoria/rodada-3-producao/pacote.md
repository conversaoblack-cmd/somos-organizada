# Pacote · rodada 3 · PEÇA COMPLETA (auditoria Completa) · Apresentação

1ª auditoria da peça montada inteira (45 s). Antes dela: rodada 0 (roteiro, todos APROVA COM CONDIÇÃO), rodadas 1–2 do
portão visual (motion-review vetou a v1; a v2 derrubou o veto; torcida-review aprovou com a condição da frase da cena 2).
Rodadas de correção usadas: 1 de 2 (a do portão). Depois desta, resta 1.

## O que mudou desde o portão (rodada 2)

1. **Pedido do dono** (aprovou a direção e pediu): as telas do produto precisam ser o sistema como ele é, com a pessoa
   usando: a portaria com o leitor de QR e o QR dando "já utilizado"; o painel da diretoria, a pessoa abrindo o menu e
   criando o evento. Feito com **gravações do produto real** (build de produção apontado para os emuladores):
   - cena 5 (504–684): a câmera do leitor da portaria vê o celular do torcedor com o QR real → "Conferindo…" →
     **LIBERADO** (561) → o mesmo QR de novo → **JÁ UTILIZADO** (612, com as placas vermelhas);
   - cena 7a (828–972): a diretoria digita o valor do público e o próprio sistema mostra "Torcedor paga R$ 143,00 (inclui
     10% de taxa)" (com "10%" e "vira caixa" agora no eixo x 120);
   - cena 7b (972–1080): menu aberto → "Novo evento" sendo preenchido → "Publicar evento" → "Evento publicado! Já está na
     página da torcida.";
   - o celular na arquibancada toca a mesma gravação (versão fluida) em sincronia com o recorte.
2. **Trilha:** o dono achou que a percussão sintetizada poderia não soar bem. Agora: tensão sintetizada (108–252) e
   **bateria GRAVADA** de batucada (CC0, Felix Blume) a partir do 252, acelerada para a grade de 100 BPM (acentos a
   ±25 ms da grade), "lá fora" (abafada, −9 dB) no breakdown da taxa (828–1080), corte seco com impacto no 1332.
3. Condições do portão aplicadas: barrado com a grade a 30% e anel vermelho; celular e feixe no eixo x 450; sócio inteiro;
   frase da cena 2 "A torcida cresceu, o caderno não."; CTA "Plano mensal fixo, sem % das vendas." (antes "Mensalidade
   fixa": "mensalidade" já é a do sócio no gancho).

## Evidências (caminhos relativos a /home/user/somos-organizada/studio/campanhas/2026-10-15-apresentacao)

- `05-producao/apresentacao-previa.mp4`: a peça inteira, 1080×1920, 30 fps, com trilha e SFX (sem voz: a legenda vem da
  voz guia). Não abra o vídeo: use as evidências abaixo.
- `05-producao/evidencias/folha.png` e `folha-zona.png` (quadros a cada 0,5 s, com a zona essencial), `frames/`,
  `onda.png`, `evidencias.json`.
- `auditoria/rodada-3-producao/qc.json` (QC da peça inteira).
- `05-timeline.md` (gerada do código: cenas, trechos gravados com instante e velocidade, falas, SFX, trilha).
- `01-briefing.md`, `02-direcao-de-arte.md` (com a v2), `03-roteiro.md`, `../../marca/`, `../../conhecimento/`,
  `../../audio/LICENCAS.md`, `captura/*.json` e `../../public/apresentacao/fluxos/*-origem.json` (de onde veio cada
  gravação e o que foi coberto).

## Limites conhecidos (não julgue como defeito)

- Sem voz final: o dono gera a locução na ElevenLabs a partir de `audio/apresentacao/take/PARA-ELEVENLABS.md`; a
  legenda e os tempos vêm da voz guia (espeak) e serão realinhados com a voz final.
- A gravação nítida do produto tem ~9 quadros/s (capturas 3×): a digitação e as trocas de tela andam em degraus nos
  recortes; a tela do celular usa a fluida (30 fps, 1×).
- O verde do LIBERADO é a cor real do produto nesse estado (o dono pediu a tela como ela é); anel, feixe e luz ficam
  brancos. A linha "Torcedor paga R$ 143,00…" fica em ~35 px (a largura da zona não deixa mais sem falsear a tela).
- O diretor não ouve áudio: julgue a trilha pela onda, pelos níveis medidos e pelos cues; o dono vai ouvir.
- 3D renderizado por software (swangle) na nuvem; o render final de entrega é no Mac.

## Instrução

Use o pacote; só vá ao código ou ao produto para contestar um fato, e diga qual. Grave o parecer em
`campanhas/2026-10-15-apresentacao/auditoria/rodada-3-producao/pareceres/<sua-cadeira>.json`.
