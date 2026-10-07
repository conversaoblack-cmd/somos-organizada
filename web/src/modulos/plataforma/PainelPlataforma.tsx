import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { sendEmailVerification, signOut, type User } from "firebase/auth";
import { collection, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import { aplicarTema, TEMA_PADRAO, TEMA_PAINEL } from "@/lib/tema";
import { useColecao, useUsuario } from "@/hooks/dados";
import type { Chamado } from "@/lib/tipos";
import { LayoutPainel, type ItemMenu } from "@/componentes/LayoutPainel";
import { Login } from "@/componentes/Login";
import { Aviso, Botao, Cartao, Icone, TelaCarregando } from "@/ui";
import { ProvedorResumo, useResumo } from "./comum";
import Solicitacoes from "./Solicitacoes";
import Mensalidades from "./Mensalidades";
import Configuracoes from "./Configuracoes";
import Dashboard from "./Dashboard";
import Torcidas from "./Torcidas";
import DetalheTorcida from "./DetalheTorcida";
import EscolherDepuracao from "./EscolherDepuracao";
import CentralSuporte from "./CentralSuporte";
import FaqRobo from "./FaqRobo";

export function MarcaSomos() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="size-9 rounded-xl bg-primaria text-sobre-primaria grid place-items-center font-display text-sm">SO</span>
      <span className="leading-tight">
        <span className="block font-bold">Somos Organizada</span>
        <span className="block text-xs text-texto-3">Plataforma</span>
      </span>
    </div>
  );
}

type Acesso = "verificando" | "sem" | "ok";

function useClaimPlataforma(u: User | null | undefined) {
  const [acesso, setAcesso] = useState<Acesso>("verificando");
  const uid = u && !u.isAnonymous ? u.uid : null;
  // depende só do uid: o onAuthStateChanged pode reemitir o mesmo usuário e não queremos remontar o painel
  const verificar = useCallback(
    async (forcar = false) => {
      const atual = auth.currentUser;
      if (!uid || !atual || atual.uid !== uid) return setAcesso("sem");
      if (forcar) setAcesso("verificando");
      try {
        const r = await atual.getIdTokenResult(forcar);
        setAcesso(r.claims.plataforma === true ? "ok" : "sem");
      } catch {
        setAcesso("sem");
      }
    },
    [uid],
  );
  useEffect(() => {
    setAcesso("verificando");
    void verificar();
  }, [verificar]);
  return { acesso, verificar };
}

export default function PainelPlataforma() {
  const u = useUsuario();
  const { acesso, verificar } = useClaimPlataforma(u);

  useEffect(() => {
    aplicarTema(TEMA_PAINEL);
    const titulo = document.title;
    document.title = "Plataforma · Somos Organizada";
    return () => {
      aplicarTema(TEMA_PADRAO);
      document.title = titulo;
    };
  }, []);

  if (u === undefined) return <TelaCarregando />;
  if (!u || u.isAnonymous) {
    return (
      <div className="min-h-dvh grid place-items-center px-4 py-10 grade-fundo">
        <div className="w-full max-w-md flex flex-col items-center gap-6">
          <MarcaSomos />
          <Login titulo="Somos Organizada · Plataforma" subtitulo="Acesso restrito à equipe interna." permitirCadastro />
        </div>
      </div>
    );
  }
  if (acesso === "verificando") return <TelaCarregando />;
  if (acesso === "sem") return <SemPermissao usuario={u} aoAtivar={() => verificar(true)} />;
  return (
    <ProvedorResumo>
      <PainelLogado usuario={u} />
    </ProvedorResumo>
  );
}

function SemPermissao({ usuario, aoAtivar }: { usuario: User; aoAtivar: () => Promise<void> }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function ativar() {
    setErro(null);
    setCarregando(true);
    try {
      await api.reivindicarPlataforma({});
      await usuario.getIdToken(true);
      await aoAtivar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }
  async function enviarVerificacao() {
    setErro(null);
    try {
      await sendEmailVerification(usuario, { url: `${location.origin}/plataforma` });
      setAviso("Enviamos o link de verificação para o seu e-mail. Depois de confirmar, toque em “Já verifiquei”.");
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }
  async function jaVerifiquei() {
    await usuario.reload();
    await usuario.getIdToken(true);
    setAviso(auth.currentUser?.emailVerified ? "E-mail verificado. Agora ative o acesso." : "Ainda não aparece como verificado. Confira o link no e-mail.");
  }

  const verificado = auth.currentUser?.emailVerified ?? usuario.emailVerified;
  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <MarcaSomos />
        <Cartao className="w-full p-7">
          <div className="size-12 rounded-2xl bg-alerta/12 text-alerta grid place-items-center mb-4">
            <Icone nome="cadeado" className="size-6" />
          </div>
          <h1 className="text-xl font-bold">Sua conta ainda não tem acesso à plataforma</h1>
          <p className="text-texto-2 text-sm mt-2">
            Você entrou como <strong className="text-texto">{usuario.email}</strong>. O painel da plataforma é exclusivo da equipe Somos Organizada.
            Para ativar, o e-mail precisa estar <strong className="text-texto">verificado</strong> e <strong className="text-texto">autorizado</strong> pela
            administração.
          </p>
          <div className="mt-5 space-y-3">
            {!verificado && (
              <Aviso
                tom="alerta"
                titulo="E-mail não verificado"
                acao={
                  <div className="flex flex-wrap gap-2">
                    <Botao tamanho="sm" variante="contorno" icone="enviar" onClick={enviarVerificacao}>
                      Enviar verificação
                    </Botao>
                    <Botao tamanho="sm" variante="fantasma" onClick={jaVerifiquei}>
                      Já verifiquei
                    </Botao>
                  </div>
                }
              >
                Confirme o e-mail antes de ativar o acesso.
              </Aviso>
            )}
            {erro && <Aviso tom="perigo">{erro}</Aviso>}
            {aviso && <Aviso tom="info">{aviso}</Aviso>}
            <Botao largo icone="escudo" carregando={carregando} onClick={ativar}>
              Ativar acesso da equipe
            </Botao>
            <Botao largo variante="fantasma" icone="sair" onClick={() => signOut(auth)}>
              Entrar com outra conta
            </Botao>
          </div>
        </Cartao>
      </div>
    </div>
  );
}

function PainelLogado({ usuario }: { usuario: User }) {
  const abertos = useColecao<Chamado>(query(collection(db, "suporte"), where("status", "==", "aberto")), "suporte-abertos");
  // contador em tempo real (o resumo traz o mesmo número, mas só é lido ao carregar)
  const pendentes = useColecao(query(collection(db, "solicitacoes"), where("status", "==", "pendente")), "solicitacoes-pendentes");
  const { resumo } = useResumo();
  const mensalidadesAtencao = (resumo?.torcidas ?? []).filter(
    (t) => t.saas && (t.saas.bloqueada || t.saas.situacao === "bloqueada" || t.saas.faturasAbertas.some((f) => f.informadoPagamentoEm)),
  ).length;
  const menu: ItemMenu[] = [
    { para: "/plataforma", rotulo: "Visão geral", icone: "painel", fim: true },
    {
      para: "/plataforma/solicitacoes",
      rotulo: "Solicitações",
      icone: "sino",
      contador: pendentes.carregando || pendentes.erro ? resumo?.solicitacoesPendentes : pendentes.dados.length,
    },
    { para: "/plataforma/torcidas", rotulo: "Torcidas", icone: "bandeira" },
    { para: "/plataforma/mensalidades", rotulo: "Mensalidades", icone: "pix", contador: mensalidadesAtencao },
    { para: "/plataforma/depuracao", rotulo: "Depuração", icone: "bug" },
    { para: "/plataforma/suporte", rotulo: "Suporte", icone: "chat", contador: abertos.dados.length },
    { para: "/plataforma/faq", rotulo: "FAQ do robô", icone: "lista" },
    { para: "/plataforma/configuracoes", rotulo: "Configurações", icone: "engrenagem" },
  ];
  return (
    <LayoutPainel
      marca={<MarcaSomos />}
      subtitulo="Equipe interna · sem acesso ao dinheiro das torcidas"
      menu={menu}
      usuario={{ nome: usuario.displayName || usuario.email?.split("@")[0] || "Equipe", detalhe: usuario.email ?? undefined }}
    >
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="torcidas" element={<Torcidas />} />
        <Route path="torcidas/:id" element={<DetalheTorcida aba="geral" />} />
        <Route path="torcidas/:id/depuracao" element={<DetalheTorcida aba="depuracao" />} />
        <Route path="depuracao" element={<EscolherDepuracao />} />
        <Route path="suporte" element={<CentralSuporte />} />
        <Route path="suporte/:chamadoId" element={<CentralSuporte />} />
        <Route path="faq" element={<FaqRobo />} />
        <Route path="solicitacoes" element={<Solicitacoes />} />
        <Route path="solicitacoes/:id" element={<Solicitacoes />} />
        <Route path="mensalidades" element={<Mensalidades />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="/plataforma" replace />} />
      </Routes>
    </LayoutPainel>
  );
}
