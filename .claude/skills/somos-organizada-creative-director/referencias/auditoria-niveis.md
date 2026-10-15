# Auditoria: níveis, pacote e protocolo

## Níveis

| Nível | Cadeiras | Quando |
|---|---|---|
| Leve | `motion-review` + `marketing-review` + QC automático | variação de peça já aprovada, ajuste de execução |
| Padrão | Leve + `produto-review` + `torcida-review` | toda peça nova orgânica (padrão) |
| Completa | todas (`roteirista`, `motion-review`, `marketing-review`, `produto-review`, `estrategia-review`, `torcida-review`), com confronto antes da produção | peça paga, de posicionamento ou lançamento |

Subir de nível é livre; descer exige motivo registrado no briefing.

Cobertura: Leve cobre objetivo, clareza, gancho, visual, fidelidade, cta e técnica (100% do peso) só se as duas cadeiras
derem nota em tudo; se faltar, a rodada fica INCONCLUSIVA (< 80% do peso) e você sobe o nível.

## Pacote (`campanhas/<peça>/auditoria/rodada-N/pacote.md`)

- O que mudou desde a rodada anterior (ou "1ª rodada").
- Onde estão: `evidencias/` (frames a cada 0,5 s, `folha.png`, `folha-zona.png`, `onda.png`), `qc.json`, `05-timeline.md`,
  `audio/<peça>/tempos.json`, `src/composicoes/<peça>/legenda.json`, briefing, direção de arte, roteiro.
- Limites conhecidos (ex.: "não julgue o timbre: voz guia"; "3D renderizado por software").
- A instrução: "use o pacote; só vá ao código ou ao produto para contestar um fato, e diga qual".

## Protocolo

1. Rode `node scripts/qc.mjs` e `node scripts/evidencias.mjs` e olhe a folha você mesmo antes de chamar a mesa.
2. Convoque as cadeiras do nível **em paralelo e em segundo plano** (Agent, um por cadeira, `subagent_type` = nome do
   agente em `.claude/agents/`). Nenhuma vê o parecer da outra.
3. Cada uma grava `auditoria/rodada-N/pareceres/<cadeira>.json`. Copie `qc.json` para a pasta da rodada.
4. `node auditoria/pontuar.mjs campanhas/<peça>/auditoria/rodada-N` → `resultado.json`.
5. **Rodadas seguintes:** retome **os mesmos agentes** (SendMessage com o id de cada um): custa menos e cada um confere as
   próprias condições.
6. **Nunca invente parecer:** cadeira que não rodou não tem nota. Se o agente não estiver carregado, rode um subagente
   genérico lendo o `.md` dele literalmente e registre isso no `resultado.json` / `entrega.md`.
7. Correção feita depois do limite de 2 rodadas: diga isso e não apresente nota velha como nova.
8. Verba paga: só com o aval de **todas** as cadeiras e aprovação explícita do dono.
