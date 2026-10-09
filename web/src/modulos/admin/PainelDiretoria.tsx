import { useEffect, useMemo, type ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router";
import { signOut } from "firebase/auth";
import { collection, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { aplicarTema, temaDoPainel } from "@/lib/tema";
import type { AssinaturaSaas, Evento, FaturaSaas, Sede, Socio } from "@/lib/tipos";
import { useColecao, useDocumento } from "@/hooks/dados";
import { useMembro, useTorcida } from "@/hooks/torcida";
import { LayoutPainel, type ItemMenu } from "@/componentes/LayoutPainel";
import { Login } from "@/componentes/Login";
import { BotaoPassoAPasso, ProvedorTutorial } from "@/componentes/tutorial";
import { Botao, BotaoLink, cx, Icone, TelaCarregando, Vazio } from "@/ui";
import { CtxPainel, ROTULO_PAPEL, usePainel, type ContextoPainel } from "./contexto";
import VisaoGeral from "./VisaoGeral";
import Eventos, { DetalheEvento } from "./Eventos";
import Pedidos from "./Pedidos";
import Socios from "./Socios";
import Planos from "./Planos";
import Sedes from "./Sedes";
import Financeiro from "./Financeiro";
import Usuarios from "./Usuarios";
import Personalizacao from "./Personalizacao";
import Pagamentos from "./Pagamentos";
import InicioPortaria from "./InicioPortaria";
import Recebimentos from "./Recebimentos";
import PrimeirosPassos, { usePrimeirosPassos } from "./PrimeirosPassos";
import Publicar from "./Publicar";
import PlanoSomos from "./PlanoSomos";
import Dominio from "./Dominio";
import { recebedorAtivo } from "./recebedor";
import { iniciaisTorcida } from "../publico/comum";

function Centro({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh grid place-items-center px-4 py-10">{children}</div>;
}

export default function PainelDiretoria() {
  const { tid, torcida } = useTorcida();
  const { membro, carregando, usuario } = useMembro(tid);

  // Painel com as cores da torcida sobre fundo escuro legível. Reaplica quando a torcida muda
  // (o provedor restaura o padrão ao trocar).
  useEffect(() => {
    aplicarTema(temaDoPainel(torcida.tema));
    document.title = `Painel · ${torcida.nome}`;
  }, [torcida]);

  if (carregando) return <TelaCarregando />;
  if (!usuario || usuario.isAnonymous) {
    return (
      <Centro>
        <Login
          titulo="Painel da diretoria"
          subtitulo={torcida.nome}
          rodape={
            <>
              Acesso restrito a diretoria, subsedes e portaria. Peça um convite à diretoria da torcida.
              <Link to="/entrar" className="block mt-2 font-semibold text-texto-2 hover:text-texto">
                Não é esta torcida? Trocar
              </Link>
            </>
          }
        />
      </Centro>
    );
  }
  if (!membro) {
    return (
      <Centro>
        <Vazio
          icone="cadeado"
          titulo="Sem acesso"
          acao={
            <Botao variante="contorno" icone="sair" onClick={() => signOut(auth)}>
              Sair e entrar com outra conta
            </Botao>
          }
        >
          A conta <strong className="text-texto">{usuario.email}</strong> não tem acesso ao painel da {torcida.nome}. Se você faz parte da diretoria,
          peça para alguém da diretoria te convidar em “Usuários do painel”.
        </Vazio>
      </Centro>
    );
  }
  return (
    <ProvedorTutorial>
      <PainelLogado uid={usuario.uid} membro={membro} />
    </ProvedorTutorial>
  );
}

function PainelLogado({ uid, membro }: { uid: string; membro: ContextoPainel["membro"] }) {
  const { tid, torcida } = useTorcida();
  const papel = membro.papel;
  const ehDiretoria = papel === "diretoria";
  const sedeEscopo = ehDiretoria ? null : membro.sedeId || null;
  const base = `/${torcida.slug}/admin`;
  const demo = torcida.pagamentos?.ambiente === "demo";

  const sedesQ = useColecao<Sede>(collection(db, `torcidas/${tid}/sedes`), `sedes-${tid}`);
  const sedes = useMemo(
    () => [...sedesQ.dados].sort((a, b) => (a.tipo === "principal" ? -1 : b.tipo === "principal" ? 1 : (a.ordem ?? 99) - (b.ordem ?? 99) || a.nome.localeCompare(b.nome))),
    [sedesQ.dados],
  );

  // Sócios aguardando aprovação (badge no menu e pendências do painel).
  const consultaAnalise =
    papel === "diretoria"
      ? query(collection(db, `torcidas/${tid}/socios`), where("status", "==", "em_analise"))
      : papel === "subsede" && sedeEscopo
        ? query(collection(db, `torcidas/${tid}/socios`), where("sedeId", "==", sedeEscopo), where("status", "==", "em_analise"))
        : null;
  const analise = useColecao<Socio>(consultaAnalise, `analise-${tid}-${papel}-${sedeEscopo}`);
  // Eventos de subsede aguardando aprovação (só a diretoria aprova).
  const aprovacao = useColecao<Evento>(
    ehDiretoria ? query(collection(db, `torcidas/${tid}/eventos`), where("status", "==", "em_aprovacao")) : null,
    `aprovacao-${tid}-${ehDiretoria}`,
  );
  const assinatura = useDocumento<AssinaturaSaas>(ehDiretoria ? `torcidas/${tid}/saas/assinatura` : null);
  const minhaSede = sedeEscopo ? sedes.find((s) => s.id === sedeEscopo) : undefined;
  const contaPendente = papel === "subsede" && !!minhaSede && !recebedorAtivo(minhaSede);
  const primeirosPassos = usePrimeirosPassos({ tid, torcida, papel, sedeEscopo, sedes });
  const passosPendentes = primeirosPassos.filter((i) => !i.feito && !i.opcional).length;

  const ctx: ContextoPainel = useMemo(
    () => ({
      tid,
      torcida,
      uid,
      membro,
      papel,
      ehDiretoria,
      sedeEscopo,
      sedes,
      nomeSede: (id) => (id ? (sedes.find((s) => s.id === id)?.nome ?? "Sede removida") : "—"),
      base,
      pct: torcida.taxaServicoPct ?? 10,
      emAnalise: analise.dados.length,
      emAprovacao: aprovacao.dados.length,
      podePublicarNaSede: (id) => recebedorAtivo(sedes.find((s) => s.id === id)),
      primeirosPassos,
      assinatura: assinatura.dados,
      demo,
    }),
    [tid, torcida, uid, membro, papel, ehDiretoria, sedeEscopo, sedes, base, analise.dados.length, aprovacao.dados.length, primeirosPassos, assinatura.dados, demo],
  );

  const menu: ItemMenu[] = useMemo(() => {
    if (papel === "portaria") return [{ para: base, rotulo: "Portaria", icone: "qr", fim: true }];
    // Agrupado em blocos (14 itens soltos confundem no celular); os destinos são os mesmos.
    // O que se configura uma vez e quase não se mexe fica no fim, em "Configurações".
    const DIA = "Dia a dia";
    const DINHEIRO = "Dinheiro";
    const PAGINA = "Página e equipe";
    const CONFIG = "Configurações";
    const pagamentosOk = !!torcida.pagamentos?.configurado;
    const itens: (ItemMenu & { so?: boolean })[] = [
      { para: base, rotulo: "Visão geral", icone: "painel", fim: true, grupo: DIA },
      { para: `${base}/primeiros-passos`, rotulo: "Primeiros passos", icone: "lista", contador: passosPendentes || undefined, grupo: DIA },
      { para: `${base}/eventos`, rotulo: "Eventos", icone: "calendario", contador: ehDiretoria ? aprovacao.dados.length : undefined, grupo: DIA },
      { para: `${base}/pedidos`, rotulo: "Pedidos e ingressos", icone: "ingresso", grupo: DIA },
      { para: `${base}/socios`, rotulo: "Sócios", icone: "usuarios", contador: analise.dados.length, grupo: DIA },
      { para: `${base}/financeiro`, rotulo: "Financeiro", icone: "dinheiro", grupo: DINHEIRO },
      ...(papel === "subsede"
        ? [{ para: `${base}/recebimentos`, rotulo: "Recebimentos", icone: "cartao" as const, contador: contaPendente ? 1 : undefined, grupo: DINHEIRO }]
        : []),
      // Enquanto não estiver configurado, Pagamentos fica à vista em "Dinheiro" (sem ele ninguém compra).
      ...(pagamentosOk ? [] : [{ para: `${base}/pagamentos`, rotulo: "Pagamentos", icone: "cartao" as const, so: true, contador: 1, grupo: DINHEIRO }]),
      { para: `${base}/planos`, rotulo: "Planos de sócio", icone: "estrela", so: true, grupo: PAGINA },
      { para: `${base}/personalizacao`, rotulo: "Personalizar página", icone: "pincel", so: true, grupo: PAGINA },
      { para: `${base}/publicar`, rotulo: "Publicar site", icone: "raio", so: true, contador: torcida.publicada ? undefined : 1, grupo: PAGINA },
      { para: `${base}/sedes`, rotulo: "Sedes", icone: "casa", so: true, grupo: PAGINA },
      { para: `${base}/usuarios`, rotulo: "Usuários do painel", icone: "chave", so: true, grupo: PAGINA },
      ...(pagamentosOk ? [{ para: `${base}/pagamentos`, rotulo: "Pagamentos", icone: "cartao" as const, so: true, grupo: CONFIG }] : []),
      { para: `${base}/plano`, rotulo: "Plano Somos Organizada", icone: "bandeira", so: true, grupo: CONFIG },
      { para: `${base}/dominio`, rotulo: "Domínio", icone: "cadeado", so: true, grupo: CONFIG },
    ];
    return itens.filter((i) => !i.so || ehDiretoria);
  }, [papel, base, ehDiretoria, analise.dados.length, aprovacao.dados.length, contaPendente, passosPendentes, torcida.pagamentos?.configurado, torcida.publicada]);

  const marca = (
    <div className="flex items-center gap-3">
      {torcida.tema?.logoUrl ? (
        <img src={torcida.tema.logoUrl} alt="" width={40} height={40} decoding="async" className="size-10 shrink-0 rounded-xl object-contain bg-superficie-2" />
      ) : (
        // sem escudo: iniciais da torcida na cor dela (mesmo padrão do site da torcida)
        <span className="size-10 shrink-0 rounded-xl bg-primaria text-sobre-primaria grid place-items-center font-display text-sm leading-none" aria-hidden="true">
          {iniciaisTorcida(torcida.nome)}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-bold leading-tight truncate">{torcida.nome}</p>
        <p className="text-xs text-texto-3">Painel {papel === "diretoria" ? "da diretoria" : papel === "subsede" ? "da subsede" : "da portaria"}</p>
      </div>
    </div>
  );

  const detalheUsuario = `${ROTULO_PAPEL[papel]}${sedeEscopo ? ` · ${ctx.nomeSede(sedeEscopo)}` : ""}`;

  const soDiretoria = (el: ReactNode) => (ehDiretoria ? el : <Navigate to={base} replace />);

  return (
    <CtxPainel.Provider value={ctx}>
      <LayoutPainel
        marca={marca}
        menu={menu}
        usuario={{ nome: membro.nome || membro.email, detalhe: detalheUsuario }}
        acoesTopo={
          <div className="flex items-center gap-2">
            <BotaoPassoAPasso />
            <a
              href={`/${torcida.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 min-w-11 h-11 sm:h-9 px-3 rounded-xl text-sm font-semibold text-texto-2 hover:text-texto hover:bg-superficie-2"
              aria-label="Ver página da torcida"
            >
              <Icone nome="externo" className="size-4" />
              <span className="hidden md:inline">Ver página</span>
            </a>
          </div>
        }
      >
        <FaixasGlobais />
        {papel === "portaria" ? (
          <Routes>
            <Route path="*" element={<InicioPortaria />} />
          </Routes>
        ) : (
          <Routes>
            <Route index element={<VisaoGeral />} />
            <Route path="primeiros-passos" element={<PrimeirosPassos />} />
            <Route path="eventos" element={<Eventos />} />
            <Route path="eventos/:eventoId" element={<DetalheEvento />} />
            <Route path="pedidos" element={<Pedidos />} />
            <Route path="socios" element={<Socios />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="recebimentos" element={papel === "subsede" ? <Recebimentos /> : <Navigate to={base} replace />} />
            <Route path="planos" element={soDiretoria(<Planos />)} />
            <Route path="sedes" element={soDiretoria(<Sedes />)} />
            <Route path="usuarios" element={soDiretoria(<Usuarios />)} />
            <Route path="personalizacao" element={soDiretoria(<Personalizacao />)} />
            <Route path="pagamentos" element={soDiretoria(<Pagamentos />)} />
            <Route path="publicar" element={soDiretoria(<Publicar />)} />
            <Route path="plano" element={soDiretoria(<PlanoSomos />)} />
            <Route path="dominio" element={soDiretoria(<Dominio />)} />
            <Route path="*" element={<Navigate to={base} replace />} />
          </Routes>
        )}
      </LayoutPainel>
    </CtxPainel.Provider>
  );
}

/** Faixas no topo de todo o painel: demonstração, site fora do ar, mensalidade em atraso. */
function FaixasGlobais() {
  const { torcida, tid, ehDiretoria, base, assinatura, demo } = usePainel();
  const fatura = useDocumento<FaturaSaas>(ehDiretoria && assinatura?.faturaAbertaId ? `torcidas/${tid}/faturasSaas/${assinatura.faturaAbertaId}` : null);
  const faixas: ReactNode[] = [];

  if (torcida.bloqueioSaas)
    faixas.push(
      <Faixa key="bloqueio" tom="perigo" icone="alerta" acao={ehDiretoria && <BotaoLink to={`${base}/plano`} tamanho="sm" variante="contorno">Regularizar</BotaoLink>}>
        <strong>Site fora do ar por mensalidade em atraso.</strong> {ehDiretoria ? "Pague a fatura em aberto para voltar a vender." : "Fale com a diretoria."}
      </Faixa>,
    );
  else if (ehDiretoria && assinatura?.situacao === "atrasada") {
    const venc = fatura.dados?.vencimento?.toMillis();
    const restam = venc ? Math.max(0, Math.ceil((venc + 7 * 86400_000 - Date.now()) / 86400_000)) : null;
    faixas.push(
      <Faixa key="atraso" tom="alerta" icone="relogio" acao={<BotaoLink to={`${base}/plano`} tamanho="sm" variante="contorno">Pagar agora</BotaoLink>}>
        <strong>Mensalidade da plataforma em atraso.</strong>{" "}
        {restam != null ? `Faltam ${restam} ${restam === 1 ? "dia" : "dias"} para o site sair do ar.` : "Pague para o site não sair do ar."}
      </Faixa>,
    );
  }
  if (demo)
    faixas.push(
      <Faixa key="demo" tom="info" icone="raio">
        <strong>Modo de demonstração:</strong> nenhum pagamento é real.
      </Faixa>,
    );
  if (!torcida.publicada && !torcida.bloqueioSaas)
    faixas.push(
      <Faixa
        key="publicar"
        tom="neutro"
        icone="olho"
        acao={ehDiretoria && <BotaoLink to={`${base}/publicar`} tamanho="sm" icone="raio">Publicar</BotaoLink>}
      >
        Seu site ainda não está no ar. Só a sua equipe consegue ver e testar.
      </Faixa>,
    );
  if (!faixas.length) return null;
  return <div className="space-y-2 mb-5 -mt-1">{faixas}</div>;
}

function Faixa({ tom, icone, acao, children }: { tom: "perigo" | "alerta" | "info" | "neutro"; icone: "alerta" | "relogio" | "raio" | "olho"; acao?: ReactNode; children: ReactNode }) {
  return (
    <div
      role={tom === "perigo" ? "alert" : "status"}
      className={cx(
        "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-2xl border px-4 py-3 text-sm",
        tom === "perigo" && "bg-perigo/12 border-perigo/30",
        tom === "alerta" && "bg-alerta/12 border-alerta/30",
        tom === "info" && "bg-info/12 border-info/30",
        tom === "neutro" && "bg-superficie border-linha-forte",
      )}
    >
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        <Icone
          nome={icone}
          className={cx("size-5 shrink-0", tom === "perigo" ? "text-perigo" : tom === "alerta" ? "text-alerta" : tom === "info" ? "text-info" : "text-texto-2")}
        />
        <p className="text-texto">{children}</p>
      </div>
      {acao && <div className="shrink-0 self-start sm:self-center">{acao}</div>}
    </div>
  );
}

