import { useEffect, useState } from "react";
import { Link } from "react-router";
import { collection, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import { dataCurta, dataHora, moeda } from "@/lib/formatos";
import { normalizarPlano, type FaturaSaas, type PlanoSaas } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Aviso, Botao, CabecalhoPagina, Cartao, cx, Icone, Selo, useToast, type Tom } from "@/ui";
import { QrCode } from "@/ui/qr";
import { usePainel } from "./contexto";
import { usePlanosSaas } from "@/modulos/inicio/planos";
import { EscolhaPlano, ExplicacaoCobranca } from "./Publicar";
import { useTourPagina } from "./tours";
import { UsoDoPlanoCartao, useUsoDoPlano } from "./usoPlano";
import { BotaoCopiar, Confirmar, EstadoLista, numero } from "./util";

const SITUACAO: Record<string, { rotulo: string; tom: Tom }> = {
  em_dia: { rotulo: "Em dia", tom: "sucesso" },
  aberta: { rotulo: "Fatura em aberto", tom: "info" },
  atrasada: { rotulo: "Em atraso", tom: "alerta" },
  bloqueada: { rotulo: "Site fora do ar", tom: "perigo" },
};
const STATUS_FATURA: Record<FaturaSaas["status"], { rotulo: string; tom: Tom }> = {
  aberta: { rotulo: "Em aberto", tom: "alerta" },
  paga: { rotulo: "Paga", tom: "sucesso" },
  cancelada: { rotulo: "Cancelada", tom: "neutro" },
};

export default function PlanoSomos() {
  const { tid, base, assinatura } = usePainel();
  const avisar = useToast();
  useTourPagina("plano-somos");
  const planos = usePlanosSaas();
  const faturas = useColecao<FaturaSaas>(query(collection(db, `torcidas/${tid}/faturasSaas`), orderBy("vencimento", "desc")), `faturas-${tid}`);
  const [trocarPara, setTrocarPara] = useState<PlanoSaas | null>(null);
  const uso = useUsoDoPlano();
  const [informando, setInformando] = useState<string | null>(null);

  const abertas = faturas.dados.filter((f) => f.status === "aberta").sort((a, b) => a.vencimento.toMillis() - b.vencimento.toMillis());
  const destaque = abertas[0];
  // Fatura criada antes da chave Pix da plataforma (ou com a chave antiga): o servidor refaz o Pix com a chave atual
  const semPix = !!destaque && !destaque.pixCopiaECola;
  useEffect(() => {
    if (semPix) void api.conferirPixFatura({ tid }).catch(() => undefined);
  }, [semPix, tid]);

  async function jaPaguei(id: string) {
    setInformando(id);
    try {
      await api.informarPagamentoSaas({ tid, faturaId: id });
      avisar("Pagamento informado. A equipe confirma em até 1 dia útil.", "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setInformando(null);
    }
  }

  if (!assinatura) {
    return (
      <div className="max-w-3xl">
        <CabecalhoPagina titulo="Plano Somos Organizada" descricao="A mensalidade da plataforma." />
        {uso && <UsoDoPlanoCartao uso={uso} className="mb-4" />}

      <Cartao className="p-5 sm:p-6 mb-4" data-tour="plano-atual">
          <p className="font-bold text-lg">Você ainda não escolheu um plano</p>
          <p className="text-texto-2 mt-1">O plano é escolhido quando você publica o site. A cobrança só começa a partir daí.</p>
          <Link to={`${base}/publicar?tour=admin-publicar`} className="inline-flex items-center gap-2 mt-4 h-11 px-5 rounded-2xl font-semibold bg-primaria text-sobre-primaria">
            <Icone nome="raio" className="size-5" /> Ir para Publicar site
          </Link>
        </Cartao>
        <Cartao className="p-5 sm:p-6">
          <h2 className="font-bold mb-3">Como funciona a cobrança</h2>
          <ExplicacaoCobranca />
        </Cartao>
      </div>
    );
  }

  const sit = SITUACAO[assinatura.situacao] ?? SITUACAO.em_dia!;
  const planoAtual = normalizarPlano(assinatura.plano) ?? "pro";

  return (
    <div className="max-w-4xl">
      <CabecalhoPagina titulo="Plano Somos Organizada" descricao="Mensalidade da plataforma: plano, faturas e pagamento por Pix." />

      {destaque && (
        <Cartao className={cx("p-5 sm:p-6 mb-4", assinatura.situacao === "atrasada" || assinatura.situacao === "bloqueada" ? "border-alerta/50" : "border-primaria/40")} data-tour="fatura-aberta">
          <div className="grid md:grid-cols-[1fr_220px] gap-6 items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold">Fatura em aberto</p>
                <Selo tom={destaque.vencimento.toMillis() < Date.now() ? "perigo" : "alerta"}>
                  {destaque.vencimento.toMillis() < Date.now() ? "Vencida" : "A vencer"}
                </Selo>
              </div>
              <p className="text-4xl font-bold numeros mt-3">{moeda(destaque.valor)}</p>
              <p className="text-sm text-texto-2 mt-1">
                {planos.nome(destaque.plano)} · vence em <strong className="text-texto">{dataCurta(destaque.vencimento)}</strong>
              </p>
              {destaque.informadoPagamentoEm ? (
                <Aviso tom="sucesso" className="mt-4" titulo="Pagamento informado">
                  Você avisou em {dataHora(destaque.informadoPagamentoEm)}. A equipe confirma em até 1 dia útil.
                </Aviso>
              ) : destaque.pixCopiaECola ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-texto-2">Abra o app do banco, escolha Pix e leia o QR Code — ou use o “copia e cola”.</p>
                  <div className="rounded-xl bg-superficie-2 border border-linha p-3 font-mono text-xs break-all text-texto-2 max-h-24 overflow-y-auto">
                    {destaque.pixCopiaECola}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <BotaoCopiar texto={destaque.pixCopiaECola} rotulo="Copiar Pix copia e cola" variante="primaria" />
                    <Botao tamanho="sm" variante="contorno" icone="check" carregando={informando === destaque.id} onClick={() => jaPaguei(destaque.id)}>
                      Já paguei
                    </Botao>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <Aviso tom="info" titulo="Chave Pix será informada pela equipe">
                    Fale com a equipe Somos Organizada pelo botão de ajuda (canto da tela) ou pelo WhatsApp para receber os dados de pagamento.
                  </Aviso>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Olá! Quero pagar a fatura de ${moeda(destaque.valor)} (vencimento ${dataCurta(destaque.vencimento)}) da Somos Organizada.`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3.5 rounded-xl text-sm font-semibold bg-superficie-2 hover:bg-superficie-3"
                    >
                      <Icone nome="whatsapp" className="size-4" /> WhatsApp
                    </a>
                    <Botao tamanho="sm" variante="contorno" icone="check" carregando={informando === destaque.id} onClick={() => jaPaguei(destaque.id)}>
                      Já paguei
                    </Botao>
                  </div>
                </div>
              )}
            </div>
            {destaque.pixCopiaECola && !destaque.informadoPagamentoEm && <QrCode valor={destaque.pixCopiaECola} className="w-48 mx-auto" />}
          </div>
        </Cartao>
      )}

      {uso && <UsoDoPlanoCartao uso={uso} className="mb-4" />}

      <Cartao className="p-5 sm:p-6 mb-4" data-tour="plano-atual">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-bold text-lg">Seu plano</h2>
            <p className="text-sm text-texto-3">Vencimento todo dia {assinatura.diaVencimento}. Próxima fatura: {dataCurta(assinatura.proximoVencimento)}.</p>
          </div>
          <Selo tom={sit.tom} ponto>
            {sit.rotulo}
          </Selo>
        </div>
        <EscolhaPlano valor={planoAtual} atual={planoAtual} uso={uso} onChange={(p) => p !== planoAtual && setTrocarPara(p)} />
        <p className="text-xs text-texto-3 mt-2">Os limites novos valem na hora; o preço novo, a partir da próxima fatura.</p>
      </Cartao>

      <section data-tour="faturas">
        <h2 className="text-lg font-bold mb-3">Faturas</h2>
        {faturas.carregando || faturas.erro || !faturas.dados.length ? (
          <EstadoLista carregando={faturas.carregando} erro={faturas.erro} semConexao={faturas.semConexao} vazio icone="dinheiro" tituloVazio="Nenhuma fatura ainda" />
        ) : (
          <Cartao className="overflow-hidden">
            <ul className="divide-y divide-linha">
              {faturas.dados.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="size-9 shrink-0 rounded-xl grid place-items-center bg-superficie-2 text-texto-2">
                    <Icone nome="dinheiro" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {planos.nome(f.plano)} · {numero(f.sociosAtivos)} sócios
                    </p>
                    <p className="text-xs text-texto-3">
                      Vence {dataCurta(f.vencimento)}
                      {f.pagaEm && ` · paga em ${dataCurta(f.pagaEm)}`}
                      {f.status === "aberta" && f.informadoPagamentoEm && " · pagamento informado"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold numeros">{moeda(f.valor)}</p>
                    <Selo tom={STATUS_FATURA[f.status].tom} className="mt-1">
                      {STATUS_FATURA[f.status].rotulo}
                    </Selo>
                  </div>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </section>

      <Confirmar
        aberto={!!trocarPara}
        fechar={() => setTrocarPara(null)}
        titulo="Trocar de plano?"
        rotulo="Trocar plano"
        acao={async () => {
          await api.alterarPlanoSaas({ tid, plano: trocarPara! });
          avisar("Plano alterado. Os limites novos já valem; o preço muda na próxima fatura.", "sucesso");
        }}
      >
        {trocarPara && (
          <>
            O plano passa a ser <strong className="text-texto">{planos.nome(trocarPara)}</strong>: até {numero(planos.planos[trocarPara].socios)} sócios e{" "}
            {numero(planos.planos[trocarPara].eventos)} eventos à venda ao mesmo tempo, por {moeda(planos.valor(trocarPara))}/mês.
            {" "}Os limites novos valem na hora. O preço novo vale a partir da próxima fatura; a fatura em aberto não muda.
          </>
        )}
      </Confirmar>
    </div>
  );
}
