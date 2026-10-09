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
  /** Site no ar. Antes disso só a equipe da torcida vê a página (e pode fazer compras de teste). */
  publicada?: boolean;
  /** Módulos ligados. Ausente = ligado. */
  modulos?: { eventos?: boolean; socios?: boolean };
  /** Mensalidade da plataforma em atraso (> 7 dias): site e vendas fora do ar. */
  bloqueioSaas?: boolean;
  suspensaPor?: "saas" | string;
  taxaServicoPct: number;
  aprovacaoManualSocio: boolean;
  destinoMensalidade: "sede_do_socio" | "principal";
  sedePrincipalId: string;
  tema: Tema;
  textos?: { titulo?: string; subtitulo?: string; sobre?: string };
  contato?: { whatsapp?: string; email?: string; instagram?: string };
  pagamentos: {
    configurado: boolean;
    ambiente?: "teste" | "producao" | "demo";
    chavePublica?: string;
    pix: boolean;
    cartao: boolean;
    descritorFatura?: string;
    webhookRecebidoEm?: Timestamp;
    /** Recebedor (rp_...) da conta da torcida; com split ativo, vendas de subsede são divididas. */
    recebedorPrincipalId?: string;
    splitAtivo?: boolean;
  };
}

/** Conta de recebimento da subsede na Pagar.me (gravada só pelo servidor). */
/** Situação pública da conta de recebimento (fica na sede). */
export interface RecebedorPublico {
  id: string;
  /** registration | affiliation | active | refused | suspended | blocked | inactive */
  status: string;
  kycStatus?: string | null;
  atualizadoEm?: Timestamp;
}

/** Dados completos: sedes/{id}/privado/recebedor, visíveis só para o usuário da própria subsede. */
export interface RecebedorSede extends RecebedorPublico {
  nomeTitular?: string;
  documentoMascarado?: string;
  banco?: { codigo: string; agencia: string; conta: string };
  kycUrl?: string | null;
  kycExpiraEm?: string | null;
  cadastradoPor?: string;
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
  recebedor?: RecebedorPublico;
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

export type StatusEvento = "rascunho" | "em_aprovacao" | "publicado" | "encerrado" | "cancelado";

export interface Evento {
  nome: string;
  /** Código curto do link direto (/{torcida}/e/{codigo}); eventos antigos podem não ter. */
  codigo?: string;
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
  pagarme?: { customerId?: string; cardId?: string; subscriptionId?: string; cartaoFinal?: string; cartaoBandeira?: string };
  ultimaFalhaCobranca?: Timestamp;
  motivoFalhaCobranca?: string;
  /** Recusa definitiva no cartão: a cobrança automática para até o sócio trocar o cartão. */
  cobrancaCartaoPausada?: boolean;
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
  liquidacao?: "split" | "torcida";
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
  titularUid?: string;
  codigo: string;
  qr: string;
  /** Só no aparelho: ingresso que outra pessoa comprou no CPF do sócio. O QR e o código ficam com quem comprou. */
  soTitular?: boolean;
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
  /** split = já caiu direto na conta da subsede; torcida = caiu na conta da torcida (entra no repasse). */
  liquidacao?: "split" | "torcida";
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

export type PlanoSaas = "pequena" | "grande" | "gigante";

/** plataforma/publico */
export interface ConfigPlataforma {
  planos?: Partial<Record<PlanoSaas, { nome?: string; valor?: number }>>;
  limiteGigante?: number;
  pix?: { chave?: string; nome?: string; cidade?: string };
}

/** torcidas/{tid}/saas/assinatura */
export interface AssinaturaSaas {
  plano: "pequena" | "grande";
  diaVencimento: number;
  proximoVencimento: Timestamp;
  situacao: "em_dia" | "aberta" | "atrasada" | "bloqueada";
  faturaAbertaId?: string | null;
  criadaEm: Timestamp;
}

/** torcidas/{tid}/faturasSaas/{AAAA-MM-DD} */
export interface FaturaSaas {
  competencia: string;
  plano: PlanoSaas;
  valor: number;
  sociosAtivos: number;
  vencimento: Timestamp;
  status: "aberta" | "paga" | "cancelada";
  pixCopiaECola: string | null;
  txid: string;
  criadaEm: Timestamp;
  informadoPagamentoEm?: Timestamp;
  pagaEm?: Timestamp;
}

/** solicitacoes/{id} — cadastro de torcida feito pela página principal */
export interface SolicitacaoTorcida {
  uid: string;
  email: string;
  status: "pendente" | "aprovada" | "recusada";
  nomeTorcida: string;
  slug: string;
  clube?: string;
  estimativaSocios?: number;
  quantidadeSubsedes?: number;
  tema?: Pick<Tema, "corPrimaria" | "corSecundaria" | "corFundo" | "corTexto">;
  responsavel: { nome: string; cpf: string; telefone: string; cargo: string };
  entidade: { tipo: "cnpj" | "sem_cnpj"; cnpj?: string; razaoSocial?: string; emailFinanceiro: string };
  endereco: Endereco;
  motivo?: string;
  torcidaId?: string;
  criadoEm: Timestamp;
}

/** Valores padrão (o servidor usa plataforma/publico quando houver). Centavos. */
export const PLANOS_SAAS_PADRAO: Record<PlanoSaas, { nome: string; valor: number; descricao: string }> = {
  pequena: { nome: "Torcida pequena", valor: 50000, descricao: "Para torcidas em crescimento." },
  grande: { nome: "Torcida grande", valor: 100000, descricao: "Para torcidas com várias subsedes." },
  gigante: { nome: "Torcida gigante", valor: 150000, descricao: "Automático acima de 3.000 sócios ativos." },
};
