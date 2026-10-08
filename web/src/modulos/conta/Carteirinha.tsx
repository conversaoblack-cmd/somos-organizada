import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as PE } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { mensagemDeErro } from "@/lib/api";
import { dataCurta, dataExtensa, hora, iniciais, moeda, paraData, periodicidadeCurta, taxa } from "@/lib/formatos";
import type { ComId, Ingresso, Plano, Socio, Torcida } from "@/lib/tipos";
import { useDocumento } from "@/hooks/dados";
import { Aviso, Botao, BotaoLink, Cartao, cx, Girando, Icone, QrCode } from "@/ui";
import { buscarQrCarteirinha, usePagarMensalidade } from "./acoes";
import { AvisoFalhaCartao, useFalhaCobranca } from "./CartaoCobranca";
import {
  diasParaVencer,
  mesAno,
  ROTULO_SITUACAO,
  situacaoDoSocio,
  useFotoSocio,
  useRelogio,
  useTelaAcesa,
  type Situacao,
} from "./comum";

const COR_PONTO: Record<Situacao, string> = {
  em_dia: "bg-sucesso",
  vencida: "bg-alerta",
  pendente: "bg-texto-3",
  analise: "bg-info",
  suspenso: "bg-perigo",
  cancelado: "bg-texto-3",
  inadimplente: "bg-alerta",
};

const CARIMBO: Partial<Record<Situacao, string>> = {
  vencida: "Vencida",
  inadimplente: "Inadimplente",
  analise: "Em análise",
  suspenso: "Suspensa",
  cancelado: "Cancelada",
  pendente: "Aguardando pagamento",
};

/** Textura sutil (ruído) em SVG — dá cara de cartão impresso. */
const RUIDO =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const FUNDO_CARTAO: CSSProperties = {
  backgroundColor: "var(--color-primaria)",
  backgroundImage: [
    // brilho que acompanha o dedo/mouse
    "radial-gradient(circle at var(--mx, 30%) var(--my, 0%), rgb(255 255 255 / .28), transparent 42%)",
    // faixa diagonal com a cor secundária (a "faixa da torcida")
    "linear-gradient(122deg, transparent 71%, color-mix(in oklab, var(--color-secundaria) 88%, transparent) 71% 73.5%, transparent 73.5% 75.5%, color-mix(in oklab, var(--color-secundaria) 50%, transparent) 75.5% 76.4%, transparent 76.4%)",
    // guilhochê
    "repeating-linear-gradient(135deg, rgb(255 255 255 / .05) 0 1.5px, transparent 1.5px 8px)",
    "radial-gradient(120% 70% at 100% 0%, color-mix(in oklab, var(--color-secundaria) 45%, transparent), transparent 55%)",
    "linear-gradient(165deg, color-mix(in oklab, var(--color-primaria), black 8%) 0%, color-mix(in oklab, var(--color-primaria), black 52%) 62%, color-mix(in oklab, var(--color-primaria), black 74%) 100%)",
  ].join(","),
};

function Logo({ torcida, className }: { torcida: Torcida; className?: string }) {
  return torcida.tema.logoUrl ? (
    <img src={torcida.tema.logoUrl} alt="" className={cx("object-contain", className)} />
  ) : (
    <span className={cx("grid place-items-center rounded-xl bg-white/15 font-display text-white", className)}>{iniciais(torcida.nome)}</span>
  );
}

function Foto({ nome, url, className }: { nome: string; url: string | null; className?: string }) {
  return url ? (
    <img src={url} alt={`Foto de ${nome}`} className={cx("object-cover", className)} />
  ) : (
    <span className={cx("grid place-items-center bg-white/12 font-display text-4xl text-white/90", className)} aria-label="Sem foto">
      {iniciais(nome)}
    </span>
  );
}

function SeloCartao({ situacao }: { situacao: Situacao }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 backdrop-blur px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white ring-1 ring-white/15">
      <span className={cx("size-2 rounded-full", COR_PONTO[situacao], situacao === "em_dia" && "so-pulso")} />
      {ROTULO_SITUACAO[situacao]}
    </span>
  );
}

function Chip() {
  return (
    <span
      aria-hidden="true"
      className="relative block h-7 w-10 rounded-md ring-1 ring-black/20 overflow-hidden"
      style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--color-secundaria), white 35%), color-mix(in oklab, var(--color-secundaria), black 25%))" }}
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-black/25" />
      <span className="absolute inset-y-0 left-1/3 w-px bg-black/25" />
      <span className="absolute inset-y-0 right-1/3 w-px bg-black/25" />
      <span className="absolute inset-[30%] rounded-sm ring-1 ring-black/25" />
    </span>
  );
}

/** Cartão 3D: frente com os dados, verso com o QR. */
export function CartaoSocio({
  ficha,
  torcida,
  fotoUrl,
  virado,
  onVirar,
  qr,
}: {
  ficha: ComId<Socio>;
  torcida: Torcida;
  fotoUrl: string | null;
  virado: boolean;
  onVirar: () => void;
  qr: { valor: string | null; carregando: boolean; erro: string | null };
}) {
  const situacao = situacaoDoSocio(ficha);
  const emDia = situacao === "em_dia";
  const ref = useRef<HTMLDivElement>(null);
  const agora = useRelogio(virado);

  function mover(e: PE<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    el.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
  }
  function sair() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  const face = "absolute inset-0 rounded-[26px] overflow-hidden [backface-visibility:hidden] [-webkit-backface-visibility:hidden]";

  return (
    <div className="[perspective:1600px] so-entrar" ref={ref} onPointerMove={mover} onPointerLeave={sair}>
      <div
        className="transition-transform duration-300 ease-out [transform-style:preserve-3d]"
        style={{ transform: "rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))" }}
      >
        <button
          type="button"
          onClick={onVirar}
          aria-label={virado ? "Mostrar frente da carteirinha" : "Virar carteirinha e mostrar o QR Code"}
          aria-pressed={virado}
          className="relative block w-full aspect-[54/86] text-left [transform-style:preserve-3d] transition-transform duration-[800ms] [transition-timing-function:cubic-bezier(.2,.8,.2,1)] rounded-[26px] focus-visible:outline-offset-4"
          style={{ transform: virado ? "rotateY(180deg)" : "none" }}
        >
          {/* ── Frente ── */}
          <div
            className={cx(face, "text-white shadow-[0_30px_80px_-24px_var(--color-primaria),0_10px_30px_-10px_rgb(0_0_0/.6)] ring-1 ring-white/15")}
            style={FUNDO_CARTAO}
          >
            <div className="absolute inset-0 opacity-[.22] mix-blend-overlay pointer-events-none" style={{ backgroundImage: RUIDO }} />
            <div className={cx("absolute inset-0 so-reflexo overflow-hidden", !emDia && "hidden")} />
            {/* marca d'água */}
            <div className="absolute -right-10 bottom-16 opacity-[.07] pointer-events-none select-none">
              <Logo torcida={torcida} className="size-64 text-[110px] !bg-transparent" />
            </div>

            <div className={cx("relative h-full flex flex-col p-5 sm:p-6", !emDia && "grayscale-[.85] opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Logo torcida={torcida} className="size-10 shrink-0 text-sm" />
                  <div className="min-w-0">
                    <p className="font-display text-[15px] leading-tight uppercase tracking-wide truncate [text-shadow:0_1px_8px_rgb(0_0_0/.35)]">{torcida.nome}</p>
                    <p className="text-[10px] font-bold uppercase tracking-[.22em] text-white/70">Sócio oficial</p>
                  </div>
                </div>
                <Chip />
              </div>

              <div className="mt-[7%] flex flex-col items-center text-center">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-[22px] bg-gradient-to-b from-white/50 to-white/5" />
                  <Foto nome={ficha.nome} url={fotoUrl} className="relative w-[118px] aspect-[3/4] rounded-[18px] shadow-xl" />
                </div>
                <p className="mt-4 font-display text-[22px] sm:text-2xl leading-[1.1] uppercase tracking-tight line-clamp-2 [text-shadow:0_2px_14px_rgb(0_0_0/.35)]">
                  {ficha.nome}
                </p>
                <p className="mt-1.5 font-mono text-sm tracking-[.3em] text-white/85 numeros">Nº {ficha.matricula ?? "— — —"}</p>
                <div className="mt-3">
                  <SeloCartao situacao={situacao} />
                </div>
              </div>

              <div className="mt-auto grid grid-cols-3 gap-2 rounded-2xl bg-black/25 backdrop-blur-sm ring-1 ring-white/10 px-3 py-2.5">
                {[
                  ["Plano", ficha.planoNome.replace(/^Sócio\s+/i, "")],
                  ["Sócio desde", mesAno(ficha.criadoEm)],
                  ["Válida até", ficha.validoAte ? dataCurta(ficha.validoAte) : "—"],
                ].map(([r, v]) => (
                  <div key={r} className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/60">{r}</p>
                    <p className="text-[13px] font-semibold truncate numeros">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-white/75">
                <Icone nome="atualizar" className="size-3.5" /> Toque para ver o QR de conferência
              </p>
            </div>

            {CARIMBO[situacao] && (
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <span className="-rotate-12 rounded-xl border-[3px] border-white/85 px-4 py-1.5 font-display text-2xl uppercase tracking-wider text-white/90 bg-black/30 backdrop-blur-[2px]">
                  {CARIMBO[situacao]}
                </span>
              </div>
            )}
          </div>

          {/* ── Verso ── */}
          <div className={cx(face, "bg-superficie ring-1 ring-linha-forte [transform:rotateY(180deg)] text-texto")}>
            <div className="absolute inset-x-0 top-0 h-24 opacity-90" style={FUNDO_CARTAO} />
            <div className="relative h-full flex flex-col items-center p-5 sm:p-6">
              <div className="w-full flex items-center justify-between text-white">
                <div className="flex items-center gap-2 min-w-0">
                  <Logo torcida={torcida} className="size-8 text-xs" />
                  <p className="font-display text-sm uppercase truncate">{torcida.nome}</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[.2em] text-white/80">Conferência</span>
              </div>

              <div className="mt-6 w-[78%] max-w-[260px]">
                {emDia && qr.valor ? (
                  <div className="so-borda-viva rounded-[22px] p-[3px] shadow-2xl">
                    <QrCode valor={qr.valor} className="rounded-[19px] p-3" />
                  </div>
                ) : (
                  <div className="aspect-square rounded-[22px] bg-superficie-2 border border-linha grid place-items-center text-center p-6">
                    {qr.carregando ? (
                      <Girando className="size-8 text-primaria" />
                    ) : (
                      <div>
                        <Icone nome="cadeado" className="size-9 mx-auto text-texto-3" />
                        <p className="mt-3 text-sm text-texto-2">
                          {!emDia ? "O QR fica disponível com a mensalidade em dia." : (qr.erro ?? "QR indisponível no momento.")}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <p className="mt-5 font-bold text-lg leading-tight text-center line-clamp-2">{ficha.nome}</p>
              <p className="font-mono text-sm tracking-[.25em] text-texto-2 numeros">Nº {ficha.matricula ?? "—"}</p>

              <div className="mt-auto w-full flex items-center justify-between rounded-2xl bg-superficie-2 border border-linha px-4 py-3">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-texto-2">
                  <span className={cx("size-2 rounded-full", emDia ? "bg-sucesso so-pulso" : "bg-texto-3")} />
                  {emDia ? "Ao vivo" : ROTULO_SITUACAO[situacao]}
                </span>
                <span className="font-mono text-lg font-bold numeros">
                  {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-texto-3 text-center">O relógio em movimento mostra que não é um print.</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

/** Modo apresentação: fundo branco, QR enorme, tela acesa e em tela cheia. */
function TelaCheia({
  ficha,
  torcida,
  fotoUrl,
  qr,
  fechar,
}: {
  ficha: ComId<Socio>;
  torcida: Torcida;
  fotoUrl: string | null;
  qr: string;
  fechar: () => void;
}) {
  useTelaAcesa(true);
  const agora = useRelogio(true);
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  useEffect(() => {
    const el = document.documentElement;
    el.requestFullscreen?.().catch(() => undefined);
    // Sair da tela cheia pelo gesto do sistema também fecha o modo apresentação.
    const aoSairTelaCheia = () => !document.fullscreenElement && fecharRef.current();
    document.addEventListener("fullscreenchange", aoSairTelaCheia);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fecharRef.current();
    window.addEventListener("keydown", esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", aoSairTelaCheia);
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = antes;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-white text-neutral-900 flex flex-col animate-surgir" role="dialog" aria-modal="true" aria-label="Carteirinha em tela cheia">
      <div className="h-2 shrink-0" style={{ background: "linear-gradient(90deg, var(--color-primaria), var(--color-secundaria))" }} />
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {torcida.tema.logoUrl ? <img src={torcida.tema.logoUrl} alt="" className="size-9 object-contain" /> : null}
          <p className="font-display uppercase text-base truncate">{torcida.nome}</p>
        </div>
        <button type="button" onClick={fechar} className="size-12 grid place-items-center rounded-full bg-neutral-100 active:scale-95" aria-label="Fechar tela cheia">
          <Icone nome="x" className="size-6" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 px-5 pb-6 overflow-y-auto">
        <div className="flex items-center gap-4 w-full max-w-md">
          {fotoUrl ? (
            <img src={fotoUrl} alt="" className="w-20 aspect-[3/4] rounded-2xl object-cover shadow-lg" />
          ) : (
            <span className="w-20 aspect-[3/4] rounded-2xl grid place-items-center bg-neutral-100 font-display text-2xl">{iniciais(ficha.nome)}</span>
          )}
          <div className="min-w-0">
            <p className="font-display text-2xl leading-tight uppercase line-clamp-2">{ficha.nome}</p>
            <p className="font-mono tracking-[.25em] text-neutral-600 mt-1">Nº {ficha.matricula}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-neutral-900 text-white px-3 py-1 text-xs font-bold uppercase tracking-wider">
              <span className="size-2 rounded-full bg-white so-pulso" /> Sócio em dia
            </span>
          </div>
        </div>
        <div className="so-borda-viva rounded-[30px] p-1.5 w-[min(84vw,58dvh,440px)]">
          <QrCode valor={qr} className="rounded-[24px] p-4" />
        </div>
        <div className="text-center">
          <p className="font-mono text-4xl font-bold numeros tracking-tight">
            {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-sm text-neutral-500 mt-1">Válida até {dataCurta(ficha.validoAte)} · aumente o brilho da tela</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BarraValidade({ ficha }: { ficha: Socio }) {
  const dias = diasParaVencer(ficha);
  const fim = paraData(ficha.validoAte);
  if (dias == null || !fim) return null;
  const meses = ficha.intervalo === "ano" ? ficha.intervaloQtd * 12 : ficha.intervaloQtd;
  const total = meses * 30.44;
  const pct = Math.max(0, Math.min(100, (dias / total) * 100));
  const tom = dias <= 0 ? "bg-perigo" : dias <= 7 ? "bg-alerta" : "bg-sucesso";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-texto-2">Validade</span>
        <span className="font-semibold numeros">
          {dias > 1 ? `faltam ${dias} dias` : dias === 1 ? "vence amanhã" : dias === 0 ? "vence hoje" : `venceu há ${-dias} dia${dias === -1 ? "" : "s"}`}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-superficie-3 overflow-hidden">
        <div className={cx("h-full rounded-full transition-all", tom)} style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-texto-3">Até {dataCurta(fim)}</p>
    </div>
  );
}

export default function AbaCarteirinha({
  tid,
  torcida,
  ficha,
  proximo,
}: {
  tid: string;
  torcida: ComId<Torcida>;
  ficha: ComId<Socio>;
  proximo: ComId<Ingresso> | null;
}) {
  const situacao = situacaoDoSocio(ficha);
  const emDia = situacao === "em_dia";
  const fotoUrl = useFotoSocio(ficha.fotoPath);
  const [virado, setVirado] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const [qr, setQr] = useState<{ valor: string | null; carregando: boolean; erro: string | null }>({ valor: null, carregando: false, erro: null });
  const { pagar, carregando: pagando } = usePagarMensalidade(tid, torcida.slug, ficha);
  const plano = useDocumento<Plano>(`torcidas/${tid}/planos/${ficha.planoId}`).dados;
  const falhaCartao = useFalhaCobranca(tid, ficha);
  const dias = diasParaVencer(ficha);

  useEffect(() => {
    if (!ficha.matricula || !emDia) return;
    let ativo = true;
    setQr((q) => ({ ...q, carregando: !q.valor }));
    buscarQrCarteirinha(tid, ficha.uid)
      .then((valor) => ativo && setQr({ valor, carregando: false, erro: null }))
      .catch((e) => ativo && setQr({ valor: null, carregando: false, erro: mensagemDeErro(e) }));
    return () => {
      ativo = false;
    };
  }, [tid, ficha.uid, ficha.matricula, emDia]);

  const valorTotal = ficha.cobranca ? ficha.cobranca.valorBase + ficha.cobranca.taxa : ficha.valorPlano + taxa(ficha.valorPlano, torcida.taxaServicoPct ?? 10);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-10 items-start">
      <div className="mx-auto w-full max-w-[380px]">
        <CartaoSocio ficha={ficha} torcida={torcida} fotoUrl={fotoUrl} virado={virado} onVirar={() => setVirado((v) => !v)} qr={qr} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Botao variante="suave" icone="atualizar" onClick={() => setVirado((v) => !v)}>
            {virado ? "Ver frente" : "Ver QR"}
          </Botao>
          <Botao icone="olho" disabled={!emDia || !qr.valor} onClick={() => setTelaCheia(true)}>
            Tela cheia
          </Botao>
        </div>
      </div>

      <div className="space-y-4 min-w-0">
        {falhaCartao && <AvisoFalhaCartao tid={tid} torcida={torcida} ficha={ficha} />}
        {situacao === "em_dia" && (
          <Cartao className="p-5">
            <div className="flex items-center gap-3">
              <span className="size-11 rounded-2xl grid place-items-center bg-sucesso/12 text-sucesso">
                <Icone nome="escudo" className="size-6" />
              </span>
              <div>
                <p className="font-bold text-lg leading-tight">Você está em dia</p>
                <p className="text-sm text-texto-2">Preço de sócio liberado nos ingressos no seu nome.</p>
              </div>
            </div>
            <div className="mt-5">
              <BarraValidade ficha={ficha} />
            </div>
            {ficha.metodo === "pix" && dias != null && dias <= 7 && !ficha.assinaturaCancelada && (
              <Botao className="mt-5" largo icone="pix" carregando={pagando} onClick={() => pagar(false)}>
                Renovar agora · {moeda(valorTotal)}
              </Botao>
            )}
          </Cartao>
        )}

        {(situacao === "vencida" || situacao === "inadimplente") && !falhaCartao && (
          <Aviso
            tom="alerta"
            titulo={situacao === "vencida" ? "Sua mensalidade venceu" : "Mensalidade em atraso"}
            acao={
              <Botao icone="pix" carregando={pagando} onClick={() => pagar(true)}>
                {ficha.cobrancaAbertaId ? "Ver cobrança em aberto" : `Pagar com Pix · ${moeda(valorTotal)}`}
              </Botao>
            }
          >
            A carteirinha volta a valer assim que o pagamento for confirmado — normalmente em segundos.
            {ficha.metodo === "cartao" && " Se o cartão foi recusado, você pode pagar este ciclo pelo Pix."}
          </Aviso>
        )}
        {situacao === "analise" && (
          <Aviso tom="info" titulo="Cadastro em análise">
            Pagamento recebido! A diretoria está conferindo seus dados. Assim que aprovar, sua carteirinha fica ativa aqui mesmo.
          </Aviso>
        )}
        {situacao === "suspenso" && (
          <Aviso tom="perigo" titulo="Associação suspensa">
            Sua carteirinha está suspensa pela diretoria. Fale com a sua sede para regularizar.
          </Aviso>
        )}
        {situacao === "cancelado" && (
          <Aviso tom="info" titulo="Associação encerrada" acao={<BotaoLink to={`/${torcida.slug}?aba=socios`} iconeDireita="setaDireita">Associar de novo</BotaoLink>}>
            Sua matrícula fica guardada: ao voltar, você mantém o mesmo número.
          </Aviso>
        )}

        {proximo && (
          <Link
            to={`/${torcida.slug}/socio/ingressos?abrir=${proximo.id}`}
            className="group flex items-center gap-4 rounded-cartao border border-linha bg-superficie p-4 hover:border-linha-forte transition-colors"
          >
            <span className="shrink-0 w-14 rounded-2xl bg-primaria text-sobre-primaria text-center py-2">
              <span className="block text-[11px] font-bold uppercase">{dataExtensa(proximo.eventoData).split(",")[0]}</span>
              <span className="block font-display text-2xl leading-none">{paraData(proximo.eventoData)?.getDate()}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-wider text-texto-3">Seu próximo evento</span>
              <span className="block font-semibold truncate">{proximo.eventoNome}</span>
              <span className="block text-sm text-texto-2">
                {dataExtensa(proximo.eventoData)} · {hora(proximo.eventoData)}
              </span>
            </span>
            <Icone nome="qr" className="size-6 text-texto-3 group-hover:text-primaria transition-colors" />
          </Link>
        )}

        <Cartao className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-texto-3">Seu plano</p>
              <p className="font-bold text-lg">{ficha.planoNome}</p>
            </div>
            <p className="text-right">
              <span className="font-display text-xl numeros">{moeda(ficha.valorPlano)}</span>
              <span className="text-sm text-texto-3">{periodicidadeCurta(ficha.intervalo, ficha.intervaloQtd)}</span>
            </p>
          </div>
          {!!plano?.beneficios?.length && (
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {plano.beneficios.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 size-5 shrink-0 rounded-full bg-primaria/15 text-primaria grid place-items-center">
                    <Icone nome="check" className="size-3.5" strokeWidth={2.5} />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <p className="text-xs text-texto-3 flex items-start gap-2 px-1">
          <Icone nome="info" className="size-4 shrink-0 mt-px" />
          Na portaria, o que libera a entrada é o QR do ingresso de cada evento. A carteirinha comprova que você é sócio e confere com seu documento com foto.
        </p>
      </div>

      {telaCheia && qr.valor && <TelaCheia ficha={ficha} torcida={torcida} fotoUrl={fotoUrl} qr={qr.valor} fechar={() => setTelaCheia(false)} />}
    </div>
  );
}
