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

### Segurança (instaladas em 15/10/2026, a pedido do dono)

Lidas antes de entrar; scripts revisados (só consultam o registro do npm e o GitHub ou rodam o semgrep; nada apaga
arquivo nem envia dado do projeto). Removidos os testes dos autores (`test_*.py`, `tests/`). Nenhuma ataca o sistema no
ar: `web-pentest` (Bri Russell) ficou de fora para não testar ataques contra as torcidas em produção.

| Pasta | Origem (commit) | Licença | Para quê |
|---|---|---|---|
| `security-audit` | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) `c1c8a8c` | MIT | auditoria completa do código (metodologia da Cloudflare) |
| `audit-context-building`, `entry-point-analyzer`, `sharp-edges`, `differential-review`, `variant-analysis`, `fp-check` | [trailofbits/skills](https://github.com/trailofbits/skills) `1f68e03` | CC-BY-SA 4.0 | entender o código, mapear a superfície de ataque, armadilhas de API, revisar mudanças, achar variantes de um bug, descartar falso positivo |
| `supply-chain-risk-auditor`, `semgrep` | [trailofbits/skills](https://github.com/trailofbits/skills) `1f68e03` | CC-BY-SA 4.0 | risco das dependências (consulta npm e GitHub) e análise estática |
| `owasp-audit`, `api-audit`, `secrets-audit`, `dependency-audit`, `threat-modeling`, `cloud-audit`, `privacy-engineering`, `pci-audit`, `crypto-audit`, `finding-triage` | [briiirussell/cybersecurity-skills](https://github.com/briiirussell/cybersecurity-skills) `c9ade03` | MIT | OWASP, API, segredos, dependências, ameaças, nuvem/Firebase, LGPD, pagamentos, criptografia, triagem |

Não incluídas (não servem a este sistema): as de contratos inteligentes, C/C++/Rust, fuzzing, forense, SOC/SIEM,
HIPAA e red team.

Avaliadas e **não incluídas** (testadas contra o código em 08/10/2026):
- `ui-ux-pro-max` (133,9k estrelas): 3,3 MB de tabelas genéricas; a busca devolveu dicas que já seguimos.
- `taste-skill` e `redesign-skill` (93,8k): voltadas a landing page e portfólio, mandam usar bibliotecas
  (shadcn, Framer Motion) que não usamos e repetem o que a `frontend-design` e a `impeccable` já cobrem.

Para atualizar uma skill: baixe a versão nova, leia o que mudou e repita os ajustes da última coluna.
