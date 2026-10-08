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
- Link direto de evento: `/{torcida}/e/{codigo}` (6 caracteres de `web/src/lib/eventos.ts`, dado na criação, imutável
  pelas regras). Padrão de UX e próximas melhorias: `docs/UX.md` (leia antes de mexer em tela).
- Estrutura: `functions/` (back-end), `web/` (front-end), `firestore.rules`, `storage.rules`, `scripts/`
  (implantar e verificar), `testes-e2e/` (emuladores + Pagar.me simulada), `docs/IMPLANTACAO.md` (guia completo).
- Arquivos locais que **não** vão para o Git e são recriados pelo `implantar.sh`: `functions/.env` e
  `web/.env.production.local`. A cópia de segurança das chaves fica em `~/.somos-organizada/<projeto>`,
  só na máquina onde foram criadas.

## Antes de enviar mudança de código

- `npm --prefix functions test` (regras de negócio) e `cd web && npx tsc -b --noEmit` (tipos do front).
- Mudou back-end ou regras: `env -u JAVA_TOOL_OPTIONS bash testes-e2e/rodar.sh` (fluxo completo, ~3 min).
- Commit com mensagem em português explicando o porquê, e `git push` na mesma branch.

## Windows

O `implantar.sh` foi testado no Mac e no Linux. No Windows use o **WSL** (Ubuntu). O Git Bash serve para Git,
Firebase CLI e `verificar.sh`. Implantar pelo Git Bash ainda não foi validado: avise o dono antes.
