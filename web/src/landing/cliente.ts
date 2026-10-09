/**
 * Script da página inicial (pequeno de propósito: a página já chega pronta em HTML).
 * - calculadora da taxa de serviço;
 * - preços atualizados com o que a equipe configurou (plataforma/publico), lidos pela API REST do Firestore.
 */
import "../index.css";
import { CALCULO_INICIAL, calcularTaxa, reais } from "./calculo";
import { PLANOS_SAAS_PADRAO } from "@/lib/tipos";
let valorPro = PLANOS_SAAS_PADRAO.pro.valor;

// Calculadora
const form = document.querySelector<HTMLFormElement>("[data-calculadora]");
function recalcular() {
  if (!form) return;
  const ler = (k: keyof typeof CALCULO_INICIAL) => {
    const v = Number((form.elements.namedItem(k) as HTMLInputElement | null)?.value);
    return Number.isFinite(v) && v > 0 ? Math.min(v, 100000) : 0;
  };
  const taxa = calcularTaxa({ socios: ler("socios"), mensalidade: ler("mensalidade"), ingressos: ler("ingressos"), preco: ler("preco") });
  const saldo = taxa - valorPro;
  const escrever = (k: string, t: string) => {
    const el = form.querySelector(`[data-calc="${k}"]`);
    if (el) el.textContent = t;
  };
  escrever("taxa", reais(taxa));
  escrever("plano", reais(valorPro));
  escrever("saldo", saldo < 0 ? `− ${reais(-saldo)}` : reais(saldo));
}
form?.addEventListener("input", recalcular);
form?.addEventListener("submit", (e) => e.preventDefault());

// Preços configurados pela equipe (só quando há projeto real; batchGet devolve 200 mesmo sem o documento)
const projeto = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
if (projeto && import.meta.env.VITE_USAR_EMULADORES !== "true") {
  const base = `projects/${projeto}/databases/(default)/documents`;
  const carregar = () =>
    fetch(`https://firestore.googleapis.com/v1/${base}:batchGet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: [`${base}/plataforma/publico`] }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { found?: { fields?: Record<string, FirestoreValor> } }[] | null) => {
        const campos = r?.[0]?.found?.fields;
        const planos = campos?.planos?.mapValue?.fields;
        if (!planos) return;
        for (const k of ["pro", "plus", "max"] as const) {
          const v = Number(planos[k]?.mapValue?.fields?.valor?.integerValue ?? planos[k]?.mapValue?.fields?.valor?.doubleValue);
          if (!Number.isInteger(v) || v <= 0) continue;
          const el = document.querySelector(`[data-plano="${k}"]`);
          if (el) el.textContent = reais(v);
          if (k === "pro") valorPro = v;
        }
        recalcular();
      })
      .catch(() => {
        /* sem rede: ficam os valores padrão já impressos na página */
      });
  if ("requestIdleCallback" in window) requestIdleCallback(() => void carregar());
  else setTimeout(() => void carregar(), 1500);
}

interface FirestoreValor {
  integerValue?: string;
  doubleValue?: number;
  mapValue?: { fields?: Record<string, FirestoreValor> };
}
