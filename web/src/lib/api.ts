/** Chamadas às Cloud Functions (functions/src/index.ts). Todas tipadas aqui, em um só lugar. */
import { httpsCallable } from "firebase/functions";
import { fns } from "./firebase";
import type { Endereco, Papel, PlanoSaas, RecebedorSede, StatusTorcida, Stats, Tema } from "./tipos";

// Todas as ações passam pela function única "api" (functions/src/api/central.ts).
const portaApi = httpsCallable<{ acao: string; dados: unknown }, unknown>(fns, "api");

// Portaria: fila andando não espera 70 s (padrão do SDK). Em 10 s sem resposta, vira "Sem conexão" e o porteiro lê de novo.
const portaApiRapida = httpsCallable<{ acao: string; dados: unknown }, unknown>(fns, "api", { timeout: 10_000 });

function chamar<E, S>(nome: string, rapida = false) {
  return async (dados: E): Promise<S> => (await (rapida ? portaApiRapida : portaApi)({ acao: nome, dados })).data as S;
}

const SEM_INTERNET = "Sem internet. Confira a conexão e tente de novo.";
const SEM_CONEXAO = "Sem conexão com o servidor. Confira a internet e tente de novo.";
const ALGO_DEU_ERRADO = "Algo deu errado. Tente novamente.";

/** Erros do login e do armazenamento (códigos "auth/..." e "storage/...", sempre com texto do SDK em inglês). */
const MENSAGENS_FIREBASE: Record<string, string> = {
  "auth/network-request-failed": SEM_INTERNET,
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
  "storage/unauthorized": "Você não tem permissão para enviar este arquivo.",
  "storage/canceled": "O envio foi cancelado.",
  "storage/retry-limit-exceeded": "O envio demorou demais. Confira a internet e tente de novo.",
  "storage/quota-exceeded": "Limite de arquivos atingido. Avise a equipe Somos Organizada.",
};

/**
 * Códigos padrão do Firebase (Firestore vem sem prefixo; as Cloud Functions vêm como "functions/...").
 * Só usados quando o texto do erro é o padrão do SDK, em inglês: as mensagens do nosso back-end já vêm em português.
 */
const MENSAGENS_POR_CODIGO: Record<string, string> = {
  unavailable: SEM_CONEXAO,
  "deadline-exceeded": "O servidor demorou para responder. Confira a internet e tente de novo.",
  "resource-exhausted": "Muitos pedidos ao mesmo tempo. Espere um instante e tente de novo.",
  "failed-precondition": "Não foi possível concluir agora. Atualize a página e tente de novo.",
  "not-found": "Não encontramos o que você procurou. Pode ter sido apagado: atualize a página.",
  aborted: "Outra alteração aconteceu ao mesmo tempo. Tente de novo.",
  "invalid-argument": "Algum dado não foi aceito. Confira o que foi preenchido e tente de novo.",
  unauthenticated: "Sua sessão expirou. Entre de novo para continuar.",
  "permission-denied": "Você não tem permissão para isso.",
  "already-exists": "Isso já está cadastrado.",
  cancelled: "A operação foi interrompida. Tente de novo.",
  "out-of-range": "Algum valor está fora do permitido. Confira e tente de novo.",
  unimplemented: "Esta função não está disponível nesta versão. Atualize a página.",
  internal: "Erro inesperado. Confira a internet e tente de novo.",
  "data-loss": ALGO_DEU_ERRADO,
  unknown: ALGO_DEU_ERRADO,
};

/** Palavras que só aparecem nos textos do SDK em inglês ("Missing or insufficient permissions.", "No document to update: ..."). */
const INGLES =
  /\b(the|is|was|are|were|not|has|have|had|does|did|because|cannot|could|failed|failure|error|missing|insufficient|permissions?|documents?|client|offline|function|request|response|network|deadline|exceeded|unknown|internal|unavailable|requires|query|backend|called|with|undefined|null|object|property|already|exists|found|invalid|to|of|and|update|instance|deleted|cancell?ed|something|went|wrong|please|try|again|you|your|this|that|been|an|or|it|at|by|from)\b/i;

/** Texto padrão do SDK do Firebase (inglês ou só o código), que nunca vai para a tela. */
function textoDoSdk(msg: string): boolean {
  if (!msg) return true;
  if (/^[A-Za-z_-]+\.?$/.test(msg)) return true; // só o código: "internal", "not-found", "INTERNAL", "Unauthenticated"
  if (/^Firebase\b|\((auth|storage|functions|firestore|app)\//.test(msg)) return true; // "Firebase: Error (auth/...)", "Firebase Storage: ..."
  if (/^Pagar\.me:/.test(msg)) return false; // recusa da Pagar.me repassada pelo nosso back-end: ajuda a diretoria a corrigir os dados
  if (/[áàâãéêíóôõúç]/i.test(msg)) return false; // português
  return INGLES.test(msg);
}

/** Falha de rede (sem sinal, sinal fraco, servidor fora): para telas que precisam tratar diferente (ex.: portaria). */
export function ehErroDeConexao(e: unknown): boolean {
  const code = String((e as { code?: string })?.code ?? "");
  const msg = String((e as { message?: string })?.message ?? "");
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    /^(functions\/)?(unavailable|deadline-exceeded|internal|resource-exhausted)$/.test(code) ||
    code === "auth/network-request-failed" ||
    code === "storage/retry-limit-exceeded" ||
    (e instanceof TypeError && /fetch|network|load failed/i.test(msg))
  );
}

/**
 * Mensagem amigável a partir de um erro de callable/Firestore/login. Nunca mostra texto em inglês nem "auth/...":
 * as mensagens do nosso back-end (HttpsError) e do front (new Error("...")) já vêm em português e aparecem como estão;
 * o texto padrão do SDK vira uma frase em português pelo código.
 */
export function mensagemDeErro(e: unknown): string {
  const bruto = e as { code?: unknown; message?: unknown } | null | undefined;
  const code = typeof bruto?.code === "string" ? bruto.code : "";
  // o SDK das functions acrescenta o status HTTP no fim ("... [409]")
  const msg = (typeof bruto?.message === "string" ? bruto.message : typeof e === "string" ? e : "").replace(/\s*\[\d{3}\]$/, "").trim();
  if (MENSAGENS_FIREBASE[code]) return MENSAGENS_FIREBASE[code];
  if (e instanceof TypeError && /fetch|network|load failed/i.test(msg)) return SEM_INTERNET;
  if (!code.startsWith("auth/") && !code.startsWith("storage/") && !textoDoSdk(msg)) return msg;
  const base = code.replace(/^(functions|firestore)\//, "");
  if (typeof navigator !== "undefined" && navigator.onLine === false) return SEM_INTERNET;
  return MENSAGENS_POR_CODIGO[base] ?? ALGO_DEU_ERRADO;
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
      /** Mesmo id nas tentativas da mesma compra: resposta perdida não vira cobrança dupla. */
      idCompra?: string;
      metodo: "pix" | "cartao";
      comprador: DadosPessoa;
      titulares: { nome: string; cpf: string }[];
      cartao?: DadosCartao;
    },
    { pedidoId: string; status: "aguardando" | "pago" }
  >("criarPedidoIngresso"),
  verificarPedido: chamar<{ tid: string; pedidoId: string }, { status: string }>("verificarPedido"),
  ingressosNoMeuNome: chamar<
    { tid: string },
    {
      ingressos: {
        id: string;
        pedidoId: string;
        eventoId: string;
        eventoNome: string;
        eventoData: number;
        tipo: "socio" | "publico";
        titularNome: string;
        titularCpf: string;
        status: "valido" | "usado" | "cancelado";
        usadoEm: number | null;
      }[];
    }
  >("ingressosNoMeuNome"),
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
    { status: string; avisoAssinatura?: string }
  >("alterarStatusSocio"),
  salvarCredenciaisPagarme: chamar<
    { tid: string; chaveSecreta: string; chavePublica: string; pix: boolean; cartao: boolean; descritorFatura?: string },
    { ambiente: "teste" | "producao"; webhookUrl: string }
  >("salvarCredenciaisPagarme"),
  obterWebhookUrl: chamar<{ tid: string }, { webhookUrl: string | null }>("obterWebhookUrl"),
  convidarMembro: chamar<
    { tid: string; email: string; nome: string; papel: Papel; sedeId?: string },
    { uid: string; contaNova: boolean; nuncaEntrou?: boolean; emailEnviado?: boolean }
  >("convidarMembro"),
  /** Página /convite: para quem é o convite, de qual torcida e com quais cores (sem login). */
  verConvite: chamar<
    { c: string },
    {
      valido: boolean;
      motivo?: "invalido" | "usado" | "expirado";
      email?: string;
      nome?: string;
      papel?: Papel;
      sedeNome?: string | null;
      torcida?: { nome: string; slug: string; tema: Partial<Tema> | null } | null;
    }
  >("verConvite"),
  /** Cria a senha do convidado e confirma o e-mail; depois o site entra com e-mail e senha. */
  aceitarConvite: chamar<{ c: string; senha: string }, { email: string; slug: string | null }>("aceitarConvite"),
  /** Esqueci minha senha (e-mail): nosso e-mail com link para /redefinir-senha. Mesma resposta com ou sem conta. */
  /** Login da equipe: endereço digitado errado → até 3 torcidas parecidas. */
  sugerirTorcidas: chamar<{ texto: string }, { sugestoes: { slug: string; nome: string; logoUrl: string | null }[] }>("sugerirTorcidas"),
  /** Cadastro: confere o vídeo de verificação enviado ao Storage e marca o cadastro como pronto para a análise. */
  registrarVideoVerificacao: chamar<{ caminho: string }, { status: string }>("registrarVideoVerificacao"),
  /** Equipe: pede um novo vídeo de verificação, com o motivo. */
  pedirNovoVideo: chamar<{ id: string; motivo: string }, { ok: boolean }>("pedirNovoVideo"),
  redefinirSenhaPorEmail: chamar<{ email: string; continuar: string; tid?: string }, { enviado: boolean }>("redefinirSenhaPorEmail"),
  atualizarMembro: chamar<
    { tid: string; uid: string; papel?: Papel; sedeId?: string | null; ativo?: boolean },
    { ok: boolean }
  >("atualizarMembro"),
  validarEntrada: chamar<
    { tid: string; eventoId: string; qr?: string; cpf?: string; codigo?: string; confirmar?: boolean; leituraId?: string },
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
  publicarSite: chamar<{ tid: string; plano?: PlanoSaas }, { publicada: boolean }>("publicarSite"),
  despublicarSite: chamar<{ tid: string }, { publicada: boolean }>("despublicarSite"),
  alterarPlanoSaas: chamar<{ tid: string; plano: PlanoSaas }, { plano: PlanoSaas }>("alterarPlanoSaas"),
  /** Põe o evento à venda (só o servidor publica: confere o limite de eventos à venda do plano). */
  publicarEvento: chamar<{ tid: string; eventoId: string }, { status: "publicado" }>("publicarEvento"),
  informarPagamentoSaas: chamar<{ tid: string; faturaId: string }, { ok: boolean }>("informarPagamentoSaas"),
  confirmarFaturaSaas: chamar<{ tid: string; faturaId: string }, { ok: boolean }>("confirmarFaturaSaas"),
  executarRotinaSaas: chamar<{ agora?: number }, { faturasGeradas: number; bloqueadas: number }>("executarRotinaSaas"),
  atualizarPixFaturas: chamar<Record<string, never>, { atualizadas: number }>("atualizarPixFaturas"),
  conferirPixFatura: chamar<{ tid: string }, { atualizadas: number }>("conferirPixFatura"),

  // ── Cadastro de torcida (página principal) ───────────
  entrarComCpf: chamar<{ cpf: string; senha: string }, { email: string }>("entrarComCpf"),
  redefinirSenhaPorCpf: chamar<{ tid?: string; cpf: string }, { enviado: true }>("redefinirSenhaPorCpf"),
  /** E-mail de confirmação com a nossa identidade e link para /verificar (enviado: false = usar o do Firebase). */
  enviarConfirmacaoEmail: chamar<{ continuar: string }, { enviado: boolean; jaConfirmado?: boolean }>("enviarConfirmacaoEmail"),
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
      /** Versão (data) dos Termos e da Política aceitos na declaração. */
      termos?: string;
    },
    { solicitacaoId: string; status: string }
  >("solicitarTorcida"),
  avaliarSolicitacao: chamar<
    {
      id: string;
      aprovar: boolean;
      motivo?: string;
      /** o que a equipe conferiu no vídeo de verificação (obrigatório para aprovar) */
      conferencia?: { testemunhas: number; documentoConferido: boolean; sedeConferida: boolean; observacoes?: string };
    },
    { status: string; torcidaId?: string; slug?: string }
  >(
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
          /** Já normalizado pelo servidor (ids antigos viram pro/plus/max). */
          plano: PlanoSaas;
          /** Eventos publicados com data no futuro (limite do plano). */
          eventosAVenda: number;
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
