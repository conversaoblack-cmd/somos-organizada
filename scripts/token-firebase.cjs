// Gera um token de acesso curto a partir do login do Firebase CLI (o mesmo do `firebase deploy`),
// para o implantar/verificar falarem com APIs do Google sem precisar do gcloud.
// Escreve o token SÓ na saída padrão (o script guarda numa variável; nunca é impresso nem registrado).
// Sai com código 1, sem mensagem, se não conseguir.
const { execSync } = require("child_process");
const path = require("path");
(async () => {
  try {
    const raiz = execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const auth = require(path.join(raiz, "firebase-tools", "lib", "auth.js"));
    const conta = auth.getProjectDefaultAccount(process.cwd()) || auth.getGlobalDefaultAccount();
    const refresh = conta && conta.tokens && conta.tokens.refresh_token;
    if (!refresh) process.exit(1);
    const t = await auth.getAccessToken(refresh, ["https://www.googleapis.com/auth/cloud-platform"]);
    if (!t || !t.access_token) process.exit(1);
    process.stdout.write(t.access_token);
  } catch {
    process.exit(1);
  }
})();
