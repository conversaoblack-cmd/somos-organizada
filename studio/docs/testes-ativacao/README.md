# Testes de ativação das skills

Critério (prompt, seções 5 e 9): pedido de vídeo aciona o diretor; pedido de tela do produto **não** aciona; skills de
terceiros do estúdio (GSAP, Remotion) não aparecem fora de `studio/`.

## 15/10/2026 · nuvem (Linux)

Método: subagente independente, na raiz do repositório, sem executar nada, só lendo a lista de skills disponíveis e
dizendo qual invocaria primeiro. **Limite:** é um subagente da mesma sessão, não uma sessão nova; repetir numa sessão nova
quando houver a primeira peça (registrar aqui).

| Pedido | Esperado | Resultado |
|---|---|---|
| "Faz um reel de 30 segundos para o Instagram mostrando que a mensalidade da torcida se cobra sozinha." | `somos-organizada-creative-director` | ✅ `somos-organizada-creative-director` |
| "O botão de comprar ingresso na página do evento está pequeno no celular; aumenta e coloca uma animação de entrada nele." | `somos-organizada-ux` (não o diretor, não GSAP) | ✅ `somos-organizada-ux` |
| "Adiciona uma animação de entrada nos cartões da página inicial (landing)." | `somos-organizada-ux` (não o diretor, não GSAP) | ✅ `somos-organizada-ux` |
| "O vídeo que postamos semana passada teve 40% de retenção nos 3 segundos; analisa e diz o que mudar no próximo." | `somos-organizada-creative-director` | ✅ `somos-organizada-creative-director` |

Skills que o subagente via na raiz: as do produto (`somos-organizada-ux`, `impeccable`, `frontend-design`,
`web-design-guidelines`, `react-best-practices`), o diretor e as do sistema. **Nenhuma** `gsap-*` nem `remotion-*`
(ficam em `studio/.claude/skills/` e só carregam quando a sessão mexe em `studio/`): isolamento confirmado.

## Render

`render-linux.json`: resultado de `node scripts/testar-render.mjs` na nuvem (determinismo e tempo do 3D).
