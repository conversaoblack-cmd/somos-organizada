import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { socioEmDia, useMinhaFicha, useTorcida } from "@/hooks/torcida";
import type { ComId, Plano, Sede } from "@/lib/tipos";
import { dataExtensa, moeda, periodicidadeCurta, taxa } from "@/lib/formatos";
import { Abas, Aviso, Botao, BotaoLink, cx, Esqueleto, Icone, Vazio } from "@/ui";
import { CabecalhoTorcida, RodapeTorcida, SemConexao, useEventosPublicos, usePlanosAtivos, useSedes } from "./comum";
import { Calendario, chaveDia } from "./Calendario";
import { CartaoEvento, disponibilidade } from "./CartaoEvento";
import { moduloAtivo, torcidaBloqueada } from "./Portao";

type Aba = "eventos" | "socios";

export default function PaginaTorcida() {
  const { tid, torcida } = useTorcida();
  const [params, setParams] = useSearchParams();
  const temEventos = moduloAtivo(torcida, "eventos");
  const temSocios = moduloAtivo(torcida, "socios");
  const aba: Aba = !temEventos ? "socios" : !temSocios ? "eventos" : params.get("aba") === "socios" ? "socios" : "eventos";
  const eventos = useEventosPublicos(tid);
  const sedes = useSedes(tid);
  const sedePorId = useMemo(() => new Map(sedes.dados.map((s) => [s.id, s])), [sedes.dados]);

  const trocarAba = (a: Aba) => {
    setParams(a === "eventos" ? {} : { aba: a }, { replace: true });
  };

  const titulo = torcida.textos?.titulo || torcida.nome;
  const banner = torcida.tema.bannerUrl;

  return (
    <div className="min-h-dvh flex flex-col">
      <CabecalhoTorcida />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-linha">
        {banner ? (
          <>
            <img src={banner} alt="" fetchPriority="high" decoding="async" width={1280} height={480} className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-fundo via-fundo/75 to-fundo/30" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 brilho-primaria" />
            <div className="absolute inset-0 grade-fundo" />
          </>
        )}
        {/* No celular o cabeçalho é curto: a agenda e os planos aparecem já na primeira tela */}
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-6 sm:pt-20 sm:pb-14">
          <div className="hidden sm:flex items-center gap-2 mb-5">
            <span className="h-1 w-8 rounded-full bg-primaria" />
            <span className="h-1 w-4 rounded-full bg-secundaria" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-texto-2">Página oficial</span>
          </div>
          {/* Sem título próprio, o nome já está no topo da página: no celular fica só para leitor de tela */}
          <h1
            className={cx(
              "font-display uppercase text-[30px] leading-[1.08] sm:text-6xl lg:text-7xl tracking-tight max-w-4xl break-words",
              titulo === torcida.nome && "max-sm:sr-only",
            )}
          >
            {titulo}
          </h1>
          {torcida.textos?.subtitulo && <p className="mt-2 sm:mt-4 text-texto-2 text-[15px] sm:text-lg max-w-2xl">{torcida.textos.subtitulo}</p>}

          {temEventos && temSocios && (
          <div className="mt-5 sm:mt-10">
            <Abas
              grande
              className="w-full sm:w-auto"
              valor={aba}
              onChange={trocarAba}
              opcoes={[
                { valor: "eventos", rotulo: "Eventos", icone: "ingresso" },
                { valor: "socios", rotulo: "Seja sócio", icone: "escudo" },
              ]}
            />
          </div>
          )}
        </div>
      </section>

      {torcida.status === "suspensa" && !torcidaBloqueada(torcida) && (
        <div className="mx-auto max-w-6xl w-full px-4 sm:px-6 mt-6">
          <Aviso tom="alerta" titulo="Vendas temporariamente pausadas">Fale com a diretoria pelos canais oficiais.</Aviso>
        </div>
      )}

      <main className="flex-1 mx-auto max-w-6xl w-full px-4 sm:px-6 py-8 sm:py-12">
        {aba === "eventos" ? (
          <AbaEventos
            carregando={eventos.carregando}
            // sem importar lib/api (SDK de functions) só para isto: a página da torcida é a porta de entrada e precisa ser leve
            semConexao={!!eventos.semConexao || (!!eventos.erro && ((eventos.erro as { code?: string }).code === "unavailable" || !navigator.onLine))}
            eventos={eventos.dados}
            sedes={sedes.dados}
            sedePorId={sedePorId}
          />
        ) : (
          <AbaSocios />
        )}
      </main>

      <RodapeTorcida />

    </div>
  );
}

/** true no computador (calendário sempre aberto ao lado da agenda). */
function useTelaGrande() {
  const consulta = "(min-width: 1024px)";
  const [grande, setGrande] = useState(() => typeof window !== "undefined" && window.matchMedia(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const mudou = () => setGrande(m.matches);
    m.addEventListener("change", mudou);
    return () => m.removeEventListener("change", mudou);
  }, []);
  return grande;
}

function AbaEventos({
  carregando,
  semConexao,
  eventos,
  sedes,
  sedePorId,
}: {
  carregando: boolean;
  semConexao: boolean;
  eventos: ReturnType<typeof useEventosPublicos>["dados"];
  sedes: ComId<Sede>[];
  sedePorId: Map<string, Sede>;
}) {
  const { torcida } = useTorcida();
  const temSocios = moduloAtivo(torcida, "socios");
  const telaGrande = useTelaGrande();
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [sedeFiltro, setSedeFiltro] = useState<string>("todas");
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dia, setDia] = useState<string | null>(null);

  // No celular o calendário fica recolhido: sem ele, a lista mostra todos os próximos eventos (não só os do mês)
  const porMes = telaGrande || calendarioAberto;
  const filtrados = eventos.filter((e) => sedeFiltro === "todas" || e.sedeId === sedeFiltro);
  const doMes = filtrados.filter((e) => {
    const d = e.data.toDate();
    return d.getFullYear() === mes.getFullYear() && d.getMonth() === mes.getMonth();
  });
  const proximo = filtrados.find((e) => !disponibilidade(e).esgotado);
  // O próximo evento já aparece em destaque: não repete na lista logo abaixo
  const lista = dia ? filtrados.filter((e) => chaveDia(e.data.toDate()) === dia) : (porMes ? doMes : filtrados).filter((e) => e.id !== proximo?.id);
  const sedesComEvento = sedes.filter((s) => eventos.some((e) => e.sedeId === s.id));

  if (carregando) {
    return (
      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <Esqueleto className="h-80" />
        <div className="space-y-3">
          <Esqueleto className="h-32" />
          <Esqueleto className="h-32" />
        </div>
      </div>
    );
  }
  if (!eventos.length && semConexao) {
    return (
      <SemConexao tentarDeNovo={() => location.reload()}>
        Não conseguimos carregar a agenda. Confira a internet e toque em “Tentar de novo”.
      </SemConexao>
    );
  }
  if (!eventos.length) {
    return (
      <Vazio
        icone="calendario"
        titulo="Nenhum evento à venda agora"
        acao={
          temSocios ? (
            <BotaoLink to={`/${torcida.slug}?aba=socios`} variante="contorno" icone="escudo">
              Ver planos de sócio
            </BotaoLink>
          ) : undefined
        }
      >
        {temSocios ? "A diretoria ainda vai divulgar os próximos eventos. Que tal virar sócio enquanto isso?" : "A diretoria ainda vai divulgar os próximos eventos. Volte em breve."}
      </Vazio>
    );
  }

  return (
    <div className="space-y-8">
      {proximo && !dia && (
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-texto-3 mb-3">Próximo evento</p>
          <CartaoEvento evento={proximo} sede={sedePorId.get(proximo.sedeId)} slug={torcida.slug} destaque />
        </div>
      )}

      {sedesComEvento.length > 1 && (
        <div className="flex gap-2 overflow-x-auto sem-rolagem -mx-4 px-4 sm:mx-0 sm:px-0">
          {[{ id: "todas", nome: "Todas as sedes" }, ...sedesComEvento].map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={sedeFiltro === s.id}
              onClick={() => {
                setSedeFiltro(s.id);
                setDia(null);
              }}
              className={cx(
                "h-11 sm:h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors",
                sedeFiltro === s.id ? "bg-texto text-fundo border-texto" : "border-linha-forte text-texto-2 hover:text-texto",
              )}
            >
              {s.nome}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
        <div className="lg:sticky lg:top-24 space-y-3">
          <Botao
            variante="contorno"
            largo
            icone="calendario"
            className="lg:hidden"
            aria-expanded={calendarioAberto}
            aria-controls="calendario-eventos"
            onClick={() => {
              setCalendarioAberto((a) => !a);
              setDia(null);
            }}
          >
            {calendarioAberto ? "Esconder calendário" : "Ver calendário"}
          </Botao>
          <div id="calendario-eventos" className={cx(!calendarioAberto && "hidden lg:block")}>
            <Calendario mes={mes} setMes={setMes} eventos={filtrados} diaSelecionado={dia} setDia={setDia} />
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="font-semibold">
              {dia ? `Eventos em ${dataExtensa(new Date(`${dia}T12:00:00`))}` : porMes ? "Agenda do mês" : proximo ? "Outros eventos" : "Próximos eventos"}
              <span className="text-texto-3 font-normal"> · {lista.length}</span>
            </p>
            {dia && (
              <button type="button" className="inline-flex items-center min-h-11 text-sm text-primaria-texto font-semibold" onClick={() => setDia(null)}>
                Ver mês inteiro
              </button>
            )}
          </div>
          {lista.length ? (
            <div className="grid gap-3">
              {lista.map((e) => (
                <CartaoEvento key={e.id} evento={e} sede={sedePorId.get(e.sedeId)} slug={torcida.slug} />
              ))}
            </div>
          ) : (
            <div className="rounded-cartao border border-dashed border-linha-forte p-8 text-center text-texto-2">
              <p>{!porMes ? "Nenhum outro evento por enquanto." : doMes.length ? "Nenhum outro evento neste mês." : "Nenhum evento neste mês."}</p>
              {porMes && !doMes.length && filtrados.length > 0 && (
                <button
                  type="button"
                  className="mt-2 inline-flex items-center min-h-11 text-primaria-texto font-semibold text-sm"
                  onClick={() => {
                    const d = filtrados[0].data.toDate();
                    setMes(new Date(d.getFullYear(), d.getMonth(), 1));
                  }}
                >
                  Ir para o próximo evento
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AbaSocios() {
  const { tid, torcida } = useTorcida();
  const planos = usePlanosAtivos(tid);
  const { ficha } = useMinhaFicha(tid);
  const emDia = socioEmDia(ficha);
  const pct = torcida.taxaServicoPct;

  return (
    <div className="space-y-10">
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primaria-texto mb-3">Programa oficial de sócios</p>
          <h2 className="font-display uppercase text-3xl sm:text-5xl leading-[1.08]">Faça parte de verdade</h2>
        </div>
        <p className="text-texto-2 sm:text-lg">
          {torcida.textos?.sobre ||
            "Sua mensalidade mantém as sedes, a bateria e as caravanas de pé. Em troca: preço de sócio nos eventos, carteirinha digital e voz nas decisões."}
        </p>
      </div>

      {ficha && (
        <Aviso
          tom={emDia ? "sucesso" : "alerta"}
          titulo={emDia ? `Você já é sócio · matrícula ${ficha.matricula}` : "Sua associação precisa de atenção"}
          acao={
            <BotaoLink to={`/${torcida.slug}/socio`} tamanho="sm" variante={emDia ? "contorno" : "primaria"}>
              {emDia ? "Ver carteirinha" : "Resolver agora"}
            </BotaoLink>
          }
        >
          {emDia ? "Seus benefícios estão ativos." : "Confira o pagamento da sua mensalidade na sua conta."}
        </Aviso>
      )}

      {planos.carregando ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-96" />
          ))}
        </div>
      ) : !planos.dados.length ? (
        <Vazio icone="escudo" titulo="Planos em breve">
          A diretoria está preparando o programa de sócios.
        </Vazio>
      ) : (
        <div className={cx("grid gap-4", planos.dados.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2 max-w-4xl")}>
          {planos.dados.map((p) => (
            <CartaoPlano key={p.id} plano={p} pct={pct} slug={torcida.slug} desativado={!!ficha && ["ativo", "em_analise"].includes(ficha.status)} />
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        {[
          ["ingresso", "Preço de sócio", "Desconto em todos os eventos e caravanas, direto no checkout."],
          ["qr", "Carteirinha digital", "Com QR Code, sempre no seu celular. Nada de carteirinha de papel."],
          ["cadeado", "Pagamento seguro", "Pix ou cartão com cobrança automática. Cancele quando quiser."],
        ].map(([ic, t, d]) => (
          <div key={t} className="rounded-cartao border border-linha p-5">
            <Icone nome={ic as "qr"} className="size-6 text-primaria-texto" />
            <p className="font-semibold mt-3">{t}</p>
            <p className="text-sm text-texto-2 mt-1">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const NUMERO_BR = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CartaoPlano({ plano, pct, slug, desativado }: { plano: ComId<Plano>; pct: number; slug: string; desativado: boolean }) {
  // "1.200,00" (com separador de milhar): reais em destaque e centavos menores
  const [reais, cents] = NUMERO_BR.format(plano.valor / 100).split(",");
  return (
    <div
      className={cx(
        "relative flex flex-col rounded-cartao border p-6 transition-all",
        plano.destaque ? "border-primaria bg-gradient-to-b from-primaria/15 to-superficie shadow-[0_30px_80px_-40px_var(--color-primaria)]" : "border-linha bg-superficie",
      )}
    >
      {plano.destaque && (
        <span className="absolute -top-3 left-6 rounded-full bg-secundaria text-sobre-secundaria text-xs font-bold px-3 py-1">Recomendado</span>
      )}
      <p className="font-bold text-lg">{plano.nome}</p>
      {plano.descricao && <p className="text-sm text-texto-2 mt-1">{plano.descricao}</p>}
      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-texto-2 text-lg">R$</span>
        <span className="font-display text-5xl numeros leading-none">{reais}</span>
        <span className="font-bold text-lg">,{cents}</span>
        <span className="text-texto-3 ml-1">{periodicidadeCurta(plano.intervalo, plano.intervaloQtd)}</span>
      </div>
      <p className="text-xs text-texto-3 mt-1">+ {moeda(taxa(plano.valor, pct))} de taxa de serviço</p>
      {!!plano.beneficios?.length && (
        <ul className="mt-6 space-y-2.5 flex-1">
          {plano.beneficios.map((b) => (
            <li key={b} className="flex gap-2.5 text-sm">
              <Icone nome="check" className="size-5 text-primaria-texto shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 pt-2">
        {desativado ? (
          <p className="text-sm text-texto-3 text-center py-3">Você já é sócio</p>
        ) : (
          <Link
            to={`/${slug}/associar/${plano.id}`}
            className={cx(
              "flex items-center justify-center gap-2 h-13 rounded-2xl font-bold transition-all active:scale-[0.98]",
              plano.destaque ? "bg-primaria text-sobre-primaria hover:brightness-110" : "bg-superficie-3 hover:bg-primaria hover:text-sobre-primaria",
            )}
          >
            Quero este plano <Icone nome="setaDireita" className="size-5" />
          </Link>
        )}
      </div>
      <div className="mt-3 flex justify-center gap-3 text-xs text-texto-3">
        {plano.pix && <span className="inline-flex items-center gap-1"><Icone nome="pix" className="size-3.5" /> Pix</span>}
        {plano.cartao && <span className="inline-flex items-center gap-1"><Icone nome="cartao" className="size-3.5" /> Cartão recorrente</span>}
      </div>
    </div>
  );
}
