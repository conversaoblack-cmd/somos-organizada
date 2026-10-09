/**
 * Porta única das chamadas do site: uma só Cloud Function ("api") recebe { acao, dados } e executa a ação.
 *
 * Por quê: no Firebase Functions v2 cada function vira um serviço do Cloud Run, que reserva CPU própria na
 * região. Com 35 chamadas separadas o projeto estourava a cota "Total CPU allocation" de southamerica-east1 e
 * metade ficava quebrada (403/429). Juntas num serviço só, a cota sobra e o deploy fica rápido.
 *
 * Cada ação continua sendo o mesmo onCall de antes (mesmas checagens de login, papel e escopo);
 * aqui só repassamos o pedido autenticado para ela com .run().
 */
import * as verificacao from "./verificacao";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { EMAIL_API_KEY, MASTER_KEY, MAX_INSTANCIAS_API, QR_HMAC } from "../config";
import * as ingressos from "./ingressos";
import * as socios from "./socios";
import * as recebedores from "./recebedores";
import * as torcida from "./torcida";
import * as plataforma from "./plataforma";
import * as demo from "./demo";
import * as saas from "./saas";
import * as cadastro from "./cadastro";
import * as conta from "./conta";
import * as convite from "./convite";
import * as senha from "./senha";
import * as verificacaoVideo from "./verificacaoVideo";

type Acao = { run: (req: CallableRequest<unknown>) => unknown };

export const ACOES: Record<string, Acao> = {
  criarPedidoIngresso: ingressos.criarPedidoIngresso,
  cotarIngresso: ingressos.cotarIngresso,
  verificarPedido: ingressos.verificarPedido,
  ingressosDoPedido: ingressos.ingressosDoPedido,
  ingressosNoMeuNome: ingressos.ingressosNoMeuNome,
  validarEntrada: ingressos.validarEntrada,
  aderirSocio: socios.aderirSocio,
  pagarMensalidade: socios.pagarMensalidade,
  sincronizarAssinatura: socios.sincronizarAssinatura,
  cancelarAssinatura: socios.cancelarAssinatura,
  minhaCarteirinha: socios.minhaCarteirinha,
  alterarStatusSocio: socios.alterarStatusSocio,
  atualizarCartao: socios.atualizarCartao,
  configurarSplit: recebedores.configurarSplit,
  cadastrarRecebedor: recebedores.cadastrarRecebedor,
  atualizarRecebedor: recebedores.atualizarRecebedor,
  salvarCredenciaisPagarme: torcida.salvarCredenciaisPagarme,
  obterWebhookUrl: torcida.obterWebhookUrl,
  convidarMembro: torcida.convidarMembro,
  atualizarMembro: torcida.atualizarMembro,
  publicarEvento: torcida.publicarEvento,
  reivindicarPlataforma: plataforma.reivindicarPlataforma,
  criarTorcida: plataforma.criarTorcida,
  atualizarTorcidaPlataforma: plataforma.atualizarTorcidaPlataforma,
  resumoPlataforma: plataforma.resumoPlataforma,
  diagnosticoTorcida: plataforma.diagnosticoTorcida,
  simularDemo: demo.simularDemo,
  publicarSite: saas.publicarSite,
  despublicarSite: saas.despublicarSite,
  alterarPlanoSaas: saas.alterarPlanoSaas,
  informarPagamentoSaas: saas.informarPagamentoSaas,
  confirmarFaturaSaas: saas.confirmarFaturaSaas,
  executarRotinaSaas: saas.executarRotinaSaas,
  slugDisponivel: cadastro.slugDisponivel,
  sugerirTorcidas: cadastro.sugerirTorcidas,
  solicitarTorcida: cadastro.solicitarTorcida,
  avaliarSolicitacao: cadastro.avaliarSolicitacao,
  entrarComCpf: conta.entrarComCpf,
  redefinirSenhaPorCpf: conta.redefinirSenhaPorCpf,
  enviarConfirmacaoEmail: verificacao.enviarConfirmacaoEmail,
  verConvite: convite.verConvite,
  aceitarConvite: convite.aceitarConvite,
  redefinirSenhaPorEmail: senha.redefinirSenhaPorEmail,
  horariosVerificacao: verificacaoVideo.horariosVerificacao,
  agendarVerificacao: verificacaoVideo.agendarVerificacao,
  atualizarVerificacao: verificacaoVideo.atualizarVerificacao,
} as unknown as Record<string, Acao>;

export const api = onCall(
  { secrets: [MASTER_KEY, QR_HMAC, EMAIL_API_KEY], maxInstances: MAX_INSTANCIAS_API, timeoutSeconds: 120 },
  async (req) => {
    const { acao, dados } = (req.data ?? {}) as { acao?: unknown; dados?: unknown };
    if (typeof acao !== "string" || !Object.prototype.hasOwnProperty.call(ACOES, acao)) {
      throw new HttpsError("not-found", "Ação desconhecida.");
    }
    return ACOES[acao].run({ ...req, data: dados ?? {} });
  },
);
