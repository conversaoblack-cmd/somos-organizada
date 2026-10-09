import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, defineConfig, loadEnv, type Connect, type Plugin, type Rollup, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { coresCompat } from "./plugins/coresCompat";

const RAIZ = new URL(".", import.meta.url).pathname;
const ALIAS = { "@": new URL("./src", import.meta.url).pathname };

/**
 * Dois HTMLs:
 * - index.html: a página inicial (somosorganizada.com.br/), gerada como HTML estático no build. Abre na hora, sem o sistema.
 * - app.html: o sistema (cadastro, entrar, páginas das torcidas, painéis). O Hosting manda para ele tudo que não é "/".
 * No servidor de desenvolvimento e no preview, o mesmo desvio é feito aqui.
 */
function paginaInicial(modo: string): Plugin {
  const env = loadEnv(modo, RAIZ);
  let dev: ViteDevServer | undefined;

  const desviarParaApp: Connect.NextHandleFunction = (req, _res, next) => {
    const caminho = (req.url ?? "/").split("?")[0];
    const html = req.method === "GET" && (req.headers.accept ?? "").includes("text/html");
    if (html && caminho !== "/" && caminho !== "/index.html" && !/\.[a-z0-9]+$/i.test(caminho) && !caminho.startsWith("/@")) req.url = "/app.html";
    next();
  };

  async function gerar(html: string, server: ViteDevServer) {
    const { render } = (await server.ssrLoadModule("/src/landing/render.tsx")) as typeof import("./src/landing/render");
    const { corpo, dados } = render({ slugDemo: env.VITE_SLUG_DEMO?.trim() || undefined });
    const host = env.VITE_HOST_PLATAFORMA?.trim().toLowerCase();
    // No subdomínio da plataforma o "/" é o painel da equipe: vai para o sistema antes de desenhar a página
    const redirecionar = host
      ? `<script>if(location.hostname===${JSON.stringify(host)})location.replace("/plataforma"+location.search+location.hash)</script>`
      : "";
    return html
      .replace("<!--redirecionar-plataforma-->", redirecionar)
      .replace("<!--dados-estruturados-->", `<script type="application/ld+json">${dados}</script>`)
      .replace("<!--pagina-inicial-->", corpo);
  }

  return {
    name: "pagina-inicial",
    configureServer(server) {
      dev = server;
      server.middlewares.use(desviarParaApp);
    },
    configurePreviewServer(server) {
      server.middlewares.use(desviarParaApp);
    },
    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        if (!html.includes("<!--pagina-inicial-->")) return html;
        if (dev) return gerar(html, dev);
        // No build não há servidor: sobe um só para carregar o componente e renderizar
        const temporario = await createServer({
          configFile: false,
          root: RAIZ,
          logLevel: "error",
          appType: "custom",
          resolve: { alias: ALIAS },
          esbuild: { jsx: "automatic" },
          server: { middlewareMode: true, hmr: false, ws: false },
          optimizeDeps: { noDiscovery: true, include: [] },
        });
        try {
          return await gerar(html, temporario);
        } finally {
          await temporario.close();
        }
      },
    },
  };
}

/** Telas que precisam abrir sem internet na portaria: ficam guardadas no aparelho já na primeira visita. */
const TELAS_SEM_INTERNET = [
  "/src/modulos/conta/PainelSocio.tsx", // carteirinha e ingressos da conta
  "/src/modulos/publico/IngressosDoPedido.tsx", // link dos ingressos do pedido
  "/src/modulos/publico/PaginaPedido.tsx",
  "/src/modulos/publico/PaginaTorcida.tsx",
  "/src/componentes/SuporteFlutuante.tsx", // aparece em todas as páginas da torcida
];
const ARQUIVOS_FIXOS = ["/fontes/archivo.woff2", "/fontes/archivo-black.woff2", "/icone.svg"];

/**
 * Gera dist/sw.js a partir de scripts/sw-modelo.js (só no build; no dev não há service worker).
 * Guarda no aparelho o app.html, o que ele carrega e as TELAS_SEM_INTERNET; o resto (painéis) fica guardado
 * quando é aberto. A versão do cache é o hash dessa lista e do app.html: cada implantação tem o seu cache e
 * o app.html guardado nunca aponta para arquivos de outra versão. A página inicial ("/") fica de fora.
 */
function serviceWorker(): Plugin {
  return {
    name: "service-worker",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_saida, bundle) {
        const pedacos = Object.values(bundle).filter((c): c is Rollup.OutputChunk => c.type === "chunk");
        const porArquivo = new Map(pedacos.map((c) => [c.fileName, c]));
        const lista = new Set<string>();
        const juntar = (c: Rollup.OutputChunk) => {
          if (lista.has(c.fileName)) return;
          lista.add(c.fileName);
          c.viteMetadata?.importedCss.forEach((css) => lista.add(css));
          c.viteMetadata?.importedAssets.forEach((a) => lista.add(a));
          c.imports.forEach((f) => porArquivo.get(f) && juntar(porArquivo.get(f)!));
        };
        const entrada = pedacos.find((c) => c.isEntry && c.facadeModuleId?.endsWith("/app.html"));
        if (!entrada) return this.error("service-worker: não achei o JavaScript de entrada do app.html");
        juntar(entrada);
        for (const tela of TELAS_SEM_INTERNET) {
          const c = pedacos.find((p) => p.isDynamicEntry && p.facadeModuleId?.endsWith(tela));
          if (!c) return this.error(`service-worker: ${tela} não é mais carregada com lazy(); atualize TELAS_SEM_INTERNET`);
          juntar(c);
        }
        const html = bundle["app.html"] as Rollup.OutputAsset | undefined;
        if (!html) return this.error("service-worker: app.html não está no build");
        const precache = [...[...lista].map((f) => `/${f}`).sort(), ...ARQUIVOS_FIXOS];
        const versao = createHash("sha256").update(JSON.stringify(precache)).update(html.source).digest("hex").slice(0, 12);
        const valores: Record<string, string> = {
          'const VERSAO = "__VERSAO__";': `const VERSAO = ${JSON.stringify(versao)};`,
          'const ENTRADA = "__ENTRADA__";': `const ENTRADA = ${JSON.stringify(`/${entrada.fileName}`)};`,
          "const PRECACHE = __PRECACHE__;": `const PRECACHE = ${JSON.stringify(precache)};`,
        };
        let fonte = readFileSync(new URL("./scripts/sw-modelo.js", import.meta.url), "utf8");
        for (const [de, para] of Object.entries(valores)) {
          if (!fonte.includes(de)) return this.error(`service-worker: o modelo perdeu a linha ${de}`);
          fonte = fonte.replace(de, para);
        }
        this.emitFile({ type: "asset", fileName: "sw.js", source: fonte });
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwind(), paginaInicial(mode), coresCompat(), serviceWorker()],
  resolve: { alias: ALIAS },
  server: { port: 5173, host: "127.0.0.1" },
  build: {
    // Celulares que ainda existem na arquibancada: iPhone preso no iOS 15 (6s/7/SE) e Android com Chrome antigo.
    // O padrão do Vite 7 é Safari 16/Chrome 107: código novo passaria sem conversão e quebraria só nesses aparelhos.
    target: ["es2020", "safari15", "chrome87", "firefox78", "edge88"],
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: { index: new URL("./index.html", import.meta.url).pathname, app: new URL("./app.html", import.meta.url).pathname } },
  },
}));
