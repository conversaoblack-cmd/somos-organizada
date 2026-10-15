import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Botao, BotaoIcone, cx, Icone } from "@/ui";
import { useVideoTutorial } from "./videos";

export interface PassoTour {
  /** Valor do atributo data-tour do elemento destacado. Sem alvo (ou alvo ausente na tela): passo centralizado. */
  alvo?: string;
  titulo: string;
  texto: string;
  /** Mostra o círculo pulsando ("toque aqui"). Padrão: true quando há alvo. */
  indicarToque?: boolean;
  /** Pula o passo quando o alvo não está na tela (ex.: aviso que só aparece às vezes). */
  opcional?: boolean;
}

/** Passos que fazem sentido na tela agora (remove os opcionais cujo alvo não existe). */
export function passosVisiveis(passos: PassoTour[]): PassoTour[] {
  const l = passos.filter((p) => !p.opcional || !!medir(p.alvo) || !!medirEscondido(p.alvo));
  return l.length ? l : passos.slice(0, 1);
}

interface Retangulo {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MARGEM = 8;
const LARGURA_BALAO = 360;
/** Celular: a folha do balão ocupa no máximo esta fração da tela; o resto fica para o item destacado. */
const FRACAO_FOLHA = 0.45;
/** Celular: distância do topo onde o item destacado para depois de rolar (abaixo do cabeçalho fixo). */
const TOPO_CELULAR = 76;

function medir(alvo?: string): Retangulo | null {
  if (!alvo) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${alvo}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Alvo existe e tem tamanho, mesmo fora da área visível (antes de rolar). */
export function medirEscondido(alvo?: string): boolean {
  if (!alvo) return false;
  const el = document.querySelector<HTMLElement>(`[data-tour="${alvo}"]`);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** O alvo é algo para tocar (botão ou link pequeno)? Só nele aparece o círculo "toque aqui". */
function alvoTocavel(alvo?: string): boolean {
  if (!alvo) return false;
  const el = document.querySelector<HTMLElement>(`[data-tour="${alvo}"]`);
  if (!el || !el.matches('button, a[href], [role="button"], summary')) return false;
  return el.getBoundingClientRect().height <= 80;
}

/** Altura (px) do topo ocupado pela faixa da hora (--topo-seguro do index.css; 0 sem faixa). */
function topoSeguro(): number {
  const sonda = document.createElement("div");
  sonda.style.cssText = "position:fixed;top:0;left:0;width:0;visibility:hidden;height:var(--topo-seguro)";
  document.body.appendChild(sonda);
  const h = sonda.getBoundingClientRect().height;
  sonda.remove();
  return h;
}

function rolarAte(alvo: string | undefined, celular: boolean) {
  if (!alvo) return;
  const el = document.querySelector<HTMLElement>(`[data-tour="${alvo}"]`);
  if (!el) return;
  const antes = el.style.scrollMarginTop;
  const topo = celular ? topoSeguro() : 0; // o cabeçalho fixo desce junto com a faixa da hora
  el.style.scrollMarginTop = celular ? `${TOPO_CELULAR + topo}px` : "96px";
  const r = el.getBoundingClientRect();
  // Celular: o balão vira folha embaixo (até 45% da tela); o alvo precisa caber (ou começar) na parte de cima
  const visivel = r.top >= 64 + topo && r.bottom <= window.innerHeight * (celular ? 1 - FRACAO_FOLHA : 0.85);
  if (!visivel) el.scrollIntoView({ block: celular || r.height > window.innerHeight * 0.6 ? "start" : "center", behavior: "smooth" });
  setTimeout(() => (el.style.scrollMarginTop = antes), 800);
}

/**
 * Tour guiado: escurece a tela, destaca o elemento [data-tour] do passo e mostra um balão
 * com título, texto e navegação. No celular o balão vira folha (em cima ou embaixo, longe do alvo).
 */
export function Tour({
  id,
  passos,
  aberto,
  fechar,
  concluir,
}: {
  id: string;
  passos: PassoTour[];
  aberto: boolean;
  /** Fechou antes do fim (Pular / Esc). */
  fechar: () => void;
  /** Chegou ao último passo e clicou em Concluir. */
  concluir: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Retangulo | null>(null);
  const [tela, setTela] = useState({ w: typeof window !== "undefined" ? window.innerWidth : 1280, h: typeof window !== "undefined" ? window.innerHeight : 800 });
  // Computador: o vídeo abre junto com o tour (1º passo). Celular: começa desligado (tela pequena e internet
  // pré-paga); o botão "Ver vídeo" liga e desliga
  const [verVideo, setVerVideo] = useState(() => typeof window === "undefined" || window.innerWidth >= 640);
  const [alturaBalao, setAlturaBalao] = useState(0);
  const balao = useRef<HTMLDivElement>(null);
  // Parte que rola (título, texto e vídeo); os botões ficam sempre à vista embaixo
  const corpo = useRef<HTMLDivElement>(null);
  const video = useVideoTutorial(id);
  const celular = tela.w < 640;
  const passo = passos[Math.min(i, passos.length - 1)];

  useEffect(() => {
    if (aberto) {
      setI(0);
      setVerVideo(window.innerWidth >= 640);
    }
  }, [aberto, id]);

  // Altura real do balão (cresce com o vídeo): a posição usa a medida, nunca um valor presumido
  useLayoutEffect(() => {
    const el = balao.current;
    const c = corpo.current;
    if (!aberto || !el || !c) return;
    // altura natural (sem cortar o corpo): o que está fora do corpo + tudo o que o corpo tem
    const medirBalao = () => setAlturaBalao(el.offsetHeight - c.clientHeight + c.scrollHeight);
    medirBalao();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medirBalao) : null;
    ro?.observe(el);
    ro?.observe(c);
    return () => {
      ro?.disconnect();
    };
  }, [aberto, i, verVideo]);

  // Com o tour aberto a página não rola (o destaque não "anda" com a rolagem): o tour já leva até cada item.
  // Só o balão pode rolar por dentro, quando o texto + vídeo não cabem na tela.
  useEffect(() => {
    if (!aberto) return;
    const noBalao = (e: Event) => !!balao.current && e.target instanceof Node && balao.current.contains(e.target);
    const balaoRola = () => !!corpo.current && corpo.current.scrollHeight > corpo.current.clientHeight + 1;
    const travar = (e: Event) => {
      // Rodinha: a página nunca rola; sobre o balão, rola só o balão (se ele tiver o que rolar)
      if (e.type === "wheel") {
        e.preventDefault();
        if (noBalao(e) && balaoRola()) corpo.current!.scrollTop += (e as WheelEvent).deltaY;
        return;
      }
      // Dedo: arrastar dentro do balão que rola é permitido (overscroll-behavior: contain segura a página)
      if (noBalao(e) && balaoRola()) return;
      e.preventDefault();
    };
    const teclas = (e: KeyboardEvent) => {
      if (balao.current && e.target instanceof Node && balao.current.contains(e.target)) return; // botões do balão (espaço, setas)
      if (["PageUp", "PageDown", "Home", "End", " ", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
    };
    window.addEventListener("wheel", travar, { passive: false });
    window.addEventListener("touchmove", travar, { passive: false });
    window.addEventListener("keydown", teclas);
    return () => {
      window.removeEventListener("wheel", travar);
      window.removeEventListener("touchmove", travar);
      window.removeEventListener("keydown", teclas);
    };
  }, [aberto]);

  // Rola até o alvo a cada passo e acompanha a posição (rolagem, animações, resize).
  useEffect(() => {
    if (!aberto || !passo) return;
    rolarAte(passo.alvo, window.innerWidth < 640);
    let quadro = 0;
    let ultimo = "";
    const loop = () => {
      const r = medir(passo.alvo);
      const chave = r ? `${Math.round(r.top)}|${Math.round(r.left)}|${Math.round(r.width)}|${Math.round(r.height)}` : "nulo";
      if (chave !== ultimo) {
        ultimo = chave;
        setRect(r);
      }
      quadro = requestAnimationFrame(loop);
    };
    quadro = requestAnimationFrame(loop);
    const redimensionar = () => setTela({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", redimensionar);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", redimensionar);
    };
  }, [aberto, passo]);

  const proximo = useCallback(() => {
    if (i >= passos.length - 1) concluir();
    else {
      setI((n) => n + 1);
      setVerVideo(false);
    }
  }, [i, passos.length, concluir]);
  const voltar = useCallback(() => {
    setI((n) => Math.max(0, n - 1));
    setVerVideo(false);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fechar();
      } else if (e.key === "ArrowRight") proximo();
      else if (e.key === "ArrowLeft") voltar();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [aberto, fechar, proximo, voltar]);

  useLayoutEffect(() => {
    if (aberto) balao.current?.focus({ preventScroll: true });
  }, [aberto, i]);

  if (!aberto || !passo) return null;

  const temAlvo = !!rect;
  const pad = 6;
  const destaque = rect && {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };

  // Posição do balão: sempre inteiro dentro da tela (se não couber, rola por dentro)
  const alturaMax = tela.h - 2 * MARGEM;
  let estiloBalao: CSSProperties = { maxHeight: alturaMax };
  let classeBalao = "";
  if (celular) {
    // Folha embaixo (padrão): o tour rola o alvo para o topo e a folha ocupa no máximo 45% da tela, rolando por
    // dentro. Só vai para cima quando o alvo é baixo e ficou na metade de baixo (fim da página, não dá para rolar).
    const alto = !!rect && rect.height > tela.h * FRACAO_FOLHA;
    const emCima = !!rect && (alto || rect.top < tela.h * 0.5);
    const folhaEmCima = !!rect && !emCima;
    // Com o vídeo ligado a pessoa pediu para ver: a folha pode crescer (o vídeo tem no máximo 40% da tela)
    // Sem alvo (passo de boas-vindas) não há nada a proteger: a folha pode ser maior
    const limite = tela.h * (!rect || (verVideo && video) ? 0.8 : FRACAO_FOLHA);
    // Folha em cima fica abaixo da faixa da hora (no iPhone ela é borrada pelo sistema e cortava o título)
    const topo = topoSeguro();
    estiloBalao = { ...estiloBalao, maxHeight: Math.min(alturaMax - topo, limite), ...(folhaEmCima ? { top: topo + MARGEM } : {}) };
    classeBalao = cx("fixed inset-x-0 mx-2 rounded-[22px]", !folhaEmCima && "bottom-[max(0.5rem,env(safe-area-inset-bottom))]");
  } else if (destaque) {
    const largura = Math.min(LARGURA_BALAO, tela.w - 2 * MARGEM);
    const altura = Math.min(alturaBalao || 240, alturaMax);
    const left = Math.min(Math.max(MARGEM, destaque.left + destaque.width / 2 - largura / 2), tela.w - largura - MARGEM);
    const abaixo = destaque.top + destaque.height + 14;
    const acima = destaque.top - 14 - altura;
    let top: number;
    if (abaixo + altura <= tela.h - MARGEM) top = abaixo;
    else if (acima >= MARGEM) top = acima;
    else {
      // Não cabe nem acima nem abaixo (destaque grande ou balão com vídeo): ao lado, se houver espaço; senão, o mais
      // perto possível do destaque, sem sair da tela
      const direita = destaque.left + destaque.width + 14;
      const esquerda = destaque.left - 14 - largura;
      top = Math.min(Math.max(MARGEM, destaque.top), tela.h - altura - MARGEM);
      if (direita + largura <= tela.w - MARGEM) {
        estiloBalao = { ...estiloBalao, top, left: direita, width: largura };
        classeBalao = "fixed rounded-[22px]";
      } else if (esquerda >= MARGEM) {
        estiloBalao = { ...estiloBalao, top, left: esquerda, width: largura };
        classeBalao = "fixed rounded-[22px]";
      } else top = Math.max(MARGEM, tela.h - altura - MARGEM);
    }
    if (!classeBalao) {
      estiloBalao = { ...estiloBalao, top: Math.max(MARGEM, Math.min(top, tela.h - altura - MARGEM)), left, width: largura };
      classeBalao = "fixed rounded-[22px]";
    }
  } else {
    classeBalao = "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[24px] w-[min(92vw,420px)]";
  }

  // Círculo "toque aqui" só em botão ou link (nunca em cima de texto), no canto de baixo à direita
  const indicar = temAlvo && passo.indicarToque !== false && (passo.indicarToque === true || alvoTocavel(passo.alvo));

  return createPortal(
    <div className="fixed inset-0 z-[80]" aria-live="polite">
      {/* Bloqueia cliques na página durante o tour */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {destaque ? (
        <div
          className="absolute rounded-2xl ring-2 ring-primaria pointer-events-none transition-all duration-300 ease-out"
          style={{ ...destaque, boxShadow: "0 0 0 9999px rgba(4,6,8,0.72)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(4,6,8,0.72)] backdrop-blur-[2px]" />
      )}
      {indicar && destaque && (
        <span
          className="absolute pointer-events-none"
          style={{
            top: Math.min(destaque.top + destaque.height - 16, tela.h - 32),
            left: Math.min(destaque.left + destaque.width - 16, tela.w - 32),
          }}
          aria-hidden="true"
        >
          <span className="absolute inset-0 size-7 rounded-full bg-primaria/60 animate-ping" />
          <span className="relative block size-7 rounded-full border-[3px] border-white bg-primaria/80 shadow-lg" />
        </span>
      )}

      <div
        ref={balao}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-titulo"
        className={cx("bg-fundo border border-linha-forte shadow-2xl outline-none flex flex-col overflow-hidden animate-[surgir_.2s_ease_both]", classeBalao)}
        style={estiloBalao}
      >
        <div ref={corpo} className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain", celular ? "px-4 pt-3.5" : "px-5 pt-5")}>
          <div className="flex items-start gap-3">
            <span className={cx("size-9 shrink-0 rounded-xl bg-primaria/15 text-primaria-texto place-items-center", celular ? "hidden" : "grid")}>
              <Icone nome={i === 0 ? "info" : "setaDireita"} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-texto-3">
                Passo {i + 1} de {passos.length}
              </p>
              <h2 id="tour-titulo" className={cx("font-bold leading-snug mt-0.5", celular ? "text-base" : "text-lg")}>
                {passo.titulo}
              </h2>
            </div>
            <BotaoIcone icone="x" rotulo="Fechar passo a passo" onClick={fechar} className="-mr-2 -mt-2" />
          </div>
          <p className={cx("text-texto-2 whitespace-pre-line", celular ? "text-sm leading-normal mt-1" : "text-[15px] leading-relaxed mt-2")}>{passo.texto}</p>

          {video && verVideo && (
            <video
              key={video.webm}
              className={cx(
                "mt-3 rounded-xl border border-linha bg-black object-contain",
                // celular: vídeo em pé (gravado a 390×844), centralizado, sem esticar na largura toda
                celular ? "mx-auto block aspect-[390/844] max-h-[40dvh] max-w-full" : "w-full max-h-[36vh]",
              )}
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
            >
              {/* iPhone sem VP9 pula o WebM e toca o MP4 (H.264) */}
              <source src={video.webm} type='video/webm; codecs="vp9"' />
              <source src={video.mp4} type="video/mp4" />
            </video>
          )}
        </div>

        {celular ? (
          // Celular: uma linha só (pontinhos, vídeo, voltar, próximo): a folha fica baixa e o item destacado aparece
          <div className="shrink-0 px-3 pt-2 pb-3 flex items-center gap-1">
            <div className="flex gap-1 mr-auto pl-1" aria-hidden="true">
              {passos.map((_, n) => (
                <span key={n} className={cx("h-1.5 rounded-full transition-all", n === i ? "w-4 bg-primaria" : "w-1.5 bg-superficie-3")} />
              ))}
            </div>
            {video && (
              <BotaoIcone
                icone={verVideo ? "x" : "camera"}
                rotulo={verVideo ? "Esconder vídeo" : "Ver vídeo"}
                onClick={() => setVerVideo((v) => !v)}
                aria-pressed={verVideo}
                className={verVideo ? "bg-superficie-2" : undefined}
              />
            )}
            {i === 0 ? (
              <Botao variante="fantasma" tamanho="sm" onClick={fechar}>
                Pular
              </Botao>
            ) : (
              <BotaoIcone icone="setaEsquerda" rotulo="Voltar" onClick={voltar} />
            )}
            <Botao tamanho="sm" iconeDireita={i === passos.length - 1 ? "check" : "setaDireita"} onClick={proximo} data-tour-proximo="">
              {i === passos.length - 1 ? "Concluir" : "Próximo"}
            </Botao>
          </div>
        ) : (
        <div className="shrink-0 px-5 pt-3 pb-5 flex flex-col gap-2">
            {/* Computador: pontinhos + vídeo (com texto) em cima; voltar e próximo embaixo */}
            <div className="flex items-center gap-2 min-h-11">
              <div className="flex gap-1 mr-auto" aria-hidden="true">
                {passos.map((_, n) => (
                  <span key={n} className={cx("h-1.5 rounded-full transition-all", n === i ? "w-5 bg-primaria" : "w-1.5 bg-superficie-3")} />
                ))}
              </div>
              {video && (
                <Botao variante="suave" tamanho="sm" icone={verVideo ? "x" : "camera"} onClick={() => setVerVideo((v) => !v)} aria-pressed={verVideo}>
                  {verVideo ? "Esconder vídeo" : "Ver vídeo"}
                </Botao>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
            {i === 0 ? (
              <Botao variante="fantasma" tamanho="sm" onClick={fechar}>
                Pular
              </Botao>
            ) : (
              <Botao variante="fantasma" tamanho="sm" icone="setaEsquerda" onClick={voltar}>
                Voltar
              </Botao>
            )}
            <Botao tamanho="sm" iconeDireita={i === passos.length - 1 ? "check" : "setaDireita"} onClick={proximo} data-tour-proximo="">
              {i === passos.length - 1 ? "Concluir" : "Próximo"}
            </Botao>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
