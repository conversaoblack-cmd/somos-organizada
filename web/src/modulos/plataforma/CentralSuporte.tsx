import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { addDoc, collection, doc, limit, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
import { dataHora, hora, relativo } from "@/lib/formatos";
import { useColecao } from "@/hooks/dados";
import type { Chamado, ComId, MensagemSuporte } from "@/lib/tipos";
import { Avatar, Botao, BotaoIcone, Cartao, Carregando, cx, Gaveta, Icone, Selecao, Selo, Vazio, useToast, type Tom } from "@/ui";

type Filtro = "todos" | Chamado["status"];

export const ROTULO_STATUS_CHAMADO: Record<Chamado["status"], string> = { aberto: "Aberto", respondido: "Respondido", resolvido: "Resolvido" };
export const TOM_STATUS_CHAMADO: Record<Chamado["status"], Tom> = { aberto: "alerta", respondido: "info", resolvido: "sucesso" };
const ROTULO_PAPEL: Record<string, string> = { diretoria: "Diretoria", subsede: "Subsede", portaria: "Portaria", socio: "Sócio", torcedor: "Torcedor" };

const RESPOSTAS_RAPIDAS: { titulo: string; texto: string }[] = [
  { titulo: "Saudação", texto: "Olá, {nome}! Aqui é da equipe Somos Organizada. Já estamos olhando o seu caso." },
  { titulo: "Pedir print", texto: "Pode nos mandar um print da tela onde aparece o problema? Assim conseguimos reproduzir mais rápido." },
  {
    titulo: "Ingresso",
    texto: "Os ingressos aparecem logo após a confirmação do pagamento e ficam também no link enviado no pedido. Se o Pix já foi pago, toque em “Já paguei” na tela do pedido.",
  },
  { titulo: "Cartão recusado", texto: "A recusa do cartão vem do banco emissor. Confira dados e limite ou tente pagar com Pix." },
  {
    titulo: "Webhook",
    texto: "Verificamos que a Pagar.me ainda não está avisando a plataforma. No painel da Pagar.me, em Configurações → Webhooks, crie um webhook com a URL que aparece em Pagamentos no painel da diretoria.",
  },
  { titulo: "Foto do evento", texto: "Para trocar a imagem do evento: Painel → Eventos → toque no evento → Editar → Imagem. Depois é só salvar." },
  { titulo: "Resolvido?", texto: "Conseguimos resolver? Se estiver tudo certo, vamos encerrar este chamado. Qualquer coisa, é só responder aqui." },
];

export default function CentralSuporte() {
  const { chamadoId } = useParams();
  const navegar = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>("aberto");
  const [torcida, setTorcida] = useState("");

  const todos = useColecao<Chamado>(query(collection(db, "suporte"), orderBy("atualizadoEm", "desc"), limit(300)), "suporte-todos");

  const torcidas = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of todos.dados) if (c.torcidaId) m.set(c.torcidaId, c.torcidaNome || c.torcidaId);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [todos.dados]);

  const daTorcida = todos.dados.filter((c) => !torcida || c.torcidaId === torcida);
  const contagem = (s: Chamado["status"]) => daTorcida.filter((c) => c.status === s).length;
  const lista = daTorcida.filter((c) => filtro === "todos" || c.status === filtro);
  const selecionado = todos.dados.find((c) => c.id === chamadoId) ?? null;

  return (
    <div className="lg:h-[calc(100dvh-8rem)] lg:min-h-[560px] flex flex-col">
      <div className={cx("lg:grid lg:grid-cols-[300px_1fr] xl:grid-cols-[340px_1fr] gap-4 flex-1 min-h-0")}>
        {/* Lista */}
        <Cartao className={cx("flex flex-col min-h-0 overflow-hidden", chamadoId && "hidden lg:flex")}>
          <div className="p-4 border-b border-linha space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">Chamados</h1>
              <span className="text-xs text-texto-3">{todos.dados.length} no total</span>
            </div>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-superficie-2 border border-linha" role="tablist" aria-label="Filtrar por status">
              {(
                [
                  ["aberto", "Abertos", contagem("aberto")],
                  ["respondido", "Respond.", contagem("respondido")],
                  ["resolvido", "Resolvidos", null],
                  ["todos", "Todos", null],
                ] as [Filtro, string, number | null][]
              ).map(([v, r, n]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={filtro === v}
                  onClick={() => setFiltro(v)}
                  className={cx(
                    "h-9 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors",
                    filtro === v ? "bg-primaria text-sobre-primaria" : "text-texto-2 hover:text-texto",
                  )}
                >
                  {r}
                  {!!n && <span className={cx("rounded-full px-1.5 text-[10px]", filtro === v ? "bg-black/15" : "bg-superficie-3")}>{n}</span>}
                </button>
              ))}
            </div>
            <Selecao value={torcida} onChange={(e) => setTorcida(e.target.value)} aria-label="Filtrar por torcida">
              <option value="">Todas as torcidas</option>
              {torcidas.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </Selecao>
          </div>
          <div className="flex-1 overflow-y-auto rolagem-fina">
            {todos.carregando ? (
              <Carregando />
            ) : todos.erro ? (
              <p className="p-4 text-sm text-perigo">{mensagemDeErro(todos.erro)}</p>
            ) : lista.length === 0 ? (
              <Vazio icone="chat" titulo="Nenhum chamado aqui">
                {filtro === "aberto" ? "Fila zerada. Bom trabalho!" : "Troque o filtro para ver outros chamados."}
              </Vazio>
            ) : (
              <ul>
                {lista.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/plataforma/suporte/${c.id}`}
                      className={cx(
                        "flex gap-3 px-4 py-3.5 border-b border-linha transition-colors",
                        c.id === chamadoId ? "bg-primaria/10" : "hover:bg-superficie-2",
                      )}
                    >
                      <Avatar nome={c.nome || "?"} tamanho="size-9" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate flex-1">{c.nome}</span>
                          <span className="text-[11px] text-texto-3 shrink-0">{relativo(c.atualizadoEm)}</span>
                        </span>
                        <span className="block text-sm truncate">{c.assunto}</span>
                        <span className="flex items-center gap-1.5 mt-1">
                          <Selo tom={TOM_STATUS_CHAMADO[c.status]}>{ROTULO_STATUS_CHAMADO[c.status]}</Selo>
                          {c.torcidaNome && <span className="text-xs text-texto-3 truncate">{c.torcidaNome}</span>}
                          {!!c.naoLidasPlataforma && (
                            <span className="ml-auto text-[11px] font-bold rounded-full bg-secundaria text-sobre-secundaria px-1.5 min-w-5 text-center">
                              {c.naoLidasPlataforma}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Cartao>

        {/* Conversa */}
        <div className={cx("min-h-0", !chamadoId && "hidden lg:block")}>
          {selecionado ? (
            <Conversa key={selecionado.id} chamado={selecionado} voltar={() => navegar("/plataforma/suporte")} />
          ) : (
            <Cartao className="h-full grid place-items-center">
              {chamadoId && todos.carregando ? (
                <Carregando />
              ) : (
                <Vazio icone="chat" titulo={chamadoId ? "Chamado não encontrado" : "Selecione um chamado"}>
                  A conversa aparece aqui em tempo real, com o diagnóstico técnico enviado pelo navegador.
                </Vazio>
              )}
            </Cartao>
          )}
        </div>
      </div>
    </div>
  );
}

function Conversa({ chamado, voltar }: { chamado: ComId<Chamado>; voltar: () => void }) {
  const msgs = useColecao<MensagemSuporte>(
    query(collection(db, `suporte/${chamado.id}/mensagens`), orderBy("criadoEm", "asc")),
    `msgs-${chamado.id}`,
  );
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [diagAberto, setDiagAberto] = useState(false);
  const [rapidas, setRapidas] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const avisar = useToast();

  // marca como lido pela equipe
  useEffect(() => {
    if (chamado.naoLidasPlataforma) updateDoc(doc(db, "suporte", chamado.id), { naoLidasPlataforma: 0 }).catch(() => undefined);
  }, [chamado.id, chamado.naoLidasPlataforma]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [msgs.dados.length]);

  async function responder(e?: FormEvent) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    try {
      await addDoc(collection(db, `suporte/${chamado.id}/mensagens`), {
        autor: "plataforma",
        texto: t.slice(0, 4000),
        nome: auth.currentUser?.displayName || "Equipe Somos Organizada",
        criadoEm: serverTimestamp(),
      });
      await updateDoc(doc(db, "suporte", chamado.id), { status: "respondido", atualizadoEm: serverTimestamp(), naoLidasPlataforma: 0 });
      setTexto("");
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
    } finally {
      setEnviando(false);
    }
  }

  async function mudarStatus(status: Chamado["status"]) {
    try {
      await updateDoc(doc(db, "suporte", chamado.id), { status, atualizadoEm: serverTimestamp(), naoLidasPlataforma: 0 });
      avisar(status === "resolvido" ? "Chamado marcado como resolvido." : "Chamado reaberto.", "sucesso");
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
    }
  }

  function usarRapida(t: string) {
    setTexto((atual) => (atual ? `${atual}\n\n` : "") + t.replace("{nome}", chamado.nome?.split(" ")[0] ?? ""));
    setRapidas(false);
    campo.current?.focus();
  }

  const diagnostico = <PainelDiagnostico chamado={chamado} />;

  return (
    <div className="h-full 2xl:grid 2xl:grid-cols-[1fr_320px] gap-4 min-h-0">
      <Cartao className="flex flex-col h-[calc(100dvh-7.5rem)] lg:h-full min-h-0 overflow-hidden">
        <header className="flex items-start gap-2 p-3 sm:p-4 border-b border-linha">
          <BotaoIcone icone="setaEsquerda" rotulo="Voltar para a lista" className="lg:hidden -ml-1" onClick={voltar} />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold leading-snug break-words">{chamado.assunto}</h2>
            <p className="text-xs text-texto-3 mt-0.5 truncate">
              {chamado.nome} · {chamado.email} · {ROTULO_PAPEL[chamado.papel ?? ""] ?? chamado.papel ?? "—"}
              {chamado.torcidaNome && ` · ${chamado.torcidaNome}`}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Selo tom={TOM_STATUS_CHAMADO[chamado.status]}>{ROTULO_STATUS_CHAMADO[chamado.status]}</Selo>
              <span className="text-xs text-texto-3">aberto em {dataHora(chamado.criadoEm)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Botao tamanho="sm" variante="suave" icone="bug" className="2xl:hidden" onClick={() => setDiagAberto(true)} aria-label="Ver diagnóstico">
              <span className="hidden sm:inline">Diagnóstico</span>
            </Botao>
            {chamado.status === "resolvido" ? (
              <Botao tamanho="sm" variante="contorno" onClick={() => mudarStatus("aberto")}>
                Reabrir
              </Botao>
            ) : (
              <Botao tamanho="sm" variante="contorno" icone="check" onClick={() => mudarStatus("resolvido")}>
                <span className="hidden sm:inline">Resolver</span>
              </Botao>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto rolagem-fina p-4 space-y-3" aria-live="polite">
          {msgs.carregando && <Carregando />}
          {msgs.dados.map((m) => {
            const nosso = m.autor === "plataforma";
            return (
              <div key={m.id} className={cx("flex", nosso ? "justify-end" : "justify-start")}>
                <div
                  className={cx(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words",
                    nosso ? "bg-primaria text-sobre-primaria rounded-br-md" : "bg-superficie-2 rounded-bl-md",
                  )}
                >
                  <p className={cx("text-[11px] font-semibold mb-0.5", nosso ? "opacity-80" : "text-texto-3")}>{m.nome || (nosso ? "Equipe" : chamado.nome)}</p>
                  {m.texto}
                  <p className={cx("text-[10px] mt-1 text-right", nosso ? "opacity-70" : "text-texto-3")}>{m.criadoEm ? hora(m.criadoEm) : "enviando…"}</p>
                </div>
              </div>
            );
          })}
          <div ref={fim} />
        </div>

        <form onSubmit={responder} className="border-t border-linha p-3 space-y-2">
          {rapidas && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Respostas rápidas">
              {RESPOSTAS_RAPIDAS.map((r) => (
                <button
                  key={r.titulo}
                  type="button"
                  title={r.texto}
                  onClick={() => usarRapida(r.texto)}
                  className="text-xs rounded-full border border-linha px-3 py-1.5 hover:bg-superficie-2 hover:border-linha-forte"
                >
                  {r.titulo}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <BotaoIcone icone="raio" rotulo="Respostas rápidas" onClick={() => setRapidas((v) => !v)} className={cx(rapidas && "text-primaria")} />
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void responder();
              }}
              rows={2}
              maxLength={4000}
              placeholder="Escreva a resposta… (Ctrl+Enter envia)"
              aria-label="Resposta"
              className="flex-1 min-h-11 max-h-40 resize-y rounded-2xl bg-superficie-2 border border-linha px-4 py-2.5 text-sm outline-none focus:border-primaria"
            />
            <Botao type="submit" icone="enviar" carregando={enviando} disabled={!texto.trim()} aria-label="Enviar resposta">
              <span className="hidden sm:inline">Enviar</span>
            </Botao>
          </div>
        </form>
      </Cartao>

      <Cartao className="hidden 2xl:block h-full overflow-y-auto rolagem-fina p-4">{diagnostico}</Cartao>
      <Gaveta aberto={diagAberto} fechar={() => setDiagAberto(false)} titulo="Diagnóstico do chamado" largura="sm:max-w-md">
        {diagnostico}
      </Gaveta>
    </div>
  );
}

function PainelDiagnostico({ chamado }: { chamado: ComId<Chamado> }) {
  const d = (chamado.diagnostico ?? {}) as Record<string, unknown>;
  const erros = Array.isArray(d.erros) ? (d.erros as { mensagem?: string; url?: string; em?: string }[]) : [];
  const conhecidos = ["url", "navegador", "tela", "idioma", "online", "versaoApp", "versao", "torcidaId", "contexto", "erros"];
  const outros = Object.entries(d).filter(([k]) => !conhecidos.includes(k));
  const linha = (rotulo: string, valor: unknown) =>
    valor === undefined || valor === null || valor === "" ? null : (
      <div key={rotulo} className="py-2 border-b border-linha">
        <dt className="text-xs text-texto-3">{rotulo}</dt>
        <dd className="text-sm break-all">{String(valor)}</dd>
      </div>
    );
  return (
    <div>
      <h3 className="font-bold flex items-center gap-2 mb-2">
        <Icone nome="bug" className="size-5 text-texto-3" /> Diagnóstico
      </h3>
      <p className="text-xs text-texto-3 mb-3">Capturado automaticamente quando o chamado foi aberto.</p>
      {chamado.torcidaId && (
        <Link
          to={`/plataforma/torcidas/${chamado.torcidaId}/depuracao`}
          className="flex items-center justify-between gap-2 rounded-xl border border-linha px-3 py-2.5 mb-3 text-sm font-semibold hover:bg-superficie-2"
        >
          <span className="flex items-center gap-2">
            <Icone nome="bug" className="size-4 text-primaria" />
            Depuração de {chamado.torcidaNome || "torcida"}
          </span>
          <Icone nome="chevronDireita" className="size-4 text-texto-3" />
        </Link>
      )}
      <dl>
        {linha("Torcida", chamado.torcidaNome ? `${chamado.torcidaNome} (${chamado.torcidaId})` : chamado.torcidaId)}
        {linha("Papel", ROTULO_PAPEL[chamado.papel ?? ""] ?? chamado.papel)}
        {linha("URL", d.url)}
        {linha("Navegador", d.navegador)}
        {linha("Tela", d.tela)}
        {linha("Idioma", d.idioma)}
        {linha("Online", d.online === undefined ? undefined : d.online ? "sim" : "não")}
        {linha("Versão do app", d.versaoApp ?? d.versao)}
        {linha("Contexto", d.contexto)}
        {outros.map(([k, v]) => linha(k, typeof v === "object" ? JSON.stringify(v) : v))}
      </dl>
      <h4 className="text-sm font-semibold mt-4 mb-2">Erros capturados ({erros.length})</h4>
      {erros.length === 0 ? (
        <p className="text-xs text-texto-3">Nenhum erro no navegador durante a sessão.</p>
      ) : (
        <ul className="space-y-2">
          {erros.map((e, i) => (
            <li key={i} className="rounded-xl bg-perigo/8 border border-perigo/20 p-2.5 text-xs">
              <p className="font-medium break-words">{e.mensagem}</p>
              <p className="text-texto-3 break-all mt-0.5">{e.url}</p>
              {e.em && <p className="text-texto-3">{dataHora(new Date(e.em))}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
