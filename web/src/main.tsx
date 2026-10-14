import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, unstable_HistoryRouter as HistoryRouter } from "react-router";
import "./index.css";
import { App } from "./App";
import { instalarCapturaDeErros, registrarErro } from "./lib/erros";
import { vigiarDadosOffline } from "./lib/offline";
import { registrarServiceWorker } from "./lib/sw";
import { bloquearZoom } from "./lib/semZoom";
import { definirHostProprio, talvezDominioProprio, urlPadrao } from "./lib/hosts";
import { ajustarEnderecoInicial, buscarDominio, criarHistoricoProprio, lerCacheDominio } from "./lib/historicoProprio";
import type { HostProprio } from "./lib/dominioProprio";
import { ProvedorToast, TelaCarregando, Vazio } from "./ui";

instalarCapturaDeErros();
vigiarDadosOffline();
registrarServiceWorker();
bloquearZoom();

const raiz = createRoot(document.getElementById("root")!);
const desenhar = (conteudo: ReactNode) => raiz.render(<StrictMode>{conteudo}</StrictMode>);
const app = (
  <ProvedorToast>
    <App />
  </ProvedorToast>
);

/** Domínio próprio de torcida: as rotas de sempre, com os caminhos curtos na barra de endereço. */
function abrirNoDominio(h: HostProprio & { www?: boolean }) {
  if (h.www) {
    // www.furia.com.br: o Hosting já redireciona; se chegar aqui, vai para o domínio raiz
    location.replace(`${location.protocol}//${h.host.replace(/^www\./, "")}${location.port ? `:${location.port}` : ""}${location.pathname}${location.search}${location.hash}`);
    return;
  }
  if (!ajustarEnderecoInicial(h)) return desenhar(<TelaCarregando />);
  definirHostProprio(h);
  desenhar(<HistoryRouter history={criarHistoricoProprio(h)}>{app}</HistoryRouter>);
}

function EnderecoSemTorcida({ erro }: { erro: boolean }) {
  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <Vazio
        icone={erro ? "alerta" : "bandeira"}
        titulo={erro ? "Sem conexão" : "Endereço ainda não ligado"}
        acao={
          erro ? (
            <button type="button" className="h-11 px-5 rounded-2xl bg-primaria text-sobre-primaria font-semibold" onClick={() => location.reload()}>
              Tentar de novo
            </button>
          ) : (
            <a href={urlPadrao("/")} className="h-11 px-5 inline-flex items-center rounded-2xl border border-linha-forte font-semibold">
              Ir para a Somos Organizada
            </a>
          )
        }
      >
        {erro
          ? "Não foi possível abrir o site da torcida. Confira a internet e tente de novo."
          : `${location.hostname} ainda não está ligado a uma torcida. Se o endereço é novo, aguarde alguns minutos.`}
      </Vazio>
    </div>
  );
}

async function iniciar() {
  if (!talvezDominioProprio()) {
    desenhar(<BrowserRouter>{app}</BrowserRouter>);
    return;
  }
  const host = location.hostname.toLowerCase();
  const guardado = lerCacheDominio(host);
  if (guardado) {
    abrirNoDominio(guardado);
    // Confere em segundo plano: mudança (ou remoção) vale a partir da próxima abertura
    buscarDominio(host).catch(() => undefined);
    return;
  }
  desenhar(<TelaCarregando />);
  try {
    const h = await buscarDominio(host);
    if (h) abrirNoDominio(h);
    else desenhar(<EnderecoSemTorcida erro={false} />);
  } catch (e) {
    registrarErro(e, "dominio-proprio");
    desenhar(<EnderecoSemTorcida erro />);
  }
}

void iniciar();
