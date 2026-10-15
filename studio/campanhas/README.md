# Campanhas (uma pasta por peça)

`campanhas/AAAA-MM-DD-<slug>/`:

| Arquivo | Etapa (processo da skill do diretor) |
|---|---|
| `01-briefing.md` | tipo, objetivo, ação, público, hipótese, indicador e como medir, nível de auditoria |
| `02-direcao-de-arte.md` | imagem em uma frase, luz, referências e princípios, paleta de luz, tipografia, planos, movimento, transição, música/SFX, orçamento de leitura |
| `03-roteiro.md` | roteiro da cadeira `roteirista` (6 partes, tempos em frame, voz por extenso, legenda) |
| `04-portao-visual/` | styleframes PNG (com zona), prévia de movimento e a decisão do dono |
| `05-timeline.md` | gerada do código da composição |
| `qc/qc.json` · `evidencias/` | `scripts/qc.mjs` e `scripts/evidencias.mjs` (os frames não vão para o Git) |
| `auditoria/rodada-N/` | `pacote.md`, `pareceres/*.json`, `qc.json`, `resultado.json` |
| `render/` | MP4 de cada versão (fora do Git; a entrega vai para o Drive) |
| `entrega.md` | link do Drive, notas, condições, texto do post, comentário fixado, CTA, licenças |

Áudio da peça: `audio/<slug>/` (narracao.json, mix.json, take, tempos). Composição: `src/composicoes/<slug>/`.
