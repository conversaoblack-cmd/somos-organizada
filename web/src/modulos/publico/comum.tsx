import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { collection, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useColecao } from "@/hooks/dados";
import { socioEmDia, useMinhaFicha, useTorcida } from "@/hooks/torcida";
import type { Evento, Plano, Sede } from "@/lib/tipos";
import { Botao, cx, Icone, Vazio } from "@/ui";

export function useEventosPublicos(tid: string) {
  // Só os eventos que ainda vão acontecer (até 6h depois do início): torcida antiga não baixa anos de eventos no 3G
  const [desde] = useState(() => Date.now() - 6 * 3600_000);
  const q = query(
    collection(db, `torcidas/${tid}/eventos`),
    where("status", "==", "publicado"),
    where("data", ">=", Timestamp.fromMillis(desde)),
    orderBy("data", "asc"),
  );
  const r = useColecao<Evento>(q, `eventos-pub-${tid}`);
  const limite = Date.now() - 6 * 3600_000;
  return { ...r, dados: r.dados.filter((e) => e.data.toMillis() >= limite) };
}

export function useSedes(tid: string) {
  const q = query(collection(db, `torcidas/${tid}/sedes`), orderBy("ordem", "asc"));
  const r = useColecao<Sede>(q, `sedes-${tid}`);
  return { ...r, dados: r.dados.filter((s) => s.ativa !== false) };
}

export function usePlanosAtivos(tid: string) {
  const r = useColecao<Plano>(collection(db, `torcidas/${tid}/planos`), `planos-${tid}`);
  return { ...r, dados: r.dados.filter((p) => p.ativo).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99)) };
}

/** Duas letras do nome da torcida para quando ela ainda não enviou o escudo ("Gaviões da Fiel" → "GF"). */
export function iniciaisTorcida(nome: string): string {
  const palavras = nome.split(/\s+/).filter((p) => p && !/^(d[aeo]s?|e|of|the)$/i.test(p));
  if (!palavras.length) return "";
  const letras = palavras.length > 1 ? palavras[0]![0]! + palavras[1]![0]! : palavras[0]!.slice(0, 2);
  return letras.toUpperCase();
}

export function Marca({ tamanho = "md" }: { tamanho?: "md" | "lg" }) {
  const { torcida } = useTorcida();
  const logo = torcida.tema.logoUrl;
  const sz = tamanho === "lg" ? "size-14" : "size-9";
  const px = tamanho === "lg" ? 56 : 36;
  return (
    <Link to={`/${torcida.slug}`} className="flex items-center gap-2.5 min-w-0 min-h-11">
      {logo ? (
        <img src={logo} alt="" width={px} height={px} decoding="async" className={cx(sz, "shrink-0 rounded-xl object-contain bg-superficie-2")} />
      ) : (
        // Sem escudo cadastrado: iniciais da torcida na cor dela (nunca a marca da plataforma)
        <span
          className={cx(sz, "shrink-0 rounded-xl grid place-items-center bg-primaria text-sobre-primaria font-display leading-none", tamanho === "lg" ? "text-2xl" : "text-sm")}
          aria-hidden="true"
        >
          {iniciaisTorcida(torcida.nome)}
        </span>
      )}
      <span className={cx("font-display uppercase tracking-tight line-clamp-2 break-words leading-[1.1]", tamanho === "lg" ? "text-xl" : "text-[15px]")}>{torcida.nome}</span>
    </Link>
  );
}

export function CabecalhoTorcida() {
  const { tid, torcida } = useTorcida();
  const { ficha, usuario } = useMinhaFicha(tid);
  const ehSocio = socioEmDia(ficha);
  return (
    <header className="sticky top-0 z-30 border-b border-linha bg-fundo/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl h-16 px-4 sm:px-6 flex items-center gap-3">
        <Marca />
        <div className="flex-1" />
        <Link
          to={`/${torcida.slug}/${ficha ? "socio" : "conta"}`}
          className={cx(
            "inline-flex items-center gap-2 h-11 sm:h-10 px-3.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 transition-colors",
            ehSocio ? "bg-primaria/15 text-texto border border-primaria/40" : "border border-linha-forte hover:bg-superficie-2",
          )}
        >
          <Icone nome={ehSocio ? "escudo" : "usuario"} className={cx("size-4", ehSocio && "text-primaria-texto")} />
          {ehSocio ? (
            <>
              <span className="sm:hidden">Carteirinha</span>
              <span className="hidden sm:inline">Minha carteirinha</span>
            </>
          ) : usuario && !usuario.isAnonymous ? (
            "Minha conta"
          ) : (
            "Entrar"
          )}
        </Link>
      </div>
    </header>
  );
}

export function RodapeTorcida() {
  const { torcida } = useTorcida();
  const c = torcida.contato ?? {};
  return (
    <footer className="border-t border-linha mt-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row gap-6 sm:items-center justify-between">
        <div>
          <Marca />
          <p className="text-sm text-texto-3 mt-3 max-w-sm">Página oficial de eventos e associação. Pagamentos processados com segurança pela Pagar.me.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.whatsapp && (
            <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-11 sm:h-10 px-4 rounded-xl border border-linha hover:bg-superficie-2 text-sm">
              <Icone nome="whatsapp" className="size-4" /> WhatsApp
            </a>
          )}
          {c.instagram && (
            <a href={`https://instagram.com/${c.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-11 sm:h-10 px-4 rounded-xl border border-linha hover:bg-superficie-2 text-sm">
              <Icone nome="instagram" className="size-4" /> @{c.instagram.replace(/^@/, "")}
            </a>
          )}
        </div>
      </div>
      <div className="border-t border-linha">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-1 text-xs text-texto-3">
          <nav aria-label="Documentos" className="flex flex-wrap gap-x-4 sm:order-2 sm:ml-auto">
            <Link to={`/${torcida.slug}/termos`} className="inline-flex items-center min-h-11 hover:text-texto underline-offset-2 hover:underline">
              Termos de uso
            </Link>
            <Link to={`/${torcida.slug}/privacidade`} className="inline-flex items-center min-h-11 hover:text-texto underline-offset-2 hover:underline">
              Política de privacidade
            </Link>
          </nav>
          <p className="py-2 sm:py-0">
            Tecnologia <a href="/" className="font-semibold text-texto-2 hover:text-texto">Somos Organizada</a> · gestão profissional para torcidas organizadas
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Aceite dos Termos e da Política da torcida, logo abaixo do botão de pagar (abre em outra aba: a compra fica). */
export function AvisoTermos({ acao }: { acao: string }) {
  const { torcida } = useTorcida();
  const link = "font-semibold text-texto-2 underline underline-offset-2 hover:text-texto";
  return (
    <p className="text-xs text-center text-texto-3 leading-relaxed" data-aviso-termos>
      {acao}, você concorda com os{" "}
      <a href={`/${torcida.slug}/termos`} target="_blank" rel="noopener" className={link}>
        Termos de uso
      </a>{" "}
      e a{" "}
      <a href={`/${torcida.slug}/privacidade`} target="_blank" rel="noopener" className={link}>
        Política de privacidade
      </a>{" "}
      da {torcida.nome}.
    </p>
  );
}

/** Linha de resumo de valores (checkout). */
export function LinhaValor({ rotulo, valor, forte, sutil }: { rotulo: React.ReactNode; valor: string; forte?: boolean; sutil?: boolean }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4", forte ? "text-lg font-bold pt-3 border-t border-linha" : "text-sm", sutil && "text-texto-3")}>
      <span className={cx(!forte && !sutil && "text-texto-2")}>{rotulo}</span>
      <span className="numeros whitespace-nowrap">{valor}</span>
    </div>
  );
}

const semMovimento = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Leva o torcedor ao primeiro campo com erro ([data-erro], posto por Campo/Selecao) e põe o foco nele. */
export function rolarParaErro() {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>("[data-erro]");
    if (!el) return;
    el.scrollIntoView({ behavior: semMovimento() ? "auto" : "smooth", block: "center" });
    el.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus({ preventScroll: true });
  });
}

/**
 * Ao trocar de passo no checkout: volta ao topo do checkout (se ele saiu da tela) e põe o foco no título
 * do passo, para o leitor de tela anunciar e o teclado continuar do lugar certo. Não age na primeira exibição.
 */
export function useTrocaDeEtapa(etapa: number, topo: RefObject<HTMLElement | null>, titulo: RefObject<HTMLElement | null>) {
  const anterior = useRef(etapa);
  useEffect(() => {
    if (anterior.current === etapa) return;
    anterior.current = etapa;
    const el = topo.current;
    if (el) {
      const y = el.getBoundingClientRect().top;
      if (y < 72 || y > window.innerHeight * 0.4) el.scrollIntoView({ behavior: semMovimento() ? "auto" : "smooth", block: "start" });
    }
    titulo.current?.focus({ preventScroll: true });
  }, [etapa, topo, titulo]);
}

/** Internet caiu ou servidor não respondeu: nunca dizer "não encontrado" nesse caso. */
export function SemConexao({ tentarDeNovo, children, acaoExtra }: { tentarDeNovo: () => void; children?: ReactNode; acaoExtra?: ReactNode }) {
  return (
    <Vazio
      icone="alerta"
      titulo="Sem conexão"
      acao={
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Botao icone="atualizar" onClick={tentarDeNovo}>
            Tentar de novo
          </Botao>
          {acaoExtra}
        </div>
      }
    >
      {children ?? "Não conseguimos falar com o servidor. Confira a internet e toque em “Tentar de novo”."}
    </Vazio>
  );
}
