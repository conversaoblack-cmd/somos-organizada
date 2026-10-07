#!/usr/bin/env bash
# Implantação completa da Somos Organizada num projeto Firebase.
#
#   bash scripts/implantar.sh                 # projeto padrão: somos-organizada
#   bash scripts/implantar.sh outro-projeto   # outro ID de projeto
#
# O que faz (pode rodar quantas vezes quiser; é idempotente):
#   1. confere login e projeto do Firebase
#   2. instala dependências e roda os testes
#   3. gera as chaves MASTER_KEY e QR_HMAC (só se ainda não existirem), grava no
#      Secret Manager do Google e guarda uma cópia SÓ nesta máquina, em ~/.somos-organizada
#   4. cria/baixa a configuração do app Web e gera web/.env.production.local
#   5. faz o build e o deploy (regras, índices, functions e hosting)
#
# As chaves nunca são impressas na tela, nunca vão para o Git e nunca vão para o banco de dados.
set -euo pipefail

PROJETO="${1:-somos-organizada}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
COFRE="$HOME/.somos-organizada/$PROJETO"
EMAILS_PLATAFORMA="${PLATAFORMA_EMAILS:-conversaoblack@gmail.com}"

passo() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
falha() { printf '\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }

cd "$RAIZ"

passo "Atualizando o código"
git pull --ff-only 2>/dev/null || aviso "Não consegui atualizar via git pull; seguindo com o código desta pasta."

passo "Conferindo ferramentas"
command -v node >/dev/null || falha "Node.js não encontrado. Instale a versão 22: https://nodejs.org"
NODE_MAIOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAIOR" -ge 20 ] || falha "Node.js $NODE_MAIOR é antigo. Instale a versão 22."
command -v firebase >/dev/null || { echo "Instalando firebase-tools..."; npm install -g firebase-tools; }

passo "Login no Firebase"
firebase projects:list >/dev/null 2>&1 || firebase login
firebase use "$PROJETO" >/dev/null || falha "Não achei o projeto '$PROJETO' na sua conta. Confira o ID no console do Firebase."
echo "Projeto: $PROJETO"

passo "Instalando dependências"
npm --prefix functions install --no-audit --no-fund
npm --prefix web install --no-audit --no-fund

passo "Rodando os testes de regra de negócio"
npm --prefix functions test >/dev/null && echo "Testes OK"

passo "Chaves de segurança (MASTER_KEY e QR_HMAC)"
mkdir -p "$COFRE"
chmod 700 "$COFRE"
for SEGREDO in MASTER_KEY QR_HMAC; do
  ARQ="$COFRE/$SEGREDO"
  if firebase functions:secrets:access "$SEGREDO" --project "$PROJETO" >/dev/null 2>&1; then
    echo "$SEGREDO já existe no Secret Manager. Mantido sem alteração."
    [ -f "$ARQ" ] || aviso "Não há cópia local de $SEGREDO nesta máquina (ela foi criada em outro computador). Tudo bem, só não apague o segredo no Google."
  else
    if [ ! -f "$ARQ" ]; then
      node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$ARQ"
      chmod 600 "$ARQ"
      echo "$SEGREDO gerada."
    fi
    firebase functions:secrets:set "$SEGREDO" --data-file "$ARQ" --project "$PROJETO" >/dev/null
    echo "$SEGREDO gravada no Secret Manager."
  fi
done
echo "Cópia de segurança local: $COFRE (somente seu usuário consegue ler)"

passo "Parâmetros das functions"
if [ ! -f functions/.env ]; then
  printf 'URL_APP=https://%s.web.app\nPLATAFORMA_EMAILS=%s\n' "$PROJETO" "$EMAILS_PLATAFORMA" > functions/.env
  echo "functions/.env criado (URL_APP=https://$PROJETO.web.app)."
else
  echo "functions/.env já existe, mantido:"; cat functions/.env
fi

passo "Configuração do app Web"
JSON_APPS="$(firebase apps:list WEB --project "$PROJETO" --json 2>/dev/null || echo '{}')"
APP_ID="$(node -e 'const j=JSON.parse(process.argv[1]||"{}"); const a=(j.result||[])[0]; process.stdout.write(a?a.appId:"")' "$JSON_APPS")"
if [ -z "$APP_ID" ]; then
  JSON_NOVO="$(firebase apps:create WEB "Somos Organizada" --project "$PROJETO" --json)"
  APP_ID="$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.result.appId)' "$JSON_NOVO")"
  echo "App Web criado: $APP_ID"
else
  echo "App Web existente: $APP_ID"
fi
JSON_CFG="$(firebase apps:sdkconfig WEB "$APP_ID" --project "$PROJETO" --json)"
node -e '
  const c = JSON.parse(process.argv[1]).result.sdkConfig;
  const linhas = [
    `VITE_FIREBASE_API_KEY=${c.apiKey}`,
    `VITE_FIREBASE_AUTH_DOMAIN=${c.authDomain}`,
    `VITE_FIREBASE_PROJECT_ID=${c.projectId}`,
    `VITE_FIREBASE_STORAGE_BUCKET=${c.storageBucket || c.projectId + ".firebasestorage.app"}`,
    `VITE_FIREBASE_APP_ID=${c.appId}`,
    `VITE_VERSAO=${new Date().toISOString().slice(0, 10)}`,
  ];
  const fs = require("fs");
  fs.writeFileSync("web/.env.production.local", linhas.join("\n") + "\n");
  // Chave pública do app Web (a mesma que vai no site): as functions usam para conferir a senha no login por CPF
  const env = fs.readFileSync("functions/.env", "utf8").split("\n").filter((l) => l && !l.startsWith("WEB_API_KEY="));
  fs.writeFileSync("functions/.env", [...env, `WEB_API_KEY=${c.apiKey}`].join("\n") + "\n");
' "$JSON_CFG"
echo "web/.env.production.local gerado (e WEB_API_KEY em functions/.env)."

passo "Build do front-end"
npm --prefix web run build

passo "Deploy (pode levar alguns minutos na primeira vez)"
echo "Se o Firebase perguntar se pode dar ao Storage acesso de leitura ao Firestore, responda Y."
if ! firebase deploy --project "$PROJETO"; then
  aviso "O primeiro deploy de functions às vezes falha enquanto o Google termina de liberar as permissões. Tentando de novo em 60s..."
  sleep 60
  firebase deploy --project "$PROJETO"
fi

passo "Pronto!"
cat <<FIM
Página:      https://$PROJETO.web.app
Plataforma:  https://$PROJETO.web.app/plataforma   (entre com $EMAILS_PLATAFORMA)
Chaves:      $COFRE   ← guarde também num cofre de senhas

Próximos passos:
  1. Abra /plataforma, crie a conta com o e-mail acima, confirme o e-mail e clique em "Ativar acesso da equipe".
  2. Crie a primeira torcida e mande o link de senha para o diretor.
  3. Quando apontar o domínio próprio, troque URL_APP em functions/.env e rode este script de novo.
FIM
