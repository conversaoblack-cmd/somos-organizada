/** Chamadas às Cloud Functions (functions/src/index.ts). Todas tipadas aqui, em um só lugar. */
import { httpsCallable, type FunctionsError } from "firebase/functions";
import { fns } from "./firebase";
import type { Endereco, Papel, RecebedorSede, StatusTorcida, Stats, Tema } from "./tipos";

// Todas as ações passam pela function única "api" (functions/src/api/central.ts).
const portaApi = httpsCallable<{ acao: string; dados: unknown }, unknown>(fns, "api");

// Portaria: fila andando não espera 70 s (padrão do SDK). Em 10 s sem resposta, vira "Sem conexão" e o porteiro lê de novo.
const portaApiRapida = httpsCallable<{ acao: string; dados: unknown }, unknown>(fns, "api", { timeout: 10_000 });

function chamar<E, S>(nome: string, rapida = false) {
  return async (dados: E): Promise<S> => (await (rapida ? portaApiRapida : portaApi)({ acao: nome, dados })).data as S;
}

/** Erros do Firebase (login, banco, rede) em português: nunca mostrar "auth/..." ou texto em inglês ao torcedor. */
const MENSAGENS_FIREBASE: Record<string, string> = {
  "auth/network-request-failed": "Sem internet. Confira a conexão e tente de novo.",
  "auth/too-many-requests": "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  "auth/invalid-email": "E-mail inválido. Confira o que foi digitado.",
  "auth/missing-password": "Digite sua senha.",
  "auth/user-disabled": "Esta conta foi desativada. Fale com a diretoria da torcida.",
  "auth/email-already-in-use": "Este e-mail já tem conta. Entre com a sua senha ou use “Esqueci minha senha”.",
  "auth/weak-password": "Senha fraca: use pelo menos 8 caracteres.",
  "auth/requires-recent-login": "Por segurança, saia e entre de novo antes de fazer isso.",
  "auth/expired-action-code": "Este link expirou. Peça um novo.",
  "auth/invalid-action-code": "Este link já foi usado ou não é válido. Peça um novo.",
  "auth/unauthorized-continue-uri": "Não foi possível enviar o e-mail agora. Avise a equipe Somos Organizada.",
  "auth/quota-exceeded": "Limite de envios atingido por hoje. Tente de novo mais tarde.",
  "functions/deadline-exceeded": "O servidor demorou para responder. Confira a internet e tente de novo.",
  "functions/resource-exhausted": "Muitos pedidos ao mesmo tempo. Espere um instante e tente de novo.",
  "deadline-exceeded": "O servidor demorou para responder. Confira a internet e tente de novo.",
  "resource-exhausted": "Muitos pedidos ao mesmo tempo. Espere um instante e tente de novo.",
  "failed-precondition": "Não foi possível concluir agora. Atualize a página e tente de novo.",
};

/** Falha de rede (sem sinal, sinal fraco, servidor fora): para telas que precisam tratar diferente (ex.: portaria). */
export function ehErroDeConexao(e: unknown): boolean {
  const code = String((e as { code?: string })?.code ?? "");
  const msg = String((e as { message?: string })?.message ?? "");
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    /^(functions\/)?(unavailable|deadline-exceeded|internal|resource-exhausted)$/.test(code) ||
    code === "auth/network-request-failed" ||
    (e instanceof TypeError && /fetch|network|load failed/i.test(msg))
  );
}

/** Mensagem amigável a partir de um erro de callable/Firestore. */
export function mensagemDeErro(e: unknown): string {
  const bruto = e as Partial<FunctionsError> & { message?: string; code?: string };
  if (bruto?.code && MENSAGENS_FIREBASE[bruto.code]) return MENSAGENS_FIREBASE[bruto.code];
  if (e instanceof TypeError && /fetch|network|load failed/i.test(bruto.message ?? "")) return "Sem internet. Confira a conexão e tente de novo.";
  // o SDK às vezes acrescenta o status HTTP no fim ("... [409]")
  const err = { ...bruto, code: bruto?.code, message: bruto?.message?.replace(/\s*\[\d{3}\]$/, "") };
  if (err?.code === "functions/unavailable" || err?.code === "unavailable") {
    return err.message && !/^unavailable$/i.test(err.message) ? err.message : "Sem conexão com o servidor. Tente de novo.";
  }
  if (err?.code === "permission-denied" || err?.code === "functions/permission-denied") {
    return err.message && !/Missing or insufficient/i.test(err.message) ? err.message : "Você não tem permissão para isso.";
  }
  if (err?.code === "functions/internal" && (!err.message || err.message === "internal")) return "Erro inesperado. Tente novamente.";
  // Mensagem crua do SDK (em inglês, "Firebase: Error (auth/...)") nunca vai para a tela
  if (!err?.message || /^Firebase:|\(auth\/|^[a-z-]+$/.test(err.message) || /[A-Za-z]+ [a-z]+ (is|was|not|has) /.test(err.message)) {
    return err?.code?.startsWith("firestore/") || err?.code === "unavailable" ? "Sem conexão com o servidor. Tente de novo." : "Algo deu errado. Tente novamente.";
  }
  return err.message;
}

export interface DadosPessoa {
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
}
/** Dados do titular (pessoa física) da conta de recebimento da subsede. rendaMensal em centavos. */
export interface DadosRecebedor {
  nome: string;
  email: string;
  cpf: string;
  nascimento: string; // AAAA-MM-DD
  nomeMae: string;
  rendaMensal: number;
  profissao: string;
  telefone: string;
  endereco: { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string; referencia?: string };
  banco: { codigo: string; agencia: string; agenciaDv?: string; conta: string; contaDv: string; tipo: "checking" | "savings" };
}

export interface DadosCartao {
  token: string;
  endereco: Endereco;
}

export const api = {
  // ── Público / checkout ───────────────────────────────
  cotarIngresso: chamar<
    { tid: string; eventoId: string },
    {
      pct: number;
      valorSocio: number;
      valorPublico: number;
      taxaSocio: number;
      taxaPublico: number;
      limitePorPedido: number;
      disponiveis: number | null;
      socio: { nome: string; cpf: string; jaUsou: boolean } | null;
    }
  >("cotarIngresso"),
  criarPedidoIngresso: chamar<
    {
      tid: string;
      eventoId: string;
      metodo: "pix" | "cartao";
      comprador: DadosPessoa;
      titulares: { nome: string; cpf: string }[];
      cartao?: DadosCartao;
    },
    { pedidoId: string; status: "aguardando" | "pago" }
  >("criarPedidoIngresso"),
  verificarPedido: chamar<{ tid: string; pedidoId: string }, { status: string }>("verificarPedido"),
  ingressosDoPedido: chamar<
    { tid: string; pedidoId: string; chave: string },
    {
      eventoNome: string;
      ingressos: {
        id: string;
        eventoNome: string;
        eventoData: number;
        tipo: "socio" | "publico";
        titularNome: string;
        titularCpf: string;
        codigo: string;
        qr: string;
        status: "valido" | "usado" | "cancelado";
      }[];
    }
  >("ingressosDoPedido"),

  // ── Sócio ────────────────────────────────────────────
  aderirSocio: chamar<
    {
      tid: string;
      planoId: string;
      sedeId: string;
      metodo: "pix" | "cartao";
      fotoPath?: string;
      dados: { nome: string; cpf: string; telefone: string; nascimento: string; endereco: Endereco };
      cartao?: { token: string; endereco?: Endereco };
    },
    { modo: "pedido"; pedidoId: string; status: string } | { modo: "assinatura"; status: string }
  >("aderirSocio"),
  pagarMensalidade: chamar<{ tid: string }, { pedidoId: string; status: string }>("pagarMensalidade"),
  sincronizarAssinatura: chamar<{ tid: string; socioUid?: string }, { pagas: number }>("sincronizarAssinatura"),
  cancelarAssinatura: chamar<{ tid: string }, { ok: boolean }>("cancelarAssinatura"),
  minhaCarteirinha: chamar<{ tid: string }, { qr: string }>("minhaCarteirinha"),
  atualizarCartao: chamar<{ tid: string; cartao: { token: string; endereco?: Endereco } }, { cobrado: boolean; status: string }>("atualizarCartao"),

  // ── Split / recebedores ──────────────────────────────
  configurarSplit: chamar<{ tid: string; recebedorPrincipalId?: string; desativar?: boolean }, { splitAtivo: boolean; nome?: string | null }>(
    "configurarSplit",
  ),
  cadastrarRecebedor: chamar<{ tid: string; dados: DadosRecebedor }, { recebedor: RecebedorSede }>("cadastrarRecebedor"),
  atualizarRecebedor: chamar<{ tid: string; sedeId?: string }, { recebedor: RecebedorSede }>("atualizarRecebedor"),

  // ── Diretoria ────────────────────────────────────────
  alterarStatusSocio: chamar<
    { tid: string; socioUid: string; acao: "aprovar" | "suspender" | "reativar" | "cancelar" },
    { status: string }
  >("alterarStatusSocio"),
  salvarCredenciaisPagarme: chamar<
    { tid: string; chaveSecreta: string; chavePublica: string; pix: boolean; cartao: boolean; descritorFatura?: string },
    { ambiente: "teste" | "producao"; webhookUrl: string }
  >("salvarCredenciaisPagarme"),
  obterWebhookUrl: chamar<{ tid: string }, { webhookUrl: string | null }>("obterWebhookUrl"),
  convidarMembro: chamar<
    { tid: string; email: string; nome: string; papel: Papel; sedeId?: string },
    { uid: string; contaNova: boolean }
  >("convidarMembro"),
  atualizarMembro: chamar<
    { tid: string; uid: string; papel?: Papel; sedeId?: string | null; ativo?: boolean },
    { ok: boolean }
  >("atualizarMembro"),
  validarEntrada: chamar<
    { tid: string; eventoId: string; qr?: string; cpf?: string; codigo?: string; confirmar?: boolean },
    {
      resultado: "liberado" | "ja_usado" | "invalido" | "cancelado" | "outro_evento" | "nao_encontrado";
      mensagem: string;
      titularNome?: string;
      titularCpf?: string;
      tipo?: "socio" | "publico";
      codigo?: string;
      eventoNome?: string;
      usadoEm?: number | null;
    }
  >("validarEntrada", true),

  // ── Modo demonstração ────────────────────────────────
  simularDemo: chamar<
    { tid: string; acao: "pagar_pedido" | "aprovar_recebedor"; pedidoId?: string; sedeId?: string },
    { status?: string; recebedor?: RecebedorSede }
  >("simularDemo"),

  // ── Site e mensalidade Somos Organizada ──────────────
  publicarSite: chamar<{ tid: string; plano?: "pequena" | "grande" }, { publicada: boolean }>("publicarSite"),
  despublicarSite: chamar<{ tid: string }, { publicada: boolean }>("despublicarSite"),
  alterarPlanoSaas: chamar<{ tid: string; plano: "pequena" | "grande" }, { plano: string }>("alterarPlanoSaas"),
  informarPagamentoSaas: chamar<{ tid: string; faturaId: string }, { ok: boolean }>("informarPagamentoSaas"),
  confirmarFaturaSaas: chamar<{ tid: string; faturaId: string }, { ok: boolean }>("confirmarFaturaSaas"),
  executarRotinaSaas: chamar<{ agora?: number }, { faturasGeradas: number; bloqueadas: number }>("executarRotinaSaas"),

  // ── Cadastro de torcida (página principal) ───────────
  entrarComCpf: chamar<{ cpf: string; senha: string }, { email: string }>("entrarComCpf"),
  slugDisponivel: chamar<{ slug: string }, { disponivel: boolean; motivo?: string }>("slugDisponivel"),
  solicitarTorcida: chamar<
    {
      nomeTorcida: string;
      slug: string;
      clube?: string;
      estimativaSocios?: number;
      quantidadeSubsedes?: number;
      tema?: Pick<Tema, "corPrimaria" | "corSecundaria" | "corFundo" | "corTexto">;
      responsavel: { nome: string; cpf: string; telefone: string; cargo: string };
      entidade: { tipo: "cnpj" | "sem_cnpj"; cnpj?: string; razaoSocial?: string; emailFinanceiro?: string };
      endereco: Endereco;
    },
    { solicitacaoId: string; status: string }
  >("solicitarTorcida"),
  avaliarSolicitacao: chamar<{ id: string; aprovar: boolean; motivo?: string }, { status: string; torcidaId?: string; slug?: string }>(
    "avaliarSolicitacao",
  ),

  // ── Plataforma ───────────────────────────────────────
  reivindicarPlataforma: chamar<Record<string, never>, { ok: boolean }>("reivindicarPlataforma"),
  criarTorcida: chamar<
    { nome: string; slug: string; diretor: { nome: string; email: string }; nomeSedePrincipal?: string; mensalidadeSaas?: number },
    { torcidaId: string; slug: string; linkDefinirSenha: string | null }
  >("criarTorcida"),
  atualizarTorcidaPlataforma: chamar<
    {
      tid: string;
      status?: StatusTorcida;
      taxaServicoPct?: number;
      contrato?: { mensalidadeSaas: number; diaVencimento: number; observacoes?: string };
    },
    { ok: boolean }
  >("atualizarTorcidaPlataforma"),
  resumoPlataforma: chamar<
    Record<string, never>,
    {
      mes: string;
      torcidas: {
        id: string;
        nome: string;
        slug: string;
        status: StatusTorcida;
        pagamentos: { configurado: boolean; ambiente: "teste" | "producao" | "demo" | null; webhookRecebidoEm: number | null };
        geral: Stats;
        mes: Stats;
        mensalidadeSaas: number;
        contrato: { mensalidadeSaas: number; diaVencimento: number; observacoes: string };
        chamadosAbertos: number;
        publicada: boolean;
        modulos: { eventos: boolean; socios: boolean };
        saas: {
          plano: "pequena" | "grande";
          situacao: "em_dia" | "aberta" | "atrasada" | "bloqueada";
          bloqueada: boolean;
          faturasAbertas: { id: string; valor: number; plano: string; vencimento: number | null; informadoPagamentoEm: number | null }[];
        } | null;
      }[];
      historico: Stats[];
      solicitacoesPendentes: number;
    }
  >("resumoPlataforma"),
  diagnosticoTorcida: chamar<{ tid: string }, DiagnosticoTorcida>("diagnosticoTorcida"),
};

export interface DiagnosticoTorcida {
  torcida: Record<string, unknown>;
  credenciais: { salvas: boolean; atualizadoEm: number | null };
  webhooks: { id: string; tipo: string; processado: boolean; resultado?: string; erro?: string | null; recebidoEm: number | null; tentativas?: number }[];
  pedidos: {
    id: string;
    tipo: string;
    status: string;
    metodo: string;
    total: number;
    motivo: string | null;
    eventoNome: string | null;
    criadoEm: number | null;
    comprador: { nome: string; email: string; cpf: string };
    pagarmeOrderId: string | null;
  }[];
  erros: { id: string; mensagem: string; url?: string; uid?: string; navegador?: string; contexto?: string; criadoEm: number | null }[];
  eventos: { id: string; nome: string; status: string; vendidos: number; reservados: number }[];
  planos: { id: string; nome: string; valor: number; ativo: boolean }[];
}
