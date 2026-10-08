import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { api, ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import { useTorcida } from "@/hooks/torcida";
import { Botao, BotaoLink, Carregando, Vazio } from "@/ui";
import { CabecalhoTorcida, SemConexao } from "./comum";
import { Bilhete, type DadosBilhete } from "./Bilhete";

/** Link compartilhável dos ingressos: funciona em qualquer aparelho, sem login. */
export default function IngressosDoPedido() {
  const { pedidoId } = useParams();
  const [params] = useSearchParams();
  const { tid, torcida } = useTorcida();
  const [estado, setEstado] = useState<{ bilhetes?: DadosBilhete[]; evento?: string; erro?: string; semConexao?: boolean }>({});
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const chave = params.get("k");
    if (!pedidoId || !chave) return setEstado({ erro: "Link incompleto." });
    let ativo = true;
    setEstado({});
    api
      .ingressosDoPedido({ tid, pedidoId, chave })
      .then((r) => ativo && setEstado({ evento: r.eventoNome, bilhetes: r.ingressos.map((i) => ({ ...i, eventoData: new Date(i.eventoData) })) }))
      // Sem internet não é link errado: separa os dois casos
      .catch((e) => ativo && setEstado(ehErroDeConexao(e) ? { semConexao: true } : { erro: mensagemDeErro(e) }));
    return () => {
      ativo = false;
    };
  }, [tid, pedidoId, params, tentativa]);

  return (
    <div className="min-h-dvh">
      <CabecalhoTorcida />
      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8 sm:py-12">
        {estado.semConexao ? (
          <SemConexao tentarDeNovo={() => setTentativa((n) => n + 1)}>
            Não conseguimos abrir seus ingressos agora. Confira a internet e toque em “Tentar de novo”. Seus ingressos continuam valendo.
          </SemConexao>
        ) : estado.erro ? (
          <Vazio
            icone="ingresso"
            titulo="Não encontramos estes ingressos"
            acao={
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <BotaoLink to={`/${torcida.slug}/conta`} icone="usuario">
                  Entrar na minha conta
                </BotaoLink>
                <Botao variante="contorno" icone="atualizar" onClick={() => setTentativa((n) => n + 1)}>
                  Tentar de novo
                </Botao>
              </div>
            }
          >
            {estado.erro} Confira se copiou o link completo, ou entre na sua conta com CPF e senha para ver seus ingressos.
          </Vazio>
        ) : !estado.bilhetes ? (
          <Carregando texto="Carregando ingressos…" />
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primaria-texto">Seus ingressos</p>
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
