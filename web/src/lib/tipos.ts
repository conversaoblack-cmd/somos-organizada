/** Espelho dos documentos do Firestore (ver functions/src/dominio/tipos.ts). Valores em centavos. */
import type { Timestamp } from "firebase/firestore";

export type ComId<T> = T & { id: string };

export interface Tema {
  corPrimaria: string;
  corSecundaria: string;
  corFundo: string;
  corTexto: string;
  logoUrl?: string;
  bannerUrl?: string;
}

export type StatusTorcida = "implantacao" | "ativa" | "suspensa";

export interface Torcida {
  nome: string;
  slug: string;
  status: StatusTorcida;
  taxaServicoPct: number;
  aprovacaoManualSocio: boolean;
  destinoMensalidade: "sede_do_socio" | "principal";
  sedePrincipalId: string;
  tema: Tema;
  textos?: { titulo?: string; subtitulo?: string; sobre?: string };
  contato?: { whatsapp?: string; email?: string; instagram?: string };
  pagamentos: {
    configurado: boolean;
    ambiente?: "teste" | "producao";
    chavePublica?: string;
    pix: boolean;
    cartao: boolean;
    descritorFatura?: string;
    webhookRecebidoEm?: Timestamp;
  };
}

export interface Sede {
  nome: string;
  tipo: "principal" | "subsede";
  ativa: boolean;
  ordem?: number;
  cidade?: string;
  bairro?: string;
  endereco?: string;
  responsavel?: string;
}

export type Intervalo = "mes" | "ano";

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
  destaque?: boolean;
  ordem?: number;
}

export type StatusEvento = "rascunho" | "publicado" | "encerrado" | "cancelado";

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
  entradas?: number;
  limitePorPedido?: number;
  vendaAte?: Timestamp | null;
  status: StatusEvento;
}

export type StatusSocio = "pendente_pagamento" | "em_analise" | "ativo" | "inadimplente" | "suspenso" | "cancelado";

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
}

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
  pagarme?: { subscriptionId?: string; cartaoFinal?: string; cartaoBandeira?: string };
  cobranca?: { valorBase: number; taxa: number };
  historico?: { acao: string; por: string; em: Timestamp; de: StatusSocio; para: StatusSocio }[];
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
  eventoId?: string;
  eventoNome?: string;
  itens?: { tipo: "socio" | "publico"; valorBase: number; titularNome: string; titularCpf: string }[];
  ingressoIds?: string[];
  chaveAcesso?: string;
  socioUid?: string;
  planoId?: string;
  renovacao?: boolean;
  pagarme?: { orderId?: string; chargeId?: string | null };
  pix?: { qrCode: string; qrCodeUrl?: string; expiraEm: Timestamp };
  expiraEm?: Timestamp;
  criadoEm: Timestamp;
  pagoEm?: Timestamp;
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
  codigo: string;
  qr: string;
  valorBase: number;
  status: "valido" | "usado" | "cancelado";
  usadoEm?: Timestamp;
  criadoEm: Timestamp;
}

export type Papel = "diretoria" | "subsede" | "portaria";

export interface Membro {
  uid: string;
  nome: string;
  email: string;
  papel: Papel;
  sedeId?: string;
  ativo: boolean;
}

export interface Lancamento {
  origem: "ingresso" | "socio";
  referencia: string;
  sedeId: string;
  natureza: "base" | "taxa";
  valor: number;
  competencia: string;
  descricao: string;
  criadoEm: Timestamp;
}

export interface Repasse {
  sedeId: string;
  valor: number;
  competencia?: string;
  observacao?: string;
  comprovanteUrl?: string;
  status: "registrado";
  registradoPor: string;
  criadoEm: Timestamp;
}

/** stats/geral e stats/{AAAA-MM} */
export interface Stats {
  mes?: string;
  ingressosQtd?: number;
  receitaIngressos?: number;
  receitaSocios?: number;
  taxaServico?: number;
  pedidosPagos?: number;
  novosSocios?: number;
  estornos?: number;
  socios?: Partial<Record<StatusSocio, number>>;
}

export interface Chamado {
  uid: string;
  nome: string;
  email: string;
  torcidaId: string | null;
  torcidaNome?: string | null;
  papel?: string | null;
  assunto: string;
  status: "aberto" | "respondido" | "resolvido";
  diagnostico?: Record<string, unknown>;
  naoLidasPlataforma?: number;
  criadoEm: Timestamp;
  atualizadoEm: Timestamp;
}

export interface MensagemSuporte {
  autor: "usuario" | "plataforma";
  texto: string;
  nome?: string;
  criadoEm: Timestamp;
}

export interface Faq {
  pergunta: string;
  resposta: string;
  palavrasChave?: string[];
  publico?: "torcedor" | "diretoria" | "todos";
  ordem?: number;
}
