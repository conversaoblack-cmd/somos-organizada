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
# E-mails da equipe da plataforma: usados só quando functions/.env ainda não tem a lista, ou quando você passa
# PLATAFORMA_EMAILS=... explicitamente (aí eles são somados aos que já estão lá; para tirar alguém, edite o .env).
EMAILS_EXPLICITOS="${PLATAFORMA_EMAILS:-}"
EMAILS_PADRAO="conversaoblack@gmail.com,guisodrep@gmail.com"
# Domínio próprio já ligado no Firebase Hosting. Só o projeto principal usa somosorganizada.com.br por padrão;
# outro projeto (teste) fica no .web.app, a menos que DOMINIO=... seja informado.
if [ "$PROJETO" = "somos-organizada" ]; then DOMINIO="${DOMINIO-somosorganizada.com.br}"; else DOMINIO="${DOMINIO:-}"; fi
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
# Cria ou atualiza functions/.env, preservando o resto (WEB_API_KEY, MAX_INSTANCIAS, EMAIL_REMETENTE...):
# - URL_APP (links de e-mail, convites e webhook): o domínio quando houver; senão só cria se faltar;
# - PLATAFORMA_EMAILS: padrão só se faltar; PLATAFORMA_EMAILS=... na linha de comando soma à lista.
touch functions/.env
node -e '
  const fs = require("fs");
  const [url, temDominio, explicitos, padrao] = process.argv.slice(1);
  const linhas = fs.readFileSync("functions/.env", "utf8").split("\n").filter(Boolean);
  const valor = (k) => { const l = linhas.find((x) => x.startsWith(k + "=")); return l === undefined ? null : l.slice(k.length + 1); };
  const urlFinal = temDominio === "1" || valor("URL_APP") === null ? url : valor("URL_APP");
  const atuais = valor("PLATAFORMA_EMAILS");
  const base = atuais === null ? padrao : atuais;
  const equipe = [...new Set([...base.split(","), ...explicitos.split(",")].map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const resto = linhas.filter((l) => !/^(URL_APP|PLATAFORMA_EMAILS)=/.test(l));
  fs.writeFileSync("functions/.env", [`URL_APP=${urlFinal}`, `PLATAFORMA_EMAILS=${equipe.join(",")}`, ...resto].join("\n") + "\n");
' "$URL_SITE" "$([ -n "$DOMINIO" ] && echo 1 || echo 0)" "$EMAILS_EXPLICITOS" "$EMAILS_PADRAO"
grep '^URL_APP=' functions/.env
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

passo "Deploy do site, regras e índices"
echo "Se o Firebase perguntar se pode dar ao Storage acesso de leitura ao Firestore, responda Y."
if ! firebase deploy --except functions --project "$PROJETO"; then
  aviso "Falhou; tentando de novo em 30s..."
  sleep 30
  firebase deploy --except functions --project "$PROJETO" || falha "O deploy do site/regras falhou duas vezes. Mande um print do erro acima."
fi

passo "Deploy das functions em lotes"
# Projeto novo tem cota baixa de CPU por região, e cada function sobe um servidor de verificação enquanto é
# atualizada. Mandar as 39 de uma vez estoura a cota; em lotes pequenos, uma leva termina antes da próxima.
npm --prefix functions run build >/dev/null
# Ordem: primeiro as de painel/rotina (menos instâncias, liberam cota ao atualizar), por último as do torcedor
read -r -a FUNCOES <<< "$(node -e "
  const m = require('./functions/lib/index.js');
  const publica = (n) => String(m[n] && m[n].__endpoint && m[n].__endpoint.maxInstances).includes('PUBLICAS');
  const nomes = Object.keys(m);
  process.stdout.write([...nomes.filter((n) => !publica(n)), ...nomes.filter(publica)].join(' '));
")"
LOTE="${LOTE_FUNCOES:-3}"
FALHAS=""
TOTAL_LOTES=$(( (${#FUNCOES[@]} + LOTE - 1) / LOTE ))
for ((i = 0; i < ${#FUNCOES[@]}; i += LOTE)); do
  GRUPO=("${FUNCOES[@]:i:LOTE}")
  ALVO="$(printf 'functions:%s,' "${GRUPO[@]}")"; ALVO="${ALVO%,}"
  echo; echo "Lote $(( i / LOTE + 1 ))/$TOTAL_LOTES: ${GRUPO[*]}"
  OK=0
  for TENTATIVA in 1 2 3; do
    if firebase deploy --only "$ALVO" --project "$PROJETO"; then OK=1; break; fi
    [ "$TENTATIVA" = 3 ] || { aviso "Lote falhou (tentativa $TENTATIVA/3). Esperando 60s para o Google liberar a CPU..."; sleep 60; }
  done
  [ "$OK" = 1 ] || FALHAS="$FALHAS ${GRUPO[*]}"
done
if [ -n "$FALHAS" ]; then
  falha "Não subiram:$FALHAS
Rode o script de novo (ele refaz tudo e as que já subiram passam rápido). Se repetir:
  a) lotes menores: LOTE_FUNCOES=3 bash scripts/implantar.sh
  b) menos fôlego: em functions/.env coloque MAX_INSTANCIAS=1 e MAX_INSTANCIAS_PUBLICAS=3
  c) aumento de cota: console.cloud.google.com/iam-admin/quotas → 'Total CPU allocation' em southamerica-east1"
fi
echo "Todas as ${#FUNCOES[@]} functions no ar."

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
