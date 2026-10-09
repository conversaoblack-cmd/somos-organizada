# Somos Organizada: regras para quem trabalha neste projeto (pessoas e Claude)

Responda em português do Brasil. O dono do projeto alterna entre **Mac** e **Windows** e também usa uma sessão
do Claude Code na nuvem. Por isso a fonte da verdade é sempre **GitHub (código) + Firebase (produção)**,
nunca uma pasta local.

## Antes de qualquer implantação (obrigatório)

1. Leia este arquivo inteiro.
2. Rode `bash scripts/verificar.sh` (só leitura) e mostre o resultado ao dono antes de implantar. Ele mostra:
   Git em dia com o GitHub, conta do Firebase em uso, chaves existentes (só metadados), functions que
   respondem em produção e site no ar.
3. Só implante com o Git limpo e em dia (`git status` vazio, nada atrás nem à frente do GitHub).
   O `scripts/implantar.sh` recusa sozinho se não estiver.
4. Uma implantação por vez: não rode o `implantar.sh` em dois computadores ao mesmo tempo.
5. Implantar = `bash scripts/implantar.sh`. Nunca `firebase deploy` solto: o script sobe as functions antes
   do site, em lotes (cota de CPU do Cloud Run na região), oferece remover functions antigas e confere tudo no final.

## Desenho das functions (não volte a espalhar)

Cada function é um serviço do Cloud Run e todas dividem a mesma cota de CPU da região. Com 39 functions
separadas o deploy estourava a cota e deixava metade fora do ar (403/429). Por isso são só **6**:

- `api`: porta única de todas as chamadas do painel e do site. O front chama `httpsCallable("api")` com
  `{ acao, dados }` e `functions/src/api/central.ts` repassa para o handler (mapa `ACOES`).
  **Ação nova = handler `onCall` no módulo + uma linha no `ACOES`.** Não exporte no `index.ts`.
- `pagarmeWebhook` (HTTP, recebe a Pagar.me), `previaLink` (HTTP: o Hosting manda `/{torcida}`, `/{torcida}/e/{codigo}`
  e `/{torcida}/evento/{id}` para ela, que devolve o app.html com título, imagem e preço para a prévia do WhatsApp)
  e as agendadas `expirarPedidos`, `rotinaSocios`, `rotinaSaas`.

O `implantar.sh` lista as functions publicadas que não existem mais no código e só apaga se o dono digitar
`sim` (ou `REMOVER_ANTIGAS=1`).

## Proibido sem pedido explícito do dono

- Criar, trocar, ler ou apagar segredos: `firebase functions:secrets:set`, `secrets:access`, `secrets:destroy`.
  Para conferir se existem, use só `firebase functions:secrets:get <NOME>` (metadados).
- **Nunca gerar MASTER_KEY ou QR_HMAC novas.** Trocar a MASTER_KEY deixa ilegíveis as chaves Pagar.me das
  torcidas; trocar a QR_HMAC invalida todos os ingressos e carteirinhas. `CRIAR_CHAVES=1` só existe para
  projeto novo, sem torcidas.
- Colar, imprimir ou registrar chaves e tokens no chat, no Git ou em logs.
- Apagar dados do Firestore, functions, sites do Hosting ou domínios.
- Abrir pull request ou mudar de branch. A branch de trabalho é `claude/firebase-access-oxibba`.

## Contexto rápido

- Projeto Firebase: `somos-organizada` (plano Blaze), região das functions `southamerica-east1`.
- Conta do Firebase CLI para este projeto: `conversaoblack@gmail.com` (`firebase login:use` dentro da pasta).
- Endereços:
  - `somosorganizada.com.br/{torcida}`: página pública da torcida;
  - `/{torcida}/conta`: quem comprou ingresso e não é sócio;
  - `/{torcida}/socio`: painel do sócio;
  - `/{torcida}/admin`: diretoria, subsedes e portaria;
  - `plataforma.somosorganizada.com.br`: painel da equipe.
- Página inicial (`/`): HTML estático gerado no build a partir de `web/src/landing/` (React só no build, 1 KB de
  script no navegador; Lighthouse 100 nas 4 notas). O sistema (cadastro, entrar, torcidas, painéis) é o
  `web/app.html`; o Hosting manda para ele tudo que não é `/`. Não importe Firebase nem React no
  `landing/cliente.ts`. Torcida de exemplo no botão do topo: `VITE_SLUG_DEMO=<endereço>` em `web/.env.production.local`.
- Confirmação de e-mail: o e-mail sai pelo nosso provedor (ação `enviarConfirmacaoEmail`) com link para
  `/verificar`, que confirma e continua o cadastro na mesma aba; sem provedor, cai no e-mail padrão do Firebase.
  Cadastro e compras lembram o passo (recarregar volta para onde parou).
- Link direto de evento: `/{torcida}/e/{codigo}` (6 caracteres de `web/src/lib/eventos.ts`, dado na criação, imutável
  pelas regras). Padrão de UX e próximas melhorias: `docs/UX.md` (leia antes de mexer em tela).
- Skills de UX/UI instaladas em `.claude/skills/` (carregam sozinhas em qualquer sessão). Para mexer em tela,
  comece pela `somos-organizada-ux`: ela diz qual usar e quais regras do projeto vencem as de terceiros.
- Estrutura: `functions/` (back-end), `web/` (front-end), `firestore.rules`, `storage.rules`, `scripts/`
  (implantar e verificar), `testes-e2e/` (emuladores + Pagar.me simulada), `docs/IMPLANTACAO.md` (guia completo).
- Arquivos locais que **não** vão para o Git e são recriados pelo `implantar.sh`: `functions/.env` e
  `web/.env.production.local`. A cópia de segurança das chaves fica em `~/.somos-organizada/<projeto>`,
  só na máquina onde foram criadas.

## Antes de enviar mudança de código

- `npm --prefix functions test` (regras de negócio) e `cd web && npm run typecheck` (tipos do front + `scripts/checar-efeitos.mjs`).
- Mudou back-end ou regras: `env -u JAVA_TOOL_OPTIONS bash testes-e2e/rodar.sh` (fluxo completo, ~3 min).
- Mudou tela: `EXIGIR_SEM_INTERNET=1 bash testes-e2e/navegador.sh` (fluxos críticos pela tela, ~7 min: cadastro, aprovação,
  evento, compra, sócio, carteirinha, portaria e sem internet; modo normal e "Chrome novo", 360 e 1280 px). Reprova com
  qualquer erro no console. "Não reproduzi" não é resposta para erro relatado em produção: baixe o bundle publicado e o
  `.map` (`https://somosorganizada.com.br/assets/<arquivo>.js.map`) e ache a linha original.

## Regras que já derrubaram produção (não repita)

- Efeito do React sempre com chaves: `useEffect(() => { algo(); }, [...])`. Sem chaves, o valor de `algo()` vai para o React
  como "limpeza" e a tela cai na troca ("q is not a function"): no Chrome novo `scrollIntoView` devolve uma Promise.
  O `checar-efeitos` (no typecheck e no build) recusa.
- Nada de API que não existe no iPhone com iOS 15 ou em Android antigo (`AbortSignal.timeout`, `structuredClone`,
  `requestIdleCallback`, `.at()`, `findLast`, `Object.hasOwn`, `crypto.randomUUID`...): use `prazo()` de `lib/servicos.ts`
  etc. O `checar-efeitos` recusa; o build gera código para Safari 15 / Chrome 87.
- Cor com transparência ou mistura (`bg-x/10`, `color-mix`): o build acrescenta a reserva para navegadores sem color-mix
  (`web/plugins/coresCompat.ts`, variáveis de `lib/tema.ts`). Degradê em `style`: use `backgroundColor` (cor sólida) +
  `backgroundImage`, nunca só `background`.
- Dinheiro e portaria são idempotentes: compra leva `idCompra` (mesmo id nas tentativas; resposta perdida não cobra duas
  vezes); erro sem resposta da Pagar.me não encerra o pedido (fica "criando" para conferência); a portaria manda `leituraId`
  e o "Tentar de novo" repete o mesmo.
- O service worker (`sw.js`, gerado no build a partir de `web/scripts/sw-modelo.js`) só vale para o app (nunca para "/").
  O QR (carteirinha e ingressos) fica no aparelho para a portaria sem internet e é apagado ao sair da conta.
  E-mail nunca leva QR (decisão do dono): leva para a conta.
- Mexeu em tela: `bash testes-e2e/navegador.sh` (fluxos críticos pelo navegador, modo normal e "Chrome novo",
  360 e 1280 px, ~5 min; guia em `testes-e2e/navegador/README.md`).
- Commit com mensagem em português explicando o porquê, e `git push` na mesma branch.

## Windows

O `implantar.sh` foi testado no Mac e no Linux. No Windows use o **WSL** (Ubuntu). O Git Bash serve para Git,
Firebase CLI e `verificar.sh`. Implantar pelo Git Bash ainda não foi validado: avise o dono antes.
