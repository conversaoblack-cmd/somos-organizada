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
// APIs que não existem no iPhone com iOS 15, no Chrome/Samsung Internet antigos (Android barato) ou que mudam
// de comportamento: quebram só no aparelho da pessoa. Use a alternativa indicada.
const PROIBIDAS = [
  [/AbortSignal\.timeout\(/, "AbortSignal.timeout (iOS 15): use prazo() de lib/servicos"],
  [/\bstructuredClone\(/, "structuredClone (iOS 15.3-): copie com spread/JSON"],
  [/\brequestIdleCallback\(/, "requestIdleCallback (não existe no Safari): use setTimeout"],
  [/\.(findLast|findLastIndex|toSorted|toReversed|toSpliced)\(/, "array.findLast/toSorted (iOS 15): use slice().sort()/reverse()"],
  [/\bObject\.hasOwn\(/, "Object.hasOwn (iOS 15.3-): use Object.prototype.hasOwnProperty.call"],
  [/\bcrypto\.randomUUID\(/, "crypto.randomUUID (iOS 15.3-): use crypto.getRandomValues"],
  [/\.at\(-?\d/, "array.at() (iOS 15.3-): use [i] / [arr.length - 1]"],
];
for (const f of arquivos) {
  readFileSync(f, "utf8").split("\n").forEach((linha, i) => {
    if (/^\s*(\/\/|\*)/.test(linha)) return;
    for (const [re, motivo] of PROIBIDAS) if (re.test(linha) && !linha.includes("compatibilidade-ok")) ruins.push(`${f.replace(raiz, "src")}:${i + 1}  ${motivo}`);
  });
}

if (ruins.length) {
  console.error("Código que quebra só no aparelho da pessoa:\n" + ruins.join("\n"));
  process.exit(1);
}
console.log(`checar-efeitos: ok (${arquivos.length} arquivos: efeitos e compatibilidade com iOS 15 / Android antigo)`);
