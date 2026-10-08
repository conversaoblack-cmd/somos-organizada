import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Avatar, BotaoIcone, cx, Icone, type NomeIcone } from "@/ui";

export interface ItemMenu {
  para: string;
  rotulo: string;
  icone: NomeIcone;
  fim?: boolean;
  contador?: number;
}

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
  const local = useLocation();
  const atual = menu.find((m) => (m.fim ? local.pathname === m.para : local.pathname.startsWith(m.para)));

  const navegacao = (
    <nav className="flex flex-col gap-0.5" aria-label="Menu">
      {menu.map((m) => (
        <NavLink
          key={m.para}
          to={m.para}
          end={m.fim}
          onClick={() => setAberto(false)}
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
      <BotaoIcone icone="sair" rotulo="Sair" onClick={() => signOut(auth)} />
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
          <div className="absolute inset-0 bg-black/60" onClick={() => setAberto(false)} />
          <aside className="absolute left-0 top-0 h-full w-[84%] max-w-xs bg-fundo border-r border-linha p-4 flex flex-col animate-[surgir_.2s_ease_both]">
            <div className="px-2 pt-1 pb-6 flex items-start justify-between">
              <div>
                {marca}
                {subtitulo && <p className="text-xs text-texto-3 mt-1">{subtitulo}</p>}
              </div>
              <BotaoIcone icone="x" rotulo="Fechar menu" onClick={() => setAberto(false)} />
            </div>
            <div className="flex-1 overflow-y-auto">{navegacao}</div>
            {rodapeMenu}
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 h-16 flex items-center gap-3 px-4 sm:px-6 border-b border-linha bg-fundo/85 backdrop-blur">
          <BotaoIcone icone="menu" rotulo="Abrir menu" className="lg:hidden -ml-2" onClick={() => setAberto(true)} />
          <p className="font-semibold truncate flex-1">{atual?.rotulo}</p>
          {acoesTopo}
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1400px]">{children}</main>
      </div>
    </div>
  );
}
