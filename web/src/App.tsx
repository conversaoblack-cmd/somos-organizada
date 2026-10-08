import { lazy, Suspense, Component, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useParams, useLocation } from "react-router";
import { noHostPlataforma, plataformaSeparada, urlPlataforma } from "./lib/hosts";
import { ProvedorTorcida, useTorcidaPorSlug } from "./hooks/torcida";
import { registrarErro } from "./lib/erros";
import { BotaoLink, TelaCarregando, Vazio } from "./ui";
import { PortaoTorcida } from "./modulos/publico/Portao";

const Inicio = lazy(() => import("./modulos/inicio/Inicio"));
const Entrar = lazy(() => import("./modulos/inicio/Entrar"));
const Cadastro = lazy(() => import("./modulos/inicio/Cadastro"));
const PainelPlataforma = lazy(() => import("./modulos/plataforma/PainelPlataforma"));
const PaginaTorcida = lazy(() => import("./modulos/publico/PaginaTorcida"));
const CheckoutSocio = lazy(() => import("./modulos/publico/CheckoutSocio"));
const PaginaPedido = lazy(() => import("./modulos/publico/PaginaPedido"));
const IngressosDoPedido = lazy(() => import("./modulos/publico/IngressosDoPedido"));
const PainelSocio = lazy(() => import("./modulos/conta/PainelSocio"));
const PainelDiretoria = lazy(() => import("./modulos/admin/PainelDiretoria"));
const Portaria = lazy(() => import("./modulos/portaria/Portaria"));
const SuporteFlutuante = lazy(() => import("./componentes/SuporteFlutuante"));

class LimiteDeErro extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }
  componentDidCatch(erro: Error) {
    registrarErro(erro, "render");
  }
  render() {
    if (this.state.erro) {
      return (
        <div className="min-h-dvh grid place-items-center px-6">
          <Vazio icone="alerta" titulo="Algo deu errado nesta tela" acao={<button className="underline" onClick={() => location.reload()}>Recarregar</button>}>
            O erro já foi registrado para a nossa equipe. Se continuar, use o botão de ajuda.
          </Vazio>
        </div>
      );
    }
    return this.props.children;
  }
}

function RotasTorcida() {
  const { slug } = useParams();
  const { pathname } = useLocation();
  const estado = useTorcidaPorSlug(slug);
  if (estado.fase === "carregando") return <TelaCarregando />;
  if (estado.fase !== "ok") {
    return (
      <div className="min-h-dvh grid place-items-center px-6">
        <Vazio icone="bandeira" titulo={estado.fase === "nao_encontrada" ? "Torcida não encontrada" : "Não foi possível carregar"} acao={<BotaoLink to="/" variante="contorno">Ir para o início</BotaoLink>}>
          {estado.fase === "nao_encontrada" ? "Confira o endereço digitado." : "Verifique sua conexão e tente novamente."}
        </Vazio>
      </div>
    );
  }
  const painel = /^\/[^/]+\/(admin|portaria)/.test(pathname);
  const rotas = (
      <Routes>
        <Route index element={<PaginaTorcida />} />
        <Route path="evento/:eventoId" element={<PaginaTorcida />} />
        <Route path="associar" element={<CheckoutSocio />} />
        <Route path="associar/:planoId" element={<CheckoutSocio />} />
        <Route path="pedido/:pedidoId" element={<PaginaPedido />} />
        <Route path="ingressos/:pedidoId" element={<IngressosDoPedido />} />
        <Route path="conta/*" element={<PainelSocio />} />
        <Route path="socio/*" element={<PainelSocio />} />
        <Route path="admin/*" element={<PainelDiretoria />} />
        <Route path="portaria" element={<Portaria />} />
        <Route path="*" element={<PaginaTorcida />} />
      </Routes>
  );
  return (
    <ProvedorTorcida tid={estado.tid} torcida={estado.torcida} aplicarCores={!painel}>
      {painel ? rotas : <PortaoTorcida>{rotas}</PortaoTorcida>}
      {!/portaria/.test(pathname) && <SuporteFlutuante />}
    </ProvedorTorcida>
  );
}

/** Troca de domínio (painel da plataforma ↔ páginas das torcidas), mantendo o caminho. */
function IrPara({ url }: { url: string }) {
  useEffect(() => {
    location.replace(url);
  }, [url]);
  return <TelaCarregando />;
}

function RotasPlataformaSeparada() {
  const { pathname, search } = useLocation();
  // No subdomínio da plataforma só existe o painel da equipe, direto na raiz (sem /plataforma no endereço)
  if (noHostPlataforma()) {
    return (
      <Routes>
        <Route path="/plataforma/*" element={<Navigate to={(pathname.replace(/^\/plataforma/, "") || "/") + search} replace />} />
        <Route path="/*" element={<PainelPlataforma />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/plataforma/*" element={<IrPara url={urlPlataforma(pathname.replace(/^\/plataforma/, "") + search)} />} />
      <Route path="/:slug/*" element={<RotasTorcida />} />
    </Routes>
  );
}

export function App() {
  return (
    <LimiteDeErro>
      <Suspense fallback={<TelaCarregando />}>
        {plataformaSeparada ? (
          <RotasPlataformaSeparada />
        ) : (
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/entrar" element={<Entrar />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/plataforma/*" element={<PainelPlataforma />} />
            <Route path="/:slug/*" element={<RotasTorcida />} />
          </Routes>
        )}
      </Suspense>
    </LimiteDeErro>
  );
}
