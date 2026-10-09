import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { signOut } from "firebase/auth";
import { collection, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { api, ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import { aplicarTema, temaDoPainel } from "@/lib/tema";
import { cpfValido, dataExtensa, hora, paraData, relativo } from "@/lib/formatos";
import type { ComId, Evento, Membro, Papel } from "@/lib/tipos";
import { useColecao, useDocumento } from "@/hooks/dados";
import { useMembro, useTorcida } from "@/hooks/torcida";
import { SemConexao } from "../publico/comum";
import { Login } from "@/componentes/Login";
import { Aviso, Botao, BotaoIcone, Carregando, cx, Esqueleto, Girando, Icone, Modal, Vazio } from "@/ui";
import { useTelaAcesa } from "../conta/comum";
import { feedback, prepararAudio } from "./feedback";
import { Leitor } from "./Leitor";

const PAPEIS: Papel[] = ["diretoria", "subsede", "portaria"];
const DEBOUNCE_MS = 3000;
const AUTO_RETORNO_MS = 4000;

// ── sessionStorage protegido (aba anônima / bloqueado) ──────────────────
function ler(chave: string): string | null {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravar(chave: string, valor: string | null) {
  try {
    if (valor == null) sessionStorage.removeItem(chave);
    else sessionStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: segue só em memória */
  }
}

type RespostaValidacao = Awaited<ReturnType<typeof api.validarEntrada>>;
type Resultado = (RespostaValidacao | { resultado: "erro_conexao"; mensagem: string }) & {
  em: number;
  entrada: Entrada;
  /** "Já utilizado" logo depois de uma conferência cancelada: pode ter sido ela que liberou. */
  talvezCancelada?: boolean;
};
/** Se uma conferência cancelada chegou a liberar, o "Já utilizado" seguinte avisa por este tempo. */
const JANELA_CANCELADA_MS = 2 * 60_000;
/** leituraId: o mesmo na leitura e no "Tentar de novo", para o servidor reconhecer a baixa que já fez. */
type Entrada = ({ qr: string } | { cpf: string } | { codigo: string }) & { leituraId?: string };
const novaLeituraId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const CSS_PORTARIA = `
.scan-region-highlight-svg, .code-outline-highlight { stroke: var(--color-secundaria) !important; }
@keyframes so-encolher { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes so-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
@keyframes so-tremer { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-10px); } 40%,80% { transform: translateX(10px); } }
.so-pop { animation: so-pop .45s cubic-bezier(.2,.8,.2,1) both; }
.so-tremer { animation: so-tremer .4s ease both; }
`;

const NUM = new Intl.NumberFormat("pt-BR");
/** 1234 → "1.234" */
const num = (n: number | null | undefined) => NUM.format(n ?? 0);

/** Só abre o teclado sozinho no computador (no celular o teclado cobre a tela sem o porteiro pedir). */
const focarSozinho = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

/** Tela de "sem internet" com botão para assinar de novo. */
function SemInternet({ tentarDeNovo, extra }: { tentarDeNovo: () => void; extra?: ReactNode }) {
  return (
    <Vazio
      icone="alerta"
      titulo="Sem internet"
      acao={
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Botao icone="atualizar" onClick={tentarDeNovo}>
            Tentar de novo
          </Botao>
          {extra}
        </div>
      }
    >
      Não conseguimos falar com o servidor. Confira o sinal ou o Wi-Fi e toque em Tentar de novo.
    </Vazio>
  );
}

const ehHoje = (v: Evento["data"]) => {
  const d = paraData(v);
  if (!d) return false;
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
  return f.format(d) === f.format(new Date());
};

// ── Cabeçalho ─────────────────────────────────────────────────────────────
function Cabecalho({ titulo, subtitulo, voltar, membro }: { titulo: string; subtitulo?: string; voltar?: () => void; membro?: Membro | null }) {
  // Sair no meio da fila obriga a entrar de novo (e-mail e senha): sempre pede confirmação.
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [saindo, setSaindo] = useState(false);
  return (
    <header className="sticky top-0 z-30 bg-fundo/90 backdrop-blur-xl border-b border-linha">
      <div className="mx-auto max-w-5xl h-16 px-3 sm:px-6 flex items-center gap-2">
        {voltar ? (
          <BotaoIcone icone="chevronEsquerda" rotulo="Trocar evento" onClick={voltar} className="size-12" />
        ) : (
          <span className="size-10 ml-1 rounded-xl bg-primaria text-sobre-primaria grid place-items-center">
            <Icone nome="qr" className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 px-1">
          <p className="font-bold leading-tight truncate">{titulo}</p>
          {subtitulo && <p className="text-xs text-texto-3 truncate">{subtitulo}</p>}
        </div>
        {membro && (
          <button
            type="button"
            onClick={() => setConfirmarSaida(true)}
            className="h-11 px-3 rounded-xl flex items-center gap-2 text-sm font-semibold text-texto-2 hover:text-texto hover:bg-superficie-2"
            title={`Sair (${membro.email})`}
            aria-label="Sair da conta"
          >
            <Icone nome="sair" className="size-5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        )}
      </div>
      {membro && (
        <Modal
          aberto={confirmarSaida}
          fechar={() => !saindo && setConfirmarSaida(false)}
          titulo="Sair da portaria?"
          largura="max-w-md"
          rodape={
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Botao variante="fantasma" onClick={() => setConfirmarSaida(false)} disabled={saindo}>
                Continuar na portaria
              </Botao>
              <Botao
                variante="perigo"
                icone="sair"
                carregando={saindo}
                onClick={async () => {
                  setSaindo(true);
                  try {
                    await signOut(auth);
                  } finally {
                    setSaindo(false);
                    setConfirmarSaida(false);
                  }
                }}
              >
                Sair
              </Botao>
            </div>
          }
        >
          <p className="text-texto-2 text-[15px] leading-relaxed">
            Para voltar a ler ingressos, será preciso entrar de novo com o e-mail e a senha de {membro.email}.
          </p>
        </Modal>
      )}
    </header>
  );
}

// ── Passo 1: escolher o evento ───────────────────────────────────────────
function EscolherEvento({ tid, membro, escolher }: { tid: string; membro: Membro; escolher: (id: string) => void }) {
  // Subsede e porteiro ligado a uma sede só conferem eventos da própria sede (o servidor recusa os outros):
  // a lista mostra só esses, para ninguém escolher um evento em que todo ingresso daria "fora do escopo".
  const subsede = (membro.papel === "subsede" || membro.papel === "portaria") && !!membro.sedeId;
  const consulta = useMemo(() => {
    const base = collection(db, `torcidas/${tid}/eventos`);
    const status = where("status", "in", ["publicado", "encerrado"]);
    return subsede ? query(base, where("sedeId", "==", membro.sedeId), status) : query(base, status);
  }, [tid, subsede, membro.sedeId]);
  const [tentativa, setTentativa] = useState(0);
  const r = useColecao<Evento>(consulta, `portaria-eventos-${tid}-${subsede ? membro.sedeId : "todos"}-${tentativa}`);

  const grupos = useMemo(() => {
    const agora = Date.now();
    const t = (e: Evento) => paraData(e.data)?.getTime() ?? 0;
    const hoje = r.dados.filter((e) => ehHoje(e.data)).sort((a, b) => t(a) - t(b));
    const proximos = r.dados.filter((e) => !ehHoje(e.data) && t(e) > agora).sort((a, b) => t(a) - t(b));
    const anteriores = r.dados
      .filter((e) => !ehHoje(e.data) && t(e) <= agora)
      .sort((a, b) => t(b) - t(a))
      .slice(0, 8);
    return { hoje, proximos, anteriores };
  }, [r.dados]);

  const item = (e: ComId<Evento>, destaque = false) => (
    <li key={e.id}>
      <button
        type="button"
        onClick={() => {
          prepararAudio();
          escolher(e.id);
        }}
        className={cx(
          "w-full flex items-center gap-4 rounded-3xl border p-4 text-left transition-all active:scale-[0.98]",
          destaque ? "border-primaria bg-primaria/10 ring-1 ring-primaria/50" : "border-linha bg-superficie hover:border-linha-forte",
        )}
      >
        <span className={cx("w-16 shrink-0 rounded-2xl py-2 text-center", destaque ? "bg-primaria text-sobre-primaria" : "bg-superficie-2")}>
          <span className="block text-[11px] font-bold uppercase">{dataExtensa(e.data).split(",")[0]?.replace(".", "")}</span>
          <span className="block text-2xl font-black leading-none numeros">{paraData(e.data)?.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
          <span className="block text-[11px] font-semibold numeros">{hora(e.data)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {destaque && <span className="rounded-full bg-secundaria text-sobre-secundaria text-[11px] font-black px-2 py-0.5 tracking-wider">HOJE</span>}
            {e.status === "encerrado" && <span className="rounded-full bg-superficie-3 text-texto-2 text-[11px] font-bold px-2 py-0.5">Encerrado</span>}
          </span>
          <span className="block text-lg font-bold leading-snug mt-0.5 line-clamp-2">{e.nome}</span>
          {e.local && <span className="block text-sm text-texto-2 line-clamp-2 break-words">{e.local}</span>}
          <span className="block text-sm font-semibold text-texto-3 numeros">
            {num(e.entradas)} de {num(e.vendidos)} entraram
          </span>
        </span>
        <Icone nome="chevronDireita" className="size-6 text-texto-3 shrink-0" />
      </button>
    </li>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-[28px] font-bold tracking-tight">Qual evento?</h1>
      <p className="text-texto-2 mt-1">Escolha o evento para começar a liberar as entradas.</p>

      {r.carregando ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((k) => (
            <Esqueleto key={k} className="h-24 rounded-3xl" />
          ))}
        </div>
      ) : r.erro ? (
        <Aviso tom="perigo" className="mt-6" titulo="Não foi possível carregar os eventos">
          {mensagemDeErro(r.erro)}
          <Botao className="mt-3" tamanho="sm" variante="contorno" icone="atualizar" onClick={() => setTentativa((t) => t + 1)}>
            Tentar de novo
          </Botao>
        </Aviso>
      ) : r.semConexao ? (
        <SemInternet tentarDeNovo={() => setTentativa((t) => t + 1)} />
      ) : !r.dados.length ? (
        <Vazio icone="calendario" titulo="Nenhum evento publicado">
          Quando a diretoria publicar um evento{subsede ? " da sua sede" : ""}, ele aparece aqui.
        </Vazio>
      ) : (
        <div className="mt-6 space-y-7">
          {!!grupos.hoje.length && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-[.18em] text-primaria-texto mb-2.5">Hoje</h2>
              <ul className="space-y-3">{grupos.hoje.map((e) => item(e, true))}</ul>
            </section>
          )}
          {!!grupos.proximos.length && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-[.18em] text-texto-3 mb-2.5">Próximos</h2>
              <ul className="space-y-3">{grupos.proximos.map((e) => item(e))}</ul>
            </section>
          )}
          {!!grupos.anteriores.length && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-[.18em] text-texto-3 mb-2.5">Anteriores</h2>
              <ul className="space-y-3 opacity-75">{grupos.anteriores.map((e) => item(e))}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tela de resultado (tela cheia) ───────────────────────────────────────
const VISUAL: Record<Resultado["resultado"], { titulo: string; fundo: string; icone: "checkCirculo" | "alerta" | "xCirculo" }> = {
  liberado: { titulo: "Liberado", fundo: "bg-sucesso", icone: "checkCirculo" },
  ja_usado: { titulo: "Já utilizado", fundo: "bg-alerta", icone: "alerta" },
  invalido: { titulo: "Inválido", fundo: "bg-perigo", icone: "xCirculo" },
  cancelado: { titulo: "Cancelado", fundo: "bg-perigo", icone: "xCirculo" },
  outro_evento: { titulo: "Outro evento", fundo: "bg-perigo", icone: "xCirculo" },
  nao_encontrado: { titulo: "Não encontrado", fundo: "bg-perigo", icone: "xCirculo" },
  erro_conexao: { titulo: "Sem conexão", fundo: "bg-info", icone: "alerta" },
};

function TelaResultado({ r, proximo, tentarDeNovo }: { r: Resultado; proximo: () => void; tentarDeNovo: () => void }) {
  const v = VISUAL[r.resultado];
  const liberado = r.resultado === "liberado";
  const [segurando, setSegurando] = useState(false);
  const proximoRef = useRef(proximo);
  proximoRef.current = proximo;

  useEffect(() => {
    if (!liberado || segurando) return;
    const id = setTimeout(() => proximoRef.current(), AUTO_RETORNO_MS);
    return () => clearTimeout(id);
  }, [liberado, segurando]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => (e.key === "Enter" || e.key === " " || e.key === "Escape") && proximoRef.current();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const det = "titularNome" in r ? r : null;

  return (
    <div
      className={cx("fixed inset-0 z-50 flex flex-col text-fundo animate-[surgir_.15s_ease_both]", v.fundo)}
      role="alertdialog"
      aria-live="assertive"
      aria-label={`${v.titulo}. ${r.mensagem}`}
    >
      <div
        className="flex-1 min-h-0 overflow-y-auto px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4 flex flex-col items-center justify-center text-center"
        onClick={() => liberado && setSegurando(true)}
      >
        <div className={cx("so-pop", !liberado && r.resultado !== "ja_usado" && r.resultado !== "erro_conexao" && "so-tremer")}>
          <Icone nome={v.icone} className="size-28 sm:size-32" strokeWidth={2.2} />
        </div>
        <h2 className="mt-2 font-display text-[44px] sm:text-6xl leading-none uppercase tracking-tight">{v.titulo}</h2>

        {r.resultado === "ja_usado" && (
          <p className="mt-3 text-xl font-bold">
            Entrou às {r.usadoEm ? hora(r.usadoEm) : "—"}
            {r.usadoEm ? <span className="block text-base font-semibold opacity-75">{relativo(r.usadoEm)}</span> : null}
          </p>
        )}
        {r.talvezCancelada && (
          <p className="mt-3 max-w-md rounded-2xl bg-black/12 px-4 py-3 text-base font-bold">
            Pode ter sido a leitura que você cancelou agora há pouco. Confira o nome e o documento com foto.
          </p>
        )}
        {!liberado && r.resultado !== "ja_usado" && <p className="mt-3 text-lg font-semibold max-w-md">{r.mensagem}</p>}

        {det?.titularNome && (
          <div className="mt-6 w-full max-w-md rounded-3xl bg-black/12 p-5 text-left">
            <p className="text-2xl sm:text-3xl font-black leading-tight break-words">{det.titularNome}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold">CPF {det.titularCpf}</span>
              {det.tipo && (
                <span className={cx("rounded-full px-3 py-1 text-sm font-black uppercase tracking-wider", det.tipo === "socio" ? "bg-fundo text-texto" : "bg-black/15")}>
                  {det.tipo === "socio" ? "Sócio" : "Público"}
                </span>
              )}
            </div>
            {det.codigo && <p className="mt-2 font-mono text-base font-semibold opacity-75 tracking-wider">Código {det.codigo}</p>}
            {r.resultado === "outro_evento" && det.eventoNome && <p className="mt-2 font-semibold">Ingresso de: {det.eventoNome}</p>}
          </div>
        )}

        {liberado && (
          <p className="mt-4 flex items-center gap-2 text-lg font-bold">
            <Icone nome="usuario" className="size-6" /> Confira o documento com foto
          </p>
        )}
        {liberado && segurando && <p className="mt-2 text-sm font-semibold opacity-75">Pausado — toque em Próximo quando terminar</p>}
      </div>

      <div className="shrink-0 px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2 space-y-2.5">
        {r.resultado === "erro_conexao" && (
          <button type="button" onClick={tentarDeNovo} className="w-full h-16 rounded-3xl bg-black/15 text-xl font-black active:scale-[0.98]">
            Tentar de novo
          </button>
        )}
        <button
          type="button"
          onClick={proximo}
          autoFocus
          className="relative w-full h-20 rounded-3xl bg-fundo text-texto text-2xl font-black overflow-hidden active:scale-[0.98] transition-transform shadow-2xl"
        >
          {liberado && !segurando && (
            <span
              className="absolute inset-y-0 left-0 w-full origin-left bg-texto/15"
              style={{ animation: `so-encolher ${AUTO_RETORNO_MS}ms linear both` }}
              aria-hidden="true"
            />
          )}
          <span className="relative inline-flex items-center gap-3">
            Próximo <Icone nome="setaDireita" className="size-7" />
          </span>
        </button>
      </div>
    </div>
  );
}

// ── Passo 2: leitura ─────────────────────────────────────────────────────
function interpretar(texto: string): Entrada | { erro: string } {
  const t = texto.trim();
  if (!t) return { erro: "Digite o CPF do titular, o código do ingresso ou cole o QR." };
  if (/^SO1\./i.test(t)) return { qr: t };
  const semPontuacao = t.replace(/[\s.\-/]/g, "");
  if (/^\d{11}$/.test(semPontuacao)) return cpfValido(semPontuacao) ? { cpf: semPontuacao } : { erro: "CPF inválido. Confira os números." };
  if (/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(t)) return { codigo: t.toUpperCase() };
  return { erro: "Não reconheci. Digite o CPF do titular (11 números), o código do ingresso (ex.: K7QM-2XRA) ou cole o QR." };
}

const COR_HIST: Record<Resultado["resultado"], string> = {
  liberado: "bg-sucesso",
  ja_usado: "bg-alerta",
  invalido: "bg-perigo",
  cancelado: "bg-perigo",
  outro_evento: "bg-perigo",
  nao_encontrado: "bg-perigo",
  erro_conexao: "bg-info",
};

function Leitura({
  tid,
  eventoId,
  membro,
  trocar,
  pronto,
  comecar,
  recarregar,
}: {
  tid: string;
  eventoId: string;
  membro: Membro;
  trocar: () => void;
  /** false ao voltar para a página (recarregou): o som, a vibração e a câmera esperam um toque. */
  pronto: boolean;
  comecar: () => void;
  recarregar: () => void;
}) {
  useTelaAcesa(true);
  const { dados: evento, carregando, erro, semConexao } = useDocumento<Evento>(`torcidas/${tid}/eventos/${eventoId}`);
  const chaveSessao = `portaria:sessao:${tid}:${eventoId}`;
  const [liberadas, setLiberadas] = useState(() => Number(ler(chaveSessao)) || 0);
  const [modo, setModo] = useState<"camera" | "digitar">(() => (ler("portaria:modo") === "digitar" ? "digitar" : "camera"));
  const [texto, setTexto] = useState("");
  const [erroTexto, setErroTexto] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [historico, setHistorico] = useState<Resultado[]>([]);
  // A câmera falhou e passamos sozinhos para a digitação: avisa o porquê (só uma vez, para não prender o porteiro).
  const [falhaCamera, setFalhaCamera] = useState<string | null>(null);
  const trocouSozinho = useRef(false);
  const ultimo = useRef<{ texto: string; em: number }>({ texto: "", em: 0 });
  const ocupado = useRef(false);
  // Cada conferência ganha um número; a resposta de uma conferência cancelada chega com número velho e é ignorada.
  const tentativaAtual = useRef(0);
  const inicioTentativa = useRef(0);
  const cancelada = useRef<{ inicio: number; em: number } | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    gravar("portaria:modo", modo);
  }, [modo]);

  const validar = useCallback(
    async (lida: Entrada) => {
      if (ocupado.current) return;
      ocupado.current = true;
      const entrada: Entrada = lida.leituraId ? lida : { ...lida, leituraId: novaLeituraId() };
      const minha = ++tentativaAtual.current;
      inicioTentativa.current = Date.now();
      setValidando(true);
      let r: Resultado;
      try {
        const resp = await api.validarEntrada({ tid, eventoId, ...entrada });
        r = { ...resp, em: Date.now(), entrada };
      } catch (e) {
        // Internet ruim NÃO é ingresso inválido: só o servidor diz se é inválido. Falha de rede pede nova leitura.
        const conexao = ehErroDeConexao(e);
        r = conexao
          ? { resultado: "erro_conexao", mensagem: "A internet falhou. Isso não quer dizer que o ingresso é inválido: toque em Tentar de novo.", em: Date.now(), entrada }
          : { resultado: "invalido", mensagem: mensagemDeErro(e), em: Date.now(), entrada };
      }
      const contarLiberada = () =>
        setLiberadas((n) => {
          gravar(chaveSessao, String(n + 1));
          return n + 1;
        });
      if (minha !== tentativaAtual.current) {
        // O porteiro cancelou esta conferência: a resposta atrasada não toma a tela nem toca som.
        // Se o servidor chegou a liberar, a entrada aconteceu: conta e fica nas "Últimas leituras".
        if (r.resultado === "liberado") {
          contarLiberada();
          setHistorico((h) => [r, ...h].slice(0, 30));
        }
        return;
      }
      // Sem resposta, a baixa pode ter acontecido no servidor: um "já utilizado" logo depois pode ser esta leitura
      if (r.resultado === "erro_conexao") cancelada.current = { inicio: inicioTentativa.current, em: Date.now() };
      const c = cancelada.current;
      if (r.resultado === "ja_usado" && c && Date.now() - c.em < JANELA_CANCELADA_MS && (r.usadoEm ?? 0) >= c.inicio - 60_000) {
        r = { ...r, talvezCancelada: true };
      }
      if (r.resultado === "erro_conexao") feedback("conexao");
      else feedback(r.resultado === "liberado" ? "ok" : r.resultado === "ja_usado" ? "aviso" : "erro");
      if (r.resultado === "liberado") contarLiberada();
      setHistorico((h) => [r, ...h].slice(0, 30));
      setResultado(r);
      setValidando(false);
    },
    [tid, eventoId, chaveSessao],
  );

  const aoLer = useCallback(
    (lido: string) => {
      const agora = Date.now();
      // Mesmo QR ainda na frente da câmera: ignora (janela deslizante de 3 s).
      if (lido === ultimo.current.texto && agora - ultimo.current.em < DEBOUNCE_MS) {
        ultimo.current.em = agora;
        return;
      }
      if (ocupado.current) return;
      ultimo.current = { texto: lido, em: agora };
      if (!/^SO1\./.test(lido.trim())) {
        feedback("erro");
        const r: Resultado = { resultado: "invalido", mensagem: "Este QR não é um ingresso da torcida.", em: agora, entrada: { qr: lido } };
        ocupado.current = true;
        setHistorico((h) => [r, ...h].slice(0, 30));
        setResultado(r);
        return;
      }
      feedback("leitura");
      void validar({ qr: lido.trim() });
    },
    [validar],
  );

  const proximo = useCallback(() => {
    setResultado(null);
    ocupado.current = false;
    ultimo.current.em = Date.now();
    if (modo === "digitar") {
      setTexto("");
      setTimeout(() => campo.current?.focus(), 50);
    }
  }, [modo]);

  /** Desiste da conferência em andamento (internet lenta) e vai para a digitação do CPF ou do código. */
  const cancelarConferencia = useCallback(() => {
    tentativaAtual.current++;
    cancelada.current = { inicio: inicioTentativa.current, em: Date.now() };
    ocupado.current = false;
    ultimo.current.em = Date.now();
    setValidando(false);
    setFalhaCamera(null);
    setModo("digitar");
    setTimeout(() => campo.current?.focus(), 50);
  }, []);

  function tentarDeNovo(entrada: Entrada) {
    setResultado(null);
    ocupado.current = false;
    void validar(entrada);
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    prepararAudio();
    const r = interpretar(texto);
    if ("erro" in r) {
      setErroTexto(r.erro);
      feedback("erro");
      return;
    }
    setErroTexto(null);
    void validar(r);
  }

  async function colar() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        setTexto(t.trim());
        setErroTexto(null);
      }
    } catch {
      campo.current?.focus();
    }
  }

  const entradas = evento?.entradas ?? 0;
  const vendidos = evento?.vendidos ?? 0;
  const pct = vendidos ? Math.min(100, Math.round((entradas / vendidos) * 100)) : 0;

  const aoFalharCamera = useCallback((motivo: string) => {
    if (trocouSozinho.current) return;
    trocouSozinho.current = true;
    setFalhaCamera(motivo);
    setModo("digitar");
  }, []);

  if (carregando) return <Carregando texto="Carregando evento…" className="py-32" />;
  if (!evento && semConexao) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <SemInternet
          tentarDeNovo={recarregar}
          extra={
            <Botao variante="contorno" onClick={trocar}>
              Escolher outro evento
            </Botao>
          }
        />
      </div>
    );
  }
  if (erro || !evento) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <Vazio icone="alerta" titulo="Evento indisponível" acao={<Botao onClick={trocar}>Escolher outro evento</Botao>}>
          Este evento foi removido, cancelado ou você não tem acesso a ele.
        </Vazio>
      </div>
    );
  }

  return (
    <>
      <Cabecalho titulo={evento.nome} subtitulo={`${ehHoje(evento.data) ? "Hoje" : dataExtensa(evento.data)} · ${hora(evento.data)}${evento.local ? ` · ${evento.local}` : ""}`} voltar={trocar} membro={membro} />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 lg:py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:items-start">
        <div className="space-y-4">
          {/* contadores */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl bg-sucesso/12 border border-sucesso/30 px-3 py-3 text-center">
              <p className="text-[32px] font-black leading-none numeros text-sucesso">{num(liberadas)}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-texto-2">Liberei agora</p>
            </div>
            <div className="rounded-2xl bg-superficie border border-linha px-3 py-3 text-center">
              <p className="text-[32px] font-black leading-none numeros">{num(entradas)}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-texto-2">Entraram</p>
            </div>
            <div className="rounded-2xl bg-superficie border border-linha px-3 py-3 text-center">
              <p className="text-[32px] font-black leading-none numeros">{num(vendidos)}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-texto-2">Vendidos</p>
            </div>
          </div>
          <div className="h-2 rounded-full bg-superficie-3 overflow-hidden" title={`${pct}% já entraram`}>
            <div className="h-full bg-sucesso rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>

          {!pronto ? (
            <div className="rounded-[28px] border border-linha bg-superficie p-5 sm:p-6 text-center">
              <button
                type="button"
                onClick={() => {
                  prepararAudio();
                  comecar();
                  if (modo === "digitar" && focarSozinho()) setTimeout(() => campo.current?.focus(), 50);
                }}
                className="w-full min-h-28 rounded-3xl bg-primaria text-sobre-primaria text-2xl font-black flex flex-col items-center justify-center gap-2 px-4 py-5 active:scale-[0.98] transition-transform shadow-2xl"
              >
                <Icone nome={modo === "camera" ? "camera" : "lapis"} className="size-9" />
                Toque para começar
              </button>
              <p className="mt-3 text-sm text-texto-2">O celular só libera a câmera, o som e a vibração depois de um toque na tela.</p>
            </div>
          ) : (
            <>
              {/* modo */}
              <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-superficie-2 border border-linha">
                {(
                  [
                    ["camera", "Câmera", "camera"],
                    ["digitar", "Digitar CPF / QR", "lapis"],
                  ] as const
                ).map(([v, rot, ic]) => (
                  <button
                    key={v}
                    role="tab"
                    type="button"
                    aria-selected={modo === v}
                    onClick={() => {
                      prepararAudio();
                      setModo(v);
                      if (v === "camera") setFalhaCamera(null);
                      if (v === "digitar") setTimeout(() => campo.current?.focus(), 50);
                    }}
                    className={cx(
                      "h-14 rounded-xl flex items-center justify-center gap-2 text-base font-bold transition-all",
                      modo === v ? "bg-primaria text-sobre-primaria shadow" : "text-texto-2",
                    )}
                  >
                    <Icone nome={ic} className="size-5" /> {rot}
                  </button>
                ))}
              </div>

              {modo === "camera" ? (
                <div className="relative">
                  <Leitor pausado={!!resultado || validando} aoLer={aoLer} aoFalhar={aoFalharCamera} />
                  {validando && (
                    <div className="absolute inset-0 rounded-[28px] bg-black/70 grid place-items-center text-white p-4">
                      <div className="w-full max-w-xs flex flex-col items-center gap-3 text-center">
                        <Girando className="size-10" />
                        <p className="font-bold text-lg">Conferindo…</p>
                        <button
                          type="button"
                          onClick={cancelarConferencia}
                          className="mt-3 w-full min-h-14 px-4 py-2 rounded-2xl bg-white text-black text-lg font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-xl"
                        >
                          <Icone nome="lapis" className="size-5 shrink-0" /> Cancelar e digitar o código
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={enviar} className="rounded-[28px] border border-linha bg-superficie p-4 sm:p-5 space-y-3">
                  {falhaCamera && (
                    <Aviso tom="alerta" titulo={falhaCamera}>
                      Siga pela digitação do CPF ou do código. Para tentar a câmera de novo, toque em “Câmera”, acima.
                    </Aviso>
                  )}
                  <label htmlFor="entrada-manual" className="block font-bold text-lg">
                    CPF do titular ou conteúdo do QR
                  </label>
                  <div className="relative">
                    <input
                      ref={campo}
                      id="entrada-manual"
                      value={texto}
                      onChange={(e) => {
                        setTexto(e.target.value);
                        setErroTexto(null);
                      }}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      enterKeyHint="go"
                      inputMode={/^[\d.\-\s]*$/.test(texto) ? "numeric" : "text"}
                      placeholder="CPF ou código (K7QM-2XRA)"
                      className={cx(
                        "w-full h-16 rounded-2xl bg-superficie-2 border px-4 pr-24 text-xl font-mono outline-none focus:border-primaria",
                        erroTexto ? "border-perigo" : "border-linha",
                      )}
                    />
                    <button
                      type="button"
                      onClick={colar}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-12 px-3 rounded-xl bg-superficie-3 text-sm font-bold flex items-center gap-1.5"
                    >
                      <Icone nome="copiar" className="size-4" /> Colar
                    </button>
                  </div>
                  {erroTexto && <p className="text-perigo text-sm font-semibold">{erroTexto}</p>}
                  <button
                    type="submit"
                    disabled={validando || !texto.trim()}
                    className="w-full h-16 rounded-2xl bg-primaria text-sobre-primaria text-xl font-black flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform"
                  >
                    {validando ? <Girando className="size-6" /> : <Icone nome="checkCirculo" className="size-6" />}
                    Validar entrada
                  </button>
                  {validando && (
                    <button
                      type="button"
                      onClick={cancelarConferencia}
                      className="w-full min-h-12 rounded-2xl border-2 border-linha-forte text-lg font-bold text-texto active:scale-[0.98] transition-transform"
                    >
                      Cancelar
                    </button>
                  )}
                  <p className="text-xs text-texto-3">Pelo CPF, liberamos o ingresso válido do titular para este evento. Sempre confira o documento com foto.</p>
                </form>
              )}
            </>
          )}
        </div>

        {/* últimas leituras */}
        <aside className="mt-6 lg:mt-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold uppercase tracking-[.16em] text-texto-3">Últimas leituras</h2>
            {!!historico.length && <span className="text-xs text-texto-3 numeros">{num(historico.length)} nesta sessão</span>}
          </div>
          {!historico.length ? (
            <p className="rounded-2xl border border-dashed border-linha-forte p-5 text-sm text-texto-3 text-center">As leituras aparecem aqui.</p>
          ) : (
            <ul className="rounded-2xl border border-linha bg-superficie divide-y divide-linha overflow-hidden">
              {historico.map((h, k) => (
                <li key={`${h.em}-${k}`} className="flex items-center gap-3 px-4 py-3">
                  <span className={cx("size-3 rounded-full shrink-0", COR_HIST[h.resultado])} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold truncate">{"titularNome" in h && h.titularNome ? h.titularNome : VISUAL[h.resultado].titulo}</span>
                    <span className="block text-xs text-texto-3 truncate">
                      {VISUAL[h.resultado].titulo}
                      {"codigo" in h && h.codigo ? ` · ${h.codigo}` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-texto-3 numeros shrink-0">{hora(h.em)}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {resultado && <TelaResultado r={resultado} proximo={proximo} tentarDeNovo={() => tentarDeNovo(resultado.entrada)} />}
    </>
  );
}

// ── Página ───────────────────────────────────────────────────────────────
export default function Portaria() {
  const { tid, torcida } = useTorcida();
  const { membro, carregando, usuario, incerto } = useMembro(tid);
  const chaveEvento = `portaria:evento:${tid}`;
  const [eventoId, setEventoId] = useState<string | null>(() => ler(chaveEvento));
  // Evento lembrado da sessão (a página foi recarregada): sem um toque o navegador bloqueia som e vibração,
  // então a leitura espera "Toque para começar". Escolhendo o evento na lista, o toque já aconteceu.
  const [pronto, setPronto] = useState(() => !eventoId);
  const [tentativa, setTentativa] = useState(0);

  // Cores da torcida em alto contraste (reaplica se o documento da torcida mudar).
  useEffect(() => {
    aplicarTema(temaDoPainel(torcida.tema));
  }, [torcida]);
  useEffect(() => {
    document.title = `Portaria · ${torcida.nome}`;
  }, [torcida.nome]);

  const escolher = (id: string | null) => {
    gravar(chaveEvento, id);
    setEventoId(id);
    if (id) setPronto(true);
  };

  const logado = !!usuario && !usuario.isAnonymous;
  const autorizado = !!membro && PAPEIS.includes(membro.papel);

  let conteudo;
  if (carregando) {
    conteudo = <Carregando texto="Verificando acesso…" className="py-40" />;
  } else if (!logado) {
    conteudo = (
      <>
        <Cabecalho titulo="Portaria" subtitulo={torcida.nome} />
        <div className="min-h-[calc(100dvh-4rem)] grid place-items-center px-4 py-10">
          <Login titulo="Portaria" subtitulo={`Entre com a conta da equipe da ${torcida.nome} para ler os ingressos.`} />
        </div>
      </>
    );
  } else if (!autorizado && incerto) {
    conteudo = (
      <>
        <Cabecalho titulo="Portaria" subtitulo={torcida.nome} />
        <div className="mx-auto max-w-md px-4 py-16">
          <SemConexao tentarDeNovo={() => location.reload()}>
            Não conseguimos conferir o seu acesso agora (internet fraca). Confira a conexão e toque em “Tentar de novo”: você não precisa sair da conta.
          </SemConexao>
        </div>
      </>
    );
  } else if (!autorizado) {
    conteudo = (
      <>
        <Cabecalho titulo="Portaria" subtitulo={torcida.nome} />
        <div className="mx-auto max-w-md px-4 py-16">
          <Vazio
            icone="cadeado"
            titulo="Sem acesso à portaria"
            acao={
              <Botao variante="contorno" icone="sair" onClick={() => signOut(auth)}>
                Entrar com outra conta
              </Botao>
            }
          >
            A conta {usuario!.email} não faz parte da equipe da {torcida.nome}. Peça à diretoria um acesso de portaria.
          </Vazio>
        </div>
      </>
    );
  } else if (!eventoId) {
    conteudo = (
      <>
        <Cabecalho titulo="Portaria" subtitulo={`${torcida.nome} · ${membro!.nome}`} membro={membro} />
        <EscolherEvento tid={tid} membro={membro!} escolher={escolher} />
      </>
    );
  } else {
    conteudo = (
      <Leitura
        key={`${eventoId}-${tentativa}`}
        tid={tid}
        eventoId={eventoId}
        membro={membro!}
        trocar={() => escolher(null)}
        pronto={pronto}
        comecar={() => setPronto(true)}
        recarregar={() => setTentativa((t) => t + 1)}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-fundo">
      <style>{CSS_PORTARIA}</style>
      {conteudo}
    </div>
  );
}
