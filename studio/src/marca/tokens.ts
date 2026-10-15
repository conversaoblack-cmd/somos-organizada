/**
 * Única fonte de verdade da marca no código do estúdio.
 * Valores de studio/marca/marca.md (que copia web/src/lib/tema.ts e web/src/index.css).
 * Regra da marca: azul e amarelo, SEM verde (verde é cor de rival de muitas torcidas).
 */
export const COR = {
  /** ação e produto: botão, CTA, toque, o que a pessoa faz */
  azul: '#2E6BFF',
  /** o que é da torcida e entra: caixa, dinheiro na conta, destaque da frase-chave */
  amarelo: '#FFCC00',
  /** noite de estádio: base de todas as cenas */
  fundo: '#070A12',
  texto: '#F1F4FA',
  superficie: '#0F131B',
  superficie2: '#171A23',
  superficie3: '#20242D',
  texto2: '#A1A5AC',
  texto3: '#888C93',
  /** o problema: calote, fraude, print falso, dinheiro perdido */
  perigo: '#EF4444',
  /** gradiente do ingresso e da carteirinha */
  ingressoDe: '#2E6BFF',
  ingressoPara: '#1a3a9e',
  /** texto sobre o amarelo */
  sobreAmarelo: '#111111',
} as const;

/** Verde de sucesso: SÓ dentro de tela do produto (status "pago"). Nunca em legenda, título ou marca. */
export const VERDE_SO_DENTRO_DO_PRODUTO = '#22C55E';

/** Semântica usada pela legenda e pelos números: `**palavra**{cor}` no narracao.json. */
export const SEMANTICA = {
  azul: COR.azul,
  amarelo: COR.amarelo,
  perigo: COR.perigo,
  texto: COR.texto,
} as const;
export type CorSemantica = keyof typeof SEMANTICA;

export const FONTE = {
  /** títulos, números de impacto e logotipo, em caixa alta */
  titulo: '"Archivo Black", "Archivo", sans-serif',
  /** corpo e legenda (variável 100 a 900) */
  corpo: '"Archivo", sans-serif',
} as const;

/** Tamanho mínimo de texto a 1080 de largura (seção 6.4). */
export const TEXTO_MINIMO_PX_A_1080 = 44;

/** Orçamento de leitura: palavras × 0,3 s + 0,5 s ("R$ x" conta como 2 palavras). */
export function segundosDeLeitura(texto: string): number {
  const palavras = texto.replace(/R\$\s*/g, 'R$ ').trim().split(/\s+/).filter(Boolean).length;
  return palavras * 0.3 + 0.5;
}

export const MARCA = {
  nome: 'Somos Organizada',
  cta: 'Cadastre sua torcida',
  /** rótulo REAL do botão do site (Landing.tsx:168): o botão desenhado no vídeo usa este */
  botaoSite: 'Cadastrar minha torcida',
  semPorcentagem: 'Plano mensal fixo, sem % das vendas.',
  site: 'somosorganizada.com.br',
  linhaLegal: 'Só paga depois de publicar o site. Teste grátis em modo demonstração.',
  rotuloDemo: 'Torcida Brasil · dados de demonstração',
  /** grade 2×2 do logo, em ordem de leitura */
  grade: [COR.azul, COR.amarelo, COR.amarelo, COR.texto] as const,
} as const;
