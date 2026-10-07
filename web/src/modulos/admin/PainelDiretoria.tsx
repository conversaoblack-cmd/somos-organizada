import { useEffect, useMemo, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { signOut } from "firebase/auth";
import { collection, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { aplicarTema, TEMA_PAINEL } from "@/lib/tema";
import type { Sede, Socio } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { useMembro, useTorcida } from "@/hooks/torcida";
import { LayoutPainel, type ItemMenu } from "@/componentes/LayoutPainel";
import { Login } from "@/componentes/Login";
import { Botao, Icone, TelaCarregando, Vazio } from "@/ui";
import { CtxPainel, ROTULO_PAPEL, type ContextoPainel } from "./contexto";
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

function Centro({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh grid place-items-center px-4 py-10">{children}</div>;
}

export default function PainelDiretoria() {
  const { tid, torcida } = useTorcida();
  const { membro, carregando, usuario } = useMembro(tid);

  // Tema neutro de painel. Reaplica quando a torcida muda (o provedor restaura o padrão ao trocar).
  useEffect(() => {
    aplicarTema(TEMA_PAINEL);
    document.title = `Painel · ${torcida.nome}`;
  }, [torcida]);

  if (carregando) return <TelaCarregando />;
  if (!usuario || usuario.isAnonymous) {
    return (
      <Centro>
        <Login
          titulo="Painel da diretoria"
          subtitulo={torcida.nome}
          rodape={<>Acesso restrito a diretoria, subsedes e portaria. Peça um convite à diretoria da torcida.</>}
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
  return <PainelLogado uid={usuario.uid} membro={membro} />;
}

function PainelLogado({ uid, membro }: { uid: string; membro: ContextoPainel["membro"] }) {
  const { tid, torcida } = useTorcida();
  const papel = membro.papel;
  const ehDiretoria = papel === "diretoria";
  const sedeEscopo = ehDiretoria ? null : membro.sedeId || null;
  const base = `/${torcida.slug}/admin`;

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
    }),
    [tid, torcida, uid, membro, papel, ehDiretoria, sedeEscopo, sedes, base, analise.dados.length],
  );

  const menu: ItemMenu[] = useMemo(() => {
    if (papel === "portaria") return [{ para: base, rotulo: "Portaria", icone: "qr", fim: true }];
    const itens: (ItemMenu & { so?: boolean })[] = [
      { para: base, rotulo: "Visão geral", icone: "painel", fim: true },
      { para: `${base}/eventos`, rotulo: "Eventos", icone: "calendario" },
      { para: `${base}/pedidos`, rotulo: "Pedidos e ingressos", icone: "ingresso" },
      { para: `${base}/socios`, rotulo: "Sócios", icone: "usuarios", contador: analise.dados.length },
      { para: `${base}/planos`, rotulo: "Planos de sócio", icone: "estrela", so: true },
      { para: `${base}/financeiro`, rotulo: "Financeiro", icone: "dinheiro" },
      { para: `${base}/sedes`, rotulo: "Sedes", icone: "casa", so: true },
      { para: `${base}/usuarios`, rotulo: "Usuários do painel", icone: "chave", so: true },
      { para: `${base}/personalizacao`, rotulo: "Personalizar página", icone: "pincel", so: true },
      { para: `${base}/pagamentos`, rotulo: "Pagamentos", icone: "cartao", so: true, contador: torcida.pagamentos?.configurado ? undefined : 1 },
    ];
    return itens.filter((i) => !i.so || ehDiretoria);
  }, [papel, base, ehDiretoria, analise.dados.length, torcida.pagamentos?.configurado]);

  const marca = (
    <div className="flex items-center gap-3">
      {torcida.tema?.logoUrl ? (
        <img src={torcida.tema.logoUrl} alt="" className="size-10 rounded-xl object-cover bg-superficie-2" />
      ) : (
        <span className="size-10 rounded-xl bg-primaria/15 text-primaria grid place-items-center">
          <Icone nome="escudo" className="size-5" />
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
          <a
            href={`/${torcida.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-texto-2 hover:text-texto hover:bg-superficie-2"
          >
            <Icone nome="externo" className="size-4" />
            <span className="hidden sm:inline">Ver página</span>
          </a>
        }
      >
        {papel === "portaria" ? (
          <Routes>
            <Route path="*" element={<InicioPortaria />} />
          </Routes>
        ) : (
          <Routes>
            <Route index element={<VisaoGeral />} />
            <Route path="eventos" element={<Eventos />} />
            <Route path="eventos/:eventoId" element={<DetalheEvento />} />
            <Route path="pedidos" element={<Pedidos />} />
            <Route path="socios" element={<Socios />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="planos" element={soDiretoria(<Planos />)} />
            <Route path="sedes" element={soDiretoria(<Sedes />)} />
            <Route path="usuarios" element={soDiretoria(<Usuarios />)} />
            <Route path="personalizacao" element={soDiretoria(<Personalizacao />)} />
            <Route path="pagamentos" element={soDiretoria(<Pagamentos />)} />
            <Route path="*" element={<Navigate to={base} replace />} />
          </Routes>
        )}
      </LayoutPainel>
    </CtxPainel.Provider>
  );
}
