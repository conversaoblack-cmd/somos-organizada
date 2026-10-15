# Procedência das skills do estúdio

Todas ficam em `studio/.claude/skills/` (e **não** na raiz), para não disputarem com as skills de UX do produto
(`somos-organizada-ux`, `impeccable` etc.). O Claude Code só as descobre quando a sessão mexe em arquivos de `studio/`.

Critério de adoção (prompt do estúdio, seção 5): repositório e licença lidos; fixado por commit; sem script executável
sem revisão; teste de ativação (dispara em pedido de vídeo, não em tela do produto); registro aqui com o porquê.

| Skill | Origem | Commit (data) | Licença | Por quê | Ajustes nossos |
|---|---|---|---|---|---|
| `remotion-best-practices` (roteador) | github.com/remotion-dev/skills `skills/remotion-best-practices` | `7ba4dcf8ebe1626b00baa41e1f2478113719b60b` (12/10/2026), versão 4.0.535 = a do Remotion instalado | Remotion License (a mesma do Remotion; ver "Licenças") | roteia para as demais; traz cópias de referência de cada uma | removidas as pastas `remotion-maps/` e `remotion-saas/` e as linhas que apontavam para elas |
| `remotion-markup` | idem `skills/remotion-markup` | idem | idem | regras de composição: `multi-scene-video.md`, `transitions.md`, `connected-compositions.md`, `3d.md`, `effects.md`, `motion-blur.md`, `audio.md`, `voiceover.md`, `sfx.md` | removida a subpasta `remotion-maps/` (tinha os únicos scripts executáveis do pacote: `prep-geo.mjs`, `prep-cesium-path.mjs`) |
| `remotion-captions` | idem | idem | idem | legenda por palavra (`Caption`) | nenhum |
| `remotion-render` | idem | idem | idem | render e parâmetros de saída | nenhum |
| `remotion-studio` | idem | idem | idem | prévia | nenhum |
| `remotion-docs` | idem | idem | idem | buscar API atual antes de implementar | nenhum |
| `remotion-multimedia` | idem | idem | idem | metadados de vídeo e áudio (Mediabunny) | nenhum |
| `remotion-interactivity` | idem | idem | idem | props editáveis no Studio | nenhum |
| `remotion-create` | idem | idem | idem | estrutura de composição nova | nenhum |
| `remotion-upgrade` | idem | idem | idem | subir todas as `@remotion/*` juntas | tirados `remotion-maps` e `remotion-saas` do comando `npx skills update` |
| `gsap-core` | github.com/greensock/gsap-skills `skills/gsap-core` | `aed9cfd3277740755f6bfc1155c7aa645403b760` (21/04/2026) | MIT (`LICENSE-gsap-skills`) | API de tween e easing | nota do estúdio no topo: só pela ponte determinística; não vale para `web/` |
| `gsap-timeline` | idem | idem | MIT | coreografia | idem |
| `gsap-plugins` | idem | idem | MIT | SplitText, CustomEase, MorphSVG para tipografia de cena | idem |
| `gsap-utils` | idem | idem | MIT | `mapRange`, `snap`, `interpolate` | idem |
| `gsap-performance` | idem | idem | MIT | transforms e custo por quadro | idem |
| `gsap-react` | idem | idem | MIT | refs e limpeza em React | idem |
| `gsap-frameworks` | idem | idem | MIT | completa o pacote oficial (o prompt pede) | idem |

**Puladas de propósito:**
- `remotion-maps`: mapas e voos geográficos não servem à marca;
- `remotion-saas`: Player, Lambda e render em servidor; o estúdio renderiza local;
- `gsap-scrolltrigger`: vídeo não tem rolagem.

**Scripts executáveis:** nenhum ficou. Os arquivos `agents/openai.yaml` de cada skill são metadados para outro cliente
(não executam nada).

## Licenças

- **Skills do Remotion:** o repositório `remotion-dev/skills` é gerado a partir de `remotion-dev/remotion/packages/skills`,
  que segue a **Remotion License**: grátis para pessoa física e empresa com até 3 funcionários; acima disso, Company License.
  Confirmar a situação da Conversão Black com o dono (registrado em `studio/docs/instalacao.md`).
- **Skills do GSAP:** MIT (cópia em `LICENSE-gsap-skills`).

## Atualizar

1. Clonar de novo, comparar com esta pasta e reaplicar os ajustes da tabela.
2. Trocar o commit e a data aqui.
3. Refazer o teste de ativação (`studio/docs/testes-ativacao/`).
