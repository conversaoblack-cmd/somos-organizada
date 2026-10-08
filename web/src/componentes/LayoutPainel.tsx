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
  children,
}: {
  marca: ReactNode;
  subtitulo?: ReactNode;
  menu: ItemMenu[];
  usuario: { nome: string; detalhe?: string };
  acoesTopo?: ReactNode;
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
      document.querySelector<HTMLElement>(`[aria-controls="${idMenu}"]`)?.focus({ preventScroll: true });
    };
  }, [aberto, idMenu]);

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

      {aberto && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAberto(false)} aria-hidden="true" />
          <aside
            ref={gaveta}
            id={idMenu}
            role="dialog"
            aria-modal="true"
            aria-label="Menu do painel"
            tabIndex={-1}
            className="absolute left-0 top-0 h-full w-[84%] max-w-xs bg-fundo border-r border-linha p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col outline-none animate-[surgir_.2s_ease_both]"
          >
            <div className="px-2 pt-1 pb-6 flex items-start justify-between">
              <div className="min-w-0">
                {marca}
                {subtitulo && <p className="text-xs text-texto-3 mt-1">{subtitulo}</p>}
              </div>
              <BotaoIcone icone="x" rotulo="Fechar menu" onClick={() => setAberto(false)} />
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain">{navegacao}</div>
            {rodapeMenu}
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 h-16 flex items-center gap-3 px-4 sm:px-6 border-b border-linha bg-fundo/85 backdrop-blur">
          <BotaoIcone
            icone="menu"
            rotulo="Abrir menu"
            className="lg:hidden -ml-2"
            aria-expanded={aberto}
            aria-controls={idMenu}
            aria-haspopup="dialog"
            onClick={() => setAberto(true)}
          />
          <p className="font-semibold truncate flex-1">{atual?.rotulo}</p>
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
