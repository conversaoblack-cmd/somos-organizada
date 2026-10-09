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

function rolarAte(alvo: string | undefined, celular: boolean) {
  if (!alvo) return;
  const el = document.querySelector<HTMLElement>(`[data-tour="${alvo}"]`);
  if (!el) return;
  const antes = el.style.scrollMarginTop;
  el.style.scrollMarginTop = celular ? "84px" : "96px";
  const r = el.getBoundingClientRect();
  const visivel = r.top >= 72 && r.bottom <= window.innerHeight * (celular ? 0.55 : 0.85);
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
  // O vídeo abre junto com o tour (1º passo) em qualquer tela; "Ver vídeo" / "Voltar ao passo" alterna depois
  const [verVideo, setVerVideo] = useState(true);
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
      setVerVideo(true);
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
    // Folha embaixo ou em cima, do lado oposto ao destaque, sem cobrir o item destacado quando houver espaço
    const alvoEmbaixo = !!rect && rect.top + rect.height / 2 > tela.h * 0.5;
    const livre = rect ? (alvoEmbaixo ? rect.top - pad - 2 * MARGEM : tela.h - (rect.top + rect.height) - pad - 2 * MARGEM) : alturaMax;
    estiloBalao = { ...estiloBalao, maxHeight: Math.min(alturaMax, Math.max(livre, tela.h * 0.5)) };
    classeBalao = cx("fixed inset-x-0 mx-2 rounded-[24px]", alvoEmbaixo ? "top-2" : "bottom-2");
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

  const indicar = temAlvo && passo.indicarToque !== false;

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
          style={{ top: destaque.top + destaque.height / 2 - 14, left: destaque.left + Math.min(destaque.width / 2, 60) - 14 }}
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
        <div ref={corpo} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5">
          <div className="flex items-start gap-3">
            <span className="size-9 shrink-0 rounded-xl bg-primaria/15 text-primaria-texto grid place-items-center">
              <Icone nome={i === 0 ? "info" : "setaDireita"} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-texto-3">
                Passo {i + 1} de {passos.length}
              </p>
              <h2 id="tour-titulo" className="text-lg font-bold leading-snug mt-0.5">
                {passo.titulo}
              </h2>
            </div>
            <BotaoIcone icone="x" rotulo="Fechar passo a passo" onClick={fechar} className="-mr-2 -mt-2" />
          </div>
          <p className="text-[15px] text-texto-2 leading-relaxed mt-2 whitespace-pre-line">{passo.texto}</p>

          {video && verVideo && (
            <video
              key={video}
              src={video}
              className={cx("mt-3 w-full rounded-xl border border-linha bg-black object-contain", celular ? "max-h-[30dvh]" : "max-h-[36vh]")}
              autoPlay
              muted
              loop
              playsInline
              controls
            />
          )}
        </div>

        <div className="shrink-0 px-5 pt-3 pb-5 flex flex-wrap items-center justify-end gap-2">
          <div className="flex gap-1 mr-auto basis-full sm:basis-auto mb-1 sm:mb-0" aria-hidden="true">
            {passos.map((_, n) => (
              <span key={n} className={cx("h-1.5 rounded-full transition-all", n === i ? "w-5 bg-primaria" : "w-1.5 bg-superficie-3")} />
            ))}
          </div>
          {video && (
            <Botao
              variante="fantasma"
              tamanho="sm"
              icone={verVideo ? "setaEsquerda" : "camera"}
              onClick={() => setVerVideo((v) => !v)}
              aria-label={verVideo ? "Esconder o vídeo e ver só o passo" : "Ver o vídeo"}
              aria-pressed={verVideo}
            >
              <span className="hidden min-[400px]:inline">{verVideo ? "Só o passo" : "Ver vídeo"}</span>
            </Botao>
          )}
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
    </div>,
    document.body,
  );
}
