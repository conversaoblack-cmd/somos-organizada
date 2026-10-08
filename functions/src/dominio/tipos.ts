import type { Timestamp } from "firebase-admin/firestore";
import type { Endereco } from "../util/validacao";
import type { Intervalo } from "./precos";

export type StatusTorcida = "implantacao" | "ativa" | "suspensa";

export interface Tema {
  corPrimaria: string;
  corSecundaria: string;
  corFundo: string;
  corTexto: string;
  logoUrl?: string;
  bannerUrl?: string;
}

export interface Torcida {
  nome: string;
  slug: string;
  status: StatusTorcida;
  taxaServicoPct: number;
  /** Se true, sócio novo fica "em_analise" após pagar até a diretoria aprovar. */
  aprovacaoManualSocio: boolean;
  /** Para onde vai o valor base da mensalidade no extrato de repasses. */
  destinoMensalidade: "sede_do_socio" | "principal";
  sedePrincipalId: string;
  proximaMatricula: number;
  tema: Tema;
  textos?: { titulo?: string; subtitulo?: string; sobre?: string };
  contato?: { whatsapp?: string; email?: string; instagram?: string };
  pagamentos: {
    configurado: boolean;
    ambiente?: "teste" | "producao" | "demo";
    chavePublica?: string;
    pix: boolean;
    cartao: boolean;
    webhookRecebidoEm?: Timestamp;
    descritorFatura?: string;
    /** Recebedor (rp_...) da conta da torcida. Com ele, vendas de subsede são divididas (split). */
    recebedorPrincipalId?: string;
    splitAtivo?: boolean;
  };
  criadoEm: Timestamp;
}

/** Status do recebedor na Pagar.me: registration, affiliation, active, refused, suspended, blocked, inactive. */
/** Parte pública (fica na sede, que é pública): só o que a página e a diretoria precisam saber. */
export interface RecebedorPublico {
  id: string;
  status: string;
  kycStatus?: string | null;
  atualizadoEm: Timestamp;
}

/** Dados completos: torcidas/{tid}/sedes/{sedeId}/privado/recebedor, visíveis só para a própria subsede. */
export interface RecebedorSede extends RecebedorPublico {
  nomeTitular: string;
  documentoMascarado: string;
  banco: { codigo: string; agencia: string; conta: string };
  kycUrl?: string | null;
  kycExpiraEm?: string | null;
  cadastradoPor: string;
}

export interface Sede {
  nome: string;
  tipo: "principal" | "subsede";
  ativa: boolean;
  recebedor?: RecebedorPublico;
}

export type Liquidacao = "split" | "torcida";

export type StatusEvento = "rascunho" | "em_aprovacao" | "publicado" | "encerrado" | "cancelado";

export interface Evento {
  nome: string;
  descricao?: string;
  sedeId: string;
  data: Timestamp;
  local?: string;
  imagemUrl?: string;
  valorSocio: number;
  valorPublico: number;
  capacidade?: number | null;
  vendidos: number;
  reservados: number;
  limitePorPedido?: number;
  vendaAte?: Timestamp | null;
  status: StatusEvento;
}

export interface Plano {
  nome: string;
  descricao?: string;
  valor: number;
  intervalo: Intervalo;
  intervaloQtd: number;
  beneficios?: string[];
  pix: boolean;
  cartao: boolean;
  ativo: boolean;
  ordem?: number;
}

export type StatusSocio = "pendente_pagamento" | "em_analise" | "ativo" | "inadimplente" | "suspenso" | "cancelado";

export interface Socio {
  uid: string;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  nascimento: string;
  endereco: Endereco;
  fotoPath?: string;
  sedeId: string;
  planoId: string;
  planoNome: string;
  intervalo: Intervalo;
  intervaloQtd: number;
  valorPlano: number;
  metodo: "pix" | "cartao";
  status: StatusSocio;
  matricula?: string;
  validoAte?: Timestamp | null;
  cobrancaAbertaId?: string | null;
  assinaturaCancelada?: boolean;
  /** customerId/cardId: cartão salvo para a cobrança recorrente feita pelo próprio sistema. subscriptionId: legado. */
  pagarme?: { customerId?: string; cardId?: string; subscriptionId?: string; cartaoFinal?: string; cartaoBandeira?: string };
  ultimaFalhaCobranca?: Timestamp;
  motivoFalhaCobranca?: string;
  /** Recusa definitiva no cartão: a cobrança automática para até o sócio trocar o cartão. */
  cobrancaCartaoPausada?: boolean;
  /** Suspenso/cancelado pela diretoria: não volta sozinho pagando. */
  bloqueadoPelaDiretoria?: boolean;
  criadoEm: Timestamp;
  atualizadoEm: Timestamp;
}

export type StatusPedido = "criando" | "aguardando" | "pago" | "falhou" | "expirado" | "cancelado" | "estornado";

export interface Pedido {
  tipo: "ingresso" | "socio";
  uid: string;
  comprador: { nome: string; email: string; cpf: string; telefone: string };
  metodo: "pix" | "cartao";
  valorBase: number;
  taxa: number;
  total: number;
  status: StatusPedido;
  motivo?: string;
  sedeId: string;
  /** ingresso */
  eventoId?: string;
  eventoNome?: string;
  itens?: { tipo: "socio" | "publico"; valorBase: number; titularNome: string; titularCpf: string }[];
  ingressoIds?: string[];
  chaveAcesso?: string;
  /** sócio */
  socioUid?: string;
  planoId?: string;
  /** sócio: retrato do plano no momento da cobrança — o ciclo liberado é o do plano que foi pago */
  plano?: { nome: string; intervalo: Intervalo; intervaloQtd: number; valor: number };
  renovacao?: boolean;
  pagarme?: { orderId?: string; chargeId?: string };
  /** split = valor base caiu direto no recebedor da subsede; torcida = caiu na conta da torcida. */
  liquidacao?: Liquidacao;
  pix?: { qrCode: string; qrCodeUrl?: string; expiraEm: Timestamp };
  expiraEm?: Timestamp;
  criadoEm: Timestamp;
  pagoEm?: Timestamp;
  /** sócio: validade antes e depois deste pagamento (para desfazer em caso de estorno) */
  cicloAnterior?: Timestamp | null;
  cicloNovo?: Timestamp;
}

export interface Ingresso {
  pedidoId: string;
  eventoId: string;
  eventoNome: string;
  eventoData: Timestamp;
  sedeId: string;
  tipo: "socio" | "publico";
  titularNome: string;
  titularCpf: string;
  uid: string;
  /** Sócio titular do ingresso (quando outra pessoa comprou no CPF dele). */
  titularUid?: string;
  codigo: string;
  qr: string;
  valorBase: number;
  status: "valido" | "usado" | "cancelado";
  usadoEm?: Timestamp;
  usadoPor?: string;
  criadoEm: Timestamp;
}
