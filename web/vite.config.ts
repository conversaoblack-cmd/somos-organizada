import { createServer, defineConfig, loadEnv, type Connect, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

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

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwind(), paginaInicial(mode)],
  resolve: { alias: ALIAS },
  server: { port: 5173, host: "127.0.0.1" },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: { index: new URL("./index.html", import.meta.url).pathname, app: new URL("./app.html", import.meta.url).pathname } },
  },
}));
