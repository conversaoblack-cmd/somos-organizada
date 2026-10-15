# Rubrica da mesa de avaliadores

Fonte única em código: `auditoria/criterios.json` (lido por `auditoria/pontuar.mjs`). Mudou aqui, mude lá (e vice-versa).

## Critérios

| Critério | Peso | Natureza | O que mede |
|---|---|---|---|
| objetivo | 20% | **hipótese** (o público decide) | a peça serve ao objetivo do briefing e ao público (diretoria de torcida) |
| clareza | 15% | execução | uma ideia por cena; entende-se no mudo; o caminho do produto é seguível |
| gancho | 15% | **hipótese** (a execução pesa, mas a retenção é do público) | 0 a 1,5 s: dor, perda ou promessa concreta; texto e voz dizem o mesmo |
| visual | 15% | execução | padrão publicitário com linguagem própria × animação genérica de interface |
| fidelidade | 15% | execução | produto real e "Comunicável: Sim"; marca (paleta sem verde, Archivo, logo, semântica de cor) |
| cta | 10% | **hipótese** | um passo, oferta verdadeira, repete o gesto mostrado, leva ao lugar certo |
| tecnica | 10% | execução | QC automático (`scripts/qc.mjs`) + leitura técnica do motion |

## Quem pontua o quê

| Cadeira | Critérios |
|---|---|
| roteirista | gancho, clareza |
| motion-review | gancho, visual, fidelidade, tecnica |
| marketing-review | objetivo, clareza, gancho, fidelidade, cta |
| produto-review | clareza, fidelidade, cta |
| estrategia-review | objetivo |
| torcida-review | fidelidade, objetivo |
| QC automático | tecnica |

Nota fora da competência é **descartada** pelo `pontuar.mjs` (e listada no resultado).

## Cálculo

- Média das notas não nulas de cada critério; média ponderada com os pesos renormalizados.
- Menos de 80% do peso avaliável = rodada **INCONCLUSIVA**.
- **Meta:** ≥ 9,0 e nenhum bloqueio.
- Reporte separado: **nota de execução** (clareza, visual, fidelidade, técnica) e **previsão de conteúdo** (objetivo, gancho, cta).
- Nos critérios de hipótese, cada avaliador diz **qual métrica do post publicado confirma ou derruba** a nota:
  taxa de pulo e retenção nos 3 s, retenção média, cliques no link da bio, cadastros de torcida no período.

## Bloqueios (valem independentemente da média)

- problema de gravidade **crítica**;
- `informacao_falsa: true`;
- `desalinhado_objetivo: true`;
- veto em pé de qualquer cadeira;
- falha crítica no QC.

## Gravidade

| Gravidade | Quando |
|---|---|
| crítica | mente ou impede publicar |
| alta | compromete o objetivo |
| média | atrapalha, mas a peça funciona |
| baixa | detalhe perceptível |
| cosmética | gosto |

## Âncoras de nota (para não inflar)

| Nota | Significa |
|---|---|
| 10 | não há o que melhorar com o material disponível; nada a apontar |
| 9 | padrão profissional; só detalhes de baixa gravidade |
| 8 | bom, com um problema médio identificável |
| 7 | funciona, mas com problema alto ou vários médios |
| 5–6 | genérico ou confuso em partes essenciais |
| < 5 | não serve ao objetivo |

Visual: "poderia ser de outra marca?" Se sim, **não passa de 8,0**. Sem direção de arte aprovada no portão, **não passa de 7,0**.
A meta é do estúdio, não do avaliador: nota não sobe para bater meta.

## JSON de cada parecer (`auditoria/rodada-N/pareceres/<cadeira>.json`)

```json
{
  "avaliador": "motion-review",
  "veredito": "APROVA | APROVA COM CONDIÇÃO | VETA",
  "evidencias_usadas": ["folha-zona.png", "frames/t001.0.png", "qc.json", "timeline.md"],
  "notas": {"gancho": 8.5, "visual": 8, "fidelidade": 9, "tecnica": null},
  "justificativa": {
    "visual": {"natureza": "execucao", "texto": "...", "por_que_nao_e_10": "..."},
    "gancho": {"natureza": "hipotese", "texto": "...", "por_que_nao_e_10": "...", "metrica_que_confirma": "retenção nos 3 s"}
  },
  "pontos_fortes": ["..."],
  "problemas": [{"descricao": "...", "gravidade": "alta", "criterio": "visual", "evidencia": "t004.5", "correcao": "frame 135: ... (valor)"}],
  "riscos": ["..."],
  "informacao_falsa": false,
  "desalinhado_objetivo": false
}
```

`null` = não deu para julgar com as evidências (não chute).
