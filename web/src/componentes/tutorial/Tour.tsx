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
function medirEscondido(alvo?: string): boolean {
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
  const [verVideo, setVerVideo] = useState(false);
  const balao = useRef<HTMLDivElement>(null);
  const video = useVideoTutorial(id);
  const celular = tela.w < 640;
  const passo = passos[Math.min(i, passos.length - 1)];

  useEffect(() => {
    if (aberto) {
      setI(0);
      setVerVideo(false);
    }
  }, [aberto, id]);

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
    else setI((n) => n + 1);
  }, [i, passos.length, concluir]);
  const voltar = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

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

  // Posição do balão
  let estiloBalao: CSSProperties = {};
  let classeBalao = "";
  if (celular) {
    const alvoEmbaixo = !!rect && rect.top + rect.height / 2 > tela.h * 0.5;
    classeBalao = cx("fixed inset-x-0 mx-2 rounded-[24px]", alvoEmbaixo ? "top-2" : "bottom-2");
  } else if (destaque) {
    const largura = Math.min(LARGURA_BALAO, tela.w - 2 * MARGEM);
    const espacoBaixo = tela.h - (destaque.top + destaque.height);
    const emBaixo = espacoBaixo > 230 || destaque.top < 230;
    const left = Math.min(Math.max(MARGEM, destaque.left + destaque.width / 2 - largura / 2), tela.w - largura - MARGEM);
    estiloBalao = emBaixo
      ? { top: Math.min(destaque.top + destaque.height + 14, tela.h - 220), left, width: largura }
      : { bottom: tela.h - destaque.top + 14, left, width: largura };
    classeBalao = "fixed rounded-[22px]";
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
        className={cx("bg-fundo border border-linha-forte shadow-2xl outline-none p-5 animate-[surgir_.2s_ease_both]", classeBalao)}
        style={estiloBalao}
      >
        <div className="flex items-start gap-3">
          <span className="size-9 shrink-0 rounded-xl bg-primaria/15 text-primaria grid place-items-center">
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

        {video && (verVideo || (i === 0 && !celular)) && (
          <video
            key={video}
            src={video}
            className="mt-3 w-full rounded-xl border border-linha bg-black max-h-[40vh]"
            autoPlay
            muted
            loop
            playsInline
            controls
          />
        )}

        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1 mr-auto" aria-hidden="true">
            {passos.map((_, n) => (
              <span key={n} className={cx("h-1.5 rounded-full transition-all", n === i ? "w-5 bg-primaria" : "w-1.5 bg-superficie-3")} />
            ))}
          </div>
          {video && !(i === 0 && !celular) && (
            <Botao variante="fantasma" tamanho="sm" icone="camera" onClick={() => setVerVideo((v) => !v)}>
              {verVideo ? "Esconder vídeo" : "Ver vídeo"}
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
