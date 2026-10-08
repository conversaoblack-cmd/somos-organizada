import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { copiarTexto } from "@/lib/servicos";
import { cpfMascarado, dataExtensa, dataHora, hora, paraData } from "@/lib/formatos";
import type { ComId, Evento, Ingresso, Torcida } from "@/lib/tipos";
import { useDocumento, type Estado } from "@/hooks/dados";
import { Aviso, Botao, BotaoIcone, BotaoLink, cx, Esqueleto, Icone, Modal, Selo, useToast, Vazio } from "@/ui";
import { QrCode } from "@/ui/qr";
import { useTelaAcesa } from "./comum";

const fmtSP = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o });
const dia = (v: Ingresso["eventoData"]) => fmtSP({ day: "2-digit" }).format(paraData(v)!);
const mes = (v: Ingresso["eventoData"]) => fmtSP({ month: "short" }).format(paraData(v)!).replace(".", "").toUpperCase();
const semana = (v: Ingresso["eventoData"]) => fmtSP({ weekday: "short" }).format(paraData(v)!).replace(".", "").toUpperCase();

/** Um evento ainda conta como "próximo" até 8h depois do horário marcado. */
const LIMITE_PROXIMO = 8 * 3_600_000;
export const ehProximo = (i: Ingresso) => (paraData(i.eventoData)?.getTime() ?? 0) + LIMITE_PROXIMO >= Date.now();

function ehHoje(i: Ingresso) {
  const d = paraData(i.eventoData);
  if (!d) return false;
  const f = fmtSP({ day: "2-digit", month: "2-digit", year: "numeric" });
  return f.format(d) === f.format(new Date());
}

function SeloStatus({ i }: { i: Ingresso }) {
  if (i.status === "usado") return <Selo tom="neutro">Utilizado</Selo>;
  if (i.status === "cancelado") return <Selo tom="perigo">Cancelado</Selo>;
  return (
    <Selo tom="sucesso" ponto>
      Válido
    </Selo>
  );
}

/**
 * Ingresso em forma de bilhete: canhoto colorido com a data, picote e corpo com os dados.
 * O botão do corpo cobre o bilhete inteiro (after:inset-0): tocar em qualquer parte abre o ingresso.
 */
function Bilhete({ i, abrir, apagado }: { i: ComId<Ingresso>; abrir: () => void; apagado?: boolean }) {
  const hoje = ehHoje(i);
  const valido = i.status === "valido";
  return (
    <div
      className={cx(
        "group relative w-full flex text-left rounded-[22px] transition-all duration-200 has-[button:active]:scale-[0.985]",
        "drop-shadow-[0_14px_24px_rgb(0_0_0/.28)] hover:-translate-y-0.5",
        apagado && "opacity-60 saturate-50",
      )}
    >
      {/* canhoto */}
      <div
        className="relative w-[88px] sm:w-[104px] shrink-0 rounded-l-[22px] text-sobre-primaria flex flex-col items-center justify-center py-4 overflow-hidden"
        style={{
          background:
            "repeating-linear-gradient(135deg, rgb(255 255 255 / .06) 0 1.5px, transparent 1.5px 7px), linear-gradient(160deg, var(--color-primaria), color-mix(in oklab, var(--color-primaria), black 35%))",
        }}
      >
        <span className="text-[11px] font-bold tracking-[.2em] opacity-80">{semana(i.eventoData)}</span>
        <span className="font-display text-[40px] leading-none my-0.5 numeros">{dia(i.eventoData)}</span>
        <span className="text-xs font-bold tracking-[.25em]">{mes(i.eventoData)}</span>
        <span className="mt-2 text-[11px] font-semibold opacity-85 numeros">{hora(i.eventoData)}</span>
        {hoje && <span className="absolute top-0 inset-x-0 bg-secundaria text-sobre-secundaria text-[10px] font-black tracking-[.2em] text-center py-0.5">HOJE</span>}
      </div>
      {/* picote */}
      <div className="relative w-4 shrink-0 bg-superficie">
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 size-4 rounded-full bg-fundo" />
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 size-4 rounded-full bg-fundo" />
        <span className="absolute inset-y-3 left-1/2 -translate-x-1/2 w-[1.5px] so-tracejado" />
      </div>
      {/* corpo */}
      <div className="min-w-0 flex-1 rounded-r-[22px] bg-superficie border-y border-r border-linha py-4 pr-4 pl-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-bold leading-snug line-clamp-2 text-[15px]">{i.eventoNome}</p>
        </div>
        <p className="mt-2 text-sm font-medium truncate">{i.titularNome}</p>
        <p className="text-xs text-texto-3 font-mono numeros">CPF {cpfMascarado(i.titularCpf)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Selo tom={i.tipo === "socio" ? "primaria" : "neutro"}>{i.tipo === "socio" ? "Sócio" : "Público"}</Selo>
          <SeloStatus i={i} />
          <span className="ml-auto font-mono text-xs font-bold tracking-wider text-texto-2">{i.codigo}</span>
        </div>
        <button
          type="button"
          onClick={abrir}
          aria-label={valido ? `Mostrar ingresso de ${i.eventoNome} com o QR Code` : `Ver ingresso de ${i.eventoNome}`}
          className={cx(
            "mt-3 w-full inline-flex items-center justify-center gap-2 min-h-11 rounded-xl px-3 text-sm font-semibold transition-colors",
            "after:absolute after:inset-0 after:rounded-[22px] after:content-['']",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria-texto",
            valido ? "bg-primaria text-sobre-primaria" : "bg-superficie-2 text-texto-2",
          )}
        >
          <Icone nome={valido ? "qr" : "ingresso"} className="size-5" />
          {valido ? "Mostrar ingresso (QR)" : "Ver detalhes"}
        </button>
        {i.status !== "valido" && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 -rotate-12 rounded-lg border-2 border-current px-2 py-0.5 font-display text-sm uppercase opacity-25">
            {i.status === "usado" ? "Utilizado" : "Cancelado"}
          </span>
        )}
      </div>
    </div>
  );
}

function ModalIngresso({ i, tid, fechar }: { i: ComId<Ingresso>; tid: string; fechar: () => void }) {
  useTelaAcesa(i.status === "valido");
  const avisar = useToast();
  const evento = useDocumento<Evento>(`torcidas/${tid}/eventos/${i.eventoId}`).dados;
  return (
    <Modal aberto fechar={fechar} largura="max-w-md">
      <div className="-mt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-primaria-texto">{dataExtensa(i.eventoData)} · {hora(i.eventoData)}</p>
            <h2 className="text-xl font-bold leading-tight mt-0.5">{i.eventoNome}</h2>
            {evento?.local && (
              <p className="text-sm text-texto-2 mt-1 flex items-center gap-1.5">
                <Icone nome="local" className="size-4" /> {evento.local}
              </p>
            )}
          </div>
          <BotaoIcone icone="x" rotulo="Fechar" onClick={fechar} className="-mr-2 -mt-1" />
        </div>

        <div className="relative mt-5 mx-auto w-full max-w-[300px]">
          <QrCode valor={i.qr} className={cx("p-3 shadow-xl", i.status !== "valido" && "opacity-25 blur-[2px]")} />
          {i.status !== "valido" && (
            <div className="absolute inset-0 grid place-items-center">
              <span className={cx("-rotate-12 rounded-xl border-[3px] px-4 py-1 font-display text-2xl uppercase bg-fundo/80", i.status === "usado" ? "border-texto-2 text-texto-2" : "border-perigo text-perigo")}>
                {i.status === "usado" ? "Utilizado" : "Cancelado"}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={async () => (await copiarTexto(i.codigo)) && avisar("Código copiado", "sucesso")}
          className="mt-4 mx-auto flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-2xl font-bold tracking-[.18em] hover:bg-superficie-2"
          aria-label="Copiar código"
        >
          {i.codigo}
          <Icone nome="copiar" className="size-4 text-texto-3" />
        </button>

        <div className="mt-4 grid grid-cols-2 gap-px rounded-2xl overflow-hidden border border-linha bg-linha text-sm">
          {[
            ["Titular", i.titularNome],
            ["CPF", cpfMascarado(i.titularCpf)],
            ["Tipo", i.tipo === "socio" ? "Sócio" : "Público"],
            ["Situação", i.status === "valido" ? "Válido" : i.status === "usado" ? `Usado em ${dataHora(i.usadoEm)}` : "Cancelado"],
          ].map(([r, v]) => (
            <div key={r} className="bg-superficie px-4 py-3 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-texto-3">{r}</p>
              <p className="font-semibold truncate">{v}</p>
            </div>
          ))}
        </div>

        {i.status === "valido" && (
          <Aviso tom="info" className="mt-4">
            Ingresso nominal: leve um documento com foto. Deixe o brilho da tela no máximo na portaria.
          </Aviso>
        )}
      </div>
    </Modal>
  );
}

export default function AbaIngressos({
  tid,
  torcida,
  ingressos,
  tentarDeNovo,
}: {
  tid: string;
  torcida: Torcida;
  ingressos: Estado<ComId<Ingresso>[]>;
  tentarDeNovo?: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const abertoId = params.get("abrir");
  const aberto = ingressos.dados.find((i) => i.id === abertoId) ?? null;

  const { proximos, anteriores } = useMemo(() => {
    const p = ingressos.dados.filter(ehProximo).sort((a, b) => (paraData(a.eventoData)?.getTime() ?? 0) - (paraData(b.eventoData)?.getTime() ?? 0));
    const a = ingressos.dados.filter((i) => !ehProximo(i));
    return { proximos: p, anteriores: a };
  }, [ingressos.dados]);

  const abrir = (id: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (id) n.set("abrir", id);
        else n.delete("abrir");
        return n;
      },
      { replace: !id },
    );

  const atalho = (
    <BotaoLink to={`/${torcida.slug}?aba=eventos`} icone="ingresso" variante="contorno" tamanho="sm">
      Comprar ingresso
    </BotaoLink>
  );

  if (ingressos.carregando) {
    return (
      <div className="space-y-3 max-w-2xl">
        {[0, 1, 2].map((k) => (
          <Esqueleto key={k} className="h-36 rounded-[22px]" />
        ))}
      </div>
    );
  }
  const botaoTentar = tentarDeNovo && (
    <Botao tamanho="sm" variante="contorno" icone="atualizar" onClick={tentarDeNovo}>
      Tentar de novo
    </Botao>
  );
  const falhou = !!ingressos.erro || !!ingressos.semConexao;
  const semInternet = !!ingressos.semConexao || (typeof navigator !== "undefined" && !navigator.onLine);
  if (falhou && !ingressos.dados.length) {
    return (
      <Aviso tom="perigo" titulo={semInternet ? "Sem internet" : "Não foi possível carregar seus ingressos"} acao={botaoTentar} className="max-w-2xl">
        {semInternet ? "Não conseguimos buscar seus ingressos agora. Confira a conexão e tente de novo." : "Algo falhou ao buscar seus ingressos. Tente de novo."}
      </Aviso>
    );
  }
  if (!ingressos.dados.length) {
    return (
      <Vazio icone="ingresso" titulo="Nenhum ingresso por aqui" acao={<BotaoLink to={`/${torcida.slug}?aba=eventos`} iconeDireita="setaDireita">Ver eventos</BotaoLink>}>
        Ingressos comprados com esta conta aparecem aqui, com o QR Code para a portaria. Como sócio em dia, o ingresso no seu nome sai com preço de sócio.
      </Vazio>
    );
  }

  return (
    <div className="max-w-2xl">
      {falhou && (
        <Aviso tom="alerta" titulo="Pode faltar algum ingresso" acao={botaoTentar} className="mb-5">
          {semInternet ? "Sem internet: mostramos os ingressos que já estavam no aparelho." : "Uma parte dos seus ingressos não carregou."}
        </Aviso>
      )}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold">
            Próximos <span className="text-texto-3 font-semibold">· {proximos.length}</span>
          </h2>
          {atalho}
        </div>
        {proximos.length ? (
          <div className="space-y-3.5">
            {proximos.map((i) => (
              <Bilhete key={i.id} i={i} abrir={() => abrir(i.id)} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-linha-forte p-5 text-sm text-texto-2 text-center">Nenhum evento marcado. Bora pra próxima?</p>
        )}
      </section>

      {!!anteriores.length && (
        <section className="mt-9">
          <h2 className="text-lg font-bold mb-3">
            Anteriores <span className="text-texto-3 font-semibold">· {anteriores.length}</span>
          </h2>
          <div className="space-y-3.5">
            {anteriores.map((i) => (
              <Bilhete key={i.id} i={i} apagado abrir={() => abrir(i.id)} />
            ))}
          </div>
        </section>
      )}

      {aberto && <ModalIngresso i={aberto} tid={tid} fechar={() => abrir(null)} />}
    </div>
  );
}
