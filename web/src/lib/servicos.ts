import type { Endereco } from "./tipos";
import { soDigitos } from "./formatos";

/** Busca de endereço pelo CEP (ViaCEP). */
export async function buscarCep(cep: string): Promise<Partial<Endereco> | null> {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(6000) });
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
  const r = await fetch(`${URL_TOKENS}?appId=${encodeURIComponent(chavePublica)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) {
    const detalhe = j?.errors ? Object.values(j.errors as Record<string, string[]>).flat()[0] : j?.message;
    throw new Error(detalhe ? `Cartão inválido: ${detalhe}` : "Não foi possível validar o cartão. Confira os dados.");
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
