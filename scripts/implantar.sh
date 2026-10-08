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
EMAILS_PLATAFORMA="${PLATAFORMA_EMAILS:-conversaoblack@gmail.com,guisodrep@gmail.com}"
# Domínio próprio já ligado no Firebase Hosting. Vazio (DOMINIO= bash ...) = usar o endereço .web.app
DOMINIO="${DOMINIO-somosorganizada.com.br}"
if [ -n "$DOMINIO" ]; then URL_SITE="https://$DOMINIO"; else URL_SITE="https://$PROJETO.web.app"; fi

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

passo "E-mails automáticos (Brevo ou Resend)"
# A chave é digitada aqui no terminal (não aparece na tela), vai direto para o Secret Manager e o arquivo
# temporário é apagado. Nunca cole essa chave em chat. Para trocar depois: TROCAR_EMAIL=1 bash scripts/implantar.sh
if firebase functions:secrets:access EMAIL_API_KEY --project "$PROJETO" >/dev/null 2>&1 && [ "${TROCAR_EMAIL:-0}" != "1" ]; then
  echo "EMAIL_API_KEY já existe no Secret Manager. Mantida."
else
  CHAVE_EMAIL=""
  if [ -t 0 ]; then
    echo "Cole a chave de API do Brevo (começa com xkeysib-) ou do Resend (começa com re_)."
    echo "Ainda não tem? Só aperte Enter: o sistema funciona e os e-mails ficam desligados até você cadastrar."
    read -r -s -p "Chave: " CHAVE_EMAIL; echo
  fi
  case "$CHAVE_EMAIL" in
    xkeysib-*|re_*) echo "Chave reconhecida." ;;
    "") CHAVE_EMAIL="desativado"; aviso "E-mails desligados por enquanto." ;;
    *) aviso "Formato não reconhecido: os e-mails ficam desligados."; CHAVE_EMAIL="desativado" ;;
  esac
  TMP_EMAIL="$(mktemp)"; chmod 600 "$TMP_EMAIL"; printf '%s' "$CHAVE_EMAIL" > "$TMP_EMAIL"
  firebase functions:secrets:set EMAIL_API_KEY --data-file "$TMP_EMAIL" --project "$PROJETO" >/dev/null
  rm -f "$TMP_EMAIL"; unset CHAVE_EMAIL
  echo "EMAIL_API_KEY gravada no Secret Manager."
fi

passo "Parâmetros das functions"
# Cria ou atualiza functions/.env: endereço do site (links de e-mail, convites e webhook) e e-mails da equipe.
# Preserva o resto (WEB_API_KEY, MAX_INSTANCIAS, EMAIL_REMETENTE...).
touch functions/.env
node -e '
  const fs = require("fs");
  const [url, emails] = process.argv.slice(1);
  const linhas = fs.readFileSync("functions/.env", "utf8").split("\n").filter(Boolean);
  const valor = (k) => (linhas.find((l) => l.startsWith(k + "=")) || "").slice(k.length + 1);
  const equipe = [...new Set([...valor("PLATAFORMA_EMAILS").split(","), ...emails.split(",")].map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const resto = linhas.filter((l) => !/^(URL_APP|PLATAFORMA_EMAILS)=/.test(l));
  fs.writeFileSync("functions/.env", [`URL_APP=${url}`, `PLATAFORMA_EMAILS=${equipe.join(",")}`, ...resto].join("\n") + "\n");
' "$URL_SITE" "$EMAILS_PLATAFORMA"
echo "functions/.env: URL_APP=$URL_SITE"
grep '^PLATAFORMA_EMAILS=' functions/.env

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
# Projeto novo: o Google limita CPU por região. Enquanto uma function é atualizada, a versão velha e a nova
# coexistem por alguns instantes, então uma falha de cota pode ser passageira: tenta o deploy completo de novo
# (completo, para não deixar site, regras ou índices para trás).
LOG_DEPLOY="$(mktemp)"
if ! firebase deploy --project "$PROJETO" 2>&1 | tee "$LOG_DEPLOY"; then
  aviso "Parte do deploy falhou. Tentando o deploy completo de novo em 90s..."
  sleep 90
  if ! firebase deploy --project "$PROJETO" 2>&1 | tee "$LOG_DEPLOY"; then
    if grep -q "Quota exceeded for total allowable CPU" "$LOG_DEPLOY"; then
      rm -f "$LOG_DEPLOY"
      falha "Cota de CPU do Google esgotada nesta região. Escolha um caminho e rode o script de novo:
  a) diminuir o fôlego: em functions/.env coloque MAX_INSTANCIAS=1 e MAX_INSTANCIAS_PUBLICAS=3;
  b) pedir aumento: console.cloud.google.com/iam-admin/quotas → 'Total CPU allocation' em southamerica-east1."
    fi
    rm -f "$LOG_DEPLOY"
    falha "O deploy falhou duas vezes. Veja a mensagem acima (ou mande um print) e rode o script de novo."
  fi
fi
rm -f "$LOG_DEPLOY"

passo "Domínio autorizado no login (Firebase Authentication)"
# Sem isso, login, convite e "esqueci minha senha" falham no domínio próprio. Feito sozinho se o gcloud estiver
# instalado e logado; senão, é um clique no console.
AUTH_OK=0
if [ -n "$DOMINIO" ] && command -v gcloud >/dev/null 2>&1 && TOKEN="$(gcloud auth print-access-token 2>/dev/null)"; then
  API="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJETO/config"
  CFG="$(curl -fsS -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJETO" "$API" 2>/dev/null || true)"
  if [ -n "$CFG" ]; then
    CORPO="$(node -e '
      const cfg = JSON.parse(process.argv[1]); const d = process.argv[2];
      const atuais = cfg.authorizedDomains || [];
      const novos = [...new Set([...atuais, d, "www." + d])];
      if (novos.length !== atuais.length) process.stdout.write(JSON.stringify({ authorizedDomains: novos }));
    ' "$CFG" "$DOMINIO" 2>/dev/null || echo ERRO)"
    if [ "$CORPO" = "ERRO" ]; then
      :
    elif [ -z "$CORPO" ]; then
      echo "$DOMINIO já está autorizado."; AUTH_OK=1
    elif curl -fsS -X PATCH -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJETO" -H "Content-Type: application/json" \
      "$API?updateMask=authorizedDomains" -d "$CORPO" >/dev/null 2>&1; then
      echo "$DOMINIO e www.$DOMINIO autorizados."; AUTH_OK=1
    fi
  fi
fi
unset TOKEN
if [ -n "$DOMINIO" ] && [ "$AUTH_OK" != "1" ]; then
  aviso "Confira no console: Authentication → Configurações → Domínios autorizados → adicione $DOMINIO e www.$DOMINIO"
  echo "   https://console.firebase.google.com/project/$PROJETO/authentication/settings"
fi

passo "Pronto!"
cat <<FIM
Site:        $URL_SITE
Plataforma:  $URL_SITE/plataforma   (equipe: $(grep '^PLATAFORMA_EMAILS=' functions/.env | cut -d= -f2))
Chaves:      $COFRE   ← guarde também num cofre de senhas

Próximos passos:
  1. Abra /plataforma, crie a conta com o e-mail acima, confirme o e-mail e clique em "Ativar acesso da equipe".
  2. Crie a primeira torcida e mande o link de senha para o diretor.
  3. Domínio próprio: confira se $DOMINIO está em Authentication → Configurações → Domínios autorizados.
FIM
