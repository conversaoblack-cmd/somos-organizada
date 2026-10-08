# Skills deste projeto

O Claude Code carrega sozinho as skills desta pasta em qualquer sessão aberta no projeto (Mac, Windows ou nuvem).
Comece pela `somos-organizada-ux`: ela diz qual usar e quais regras do projeto vencem.

Todas foram lidas antes de entrar. Foram removidos testes dos autores e qualquer coisa que baixe ou execute
programa da internet.

| Pasta | Origem (commit) | Estrelas / forks em 08/10/2026 | Licença | O que mudou aqui |
|---|---|---|---|---|
| `somos-organizada-ux` | própria | — | — | Regras do projeto e qual skill usar |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) `683bc88` | 180k / 21,3k | ver LICENSE.txt | nada |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) `1b6576e` | 78,6k / 4,7k | Apache 2.0 | **sem `scripts/`** (o lançador baixa e executa um binário); aviso no topo do SKILL.md |
| `web-design-guidelines` | [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) `434b7f9` | 32,1k / 2,8k (agent-skills) | MIT | regras fixadas em `regras.md` (a original baixava da internet a cada uso) |
| `react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `063bee9` | 32,1k / 2,8k | MIT (no SKILL.md) | nada |

Avaliadas e **não incluídas** (testadas contra o código em 08/10/2026):
- `ui-ux-pro-max` (133,9k estrelas): 3,3 MB de tabelas genéricas; a busca devolveu dicas que já seguimos.
- `taste-skill` e `redesign-skill` (93,8k): voltadas a landing page e portfólio, mandam usar bibliotecas
  (shadcn, Framer Motion) que não usamos e repetem o que a `frontend-design` e a `impeccable` já cobrem.

Para atualizar uma skill: baixe a versão nova, leia o que mudou e repita os ajustes da última coluna.
