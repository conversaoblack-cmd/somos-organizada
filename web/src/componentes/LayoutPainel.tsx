import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Avatar, Botao, BotaoIcone, cx, Icone, Modal, type NomeIcone } from "@/ui";

export interface ItemMenu {
  para: string;
  rotulo: string;
  icone: NomeIcone;
  fim?: boolean;
  contador?: number;
  /** Título pequeno acima do item quando ele abre um grupo novo ("Dia a dia", "Dinheiro"...). */
  grupo?: string;
}

// ── Alterações não salvas ────────────────────────────────────────────────
// O app usa BrowserRouter (sem useBlocker): a tela com formulário avisa por este contador e o menu
// pergunta "Descartar alterações?" antes de trocar de página ou sair.
let pendentes = 0;

/**
 * Marca que a tela tem alteração não salva enquanto `ativo` for true: o menu do painel pede confirmação
 * antes de trocar de página e o navegador avisa ao fechar ou recarregar a aba.
 */
export function useAlteracoesPendentes(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    pendentes++;
    const antes = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", antes);
    return () => {
      pendentes--;
      window.removeEventListener("beforeunload", antes);
    };
  }, [ativo]);
}

const FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Casca dos painéis (diretoria e plataforma): menu lateral no desktop,
 * menu deslizante no celular, cabeçalho com usuário e botão sair.
 */
export function LayoutPainel({
  marca,
  subtitulo,
  menu,
  usuario,
  acoesTopo,
  tituloCelular,
  semMenu,
  children,
}: {
  marca: ReactNode;
  subtitulo?: ReactNode;
  menu: ItemMenu[];
  usuario: { nome: string; detalhe?: string };
  acoesTopo?: ReactNode;
  /** No celular, entra no lugar do título da página no cabeçalho (ex.: escudo + nome da torcida). No computador fica o título. */
  tituloCelular?: ReactNode;
  /** Esconde o botão do menu no celular (ex.: portaria, cujo menu teria um item só). */
  semMenu?: boolean;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  // destino que espera confirmação ("sair" = encerrar a sessão)
  const [descartar, setDescartar] = useState<string | null>(null);
  const local = useLocation();
  const navegar = useNavigate();
  const atual = menu.find((m) => (m.fim ? local.pathname === m.para : local.pathname.startsWith(m.para)));
  const idMenu = useId();
  const gaveta = useRef<HTMLElement>(null);

  // Menu do celular: Esc fecha, foco fica dentro dele, a página por trás não rola e o foco volta ao botão.
  useEffect(() => {
    if (!aberto) return;
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.menuAberto = ""; // o botão flutuante de ajuda some enquanto o menu está aberto
    requestAnimationFrame(() => gaveta.current?.focus());
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAberto(false);
      } else if (e.key === "Tab" && gaveta.current) {
        const itens = Array.from(gaveta.current.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((el) => el.offsetParent !== null);
        if (!itens.length) return;
        const [primeiro, ultimo] = [itens[0]!, itens[itens.length - 1]!];
        if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === gaveta.current)) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    window.addEventListener("keydown", tecla);
    const fecharNoComputador = () => window.matchMedia("(min-width: 1024px)").matches && setAberto(false);
    window.addEventListener("resize", fecharNoComputador);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("resize", fecharNoComputador);
      document.body.style.overflow = overflowAntes;
      delete document.body.dataset.menuAberto;
      document.querySelector<HTMLElement>(`[aria-controls="${idMenu}"]`)?.focus({ preventScroll: true });
    };
  }, [aberto, idMenu]);

  // Celular: o menu acompanha o dedo, como nos apps (Instagram etc.). Arrastar para a direita em qualquer ponto da tela
  // abre; com ele aberto, arrastar para a esquerda fecha. Solta com mais de 40% aberto, ou num gesto rápido, e completa.
  // Gesto vertical continua rolagem; lista que rola para o lado (filtros, carrossel) e campos de texto não abrem o menu.
  const [puxado, setPuxado] = useState<number | null>(null); // 0..1 enquanto o dedo arrasta
  const abertoRef = useRef(aberto);
  abertoRef.current = aberto;
  useEffect(() => {
    if (semMenu) return;
    const celular = () => !window.matchMedia("(min-width: 1024px)").matches;
    let g: { x: number; y: number; t: number; decidido: boolean; ativo: boolean; abertoNoInicio: boolean } | null = null;
    const largura = () => gaveta.current?.offsetWidth || Math.min(320, window.innerWidth * 0.84);
    const bloqueado = (alvo: EventTarget | null) => {
      for (let el = alvo as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
        if (el.matches?.('input, textarea, select, [contenteditable="true"], [data-sem-gesto], [role="dialog"]:not([data-gaveta-menu])')) return true;
        const ox = getComputedStyle(el).overflowX;
        if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 2) return true;
      }
      // janela, tour ou camada aberta por cima: o gesto é dela
      return !!document.querySelector('[aria-labelledby="tour-titulo"]') || (document.body.dataset.camadas ?? "0") !== "0";
    };
    const comecar = (e: TouchEvent) => {
      g = null;
      if (!celular() || e.touches.length !== 1) return;
      if (!abertoRef.current && bloqueado(e.target)) return;
      const t = e.touches[0]!;
      g = { x: t.clientX, y: t.clientY, t: Date.now(), decidido: false, ativo: false, abertoNoInicio: abertoRef.current };
    };
    const mover = (e: TouchEvent) => {
      if (!g) return;
      const t = e.touches[0]!;
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.decidido) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.decidido = true;
        // horizontal claro e no sentido certo (fechado → direita; aberto → esquerda)
        g.ativo = Math.abs(dx) > Math.abs(dy) * 1.2 && (g.abertoNoInicio ? dx < 0 : dx > 0);
        if (!g.ativo) {
          g = null;
          return;
        }
      }
      e.preventDefault(); // não rola a página enquanto puxa o menu
      const w = largura();
      const p = g.abertoNoInicio ? 1 + Math.min(0, dx) / w : Math.max(0, dx) / w;
      setPuxado(Math.max(0, Math.min(1, p)));
    };
    const soltar = (e: TouchEvent) => {
      if (!g?.ativo) {
        g = null;
        return;
      }
      const dx = e.changedTouches[0]!.clientX - g.x;
      const vel = dx / Math.max(1, Date.now() - g.t); // px/ms
      const w = largura();
      const p = g.abertoNoInicio ? 1 + Math.min(0, dx) / w : Math.max(0, dx) / w;
      const abrir = vel > 0.45 ? true : vel < -0.45 ? false : p > 0.4;
      g = null;
      setPuxado(null);
      setAberto(abrir);
    };
    document.addEventListener("touchstart", comecar, { passive: true });
    document.addEventListener("touchmove", mover, { passive: false });
    document.addEventListener("touchend", soltar, { passive: true });
    document.addEventListener("touchcancel", soltar, { passive: true });
    return () => {
      document.removeEventListener("touchstart", comecar);
      document.removeEventListener("touchmove", mover);
      document.removeEventListener("touchend", soltar);
      document.removeEventListener("touchcancel", soltar);
    };
  }, [semMenu]);

  function aoClicarItem(e: MouseEvent<HTMLAnchorElement>, para: string) {
    setAberto(false);
    if (pendentes > 0 && local.pathname !== para) {
      e.preventDefault();
      setDescartar(para);
    }
  }

  function sair() {
    setAberto(false);
    if (pendentes > 0) setDescartar("sair");
    else void signOut(auth);
  }

  const navegacao = (
    <nav className="flex flex-col gap-0.5" aria-label="Menu">
      {menu.map((m, i) => (
        <div key={m.para} className="contents">
          {m.grupo && m.grupo !== menu[i - 1]?.grupo && (
            <p className={cx("px-3 pb-1 text-xs font-semibold text-texto-3", i > 0 ? "pt-4" : "pt-1")}>{m.grupo}</p>
          )}
          <NavLink
            to={m.para}
            end={m.fim}
            onClick={(e) => aoClicarItem(e, m.para)}
            className={({ isActive }) =>
              cx(
                "flex items-center gap-3 h-11 px-3 rounded-xl text-[15px] font-medium transition-colors",
                isActive ? "bg-primaria/12 text-texto" : "text-texto-2 hover:text-texto hover:bg-superficie-2",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icone nome={m.icone} className={cx("size-5", isActive && "text-primaria-texto")} />
                <span className="flex-1">{m.rotulo}</span>
                {!!m.contador && <span className="text-xs font-bold rounded-full bg-secundaria text-sobre-secundaria px-2 py-0.5">{m.contador}</span>}
              </>
            )}
          </NavLink>
        </div>
      ))}
    </nav>
  );

  const rodapeMenu = (
    <div className="mt-auto pt-4 border-t border-linha flex items-center gap-3">
      <Avatar nome={usuario.nome || "?"} tamanho="size-9" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{usuario.nome}</p>
        {usuario.detalhe && <p className="text-xs text-texto-3 truncate">{usuario.detalhe}</p>}
      </div>
      <BotaoIcone icone="sair" rotulo="Sair" onClick={sair} />
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="hidden lg:flex flex-col h-dvh sticky top-0 border-r border-linha bg-superficie/60 p-4">
        <div className="px-2 pt-1 pb-6">
          {marca}
          {subtitulo && <p className="text-xs text-texto-3 mt-1">{subtitulo}</p>}
        </div>
        <div className="flex-1 overflow-y-auto rolagem-fina -mx-1 px-1">{navegacao}</div>
        {rodapeMenu}
      </aside>

      {(aberto || puxado !== null) && (
        <div className="lg:hidden fixed inset-0 z-40">
          {/* fundo escurece e desfoca junto com o dedo */}
          <div
            className={cx("absolute inset-0 bg-black/50 backdrop-blur-[3px]", puxado === null && "transition-opacity duration-300")}
            style={{ opacity: puxado ?? (aberto ? 1 : 0) }}
            onClick={() => setAberto(false)}
            aria-hidden="true"
          />
          <aside
            ref={gaveta}
            id={idMenu}
            role="dialog"
            aria-modal="true"
            aria-label="Menu do painel"
            data-gaveta-menu=""
            tabIndex={-1}
            className={cx(
              // vidro: translúcido, desfocado e com brilho na borda (Liquid Glass)
              "absolute left-0 top-0 h-full w-[84%] max-w-xs flex flex-col outline-none rounded-r-[28px] overflow-hidden",
              "bg-fundo/70 backdrop-blur-2xl backdrop-saturate-150 border-r border-white/10",
              "shadow-[0_0_0_1px_rgba(255,255,255,0.04),24px_0_60px_-12px_rgba(0,0,0,0.6)]",
              "px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
              puxado === null && "transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
            )}
            style={{ transform: `translateX(${((puxado ?? (aberto ? 1 : 0)) - 1) * 100}%)` }}
          >
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.07] via-transparent to-transparent"
              aria-hidden="true"
            />
            <div className="relative px-2 pt-1 pb-6 flex items-start justify-between">
              <div className="min-w-0">
                {marca}
                {subtitulo && <p className="text-xs text-texto-3 mt-1">{subtitulo}</p>}
              </div>
              <BotaoIcone icone="x" rotulo="Fechar menu" onClick={() => setAberto(false)} />
            </div>
            <div className="relative flex-1 overflow-y-auto overscroll-contain">{navegacao}</div>
            <div className="relative">{rodapeMenu}</div>
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex items-center gap-3 px-4 sm:px-6 border-b border-white/10 bg-fundo/70 backdrop-blur-xl backdrop-saturate-150">
          {!semMenu && (
            <BotaoIcone
              icone="menu"
              rotulo="Abrir menu"
              className="lg:hidden -ml-2"
              aria-expanded={aberto}
              aria-controls={idMenu}
              aria-haspopup="dialog"
              onClick={() => setAberto(true)}
            />
          )}
          {tituloCelular && <div className="lg:hidden min-w-0 flex-1">{tituloCelular}</div>}
          <p className={cx("font-semibold truncate flex-1", !!tituloCelular && "max-lg:hidden")}>{atual?.rotulo}</p>
          {acoesTopo}
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1400px]">{children}</main>
      </div>

      <Modal
        aberto={!!descartar}
        fechar={() => setDescartar(null)}
        titulo="Descartar alterações?"
        largura="max-w-md"
        rodape={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setDescartar(null)}>
              Continuar editando
            </Botao>
            <Botao
              variante="perigo"
              onClick={() => {
                const destino = descartar;
                setDescartar(null);
                if (destino === "sair") void signOut(auth);
                else if (destino) navegar(destino);
              }}
            >
              Descartar
            </Botao>
          </div>
        }
      >
        <p className="text-texto-2 text-[15px] leading-relaxed">Você mudou coisas nesta tela e ainda não salvou. Se sair agora, essas mudanças se perdem.</p>
      </Modal>
    </div>
  );
}
