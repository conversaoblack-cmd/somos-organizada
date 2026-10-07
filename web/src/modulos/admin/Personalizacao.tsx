import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { collection, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
import { emailValido, mascaraTelefone, moeda, periodicidadeCurta, soDigitos, taxa } from "@/lib/formatos";
import { aplicarTema, avisosDeContraste, corValida, TEMA_PADRAO, TEMA_PAINEL } from "@/lib/tema";
import type { Plano, Tema, Torcida } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Cartao, cx, Icone, Interruptor, OpcoesCartao, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { numeroWhatsapp, SeletorImagem, semIndefinidos } from "./util";

interface Form {
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
    destinoMensalidade: t.destinoMensalidade ?? "sede_do_socio",
  };
}

const CORES: { chave: keyof Pick<Tema, "corPrimaria" | "corSecundaria" | "corFundo" | "corTexto">; rotulo: string; dica: string }[] = [
  { chave: "corPrimaria", rotulo: "Cor principal", dica: "Botões e destaques" },
  { chave: "corSecundaria", rotulo: "Cor secundária", dica: "Selos e detalhes" },
  { chave: "corFundo", rotulo: "Fundo", dica: "Fundo da página" },
  { chave: "corTexto", rotulo: "Texto", dica: "Cor das letras" },
];

const PALETAS: { nome: string; tema: Pick<Tema, "corPrimaria" | "corSecundaria" | "corFundo" | "corTexto"> }[] = [
  { nome: "Verde e amarelo", tema: { corPrimaria: "#009C3B", corSecundaria: "#FFDF00", corFundo: "#07090B", corTexto: "#F2F5F3" } },
  { nome: "Rubro-negro", tema: { corPrimaria: "#D7141A", corSecundaria: "#F5F5F5", corFundo: "#0B0B0C", corTexto: "#F4F4F5" } },
  { nome: "Alvinegro", tema: { corPrimaria: "#FFFFFF", corSecundaria: "#9CA3AF", corFundo: "#050505", corTexto: "#F5F5F5" } },
  { nome: "Tricolor", tema: { corPrimaria: "#1D4ED8", corSecundaria: "#DC2626", corFundo: "#0A0E1A", corTexto: "#F1F5F9" } },
  { nome: "Celeste", tema: { corPrimaria: "#38BDF8", corSecundaria: "#FFFFFF", corFundo: "#06121D", corTexto: "#EEF6FB" } },
  { nome: "Claro", tema: { corPrimaria: "#0F7A3B", corSecundaria: "#E8B100", corFundo: "#F7F7F5", corTexto: "#141414" } },
];

export default function Personalizacao() {
  const { tid, torcida } = usePainel();
  const avisar = useToast();
  const [f, setF] = useState<Form>(() => formDe(torcida));
  const [salvando, setSalvando] = useState(false);
  const original = useMemo(() => JSON.stringify(formDe(torcida)), [torcida]);
  const alterado = JSON.stringify(f) !== original;

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
      await updateDoc(doc(db, `torcidas/${tid}`), {
        tema,
        textos: { titulo: f.textos.titulo.trim(), subtitulo: f.textos.subtitulo.trim(), sobre: f.textos.sobre.trim() },
        contato: {
          whatsapp: zapDig ? numeroWhatsapp(zapDig) : "",
          instagram: f.contato.instagram.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, ""),
          email: f.contato.email.trim().toLowerCase(),
        },
        aprovacaoManualSocio: f.aprovacaoManualSocio,
        destinoMensalidade: f.destinoMensalidade,
      });
      avisar("Página atualizada! As mudanças já estão no ar.", "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="pb-24">
      <CabecalhoPagina
        titulo="Personalizar página"
        descricao="Cores, imagens, textos e regras da página pública da torcida."
        acoes={
          <a
            href={`/${torcida.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold border border-linha-forte hover:bg-superficie-2"
          >
            <Icone nome="externo" className="size-4" /> Ver página
          </a>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_400px] items-start">
        <div className="space-y-6 min-w-0">
          <Secao titulo="Cores" descricao="Escolha uma paleta pronta ou ajuste cada cor.">
            <div className="flex flex-wrap gap-2 mb-5">
              {PALETAS.map((p) => (
                <button
                  key={p.nome}
                  type="button"
                  onClick={() => setF((x) => ({ ...x, tema: { ...x.tema, ...p.tema } }))}
                  className="inline-flex items-center gap-2 h-9 pl-2 pr-3 rounded-xl border border-linha bg-superficie-2 hover:border-linha-forte text-sm font-medium"
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
            <div className="grid gap-4 sm:grid-cols-2">
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

          <Secao titulo="Imagens">
            <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
              <SeletorImagem
                rotulo="Escudo / logo"
                url={f.tema.logoUrl}
                onChange={(u) => setTema("logoUrl", u ?? undefined)}
                pasta={`torcidas/${tid}/publico/marca`}
                prefixo="logo"
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

          <Secao titulo="Textos">
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
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
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

          <Secao titulo="Regras de sócio">
            <Interruptor
              ligado={f.aprovacaoManualSocio}
              onChange={(v) => setF((x) => ({ ...x, aprovacaoManualSocio: v }))}
              rotulo="Aprovar novos sócios manualmente"
              descricao="Depois do pagamento, o sócio fica “Em análise” até alguém da diretoria aprovar. Desligado, ele vira ativo na hora."
            />
            <div className="mt-6">
              <p className="text-[15px] font-medium mb-1">Para onde vai a mensalidade</p>
              <p className="text-sm text-texto-3 mb-3">Define em qual extrato entra o valor base das mensalidades. A taxa de serviço sempre fica com a diretoria.</p>
              <OpcoesCartao
                nome="Destino da mensalidade"
                valor={f.destinoMensalidade}
                onChange={(v) => setF((x) => ({ ...x, destinoMensalidade: v }))}
                opcoes={[
                  { valor: "sede_do_socio", titulo: "Sede do sócio", descricao: "Cada subsede recebe as mensalidades dos seus sócios.", icone: "casa" },
                  { valor: "principal", titulo: "Sede principal", descricao: "Todas as mensalidades ficam com a diretoria.", icone: "escudo" },
                ]}
              />
            </div>
          </Secao>
        </div>

        <div className="xl:sticky xl:top-24">
          <p className="text-sm font-semibold text-texto-2 mb-2 flex items-center gap-2">
            <Icone nome="olho" className="size-4" /> Prévia ao vivo
          </p>
          <Previa f={f} />
        </div>
      </div>

      {alterado && (
        <div className="fixed bottom-0 inset-x-0 lg:left-[272px] z-30 border-t border-linha bg-fundo/90 backdrop-blur px-4 sm:px-6 py-3 animate-deslizar">
          <div className="max-w-[1400px] flex items-center gap-3 justify-end">
            <p className="text-sm text-texto-2 mr-auto hidden sm:block">Você tem alterações não salvas.</p>
            <Botao variante="fantasma" onClick={() => setF(formDe(torcida))} disabled={salvando}>
              Descartar
            </Botao>
            <Botao icone="check" onClick={salvar} carregando={salvando} disabled={coresInvalidas.length > 0}>
              Salvar alterações
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <Cartao className="p-5 sm:p-6">
      <h2 className="font-bold text-lg">{titulo}</h2>
      {descricao && <p className="text-sm text-texto-3 mt-0.5">{descricao}</p>}
      <div className="mt-4">{children}</div>
    </Cartao>
  );
}

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
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", TEMA_PAINEL.corFundo);
  }, [f.tema]);

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
              <img src={f.tema.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="absolute inset-0 brilho-primaria">
                <div className="absolute inset-0 grade-fundo" />
              </div>
            )}
            <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-fundo" />
          </div>
          <div className="px-5 -mt-10 relative">
            {f.tema.logoUrl ? (
              <img src={f.tema.logoUrl} alt="" className="size-16 rounded-2xl object-cover border-2 border-fundo bg-superficie-2" />
            ) : (
              <span className="size-16 rounded-2xl grid place-items-center bg-primaria text-sobre-primaria border-2 border-fundo">
                <Icone nome="escudo" className="size-8" />
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
              <div className="rounded-cartao border border-linha bg-superficie overflow-hidden">
                <div className="h-24 brilho-primaria relative">
                  <span className="absolute top-3 left-3 rounded-xl bg-fundo/80 backdrop-blur px-2.5 py-1.5 text-center leading-none">
                    <span className="block text-base font-bold">18</span>
                    <span className="block text-[10px] font-semibold text-texto-2 mt-0.5">OUT</span>
                  </span>
                  <span className="absolute top-3 right-3 rounded-full bg-secundaria text-sobre-secundaria text-[11px] font-bold px-2 py-0.5">Últimas vagas</span>
                </div>
                <div className="p-4">
                  <p className="font-semibold">Caravana para a Final</p>
                  <p className="text-xs text-texto-3 mt-0.5 flex items-center gap-1">
                    <Icone nome="local" className="size-3.5" /> Saída da Sede Central · 13h
                  </p>
                  <div className="flex items-end justify-between mt-3">
                    <div>
                      <p className="text-[11px] text-texto-3">Sócio a partir de</p>
                      <p className="font-bold text-primaria">{moeda(12000 + taxa(12000, pct))}</p>
                    </div>
                    <span className="h-8 px-3 rounded-lg bg-primaria text-sobre-primaria text-xs font-semibold inline-flex items-center">Comprar</span>
                  </div>
                </div>
              </div>
              <div className="rounded-cartao border border-linha bg-superficie p-4 flex gap-3 items-center opacity-80">
                <span className="size-11 rounded-xl bg-superficie-2 grid place-items-center text-center leading-none">
                  <span>
                    <span className="block text-sm font-bold">25</span>
                    <span className="block text-[9px] text-texto-3 font-semibold">OUT</span>
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">Churrasco do Distrito</p>
                  <p className="text-xs text-texto-3">Quadra do bairro · 12h</p>
                </div>
              </div>
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
                      <Icone nome="check" className="size-3.5 text-primaria shrink-0 mt-px" />
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
