# Pacote · rodada 0 (confronto do ROTEIRO antes da produção) · Apresentação

Nível **Completo** (01-briefing.md). Nesta rodada avalia-se o **roteiro** e a adequação das telas reais escolhidas;
o visual final ainda não existe (há 2 styleframes iniciais e 2 estudos do mosaico só como referência de linguagem).

## O que abrir (caminhos relativos a /home/user/somos-organizada/studio)

- `campanhas/2026-10-15-apresentacao/01-briefing.md` · `02-direcao-de-arte.md` · `03-roteiro.md` (inclui a seção 6
  "Decisões do diretor")
- `audio/apresentacao/narracao.json` (falas, frames, legendas)
- `conhecimento/verdade-do-produto.md` · `conhecimento/produto-na-pratica.md` · `conhecimento/publico.md` · `marca/marca.md`
- `campanhas/2026-10-15-apresentacao/auditoria/rodada-0-roteiro/evidencias/telas.png`: as 12 telas REAIS gravadas no
  ambiente de demonstração (nome de cada uma no canto). Em tamanho real: `public/apresentacao/telas/<nome>.png` (1170×2532).
  Origem de cada captura: `assets/apresentacao/*/origem.json` (rota, conta, o que foi coberto).
- `evidencias/styleframe-prova.png` e `evidencias/styleframe-caixa.png`: styleframes iniciais (cenas 5c e 7a).
- `evidencias/estudo-mosaico-gancho.png` e `estudo-mosaico-virada.png`: estudo da arquibancada 3D.

## Limites conhecidos

- Não há voz ainda (o dono gera na ElevenLabs depois); não julgue timbre. O ritmo está calculado no roteiro (seção 2).
- Trilha e SFX são sintetizados pelo estúdio; não há música de terceiros.
- A torcida de exemplo ("Torcida Brasil", roxo e branco, escudo "TB 1990") é fictícia, criada pela semente do estúdio
  (`scripts/semente-estudio.mjs`); o rótulo "Torcida Brasil · dados de demonstração" aparece em toda tela de produto.
- Nas capturas foram cobertos: o botão flutuante de ajuda, a faixa "Ambiente de teste da Pagar.me" e o aviso "Nenhuma câmera
  encontrada" (do navegador sem câmera da nuvem). Registrado em cada `origem.json`.
- Preços de ingresso que aparecem nas telas (R$ 120/150) são da torcida de demonstração; a regra "sem preço" do dono vale
  para os **planos da plataforma**, que não aparecem.

## Instrução

Use o pacote; só vá ao código ou ao produto para contestar um fato, e diga qual. Grave o parecer em
`campanhas/2026-10-15-apresentacao/auditoria/rodada-0-roteiro/pareceres/<sua-cadeira>.json`.
