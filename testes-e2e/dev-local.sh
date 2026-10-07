#!/usr/bin/env bash
# Ambiente completo de desenvolvimento, 100% local:
#   emuladores Firebase + Pagar.me simulada + torcida de demonstração + front-end (Vite)
# Uso: bash testes-e2e/dev-local.sh   →   http://127.0.0.1:5173/brasil
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="${LOGS:-/tmp/somos-dev}"
mkdir -p "$LOGS"

npm --prefix "$RAIZ/functions" run build >/dev/null
[ -f "$RAIZ/functions/.secret.local" ] || cat > "$RAIZ/functions/.secret.local" <<EOS
MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
QR_HMAC=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
EOS
cat > "$RAIZ/functions/.env.local" <<EOS
PAGARME_API_URL=http://127.0.0.1:4010
URL_APP=http://127.0.0.1:5173
PLATAFORMA_EMAILS=equipe@somos.test
EOS

cleanup() { kill $(jobs -p) 2>/dev/null || true; }
trap cleanup EXIT

node "$RAIZ/testes-e2e/pagarme-servidor.mjs" > "$LOGS/pagarme.log" 2>&1 &
(cd "$RAIZ" && env -u JAVA_TOOL_OPTIONS firebase emulators:start --project demo-somos --only auth,firestore,functions,storage > "$LOGS/emuladores.log" 2>&1) &

echo "Aguardando emuladores..."
for i in $(seq 1 120); do
  grep -q "All emulators ready" "$LOGS/emuladores.log" 2>/dev/null && break
  sleep 1
done
grep -q "All emulators ready" "$LOGS/emuladores.log" || { echo "Emuladores não subiram. Veja $LOGS/emuladores.log"; exit 1; }

node "$RAIZ/testes-e2e/semear.mjs"
echo
echo "Abra: http://127.0.0.1:5173/brasil   (painel: /brasil/admin · plataforma: /plataforma · emuladores: http://127.0.0.1:4000)"
npm --prefix "$RAIZ/web" run dev:local
