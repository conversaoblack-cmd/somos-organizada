/**
 * Páginas do painel da torcida (/{slug}/admin) para onde o robô do botão de ajuda pode levar a diretoria ou a subsede,
 * já abrindo o passo a passo da página (?tour=). Usado pelo SuporteFlutuante e pelo editor da FAQ (campo "destino").
 *
 * Quem pode o quê segue as rotas do PainelDiretoria: o que lá é soDiretoria aqui também é; Recebimentos é só da subsede.
 * O id do tour vem de idTour (admin-* para diretoria, subsede-* para subsede) e precisa existir em modulos/admin/tours.ts.
 */
import { idTour } from "@/modulos/admin/idTour";
import { normalizar, parecidas, radical, tokens } from "./faqBusca";

export type PapelPainel = "diretoria" | "subsede";

export interface DestinoPainel {
  /** Estável: fica gravado nas FAQs (Faq.destino). */
  id: string;
  rotulo: string;
  /** Relativo a /{slug}/admin (pode ter ?). */
  caminho: string;
  /** Página do tour (idTour(pagina, papel)). */
  pagina: string;
  /** Quem enxerga a página no painel. */
  papeis: PapelPainel[];
  /** Palavra solta vale 3 (parecida, 2); com espaço é um conjunto: todas precisam aparecer e vale 3 por palavra. */
  palavrasChave: string[];
}

const TODOS: PapelPainel[] = ["diretoria", "subsede"];
const DIRETORIA: PapelPainel[] = ["diretoria"];

// A ordem desempata: o primeiro da lista ganha (ex.: "evento" sozinho vai para Eventos, não para Novo evento).
export const DESTINOS_PAINEL: DestinoPainel[] = [
  {
    id: "primeiros-passos",
    rotulo: "Primeiros passos",
    caminho: "primeiros-passos",
    pagina: "primeiros-passos",
    papeis: TODOS,
    palavrasChave: ["primeiros passos", "por onde comeco", "por onde comecar", "o que falta", "checklist", "comecar"],
  },
  {
    id: "pagamentos",
    rotulo: "Pagamentos",
    caminho: "pagamentos",
    pagina: "pagamentos",
    papeis: DIRETORIA,
    palavrasChave: ["pagarme", "pagar me", "webhook", "chave", "gateway", "pagamento", "modo demonstracao", "split", "divisao"],
  },
  {
    id: "eventos",
    rotulo: "Eventos",
    caminho: "eventos",
    pagina: "eventos",
    papeis: TODOS,
    palavrasChave: ["evento", "caravana", "excursao", "viagem", "onibus", "festa", "publicar evento", "aprovar evento"],
  },
  {
    id: "novo-evento",
    rotulo: "Novo evento",
    caminho: "eventos?novo=1",
    pagina: "eventos-criar",
    papeis: TODOS,
    palavrasChave: ["novo evento", "criar evento", "crio evento", "cadastrar evento", "cadastro evento", "adicionar evento", "montar evento", "criar caravana"],
  },
  {
    id: "planos",
    rotulo: "Planos de sócio",
    caminho: "planos",
    pagina: "planos",
    papeis: DIRETORIA,
    palavrasChave: ["plano socio", "criar plano", "valor mensalidade", "mensalidade socio", "beneficio"],
  },
  {
    id: "socios",
    rotulo: "Sócios",
    caminho: "socios",
    pagina: "socios",
    papeis: DIRETORIA,
    palavrasChave: ["socio", "associado", "matricula", "carteirinha", "inadimplente", "aprovar socio"],
  },
  {
    id: "personalizacao",
    rotulo: "Personalizar página",
    caminho: "personalizacao",
    pagina: "personalizacao",
    papeis: DIRETORIA,
    palavrasChave: ["personalizar", "cor", "cores", "escudo", "logo", "banner", "tema", "aparencia", "pagina torcida", "historia"],
  },
  {
    id: "publicar",
    rotulo: "Publicar site",
    caminho: "publicar",
    pagina: "publicar",
    papeis: DIRETORIA,
    palavrasChave: ["publicar", "publicar site", "colocar no ar", "site no ar", "tirar do ar", "lancar site"],
  },
  {
    id: "sedes",
    rotulo: "Sedes",
    caminho: "sedes",
    pagina: "sedes",
    papeis: DIRETORIA,
    palavrasChave: ["sede", "subsede", "nucleo", "filial", "criar subsede"],
  },
  {
    id: "usuarios",
    rotulo: "Usuários do painel",
    caminho: "usuarios",
    pagina: "usuarios",
    papeis: DIRETORIA,
    palavrasChave: ["usuario", "convidar", "convite", "acesso painel", "permissao", "diretor", "bloquear acesso"],
  },
  {
    id: "portaria",
    rotulo: "Portaria",
    caminho: "portaria",
    pagina: "portaria",
    papeis: DIRETORIA,
    palavrasChave: ["portaria", "porteiro", "leitor", "catraca", "ler qr", "validar ingresso", "convidar porteiro", "entrada evento"],
  },
  {
    id: "financeiro",
    rotulo: "Financeiro",
    caminho: "financeiro",
    pagina: "financeiro",
    papeis: TODOS,
    palavrasChave: ["financeiro", "repasse", "repasse subsede", "repassar subsede", "saldo", "extrato", "dinheiro", "receita", "prestacao conta", "caixa"],
  },
  {
    id: "recebimentos",
    rotulo: "Recebimentos",
    caminho: "recebimentos",
    pagina: "recebimentos",
    papeis: ["subsede"],
    palavrasChave: ["recebimento", "conta recebimento", "conta bancaria", "prova vida", "selfie", "kyc", "receber dinheiro"],
  },
  {
    id: "pedidos",
    rotulo: "Pedidos e ingressos",
    caminho: "pedidos",
    pagina: "pedidos",
    papeis: TODOS,
    palavrasChave: ["pedido", "ingresso", "venda", "vendido", "comprador", "quem comprou", "reenviar ingresso", "estorno", "reembolso"],
  },
  {
    id: "plano",
    rotulo: "Plano Somos Organizada",
    caminho: "plano",
    pagina: "plano-somos",
    papeis: DIRETORIA,
    palavrasChave: ["fatura", "plano somos", "mensalidade somos", "assinatura somos", "trocar plano", "mudar plano", "limite plano", "pagar fatura"],
  },
  {
    id: "dominio",
    rotulo: "Domínio",
    caminho: "dominio",
    pagina: "dominio",
    papeis: DIRETORIA,
    palavrasChave: ["dominio", "endereco site", "link site", "url", "com br"],
  },
];

export const destinoPorId = (id: string | undefined | null): DestinoPainel | null =>
  (id && DESTINOS_PAINEL.find((d) => d.id === id)) || null;

/** O destino existe para este papel (subsede não vê Sócios, Pagamentos, Sedes...). */
export const destinoPermitido = (d: DestinoPainel | null, papel: PapelPainel | null): d is DestinoPainel => !!d && !!papel && d.papeis.includes(papel);

/** Pontos mínimos para o robô sugerir um destino só pelo texto (uma palavra-chave inteira). */
export const PONTUACAO_DESTINO = 3;

function pontosDestino(d: DestinoPainel, toks: string[]): number {
  let pontos = 0;
  for (const chave of d.palavrasChave) {
    const partes = normalizar(chave).split(" ").filter(Boolean).map(radical);
    if (!partes.length) continue;
    if (partes.length === 1) {
      const r = partes[0]!;
      if (toks.includes(r)) pontos += 3;
      else if (toks.some((t) => parecidas(t, r))) pontos += 2;
      continue;
    }
    // Conjunto: só conta se todas as palavras (fora "de", "no"...) aparecem; quanto mais específico, mais vale.
    const uteis = partes.filter((p) => tokens(p).length > 0);
    if (uteis.length && uteis.every((p) => toks.some((t) => parecidas(t, p)))) pontos += 3 * uteis.length;
  }
  return pontos;
}

/** Destino do painel que mais combina com o texto (só os que o papel enxerga), ou null se nenhum combina forte. */
export function buscarDestino(texto: string, papel: PapelPainel): DestinoPainel | null {
  const toks = tokens(texto);
  if (!toks.length) return null;
  let melhor: DestinoPainel | null = null;
  let maior = 0;
  for (const d of DESTINOS_PAINEL) {
    if (!d.papeis.includes(papel)) continue;
    const p = pontosDestino(d, toks);
    if (p > maior) {
      maior = p;
      melhor = d;
    }
  }
  return maior >= PONTUACAO_DESTINO ? melhor : null;
}

/** /{slug}/admin/{caminho} com ?tour= (ou &tour= quando o caminho já tem ?). */
export function linkDestino(d: DestinoPainel, slug: string, papel: PapelPainel, opcoes: { publicada?: boolean } = {}): string {
  // Site já no ar: a página Publicar mostra os links (tour "publicado") em vez da lista do que falta
  const pagina = d.id === "publicar" && opcoes.publicada && papel === "diretoria" ? "publicado" : d.pagina;
  const sep = d.caminho.includes("?") ? "&" : "?";
  return `/${slug}/admin/${d.caminho}${sep}tour=${encodeURIComponent(idTour(pagina, papel))}`;
}
