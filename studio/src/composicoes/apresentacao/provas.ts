/**
 * Provas das cenas de produto (direção v2): o recorte EXATO da tela real que sobe do celular, em pixels reais
 * (capturas 1170×2532, regiões medidas sobre grade de 100 px em 15/10/2026). Cartão inteiro ou saída em degradê.
 */
export type Prova = {
  tela: string;
  regiao: {x: number; y: number; w: number; h: number};
  /** saída em degradê quando o cartão continua além do recorte (nunca corte seco) */
  degradeBase?: boolean;
  degradeDireita?: boolean;
  /** andar: 'baixo' = caixa 660×535 (x 120–780, y 545–1080); 'alto' = 840×280 (x 120–960, y 560–840) */
  andar: 'baixo' | 'alto';
  /** teto de escala (ex.: LIBERADO: tela toda verde do produto fica contida) */
  escalaMax?: number;
  /** linha a destacar (y relativo à região, em px da captura) com foco arredondado */
  destaque?: {y: number; h: number; de: number; ate: number; forca?: number; contorno?: string};
  /** anel sólido de luz em volta do recorte, em px (barrado: o bloqueio domina pela luz vermelha) */
  anel?: number;
};

export const PROVAS = {
  socio: {tela: 'carteirinha-em-dia.png', regiao: {x: 48, y: 1266, w: 1074, h: 310}, andar: 'alto'}, // cartão na largura toda: a frase não corta no meio
  ingresso: {tela: 'ingresso-qr.png', regiao: {x: 72, y: 1797, w: 640, h: 369}, degradeDireita: true, andar: 'baixo'},
  liberado: {tela: 'portaria-liberado-rafael.png', regiao: {x: 60, y: 560, w: 1050, h: 990}, andar: 'baixo', escalaMax: 0.42},
  barrado: {tela: 'portaria-ja-utilizado-rafael.png', regiao: {x: 60, y: 520, w: 1050, h: 680}, andar: 'baixo', anel: 10},
  dinheiro: {tela: 'recebimentos-2.png', regiao: {x: 150, y: 650, w: 870, h: 720}, andar: 'baixo'},
  taxaCompra: {tela: 'compra-1.png', regiao: {x: 150, y: 2208, w: 870, h: 300}, andar: 'alto', destaque: {y: 92, h: 62, de: 24, ate: 100, forca: 0.4}}, // linhas medidas em pixel: Ingresso 2229, Taxa 2312–2350, Total 2445–2485
  evento: {tela: 'evento.png', regiao: {x: 40, y: 1398, w: 1090, h: 324}, andar: 'alto'},
  // 1º lançamento inteiro (ícone, "Ingressos · Caravana para a Final", R$ 120,00, "+ R$ 12,00 de taxa"): 0,78×, sem cortar linha
  planilha: {tela: 'financeiro-planilha.png', regiao: {x: 48, y: 1380, w: 1074, h: 300}, andar: 'alto'},
  // o próprio sistema da diretoria escrevendo a taxa: campo "R$ 130,00" e "Torcedor paga R$ 143,00 (inclui 10% de taxa)"
  // (print 26,26 s de captura/diretoria-evento.json; a linha vai de x 76 a 794 → recorte de 747 px = 1,12× ≈ 40 px)
  taxa: {
    tela: 'novo-evento-valores.png',
    regiao: {x: 60, y: 1160, w: 747, h: 244},
    andar: 'alto',
    destaque: {y: 170, h: 50, de: 34, ate: 128, forca: 0.35, contorno: '#FFCC00'},
  },
} satisfies Record<string, Prova>;
