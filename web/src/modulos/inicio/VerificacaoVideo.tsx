/**
 * Cadastro da torcida, último passo antes da análise: o responsável grava (ou escolhe) um vídeo curto, na sede, com
 * documento e pelo menos 2 testemunhas da diretoria ou do conselho, e envia. Sem agenda: a equipe assiste no painel e
 * aprova. Os dados de uma torcida organizada são públicos; o vídeo prova quem pediu a conta.
 * Servidor: functions/src/api/verificacaoVideo.ts. Arquivo: Storage verificacoes/{uid}/{solicitação}/ (privado).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ref as refStorage, uploadBytesResumable, type UploadTask } from "firebase/storage";
import { auth } from "@/lib/firebase";
import { storage } from "@/lib/armazenamento";
import { api, ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import { dataHora } from "@/lib/formatos";
import type { ComId, SolicitacaoTorcida } from "@/lib/tipos";
import { Aviso, Botao, Cartao, cx, Icone, type NomeIcone } from "@/ui";

const MAX_BYTES = 500 * 1024 * 1024;

/** O que mostrar e falar no vídeo (o mesmo roteiro da equipe, em functions/src/api/verificacaoVideo.ts). */
export const ROTEIRO_VIDEO = [
  "Diga a data de hoje e: “Este vídeo é para o cadastro da (torcida) na Somos Organizada”.",
  "Diga seu nome completo, CPF e cargo, e mostre o documento com foto ao lado do rosto.",
  "Mostre a fachada da sede (com o nome ou o símbolo da torcida) e o espaço por dentro.",
  "Mostre pelo menos 2 testemunhas da diretoria ou do conselho: cada uma diz nome e cargo e mostra o documento com foto.",
  "Cada testemunha confirma em voz alta que você representa a torcida e pode criar a conta e receber os valores.",
  "Se tiver, mostre o estatuto, a ata da eleição da diretoria e o cartão do CNPJ.",
  "Termine dizendo: “Eu, (nome), declaro que as informações são verdadeiras e que represento a (torcida)”.",
];

const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

function Bloco({ icone, titulo, children }: { icone: NomeIcone; titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-linha bg-superficie-2/60 p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="size-9 shrink-0 rounded-xl bg-primaria/15 text-primaria-texto grid place-items-center">
          <Icone nome={icone} className="size-5" />
        </span>
        <h2 className="font-semibold">{titulo}</h2>
      </div>
      <div className="mt-3 text-sm text-texto-2 leading-relaxed">{children}</div>
    </div>
  );
}

type Envio = { fase: "parado" } | { fase: "enviando"; progresso: number } | { fase: "registrando"; caminho: string } | { fase: "falhou"; texto: string; caminho?: string };

export function PassoVideo({ s, reenviando, aoCancelar }: { s: ComId<SolicitacaoTorcida>; reenviando?: boolean; aoCancelar?: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [envio, setEnvio] = useState<Envio>({ fase: "parado" });
  const [arrastando, setArrastando] = useState(false);
  const tarefa = useRef<UploadTask | null>(null);
  const gravar = useRef<HTMLInputElement>(null);
  const escolher = useRef<HTMLInputElement>(null);
  const refazer = s.verificacao?.status === "refazer";

  // Prévia do vídeo escolhido (libera a memória ao trocar ou sair)
  useEffect(() => {
    if (!arquivo) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [arquivo]);
  useEffect(() => {
    return () => {
      tarefa.current?.cancel();
    };
  }, []);

  function aceitar(f: File | undefined) {
    if (!f) return;
    setErro(null);
    setEnvio({ fase: "parado" });
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|m4v|3gp|webm|mkv)$/i.test(f.name)) return setErro("Esse arquivo não é um vídeo. Grave ou escolha um vídeo.");
    if (f.size > MAX_BYTES) return setErro(`O vídeo tem ${mb(f.size)}. O máximo é 500 MB: grave de novo em qualidade menor (720p) ou mais curto.`);
    setArquivo(f);
  }

  async function registrar(caminho: string) {
    setEnvio({ fase: "registrando", caminho });
    try {
      await api.registrarVideoVerificacao({ caminho });
      // a página muda sozinha para "Cadastro em análise"
      aoCancelar?.();
    } catch (e) {
      setEnvio({ fase: "falhou", texto: ehErroDeConexao(e) ? "A internet caiu no final. Toque em tentar de novo: o vídeo já foi enviado." : mensagemDeErro(e), caminho });
    }
  }

  function enviar() {
    const uid = auth.currentUser?.uid;
    if (!arquivo || !uid) return;
    const ext = (/\.([a-z0-9]{2,4})$/i.exec(arquivo.name)?.[1] ?? "mp4").toLowerCase();
    const caminho = `verificacoes/${uid}/${s.id}/video-${Date.now()}.${ext}`;
    const t = uploadBytesResumable(refStorage(storage, caminho), arquivo, { contentType: arquivo.type || "video/mp4" });
    tarefa.current = t;
    setEnvio({ fase: "enviando", progresso: 0 });
    t.on(
      "state_changed",
      (snap) => setEnvio({ fase: "enviando", progresso: snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0 }),
      (e) => {
        tarefa.current = null;
        const c = String((e as { code?: string }).code ?? "");
        if (c === "storage/canceled") return setEnvio({ fase: "parado" });
        setEnvio({
          fase: "falhou",
          texto: /retry-limit|network/.test(c) ? "A internet caiu durante o envio. Toque em enviar de novo (de preferência no Wi-Fi)." : mensagemDeErro(e),
        });
      },
      () => {
        tarefa.current = null;
        void registrar(caminho);
      },
    );
  }

  const ocupado = envio.fase === "enviando" || envio.fase === "registrando";

  return (
    <div className="space-y-5 animate-surgir">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{reenviando || refazer ? "Envie um novo vídeo" : "Último passo: vídeo de verificação"}</h1>
        <p className="text-texto-2 mt-2 max-w-2xl">
          Grave um vídeo curto, de 2 a 5 minutos, na sede da torcida. É ele que confirma que quem está cadastrando a{" "}
          <strong className="text-texto">{s.nomeTorcida}</strong> é mesmo o responsável. Não precisa agendar nada.
        </p>
      </div>

      {refazer && s.verificacao?.motivoRefazer && (
        <Aviso tom="alerta" titulo="A equipe pediu um novo vídeo">
          {s.verificacao.motivoRefazer}
        </Aviso>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Bloco icone="escudo" titulo="Por que pedimos isso">
          <ul className="space-y-1.5 list-disc pl-4">
            <li>Os dados de uma torcida organizada (nome, sede, presidente, CNPJ) são públicos.</li>
            <li>Alguém poderia usá-los para se cadastrar no lugar da diretoria e receber o dinheiro dos ingressos e das mensalidades.</li>
            <li>O vídeo, com testemunhas, comprova quem pediu a conta e protege a torcida, os sócios e os torcedores.</li>
          </ul>
        </Bloco>
        <Bloco icone="lista" titulo="O que mostrar e falar no vídeo">
          <ol className="space-y-1.5 list-decimal pl-4">
            {ROTEIRO_VIDEO.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </Bloco>
      </div>
      <Aviso tom="info" titulo="Privacidade">
        O vídeo fica guardado com acesso restrito, só como prova de quem fez o cadastro (prevenção à fraude, como prevê a LGPD). Ele não é publicado nem
        compartilhado.
      </Aviso>

      <Cartao className="p-5 sm:p-6" aria-labelledby="titulo-envio-video">
        <h2 id="titulo-envio-video" className="text-lg font-bold">
          Seu vídeo
        </h2>
        <p className="text-sm text-texto-3 mt-1">Pode gravar agora pelo celular ou escolher um vídeo já gravado. Até 500 MB.</p>

        <input ref={gravar} type="file" accept="video/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { aceitar(e.target.files?.[0]); e.target.value = ""; }} />
        <input
          ref={escolher}
          type="file"
          accept="video/*"
          className="sr-only"
          aria-label="Escolher vídeo do aparelho"
          data-escolher-video=""
          onChange={(e) => {
            aceitar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {previa ? (
          <div className="mt-4">
            <video src={previa} controls playsInline preload="metadata" className="w-full max-h-[50vh] rounded-2xl bg-black" />
            <p className="text-xs text-texto-3 mt-2">
              {arquivo?.name} · {arquivo ? mb(arquivo.size) : ""}
            </p>
          </div>
        ) : (
          <div
            className={cx(
              "mt-4 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
              arrastando ? "border-primaria bg-primaria/10" : "border-linha-forte bg-superficie-2",
            )}
            onDragOver={(e) => {
              if (!Array.from(e.dataTransfer.types ?? []).includes("Files")) return;
              e.preventDefault();
              if (!arrastando) setArrastando(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              aceitar(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="mx-auto size-12 rounded-2xl bg-primaria/15 text-primaria-texto grid place-items-center">
              <Icone nome="camera" className="size-6" />
            </span>
            <p className="font-semibold mt-3">Nenhum vídeo escolhido</p>
            <p className="text-sm text-texto-3 mt-1 hidden [@media(hover:hover)]:block">No computador, dá para arrastar o arquivo para cá.</p>
          </div>
        )}

        {envio.fase === "enviando" && (
          <div className="mt-4" role="status">
            <div className="flex justify-between text-sm">
              <span>Enviando o vídeo… não feche esta página</span>
              <span className="numeros font-semibold">{Math.round(envio.progresso * 100)}%</span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-superficie-3 overflow-hidden">
              <div className="h-full bg-primaria transition-[width] duration-300" style={{ width: `${Math.max(3, envio.progresso * 100)}%` }} />
            </div>
          </div>
        )}
        {envio.fase === "registrando" && (
          <p className="mt-4 text-sm" role="status">
            Conferindo o vídeo…
          </p>
        )}
        {erro && (
          <Aviso tom="perigo" className="mt-4">
            {erro}
          </Aviso>
        )}
        {envio.fase === "falhou" && (
          <Aviso tom="perigo" className="mt-4">
            {envio.texto}
          </Aviso>
        )}

        <div className="mt-5 flex flex-col sm:flex-row flex-wrap gap-2">
          {envio.fase === "enviando" ? (
            <Botao variante="fantasma" onClick={() => tarefa.current?.cancel()}>
              Cancelar envio
            </Botao>
          ) : (
            <>
              <Botao variante="contorno" icone="camera" onClick={() => gravar.current?.click()} disabled={ocupado} className="sm:hidden">
                {arquivo ? "Gravar de novo" : "Gravar agora"}
              </Botao>
              <Botao variante="contorno" icone="upload" onClick={() => escolher.current?.click()} disabled={ocupado}>
                {arquivo ? "Escolher outro vídeo" : "Escolher vídeo do aparelho"}
              </Botao>
            </>
          )}
          {reenviando && aoCancelar && !ocupado && (
            <Botao variante="fantasma" onClick={aoCancelar}>
              Manter o vídeo enviado
            </Botao>
          )}
          <Botao
            tamanho="lg"
            className="sm:ml-auto"
            iconeDireita="setaDireita"
            carregando={ocupado}
            disabled={!arquivo}
            onClick={() => (envio.fase === "falhou" && envio.caminho ? void registrar(envio.caminho) : enviar())}
          >
            {envio.fase === "falhou" && envio.caminho ? "Tentar de novo" : "Enviar vídeo"}
          </Botao>
        </div>
      </Cartao>
    </div>
  );
}

/** Na tela "Cadastro em análise": o vídeo recebido e a opção de mandar outro. */
export function CartaoVideo({ s, aoReenviar }: { s: ComId<SolicitacaoTorcida>; aoReenviar: () => void }) {
  const v = s.verificacao;
  if (v?.status !== "enviado") return null;
  return (
    <div className="mt-6 rounded-2xl border border-sucesso/40 bg-sucesso/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className="size-10 shrink-0 rounded-xl bg-sucesso/20 text-sucesso grid place-items-center">
          <Icone nome="checkCirculo" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Vídeo de verificação recebido</p>
          <p className="text-sm text-texto-2">{v.enviadoEm ? `Enviado em ${dataHora(v.enviadoEm)}. ` : ""}A equipe assiste e responde por e-mail.</p>
        </div>
      </div>
      <Botao variante="fantasma" icone="camera" onClick={aoReenviar} className="shrink-0">
        Enviar outro vídeo
      </Botao>
    </div>
  );
}
