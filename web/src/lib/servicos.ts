import type { Endereco } from "./tipos";
import { soDigitos } from "./formatos";
import { registrarErro } from "./erros";

/**
 * Prazo para um fetch. AbortSignal.timeout não existe no iOS 15 (iPhone 6s/7/SE presos nele), Chrome < 103 e
 * Samsung Internet antigo: lá ele dá TypeError e o pagamento com cartão falhava sempre como "sem internet".
 */
export function prazo(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) return AbortSignal.timeout(ms); // compatibilidade-ok: testado antes
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** Busca de endereço pelo CEP (ViaCEP). */
export async function buscarCep(cep: string): Promise<Partial<Endereco> | null> {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: prazo(6000) });
    const j = await r.json();
    if (j.erro) return null;
    return { cep: d, logradouro: j.logradouro ?? "", bairro: j.bairro ?? "", cidade: j.localidade ?? "", uf: j.uf ?? "" };
  } catch {
    return null;
  }
}

export interface CartaoDigitado {
  numero: string;
  nome: string;
  validade: string; // MM/AA
  cvv: string;
}

const MSG_SEM_INTERNET = "Sem internet. Confira a conexão e toque de novo.";
const MSG_CARTAO_RECUSADO = "Confira número, validade e código (CVV) do cartão, ou pague no Pix.";
const MSG_CARTAO_INDISPONIVEL = "O pagamento com cartão está indisponível nesta torcida agora. Pague no Pix.";
const MSG_CARTAO_INSTAVEL = "Não conseguimos conferir o cartão agora. Toque de novo em instantes ou pague no Pix.";

/** Erro com `code` para o `mensagemDeErro` e o `ehErroDeConexao` (lib/api) tratarem como os do Firebase. */
function erroCartao(mensagem: string, code: string) {
  return Object.assign(new Error(mensagem), { code });
}

const URL_TOKENS = import.meta.env.VITE_PAGARME_TOKENS_URL || "https://api.pagar.me/core/v5/tokens";

/**
 * Tokeniza o cartão direto na Pagar.me com a chave PÚBLICA da torcida.
 * O número do cartão nunca passa pelos nossos servidores.
 * Exige o domínio do app cadastrado no painel da Pagar.me da torcida.
 */
export async function tokenizarCartao(chavePublica: string, c: CartaoDigitado): Promise<string> {
  // Modo demonstração: nada sai do navegador. Segue o simulador oficial da Pagar.me:
  // 4000000000000010 aprova; qualquer outro número é recusado (ex.: 4000000000000028).
  if (chavePublica.startsWith("pk_demo_")) {
    const n = soDigitos(c.numero);
    return `tok_demo_${n === "4000000000000010" ? "aprovado" : "recusado"}_${n.slice(-4)}`;
  }
  const [mes, ano] = c.validade.split("/");
  let r: Response;
  try {
    r = await fetch(`${URL_TOKENS}?appId=${encodeURIComponent(chavePublica)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: prazo(20_000),
      body: JSON.stringify({
        type: "card",
        card: {
          number: soDigitos(c.numero),
          holder_name: c.nome.trim().toUpperCase(),
          exp_month: Number(mes),
          exp_year: Number(ano?.length === 2 ? `20${ano}` : ano),
          cvv: soDigitos(c.cvv),
        },
      }),
    });
  } catch {
    // Sem sinal, sinal fraco ou demora demais: nunca "Failed to fetch" na tela
    throw erroCartao(MSG_SEM_INTERNET, "unavailable");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) {
    // A Pagar.me responde em inglês: não repassamos o texto dela ao torcedor
    if (r.status >= 500 || r.status === 429) throw erroCartao(MSG_CARTAO_INSTAVEL, "unavailable");
    if (r.status === 401 || r.status === 403) {
      // Chave pública errada ou domínio do site não cadastrado na Pagar.me da torcida: não é culpa do cartão.
      // Todas as vendas no cartão desta torcida falham até a diretoria corrigir: registra para a equipe ver.
      registrarErro(new Error(`Tokenização do cartão recusada pela Pagar.me (${r.status}): chave pública ou domínio não cadastrado`), "cartao");
      throw erroCartao(MSG_CARTAO_INDISPONIVEL, "failed-precondition");
    }
    throw erroCartao(MSG_CARTAO_RECUSADO, "invalid-argument");
  }
  return j.id as string;
}

export function bandeiraCartao(numero: string): string | null {
  const n = soDigitos(numero);
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(n)) return "Elo";
  if (/^(606282|3841)/.test(n)) return "Hipercard";
  return null;
}

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
