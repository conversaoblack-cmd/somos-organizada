#!/usr/bin/env bash
# Sobe os emuladores (Auth, Firestore, Functions, Storage) e roda o fluxo completo
# contra a Pagar.me simulada. Nada aqui toca o projeto real nem a Pagar.me real.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

npm --prefix "$RAIZ/functions" run build

# Segredos e parâmetros só do emulador (não vão para o deploy)
cat > "$RAIZ/functions/.secret.local" <<EOF
MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
QR_HMAC=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
EMAIL_API_KEY=desativado
EOF
cat > "$RAIZ/functions/.env.local" <<EOF
PAGARME_API_URL=http://127.0.0.1:4010
URL_APP=http://localhost:5173
PLATAFORMA_EMAILS=equipe@somos.test
EOF

cd "$RAIZ"
# Sem proxy: o firebase-tools manda a consulta do Storage ao Firestore (regras que leem o banco) pelo proxy
# do ambiente, ignorando o NO_PROXY, e a regra recebe "documento não existe".
env -u JAVA_TOOL_OPTIONS -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy firebase emulators:exec --project demo-somos --only auth,firestore,functions,storage \
  "node --test --test-concurrency=1 testes-e2e/fluxo.test.mjs"
