/*
 * Service worker do Somos Organizada: o sistema abre sem internet depois da primeira visita (portaria do estádio,
 * sinal ruim, pré-pago sem dados). Este é o MODELO: o plugin "service-worker" do web/vite.config.ts troca
 * __VERSAO__, __ENTRADA__ e __PRECACHE__ no build e grava dist/sw.js. Não edite o sw.js de dist/.
 *
 * - Navegação do sistema (tudo que não é "/"): rede primeiro, até 3 s, sempre conferindo com o servidor (o Hosting
 *   manda as rotas do sistema com max-age=3600; sem conferir, uma implantação nova levaria até 1 h para chegar).
 *   Sem rede, com erro do servidor ou demorando, devolve o app.html guardado DESTA versão, que só aponta para
 *   arquivos guardados junto com ele.
 * - "/" (página inicial estática) e arquivos abertos direto: o navegador busca normalmente, sem passar por aqui.
 *   O service worker não é registrado na página inicial.
 * - /assets/* (nome com hash, o conteúdo nunca muda): cache primeiro; o que vier da rede fica guardado.
 * - Nada de outro endereço (Firebase, Google APIs, Pagar.me, functions) passa por aqui: nenhuma resposta de API,
 *   dado pessoal ou QR fica no cache do service worker. O QR guardado no aparelho fica com a própria tela
 *   (web/src/lib/offline.ts) e é apagado ao sair da conta.
 * - Versão nova: instala em segundo plano, assume na hora (skipWaiting + clients.claim) e avisa as abas abertas;
 *   a aba mostra "Nova versão do site" e só recarrega quando a pessoa toca. O cache da versão anterior fica até a
 *   próxima, para abas ainda abertas com ela continuarem achando os pedaços do sistema.
 */
const VERSAO = "__VERSAO__";
const ENTRADA = "__ENTRADA__";
const PRECACHE = __PRECACHE__;

const PREFIXO = "so-app-";
const CACHE = PREFIXO + VERSAO;
const META = "so-meta";
const ESPERA_REDE_MS = 3000;
const FIXOS = new Set(PRECACHE.filter((url) => !url.startsWith("/assets/")));

const ehHtml = (r) => (r.headers.get("content-type") || "").includes("text/html");

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // O app.html precisa ser desta versão (implantação no meio da instalação = espera o próximo sw.js)
      const html = await fetch("/app.html", { cache: "no-cache" });
      if (!html.ok || !(await html.clone().text()).includes(ENTRADA)) throw new Error("app.html de outra versão");
      await Promise.all(
        PRECACHE.map(async (url) => {
          // Arquivo com hash não muda: aproveita o que a versão anterior já baixou (economiza dados do pré-pago)
          const pronto = url.startsWith("/assets/") ? await caches.match(url, { ignoreVary: true }) : undefined;
          const r = pronto || (await fetch(url, { cache: url.startsWith("/assets/") ? "default" : "no-cache" }));
          // O Hosting responde o app.html (200) para arquivo que não existe: isso não é o arquivo pedido
          if (!r.ok || ehHtml(r)) throw new Error("Arquivo faltando: " + url);
          await cache.put(url, r);
        }),
      );
      await cache.put("/app.html", html);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      // Mantém esta versão e a anterior (abas abertas com ela ainda pedem pedaços dela); apaga as mais velhas
      const meta = await caches.open(META);
      const antes = await meta
        .match("/versao")
        .then((r) => (r ? r.json() : null))
        .catch(() => null);
      const anterior = antes && antes.atual !== CACHE ? antes.atual : antes ? antes.anterior : null;
      await meta.put("/versao", new Response(JSON.stringify({ atual: CACHE, anterior })));
      for (const nome of await caches.keys()) {
        if (nome.startsWith(PREFIXO) && nome !== CACHE && nome !== anterior) await caches.delete(nome);
      }
      await self.clients.claim();
      for (const aba of await self.clients.matchAll({ type: "window" })) aba.postMessage({ tipo: "versao", entrada: ENTRADA });
    })(),
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, Google APIs, Pagar.me, functions: direto na rede
  const caminho = url.pathname;
  if (req.mode === "navigate") {
    const doSistema = caminho !== "/" && !caminho.startsWith("/__/") && !caminho.startsWith("/api/") && !/\.[a-z0-9]+$/i.test(caminho);
    if (doSistema) evento.respondWith(navegar(req));
    return;
  }
  if (caminho.startsWith("/assets/") && !caminho.endsWith(".map")) evento.respondWith(arquivoComHash(evento));
  else if (FIXOS.has(caminho)) evento.respondWith(caches.match(req, { ignoreVary: true }).then((r) => r || fetch(req)));
});

async function navegar(req) {
  // "no-cache": confere com o servidor (304 se nada mudou) em vez de usar o app.html antigo do cache do navegador
  let pedido = req;
  try {
    pedido = new Request(req, { cache: "no-cache" });
  } catch {
    /* navegador que não deixa copiar o pedido de navegação: vai como veio */
  }
  const rede = fetch(pedido);
  rede.catch(() => undefined); // se a resposta guardada for usada, a da rede pode falhar depois sem barulho
  try {
    const r = await Promise.race([rede, new Promise((_, desistir) => setTimeout(() => desistir(new Error("demorou")), ESPERA_REDE_MS))]);
    // 403/429/5xx (function fora do ar, cota) também caem no app guardado
    if (r.type === "opaqueredirect" || r.status < 400) return r;
  } catch {
    /* sem rede ou demorou */
  }
  const guardado = await caches.open(CACHE).then((c) => c.match("/app.html"));
  return guardado || rede;
}

async function arquivoComHash(evento) {
  const req = evento.request;
  const guardado = await caches.match(req, { ignoreVary: true });
  if (guardado) return guardado;
  const r = await fetch(req);
  // Pedaço de uma versão que não existe mais: o Hosting devolveria o app.html no lugar do JavaScript
  if (ehHtml(r)) return new Response("Arquivo de outra versão do site.", { status: 404, headers: { "content-type": "text/plain" } });
  if (r.ok) {
    const copia = r.clone();
    evento.waitUntil(caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => undefined));
  }
  return r;
}

// A primeira visita carrega a página antes de o service worker existir: a página manda a lista do que já
// carregou (vem do cache do navegador, sem gastar dados) para ficar guardado também.
self.addEventListener("message", (evento) => {
  const d = evento.data;
  if (d && d.tipo === "guardar" && Array.isArray(d.urls)) evento.waitUntil(guardarJaCarregados(d.urls.slice(0, 200)));
});

async function guardarJaCarregados(urls) {
  const cache = await caches.open(CACHE);
  for (const endereco of urls) {
    let url;
    try {
      url = new URL(endereco, self.location.origin);
    } catch {
      continue;
    }
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/assets/") || url.pathname.endsWith(".map")) continue;
    if (await caches.match(url.pathname, { ignoreVary: true })) continue;
    try {
      const r = await fetch(url.pathname);
      if (r.ok && !ehHtml(r)) await cache.put(url.pathname, r);
    } catch {
      /* fica para a próxima */
    }
  }
}
