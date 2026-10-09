import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { api, ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import { esquecerIngressosDoPedido, ingressosSalvosDoPedido, quandoFoiSalvo, salvarIngressosDoPedido, type BilheteSalvo } from "@/lib/offline";
import { useTorcida } from "@/hooks/torcida";
import { Aviso, Botao, BotaoLink, Carregando, Vazio } from "@/ui";
import { CabecalhoTorcida, SemConexao } from "./comum";
import { Bilhete, type DadosBilhete } from "./Bilhete";

interface EstadoIngressos {
  bilhetes?: DadosBilhete[];
  evento?: string;
  erro?: string;
  semConexao?: boolean;
  /** Mostrando o que ficou salvo no aparelho (hora em que foi salvo). */
  salvoEm?: number;
}

const paraBilhetes = (lista: BilheteSalvo[]): DadosBilhete[] => lista.map((i) => ({ ...i, eventoData: new Date(i.eventoData) }));

/**
 * Link compartilhável dos ingressos: funciona em qualquer aparelho, sem login.
 * A última resposta fica guardada no aparelho (lib/offline.ts): na portaria sem internet, o QR aparece igual.
 */
export default function IngressosDoPedido() {
  const { pedidoId } = useParams();
  const [params] = useSearchParams();
  const { tid, torcida } = useTorcida();
  const [estado, setEstado] = useState<EstadoIngressos>({});
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const chave = params.get("k");
    if (!pedidoId || !chave) return setEstado({ erro: "Link incompleto." });
    let ativo = true;
    // O que ficou salvo aparece na hora (sinal ruim pode levar mais de um minuto para responder); o servidor atualiza
    const salvo = ingressosSalvosDoPedido(tid, pedidoId, chave);
    setEstado(salvo ? { evento: salvo.eventoNome, bilhetes: paraBilhetes(salvo.ingressos), salvoEm: salvo.salvoEm, semConexao: !navigator.onLine } : {});
    api
      .ingressosDoPedido({ tid, pedidoId, chave })
      .then((r) => {
        salvarIngressosDoPedido(tid, pedidoId, chave, r.eventoNome, r.ingressos);
        if (ativo) setEstado({ evento: r.eventoNome, bilhetes: paraBilhetes(r.ingressos) });
      })
      .catch((e) => {
        if (!ativo) return;
        // Sem internet não é link errado: mostra o que ficou salvo ou explica como salvar
        if (ehErroDeConexao(e)) return setEstado((atual) => (atual.bilhetes ? { ...atual, semConexao: true } : { semConexao: true }));
        esquecerIngressosDoPedido(tid, pedidoId);
        setEstado({ erro: mensagemDeErro(e) });
      });
    return () => {
      ativo = false;
    };
  }, [tid, pedidoId, params, tentativa]);

  return (
    <div className="min-h-dvh">
      <CabecalhoTorcida />
      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8 sm:py-12">
        {estado.semConexao && !estado.bilhetes ? (
          <SemConexao tentarDeNovo={() => setTentativa((n) => n + 1)}>
            Nenhum ingresso deste link está salvo neste celular. Abra o link uma vez com internet para os ingressos ficarem salvos no celular. Seus
            ingressos continuam valendo.
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
            {estado.semConexao && estado.salvoEm && (
              <Aviso
                tom="info"
                titulo={`Sem internet — mostrando os ingressos salvos ${quandoFoiSalvo(estado.salvoEm)}`}
                acao={
                  <Botao tamanho="sm" variante="contorno" icone="atualizar" onClick={() => setTentativa((n) => n + 1)}>
                    Tentar de novo
                  </Botao>
                }
              >
                O QR continua valendo na portaria. A situação (usado ou cancelado) atualiza quando a internet voltar.
              </Aviso>
            )}
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
