#!/usr/bin/env bash
# Somos Organizada: retrato do estado atual, SÓ LEITURA. Não implanta, não grava, não troca nada.
# Rode antes de qualquer implantação, em qualquer computador:   bash scripts/verificar.sh
#
# Confere:
#   1. Git: branch, alterações locais que não estão no GitHub, se está atrás ou à frente do GitHub
#   2. Firebase: conta em uso nesta pasta e se as chaves existem no Secret Manager (só metadados, nunca o valor)
#   3. Functions: cada uma das esperadas pelo código responde em produção?
#   4. Domínios autorizados no login (sem eles, e-mail de confirmação e de senha falham)
#   5. Site e painel da plataforma no ar
# Sai com código 1 se algo precisar de atenção.
set -uo pipefail

PROJETO="${1:-somos-organizada}"
REGIAO="southamerica-east1"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

ok() { printf '  \033[1;32m✔\033[0m %s\n' "$*"; }
ruim() { printf '  \033[1;31m✖\033[0m %s\n' "$*"; PROBLEMAS=$((PROBLEMAS + 1)); }
atencao() { printf '  \033[1;33m⚠\033[0m %s\n' "$*"; }
titulo() { printf '\n\033[1m%s\033[0m\n' "$*"; }
PROBLEMAS=0

titulo "1. Código (Git)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
echo "  branch: $BRANCH · commit: $(git log --oneline -1 2>/dev/null)"
if git fetch -q origin "$BRANCH" 2>/dev/null; then
  ATRAS="$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)"
  FRENTE="$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)"
  [ "$ATRAS" = 0 ] && ok "em dia com o GitHub" || ruim "$ATRAS commit(s) no GitHub que esta pasta ainda não tem (rode: git pull)"
  [ "$FRENTE" = 0 ] || ruim "$FRENTE commit(s) nesta pasta que não estão no GitHub (rode: git push)"
else
  ruim "não consegui falar com o GitHub (internet ou login do Git)"
fi
LOCAIS="$(git status --porcelain 2>/dev/null)"
if [ -z "$LOCAIS" ]; then ok "sem alterações locais fora do GitHub"; else ruim "alterações locais que não estão no GitHub:"; echo "$LOCAIS" | sed 's/^/      /'; fi

titulo "2. Firebase (projeto $PROJETO)"
if command -v firebase >/dev/null 2>&1; then
  CONTA="$(firebase login:list 2>/dev/null | grep -o '[[:alnum:]._%+-]*@[[:alnum:].-]*' | head -1)"
  echo "  conta em uso nesta pasta: ${CONTA:-desconhecida}"
  for S in MASTER_KEY QR_HMAC EMAIL_API_KEY; do
    if firebase functions:secrets:get "$S" --project "$PROJETO" >/dev/null 2>&1; then ok "$S existe no Secret Manager"; else ruim "$S não confirmada (conta sem acesso ao projeto? NÃO crie chave nova: veja docs/IMPLANTACAO.md)"; fi
  done
else
  ruim "Firebase CLI não instalado (npm i -g firebase-tools)"
fi

titulo "3. Functions em produção"
npm --prefix functions run build >/dev/null 2>&1 || true  # sempre do código atual (lib antiga enganaria a lista)
if [ -f functions/lib/index.js ]; then
  node -e '
    const [projeto, regiao] = process.argv.slice(1);
    const m = require("./functions/lib/index.js");
    const tipo = (f) => { const e = (f && f.__endpoint) || {}; return e.scheduleTrigger ? "agendada" : e.callableTrigger ? "callable" : e.httpsTrigger ? "http" : "outra"; };
    (async () => {
      const ruins = [], agendadas = [];
      let boas = 0;
      for (const [nome, f] of Object.entries(m)) {
        if (tipo(f) === "agendada") { agendadas.push(nome); continue; }
        let st = 0, corpo = "";
        for (let t = 0; t < 2; t++) {
          try {
            const r = await fetch(`https://${regiao}-${projeto}.cloudfunctions.net/${nome}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{\"data\":{}}", signal: AbortSignal.timeout(20000) });
            st = r.status;
            corpo = await r.text();
          } catch { st = 0; }
          if (st !== 429 && st < 500 && st !== 0) break;
          await new Promise((ok) => setTimeout(ok, 1500));
        }
        // O nosso código respondeu (recusando o pedido vazio, como deve) quando a resposta não é a página HTML
        // de erro do Google. 403/404 em HTML = sem permissão pública ou inexistente; 429/5xx = sem servidor.
        const doGoogle = /^\s*<html/i.test(corpo);
        if (st > 0 && st < 500 && st !== 429 && !doGoogle) boas++;
        else ruins.push(`${nome} (${st === 403 ? "403: sem permissão pública, deploy incompleto" : st === 404 ? "404: não existe" : st === 429 || st >= 500 ? `${st}: não consegue subir servidor, deploy incompleto` : st || "sem resposta"})`);
        await new Promise((ok) => setTimeout(ok, 250));
      }
      console.log(`  \x1b[1;32m✔\x1b[0m ${boas} respondendo normalmente`);
      for (const r of ruins) console.log(`  \x1b[1;31m✖\x1b[0m ${r}`);
      console.log(`  (agendadas, conferidas pela lista abaixo: ${agendadas.join(", ")})`);
      process.exitCode = ruins.length ? 1 : 0;
    })();
  ' "$PROJETO" "$REGIAO" || PROBLEMAS=$((PROBLEMAS + 1))
  if command -v firebase >/dev/null 2>&1; then
    LISTA="$(firebase functions:list --project "$PROJETO" 2>/dev/null || true)"
    for A in rotinaSaas expirarPedidos rotinaSocios; do
      echo "$LISTA" | grep -q "$A" && ok "$A publicada" || ruim "$A não aparece na lista de functions"
    done
  fi
else
  ruim "não consegui compilar functions/ para saber a lista esperada (rode: npm --prefix functions install)"
fi

titulo "4. Login no domínio (Authentication → domínios autorizados)"
TOKEN="$(node scripts/token-firebase.cjs 2>/dev/null || true)"
if [ -n "$TOKEN" ]; then
  DOMS="$(curl -fsS -m 20 -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJETO" "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJETO/config" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log((JSON.parse(s).authorizedDomains||[]).join(" "))}catch{}})')"
  for D in somosorganizada.com.br plataforma.somosorganizada.com.br; do
    case " $DOMS " in *" $D "*) ok "$D autorizado no login" ;; *) ruim "$D NÃO autorizado no login: e-mail de confirmação e de senha falham (rode bash scripts/implantar.sh)" ;; esac
  done
else
  atencao "não consegui conferir os domínios do login (faça firebase login com a conta do projeto)"
fi
unset TOKEN

titulo "5. Site"
for U in "https://somosorganizada.com.br/" "https://plataforma.somosorganizada.com.br/"; do
  if curl -fsS -m 20 "$U" 2>/dev/null | grep -Eq "<title>[^<]*Somos Organizada"; then ok "$U no ar"; else atencao "$U não respondeu com o site"; fi
done

echo
if [ "$PROBLEMAS" = 0 ]; then
  printf '\033[1;32mTudo certo.\033[0m\n'
else
  printf '\033[1;31m%s ponto(s) pedem atenção (acima).\033[0m Functions com 403/429 se resolvem rodando bash scripts/implantar.sh.\n' "$PROBLEMAS"
  exit 1
fi
