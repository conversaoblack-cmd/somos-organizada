/** Chamadas às Cloud Functions (functions/src/index.ts). Todas tipadas aqui, em um só lugar. */
import { httpsCallable, type FunctionsError } from "firebase/functions";
import { fns } from "./firebase";
import type { Endereco, Papel, StatusTorcida, Stats } from "./tipos";

function chamar<E, S>(nome: string) {
  const fn = httpsCallable<E, S>(fns, nome);
  return async (dados: E): Promise<S> => (await fn(dados)).data;
}

/** Mensagem amigável a partir de um erro de callable/Firestore. */
export function mensagemDeErro(e: unknown): string {
  const bruto = e as Partial<FunctionsError> & { message?: string; code?: string };
  // o SDK às vezes acrescenta o status HTTP no fim ("... [409]")
  const err = { ...bruto, code: bruto?.code, message: bruto?.message?.replace(/\s*\[\d{3}\]$/, "") };
  if (err?.code === "functions/unavailable" || err?.code === "unavailable") {
    return err.message && !/^unavailable$/i.test(err.message) ? err.message : "Sem conexão com o servidor. Tente de novo.";
  }
  if (err?.code === "permission-denied" || err?.code === "functions/permission-denied") {
    return err.message && !/Missing or insufficient/i.test(err.message) ? err.message : "Você não tem permissão para isso.";
  }
  if (err?.code === "functions/internal" && (!err.message || err.message === "internal")) return "Erro inesperado. Tente novamente.";
  return err?.message?.replace(/^Firebase: /, "") || "Algo deu errado. Tente novamente.";
}

export interface DadosPessoa {
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
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
    { uid: string; linkDefinirSenha: string }
  >("convidarMembro"),
  atualizarMembro: chamar<
    { tid: string; uid: string; papel?: Papel; sedeId?: string | null; ativo?: boolean },
    { ok: boolean }
  >("atualizarMembro"),
  validarEntrada: chamar<
    { tid: string; eventoId: string; qr?: string; cpf?: string; confirmar?: boolean },
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
  >("validarEntrada"),

  // ── Plataforma ───────────────────────────────────────
  reivindicarPlataforma: chamar<Record<string, never>, { ok: boolean }>("reivindicarPlataforma"),
  criarTorcida: chamar<
    { nome: string; slug: string; diretor: { nome: string; email: string }; nomeSedePrincipal?: string; mensalidadeSaas?: number },
    { torcidaId: string; slug: string; linkDefinirSenha: string }
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
        pagamentos: { configurado: boolean; ambiente: "teste" | "producao" | null; webhookRecebidoEm: number | null };
        geral: Stats;
        mes: Stats;
        mensalidadeSaas: number;
        chamadosAbertos: number;
      }[];
      historico: Stats[];
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
