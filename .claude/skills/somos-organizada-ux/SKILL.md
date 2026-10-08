---
name: somos-organizada-ux
description: Ponto de partida para qualquer mudança de tela, fluxo ou texto do Somos Organizada (site da torcida, página de evento, compra de ingresso, adesão de sócio, painéis da diretoria, do sócio e da plataforma, portaria, página inicial). Diz qual skill de UX/UI usar em cada caso e quais regras do projeto vencem as das skills de terceiros.
---

# UX do Somos Organizada

Antes de mexer em qualquer tela: leia `CLAUDE.md` e `docs/UX.md`. Ordem de prioridade quando algo conflitar:

1. `CLAUDE.md` (regras do projeto e de implantação)
2. `docs/UX.md` (público, regras de tela, próximas melhorias)
3. Identidade: Somos Organizada em azul e amarelo; dentro de `/{torcida}` só as cores e a marca da torcida
4. As skills de terceiros abaixo

## Qual skill usar

| Situação | Skill |
|---|---|
| Tela ou seção nova, definir direção visual | `frontend-design` |
| Revisar uma tela pronta (crítica com nota, problemas por prioridade, visão de cada perfil de usuário) | `impeccable` → `critique` |
| Deixar a tela à prova de uso real: texto longo, erro, vazio, internet ruim | `impeccable` → `harden` |
| Textos, rótulos e mensagens de erro | `impeccable` → `clarify` (sempre pt-BR simples) |
| Primeiro acesso, telas vazias, onboarding da diretoria | `impeccable` → `onboard` |
| Checklist técnico (acessibilidade, foco, formulários, imagens, toque) com `arquivo:linha` | `web-design-guidelines` |
| Código React: tamanho do app, renderizações, efeitos | `react-best-practices` (ignore as regras de Next.js e de servidor) |

Para os perfis do `critique`, use os do `docs/UX.md`: torcedor comprando pelo link do WhatsApp, sócio pagando
a mensalidade, diretor criando evento pelo celular, porteiro com fila andando.

## Regras do projeto que vencem as skills

- **Público**: torcedor no celular simples e com pouco dado, diretor que gere pelo celular. Linguagem de
  torcedor, frases curtas, nada de jargão; botões de 44 px ou mais; teste sempre em 360 px de largura.
- **Cores**: nas páginas da torcida use só os tokens do tema (`primaria`, `secundaria`, `fundo`, `texto`,
  `superficie*`), nunca hex fixo: cada torcida escolhe as suas e o tema corrige contraste.
- **Sem bibliotecas novas** de componentes, ícones ou animação (shadcn, Material, Fluent, Framer Motion...) sem pedir ao dono.
  O projeto usa Tailwind 4 e os componentes de `web/src/ui`.
- **Sem imagens de banco (picsum, unsplash) em produção**: só as que a torcida envia ou ilustração em HTML/CSS/SVG.
- **Fontes**: só as hospedadas em `web/public/fontes` (sem Google Fonts por CDN).
- **Português**: as regras de "Title Case" e aspas inglesas das skills não valem; títulos com só a primeira maiúscula.
- **Página inicial** (`web/src/landing`): HTML estático; Lighthouse precisa continuar 100 nas 4 notas.
  Não coloque React nem Firebase no `landing/cliente.ts`.
- **Dinheiro e números**: nada de urgência falsa, contador ou prova social inventada. Persuadir com fatos do produto.
- Verde só para "deu certo" (pago, em dia, entrada liberada).

## Ponto de atenção conhecido

A `frontend-design` aponta como "cara de gerado por IA": rótulos em CAIXA ALTA espaçada acima de títulos, textos
com " · " entre itens e numeração 01/02/03 fora de sequência real. A página inicial e o site da torcida usam alguns
desses recursos. Ao revisitar essas telas, avalie trocar por soluções próprias da torcida, sem mudar tudo de uma vez.

## Depois de mudar uma tela

Rode `cd web && npx tsc -b --noEmit`, veja no navegador (celular 360 px e computador) e, se for a página
inicial, o Lighthouse. Fontes e versões das skills: `.claude/skills/README.md`.
