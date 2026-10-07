# Somos Organizada

SaaS multiloja para torcidas organizadas: **programa de sócios** e **venda de ingressos** numa única
plataforma, com painel da diretoria e painel da equipe Somos Organizada.

- Cada torcida tem página própria (`somosorganizada.com.br/{torcida}`) com as cores dela.
- Cada torcida conecta **a própria conta Pagar.me**: o dinheiro cai direto na conta da torcida.
- **Taxa de serviço de 10%** cobrada por cima do ingresso e da mensalidade; fica no caixa da diretoria.
- Sede principal + subsedes: o painel calcula quanto repassar para cada subsede.
- A receita da plataforma é a mensalidade do contrato com a diretoria, cobrada por fora do sistema.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `functions/` | Back-end (Cloud Functions, Node 22, TypeScript): pagamentos, webhook Pagar.me, sócios, ingressos, portaria, painel da plataforma, rotinas agendadas |
| `web/` | Front-end único (React + Vite + Tailwind): página da torcida, checkouts, área do sócio, painel da diretoria, portaria, painel da plataforma, suporte |
| `firestore.rules`, `storage.rules` | Segurança: dinheiro e status só pelo servidor |
| `testes-e2e/` | Teste ponta a ponta, Pagar.me simulada e ambiente local com dados de demonstração |
| `docs/` | [Implantação](docs/IMPLANTACAO.md) · [Convenções do front-end](docs/FRONTEND.md) |
| `legado/` | Builds antigos recuperados do Firebase Hosting (`brasil-estrutura`), só para referência |

## Começar

- Colocar no ar: [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md)
- Rodar local: `bash testes-e2e/dev-local.sh` → http://127.0.0.1:5173/brasil
