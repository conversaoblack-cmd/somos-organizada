/**
 * Página própria de cada evento: é onde cai o link direto (/{torcida}/e/{codigo}) divulgado no WhatsApp,
 * no cartaz (QR Code) e no calendário. Tudo do evento numa tela, com a compra junto.
 * No celular, uma barra fixa leva até o formulário enquanto ele não está na tela.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { collection, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTorcida } from "@/hooks/torcida";
import { useColecao, useDocumento } from "@/hooks/dados";
import type { ComId, Evento, Sede } from "@/lib/tipos";
import { dataExtensa, hora, moeda, taxa } from "@/lib/formatos";
import { caminhoEvento, CODIGO_EVENTO, linkEvento } from "@/lib/eventos";
import { Aviso, BotaoLink, cx, Esqueleto, Icone, Selo, Vazio } from "@/ui";
import { CabecalhoTorcida, RodapeTorcida, SemConexao, useSedes } from "./comum";
import { disponibilidade } from "./CartaoEvento";
import { CheckoutIngresso, type TipoIngresso } from "./CheckoutIngresso";
import { moduloAtivo } from "./Portao";

/** Evento público pelo código curto ou, nos links antigos, pelo id. */
function useEventoPublico(tid: string, codigo?: string, eventoId?: string) {
  const porCodigo = useColecao<Evento>(
    codigo ? query(collection(db, `torcidas/${tid}/eventos`), where("codigo", "==", codigo.toLowerCase()), where("status", "in", ["publicado", "encerrado"]), limit(1)) : null,
    `evento-codigo-${tid}-${codigo ?? "-"}`,
  );
  const porId = useDocumento<Evento>(!codigo && eventoId ? `torcidas/${tid}/eventos/${eventoId}` : null);
  // Internet ruim não é "evento não encontrado" (o link do WhatsApp cai aqui): a tela oferece tentar de novo
  const caiu = (x: { semConexao?: boolean; erro: Error | null }) =>
    !!x.semConexao || (!!x.erro && ((x.erro as Error & { code?: string }).code === "unavailable" || !navigator.onLine));
  if (codigo) return { carregando: porCodigo.carregando, semConexao: caiu(porCodigo), evento: (porCodigo.dados[0] as ComId<Evento> | undefined) ?? null };
  const e = porId.dados;
  // Rascunho ou evento de outra pessoa: as regras negam a leitura e a página trata como inexistente
  return { carregando: porId.carregando, semConexao: caiu(porId), evento: e && (e.status === "publicado" || e.status === "encerrado") ? e : null };
}

export default function PaginaEvento() {
  const { tid, torcida } = useTorcida();
  const { codigo, eventoId } = useParams();
  const { carregando, semConexao, evento } = useEventoPublico(tid, codigo, eventoId);
  const sedes = useSedes(tid);
  const sede = useMemo(() => (evento ? sedes.dados.find((s) => s.id === evento.sedeId) : undefined), [evento, sedes.dados]);

  useEffect(() => {
    if (evento) document.title = `${evento.nome} · ${torcida.nome}`;
  }, [evento, torcida.nome]);

  // Link antigo (/evento/{id}): troca o endereço pelo curto, para quem copiar da barra divulgar sempre o mesmo formato
  const navegar = useNavigate();
  const { search, hash } = useLocation();
  useEffect(() => {
    if (!codigo && evento?.codigo && CODIGO_EVENTO.test(evento.codigo)) {
      navegar(`${caminhoEvento(torcida.slug, evento)}${search}${hash}`, { replace: true, preventScrollReset: true });
    }
  }, [codigo, evento, torcida.slug, search, hash, navegar]);

  return (
    <div className="min-h-dvh flex flex-col">
      <CabecalhoTorcida />
      <main className="flex-1">
        {carregando ? (
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 space-y-4">
            <Esqueleto className="h-56 sm:h-72" />
            <Esqueleto className="h-10 w-2/3" />
            <Esqueleto className="h-40" />
          </div>
        ) : !evento && semConexao ? (
          <div className="mx-auto max-w-xl px-4 py-20">
            <SemConexao tentarDeNovo={() => location.reload()}>
              Não conseguimos abrir o evento agora. Confira a internet e toque em “Tentar de novo”.
            </SemConexao>
          </div>
        ) : !evento || !moduloAtivo(torcida, "eventos") ? (
          <div className="mx-auto max-w-xl px-4 py-20">
            <Vazio
              icone="calendario"
              titulo="Evento não encontrado"
              acao={
                <BotaoLink to={`/${torcida.slug}`} variante="contorno" icone="setaEsquerda">
                  Ver todos os eventos
                </BotaoLink>
              }
            >
              O link pode estar incompleto ou o evento saiu do ar. Confira com quem te mandou.
            </Vazio>
          </div>
        ) : (
          <ConteudoEvento evento={evento} sede={sede} />
        )}
      </main>
      <RodapeTorcida />
    </div>
  );
}

function ConteudoEvento({ evento, sede }: { evento: ComId<Evento>; sede?: Sede }) {
  const { torcida } = useTorcida();
  const pct = torcida.taxaServicoPct;
  const d = disponibilidade(evento);
  const jaFoi = evento.status === "encerrado" || evento.data.toMillis() < Date.now() - 6 * 3600_000;
  const vendaEncerrada = !!evento.vendaAte && evento.vendaAte.toMillis() < Date.now();
  // Barra fixa: o preço que quem chega pelo link vai pagar (público); o de sócio aparece à parte, como sócio
  const socioPagaMenos = moduloAtivo(torcida, "socios") && evento.valorSocio < evento.valorPublico;
  const link = linkEvento(torcida.slug, evento);

  // Barra fixa de compra no celular, escondida quando o formulário já está visível
  const compra = useRef<HTMLElement>(null);
  // Cartões Sócio/Público: tocar escolhe a opção no "Comprar ingresso" (e leva até ele no celular)
  const [tipo, setTipo] = useState<TipoIngresso>("publico");
  const [pedidoTipo, setPedidoTipo] = useState<{ tipo: TipoIngresso; n: number } | undefined>();
  const [compraVisivel, setCompraVisivel] = useState(false);
  useEffect(() => {
    const el = compra.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const o = new IntersectionObserver(([x]) => setCompraVisivel(x.isIntersecting), { rootMargin: "0px 0px -30% 0px" });
    o.observe(el);
    return () => o.disconnect();
  }, []);
  // Enquanto a barra de compra aparece no celular, o botão de ajuda sobe para não ficar por cima dela
  const barra = !jaFoi && !d.esgotado && !vendaEncerrada && !compraVisivel;
  useEffect(() => {
    const raiz = document.documentElement;
    const celular = window.matchMedia("(max-width: 1023px)").matches;
    raiz.style.setProperty("--folga-inferior", barra && celular ? "76px" : "0px");
    return () => {
      raiz.style.removeProperty("--folga-inferior");
    };
  }, [barra]);

  async function compartilhar() {
    const texto = `${evento.nome} · ${dataExtensa(evento.data)}, ${hora(evento.data)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: evento.nome, text: texto, url: link });
        return;
      } catch {
        /* cancelou: segue para o WhatsApp só se não houver suporte */
        return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`*${evento.nome}*\n${dataExtensa(evento.data)}, ${hora(evento.data)}\n${link}`)}`, "_blank", "noopener");
  }

  return (
    <>
      <section className="relative overflow-hidden border-b border-linha">
        {evento.imagemUrl ? (
          <>
            <img src={evento.imagemUrl} alt="" fetchPriority="high" decoding="async" width={1280} height={480} className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-fundo via-fundo/80 to-fundo/30" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 brilho-primaria" />
            <div className="absolute inset-0 grade-fundo" />
          </>
        )}
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-8 sm:pt-8 sm:pb-12">
          <Link to={`/${torcida.slug}`} className="inline-flex items-center gap-1.5 min-h-11 -my-2 text-sm text-texto-2 hover:text-texto">
            <Icone nome="setaEsquerda" className="size-4" /> Todos os eventos
          </Link>
          <div className="mt-16 sm:mt-24 flex flex-wrap gap-2">
            {sede && <Selo tom="primaria">{sede.nome}</Selo>}
            {jaFoi ? <Selo>Já aconteceu</Selo> : d.esgotado ? <Selo tom="perigo">Esgotado</Selo> : d.poucos ? <Selo tom="alerta">Últimos {d.restantes} lugares</Selo> : null}
          </div>
          <h1 className="font-display uppercase text-[34px] leading-[1.08] sm:text-6xl tracking-tight mt-3 max-w-4xl text-balance break-words">{evento.nome}</h1>
          <p className="mt-3 text-texto-2 text-lg">
            {dataExtensa(evento.data).replace(/^./, (c) => c.toUpperCase())} · {hora(evento.data)}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl w-full px-4 sm:px-6 py-8 sm:py-10 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_440px] items-start">
        <div className="space-y-6 min-w-0">
          {/* A data já está no topo (título do evento); aqui só o local */}
          <InfoLinha icone="local" titulo={evento.local || "Local a confirmar"} sub={sede?.bairro} />

          {(() => {
            const escolhivel = !jaFoi && !d.esgotado && !vendaEncerrada && moduloAtivo(torcida, "socios") && evento.valorSocio < evento.valorPublico;
            const cartao = (t: TipoIngresso) => {
              const valor = t === "socio" ? evento.valorSocio : evento.valorPublico;
              const conteudo = (
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-texto-2">{t === "socio" ? "Sócio" : "Público"}</span>
                    {escolhivel && (
                      <span
                        className={cx("size-4 shrink-0 rounded-full border-2", tipo === t ? "border-primaria bg-primaria shadow-[inset_0_0_0_3px_var(--color-fundo)]" : "border-linha-forte")}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="block text-2xl font-bold numeros mt-1">{valor ? moeda(valor) : "Grátis"}</span>
                  {valor > 0 && <span className="block text-xs text-texto-3">+ {moeda(taxa(valor, pct))} de taxa</span>}
                </>
              );
              if (!escolhivel) return <div key={t} className="rounded-2xl border border-linha bg-superficie-2 p-4">{conteudo}</div>;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tipo === t}
                  onClick={() => {
                    setPedidoTipo((p) => ({ tipo: t, n: (p?.n ?? 0) + 1 }));
                    if (window.innerWidth < 1024) compra.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={cx(
                    "rounded-2xl border-2 p-4 text-left transition-colors",
                    tipo === t ? "border-primaria bg-primaria/10" : "border-linha bg-superficie-2 hover:border-linha-forte",
                  )}
                >
                  {conteudo}
                </button>
              );
            };
            return (
              <div className="grid grid-cols-2 gap-3" {...(escolhivel ? { role: "radiogroup", "aria-label": "Tipo de ingresso" } : {})}>
                {cartao("socio")}
                {cartao("publico")}
              </div>
            );
          })()}
          {moduloAtivo(torcida, "socios") && evento.valorSocio < evento.valorPublico && !jaFoi && (
            <p className="text-sm text-texto-2">
              Sócio paga menos.{" "}
              <Link to={`/${torcida.slug}?aba=socios`} className="font-semibold text-texto underline underline-offset-2">
                Ver planos de sócio
              </Link>
            </p>
          )}

          {evento.descricao && (
            <div>
              <h2 className="font-bold text-lg mb-2">Sobre o evento</h2>
              <p className="text-texto-2 leading-relaxed whitespace-pre-line">{evento.descricao}</p>
            </div>
          )}

          <button
            type="button"
            onClick={compartilhar}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl border border-linha-forte font-semibold hover:bg-superficie-2"
          >
            <Icone nome="whatsapp" className="size-5" /> Chamar a galera
          </button>
        </div>

        <section ref={compra} id="comprar" className="min-w-0 scroll-mt-24 lg:sticky lg:top-24 rounded-cartao border border-linha bg-superficie p-5 sm:p-6" aria-labelledby="titulo-comprar">
          <h2 id="titulo-comprar" className="text-lg font-bold mb-4">
            {jaFoi ? "Evento encerrado" : "Comprar ingresso"}
          </h2>
          {jaFoi ? (
            <Aviso tom="info" titulo="Este evento já aconteceu">
              Veja os próximos na{" "}
              <Link to={`/${torcida.slug}`} className="underline font-semibold">
                página da torcida
              </Link>
              .
            </Aviso>
          ) : (
            <CheckoutIngresso evento={evento} sede={sede} pedidoTipo={pedidoTipo} aoMudarTipo={setTipo} />
          )}
        </section>
      </div>

      {!jaFoi && !d.esgotado && !vendaEncerrada && (
        <div
          className={cx(
            "lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-linha bg-fundo/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3 transition-transform",
            compraVisivel && "translate-y-full",
          )}
          aria-hidden={compraVisivel}
        >
          <div className="min-w-0">
            <p className="font-bold numeros leading-tight">
              {evento.valorPublico ? moeda(evento.valorPublico) : "Grátis"}
              {evento.valorPublico > 0 && <span className="text-xs font-normal text-texto-3"> + taxa</span>}
            </p>
            {socioPagaMenos && (
              <p className="text-xs text-texto-3 truncate">{evento.valorSocio ? `Sócio paga ${moeda(evento.valorSocio)}` : "Sócio não paga"}</p>
            )}
          </div>
          <a href="#comprar" tabIndex={compraVisivel ? -1 : 0} className="ml-auto shrink-0 inline-flex items-center justify-center gap-2 h-12 px-5 rounded-2xl bg-primaria text-sobre-primaria font-bold">
            Comprar ingresso
          </a>
        </div>
      )}
    </>
  );
}

function InfoLinha({ icone, titulo, sub }: { icone: "calendario" | "local"; titulo: string; sub?: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-superficie-2 p-3.5">
      <Icone nome={icone} className="size-5 text-primaria-texto shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="font-semibold text-sm leading-snug line-clamp-2">{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</p>
        {sub && <p className="text-xs text-texto-3 truncate mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
