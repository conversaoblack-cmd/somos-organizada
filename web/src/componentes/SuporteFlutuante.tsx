/**
 * Botão de ajuda flutuante (torcedor, sócio e diretoria dentro de /:slug/*):
 *  - assistente que responde pelas perguntas frequentes (coleção `faq`);
 *  - abertura de chamado para a equipe Somos Organizada, com diagnóstico técnico da tela;
 *  - "Meus chamados" com a conversa em tempo real.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
import { diagnosticoDoNavegador } from "@/lib/erros";
import { hora, paraData, relativo } from "@/lib/formatos";
import type { Chamado, ComId, Faq, MensagemSuporte } from "@/lib/tipos";
import { useColecao, useUsuario } from "@/hooks/dados";
import { useTorcida } from "@/hooks/torcida";
import { Botao, BotaoIcone, cx, Girando, Icone, Selo, type Tom } from "@/ui";
import { buscarFaq, FAQ_EMBUTIDAS, faqParaPublico, type PublicoFaq } from "./suporte/faqBusca";

type Tela = "assistente" | "novo" | "chamados" | "conversa";

interface MsgRobo {
  id: number;
  de: "voce" | "robo";
  texto: string;
  faqId?: string;
  semResposta?: boolean;
  avaliado?: boolean;
}

const ROTULO_STATUS: Record<Chamado["status"], string> = { aberto: "Aguardando equipe", respondido: "Respondido", resolvido: "Resolvido" };
const TOM_STATUS: Record<Chamado["status"], Tom> = { aberto: "alerta", respondido: "info", resolvido: "sucesso" };

// ── "visto por último" por chamado (só neste navegador) ───────────────
const chaveVisto = (uid: string) => `somos-suporte-visto:${uid}`;
function lerVistos(uid: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(chaveVisto(uid)) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
function gravarVisto(uid: string, chamadoId: string) {
  try {
    const v = lerVistos(uid);
    v[chamadoId] = Date.now();
    localStorage.setItem(chaveVisto(uid), JSON.stringify(v));
  } catch {
    /* navegação privada: o aviso só não fica guardado */
  }
}
const ms = (v: Chamado["atualizadoEm"] | null | undefined) => paraData(v ?? null)?.getTime() ?? 0;

/** Remove parâmetros sensíveis (ex.: chave de acesso dos ingressos ?k=) da URL anexada. */
function limparUrl(u: unknown): unknown {
  if (typeof u !== "string") return u;
  try {
    const url = new URL(u);
    for (const p of ["k", "chave", "token", "oobCode", "apiKey"]) if (url.searchParams.has(p)) url.searchParams.set(p, "***");
    return url.toString();
  } catch {
    return u;
  }
}
function diagnosticoSeguro(): Record<string, unknown> {
  const d = diagnosticoDoNavegador();
  const erros = Array.isArray(d.erros) ? (d.erros as { url?: string }[]).map((e) => ({ ...e, url: limparUrl(e.url) })) : [];
  return { ...d, url: limparUrl(d.url), erros };
}

export default function SuporteFlutuante() {
  const { tid, torcida } = useTorcida();
  const { pathname } = useLocation();
  const usuario = useUsuario();
  const diretoria = /\/admin(\/|$)/.test(pathname);
  const publico: PublicoFaq = diretoria ? "diretoria" : "torcedor";
  const logado = !!usuario && !usuario.isAnonymous && !!usuario.email;

  const [aberto, setAberto] = useState(false);
  const [tela, setTela] = useState<Tela>("assistente");
  const [chamadoAtual, setChamadoAtual] = useState<string | null>(null);
  const [vistos, setVistos] = useState<Record<string, number>>({});
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  // Chamados do usuário (só com login de e-mail) — alimenta o aviso de resposta nova
  const chamados = useColecao<Chamado>(
    logado ? query(collection(db, "suporte"), where("uid", "==", usuario!.uid), orderBy("atualizadoEm", "desc")) : null,
    `meus-chamados-${logado ? usuario!.uid : "-"}`,
  );
  useEffect(() => {
    if (usuario?.uid) setVistos(lerVistos(usuario.uid));
  }, [usuario?.uid]);

  const naoVistos = useMemo(
    () => chamados.dados.filter((c) => c.status === "respondido" && ms(c.atualizadoEm) > (vistos[c.id] ?? 0)).map((c) => c.id),
    [chamados.dados, vistos],
  );

  const marcarVisto = useCallback(
    (id: string) => {
      if (!usuario?.uid) return;
      gravarVisto(usuario.uid, id);
      setVistos(lerVistos(usuario.uid));
    },
    [usuario?.uid],
  );

  const fechar = useCallback(() => {
    setAberto(false);
    requestAnimationFrame(() => botao.current?.focus());
  }, []);

  // Esc fecha; foco vai para o painel ao abrir
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", f);
    requestAnimationFrame(() => painel.current?.querySelector<HTMLElement>("[data-foco-inicial]")?.focus() ?? painel.current?.focus());
    return () => window.removeEventListener("keydown", f);
  }, [aberto, tela, fechar]);

  function abrirConversa(id: string) {
    setChamadoAtual(id);
    setTela("conversa");
    marcarVisto(id);
  }

  const titulo =
    tela === "assistente" ? "Ajuda" : tela === "novo" ? "Falar com a equipe" : tela === "chamados" ? "Meus chamados" : "Chamado";

  return (
    <>
      {!aberto && (
        <button
          ref={botao}
          type="button"
          onClick={() => setAberto(true)}
          aria-label={naoVistos.length ? `Ajuda — ${naoVistos.length} resposta(s) nova(s) da equipe` : "Ajuda"}
          aria-haspopup="dialog"
          className="fixed bottom-[calc(1.25rem+var(--folga-inferior,0px))] right-5 z-40 size-12 rounded-full bg-primaria text-sobre-primaria shadow-[0_10px_30px_-8px_rgba(0,0,0,.6)] grid place-items-center hover:brightness-110 active:scale-95 transition"
        >
          <Icone nome="chat" className="size-6" />
          {naoVistos.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-secundaria text-sobre-secundaria text-[11px] font-bold grid place-items-center ring-2 ring-fundo">
              {naoVistos.length}
            </span>
          )}
        </button>
      )}

      {aberto && (
        <div className="fixed inset-0 z-50 sm:inset-auto sm:bottom-5 sm:right-5">
          <div className="absolute inset-0 bg-black/50 sm:hidden" onClick={fechar} aria-hidden="true" />
          <div
            ref={painel}
            role="dialog"
            aria-modal="true"
            aria-label={`${titulo} · ${torcida.nome}`}
            tabIndex={-1}
            className={cx(
              "absolute inset-x-0 bottom-0 max-h-[88dvh] h-[88dvh] rounded-t-[28px]",
              "sm:static sm:w-[380px] sm:h-[min(620px,calc(100dvh-2.5rem))] sm:rounded-[24px]",
              "bg-fundo border border-linha shadow-2xl flex flex-col overflow-hidden outline-none animate-deslizar",
            )}
          >
            <header className="flex items-center gap-2 px-3 h-14 border-b border-linha shrink-0">
              {tela !== "assistente" ? (
                <BotaoIcone
                  icone="setaEsquerda"
                  rotulo="Voltar"
                  onClick={() => setTela(tela === "conversa" ? "chamados" : "assistente")}
                />
              ) : (
                <span className="size-10 grid place-items-center">
                  <span className="size-8 rounded-full bg-primaria text-sobre-primaria grid place-items-center">
                    <Icone nome="chat" className="size-4" />
                  </span>
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-tight truncate">{titulo}</p>
                <p className="text-[11px] text-texto-3 truncate">{torcida.nome} · Somos Organizada</p>
              </div>
              {logado && tela !== "chamados" && tela !== "conversa" && (
                <button
                  type="button"
                  onClick={() => setTela("chamados")}
                  className="relative text-xs font-semibold text-texto-2 hover:text-texto px-2 h-9 rounded-xl hover:bg-superficie-2"
                >
                  Meus chamados
                  {naoVistos.length > 0 && <span className="absolute top-1 right-0.5 size-2 rounded-full bg-secundaria" aria-label="resposta nova" />}
                </button>
              )}
              <BotaoIcone icone="x" rotulo="Fechar ajuda" onClick={fechar} />
            </header>

            {tela === "assistente" && (
              <Assistente nomeTorcida={torcida.nome} publico={publico} falarComEquipe={() => setTela("novo")} />
            )}
            {tela === "novo" && (
              <NovoChamado
                logado={logado}
                anonimo={!!usuario?.isAnonymous}
                linkEntrar={`/${torcida.slug}/${diretoria ? "admin" : "conta"}`}
                tid={tid}
                torcidaNome={torcida.nome}
                diretoria={diretoria}
                aoCriar={(id) => abrirConversa(id)}
                aoNavegar={fechar}
              />
            )}
            {tela === "chamados" && (
              <ListaChamados chamados={chamados.dados} carregando={chamados.carregando} naoVistos={naoVistos} abrir={abrirConversa} novo={() => setTela("novo")} />
            )}
            {tela === "conversa" && chamadoAtual && (
              <ConversaUsuario
                chamado={chamados.dados.find((c) => c.id === chamadoAtual) ?? null}
                chamadoId={chamadoAtual}
                aoVer={() => marcarVisto(chamadoAtual)}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Assistente (FAQ) ──────────────────────────────────────────────
function Assistente({ nomeTorcida, publico, falarComEquipe }: { nomeTorcida: string; publico: PublicoFaq; falarComEquipe: () => void }) {
  const [faqs, setFaqs] = useState<ComId<Faq>[] | null>(null);
  const [msgs, setMsgs] = useState<MsgRobo[]>([]);
  const [pergunta, setPergunta] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    getDocs(collection(db, "faq"))
      .then((s) => {
        if (!vivo) return;
        const lista = s.docs.map((d) => ({ id: d.id, ...(d.data() as Faq) }));
        setFaqs(lista.length ? lista : FAQ_EMBUTIDAS);
      })
      .catch(() => vivo && setFaqs(FAQ_EMBUTIDAS));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs.length]);

  const sugestoes = useMemo(
    () => (faqs ?? []).filter((f) => faqParaPublico(f, publico)).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99)).slice(0, 4),
    [faqs, publico],
  );

  function perguntar(texto: string) {
    const t = texto.trim();
    if (!t || !faqs) return;
    const [melhor] = buscarFaq(faqs, t, publico);
    const id = Date.now();
    setMsgs((m) => [
      ...m,
      { id, de: "voce", texto: t },
      melhor
        ? { id: id + 1, de: "robo", texto: melhor.faq.resposta, faqId: melhor.faq.id }
        : {
            id: id + 1,
            de: "robo",
            texto: "Não encontrei uma resposta pronta para isso. Quer falar com a nossa equipe? A gente responde por aqui mesmo.",
            semResposta: true,
          },
    ]);
    setPergunta("");
  }

  function avaliar(id: number, resolveu: boolean) {
    setMsgs((m) => [
      ...m.map((x) => (x.id === id ? { ...x, avaliado: true } : x)),
      resolveu
        ? { id: Date.now(), de: "robo", texto: "Que bom! Se precisar de mais alguma coisa, é só perguntar." }
        : { id: Date.now(), de: "robo", texto: "Tudo bem, vamos chamar a equipe.", semResposta: true },
    ]);
    if (!resolveu) falarComEquipe();
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto rolagem-fina p-4 space-y-3">
        <BalaoRobo>
          Olá! Sou o assistente da <strong>{nomeTorcida}</strong>. Pergunte sobre ingressos, pagamentos{publico === "diretoria" ? ", painel e Pagar.me" : " e associação"}
          . Se eu não souber, te coloco em contato com a equipe.
        </BalaoRobo>

        {!faqs ? (
          <div className="flex justify-center py-4 text-texto-3">
            <Girando />
          </div>
        ) : (
          msgs.length === 0 &&
          sugestoes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-texto-3 px-1">Perguntas frequentes</p>
              {sugestoes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => perguntar(s.pergunta)}
                  className="w-full text-left text-sm rounded-2xl border border-linha px-3.5 py-2.5 hover:bg-superficie-2 hover:border-linha-forte flex items-center gap-2"
                >
                  <span className="flex-1">{s.pergunta}</span>
                  <Icone nome="chevronDireita" className="size-4 text-texto-3" />
                </button>
              ))}
            </div>
          )
        )}

        {msgs.map((m) =>
          m.de === "voce" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primaria text-sobre-primaria px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words">{m.texto}</p>
            </div>
          ) : (
            <div key={m.id} className="space-y-2">
              <BalaoRobo>{m.texto}</BalaoRobo>
              {m.faqId && !m.avaliado && (
                <div className="flex flex-wrap items-center gap-2 pl-9">
                  <span className="text-xs text-texto-3">Isso resolveu?</span>
                  <Botao tamanho="sm" variante="suave" onClick={() => avaliar(m.id, true)}>
                    Sim
                  </Botao>
                  <Botao tamanho="sm" variante="contorno" onClick={() => avaliar(m.id, false)}>
                    Falar com a equipe
                  </Botao>
                </div>
              )}
              {m.semResposta && !m.avaliado && (
                <div className="pl-9">
                  <Botao tamanho="sm" icone="chat" onClick={falarComEquipe}>
                    Falar com a equipe
                  </Botao>
                </div>
              )}
            </div>
          ),
        )}
        <div ref={fim} />
      </div>
      <form
        className="border-t border-linha p-3 flex items-center gap-2 shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          perguntar(pergunta);
        }}
      >
        <input
          data-foco-inicial
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Digite sua dúvida…"
          aria-label="Sua pergunta"
          maxLength={300}
          className="flex-1 h-11 rounded-2xl bg-superficie-2 border border-linha px-4 text-[15px] outline-none focus:border-primaria"
        />
        <button
          type="submit"
          disabled={!pergunta.trim() || !faqs}
          aria-label="Perguntar"
          className="size-11 shrink-0 rounded-2xl bg-primaria text-sobre-primaria grid place-items-center disabled:opacity-40"
        >
          <Icone nome="enviar" className="size-5" />
        </button>
      </form>
      <button type="button" onClick={falarComEquipe} className="text-xs text-texto-3 hover:text-texto pb-3 -mt-1 shrink-0">
        Prefere falar com uma pessoa? <span className="underline">Falar com a equipe</span>
      </button>
    </>
  );
}

function BalaoRobo({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 items-end">
      <span className="size-7 shrink-0 rounded-full bg-superficie-3 grid place-items-center text-texto-2" aria-hidden="true">
        <Icone nome="chat" className="size-3.5" />
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-superficie-2 px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}

// ── Novo chamado ──────────────────────────────────────────────────
function NovoChamado({
  logado,
  anonimo,
  linkEntrar,
  tid,
  torcidaNome,
  diretoria,
  aoCriar,
  aoNavegar,
}: {
  logado: boolean;
  anonimo: boolean;
  linkEntrar: string;
  tid: string;
  torcidaNome: string;
  diretoria: boolean;
  aoCriar: (id: string) => void;
  aoNavegar: () => void;
}) {
  const [assunto, setAssunto] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!logado) {
    return (
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="size-12 rounded-2xl bg-primaria/15 text-primaria grid place-items-center">
          <Icone nome="cadeado" className="size-6" />
        </div>
        <p className="font-semibold text-lg">Entre para falar com a equipe</p>
        <p className="text-sm text-texto-2">
          Os chamados vão para a equipe Somos Organizada e a resposta chega aqui mesmo. Para isso precisamos saber quem você é: entre com o seu e-mail
          {diretoria ? " do painel." : " de sócio ou crie sua conta."}
        </p>
        {anonimo && <p className="text-xs text-texto-3">Compras feitas sem conta não contam como login.</p>}
        <Link
          to={linkEntrar}
          onClick={aoNavegar}
          data-foco-inicial
          className="inline-flex items-center justify-center gap-2 h-11 px-5 w-full rounded-2xl font-semibold bg-primaria text-sobre-primaria hover:brightness-110"
        >
          <Icone nome="usuario" className="size-5" />
          {diretoria ? "Entrar no painel" : "Entrar na minha conta"}
        </Link>
      </div>
    );
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const u = auth.currentUser;
    const a = assunto.trim();
    const t = texto.trim();
    if (!u) return setErro("Sua sessão expirou. Entre novamente.");
    if (a.length < 3) return setErro("Escreva um assunto curto.");
    if (t.length < 5) return setErro("Conte um pouco mais sobre o problema.");
    setEnviando(true);
    try {
      // papel: membro do painel > sócio > torcedor
      const [membro, socio] = await Promise.all([
        getDoc(doc(db, `torcidas/${tid}/membros/${u.uid}`)).catch(() => null),
        getDoc(doc(db, `torcidas/${tid}/socios/${u.uid}`)).catch(() => null),
      ]);
      const papel = membro?.exists() && membro.get("ativo") ? (membro.get("papel") as string) : socio?.exists() ? "socio" : "torcedor";
      const nome = (membro?.exists() && (membro.get("nome") as string)) || (socio?.exists() && (socio.get("nome") as string)) || u.displayName || u.email!.split("@")[0]!;

      const ref = await addDoc(collection(db, "suporte"), {
        uid: u.uid,
        nome,
        email: u.email,
        torcidaId: tid,
        torcidaNome,
        papel,
        assunto: a.slice(0, 140),
        status: "aberto",
        naoLidasPlataforma: 1,
        diagnostico: diagnosticoSeguro(),
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });
      await addDoc(collection(db, `suporte/${ref.id}/mensagens`), { autor: "usuario", texto: t.slice(0, 4000), nome, criadoEm: serverTimestamp() });
      aoCriar(ref.id);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex-1 overflow-y-auto p-4 space-y-4" noValidate>
      <p className="text-sm text-texto-2">Conte o que aconteceu. A equipe Somos Organizada responde por aqui, normalmente no mesmo dia.</p>
      <div>
        <label htmlFor="sup-assunto" className="block text-sm font-medium text-texto-2 mb-1.5">
          Assunto
        </label>
        <input
          id="sup-assunto"
          data-foco-inicial
          value={assunto}
          onChange={(e) => setAssunto(e.target.value.slice(0, 140))}
          maxLength={140}
          placeholder="Ex.: Paguei o Pix e não recebi o ingresso"
          className="w-full h-11 rounded-2xl bg-superficie-2 border border-linha px-4 text-[15px] outline-none focus:border-primaria"
        />
        <p className="text-[11px] text-texto-3 mt-1 text-right">{assunto.length}/140</p>
      </div>
      <div>
        <label htmlFor="sup-msg" className="block text-sm font-medium text-texto-2 mb-1.5">
          Mensagem
        </label>
        <textarea
          id="sup-msg"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder="Descreva o que você tentou fazer e o que apareceu na tela."
          className="w-full rounded-2xl bg-superficie-2 border border-linha px-4 py-3 text-[15px] outline-none focus:border-primaria resize-y"
        />
      </div>
      <p className="flex gap-2 text-xs text-texto-3 rounded-2xl bg-superficie-2 p-3">
        <Icone nome="info" className="size-4 shrink-0 mt-px" />
        Vamos anexar informações técnicas desta tela (sem senhas nem dados de cartão) para resolver mais rápido.
      </p>
      {erro && (
        <p role="alert" className="text-sm text-perigo">
          {erro}
        </p>
      )}
      <Botao type="submit" largo icone="enviar" carregando={enviando}>
        Enviar para a equipe
      </Botao>
    </form>
  );
}

// ── Meus chamados ─────────────────────────────────────────────────
function ListaChamados({
  chamados,
  carregando,
  naoVistos,
  abrir,
  novo,
}: {
  chamados: ComId<Chamado>[];
  carregando: boolean;
  naoVistos: string[];
  abrir: (id: string) => void;
  novo: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto rolagem-fina">
      {carregando ? (
        <div className="flex justify-center py-10 text-texto-3">
          <Girando />
        </div>
      ) : chamados.length === 0 ? (
        <div className="p-6 text-center space-y-3">
          <p className="font-semibold">Nenhum chamado ainda</p>
          <p className="text-sm text-texto-2">Quando você falar com a equipe, a conversa fica guardada aqui.</p>
          <Botao tamanho="sm" icone="chat" onClick={novo} data-foco-inicial>
            Falar com a equipe
          </Botao>
        </div>
      ) : (
        <ul>
          {chamados.map((c, i) => {
            const novoAviso = naoVistos.includes(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  data-foco-inicial={i === 0 ? true : undefined}
                  onClick={() => abrir(c.id)}
                  className="w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-linha hover:bg-superficie-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-sm truncate", novoAviso ? "font-bold" : "font-medium")}>{c.assunto}</span>
                    <span className="flex items-center gap-2 mt-1">
                      <Selo tom={TOM_STATUS[c.status]}>{ROTULO_STATUS[c.status]}</Selo>
                      <span className="text-[11px] text-texto-3">{relativo(c.atualizadoEm)}</span>
                    </span>
                  </span>
                  {novoAviso && (
                    <span className="mt-1 text-[10px] font-bold uppercase rounded-full bg-secundaria text-sobre-secundaria px-2 py-0.5">nova resposta</span>
                  )}
                  <Icone nome="chevronDireita" className="size-4 text-texto-3 mt-1" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {chamados.length > 0 && (
        <div className="p-4">
          <Botao tamanho="sm" variante="contorno" icone="mais" largo onClick={novo}>
            Novo chamado
          </Botao>
        </div>
      )}
    </div>
  );
}

function ConversaUsuario({ chamado, chamadoId, aoVer }: { chamado: ComId<Chamado> | null; chamadoId: string; aoVer: () => void }) {
  const msgs = useColecao<MensagemSuporte>(query(collection(db, `suporte/${chamadoId}/mensagens`), orderBy("criadoEm", "asc")), `minhas-msgs-${chamadoId}`);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  // novas mensagens com o painel aberto contam como vistas
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
    aoVer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs.dados.length, chamado?.status]);

  async function responder(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    setErro(null);
    try {
      await addDoc(collection(db, `suporte/${chamadoId}/mensagens`), {
        autor: "usuario",
        texto: t.slice(0, 4000),
        nome: chamado?.nome ?? auth.currentUser?.displayName ?? "",
        criadoEm: serverTimestamp(),
      });
      await updateDoc(doc(db, "suporte", chamadoId), { status: "aberto", atualizadoEm: serverTimestamp(), naoLidasPlataforma: increment(1) });
      setTexto("");
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function resolver() {
    setErro(null);
    try {
      await updateDoc(doc(db, "suporte", chamadoId), { status: "resolvido", atualizadoEm: serverTimestamp() });
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-linha shrink-0">
        <p className="font-semibold text-sm leading-snug break-words">{chamado?.assunto ?? "Carregando…"}</p>
        {chamado && (
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <Selo tom={TOM_STATUS[chamado.status]}>{ROTULO_STATUS[chamado.status]}</Selo>
            {chamado.status !== "resolvido" && (
              <button type="button" onClick={resolver} className="text-xs font-semibold text-texto-2 hover:text-texto inline-flex items-center gap-1">
                <Icone nome="check" className="size-4" /> Marcar como resolvido
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto rolagem-fina p-4 space-y-3" aria-live="polite">
        {msgs.carregando && (
          <div className="flex justify-center py-6 text-texto-3">
            <Girando />
          </div>
        )}
        {msgs.dados.map((m) => {
          const meu = m.autor === "usuario";
          return (
            <div key={m.id} className={cx("flex", meu ? "justify-end" : "justify-start")}>
              <div
                className={cx(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
                  meu ? "bg-primaria text-sobre-primaria rounded-br-md" : "bg-superficie-2 rounded-bl-md",
                )}
              >
                {!meu && <p className="text-[11px] font-semibold text-texto-3 mb-0.5">{m.nome || "Equipe Somos Organizada"}</p>}
                {m.texto}
                <p className={cx("text-[10px] mt-1 text-right", meu ? "opacity-70" : "text-texto-3")}>{m.criadoEm ? hora(m.criadoEm) : "enviando…"}</p>
              </div>
            </div>
          );
        })}
        {chamado?.status === "aberto" && msgs.dados.length > 0 && (
          <p className="text-center text-xs text-texto-3">A equipe foi avisada. Você pode fechar esta janela; a resposta aparece aqui.</p>
        )}
        <div ref={fim} />
      </div>
      {erro && (
        <p role="alert" className="px-4 pb-1 text-xs text-perigo">
          {erro}
        </p>
      )}
      <form onSubmit={responder} className="border-t border-linha p-3 flex items-end gap-2 shrink-0">
        <textarea
          data-foco-inicial
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={chamado?.status === "resolvido" ? "Escreva para reabrir…" : "Escreva uma mensagem…"}
          aria-label="Mensagem para a equipe"
          className="flex-1 min-h-11 max-h-32 resize-none rounded-2xl bg-superficie-2 border border-linha px-4 py-2.5 text-[15px] outline-none focus:border-primaria"
        />
        <button
          type="submit"
          disabled={!texto.trim() || enviando}
          aria-label="Enviar mensagem"
          className="size-11 shrink-0 rounded-2xl bg-primaria text-sobre-primaria grid place-items-center disabled:opacity-40"
        >
          {enviando ? <Girando className="size-5" /> : <Icone nome="enviar" className="size-5" />}
        </button>
      </form>
    </>
  );
}
