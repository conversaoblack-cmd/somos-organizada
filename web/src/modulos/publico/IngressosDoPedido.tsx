import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { api, mensagemDeErro } from "@/lib/api";
import { useTorcida } from "@/hooks/torcida";
import { BotaoLink, Carregando, Vazio } from "@/ui";
import { CabecalhoTorcida } from "./comum";
import { Bilhete, type DadosBilhete } from "./Bilhete";

/** Link compartilhável dos ingressos: funciona em qualquer aparelho, sem login. */
export default function IngressosDoPedido() {
  const { pedidoId } = useParams();
  const [params] = useSearchParams();
  const { tid, torcida } = useTorcida();
  const [estado, setEstado] = useState<{ bilhetes?: DadosBilhete[]; evento?: string; erro?: string }>({});

  useEffect(() => {
    const chave = params.get("k");
    if (!pedidoId || !chave) return setEstado({ erro: "Link incompleto." });
    api
      .ingressosDoPedido({ tid, pedidoId, chave })
      .then((r) => setEstado({ evento: r.eventoNome, bilhetes: r.ingressos.map((i) => ({ ...i, eventoData: new Date(i.eventoData) })) }))
      .catch((e) => setEstado({ erro: mensagemDeErro(e) }));
  }, [tid, pedidoId, params]);

  return (
    <div className="min-h-dvh">
      <CabecalhoTorcida />
      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8 sm:py-12">
        {estado.erro ? (
          <Vazio icone="ingresso" titulo="Não encontramos estes ingressos" acao={<BotaoLink to={`/${torcida.slug}`}>Ver eventos</BotaoLink>}>
            {estado.erro} Confira se copiou o link completo.
          </Vazio>
        ) : !estado.bilhetes ? (
          <Carregando texto="Carregando ingressos..." />
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primaria">Seus ingressos</p>
              <h1 className="text-2xl font-bold mt-1">{estado.evento}</h1>
            </div>
            {estado.bilhetes.map((b) => (
              <Bilhete key={b.id} b={b} torcidaNome={torcida.nome} />
            ))}
            <p className="text-sm text-texto-3 text-center">Apresente o QR Code e um documento com foto do titular na entrada.</p>
          </div>
        )}
      </main>
    </div>
  );
}
