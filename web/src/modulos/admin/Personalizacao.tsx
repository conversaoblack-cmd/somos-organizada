import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { collection, doc, limit, orderBy, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { useNavigate } from "react-router";
import { db } from "@/lib/firebase";
import { diaDoMes, emailValido, hora, mascaraTelefone, mesAbrev, moeda, periodicidadeCurta, soDigitos, taxa } from "@/lib/formatos";
import { aplicarTema, avisosDeContraste, corValida, PALETAS, TEMA_PADRAO, temaDoPainel } from "@/lib/tema";
import type { Evento, Plano, Tema, Torcida } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Cartao, cx, Icone, Interruptor, OpcoesCartao, useToast } from "@/ui";
import { useAlteracoesPendentes } from "@/componentes/LayoutPainel";
import { iniciaisTorcida } from "../publico/comum";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { comPrazo, mensagemGravacao, numeroWhatsapp, SeletorImagem, semIndefinidos } from "./util";

interface Form {
  modulos: { eventos: boolean; socios: boolean };
  tema: Tema;
  textos: { titulo: string; subtitulo: string; sobre: string };
  contato: { whatsapp: string; instagram: string; email: string };
  aprovacaoManualSocio: boolean;
  destinoMensalidade: Torcida["destinoMensalidade"];
}

function whatsappParaCampo(w?: string): string {
  const d = soDigitos(w ?? "");
  return mascaraTelefone(d.length > 11 && d.startsWith("55") ? d.slice(2) : d);
}

function formDe(t: Torcida): Form {
  return {
    tema: { ...TEMA_PADRAO, ...(t.tema ?? {}) },
    textos: { titulo: t.textos?.titulo ?? t.nome, subtitulo: t.textos?.subtitulo ?? "", sobre: t.textos?.sobre ?? "" },
    contato: { whatsapp: whatsappParaCampo(t.contato?.whatsapp), instagram: t.contato?.instagram ?? "", email: t.contato?.email ?? "" },
    aprovacaoManualSocio: !!t.aprovacaoManualSocio,
    modulos: { eventos: t.modulos?.eventos !== false, socios: t.modulos?.socios !== false },
    destinoMensalidade: t.destinoMensalidade ?? "sede_do_socio",
  };
}

const CORES: { chave: keyof Pick<Tema, "corPrimaria" | "corSecundaria" | "corFundo" | "corTexto">; rotulo: string; dica: string }[] = [
  { chave: "corPrimaria", rotulo: "Cor principal", dica: "Botões e destaques" },
  { chave: "corSecundaria", rotulo: "Cor secundária", dica: "Selos e detalhes" },
  { chave: "corFundo", rotulo: "Fundo", dica: "Fundo da página" },
  { chave: "corTexto", rotulo: "Texto", dica: "Cor das letras" },
];


export default function Personalizacao() {
  const { tid, torcida, base } = usePainel();
  const navegar = useNavigate();
  useTourPagina("personalizacao");
  // Site ainda não publicado: depois de salvar, o próximo passo é publicar (vai sozinho para lá)
  const [irPublicar, setIrPublicar] = useState(false);
  const [confirmandoModulos, setConfirmandoModulos] = useState(false);
  const avisar = useToast();
  const [f, setF] = useState<Form>(() => formDe(torcida));
  const [salvando, setSalvando] = useState(false);
  const original = useMemo(() => JSON.stringify(formDe(torcida)), [torcida]);
  const alterado = JSON.stringify(f) !== original;
  // Trocar de página pelo menu ou fechar a aba com alteração não salva pede confirmação.
  useAlteracoesPendentes(alterado);
  // Navega só depois que a tela já vê o salvo (sem "alterações não salvas" no caminho)
  useEffect(() => {
    if (irPublicar && !alterado) {
      setIrPublicar(false);
      navegar(`${base}/publicar`);
    }
  }, [irPublicar, alterado, navegar, base]);

  // A barra fixa de salvar cobre o fim da tela: o botão de ajuda e os avisos sobem a altura dela.
  const barra = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const raiz = document.documentElement;
    const el = barra.current;
    if (!alterado || !el) return;
    const medir = () => raiz.style.setProperty("--folga-inferior", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    medir();
    const obs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    obs?.observe(el);
    return () => {
      obs?.disconnect();
      raiz.style.removeProperty("--folga-inferior");
    };
  }, [alterado]);

  // Botão "Ver prévia" fixo no celular: some quando a prévia já está na tela.
  const [previaVisivel, setPreviaVisivel] = useState(false);
  useEffect(() => {
    const el = document.getElementById("previa");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setPreviaVisivel(!!e?.isIntersecting), { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Se outra pessoa salvar enquanto a tela está aberta e não há alterações locais, acompanha.
  const ultimoOriginal = useRef(original);
  useEffect(() => {
    if (ultimoOriginal.current !== original) {
      if (!alterado) setF(formDe(torcida));
      ultimoOriginal.current = original;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original]);

  const setTema = (k: keyof Tema, v: string | undefined) => setF((x) => ({ ...x, tema: { ...x.tema, [k]: v } }));
  const coresInvalidas = CORES.filter((c) => !corValida(f.tema[c.chave]));
  const avisos = coresInvalidas.length ? [] : avisosDeContraste(f.tema);
  const emailInvalido = !!f.contato.email && !emailValido(f.contato.email);
  const zapDig = soDigitos(f.contato.whatsapp);
  const zapInvalido = !!zapDig && ![10, 11].includes(zapDig.length);

  async function salvar() {
    if (coresInvalidas.length) return avisar("Corrija as cores: use o formato #RRGGBB.", "erro");
    if (emailInvalido || zapInvalido) return avisar("Confira o e-mail e o WhatsApp de contato.", "erro");
    setSalvando(true);
    try {
      const t = f.tema;
      const tema = semIndefinidos({
        corPrimaria: t.corPrimaria.toUpperCase(),
        corSecundaria: t.corSecundaria.toUpperCase(),
        corFundo: t.corFundo.toUpperCase(),
        corTexto: t.corTexto.toUpperCase(),
        logoUrl: t.logoUrl || undefined,
        bannerUrl: t.bannerUrl || undefined,
      });
      await comPrazo(updateDoc(doc(db, `torcidas/${tid}`), {
        tema,
        textos: { titulo: f.textos.titulo.trim(), subtitulo: f.textos.subtitulo.trim(), sobre: f.textos.sobre.trim() },
        contato: {
          whatsapp: zapDig ? numeroWhatsapp(zapDig) : "",
          instagram: f.contato.instagram.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, ""),
          email: f.contato.email.trim().toLowerCase(),
        },
        aprovacaoManualSocio: f.aprovacaoManualSocio,
        modulos: f.modulos,
        destinoMensalidade: f.destinoMensalidade,
      }));
      if (torcida.publicada) avisar("Página atualizada! As mudanças já estão no ar.", "sucesso");
      else if (tema.logoUrl) {
        avisar("Página salva! Agora é só publicar o site.", "sucesso");
        setIrPublicar(true);
      } else avisar("Página salva. Para publicar, falta enviar o escudo da torcida.", "info");
    } catch (e) {
      avisar(mensagemGravacao(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="pb-[calc(6rem+var(--folga-inferior,0px))]">
      <CabecalhoPagina
        titulo="Personalizar página"
        descricao="Cores, imagens, textos e regras da página pública da torcida."
        acoes={
          <>
          <a href="#previa" className="xl:hidden inline-flex items-center gap-1.5 h-11 sm:h-9 px-3.5 rounded-xl text-sm font-semibold bg-superficie-2 hover:bg-superficie-3">
            <Icone nome="olho" className="size-4" /> Ver prévia
          </a>
          <a
            href={`/${torcida.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3.5 rounded-xl text-sm font-semibold border border-linha-forte hover:bg-superficie-2"
          >
            <Icone nome="externo" className="size-4" /> Ver página
          </a>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_400px] items-start">
        <div className="space-y-6 min-w-0">
          <Secao titulo="O que o site vai oferecer" descricao="Ligue pelo menos um. Dá para mudar quando quiser." tour="modulos">
            <div className="space-y-5">
              <Interruptor
                ligado={f.modulos.eventos}
                onChange={(v) => setF((x) => ({ ...x, modulos: { ...x.modulos, eventos: v } }))}
                disabled={f.modulos.eventos && !f.modulos.socios}
                rotulo="Venda de ingressos (Eventos)"
                descricao="Caravanas, festas, jogos: o torcedor compra o ingresso pela página e recebe o QR Code."
              />
              <Interruptor
                ligado={f.modulos.socios}
                onChange={(v) => setF((x) => ({ ...x, modulos: { ...x.modulos, socios: v } }))}
                disabled={f.modulos.socios && !f.modulos.eventos}
                rotulo="Associação de sócios"
                descricao="Planos mensais ou anuais, carteirinha digital e preço de sócio nos eventos."
              />
            </div>
            {torcida.modulos === undefined && !alterado && (
              <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-info/30 bg-info/10 p-4">
                <p className="text-sm text-texto-2 flex-1">Confirme a escolha para concluir este passo (pode deixar os dois ligados).</p>
                <Botao
                  tamanho="sm"
                  icone="check"
                  carregando={confirmandoModulos}
                  onClick={async () => {
                    if (confirmandoModulos) return;
                    setConfirmandoModulos(true);
                    try {
                      await comPrazo(updateDoc(doc(db, `torcidas/${tid}`), { modulos: f.modulos }));
                      avisar("Módulos confirmados.", "sucesso");
                    } catch (e) {
                      avisar(mensagemGravacao(e), "erro");
                    } finally {
                      setConfirmandoModulos(false);
                    }
                  }}
                >
                  Confirmar módulos
                </Botao>
              </div>
            )}
          </Secao>

          <Secao titulo="Cores" descricao="Escolha uma paleta pronta ou ajuste cada cor." tour="cores">
            <div className="flex flex-wrap gap-2 mb-5">
              {PALETAS.map((p) => (
                <button
                  key={p.nome}
                  type="button"
                  onClick={() => setF((x) => ({ ...x, tema: { ...x.tema, ...p.tema } }))}
                  className="inline-flex items-center gap-2 h-11 sm:h-9 pl-2 pr-3 rounded-xl border border-linha bg-superficie-2 hover:border-linha-forte text-sm font-medium"
                >
                  <span className="flex -space-x-1">
                    {[p.tema.corFundo, p.tema.corPrimaria, p.tema.corSecundaria].map((c) => (
                      <span key={c} className="size-4 rounded-full border border-linha-forte" style={{ background: c }} />
                    ))}
                  </span>
                  {p.nome}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {CORES.map((c) => {
                const v = f.tema[c.chave];
                const ok = corValida(v);
                return (
                  <div key={c.chave}>
                    <label className="block text-sm font-medium text-texto-2 mb-1.5" htmlFor={`cor-${c.chave}`}>
                      {c.rotulo} <span className="text-texto-3 font-normal">· {c.dica}</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        aria-label={`${c.rotulo} (seletor)`}
                        value={ok ? v.toLowerCase() : "#000000"}
                        onChange={(e) => setTema(c.chave, e.target.value.toUpperCase())}
                        className="h-12 w-14 shrink-0 rounded-2xl border border-linha bg-superficie-2 p-1.5 cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-xl [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-xl"
                      />
                      <Campo
                        id={`cor-${c.chave}`}
                        value={v}
                        onChange={(t) => {
                          const s = t.trim().toUpperCase();
                          setTema(c.chave, s.startsWith("#") ? s.slice(0, 7) : `#${s}`.slice(0, 7));
                        }}
                        erro={!ok && "Use o formato #RRGGBB"}
                        className="flex-1 [&_input]:font-mono [&_input]:uppercase"
                        maxLength={7}
                        spellCheck={false}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {avisos.length > 0 && (
              <Aviso tom="alerta" titulo="Atenção à leitura" className="mt-4">
                <ul className="list-disc pl-4 space-y-0.5">
                  {avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Aviso>
            )}
          </Secao>

          <Secao titulo="Imagens" tour="imagens">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-[180px_1fr]">
              <SeletorImagem
                rotulo="Escudo / logo"
                url={f.tema.logoUrl}
                onChange={(u) => setTema("logoUrl", u ?? undefined)}
                pasta={`torcidas/${tid}/publico/marca`}
                prefixo="logo"
                ladoMaximo={512}
                proporcao="aspect-square"
                dica="Quadrada, fundo transparente (PNG)."
              />
              <SeletorImagem
                rotulo="Banner do topo"
                url={f.tema.bannerUrl}
                onChange={(u) => setTema("bannerUrl", u ?? undefined)}
                pasta={`torcidas/${tid}/publico/marca`}
                prefixo="banner"
                proporcao="aspect-[16/7]"
                dica="Foto da arquibancada, horizontal (1600×700). Até 5 MB."
              />
            </div>
          </Secao>

          <Secao titulo="Textos" tour="textos">
            <div className="space-y-4">
              <Campo rotulo="Título" value={f.textos.titulo} onChange={(v) => setF((x) => ({ ...x, textos: { ...x.textos, titulo: v } }))} maxLength={60} />
              <Campo
                rotulo="Subtítulo"
                value={f.textos.subtitulo}
                onChange={(v) => setF((x) => ({ ...x, textos: { ...x.textos, subtitulo: v } }))}
                maxLength={140}
                dica={`${f.textos.subtitulo.length}/140`}
              />
              <AreaTexto
                rotulo="Sobre a torcida"
                value={f.textos.sobre}
                onChange={(e) => setF((x) => ({ ...x, textos: { ...x.textos, sobre: e.target.value } }))}
                maxLength={1200}
                dica="Aparece na aba Sócios. Conte a história e por que vale a pena ser sócio."
              />
            </div>
          </Secao>

          <Secao titulo="Contato">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              <Campo
                rotulo="WhatsApp"
                mascara="telefone"
                icone="whatsapp"
                value={f.contato.whatsapp}
                onChange={(v) => setF((x) => ({ ...x, contato: { ...x.contato, whatsapp: v } }))}
                erro={zapInvalido && "Número com DDD"}
                placeholder="(71) 99999-9999"
              />
              <Campo
                rotulo="Instagram"
                icone="instagram"
                value={f.contato.instagram}
                onChange={(v) => setF((x) => ({ ...x, contato: { ...x.contato, instagram: v } }))}
                placeholder="@torcida"
              />
              <Campo
                rotulo="E-mail"
                type="email"
                value={f.contato.email}
                onChange={(v) => setF((x) => ({ ...x, contato: { ...x.contato, email: v } }))}
                erro={emailInvalido && "E-mail inválido"}
              />
            </div>
          </Secao>

          <Secao titulo="Regras de sócio" tour="regras-socio">
            <Interruptor
              ligado={f.aprovacaoManualSocio}
              onChange={(v) => setF((x) => ({ ...x, aprovacaoManualSocio: v }))}
              rotulo="Aprovar novos sócios manualmente"
              descricao="Depois do pagamento, o sócio fica “Em análise” até alguém da diretoria aprovar. Desligado, ele vira ativo na hora."
            />
            <div className="mt-6">
              <p className="text-[15px] font-medium mb-1">Para onde vai a mensalidade</p>
              <p className="text-sm text-texto-3 mb-3">Define quem recebe o valor do plano. A taxa de serviço sempre fica com a torcida.</p>
              <OpcoesCartao
                nome="Destino da mensalidade"
                colunas={1}
                valor={f.destinoMensalidade}
                onChange={(v) => setF((x) => ({ ...x, destinoMensalidade: v }))}
                opcoes={[
                  {
                    valor: "sede_do_socio",
                    titulo: "Sede do sócio",
                    descricao:
                      "O valor do plano cai direto na conta da subsede do sócio quando ela tiver conta de recebimento ativa. Senão, cai na conta da torcida e entra no repasse.",
                    icone: "casa",
                  },
                  { valor: "principal", titulo: "Sede principal", descricao: "Todas as mensalidades ficam na conta da torcida.", icone: "escudo" },
                ]}
              />
            </div>
          </Secao>
        </div>

        <div id="previa" className="xl:sticky xl:top-24 scroll-mt-20" data-tour="previa">
          <p className="text-sm font-semibold text-texto-2 mb-2 flex items-center gap-2">
            <Icone nome="olho" className="size-4" /> Prévia ao vivo
          </p>
          <Previa f={f} />
        </div>
      </div>

      {!previaVisivel && (
        <a
          href="#previa"
          className="xl:hidden fixed z-30 left-4 lg:left-[288px] bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--folga-inferior,0px))] inline-flex items-center gap-2 h-12 px-4 rounded-full bg-superficie-3 text-texto text-sm font-semibold border border-linha-forte shadow-[0_10px_30px_-8px_rgba(0,0,0,.6)] animate-deslizar"
        >
          <Icone nome="olho" className="size-5" /> Ver prévia
        </a>
      )}

      {alterado && (
        <div
          ref={barra}
          className="fixed bottom-0 inset-x-0 lg:left-[272px] z-30 border-t border-linha bg-fundo/95 backdrop-blur px-4 sm:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] animate-deslizar"
        >
          <div className="max-w-[1400px] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:justify-end">
            <p className="text-sm text-texto-2 sm:mr-auto text-center sm:text-left" role="status">
              Você tem alterações não salvas.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Botao variante="fantasma" onClick={() => setF(formDe(torcida))} disabled={salvando} className="w-full sm:w-auto">
                Descartar
              </Botao>
              <Botao icone="check" onClick={salvar} carregando={salvando} disabled={coresInvalidas.length > 0} className="w-full sm:w-auto">
                Salvar alterações
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Secao({ titulo, descricao, children, tour }: { titulo: string; descricao?: string; children: ReactNode; tour?: string }) {
  return (
    <Cartao className="p-5 sm:p-6" data-tour={tour}>
      <h2 className="font-bold text-lg">{titulo}</h2>
      {descricao && <p className="text-sm text-texto-3 mt-0.5">{descricao}</p>}
      <div className="mt-4">{children}</div>
    </Cartao>
  );
}

// Na prévia, as variáveis --color-* derivadas ficam presas ao :root; use as --cor-* direto.
const BRILHO = "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--cor-primaria) 35%, transparent), transparent 70%)";
const GRADE = {
  backgroundImage:
    "linear-gradient(color-mix(in oklab, var(--cor-texto) 11%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--cor-texto) 11%, transparent) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
  maskImage: "radial-gradient(ellipse at top, black 30%, transparent 75%)",
};

/** Mini-mockup da página pública com as cores aplicadas só dentro do container. */
function Previa({ f }: { f: Form }) {
  const { tid, torcida, pct } = usePainel();
  const ref = useRef<HTMLDivElement>(null);
  const [aba, setAba] = useState<"eventos" | "socios">("eventos");
  const planos = useColecao<Plano>(collection(db, `torcidas/${tid}/planos`), `previa-planos-${tid}`);
  const plano = useMemo(
    () => [...planos.dados].filter((p) => p.ativo).sort((a, b) => Number(!!b.destaque) - Number(!!a.destaque) || (a.ordem ?? 99) - (b.ordem ?? 99))[0],
    [planos.dados],
  );

  useEffect(() => {
    if (!ref.current) return;
    aplicarTema(f.tema, ref.current);
    // aplicarTema também ajusta a cor da barra do navegador; mantém a do painel.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", temaDoPainel(torcida.tema).corFundo);
  }, [f.tema, torcida.tema]);

  // Prévia com os próximos eventos publicados de verdade (2 leituras); sem nenhum, mostra um exemplo marcado.
  const agora = useMemo(() => Timestamp.now(), []);
  const eventos = useColecao<Evento>(
    query(collection(db, `torcidas/${tid}/eventos`), where("status", "==", "publicado"), where("data", ">=", agora), orderBy("data"), limit(2)),
    `previa-eventos-${tid}`,
  );
  const [ev1, ev2] = eventos.dados;
  const exemplo = !ev1 && !eventos.carregando;
  const quaseLotado = !!ev1?.capacidade && (ev1.vendidos + (ev1.reservados ?? 0)) / ev1.capacidade >= 0.8;

  const t = f.textos;
  const valorPlano = plano?.valor ?? 1000;
  const sobre = t.sobre || "Conte aqui a história da torcida.";

  return (
    <div className="mx-auto w-full max-w-[380px] rounded-[34px] border border-linha-forte bg-superficie p-2.5 shadow-2xl">
      <div ref={ref} className="bg-fundo text-texto rounded-[26px] overflow-hidden h-[640px] overflow-y-auto sem-rolagem relative" aria-label="Prévia da página pública">
        {/* Hero */}
        <div className="relative">
          <div className="h-40 relative overflow-hidden">
            {f.tema.bannerUrl ? (
              <img src={f.tema.bannerUrl} alt="" width={380} height={160} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: BRILHO }}>
                <div className="absolute inset-0" style={GRADE} />
              </div>
            )}
            <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-fundo" />
          </div>
          <div className="px-5 -mt-10 relative">
            {f.tema.logoUrl ? (
              <img src={f.tema.logoUrl} alt="" width={64} height={64} loading="lazy" decoding="async" className="size-16 rounded-2xl object-contain border-2 border-fundo bg-superficie-2" />
            ) : (
              // sem escudo: iniciais da torcida na cor dela (igual ao site da torcida)
              <span className="size-16 rounded-2xl grid place-items-center bg-primaria text-sobre-primaria border-2 border-fundo font-display text-2xl leading-none" aria-hidden="true">
                {iniciaisTorcida(torcida.nome)}
              </span>
            )}
            <p className="mt-3 text-[22px] font-display leading-tight uppercase tracking-tight">{t.titulo || torcida.nome}</p>
            {t.subtitulo && <p className="text-sm text-texto-2 mt-1 leading-snug">{t.subtitulo}</p>}
            <div className="flex gap-2 mt-4">
              <span className="h-9 px-4 rounded-xl bg-primaria text-sobre-primaria text-sm font-semibold inline-flex items-center">Seja sócio</span>
              <span className="h-9 px-4 rounded-xl border border-linha-forte text-sm font-semibold inline-flex items-center">Eventos</span>
            </div>
          </div>
        </div>

        {/* Abas */}
        <div className="px-5 mt-5">
          <div className="flex p-1 rounded-2xl bg-superficie-2 border border-linha">
            {(["eventos", "socios"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAba(a)}
                className={cx("flex-1 h-9 rounded-xl text-sm font-semibold", aba === a ? "bg-primaria text-sobre-primaria" : "text-texto-2")}
              >
                {a === "eventos" ? "Eventos" : "Sócios"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-5 space-y-3">
          {aba === "eventos" ? (
            <>
              {exemplo && <p className="text-xs text-texto-3">Exemplo: assim vai aparecer quando você publicar um evento.</p>}
              <div className="rounded-cartao border border-linha bg-superficie overflow-hidden">
                <div className="h-24 relative overflow-hidden" style={{ background: BRILHO }}>
                  {ev1?.imagemUrl && <img src={ev1.imagemUrl} alt="" width={340} height={96} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />}
                  <span className="absolute top-3 left-3 rounded-xl bg-fundo/80 backdrop-blur px-2.5 py-1.5 text-center leading-none">
                    <span className="block text-base font-bold">{ev1 ? diaDoMes(ev1.data) : "18"}</span>
                    <span className="block text-[10px] font-semibold text-texto-2 mt-0.5">{ev1 ? mesAbrev(ev1.data) : "OUT"}</span>
                  </span>
                  {exemplo ? (
                    <span className="absolute top-3 right-3 rounded-full bg-fundo/80 text-texto text-[11px] font-bold px-2 py-0.5">Exemplo</span>
                  ) : (
                    quaseLotado && <span className="absolute top-3 right-3 rounded-full bg-secundaria text-sobre-secundaria text-[11px] font-bold px-2 py-0.5">Últimas vagas</span>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-semibold line-clamp-2 break-words">{ev1 ? ev1.nome : eventos.carregando ? "…" : "Caravana para a Final"}</p>
                  <p className="text-xs text-texto-3 mt-0.5 flex items-center gap-1 min-w-0">
                    <Icone nome="local" className="size-3.5 shrink-0" />
                    <span className="truncate">{ev1 ? [ev1.local, hora(ev1.data)].filter(Boolean).join(" · ") : "Saída da Sede Central · 13h"}</span>
                  </p>
                  <div className="flex items-end justify-between mt-3">
                    <div>
                      <p className="text-[11px] text-texto-3">Sócio a partir de</p>
                      <p className="font-bold text-primaria-texto">{moeda((ev1?.valorSocio ?? 12000) + taxa(ev1?.valorSocio ?? 12000, pct))}</p>
                    </div>
                    <span className="h-8 px-3 rounded-lg bg-primaria text-sobre-primaria text-xs font-semibold inline-flex items-center">Comprar</span>
                  </div>
                </div>
              </div>
              {(exemplo || ev2) && (
                <div className="rounded-cartao border border-linha bg-superficie p-4 flex gap-3 items-center opacity-80">
                  <span className="size-11 shrink-0 rounded-xl bg-superficie-2 grid place-items-center text-center leading-none">
                    <span>
                      <span className="block text-sm font-bold">{ev2 ? diaDoMes(ev2.data) : "25"}</span>
                      <span className="block text-[9px] text-texto-3 font-semibold">{ev2 ? mesAbrev(ev2.data) : "OUT"}</span>
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{ev2 ? ev2.nome : "Churrasco do Distrito"}</p>
                    <p className="text-xs text-texto-3 truncate">{ev2 ? [ev2.local, hora(ev2.data)].filter(Boolean).join(" · ") : "Quadra do bairro · 12h"}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-cartao border border-primaria/50 bg-superficie p-4 ring-1 ring-primaria/30">
                <span className="inline-block rounded-full bg-secundaria text-sobre-secundaria text-[11px] font-bold px-2 py-0.5">Mais escolhido</span>
                <p className="font-bold text-lg mt-2">{plano?.nome ?? "Sócio Mensal"}</p>
                <p className="mt-1">
                  <span className="text-2xl font-bold">{moeda(valorPlano + taxa(valorPlano, pct))}</span>
                  <span className="text-xs text-texto-3"> {plano ? periodicidadeCurta(plano.intervalo, plano.intervaloQtd) : "/mês"}</span>
                </p>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {(plano?.beneficios?.length ? plano.beneficios.slice(0, 3) : ["Preço de sócio nos eventos", "Carteirinha digital"]).map((b) => (
                    <li key={b} className="flex gap-1.5 text-texto-2">
                      <Icone nome="check" className="size-3.5 text-primaria-texto shrink-0 mt-px" />
                      {b}
                    </li>
                  ))}
                </ul>
                <span className="mt-4 h-10 w-full rounded-xl bg-primaria text-sobre-primaria text-sm font-semibold grid place-items-center">Quero ser sócio</span>
              </div>
              <div className="rounded-cartao border border-linha bg-superficie p-4">
                <p className="text-sm font-semibold mb-1">Sobre a torcida</p>
                <p className="text-xs text-texto-2 leading-relaxed line-clamp-5 whitespace-pre-line">{sobre}</p>
              </div>
            </>
          )}
          {(f.contato.whatsapp || f.contato.instagram) && (
            <div className="flex gap-2 pt-1">
              {f.contato.whatsapp && (
                <span className="size-9 rounded-xl bg-superficie-2 grid place-items-center text-texto-2">
                  <Icone nome="whatsapp" className="size-4" />
                </span>
              )}
              {f.contato.instagram && (
                <span className="size-9 rounded-xl bg-superficie-2 grid place-items-center text-texto-2">
                  <Icone nome="instagram" className="size-4" />
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
