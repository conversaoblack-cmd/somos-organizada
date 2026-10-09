/**
 * Cadastro da torcida, último passo antes da análise: marcar a chamada de verificação em vídeo com a equipe.
 * Os dados de uma torcida organizada são públicos; a chamada (na sede, com 2 testemunhas da diretoria ou do
 * conselho) confirma que quem pede a conta é mesmo o responsável. Servidor: functions/src/api/verificacaoVideo.ts.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import type { ComId, SolicitacaoTorcida } from "@/lib/tipos";
import { Aviso, Botao, Cartao, cx, Girando, Icone, type NomeIcone } from "@/ui";

const FUSO = "America/Sao_Paulo";
/** "2026-10-12T14:20" (Brasília) → instante (Brasil sem horário de verão desde 2019). */
const instante = (id: string) => new Date(`${id}:00-03:00`);
const diaLongo = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: FUSO });
const diaCurto = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: FUSO }).replace(".", "");
const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
export const quandoChamada = (d: Date) => `${diaLongo(d)}, às ${hora(d)}`;

export const LEVAR_NA_CHAMADA: { icone: NomeIcone; texto: string }[] = [
  { icone: "casa", texto: "Estar na sede da torcida: vamos pedir para mostrar a fachada e o espaço." },
  { icone: "usuario", texto: "Documento oficial com foto do responsável (o mesmo CPF do cadastro)." },
  { icone: "usuarios", texto: "Pelo menos 2 testemunhas da diretoria ou do conselho, com documento com foto." },
  { icone: "escudo", texto: "Se tiver: estatuto, ata da eleição da diretoria e cartão do CNPJ." },
  { icone: "camera", texto: "Celular com câmera e internet boa (de preferência no Wi-Fi)." },
];

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

export function PassoVideo({ s, remarcando, aoCancelar }: { s: ComId<SolicitacaoTorcida>; remarcando?: boolean; aoCancelar?: () => void }) {
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [falha, setFalha] = useState<{ texto: string; conexao: boolean } | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const atual = remarcando ? (s.verificacao?.horarioId ?? null) : null;

  useEffect(() => {
    let ativo = true;
    setFalha(null);
    api
      .horariosVerificacao({})
      .then((r) => {
        if (!ativo) return;
        setHorarios(r.horarios);
        setDia((d) => {
          if (d && r.horarios.some((h) => h.startsWith(d))) return d;
          // remarcando: abre no dia do horário atual
          const diaAtual = atual?.slice(0, 10);
          return diaAtual && r.horarios.some((h) => h.startsWith(diaAtual)) ? diaAtual : (r.horarios[0]?.slice(0, 10) ?? null);
        });
      })
      .catch((e) => ativo && setFalha({ texto: mensagemDeErro(e), conexao: ehErroDeConexao(e) }));
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  const dias = useMemo(() => [...new Set((horarios ?? []).map((h) => h.slice(0, 10)))], [horarios]);
  const doDia = useMemo(() => (horarios ?? []).filter((h) => dia && h.startsWith(dia)), [horarios, dia]);

  async function confirmar() {
    if (!escolhido) return setErro("Escolha um horário.");
    setErro(null);
    setEnviando(true);
    try {
      await api.agendarVerificacao({ horario: escolhido });
      // a página muda sozinha (o cadastro passa a mostrar a chamada marcada)
      aoCancelar?.();
    } catch (e) {
      const codigo = String((e as { code?: string })?.code ?? "");
      setErro(mensagemDeErro(e));
      if (/already-exists|invalid-argument/.test(codigo)) {
        setEscolhido(null);
        setTentativa((n) => n + 1);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5 animate-surgir">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{remarcando ? "Escolha um novo horário" : "Último passo: chamada de verificação"}</h1>
        <p className="text-texto-2 mt-2 max-w-2xl">
          Uma chamada de vídeo rápida, de 2 a 5 minutos, com a equipe Somos Organizada. É ela que confirma que quem está cadastrando a{" "}
          <strong className="text-texto">{s.nomeTorcida}</strong> é mesmo o responsável pela torcida.
        </p>
      </div>

      {!remarcando && (
        <div className="grid gap-3 md:grid-cols-2">
          <Bloco icone="escudo" titulo="Por que pedimos isso">
            <ul className="space-y-1.5 list-disc pl-4">
              <li>Os dados de uma torcida organizada (nome, sede, presidente, CNPJ) são públicos.</li>
              <li>Alguém poderia usá-los para se cadastrar no lugar da diretoria e receber o dinheiro dos ingressos e das mensalidades.</li>
              <li>A chamada, com testemunhas, comprova quem pediu a conta e protege a torcida, os sócios e os torcedores.</li>
            </ul>
          </Bloco>
          <Bloco icone="lista" titulo="Na chamada, tenha em mãos">
            <ul className="space-y-1.5">
              {LEVAR_NA_CHAMADA.map((i) => (
                <li key={i.texto} className="flex gap-2">
                  <Icone nome="check" className="size-4 shrink-0 mt-0.5 text-primaria-texto" />
                  {i.texto}
                </li>
              ))}
            </ul>
          </Bloco>
        </div>
      )}
      {!remarcando && (
        <Aviso tom="info" titulo="Gravação e privacidade">
          A chamada é gravada e guardada com acesso restrito, só como prova de quem fez o cadastro (prevenção à fraude, como prevê a LGPD). Ela não é
          publicada nem compartilhada.
        </Aviso>
      )}

      <Cartao className="p-5 sm:p-6" aria-labelledby="titulo-horario">
        <h2 id="titulo-horario" className="text-lg font-bold">
          Quando você pode atender?
        </h2>
        <p className="text-sm text-texto-3 mt-1">Horário de Brasília. O link da chamada chega no seu e-mail ({s.email}).</p>

        {falha ? (
          <div className="mt-5 space-y-3">
            <Aviso tom={falha.conexao ? "info" : "perigo"}>{falha.conexao ? "Sem internet: não deu para carregar os horários." : falha.texto}</Aviso>
            <Botao variante="contorno" icone="atualizar" onClick={() => setTentativa((n) => n + 1)}>
              Tentar de novo
            </Botao>
          </div>
        ) : horarios === null ? (
          <div className="py-10 grid place-items-center">
            <Girando className="size-7 text-primaria-texto" />
          </div>
        ) : horarios.length === 0 ? (
          <Aviso tom="alerta" className="mt-5">
            Os horários dos próximos dias estão todos ocupados. Fale com a equipe no WhatsApp que a gente encaixa você.
          </Aviso>
        ) : (
          <>
            <p className="text-sm font-semibold mt-5 mb-2">Dia</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Dia da chamada">
              {dias.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={dia === d}
                  onClick={() => {
                    setDia(d);
                    setEscolhido(null);
                  }}
                  className={cx(
                    "h-11 px-3.5 rounded-xl border text-sm font-semibold capitalize transition-colors",
                    dia === d ? "border-primaria bg-primaria/15 text-texto" : "border-linha bg-superficie-2 text-texto-2 hover:border-linha-forte",
                  )}
                >
                  {diaCurto(instante(`${d}T12:00`))}
                </button>
              ))}
            </div>
            <p className="text-sm font-semibold mt-5 mb-2">Horário</p>
            <div className="grid grid-cols-3 min-[480px]:grid-cols-4 sm:grid-cols-6 gap-2" role="radiogroup" aria-label="Horário da chamada">
              {doDia.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={escolhido === h}
                  aria-label={h === atual ? `${h.slice(11)}, seu horário atual` : undefined}
                  disabled={h === atual}
                  onClick={() => setEscolhido(h)}
                  className={cx(
                    "h-11 rounded-xl border text-sm font-semibold numeros transition-colors leading-none",
                    h === atual
                      ? "border-dashed border-primaria/60 text-texto-3"
                      : escolhido === h
                        ? "border-primaria bg-primaria text-sobre-primaria"
                        : "border-linha bg-superficie-2 hover:border-linha-forte",
                  )}
                >
                  {h.slice(11)}
                  {h === atual && <span className="block text-[10px] font-medium mt-0.5">atual</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {erro && (
          <Aviso tom="perigo" className="mt-4">
            {erro}
          </Aviso>
        )}
        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          {remarcando && aoCancelar && (
            <Botao variante="fantasma" onClick={aoCancelar} disabled={enviando}>
              Manter o horário atual
            </Botao>
          )}
          <Botao tamanho="lg" iconeDireita="setaDireita" carregando={enviando} disabled={!escolhido} onClick={confirmar}>
            {escolhido ? `Confirmar ${diaCurto(instante(escolhido))} às ${escolhido.slice(11)}` : "Escolha um horário"}
          </Botao>
        </div>
      </Cartao>
    </div>
  );
}

/** Na tela "Cadastro em análise": a chamada marcada, o link quando chegar, agenda e remarcar. */
export function CartaoChamada({ s, aoRemarcar }: { s: ComId<SolicitacaoTorcida>; aoRemarcar: () => void }) {
  const v = s.verificacao;
  if (!v) return null;
  if (v.status === "realizada") {
    return (
      <Aviso tom="sucesso" titulo="Chamada de verificação feita" className="mt-6">
        Obrigado! Agora a equipe finaliza a análise do cadastro.
      </Aviso>
    );
  }
  if (!v.inicio) return null;
  const inicio = v.inicio.toDate();
  const fim = new Date(inicio.getTime() + 20 * 60_000);
  const g = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const agenda =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(`Verificação em vídeo · ${s.nomeTorcida} · Somos Organizada`)}` +
    `&dates=${g(inicio)}/${g(fim)}` +
    `&details=${encodeURIComponent("Na sede da torcida, com documento com foto e pelo menos 2 testemunhas da diretoria ou do conselho.")}`;
  const podeRemarcar = inicio.getTime() - Date.now() > 2 * 3600_000;
  return (
    <div className="mt-6 rounded-2xl border border-primaria/40 bg-primaria/10 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="size-10 shrink-0 rounded-xl bg-primaria/20 text-primaria-texto grid place-items-center">
          <Icone nome="camera" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-texto-3">Chamada de verificação marcada</p>
          <p className="font-bold text-lg leading-snug mt-0.5 first-letter:uppercase">{quandoChamada(inicio)}</p>
          <p className="text-sm text-texto-2 mt-1">
            {v.link ? "O link já está no seu e-mail e aqui embaixo." : `O link chega no seu e-mail (${s.email}) antes do horário.`}
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 text-sm text-texto-2">
        {LEVAR_NA_CHAMADA.slice(0, 3).map((i) => (
          <li key={i.texto} className="flex gap-2">
            <Icone nome="check" className="size-4 shrink-0 mt-0.5 text-primaria-texto" />
            {i.texto}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
        {v.link && (
          <a href={v.link} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl font-semibold bg-primaria text-sobre-primaria hover:brightness-110">
            <Icone nome="camera" className="size-5" /> Entrar na chamada
          </a>
        )}
        <a href={agenda} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl font-semibold border border-linha-forte hover:bg-superficie-2">
          <Icone nome="calendario" className="size-5" /> Adicionar à agenda
        </a>
        {podeRemarcar && (
          <Botao variante="fantasma" icone="relogio" onClick={aoRemarcar}>
            Remarcar
          </Botao>
        )}
      </div>
    </div>
  );
}
