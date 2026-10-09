#!/usr/bin/env bash
# Suíte de navegador: os fluxos críticos pela tela (Playwright + Chromium) contra os emuladores e a Pagar.me
# simulada. Nada aqui toca o projeto real. Guia: testes-e2e/navegador/README.md
#
#   bash testes-e2e/navegador.sh
#
# Variáveis (todas opcionais):
#   NAVEGADOR_ALVO=build   padrão: build de produção (minificado, com service worker) servido pelo vite preview (:4173)
#   NAVEGADOR_ALVO=dev     servidor do Vite (:5173), com os avisos do React em modo de desenvolvimento
#   NAVEGADOR_MODOS=normal,chrome-novo   NAVEGADOR_LARGURAS=360,1280   NAVEGADOR_FLUXOS=1,2,3,4,7a,5,6,7b,8
#   EXIGIR_SEM_INTERNET=1  o fluxo 7 (sem internet) deixa de ser pendente e passa a reprovar a suíte
#   NAVEGADOR_SAIDA=/tmp/somos-navegador   resumo, telas e diários das falhas
#   CHROMIUM_PATH=...      outro executável do Chromium
#
# Se o ambiente local (testes-e2e/dev-local.sh) já estiver de pé, usa ele e não derruba.
# Se não estiver, sobe, roda tudo e derruba no fim. Sai com código diferente de 0 se algum fluxo falhar.
set -uo pipefail
set -m # cada processo em segundo plano no seu grupo: dá para encerrar o grupo inteiro no fim

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
export NAVEGADOR_SAIDA="${NAVEGADOR_SAIDA:-/tmp/somos-navegador}"
LOGS="$NAVEGADOR_SAIDA/ambiente"
ALVO="${NAVEGADOR_ALVO:-build}"
PORTAS="5173 4173 4010 9099 8080 5001 9199 4000 4400 4500 9299 9499 8085"
mkdir -p "$LOGS"
INICIO=$(date +%s)

responde() { curl -s -o /dev/null --max-time 3 "$1"; } # qualquer resposta HTTP serve
semeado() {
  curl -sf -o /dev/null --max-time 3 -H "Authorization: Bearer owner" \
    "http://127.0.0.1:8080/v1/projects/demo-somos/databases/(default)/documents/slugs/brasil"
}
emuladores_no_ar() {
  responde http://127.0.0.1:9099/ && responde http://127.0.0.1:8080/ && responde http://127.0.0.1:5001/ &&
    responde http://127.0.0.1:4010/ && semeado
}
liberar_porta() {
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "$1/tcp" >/dev/null 2>&1 || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$1" | xargs kill 2>/dev/null || true
  fi
}

SUBIU=0
PID_AMBIENTE=""
PID_PREVIEW=""
derrubar() {
  if [ -n "$PID_PREVIEW" ]; then
    kill -TERM -- "-$PID_PREVIEW" 2>/dev/null || true
    liberar_porta 4173
  fi
  if [ "$SUBIU" = 1 ]; then
    echo "Derrubando o ambiente que esta execução subiu..."
    [ -n "$PID_AMBIENTE" ] && kill -TERM -- "-$PID_AMBIENTE" 2>/dev/null || true
    sleep 3
    for p in $PORTAS; do liberar_porta "$p"; done
  fi
  echo "Tempo total: $(($(date +%s) - INICIO)) s"
}
trap derrubar EXIT
trap 'exit 130' INT TERM

# ── Dependências do teste (Playwright e o Chromium dele) ──
if [ ! -d "$RAIZ/testes-e2e/node_modules/playwright" ]; then
  echo "Instalando as dependências de testes-e2e..."
  npm --prefix "$RAIZ/testes-e2e" install --no-audit --no-fund || exit 1
fi
if ! (cd "$RAIZ/testes-e2e" && node --input-type=module -e \
  "import { chromium } from 'playwright'; import fs from 'node:fs'; process.exit(fs.existsSync(process.env.CHROMIUM_PATH || chromium.executablePath()) ? 0 : 1)"); then
  echo "Baixando o Chromium do Playwright (só na primeira vez)..."
  (cd "$RAIZ/testes-e2e" && npx playwright install chromium) || exit 1
fi

# ── Ambiente: emuladores + Pagar.me simulada + torcida de demonstração (+ Vite no :5173) ──
if emuladores_no_ar && { [ "$ALVO" = build ] || responde http://127.0.0.1:5173/; }; then
  echo "Ambiente local já está de pé: usando o que está rodando (não será derrubado no fim)."
else
  for p in $PORTAS; do
    if responde "http://127.0.0.1:$p/"; then
      echo "A porta $p está ocupada, mas o ambiente não está completo. Libere as portas e rode de novo:"
      echo "  for p in $PORTAS; do fuser -k \$p/tcp; done"
      exit 1
    fi
  done
  echo "Subindo o ambiente local (emuladores, Pagar.me simulada, torcida de demonstração e Vite)... logs em $LOGS"
  LOGS="$LOGS" bash "$RAIZ/testes-e2e/dev-local.sh" >"$LOGS/dev-local.log" 2>&1 &
  PID_AMBIENTE=$!
  SUBIU=1
  for _ in $(seq 1 240); do
    emuladores_no_ar && responde http://127.0.0.1:5173/ && break
    if ! kill -0 "$PID_AMBIENTE" 2>/dev/null; then
      echo "O ambiente não subiu. Últimas linhas de $LOGS/dev-local.log:"
      tail -30 "$LOGS/dev-local.log"
      exit 1
    fi
    sleep 1
  done
  emuladores_no_ar && responde http://127.0.0.1:5173/ || { echo "Tempo esgotado esperando o ambiente. Veja $LOGS"; exit 1; }
fi

# ── Site testado ──
if [ "$ALVO" = build ]; then
  if responde http://127.0.0.1:4173/; then
    echo "A porta 4173 já está ocupada (um vite preview antigo?). Libere com: fuser -k 4173/tcp"
    exit 1
  fi
  SITE="$NAVEGADOR_SAIDA/site"
  echo "Gerando o build de produção apontado para os emuladores (vite build --mode emulador)..."
  (cd "$RAIZ/web" && npx vite build --mode emulador --outDir "$SITE" --emptyOutDir) >"$LOGS/build.log" 2>&1 || {
    echo "O build falhou:"
    tail -30 "$LOGS/build.log"
    exit 1
  }
  (cd "$RAIZ/web" && exec npx vite preview --mode emulador --outDir "$SITE" --host 127.0.0.1 --port 4173 --strictPort) >"$LOGS/preview.log" 2>&1 &
  PID_PREVIEW=$!
  for _ in $(seq 1 30); do responde http://127.0.0.1:4173/ && break; sleep 1; done
  responde http://127.0.0.1:4173/ || { echo "vite preview não respondeu. Veja $LOGS/preview.log"; exit 1; }
  export NAVEGADOR_URL="http://127.0.0.1:4173"
elif [ "$ALVO" = dev ]; then
  export NAVEGADOR_URL="http://127.0.0.1:5173"
else
  echo "NAVEGADOR_ALVO deve ser build ou dev (veio: $ALVO)"
  exit 1
fi

echo "Rodando a suíte de navegador contra $NAVEGADOR_URL ($ALVO)..."
(cd "$RAIZ/testes-e2e" && node --test --test-reporter=spec --test-concurrency=1 navegador/suite.test.mjs)
CODIGO=$?
echo
[ "$CODIGO" = 0 ] && echo "Suíte de navegador: tudo certo." || echo "Suíte de navegador: FALHOU (código $CODIGO). Resumo: $NAVEGADOR_SAIDA/resumo.md"
exit "$CODIGO"
