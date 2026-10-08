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

passo "Atualizando o código (GitHub é a fonte da verdade)"
# Mac e Windows trabalham no mesmo projeto: só implanta o que está no GitHub, nunca uma cópia local diferente.
[ -z "$(git status --porcelain)" ] || { git status --short; falha "Há alterações nesta pasta que não estão no GitHub (acima). Envie (git add/commit/push) ou descarte antes de implantar."; }
# Bloco único (o bash lê inteiro antes de executar): se o pull trouxer uma versão nova deste script,
# reinicia com ela em vez de continuar lendo um arquivo que mudou no meio do caminho.
{
  ANTES="$(git hash-object scripts/implantar.sh)"
  git pull --ff-only || falha "Não consegui atualizar com o GitHub (sem internet, sem login do Git ou histórico divergente). Nada foi implantado."
  if [ "$ANTES" != "$(git hash-object scripts/implantar.sh)" ]; then
    echo "O script de implantação foi atualizado pelo GitHub; reiniciando com a versão nova..."
    exec bash scripts/implantar.sh "$@"
  fi
}
[ "$(git rev-list --count "@{u}..HEAD" 2>/dev/null || echo 0)" = 0 ] || falha "Esta pasta tem commits que não estão no GitHub. Rode git push antes de implantar."
echo "Código em dia com o GitHub: $(git log --oneline -1)"

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
# REGRA DE OURO: num projeto que já existe, este script NUNCA cria nem troca a MASTER_KEY/QR_HMAC.
# Trocar a MASTER_KEY deixaria ilegíveis as chaves Pagar.me das torcidas; trocar a QR_HMAC invalidaria
# todos os ingressos e carteirinhas. A existência é conferida pelos METADADOS do segredo (secrets:get), que
# qualquer conta com acesso ao projeto enxerga, e não pelo valor (que contas "Editor" não podem ler).
# Chave nova só com pedido explícito (CRIAR_CHAVES=1) e confirmação digitada, para projeto novo.
mkdir -p "$COFRE"
chmod 700 "$COFRE"
for SEGREDO in MASTER_KEY QR_HMAC; do
  ARQ="$COFRE/$SEGREDO"
  if firebase functions:secrets:get "$SEGREDO" --project "$PROJETO" >/dev/null 2>&1; then
    echo "$SEGREDO já existe no Secret Manager. Mantida sem alteração."
    [ -f "$ARQ" ] || aviso "Não há cópia local de $SEGREDO nesta máquina (ela foi criada em outro computador). Tudo bem: a chave de verdade fica no Google."
  elif [ "${RESTAURAR_CHAVES:-0}" = "1" ] && [ -f "$ARQ" ]; then
    firebase functions:secrets:set "$SEGREDO" --data-file "$ARQ" --project "$PROJETO" >/dev/null
    echo "$SEGREDO restaurada no Secret Manager a partir da cópia local."
  elif [ "${CRIAR_CHAVES:-0}" = "1" ]; then
    echo "Vai CRIAR uma $SEGREDO nova no projeto '$PROJETO'. Só faça isso em projeto novo, sem torcidas."
    read -r -p "Para confirmar, digite o nome do projeto: " CONFIRMA
    [ "$CONFIRMA" = "$PROJETO" ] || falha "Confirmação diferente do nome do projeto. Nada foi criado."
    [ -f "$ARQ" ] || { node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$ARQ"; chmod 600 "$ARQ"; }
    firebase functions:secrets:set "$SEGREDO" --data-file "$ARQ" --project "$PROJETO" >/dev/null
    echo "$SEGREDO criada e gravada no Secret Manager."
  else
    falha "Não consegui confirmar a $SEGREDO no Secret Manager do projeto '$PROJETO'. Nada foi alterado.
Quase sempre é login: rode 'firebase login:list' e confira se é a conta dona do projeto (troque com 'firebase logout' e 'firebase login').
NUNCA crie chave nova num projeto que já tem torcidas. Só em projeto novo: CRIAR_CHAVES=1 bash scripts/implantar.sh"
  fi
done
echo "Cópia de segurança local: $COFRE (somente seu usuário consegue ler)"

passo "E-mails automáticos (Brevo ou Resend)"
# A chave é digitada aqui no terminal (não aparece na tela), vai direto para o Secret Manager e o arquivo
# temporário é apagado. Nunca cole essa chave em chat. Para trocar depois: TROCAR_EMAIL=1 bash scripts/implantar.sh
if firebase functions:secrets:get EMAIL_API_KEY --project "$PROJETO" >/dev/null 2>&1 && [ "${TROCAR_EMAIL:-0}" != "1" ]; then
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
  // Parâmetros com valor padrão no código (functions/src/config.ts): o Firebase CLI só usa o padrão se alguém
  // responder à pergunta; em modo não interativo (Claude local, CI) ele trava. Grava os padrões quando faltam,
  // sem mexer em valor que já esteja no .env (ex.: MAX_INSTANCIAS ajustado para a cota do projeto).
  const PADROES = {
    EMAIL_REMETENTE: "\"Somos Organizada <nao-responda@somosorganizada.com.br>\"",
    MAX_INSTANCIAS: "1",
    MAX_INSTANCIAS_PUBLICAS: "3",
    MAX_INSTANCIAS_API: "10",
  };
  const faltando = Object.entries(PADROES).filter(([k]) => valor(k) === null).map(([k, v]) => `${k}=${v}`);
  const resto = linhas.filter((l) => !/^(URL_APP|PLATAFORMA_EMAILS)=/.test(l));
  fs.writeFileSync("functions/.env", [`URL_APP=${urlFinal}`, `PLATAFORMA_EMAILS=${equipe.join(",")}`, ...resto, ...faltando].join("\n") + "\n");
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
# Painel da equipe em subdomínio próprio (sessão separada das páginas das torcidas). Só liga quando
# plataforma.<domínio> já responde com o site; senão o painel continua em <domínio>/plataforma.
HOST_PLATAFORMA=""
if [ -n "$DOMINIO" ]; then
  # Já ligado num deploy anterior? Mantém (uma falha de rede agora não pode desligar o subdomínio).
  JA_LIGADO="$(grep -s '^VITE_HOST_PLATAFORMA=' web/.env.production.local | cut -d= -f2 || true)"
  NO_AR=0
  for _ in 1 2 3; do
    if curl -fsS -m 20 "https://plataforma.$DOMINIO/" 2>/dev/null | grep -Eq "<title>[^<]*Somos Organizada"; then NO_AR=1; break; fi
    sleep 3
  done
  if [ "$NO_AR" = 1 ] || [ "$JA_LIGADO" = "plataforma.$DOMINIO" ]; then
    HOST_PLATAFORMA="plataforma.$DOMINIO"
    echo "Painel da equipe: https://$HOST_PLATAFORMA (o endereço $URL_SITE/plataforma redireciona para lá)"
    [ "$NO_AR" = 1 ] || aviso "plataforma.$DOMINIO não respondeu agora, mas já estava ligado: mantido."
  else
    aviso "plataforma.$DOMINIO ainda não está no ar: o painel da equipe continua em $URL_SITE/plataforma."
    echo "   Para separar: Firebase Hosting → Adicionar domínio personalizado → plataforma.$DOMINIO, cole os registros no Registro.br e rode este script de novo."
  fi
fi
node -e '
  const c = JSON.parse(process.argv[1]).result.sdkConfig;
  const linhas = [
    `VITE_FIREBASE_API_KEY=${c.apiKey}`,
    `VITE_FIREBASE_AUTH_DOMAIN=${c.authDomain}`,
    `VITE_FIREBASE_PROJECT_ID=${c.projectId}`,
    `VITE_FIREBASE_STORAGE_BUCKET=${c.storageBucket || c.projectId + ".firebasestorage.app"}`,
    `VITE_FIREBASE_APP_ID=${c.appId}`,
    `VITE_VERSAO=${new Date().toISOString().slice(0, 10)}`,
    ...(process.argv[2] ? [`VITE_HOST_PLATAFORMA=${process.argv[2]}`, `VITE_HOST_PRINCIPAL=${process.argv[3]}`] : []),
  ];
  const fs = require("fs");
  fs.writeFileSync("web/.env.production.local", linhas.join("\n") + "\n");
  // Chave pública do app Web (a mesma que vai no site): as functions usam para conferir a senha no login por CPF
  const env = fs.readFileSync("functions/.env", "utf8").split("\n").filter((l) => l && !l.startsWith("WEB_API_KEY="));
  fs.writeFileSync("functions/.env", [...env, `WEB_API_KEY=${c.apiKey}`].join("\n") + "\n");
' "$JSON_CFG" "$HOST_PLATAFORMA" "$DOMINIO"
echo "web/.env.production.local gerado (e WEB_API_KEY em functions/.env)."

passo "Build do front-end"
npm --prefix web run build

passo "Functions antigas"
# Desde a porta única "api" (functions/src/api/central.ts) o projeto tem só 5 functions. As 35 antigas,
# de antes disso, não são mais chamadas pelo site e ocupam a cota de CPU da região: precisam sair.
npm --prefix functions run build >/dev/null
read -r -a FUNCOES <<< "$(node -e "process.stdout.write(Object.keys(require('./functions/lib/index.js')).join(' '))")"
PUBLICADAS="$(firebase functions:list --project "$PROJETO" --json 2>/dev/null | node -e '
  let t = ""; process.stdin.on("data", (d) => (t += d)).on("end", () => {
    try {
      const lista = JSON.parse(t).result || [];
      process.stdout.write(lista.map((f) => f.id || String(f.name || "").split("/").pop()).filter(Boolean).join(" "));
    } catch { process.stdout.write("ERRO"); }
  });')"
if [ "$PUBLICADAS" = "ERRO" ]; then
  aviso "Não consegui listar as functions publicadas; sigo sem remover nenhuma."
else
  ANTIGAS=""
  for F in $PUBLICADAS; do
    case " ${FUNCOES[*]} " in *" $F "*) ;; *) ANTIGAS="$ANTIGAS $F" ;; esac
  done
  if [ -z "$ANTIGAS" ]; then
    echo "Nenhuma function antiga publicada."
  else
    echo "Publicadas mas fora do código atual:$ANTIGAS"
    REMOVER="${REMOVER_ANTIGAS:-0}"
    if [ "$REMOVER" != "1" ] && [ -t 0 ]; then
      read -r -p "Remover essas functions antigas agora? O site não usa mais nenhuma delas (digite sim): " RESP
      [ "$RESP" = "sim" ] && REMOVER=1
    fi
    if [ "$REMOVER" = "1" ]; then
      # shellcheck disable=SC2086
      firebase functions:delete $ANTIGAS --region southamerica-east1 --project "$PROJETO" --force || falha "Não consegui remover as functions antigas. Mande um print do erro acima."
      echo "Functions antigas removidas."
    else
      aviso "Mantidas. Sem removê-las a cota de CPU pode faltar para as novas (para remover sem pergunta: REMOVER_ANTIGAS=1)."
    fi
  fi
fi

passo "Deploy das functions"
LOTE="${LOTE_FUNCOES:-2}"
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
Rode o script de novo. Se repetir: confira se as functions antigas foram removidas (passo anterior) ou peça
aumento de cota: console.cloud.google.com/iam-admin/quotas → 'Total CPU allocation' em southamerica-east1"
fi
echo "Todas as ${#FUNCOES[@]} functions no ar."

passo "Deploy do site, regras e índices"
# Depois das functions: o site novo chama a porta "api", que precisa já estar no ar.
echo "Se o Firebase perguntar se pode dar ao Storage acesso de leitura ao Firestore, responda Y."
if ! firebase deploy --except functions --project "$PROJETO"; then
  aviso "Falhou; tentando de novo em 30s..."
  sleep 30
  firebase deploy --except functions --project "$PROJETO" || falha "O deploy do site/regras falhou duas vezes. Mande um print do erro acima."
fi

passo "Domínio autorizado no login (Firebase Authentication)"
# Sem isso, login, convite e "esqueci minha senha" falham no domínio próprio. Feito sozinho se o gcloud estiver
# instalado e logado; senão, é um clique no console.
AUTH_OK=0
if [ -n "$DOMINIO" ] && command -v gcloud >/dev/null 2>&1 && TOKEN="$(gcloud auth print-access-token 2>/dev/null)"; then
  API="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJETO/config"
  CFG="$(curl -fsS -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJETO" "$API" 2>/dev/null || true)"
  if [ -n "$CFG" ]; then
    CORPO="$(node -e '
      const cfg = JSON.parse(process.argv[1]); const d = process.argv[2]; const p = process.argv[3];
      const atuais = cfg.authorizedDomains || [];
      const novos = [...new Set([...atuais, d, "www." + d, ...(p ? [p] : [])])];
      if (novos.length !== atuais.length) process.stdout.write(JSON.stringify({ authorizedDomains: novos }));
    ' "$CFG" "$DOMINIO" "$HOST_PLATAFORMA" 2>/dev/null || echo ERRO)"
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
  aviso "Confira no console: Authentication → Configurações → Domínios autorizados → adicione $DOMINIO, www.$DOMINIO${HOST_PLATAFORMA:+ e $HOST_PLATAFORMA}"
  echo "   https://console.firebase.google.com/project/$PROJETO/authentication/settings"
fi

passo "Conferência final (o que está de fato respondendo em produção)"
bash scripts/verificar.sh "$PROJETO" || aviso "A conferência apontou algo acima. Functions com 403/429/503 costumam resolver rodando este script de novo daqui a alguns minutos."

passo "Pronto!"
cat <<FIM
Site:        $URL_SITE
Plataforma:  $([ -n "$HOST_PLATAFORMA" ] && echo "https://$HOST_PLATAFORMA" || echo "$URL_SITE/plataforma")   (equipe: $(grep '^PLATAFORMA_EMAILS=' functions/.env | cut -d= -f2))
Chaves:      $COFRE   ← guarde também num cofre de senhas

Próximos passos:
  1. Abra /plataforma, crie a conta com o e-mail acima, confirme o e-mail e clique em "Ativar acesso da equipe".
  2. Crie a primeira torcida e mande o link de senha para o diretor.
  3. Domínio próprio: confira se $DOMINIO está em Authentication → Configurações → Domínios autorizados.
FIM
