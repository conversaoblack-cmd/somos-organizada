/**
 * Script da página inicial (pequeno de propósito: a página já chega pronta em HTML).
 * Só a calculadora da taxa de serviço. Os valores dos planos estão fora do site por enquanto (decisão do dono).
 */
import "../index.css";
import { CALCULO_INICIAL, calcularTaxa, reais } from "./calculo";

const form = document.querySelector<HTMLFormElement>("[data-calculadora]");
function recalcular() {
  if (!form) return;
  const ler = (k: keyof typeof CALCULO_INICIAL) => {
    const v = Number((form.elements.namedItem(k) as HTMLInputElement | null)?.value);
    return Number.isFinite(v) && v > 0 ? Math.min(v, 100000) : 0;
  };
  const taxa = calcularTaxa({ socios: ler("socios"), mensalidade: ler("mensalidade"), ingressos: ler("ingressos"), preco: ler("preco") });
  const el = form.querySelector('[data-calc="taxa"]');
  if (el) el.textContent = reais(taxa);
}
form?.addEventListener("input", recalcular);
form?.addEventListener("submit", (e) => e.preventDefault());
