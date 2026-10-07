import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { api, mensagemDeErro } from "@/lib/api";
import type { Socio } from "@/lib/tipos";
import { useToast } from "@/ui";

/**
 * Gera (ou reabre) a cobrança Pix da mensalidade e leva para a página do pedido.
 * Com `usarAberta`, vai direto para a cobrança já aberta, sem chamar o servidor.
 */
export function usePagarMensalidade(tid: string, slug: string, ficha: Pick<Socio, "cobrancaAbertaId"> | null) {
  const navegar = useNavigate();
  const avisar = useToast();
  const [carregando, setCarregando] = useState(false);
  const pagar = useCallback(
    async (usarAberta = false) => {
      if (usarAberta && ficha?.cobrancaAbertaId) {
        navegar(`/${slug}/pedido/${ficha.cobrancaAbertaId}`);
        return;
      }
      setCarregando(true);
      try {
        const r = await api.pagarMensalidade({ tid });
        navegar(`/${slug}/pedido/${r.pedidoId}`);
      } catch (e) {
        avisar(mensagemDeErro(e), "erro");
      } finally {
        setCarregando(false);
      }
    },
    [tid, slug, ficha?.cobrancaAbertaId, navegar, avisar],
  );
  return { pagar, carregando };
}

/** QR assinado da carteirinha (cacheado por sessão para virar o cartão na hora). */
const cacheQr = new Map<string, string>();
export async function buscarQrCarteirinha(tid: string, uid: string): Promise<string> {
  const chave = `${tid}/${uid}`;
  const emCache = cacheQr.get(chave);
  if (emCache) return emCache;
  const { qr } = await api.minhaCarteirinha({ tid });
  cacheQr.set(chave, qr);
  return qr;
}
