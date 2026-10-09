import { lazy, Suspense, Component, Fragment, useEffect, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes, useParams, useLocation } from "react-router";
import { noHostPlataforma, plataformaSeparada, urlPlataforma } from "./lib/hosts";
import { ProvedorTorcida, useTorcidaPorSlug } from "./hooks/torcida";
import { registrarErro } from "./lib/erros";
import { VERSAO_APP } from "./lib/firebase";
import { BotaoLink, TelaCarregando, Vazio } from "./ui";
import { PortaoTorcida } from "./modulos/publico/Portao";
import { AvisoNovaVersao } from "./componentes/AvisoNovaVersao";
import { estaRecarregando } from "./lib/sw";

const Entrar = lazy(() => import("./modulos/inicio/Entrar"));
const Cadastro = lazy(() => import("./modulos/inicio/Cadastro"));
const Verificar = lazy(() => import("./modulos/inicio/Verificar"));
const Convite = lazy(() => import("./modulos/inicio/Convite"));
const RedefinirSenha = lazy(() => import("./modulos/inicio/RedefinirSenha"));
const PainelPlataforma = lazy(() => import("./modulos/plataforma/PainelPlataforma"));
const PaginaTorcida = lazy(() => import("./modulos/publico/PaginaTorcida"));
const PaginaEvento = lazy(() => import("./modulos/publico/PaginaEvento"));
const CheckoutSocio = lazy(() => import("./modulos/publico/CheckoutSocio"));
const PaginaPedido = lazy(() => import("./modulos/publico/PaginaPedido"));
const IngressosDoPedido = lazy(() => import("./modulos/publico/IngressosDoPedido"));
const PainelSocio = lazy(() => import("./modulos/conta/PainelSocio"));
const PainelDiretoria = lazy(() => import("./modulos/admin/PainelDiretoria"));
const Portaria = lazy(() => import("./modulos/portaria/Portaria"));
const SuporteFlutuante = lazy(() => import("./componentes/SuporteFlutuante"));
const PaginaLegal = lazy(() => import("./modulos/legal/PaginaLegal"));
const PaginaLegalTorcida = lazy(() => import("./modulos/legal/PaginaLegalTorcida"));

class LimiteDeErro extends Component<{ children: ReactNode }, { erro: Error | null; tentativa: number; detalhes: string }> {
  state = { erro: null as Error | null, tentativa: 0, detalhes: "" };
  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }
  componentDidCatch(erro: Error, info: ErrorInfo) {
    if (estaRecarregando()) return; // pedaço de versão antiga: a página já está recarregando na versão nova
    // Em qual tela/componente quebrou: vai junto para a equipe (Depuração), aparece em "Detalhes técnicos"
    // e sai legível no console (a mensagem minificada sozinha, tipo "q is not a function", não diz onde foi).
    const componentes = (info.componentStack ?? "").trim().split("\n").slice(0, 8).map((l) => l.trim()).join("\n");
    const detalhes = `${erro.name}: ${erro.message}\nEndereço: ${location.pathname}\nVersão: ${VERSAO_APP}\nNavegador: ${navigator.userAgent}\nTela:\n${componentes}`;
    this.setState({ detalhes });
    console.error(`[Somos Organizada] A tela quebrou: ${erro.message}\n${componentes}`, erro);
    registrarErro(Object.assign(new Error(erro.message), { stack: `${erro.stack ?? ""}\n--- tela ---\n${componentes}` }), "render");
  }
  render() {
    if (this.state.erro && estaRecarregando()) return <TelaCarregando />;
    if (this.state.erro) {
      // Sem internet, quase sempre é uma parte do site que ainda não ficou guardada no celular
      const semInternet = !navigator.onLine;
      return (
        <div className="min-h-dvh grid place-items-center px-6">
          <Vazio
            icone="alerta"
            titulo={semInternet ? "Sem internet" : "Algo deu errado nesta tela"}
            acao={
              <div className="flex flex-col items-center gap-2">
                {/* refaz a tela sem recarregar: o passo da compra/cadastro fica guardado e volta igual */}
                <button
                  className="h-11 px-5 rounded-2xl bg-primaria text-sobre-primaria font-semibold"
                  onClick={() => this.setState((s) => ({ erro: null, tentativa: s.tentativa + 1 }))}
                >
                  Tentar de novo
                </button>
                <button className="min-h-11 px-3 text-sm text-texto-2 underline" onClick={() => location.reload()}>
                  Recarregar a página
                </button>
              </div>
            }
          >
            {semInternet
              ? "Esta parte do site ainda não ficou salva no celular. Conecte-se à internet e toque em Tentar de novo."
              : "Você não perde o que já preencheu. O erro foi registrado para a nossa equipe; se continuar, use o botão de ajuda."}
            {this.state.detalhes && (
              <details className="mt-5 text-left">
                <summary className="min-h-11 inline-flex items-center cursor-pointer text-sm text-texto-3">Detalhes técnicos (para a equipe)</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-superficie-2 p-3 text-[11px] leading-snug whitespace-pre-wrap break-all text-texto-2">
                  {this.state.detalhes}
                </pre>
                <button
                  type="button"
                  className="mt-2 min-h-11 px-3 text-sm text-texto-2 underline"
                  onClick={() => void navigator.clipboard?.writeText(this.state.detalhes).catch(() => undefined)}
                >
                  Copiar detalhes
                </button>
              </details>
            )}
          </Vazio>
        </div>
      );
    }
    return <Fragment key={this.state.tentativa}>{this.props.children}</Fragment>;
  }
}

/** Parte que não pode derrubar a página (ex.: botão de ajuda que não carregou sem internet): some em silêncio. */
class Opcional extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() {
    return { erro: true };
  }
  render() {
    return this.state.erro ? null : this.props.children;
  }
}

function RotasTorcida() {
  const { slug } = useParams();
  const { pathname } = useLocation();
  const estado = useTorcidaPorSlug(slug);
  if (estado.fase === "carregando") return <TelaCarregando />;
  if (estado.fase !== "ok") {
    // Sem internet e a torcida nunca aberta neste celular: "Ir para o início" também não abriria
    if (estado.fase === "erro" && !navigator.onLine) {
      return (
        <div className="min-h-dvh grid place-items-center px-6">
          <Vazio
            icone="alerta"
            titulo="Sem internet"
            acao={
              <button type="button" className="h-11 px-5 rounded-2xl bg-primaria text-sobre-primaria font-semibold" onClick={() => location.reload()}>
                Tentar de novo
              </button>
            }
          >
            Esta página ainda não está salva neste celular. Abra a carteirinha e os ingressos uma vez com internet para eles ficarem salvos no celular.
          </Vazio>
        </div>
      );
    }
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
        <Route path="e/:codigo" element={<PaginaEvento />} />
        <Route path="evento/:eventoId" element={<PaginaEvento />} />
        <Route path="associar" element={<CheckoutSocio />} />
        <Route path="associar/:planoId" element={<CheckoutSocio />} />
        <Route path="pedido/:pedidoId" element={<PaginaPedido />} />
        <Route path="ingressos/:pedidoId" element={<IngressosDoPedido />} />
        <Route path="conta/*" element={<PainelSocio />} />
        <Route path="socio/*" element={<PainelSocio />} />
        <Route path="admin/*" element={<PainelDiretoria />} />
        <Route path="portaria" element={<Portaria />} />
        <Route path="termos" element={<PaginaLegalTorcida tipo="termos" />} />
        <Route path="privacidade" element={<PaginaLegalTorcida tipo="privacidade" />} />
        <Route path="*" element={<PaginaTorcida />} />
      </Routes>
  );
  return (
    <ProvedorTorcida tid={estado.tid} torcida={estado.torcida} aplicarCores={!painel}>
      {painel ? rotas : <PortaoTorcida>{rotas}</PortaoTorcida>}
      {!/portaria/.test(pathname) && (
        <Opcional>
          {/* Suspense próprio: a página (ingresso, carteirinha) não espera o botão de ajuda carregar */}
          <Suspense fallback={null}>
            <SuporteFlutuante />
          </Suspense>
        </Opcional>
      )}
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

/** Rotas do site. No subdomínio da plataforma (quando configurado) só existe o painel da equipe, na raiz. */
function Rotas() {
  const { pathname, search } = useLocation();
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
      {/* A página inicial é HTML estático (index.html): sai do sistema e carrega ela */}
      <Route path="/" element={<IrPara url="/" />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/verificar" element={<Verificar />} />
      <Route path="/convite" element={<Convite />} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />
      <Route path="/termos" element={<PaginaLegal tipo="termos" />} />
      <Route path="/privacidade" element={<PaginaLegal tipo="privacidade" />} />
      <Route
        path="/plataforma/*"
        element={plataformaSeparada ? <IrPara url={urlPlataforma(pathname.replace(/^\/plataforma/, "") + search)} /> : <PainelPlataforma />}
      />
      <Route path="/:slug/*" element={<RotasTorcida />} />
    </Routes>
  );
}

/** Página nova começa do topo (o React Router mantém a rolagem da anterior). Âncoras (#comprar) e abas (?aba=) não mexem. */
function RolarAoTopo() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <LimiteDeErro>
      <RolarAoTopo />
      <Suspense fallback={<TelaCarregando />}>
        <Rotas />
      </Suspense>
      <AvisoNovaVersao />
    </LimiteDeErro>
  );
}
