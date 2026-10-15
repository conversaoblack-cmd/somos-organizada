/**
 * Anexos do suporte (foto, print colado, áudio gravado, PDF), usados pelo robô, pelo novo chamado, pela conversa da
 * torcida e pela central da equipe. Pedido do dono: "+" ao lado do campo, colar print (Ctrl+V / colar no celular) e
 * mandar áudio, tanto no robô quanto no chat com a equipe.
 *
 * - Arquivo vai para o Storage em suporte/{dono do chamado}/{chamado}/... (regra em storage.rules: só o dono e a
 *   equipe leem; ninguém sobrescreve). A mensagem guarda só o caminho (firestore.rules confere o dono no caminho).
 * - Foto é reduzida (lado maior 1600 px, JPEG) antes de subir: print de celular tem 3–5 MB.
 * - Áudio: MediaRecorder em MP4/AAC quando o navegador grava (toca no iPhone); senão WebM/Opus. Até 3 minutos.
 */
import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import { getDownloadURL, ref as refStorage, uploadBytes } from "firebase/storage";
import { createPortal } from "react-dom";
import { storage } from "@/lib/armazenamento";
import type { AnexoSuporte } from "@/lib/tipos";
import { BotaoIcone, cx, Girando, Icone } from "@/ui";

export type { AnexoSuporte };

export interface AnexoPendente {
  id: string;
  arquivo: Blob;
  nome: string;
  tipo: AnexoSuporte["tipo"];
  mime: string;
  previa?: string;
  duracao?: number;
}

export const MAX_ANEXOS = 4;
const MB = 1024 * 1024;
const LIMITE: Record<AnexoSuporte["tipo"], number> = { imagem: 15 * MB, audio: 15 * MB, arquivo: 10 * MB };
const MAX_GRAVACAO_S = 180;
export const ACEITOS = "image/*,audio/*,application/pdf";

function tipoDe(mime: string, nome = ""): AnexoSuporte["tipo"] | null {
  if (mime.startsWith("image/") || /\.(heic|heif)$/i.test(nome)) return "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "arquivo";
  return null;
}

const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Texto curto para lista e notificação quando a mensagem é só anexo. */
export function resumoAnexos(anexos?: { tipo: AnexoSuporte["tipo"] }[]): string {
  if (!anexos?.length) return "";
  const n = (t: AnexoSuporte["tipo"]) => anexos.filter((a) => a.tipo === t).length;
  const partes = [
    n("imagem") && (n("imagem") > 1 ? `${n("imagem")} fotos` : "Foto"),
    n("audio") && (n("audio") > 1 ? `${n("audio")} áudios` : "Áudio"),
    n("arquivo") && (n("arquivo") > 1 ? `${n("arquivo")} arquivos` : "Arquivo"),
  ].filter(Boolean);
  return partes.join(", ");
}

const duracaoTexto = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ── Lista de anexos escolhidos (antes de enviar) ─────────────────────────────

export function useAnexos(iniciais: AnexoPendente[] = []) {
  const [pendentes, setPendentes] = useState<AnexoPendente[]>(iniciais);
  const [erro, setErro] = useState<string | null>(null);
  const atual = useRef(pendentes);
  atual.current = pendentes;

  // prévias (blob:) liberadas ao sair da tela
  useEffect(() => {
    return () => {
      for (const p of atual.current) if (p.previa) URL.revokeObjectURL(p.previa);
    };
  }, []);

  const incluir = useCallback((novos: AnexoPendente[]) => {
    setErro(null);
    setPendentes((lista) => {
      const cabe = Math.max(0, MAX_ANEXOS - lista.length);
      if (novos.length > cabe) setErro(`No máximo ${MAX_ANEXOS} anexos por mensagem.`);
      for (const n of novos.slice(cabe)) if (n.previa) URL.revokeObjectURL(n.previa);
      return [...lista, ...novos.slice(0, cabe)];
    });
  }, []);

  const adicionar = useCallback(
    (arquivos: FileList | File[] | null | undefined) => {
      const lista = Array.from(arquivos ?? []);
      if (!lista.length) return;
      const ok: AnexoPendente[] = [];
      for (const f of lista) {
        const tipo = tipoDe(f.type, f.name);
        if (!tipo) {
          setErro("Envie foto, áudio ou PDF.");
          continue;
        }
        if (f.size > LIMITE[tipo]) {
          setErro(`${f.name || "Arquivo"} passa de ${Math.round(LIMITE[tipo] / MB)} MB.`);
          continue;
        }
        ok.push({
          id: novoId(),
          arquivo: f,
          nome: f.name || (tipo === "imagem" ? "print.png" : tipo === "audio" ? "audio" : "arquivo.pdf"),
          tipo,
          mime: f.type || (tipo === "imagem" ? "image/jpeg" : "application/octet-stream"),
          previa: tipo !== "arquivo" ? URL.createObjectURL(f) : undefined,
        });
      }
      incluir(ok);
    },
    [incluir],
  );

  /** Colar print (Ctrl+V no computador, "Colar" no celular): imagens do clipboard viram anexo. */
  const colar = useCallback(
    (e: ClipboardEvent) => {
      const arquivos = Array.from(e.clipboardData?.files ?? []).filter((f) => tipoDe(f.type, f.name));
      if (!arquivos.length) return;
      e.preventDefault();
      adicionar(arquivos);
    },
    [adicionar],
  );

  const remover = useCallback((id: string) => {
    setPendentes((lista) => {
      const p = lista.find((x) => x.id === id);
      if (p?.previa) URL.revokeObjectURL(p.previa);
      return lista.filter((x) => x.id !== id);
    });
  }, []);

  /** Esvazia depois de enviar (as prévias continuam válidas para quem recebeu a lista, ex.: o novo chamado). */
  const esvaziar = useCallback((liberar = true) => {
    if (liberar) for (const p of atual.current) if (p.previa) URL.revokeObjectURL(p.previa);
    atual.current = []; // quem recebeu a lista (liberar = false) continua com as prévias, mesmo se esta tela fechar já
    setPendentes([]);
    setErro(null);
  }, []);

  return { pendentes, erro, setErro, adicionar, incluir, colar, remover, esvaziar };
}

// ── Gravação de áudio ───────────────────────────────────────────────────────

function formatoGravacao(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"]) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* navegador antigo */
    }
  }
  return "";
}

export const podeGravar = () =>
  typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export function useGravador(aoTerminar: (p: AnexoPendente) => void) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const partes = useRef<Blob[]>([]);
  const inicio = useRef(0);
  const descartar = useRef(false);
  const relogio = useRef<number | null>(null);
  const terminar = useRef(aoTerminar);
  terminar.current = aoTerminar;

  const soltar = useCallback(() => {
    if (relogio.current) window.clearInterval(relogio.current);
    relogio.current = null;
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
    gravador.current = null;
    setGravando(false);
  }, []);

  useEffect(() => {
    return () => {
      descartar.current = true;
      try {
        gravador.current?.stop();
      } catch {
        /* já parou */
      }
      soltar();
    };
  }, [soltar]);

  const parar = useCallback(() => {
    const g = gravador.current;
    if (g && g.state !== "inactive") g.stop();
  }, []);

  const iniciar = useCallback(async () => {
    setErro(null);
    if (!podeGravar()) {
      setErro("Este navegador não grava áudio. Anexe um áudio pelo “+”.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      fluxo.current = s;
      const mime = formatoGravacao();
      const g = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
      gravador.current = g;
      partes.current = [];
      descartar.current = false;
      g.ondataavailable = (e) => {
        if (e.data.size) partes.current.push(e.data);
      };
      g.onstop = () => {
        const duracao = Math.max(1, Math.round((Date.now() - inicio.current) / 1000));
        const tipo = (g.mimeType || mime || "audio/mp4").split(";")[0]!;
        const blob = new Blob(partes.current, { type: tipo });
        soltar();
        if (descartar.current || !blob.size) return;
        const ext = tipo.includes("webm") ? "webm" : tipo.includes("aac") ? "aac" : "m4a";
        terminar.current({ id: novoId(), arquivo: blob, nome: `audio-${duracaoTexto(duracao).replace(":", "m")}s.${ext}`, tipo: "audio", mime: tipo, previa: URL.createObjectURL(blob), duracao });
      };
      inicio.current = Date.now();
      setSegundos(0);
      g.start(1000);
      setGravando(true);
      relogio.current = window.setInterval(() => {
        const s2 = Math.floor((Date.now() - inicio.current) / 1000);
        setSegundos(s2);
        if (s2 >= MAX_GRAVACAO_S) parar();
      }, 250);
    } catch (e) {
      soltar();
      const nome = (e as { name?: string }).name;
      setErro(
        nome === "NotAllowedError"
          ? "Libere o microfone para este site (no iPhone: Ajustes → Safari → Microfone) e tente de novo."
          : "Não foi possível usar o microfone agora.",
      );
    }
  }, [parar, soltar]);

  const cancelar = useCallback(() => {
    descartar.current = true;
    parar();
  }, [parar]);

  return { gravando, segundos, erro, iniciar, parar, cancelar };
}

// ── Peças de tela ───────────────────────────────────────────────────────────

/** "+" que abre a galeria, câmera ou arquivos. */
export function BotaoAnexar({ aoEscolher, desativado, className }: { aoEscolher: (f: FileList | null) => void; desativado?: boolean; className?: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <>
      <BotaoIcone icone="mais" rotulo="Anexar foto, áudio ou PDF" onClick={() => entrada.current?.click()} disabled={desativado} className={className} data-anexar />
      <input
        ref={entrada}
        type="file"
        accept={ACEITOS}
        multiple
        hidden
        onChange={(e) => {
          aoEscolher(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Faixa que substitui o campo de texto enquanto grava. */
export function BarraGravando({ segundos, parar, cancelar }: { segundos: number; parar: () => void; cancelar: () => void }) {
  return (
    <div className="flex-1 min-w-0 h-11 rounded-2xl bg-superficie-2 border border-perigo/40 px-3 flex items-center gap-2" role="status" aria-live="polite" data-gravando>
      <span className="size-2.5 rounded-full bg-perigo animate-pulse shrink-0" aria-hidden="true" />
      <span className="text-sm font-semibold tabular-nums">{duracaoTexto(segundos)}</span>
      <span className="text-xs text-texto-3 truncate">Gravando… (até {MAX_GRAVACAO_S / 60} min)</span>
      <span className="ml-auto flex items-center gap-1 shrink-0">
        <BotaoIcone icone="lixeira" rotulo="Descartar áudio" onClick={cancelar} className="size-9" />
        <button type="button" onClick={parar} aria-label="Parar e anexar o áudio" className="size-9 rounded-xl bg-perigo text-white grid place-items-center">
          <Icone nome="parar" className="size-4" />
        </button>
      </span>
    </div>
  );
}

/** Anexos escolhidos, antes de enviar (com botão de tirar). */
export function ListaPendentes({ pendentes, remover, className }: { pendentes: AnexoPendente[]; remover: (id: string) => void; className?: string }) {
  if (!pendentes.length) return null;
  return (
    <ul className={cx("flex flex-wrap gap-2", className)} aria-label="Anexos" data-anexos-pendentes>
      {pendentes.map((p) => (
        <li key={p.id} className="relative rounded-xl border border-linha bg-superficie-2 overflow-hidden">
          {p.tipo === "imagem" && p.previa ? (
            <img src={p.previa} alt={p.nome} className="size-16 object-cover" />
          ) : p.tipo === "audio" && p.previa ? (
            <audio src={p.previa} controls preload="metadata" className="h-10 w-52 max-w-full" />
          ) : (
            <span className="h-16 px-3 flex items-center gap-2 text-xs max-w-48">
              <Icone nome="arquivo" className="size-5 shrink-0 text-texto-3" />
              <span className="truncate">{p.nome}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => remover(p.id)}
            aria-label={`Tirar ${p.nome}`}
            className="absolute top-0.5 right-0.5 size-6 rounded-full bg-black/70 text-white grid place-items-center"
          >
            <Icone nome="x" className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Foto reduzida para o envio (lado maior 1600 px, JPEG). GIF e falha de leitura seguem como estão. */
async function prepararImagem(p: AnexoPendente): Promise<{ blob: Blob; mime: string; ext: string }> {
  const original = { blob: p.arquivo, mime: p.mime, ext: p.mime === "image/png" ? "png" : p.mime === "image/webp" ? "webp" : p.mime === "image/gif" ? "gif" : "jpg" };
  if (p.mime === "image/gif") return original;
  try {
    const bitmap = await createImageBitmap(p.arquivo);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    if (!blob) return original;
    return { blob, mime: "image/jpeg", ext: "jpg" };
  } catch {
    return original;
  }
}

/** Sobe os anexos e devolve o que vai na mensagem. Erro com texto pronto para a tela. */
export async function enviarAnexos(dono: string, chamadoId: string, pendentes: AnexoPendente[]): Promise<AnexoSuporte[]> {
  const saida: AnexoSuporte[] = [];
  for (const p of pendentes) {
    let blob = p.arquivo;
    let mime = p.mime.split(";")[0]!;
    let ext = (p.nome.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    if (p.tipo === "imagem") ({ blob, mime, ext } = await prepararImagem(p));
    if (p.tipo === "arquivo") mime = "application/pdf";
    if (p.tipo === "audio" && !mime.startsWith("audio/")) mime = "audio/mp4";
    const caminho = `suporte/${dono}/${chamadoId}/${novoId()}.${ext}`;
    try {
      await uploadBytes(refStorage(storage, caminho), blob, { contentType: mime });
    } catch (e) {
      const codigo = (e as { code?: string }).code ?? "";
      if (codigo === "storage/unauthorized") throw new Error("Não foi possível enviar o anexo (tipo ou tamanho não aceito).");
      throw new Error("O anexo não terminou de enviar. Confira a internet e tente de novo.");
    }
    saida.push({ caminho, tipo: p.tipo, nome: p.nome.slice(0, 120), tamanho: blob.size, mime, ...(p.duracao ? { duracao: p.duracao } : {}) });
  }
  return saida;
}

// ── Anexos dentro da conversa ────────────────────────────────────────────────

const urls = new Map<string, Promise<string>>();
function urlDe(caminho: string): Promise<string> {
  let u = urls.get(caminho);
  if (!u) {
    u = getDownloadURL(refStorage(storage, caminho));
    u.catch(() => urls.delete(caminho));
    urls.set(caminho, u);
  }
  return u;
}

function useUrl(caminho: string): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    urlDe(caminho).then(
      (u) => vivo && setUrl(u),
      () => vivo && setUrl(null),
    );
    return () => {
      vivo = false;
    };
  }, [caminho]);
  return url;
}

function AnexoNaConversa({ a, meu, ampliar }: { a: AnexoSuporte; meu: boolean; ampliar: (url: string, nome: string) => void }) {
  const url = useUrl(a.caminho);
  if (url === undefined) {
    return (
      <span className="h-16 w-24 rounded-xl bg-black/15 grid place-items-center">
        <Girando className="size-4" />
      </span>
    );
  }
  if (url === null) return <span className="text-xs opacity-80">Anexo indisponível</span>;
  if (a.tipo === "imagem") {
    return (
      <button type="button" onClick={() => ampliar(url, a.nome)} className="block rounded-xl overflow-hidden" aria-label={`Ampliar ${a.nome}`}>
        <img src={url} alt={a.nome} loading="lazy" className="max-h-48 max-w-full w-auto object-cover" />
      </button>
    );
  }
  if (a.tipo === "audio") return <audio src={url} controls preload="metadata" className="w-60 max-w-full h-10" data-audio-suporte />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cx("flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold", meu ? "bg-black/15" : "bg-superficie-3")}
    >
      <Icone nome="arquivo" className="size-4 shrink-0" />
      <span className="truncate">{a.nome}</span>
    </a>
  );
}

/** Fotos, áudios e PDFs de uma mensagem (foto amplia por cima do chat). */
export function AnexosDaMensagem({ anexos, meu }: { anexos?: AnexoSuporte[]; meu: boolean }) {
  const [aberta, setAberta] = useState<{ url: string; nome: string } | null>(null);
  if (!anexos?.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mb-1" data-anexos-mensagem>
      {anexos.map((a) => (
        <AnexoNaConversa key={a.caminho} a={a} meu={meu} ampliar={(url, nome) => setAberta({ url, nome })} />
      ))}
      {aberta &&
        createPortal(
          <div className="fixed inset-0 z-[90] bg-black/90 flex flex-col touch-pan-y" role="dialog" aria-modal="true" aria-label={aberta.nome} onClick={() => setAberta(null)}>
            <div className="flex justify-end p-3 pt-[calc(var(--topo-seguro)+0.75rem)]">
              <button type="button" onClick={() => setAberta(null)} aria-label="Fechar" className="size-11 rounded-full bg-white/15 text-white grid place-items-center">
                <Icone nome="x" className="size-6" />
              </button>
            </div>
            <div className="flex-1 min-h-0 grid place-items-center p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <img src={aberta.url} alt={aberta.nome} className="max-h-full max-w-full object-contain" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
