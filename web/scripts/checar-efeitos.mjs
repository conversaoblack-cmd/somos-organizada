// Recusa efeito com corpo de expressão: `useEffect(() => algo(), [...])` devolve o valor de algo() ao React,
// que o chama como "limpeza" na próxima troca. Se não for função (Promise, número, texto), a tela cai com
// "destroy is not a function" ("q is not a function" no site publicado). Aconteceu no cadastro: no Chrome novo
// scrollIntoView passou a devolver uma Promise. Use sempre chaves: useEffect(() => { algo(); }, [...]).
// Única exceção: devolver direto a função de cancelar a inscrição (ex.: onAuthStateChanged), marcada com
// o comentário "efeito-devolve-cancelamento" na mesma linha.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const raiz = new URL("../src", import.meta.url).pathname;
const arquivos = [];
(function andar(d) {
  for (const n of readdirSync(d)) {
    const c = join(d, n);
    if (statSync(c).isDirectory()) andar(c);
    else if (/\.(tsx?|jsx?)$/.test(n)) arquivos.push(c);
  }
})(raiz);
const ruins = [];
for (const f of arquivos) {
  readFileSync(f, "utf8").split("\n").forEach((linha, i) => {
    if (/\buse(Layout|Insertion)?Effect\(\s*(async\s*)?\(\)\s*=>\s*(?![\s{])/.test(linha) && !linha.includes("efeito-devolve-cancelamento")) {
      ruins.push(`${f.replace(raiz, "src")}:${i + 1}  ${linha.trim()}`);
    }
    if (/\buse(Layout|Insertion)?Effect\(\s*async\b/.test(linha)) ruins.push(`${f.replace(raiz, "src")}:${i + 1}  efeito async  ${linha.trim()}`);
  });
}
if (ruins.length) {
  console.error("Efeitos que devolvem valor ao React (use chaves { }):\n" + ruins.join("\n"));
  process.exit(1);
}
console.log(`checar-efeitos: ok (${arquivos.length} arquivos)`);
