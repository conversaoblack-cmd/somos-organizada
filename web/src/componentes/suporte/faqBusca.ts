/**
 * Robô de respostas do suporte: pontua as perguntas frequentes (coleção `faq`) contra o que a pessoa digitou.
 * Usado pelo widget flutuante e pelo testador da plataforma — o mesmo algoritmo nos dois lugares.
 */
import type { ComId, Faq } from "@/lib/tipos";

export type PublicoFaq = "torcedor" | "diretoria";

const PARADAS = new Set(
  (
    "a o e é os as um uma uns umas de da do das dos em no na nos nas por pra pro para com sem que se " +
    "como meu minha meus minhas seu sua eu voce você vc ele ela isso esse essa este esta aqui ai la " +
    "qual quais quando onde quem ao aos me mim te ja já mais muito tem ter tenho ta está esta estou " +
    "foi ser sou faço faco fazer posso pode consigo quero queria preciso gostaria oi ola olá bom boa dia tarde noite obrigado"
  ).split(/\s+/),
);

/** minúsculas, sem acento, só letras/números/%. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

/** Plural simples → singular ("ingressos" → "ingresso"). */
const radical = (t: string) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t);

export function tokens(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !PARADAS.has(t))
    .map(radical);
}

function prefixoComum(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** "recebo" ≈ "receber", "transferir" ≈ "transferido", "pix" = "pix". */
function parecidas(a: string, b: string): boolean {
  if (a === b) return true;
  const menor = Math.min(a.length, b.length);
  if (menor >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return menor >= 5 && prefixoComum(a, b) >= 5;
}

export function faqParaPublico(f: Faq, publico: PublicoFaq) {
  return !f.publico || f.publico === "todos" || f.publico === publico;
}

export interface Pontuacao<T extends Faq = Faq> {
  faq: T;
  pontos: number;
  motivos: string[];
}

export const PONTUACAO_MINIMA = 2;

export function pontuar<T extends Faq>(faq: T, pergunta: string): Pontuacao<T> {
  const texto = ` ${normalizar(pergunta)} `;
  const toks = tokens(pergunta);
  let pontos = 0;
  const motivos: string[] = [];

  for (const chave of faq.palavrasChave ?? []) {
    const n = normalizar(chave);
    if (!n) continue;
    if (n.includes(" ")) {
      if (texto.includes(` ${n} `)) {
        pontos += 3;
        motivos.push(`palavra-chave "${chave}"`);
      }
      continue;
    }
    const r = radical(n);
    if (toks.includes(r)) {
      pontos += 3;
      motivos.push(`palavra-chave "${chave}"`);
    } else if (toks.some((t) => parecidas(t, r))) {
      pontos += 2;
      motivos.push(`parecida com "${chave}"`);
    }
  }

  const daPergunta = new Set(tokens(faq.pergunta));
  for (const t of new Set(toks)) {
    if (daPergunta.has(t)) {
      pontos += 1;
      motivos.push(`"${t}" na pergunta`);
    } else if ([...daPergunta].some((p) => parecidas(p, t))) {
      pontos += 0.5;
    }
  }

  const daResposta = new Set(tokens(faq.resposta));
  let extra = 0;
  for (const t of new Set(toks)) if (daResposta.has(t)) extra += 0.25;
  pontos += Math.min(extra, 1);

  return { faq, pontos: Math.round(pontos * 100) / 100, motivos };
}

/** Todas as FAQs do público, da mais para a menos relevante (só as que passaram da pontuação mínima). */
export function buscarFaq<T extends Faq>(faqs: T[], pergunta: string, publico: PublicoFaq): Pontuacao<T>[] {
  if (!tokens(pergunta).length) return [];
  return faqs
    .filter((f) => faqParaPublico(f, publico))
    .map((f) => pontuar(f, pergunta))
    .filter((p) => p.pontos >= PONTUACAO_MINIMA)
    .sort((a, b) => b.pontos - a.pontos || (a.faq.ordem ?? 99) - (b.faq.ordem ?? 99));
}

/** Respostas embutidas: usadas se a coleção `faq` estiver vazia ou indisponível. */
export const FAQ_EMBUTIDAS: ComId<Faq>[] = [
  {
    id: "embutida-ingresso",
    pergunta: "Como recebo meu ingresso?",
    resposta:
      "Assim que o pagamento é confirmado, os ingressos aparecem na tela com QR Code e você recebe um link para abri-los em qualquer aparelho. Guarde o link ou tire um print do QR.",
    palavrasChave: ["ingresso", "receber", "qr", "link"],
    publico: "torcedor",
    ordem: 1,
  },
  {
    id: "embutida-pix",
    pergunta: "Quanto tempo o Pix leva para confirmar?",
    resposta: 'Normalmente poucos segundos. Se demorar, toque em "Já paguei" na tela do pedido para conferirmos na hora.',
    palavrasChave: ["pix", "demora", "confirmar", "pagamento"],
    publico: "torcedor",
    ordem: 2,
  },
  {
    id: "embutida-socio",
    pergunta: "Sou sócio, como pago o preço de sócio no ingresso?",
    resposta: "Entre na sua conta de sócio antes de comprar. Com a mensalidade em dia, o ingresso no seu nome sai com o preço de sócio.",
    palavrasChave: ["sócio", "desconto", "preço"],
    publico: "torcedor",
    ordem: 3,
  },
  {
    id: "embutida-recusado",
    pergunta: "O cartão foi recusado. O que fazer?",
    resposta: "A recusa vem do banco emissor. Confira os dados e o limite do cartão ou pague com Pix.",
    palavrasChave: ["recusado", "cartão", "negado"],
    publico: "todos",
    ordem: 4,
  },
  {
    id: "embutida-webhook",
    pergunta: "Como configuro a Pagar.me e o webhook?",
    resposta:
      "No painel da Pagar.me, copie as chaves em Configurações → Chaves e cole em Pagamentos no painel da diretoria. Depois crie o webhook com a URL mostrada ali.",
    palavrasChave: ["pagarme", "webhook", "chave", "configurar"],
    publico: "diretoria",
    ordem: 5,
  },
];
