import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router";
import { signOut } from "firebase/auth";
import { collection, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { iniciais, moeda, taxa } from "@/lib/formatos";
import type { ComId, Ingresso, Socio, Torcida } from "@/lib/tipos";
import { useColecao, type Estado } from "@/hooks/dados";
import { useMinhaFicha, useTorcida } from "@/hooks/torcida";
import { Login } from "@/componentes/Login";
import { Avatar, Botao, BotaoLink, Carregando, cx, Icone, Vazio, type NomeIcone } from "@/ui";
import { usePagarMensalidade } from "./acoes";
import { aceitaCartao, ModalCartao } from "./CartaoCobranca";
import { CSS_CONTA, ROTULO_SITUACAO, situacaoDoSocio, useFotoSocio } from "./comum";
import AbaCarteirinha from "./Carteirinha";
import AbaIngressos, { ehProximo } from "./Ingressos";
import AbaAssinatura from "./Assinatura";
import AbaDados from "./Dados";

function MarcaTorcida({ torcida }: { torcida: Torcida }) {
  // No celular: escudo + nome em até 2 linhas (o rótulo "Área do sócio" só aparece no computador)
  return (
    <Link to={`/${torcida.slug}`} className="flex items-center gap-2.5 min-w-0">
      {torcida.tema.logoUrl ? (
        <img src={torcida.tema.logoUrl} alt="" className="size-9 object-contain shrink-0" />
      ) : (
        <span className="size-9 shrink-0 rounded-xl bg-primaria text-sobre-primaria grid place-items-center font-display text-sm" aria-hidden="true">
          {iniciais(torcida.nome)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block font-display uppercase text-[13px] sm:text-[15px] leading-tight line-clamp-2 sm:line-clamp-1 break-words">{torcida.nome}</span>
        <span className="hidden sm:block text-[11px] font-semibold uppercase tracking-[.18em] text-texto-3">Área do sócio</span>
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
          className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 max-w-[104px] sm:max-w-none px-2.5 sm:px-3 rounded-xl text-[13px] sm:text-sm leading-tight font-semibold text-texto-2 hover:text-texto hover:bg-superficie-2 shrink-0"
        >
          <Icone nome="setaEsquerda" className="size-4 shrink-0" />
          Ver site da torcida
        </Link>
        {usuario && <MenuUsuario {...usuario} />}
      </div>
    </header>
  );
}

const ABAS: { para: string; rotulo: string; icone: NomeIcone }[] = [
  { para: "", rotulo: "Carteirinha", icone: "escudo" },
  { para: "ingressos", rotulo: "Ingressos", icone: "ingresso" },
  { para: "assinatura", rotulo: "Mensalidade", icone: "cartao" },
  { para: "dados", rotulo: "Dados", icone: "usuario" },
];

function BarraAbas({ slug, contadorIngressos }: { slug: string; contadorIngressos: number }) {
  return (
    <nav aria-label="Seções da conta" className="sticky top-16 z-20 mt-2 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-fundo/85 backdrop-blur-xl">
      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-superficie-2 border border-linha sm:max-w-xl">
        {ABAS.map((a) => (
          <NavLink
            key={a.rotulo}
            to={a.para ? `/${slug}/socio/${a.para}` : `/${slug}/socio`}
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
  const [modalCartao, setModalCartao] = useState(false);
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
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primaria-texto">Quase lá</p>
            <h2 className="text-xl font-bold leading-tight mt-0.5">Falta concluir o pagamento</h2>
            <p className="text-sm text-texto-2 mt-1">
              Sua ficha no plano <strong className="text-texto">{ficha.planoNome}</strong> está pronta. Pague {moeda(total)} pelo Pix para ativar a carteirinha e o preço de sócio.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:shrink-0">
          <Botao tamanho="lg" icone="pix" carregando={carregando} onClick={() => pagar(true)}>
            {ficha.cobrancaAbertaId ? "Ver meu Pix" : "Pagar no Pix"}
          </Botao>
          {aceitaCartao(torcida) && (
            <Botao variante="suave" icone="cartao" onClick={() => setModalCartao(true)}>
              Pagar com cartão
            </Botao>
          )}
        </div>
      </div>
      <ModalCartao aberto={modalCartao} fechar={() => setModalCartao(false)} tid={tid} torcida={torcida} ficha={ficha} titulo="Pagar com cartão" />
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

/** Ingressos comprados pela conta + ingressos que outra pessoa comprou no CPF do sócio. */
function useMeusIngressos(tid: string, uid: string | null): Estado<ComId<Ingresso>[]> {
  const col = collection(db, `torcidas/${tid}/ingressos`);
  const comprados = useColecao<Ingresso>(
    useMemo(() => (uid ? query(col, where("uid", "==", uid), orderBy("eventoData", "desc")) : null), [tid, uid]), // eslint-disable-line react-hooks/exhaustive-deps
    `meus-ingressos-${tid}-${uid ?? "-"}`,
  );
  const emMeuNome = useColecao<Ingresso>(
    useMemo(() => (uid ? query(col, where("titularUid", "==", uid), orderBy("eventoData", "desc")) : null), [tid, uid]), // eslint-disable-line react-hooks/exhaustive-deps
    `ingressos-titular-${tid}-${uid ?? "-"}`,
  );
  return useMemo(() => {
    const porId = new Map([...comprados.dados, ...emMeuNome.dados].map((i) => [i.id, i]));
    const dados = [...porId.values()].sort((a, b) => b.eventoData.toMillis() - a.eventoData.toMillis());
    // Se uma das consultas falhar, a outra continua aparecendo: AbaIngressos mostra o que carregou e avisa que pode faltar algum
    return {
      dados,
      carregando: comprados.carregando || emMeuNome.carregando,
      erro: comprados.erro ?? emMeuNome.erro,
      semConexao: !!(comprados.semConexao || emMeuNome.semConexao),
    };
  }, [comprados, emMeuNome]);
}

/**
 * Mesma tela para dois endereços: /{torcida}/socio (painel do sócio, com a aba de ingressos) e
 * /{torcida}/conta (quem comprou ingresso e não é sócio). Cada um é levado para o endereço certo.
 */
export default function PainelSocio() {
  // "Tentar de novo" remonta a tela: as consultas em tempo real são refeitas do zero
  const [tentativa, setTentativa] = useState(0);
  return <Painel key={tentativa} tentarDeNovo={() => setTentativa((n) => n + 1)} />;
}

function Painel({ tentarDeNovo }: { tentarDeNovo: () => void }) {
  const { tid, torcida } = useTorcida();
  const { ficha, carregando, usuario, erro: erroFicha, semConexao } = useMinhaFicha(tid);
  const logado = !!usuario && !usuario.isAnonymous;
  // Sem conseguir ler a ficha, não dá para saber se é sócio: não troca de endereço nem oferece "Seja sócio"
  const fichaIncerta = logado && !ficha && (!!erroFicha || semConexao);
  const { pathname, search } = useLocation();
  const [, , secao = "conta", ...resto] = pathname.split("/");
  const secaoCerta = ficha ? "socio" : "conta";
  // Não sócio só tem "Meus ingressos" (sem subpáginas); sócio mantém a subpágina pedida (ex.: /ingressos)
  const destinoCerto =
    logado && !carregando && !fichaIncerta && secao !== secaoCerta ? `/${torcida.slug}/${secaoCerta}${ficha && resto.length ? `/${resto.join("/")}` : ""}${search}` : null;
  const foto = useFotoSocio(ficha?.fotoPath);

  const ingressos = useMeusIngressos(tid, logado ? usuario!.uid : null);
  const proximos = useMemo(
    () => ingressos.dados.filter((i) => ehProximo(i) && i.status === "valido").sort((a, b) => a.eventoData.toMillis() - b.eventoData.toMillis()),
    [ingressos.dados],
  );

  useEffect(() => {
    document.title = `Área do sócio · ${torcida.nome}`;
  }, [torcida.nome]);

  const dadosUsuario = logado ? { nome: ficha?.nome ?? usuario!.displayName ?? "", email: usuario!.email ?? "", foto } : null;

  if (destinoCerto) return <Navigate to={destinoCerto} replace />;

  let conteudo;
  if (carregando) {
    conteudo = <Carregando texto="Abrindo sua área de sócio…" className="py-32" />;
  } else if (!logado) {
    conteudo = (
      <div className="min-h-[calc(100dvh-4rem)] grid place-items-center py-10">
        <div className="w-full flex flex-col items-center">
          <div className="mb-6 flex items-center gap-2 text-sm text-texto-2">
            <Icone nome="escudo" className="size-5 text-primaria-texto" /> Carteirinha, ingressos e mensalidade num só lugar
          </div>
          <Login
            titulo="Minha conta"
            subtitulo="Entre com seu CPF ou e-mail e a senha. Sócios e quem comprou ingresso usam a mesma conta."
            aceitaCpf
            rodape={
              <>
                Ainda não é sócio?{" "}
                <Link to={`/${torcida.slug}?aba=socios`} className="font-semibold text-primaria-texto hover:underline">
                  Associe-se
                </Link>
              </>
            }
          />
        </div>
      </div>
    );
  } else if (fichaIncerta) {
    conteudo = (
      <div className="py-10">
        <Vazio
          icone="alerta"
          titulo={semConexao || !navigator.onLine ? "Sem internet" : "Não foi possível abrir sua conta"}
          acao={
            <Botao icone="atualizar" onClick={tentarDeNovo}>
              Tentar de novo
            </Botao>
          }
        >
          {semConexao || !navigator.onLine
            ? "Não conseguimos falar com o servidor. Confira a conexão e toque em Tentar de novo."
            : "Algo falhou ao buscar seus dados. Toque em Tentar de novo."}
        </Vazio>
      </div>
    );
  } else if (!ficha) {
    // Conta de quem comprou ingresso sem ser sócio: vê os ingressos e o convite para se associar
    conteudo = (
      <div className="py-8 pb-16 space-y-6 animate-surgir">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-texto-3">Minha conta</p>
          <h1 className="text-2xl font-bold mt-1">Olá{usuario!.displayName ? `, ${usuario!.displayName.split(" ")[0]}` : ""}!</h1>
          <p className="text-sm text-texto-2 mt-1">{usuario!.email}</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-primaria/40 bg-primaria/10 p-4">
          <Icone nome="escudo" className="size-8 text-primaria-texto shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Seja sócio da {torcida.nome}</p>
            <p className="text-texto-2">Carteirinha digital e preço de sócio nos ingressos.</p>
          </div>
          <BotaoLink to={`/${torcida.slug}?aba=socios`} iconeDireita="setaDireita">Quero ser sócio</BotaoLink>
        </div>
        <section>
          <h2 className="text-lg font-bold mb-3">Meus ingressos</h2>
          <AbaIngressos tid={tid} torcida={torcida} ingressos={ingressos} tentarDeNovo={tentarDeNovo} />
        </section>
        <Botao variante="fantasma" onClick={() => signOut(auth)} icone="sair">
          Sair da conta
        </Botao>
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
            <Route path="ingressos" element={<AbaIngressos tid={tid} torcida={torcida} ingressos={ingressos} tentarDeNovo={tentarDeNovo} />} />
            <Route path="assinatura" element={<AbaAssinatura tid={tid} torcida={torcida} ficha={ficha} />} />
            <Route path="dados" element={<AbaDados tid={tid} torcida={torcida} ficha={ficha} />} />
            <Route path="*" element={<Navigate to={`/${torcida.slug}/socio`} replace />} />
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

