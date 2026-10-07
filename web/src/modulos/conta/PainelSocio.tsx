import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router";
import { signOut } from "firebase/auth";
import { collection, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { iniciais, moeda, taxa } from "@/lib/formatos";
import type { ComId, Ingresso, Socio, Torcida } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { useMinhaFicha, useTorcida } from "@/hooks/torcida";
import { Login } from "@/componentes/Login";
import { Avatar, Botao, BotaoLink, Carregando, cx, Icone, type NomeIcone } from "@/ui";
import { usePagarMensalidade } from "./acoes";
import { CSS_CONTA, ROTULO_SITUACAO, situacaoDoSocio, useFotoSocio } from "./comum";
import AbaCarteirinha from "./Carteirinha";
import AbaIngressos, { ehProximo } from "./Ingressos";
import AbaAssinatura from "./Assinatura";
import AbaDados from "./Dados";

function MarcaTorcida({ torcida }: { torcida: Torcida }) {
  return (
    <Link to={`/${torcida.slug}`} className="flex items-center gap-2.5 min-w-0">
      {torcida.tema.logoUrl ? (
        <img src={torcida.tema.logoUrl} alt="" className="size-9 object-contain shrink-0" />
      ) : (
        <span className="size-9 shrink-0 rounded-xl bg-primaria text-sobre-primaria grid place-items-center font-display text-sm">{iniciais(torcida.nome)}</span>
      )}
      <span className="min-w-0">
        <span className="block font-display uppercase text-[15px] leading-tight truncate">{torcida.nome}</span>
        <span className="block text-[11px] font-semibold uppercase tracking-[.18em] text-texto-3">Área do sócio</span>
      </span>
    </Link>
  );
}

function MenuUsuario({ nome, email, foto }: { nome: string; email: string; foto: string | null }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        aria-label="Menu da conta"
        className="flex items-center gap-1.5 rounded-full p-1 pr-2 hover:bg-superficie-2 transition-colors"
      >
        <Avatar nome={nome || email} url={foto} tamanho="size-8" className="text-xs" />
        <Icone nome="chevronBaixo" className={cx("size-4 text-texto-3 transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-2xl border border-linha bg-fundo shadow-2xl p-2 z-40 animate-surgir">
          <div className="px-3 py-2.5">
            <p className="font-semibold truncate">{nome || "Minha conta"}</p>
            <p className="text-xs text-texto-3 truncate">{email}</p>
          </div>
          <div className="h-px bg-linha my-1" />
          <button
            role="menuitem"
            type="button"
            onClick={() => signOut(auth)}
            className="w-full flex items-center gap-2.5 h-11 px-3 rounded-xl text-[15px] text-texto-2 hover:text-texto hover:bg-superficie-2"
          >
            <Icone nome="sair" className="size-5" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

function Topo({ torcida, usuario }: { torcida: Torcida; usuario?: { nome: string; email: string; foto: string | null } | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-linha bg-fundo/85 backdrop-blur-xl">
      <div className="mx-auto max-w-5xl h-16 px-4 sm:px-6 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <MarcaTorcida torcida={torcida} />
        </div>
        <Link
          to={`/${torcida.slug}`}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-texto-2 hover:text-texto hover:bg-superficie-2 shrink-0"
        >
          <Icone nome="setaEsquerda" className="size-4" />
          <span className="hidden sm:inline">Voltar à página</span>
          <span className="sm:hidden">Página</span>
        </Link>
        {usuario && <MenuUsuario {...usuario} />}
      </div>
    </header>
  );
}

const ABAS: { para: string; rotulo: string; icone: NomeIcone }[] = [
  { para: "", rotulo: "Carteirinha", icone: "escudo" },
  { para: "ingressos", rotulo: "Ingressos", icone: "ingresso" },
  { para: "assinatura", rotulo: "Assinatura", icone: "cartao" },
  { para: "dados", rotulo: "Dados", icone: "usuario" },
];

function BarraAbas({ slug, contadorIngressos }: { slug: string; contadorIngressos: number }) {
  return (
    <nav aria-label="Seções da conta" className="sticky top-16 z-20 mt-2 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-fundo/85 backdrop-blur-xl">
      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-superficie-2 border border-linha sm:max-w-xl">
        {ABAS.map((a) => (
          <NavLink
            key={a.rotulo}
            to={a.para ? `/${slug}/conta/${a.para}` : `/${slug}/conta`}
            end={!a.para}
            className={({ isActive }) =>
              cx(
                "relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 rounded-xl h-14 sm:h-11 text-[11.5px] sm:text-sm font-semibold transition-all",
                isActive ? "bg-primaria text-sobre-primaria shadow-[0_8px_24px_-12px_var(--color-primaria)]" : "text-texto-2 hover:text-texto",
              )
            }
          >
            <Icone nome={a.icone} className="size-5 sm:size-[18px]" />
            {a.rotulo}
            {a.para === "ingressos" && contadorIngressos > 0 && (
              <span className="absolute top-1 right-1.5 sm:static min-w-[18px] h-[18px] px-1 rounded-full bg-secundaria text-sobre-secundaria text-[10px] font-black grid place-items-center">
                {contadorIngressos}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Pendente({ tid, torcida, ficha }: { tid: string; torcida: Torcida; ficha: ComId<Socio> }) {
  const { pagar, carregando } = usePagarMensalidade(tid, torcida.slug, ficha);
  const total = ficha.cobranca ? ficha.cobranca.valorBase + ficha.cobranca.taxa : ficha.valorPlano + taxa(ficha.valorPlano, torcida.taxaServicoPct ?? 10);
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-primaria/40 bg-superficie p-5 sm:p-6 shadow-[0_24px_70px_-34px_var(--color-primaria)] so-entrar">
      <div className="absolute inset-0 brilho-primaria opacity-70 pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <span className="size-12 shrink-0 rounded-2xl bg-secundaria text-sobre-secundaria grid place-items-center">
            <Icone nome="relogio" className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primaria">Quase lá</p>
            <h2 className="text-xl font-bold leading-tight mt-0.5">Falta concluir o pagamento</h2>
            <p className="text-sm text-texto-2 mt-1">
              Sua ficha no plano <strong className="text-texto">{ficha.planoNome}</strong> está pronta. Pague {moeda(total)} pelo Pix para ativar a carteirinha e o preço de sócio.
            </p>
          </div>
        </div>
        <Botao tamanho="lg" icone="pix" carregando={carregando} onClick={() => pagar(true)} className="sm:shrink-0">
          {ficha.cobrancaAbertaId ? "Ver meu Pix" : "Pagar agora"}
        </Botao>
      </div>
    </div>
  );
}

function Saudacao({ ficha }: { ficha: Socio }) {
  const primeiro = ficha.nome.split(/\s+/)[0];
  const sit = situacaoDoSocio(ficha);
  return (
    <div className="pt-6 pb-1">
      <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight">Olá, {primeiro}</h1>
      <p className="text-texto-2 text-sm mt-0.5">
        {ficha.matricula ? `Matrícula ${ficha.matricula} · ` : ""}
        {sit === "em_dia" ? "Sócio em dia" : ROTULO_SITUACAO[sit]}
      </p>
    </div>
  );
}

export default function PainelSocio() {
  const { tid, torcida } = useTorcida();
  const { ficha, carregando, usuario } = useMinhaFicha(tid);
  const logado = !!usuario && !usuario.isAnonymous;
  const foto = useFotoSocio(ficha?.fotoPath);

  const consulta = useMemo(
    () => (logado && ficha ? query(collection(db, `torcidas/${tid}/ingressos`), where("uid", "==", usuario!.uid), orderBy("eventoData", "desc")) : null),
    [tid, logado, ficha ? ficha.uid : null, usuario?.uid],
  );
  const ingressos = useColecao<Ingresso>(consulta, `meus-ingressos-${tid}-${logado ? usuario!.uid : "-"}-${!!ficha}`);
  const proximos = useMemo(
    () => ingressos.dados.filter((i) => ehProximo(i) && i.status === "valido").sort((a, b) => a.eventoData.toMillis() - b.eventoData.toMillis()),
    [ingressos.dados],
  );

  useEffect(() => {
    document.title = `Área do sócio · ${torcida.nome}`;
  }, [torcida.nome]);

  const dadosUsuario = logado ? { nome: ficha?.nome ?? usuario!.displayName ?? "", email: usuario!.email ?? "", foto } : null;

  let conteudo;
  if (carregando) {
    conteudo = <Carregando texto="Abrindo sua área de sócio..." className="py-32" />;
  } else if (!logado) {
    conteudo = (
      <div className="min-h-[calc(100dvh-4rem)] grid place-items-center py-10">
        <div className="w-full flex flex-col items-center">
          <div className="mb-6 flex items-center gap-2 text-sm text-texto-2">
            <Icone nome="escudo" className="size-5 text-primaria" /> Carteirinha, ingressos e mensalidade num só lugar
          </div>
          <Login
            titulo="Área do sócio"
            subtitulo={`Entre com o e-mail e a senha da sua associação à ${torcida.nome}.`}
            rodape={
              <>
                Ainda não é sócio?{" "}
                <Link to={`/${torcida.slug}?aba=socios`} className="font-semibold text-primaria hover:underline">
                  Associe-se
                </Link>
              </>
            }
          />
        </div>
      </div>
    );
  } else if (!ficha) {
    conteudo = (
      <div className="min-h-[calc(100dvh-4rem)] grid place-items-center py-10">
        <div className="w-full max-w-md text-center so-entrar">
          <div className="relative mx-auto w-48 aspect-[54/86] rounded-[22px] border-2 border-dashed border-linha-forte grid place-items-center rotate-[-6deg]">
            <div className="text-texto-3">
              <Icone nome="escudo" className="size-10 mx-auto" />
              <p className="mt-2 text-xs font-bold uppercase tracking-[.2em]">Sua carteirinha</p>
            </div>
          </div>
          <h1 className="mt-8 text-2xl font-bold">Você ainda não é sócio</h1>
          <p className="text-texto-2 mt-2">
            A conta <strong className="text-texto">{usuario!.email}</strong> não tem associação na {torcida.nome}. Associe-se para ter carteirinha digital, preço de sócio nos
            ingressos e fazer parte da história.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <BotaoLink to={`/${torcida.slug}?aba=socios`} tamanho="lg" largo iconeDireita="setaDireita">
              Quero ser sócio
            </BotaoLink>
            <Botao variante="fantasma" onClick={() => signOut(auth)} icone="sair">
              Entrar com outra conta
            </Botao>
          </div>
        </div>
      </div>
    );
  } else {
    conteudo = (
      <>
        <Saudacao ficha={ficha} />
        {ficha.status === "pendente_pagamento" && (
          <div className="mt-4">
            <Pendente tid={tid} torcida={torcida} ficha={ficha} />
          </div>
        )}
        <BarraAbas slug={torcida.slug} contadorIngressos={proximos.length} />
        <div className="pt-4 pb-16 animate-surgir" key={ficha.status}>
          <Routes>
            <Route index element={<AbaCarteirinha tid={tid} torcida={torcida} ficha={ficha} proximo={proximos[0] ?? null} />} />
            <Route path="ingressos" element={<AbaIngressos tid={tid} torcida={torcida} ingressos={ingressos} />} />
            <Route path="assinatura" element={<AbaAssinatura tid={tid} torcida={torcida} ficha={ficha} />} />
            <Route path="dados" element={<AbaDados tid={tid} torcida={torcida} ficha={ficha} />} />
            <Route path="*" element={<Navigate to={`/${torcida.slug}/conta`} replace />} />
          </Routes>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-dvh relative">
      <style>{CSS_CONTA}</style>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] brilho-primaria opacity-60" />
      <Topo torcida={torcida} usuario={dadosUsuario} />
      <main className="relative mx-auto max-w-5xl px-4 sm:px-6">{conteudo}</main>
      {logado && ficha && (
        <footer className="relative pb-8 text-center text-xs text-texto-3">
          {torcida.nome} · plataforma <span className="font-semibold">Somos Organizada</span>
        </footer>
      )}
    </div>
  );
}

