# Dívidas do produto encontradas pelo estúdio

O estúdio **não edita o produto**. Bug, texto ou estado estranho que um vídeo expuser entra aqui e o dono é avisado; a
sessão do produto decide o que fazer.

| Data | O que | Onde (rota/tela) | Como reproduzir | Impacto no vídeo | Contorno usado | Avisado ao dono |
|---|---|---|---|---|---|---|

## Promessas da página inicial que o código não confirma (15/10/2026, levantamento do estúdio)

Não são bugs de tela; são frases da landing (`web/src/landing/Landing.tsx`) que o vídeo **não** pode repetir sem ajuste.
Avisado ao dono em 15/10/2026. A sessão do produto decide se muda o texto ou o produto.

1. "Um caixa que toda a torcida pode conferir" (linha 642): não há prestação de contas pública; só painel + planilha.
2. "QR assinado digitalmente: cópia e print são barrados" (linha 347): print de QR válido ainda não usado entra uma vez;
   o que barra é o uso único e a conferência do nome com documento.
3. "Carteirinha digital com QR Code": nenhuma tela valida o QR da carteirinha; a portaria o recusa ("Este QR é a
   carteirinha de sócio, não um ingresso.", `functions/src/api/ingressos.ts:462`).
4. "Cadastro em 5 minutos" e o passo 1 dos "4 passos" não citam o vídeo de verificação obrigatório.
5. "Um passo a passo com vídeo mostra onde pegar as chaves da Pagar.me": o vídeo é o tour do painel, não do site da Pagar.me.

## Observações (não são bugs)

- 15/10/2026: no ambiente local de demonstração, o site da torcida mostra a faixa "Ambiente de teste da Pagar.me" no topo
  e o painel mostra avisos "Pagar.me em modo de teste" e "Confirmação automática dos pagamentos ainda não chegou". É estado
  de demonstração; na peça, cortar ou cobrir.
- 15/10/2026: o tour do painel ("Bem-vindo ao painel da torcida") aparece só no 1º acesso de cada conta (gravado no
  servidor). Roteiros de captura usam o passo `opcional` para pulá-lo.
- 15/10/2026: nenhuma mensagem de erro no console do produto nas capturas de teste (`origem.json` → `errosNoConsole: []`).
