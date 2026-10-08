import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { registrarErro } from "@/lib/erros";
import { Botao, cx, Girando, Icone } from "@/ui";

type Falha = "permissao" | "sem_camera" | "inseguro" | "ocupada" | "outra";

function classificar(e: unknown): Falha {
  if (typeof window !== "undefined" && !window.isSecureContext) return "inseguro";
  const nome = (e as { name?: string })?.name ?? "";
  const msg = String((e as { message?: string })?.message ?? e);
  if (nome === "NotAllowedError" || nome === "SecurityError" || /denied|permission/i.test(msg)) return "permissao";
  if (nome === "NotFoundError" || nome === "OverconstrainedError" || /not found|no camera/i.test(msg)) return "sem_camera";
  if (nome === "NotReadableError" || nome === "AbortError") return "ocupada";
  return "outra";
}

const TEXTO_FALHA: Record<Falha, { titulo: string; texto: string }> = {
  permissao: {
    titulo: "A câmera está bloqueada",
    texto: "",
  },
  sem_camera: { titulo: "Nenhuma câmera encontrada", texto: "Este aparelho não tem câmera disponível. Use a aba “Digitar CPF / QR”, acima." },
  inseguro: { titulo: "Câmera indisponível neste endereço", texto: "O navegador só libera a câmera em páginas seguras (https). Abra o link oficial da portaria." },
  ocupada: { titulo: "A câmera está em uso", texto: "Feche outros apps que usam a câmera (WhatsApp, câmera, chamadas) e toque em Tentar de novo." },
  outra: { titulo: "Não foi possível abrir a câmera", texto: "Toque em Tentar de novo. Se continuar, use a aba “Digitar CPF / QR”, acima." },
};

/** Instruções para liberar a câmera, conforme o aparelho. */
function ComoLiberar() {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return ios ? (
    <ol className="mt-2 space-y-1 text-sm text-texto-2 list-decimal pl-5 text-left">
      <li>
        Toque em <strong className="text-texto">aA</strong> na barra de endereço do Safari.
      </li>
      <li>
        Abra <strong className="text-texto">Ajustes do Site</strong> → <strong className="text-texto">Câmera</strong> → <strong className="text-texto">Permitir</strong>.
      </li>
      <li>Volte aqui e toque em Tentar de novo.</li>
    </ol>
  ) : (
    <ol className="mt-2 space-y-1 text-sm text-texto-2 list-decimal pl-5 text-left">
      <li>
        Toque no <strong className="text-texto">cadeado</strong> (ou ícone de ajustes) ao lado do endereço.
      </li>
      <li>
        Em <strong className="text-texto">Permissões</strong>, mude <strong className="text-texto">Câmera</strong> para <strong className="text-texto">Permitir</strong>.
      </li>
      <li>Toque em Tentar de novo (ou recarregue a página).</li>
    </ol>
  );
}

export function Leitor({ pausado, aoLer, aoFalhar }: { pausado: boolean; aoLer: (texto: string) => void; aoFalhar?: (motivo: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const aoLerRef = useRef(aoLer);
  aoLerRef.current = aoLer;
  const aoFalharRef = useRef(aoFalhar);
  aoFalharRef.current = aoFalhar;

  const [estado, setEstado] = useState<"iniciando" | "ativo" | "falha">("iniciando");
  const [falha, setFalha] = useState<Falha>("outra");
  const [tentativa, setTentativa] = useState(0);
  const [temFlash, setTemFlash] = useState(false);
  const [flash, setFlash] = useState(false);
  const [cameras, setCameras] = useState<QrScanner.Camera[]>([]);
  const [camera, setCamera] = useState<string>("environment");
  const [demorando, setDemorando] = useState(false);

  // Se a câmera não abre em alguns segundos, quase sempre é o aviso de permissão esperando um toque.
  useEffect(() => {
    if (estado !== "iniciando") return;
    setDemorando(false);
    const id = setTimeout(() => setDemorando(true), 6000);
    return () => clearTimeout(id);
  }, [estado, tentativa]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let vivo = true;
    setEstado("iniciando");
    const s = new QrScanner(video, (r) => aoLerRef.current(r.data), {
      returnDetailedScanResult: true,
      preferredCamera: "environment",
      highlightScanRegion: true,
      highlightCodeOutline: true,
      maxScansPerSecond: 15,
    });
    scannerRef.current = s;
    s.start()
      .then(async () => {
        if (!vivo) return;
        setEstado("ativo");
        setTemFlash(await s.hasFlash().catch(() => false));
        const lista = await QrScanner.listCameras(true).catch(() => []);
        if (vivo) setCameras(lista);
      })
      .catch((e) => {
        if (!vivo) return;
        const tipo = classificar(e);
        if (tipo === "outra") registrarErro(e, "portaria: câmera");
        setFalha(tipo);
        setEstado("falha");
        aoFalharRef.current?.(TEXTO_FALHA[tipo].titulo);
      });
    return () => {
      vivo = false;
      s.destroy();
      scannerRef.current = null;
      setFlash(false);
    };
  }, [tentativa]);

  useEffect(() => {
    const s = scannerRef.current;
    if (!s || estado !== "ativo") return;
    if (pausado) void s.pause();
    else s.start().catch(() => undefined);
  }, [pausado, estado]);

  async function alternarFlash() {
    const s = scannerRef.current;
    if (!s) return;
    try {
      await s.toggleFlash();
      setFlash(s.isFlashOn());
    } catch {
      setTemFlash(false);
    }
  }

  async function trocarCamera() {
    const s = scannerRef.current;
    if (!s) return;
    let proxima: string;
    if (cameras.length > 1) {
      const idx = cameras.findIndex((c) => c.id === camera);
      proxima = cameras[(idx + 1) % cameras.length]!.id;
    } else {
      proxima = camera === "environment" ? "user" : "environment";
    }
    try {
      await s.setCamera(proxima);
      setCamera(proxima);
      setFlash(false);
      setTemFlash(await s.hasFlash().catch(() => false));
    } catch {
      /* mantém a câmera atual */
    }
  }

  const info = TEXTO_FALHA[falha];

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-black aspect-[4/5] sm:aspect-[4/3] lg:aspect-[4/5] max-h-[62dvh] w-full mx-auto ring-1 ring-linha-forte">
      <video ref={videoRef} className={cx("absolute inset-0 size-full object-cover", estado !== "ativo" && "opacity-0")} muted playsInline />

      {estado === "iniciando" && (
        <div className="absolute inset-0 grid place-items-center text-white/80">
          <div className="flex flex-col items-center gap-3 px-6">
            <Girando className="size-9" />
            <p className="text-sm font-medium">Abrindo a câmera…</p>
            {demorando && (
              <p className="max-w-[260px] text-center text-sm text-white/70">
                Se aparecer um aviso do navegador, toque em <strong className="text-white">Permitir</strong>. Enquanto isso, use “Digitar CPF / QR”.
              </p>
            )}
          </div>
        </div>
      )}

      {estado === "falha" && (
        <div className="absolute inset-0 overflow-y-auto bg-superficie p-6 flex flex-col items-center justify-center text-center">
          <span className="size-14 rounded-2xl bg-alerta/15 text-alerta grid place-items-center">
            <Icone nome="camera" className="size-7" />
          </span>
          <p className="mt-4 text-lg font-bold">{info.titulo}</p>
          {falha === "permissao" ? (
            <div className="mt-1 max-w-xs">
              <p className="text-sm text-texto-2">Você pode continuar pela aba “Digitar CPF / QR”, acima. Para usar a câmera:</p>
              <ComoLiberar />
            </div>
          ) : (
            <p className="mt-1 text-sm text-texto-2 max-w-xs">{info.texto}</p>
          )}
          {falha !== "sem_camera" && falha !== "inseguro" && (
            <Botao className="mt-5" variante="contorno" icone="atualizar" onClick={() => setTentativa((t) => t + 1)}>
              Tentar de novo
            </Botao>
          )}
        </div>
      )}

      {estado === "ativo" && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
          <p className="pointer-events-none absolute top-4 inset-x-0 text-center text-white text-sm font-semibold tracking-wide drop-shadow">
            {pausado ? "Leitura pausada" : "Aponte para o QR do ingresso"}
          </p>
          <div className="absolute bottom-4 inset-x-4 flex items-center justify-between gap-3">
            {temFlash ? (
              <button
                type="button"
                onClick={alternarFlash}
                aria-pressed={flash}
                className={cx(
                  "h-14 px-5 rounded-2xl flex items-center gap-2 font-bold backdrop-blur-md transition-colors",
                  flash ? "bg-secundaria text-sobre-secundaria" : "bg-black/55 text-white ring-1 ring-white/20",
                )}
              >
                <Icone nome="raio" className="size-6" /> {flash ? "Lanterna ligada" : "Lanterna"}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={trocarCamera}
              className="h-14 px-5 rounded-2xl flex items-center gap-2 font-bold bg-black/55 text-white ring-1 ring-white/20 backdrop-blur-md"
              aria-label="Trocar câmera"
            >
              <Icone nome="atualizar" className="size-6" /> Câmera
            </button>
          </div>
        </>
      )}
    </div>
  );
}
