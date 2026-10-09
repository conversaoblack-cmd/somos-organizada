import { rp } from "@/lib/hosts";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { api, mensagemDeErro } from "@/lib/api";
import { dataCurta, dataHora, moeda, relativo } from "@/lib/formatos";
import { usePlanosSaas } from "@/modulos/inicio/planos";
import { Aviso, Botao, CabecalhoPagina, Cartao, Carregando, cx, Icone, Indicador, Modal, Selo, Vazio, useToast } from "@/ui";
import {
  numero,
  plural,
  rotuloPlanoSaas,
  usoDoPlanoDaTorcida,
  ROTULO_SITUACAO_SAAS,
  ROTULO_STATUS_TORCIDA,
  TOM_SITUACAO_SAAS,
  TOM_STATUS_TORCIDA,
  useResumo,
  valorPlanoDaTorcida,
  type LinhaTorcida,
  type SituacaoSaas,
} from "./comum";

export interface FaturaParaConfirmar {
  tid: string;
  torcidaNome: string;
  id: string;
  valor: number;
  vencimento: number | null;
  informadoPagamentoEm: number | null;
}

const DIA = 86_400_000;

/** Botão + modal de confirmação do Pix recebido (reativa a torcida se estava bloqueada). */
export function ConfirmarPix({ fatura, aoConfirmar, tamanho = "sm" }: { fatura: FaturaParaConfirmar; aoConfirmar: () => void; tamanho?: "sm" | "md" }) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const avisar = useToast();
  async function confirmar() {
    setSalvando(true);
    try {
      await api.confirmarFaturaSaas({ tid: fatura.tid, faturaId: fatura.id });
      avisar("Pagamento confirmado.", "sucesso");
      setAberto(false);
      aoConfirmar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }
  return (
    <>
      <Botao tamanho={tamanho} variante={fatura.informadoPagamentoEm ? "primaria" : "contorno"} icone="check" onClick={() => setAberto(true)}>
        Confirmar Pix recebido
      </Botao>
      <Modal
        aberto={aberto}
        fechar={() => setAberto(false)}
        titulo="Confirmar Pix recebido?"
        rodape={
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao icone="check" carregando={salvando} onClick={confirmar}>
              Confirmar pagamento
            </Botao>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            <strong>{fatura.torcidaNome}</strong> · fatura com vencimento em <strong>{dataCurta(fatura.vencimento)}</strong> no valor de{" "}
            <strong>{moeda(fatura.valor)}</strong>.
          </p>
          <p className="text-texto-2">Confira no extrato da conta da Somos Organizada se o Pix caiu antes de confirmar.</p>
          {fatura.informadoPagamentoEm ? (
            <Aviso tom="info">A diretoria informou o pagamento em {dataHora(fatura.informadoPagamentoEm)}.</Aviso>
          ) : (
            <Aviso tom="alerta">A diretoria ainda não informou o pagamento por aqui.</Aviso>
          )}
          <p className="text-xs text-texto-3">Se a torcida estava fora do ar por atraso e não houver outra fatura vencida há mais de 7 dias, ela volta ao ar na hora.</p>
        </div>
      </Modal>
    </>
  );
}

type Filtro = "todas" | SituacaoSaas;

export default function Mensalidades() {
  const { resumo, carregando, erro, recarregar } = useResumo();
  const cfg = usePlanosSaas();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [rodando, setRodando] = useState(false);
  const avisar = useToast();

  const dados = useMemo(() => {
    const ts = resumo?.torcidas ?? [];
    const comAssinatura = ts.filter((t) => t.saas);
    const ordem: Record<SituacaoSaas, number> = { bloqueada: 0, atrasada: 1, aberta: 2, em_dia: 3 };
    return {
      comAssinatura: comAssinatura.sort(
        (a, b) =>
          Number(!!b.saas!.faturasAbertas.some((f) => f.informadoPagamentoEm)) - Number(!!a.saas!.faturasAbertas.some((f) => f.informadoPagamentoEm)) ||
          ordem[a.saas!.situacao] - ordem[b.saas!.situacao] ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      ),
      semAssinatura: ts.filter((t) => !t.saas),
      mrr: comAssinatura.reduce((s, t) => s + (valorPlanoDaTorcida(t, cfg.planos)?.valor ?? 0), 0),
      emAberto: comAssinatura.reduce((s, t) => s + t.saas!.faturasAbertas.reduce((x, f) => x + f.valor, 0), 0),
      atrasadas: comAssinatura.filter((t) => t.saas!.situacao === "atrasada").length,
      bloqueadas: comAssinatura.filter((t) => t.saas!.situacao === "bloqueada" || t.saas!.bloqueada).length,
      informados: comAssinatura.reduce((s, t) => s + t.saas!.faturasAbertas.filter((f) => f.informadoPagamentoEm).length, 0),
    };
  }, [resumo, cfg.planos]);

  const lista = dados.comAssinatura.filter((t) => filtro === "todas" || t.saas!.situacao === filtro);

  async function rodarRotina() {
    setRodando(true);
    try {
      const r = await api.executarRotinaSaas({});
      avisar(`Rotina concluída: ${plural(r.faturasGeradas, "fatura gerada", "faturas geradas")}, ${plural(r.bloqueadas, "torcida bloqueada", "torcidas bloqueadas")}.`, "sucesso");
      await recarregar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setRodando(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Mensalidades"
        descricao="Plano Somos Organizada de cada torcida. Pagamento só por Pix, sem multa nem juros; 7 dias de atraso tiram o site do ar."
        acoes={
          <>
            <Botao variante="contorno" tamanho="sm" icone="atualizar" carregando={carregando} onClick={recarregar}>
              Atualizar
            </Botao>
            <Botao variante="suave" tamanho="sm" icone="relogio" carregando={rodando} onClick={rodarRotina} title="Gera faturas próximas do vencimento e aplica bloqueio por atraso (roda sozinha todo dia às 7h20)">
              Rodar rotina agora
            </Botao>
          </>
        }
      />
      {erro && <Aviso tom="perigo" className="mb-4">{erro}</Aviso>}
      {!cfg.carregando && !cfg.pix.chave && (
        <Aviso tom="alerta" className="mb-6" titulo="Chave Pix da plataforma não configurada" acao={<Link to={rp("/configuracoes")} className="text-sm font-semibold text-primaria-texto hover:underline">Configurar agora</Link>}>
          As faturas novas sairão sem Pix copia e cola.
        </Aviso>
      )}

      {!resumo && carregando ? (
        <Carregando />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
            <Indicador rotulo="MRR previsto" valor={moeda(dados.mrr).replace(",00", "")} detalhe={plural(dados.comAssinatura.length, "assinatura", "assinaturas")} icone="escudo" tom="sucesso" />
            <Indicador rotulo="Em aberto" valor={moeda(dados.emAberto).replace(",00", "")} detalhe={dados.informados ? `${plural(dados.informados, "Pix informado", "Pix informados")} para conferir` : "Faturas não pagas"} icone="pix" tom={dados.informados ? "info" : undefined} />
            <Indicador rotulo="Em atraso" valor={dados.atrasadas} detalhe="Vencidas há até 7 dias" icone="relogio" tom={dados.atrasadas ? "alerta" : undefined} />
            <Indicador rotulo="Bloqueadas" valor={dados.bloqueadas} detalhe="Site fora do ar por atraso" icone="cadeado" tom={dados.bloqueadas ? "perigo" : undefined} />
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por situação">
            {(["todas", "bloqueada", "atrasada", "aberta", "em_dia"] as Filtro[]).map((f) => {
              const n = f === "todas" ? dados.comAssinatura.length : dados.comAssinatura.filter((t) => t.saas!.situacao === f).length;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filtro === f}
                  onClick={() => setFiltro(f)}
                  className={cx(
                    "h-11 sm:h-9 px-3.5 rounded-xl text-sm font-semibold border transition-colors",
                    filtro === f ? "bg-primaria text-sobre-primaria border-primaria" : "border-linha text-texto-2 hover:text-texto hover:bg-superficie-2",
                  )}
                >
                  {f === "todas" ? "Todas" : ROTULO_SITUACAO_SAAS[f]} <span className="opacity-70 numeros">{n}</span>
                </button>
              );
            })}
          </div>

          {lista.length === 0 ? (
            <Cartao>
              <Vazio icone="dinheiro" titulo={dados.comAssinatura.length ? "Nada neste filtro" : "Nenhuma assinatura ainda"}>
                A assinatura começa quando a diretoria publica o site e escolhe o plano.
              </Vazio>
            </Cartao>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {lista.map((t) => (
                <CartaoAssinatura key={t.id} t={t} valor={valorPlanoDaTorcida(t, cfg.planos)} aoConfirmar={() => void recarregar()} />
              ))}
            </div>
          )}

          {dados.semAssinatura.length > 0 && (
            <Cartao className="p-5">
              <h2 className="font-bold">Sem assinatura ({dados.semAssinatura.length})</h2>
              <p className="text-sm text-texto-3 mb-3">Ainda não publicaram o site, então não há cobrança.</p>
              <ul className="flex flex-wrap gap-2">
                {dados.semAssinatura.map((t) => (
                  <li key={t.id}>
                    <Link to={rp(`/torcidas/${t.id}`)} className="inline-flex items-center gap-2 rounded-xl border border-linha px-3 py-1.5 text-sm hover:bg-superficie-2">
                      {t.nome}
                      <Selo tom={TOM_STATUS_TORCIDA[t.status]}>{ROTULO_STATUS_TORCIDA[t.status]}</Selo>
                    </Link>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>
      )}
    </>
  );
}

function CartaoAssinatura({ t, valor, aoConfirmar }: { t: LinhaTorcida; valor: { plano: string; valor: number } | null; aoConfirmar: () => void }) {
  const s = t.saas!;
  const uso = usoDoPlanoDaTorcida(t);
  return (
    <Cartao className={cx("p-5", (s.situacao === "bloqueada" || s.bloqueada) && "border-perigo/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={rp(`/torcidas/${t.id}`)} className="font-bold hover:underline">
            {t.nome}
          </Link>
          <p className="text-sm text-texto-2 mt-0.5">
            {rotuloPlanoSaas(valor?.plano ?? s.plano)} · {moeda(valor?.valor ?? 0)}/mês
            {uso && (
              <span className="block text-xs text-texto-3 numeros">
                Sócios: {numero(uso.socios)} de {numero(uso.limiteSocios)} · Eventos à venda: {numero(uso.eventos)} de {numero(uso.limiteEventos)}
              </span>
            )}
          </p>
        </div>
        <Selo tom={TOM_SITUACAO_SAAS[s.situacao]} ponto>
          {ROTULO_SITUACAO_SAAS[s.situacao]}
        </Selo>
      </div>
      {s.bloqueada && s.situacao !== "bloqueada" && <p className="text-xs text-perigo mt-2">Site fora do ar por atraso.</p>}

      {s.faturasAbertas.length === 0 ? (
        <p className="text-sm text-texto-3 mt-4 flex items-center gap-2">
          <Icone nome="checkCirculo" className="size-4 text-sucesso" /> Nenhuma fatura em aberto.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {s.faturasAbertas.map((f) => {
            const vencida = f.vencimento !== null && f.vencimento < Date.now();
            const diasAtraso = vencida ? Math.floor((Date.now() - f.vencimento!) / DIA) : 0;
            return (
              <li key={f.id} className={cx("rounded-2xl border p-4", f.informadoPagamentoEm ? "border-info/40 bg-info/8" : "border-linha bg-superficie-2/50")}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-lg font-bold numeros">{moeda(f.valor)}</p>
                  <p className={cx("text-sm", vencida ? "text-perigo font-semibold" : "text-texto-2")}>
                    {vencida ? `Venceu em ${dataCurta(f.vencimento)} · ${plural(diasAtraso, "dia", "dias")} de atraso` : `Vence em ${dataCurta(f.vencimento)}`}
                  </p>
                </div>
                <p className="text-xs text-texto-3 mt-0.5">{rotuloPlanoSaas(f.plano)} · fatura {f.id}</p>
                {f.informadoPagamentoEm && (
                  <p className="mt-2 text-sm font-semibold text-info flex items-center gap-1.5">
                    <Icone nome="pix" className="size-4" /> Pagamento informado em {dataHora(f.informadoPagamentoEm)} ({relativo(f.informadoPagamentoEm)})
                  </p>
                )}
                <div className="mt-3">
                  <ConfirmarPix
                    fatura={{ tid: t.id, torcidaNome: t.nome, id: f.id, valor: f.valor, vencimento: f.vencimento, informadoPagamentoEm: f.informadoPagamentoEm }}
                    aoConfirmar={aoConfirmar}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Cartao>
  );
}
