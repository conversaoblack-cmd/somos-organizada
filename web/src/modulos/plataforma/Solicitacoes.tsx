import { rp, origemTorcidas } from "@/lib/hosts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { collection, orderBy, query, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import { useColecao, useDocumento } from "@/hooks/dados";
import { ROTEIRO_VIDEO } from "../inicio/VerificacaoVideo";
import { cpfMascarado, dataHora, mascaraCep, mascaraCpf, mascaraTelefone, relativo } from "@/lib/formatos";
import { copiarTexto } from "@/lib/servicos";
import type { ComId, SolicitacaoTorcida } from "@/lib/tipos";
import { AreaTexto, Aviso, Botao, BotaoIcone, CabecalhoPagina, Campo, Cartao, Carregando, cx, Gaveta, Icone, Modal, Selo, Vazio, useToast, type Tom } from "@/ui";
import { numero, useResumo } from "./comum";


type Status = SolicitacaoTorcida["status"];
type Filtro = Status | "todas";

const ROTULO: Record<Status, string> = { pendente: "Pendente", aprovada: "Aprovada", recusada: "Recusada" };
const TOM: Record<Status, Tom> = { pendente: "alerta", aprovada: "sucesso", recusada: "perigo" };

export const mascaraCnpj = (s: string) =>
  s
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");

export default function Solicitacoes() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>("pendente");
  const sols = useColecao<SolicitacaoTorcida>(query(collection(db, "solicitacoes"), orderBy("criadoEm", "desc")), "solicitacoes-plataforma");
  const contar = (s: Status) => sols.dados.filter((x) => x.status === s).length;
  const lista = sols.dados.filter((s) => filtro === "todas" || s.status === filtro);
  const aberta = sols.dados.find((s) => s.id === id) ?? null;

  return (
    <>
      <CabecalhoPagina titulo="Solicitações" descricao="Torcidas que se cadastraram pela página principal. Toda torcida nova precisa da aprovação da equipe." />
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filtrar por status">
        {(["pendente", "aprovada", "recusada", "todas"] as Filtro[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filtro === f}
            onClick={() => setFiltro(f)}
            className={cx(
              "h-11 sm:h-9 px-3.5 rounded-xl text-sm font-semibold border transition-colors",
              filtro === f ? "bg-primaria text-sobre-primaria border-primaria" : "border-linha text-texto-2 hover:text-texto hover:bg-superficie-2",
            )}
          >
            {f === "todas" ? "Todas" : `${ROTULO[f]}s`} <span className="opacity-70 numeros">{f === "todas" ? sols.dados.length : contar(f)}</span>
          </button>
        ))}
      </div>

      {sols.carregando ? (
        <Carregando />
      ) : sols.erro ? (
        <Aviso tom="perigo">{mensagemDeErro(sols.erro)}</Aviso>
      ) : lista.length === 0 ? (
        <Cartao>
          <Vazio icone="bandeira" titulo={filtro === "pendente" ? "Nenhum cadastro aguardando" : "Nada por aqui"}>
            Novos cadastros feitos em {location.host}/cadastro aparecem aqui em tempo real.
          </Vazio>
        </Cartao>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((s) => (
            <Link key={s.id} to={rp(`/solicitacoes/${s.id}`)} className="block min-w-0">
              <Cartao className="p-4 h-full hover:border-linha-forte transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{s.nomeTorcida}</p>
                    <p className="text-xs text-texto-3 truncate">
                      /{s.slug}
                      {s.clube ? ` · ${s.clube}` : ""}
                    </p>
                  </div>
                  <Selo tom={TOM[s.status]}>{ROTULO[s.status]}</Selo>
                </div>
                <dl className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <div>
                    <dt className="text-xs text-texto-3">Responsável</dt>
                    <dd className="truncate">{s.responsavel?.nome}</dd>
                    <dd className="text-xs text-texto-3">{cpfMascarado(s.responsavel?.cpf ?? "")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-texto-3">Sócios estimados</dt>
                    <dd className="numeros">{numero(s.estimativaSocios)}</dd>
                    <dd className="text-xs text-texto-3">{s.quantidadeSubsedes ?? 0} subsedes</dd>
                  </div>
                </dl>
                <p className="text-xs text-texto-3 mt-3">
                  {s.endereco?.cidade}/{s.endereco?.uf} · {relativo(s.criadoEm)}
                </p>
              </Cartao>
            </Link>
          ))}
        </div>
      )}

      <Gaveta aberto={!!id} fechar={() => navegar(rp("/solicitacoes"))} titulo={aberta?.nomeTorcida ?? "Solicitação"} largura="sm:max-w-2xl">
        {aberta ? <DetalheSolicitacao s={aberta} /> : sols.carregando ? <Carregando /> : <Vazio titulo="Solicitação não encontrada" />}
      </Gaveta>
    </>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-linha p-4">
      <h3 className="text-sm font-semibold mb-2">{titulo}</h3>
      <dl className="divide-y divide-linha text-sm">{children}</dl>
    </section>
  );
}
function Item({ r, v }: { r: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-texto-2 shrink-0">{r}</dt>
      <dd className="text-right min-w-0 break-words">{v || "—"}</dd>
    </div>
  );
}

function DetalheSolicitacao({ s }: { s: ComId<SolicitacaoTorcida> }) {
  const { recarregar } = useResumo();
  const [confirmarAprovacao, setConfirmarAprovacao] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aprovada, setAprovada] = useState<{ slug: string; torcidaId?: string } | null>(null);
  // Conferência do vídeo, dentro da aprovação
  const [testemunhas, setTestemunhas] = useState("2");
  const [documento, setDocumento] = useState(false);
  const [sedeOk, setSedeOk] = useState(false);
  const [obs, setObs] = useState("");
  const videoOk = s.verificacao?.status === "enviado";
  const conferido = Number(testemunhas) >= 2 && documento && sedeOk;
  const topo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (aprovada) topo.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [aprovada]);
  const avisar = useToast();
  const e = s.endereco;
  const pagina = `${origemTorcidas()}/${s.slug}`;

  async function aprovar() {
    setSalvando(true);
    try {
      const r = await api.avaliarSolicitacao({
        id: s.id,
        aprovar: true,
        conferencia: { testemunhas: Number(testemunhas), documentoConferido: documento, sedeConferida: sedeOk, observacoes: obs.trim() },
      });
      setAprovada({ slug: r.slug ?? s.slug, torcidaId: r.torcidaId });
      setConfirmarAprovacao(false);
      avisar("Torcida aprovada e criada.", "sucesso");
      void recarregar();
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
    } finally {
      setSalvando(false);
    }
  }
  async function recusar() {
    setTentou(true);
    if (motivo.trim().length < 3) return;
    setSalvando(true);
    try {
      await api.avaliarSolicitacao({ id: s.id, aprovar: false, motivo: motivo.trim() });
      setRecusando(false);
      avisar("Solicitação recusada. O endereço foi liberado.", "sucesso");
      void recarregar();
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
    } finally {
      setSalvando(false);
    }
  }

  const resultadoAprovacao = aprovada ?? (s.status === "aprovada" ? { slug: s.slug, torcidaId: s.torcidaId } : null);

  return (
    <div className="space-y-4 scroll-mt-6" ref={topo}>
      <div className="flex flex-wrap items-center gap-2">
        <Selo tom={TOM[s.status]} ponto>
          {ROTULO[s.status]}
        </Selo>
        <span className="text-sm text-texto-3">enviada em {dataHora(s.criadoEm)}</span>
      </div>

      {resultadoAprovacao && (
        <Aviso tom="sucesso" titulo="Torcida criada">
          <div className="space-y-3 mt-2">
            <LinkCopiar rotulo="Página da torcida" valor={`${origemTorcidas()}/${resultadoAprovacao.slug}`} />
            <LinkCopiar rotulo="Painel da diretoria" valor={`${origemTorcidas()}/${resultadoAprovacao.slug}/admin`} />
            <p>
              O diretor entra com a <strong>mesma conta que criou no cadastro</strong> ({s.email}) — não precisa de senha nova. O site nasce fora do ar; ele configura
              pagamentos e publica quando estiver pronto.
            </p>
            {resultadoAprovacao.torcidaId && (
              <Link to={rp(`/torcidas/${resultadoAprovacao.torcidaId}`)} className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 font-semibold text-primaria-texto hover:underline">
                Ver torcida no painel <Icone nome="setaDireita" className="size-4" />
              </Link>
            )}
          </div>
        </Aviso>
      )}
      {s.status === "recusada" && (
        <Aviso tom="perigo" titulo="Recusada">
          {s.motivo}
        </Aviso>
      )}

      {s.status !== "recusada" && <BlocoVideo s={s} />}

      <Bloco titulo="Torcida">
        <Item r="Nome" v={s.nomeTorcida} />
        <Item r="Clube" v={s.clube} />
        <Item r="Endereço do site" v={<a href={pagina} target="_blank" rel="noreferrer" className="underline">/{s.slug}</a>} />
        <Item r="Sócios estimados" v={numero(s.estimativaSocios)} />
        <Item r="Subsedes" v={numero(s.quantidadeSubsedes)} />
        {s.tema && (
          <Item
            r="Cores"
            v={
              <span className="inline-flex gap-1 align-middle">
                {[s.tema.corPrimaria, s.tema.corSecundaria, s.tema.corFundo].map((c, i) => (
                  <span key={i} className="size-4 rounded-full border border-linha-forte" style={{ background: c }} />
                ))}
              </span>
            }
          />
        )}
      </Bloco>
      <Bloco titulo="Responsável">
        <Item r="Nome" v={s.responsavel?.nome} />
        <Item r="CPF" v={mascaraCpf(s.responsavel?.cpf ?? "")} />
        <Item r="Celular" v={<a className="underline" href={`https://wa.me/55${s.responsavel?.telefone}`} target="_blank" rel="noreferrer">{mascaraTelefone(s.responsavel?.telefone ?? "")}</a>} />
        <Item r="Cargo" v={s.responsavel?.cargo} />
        <Item r="E-mail da conta" v={s.email} />
      </Bloco>
      <Bloco titulo="Entidade">
        <Item r="Tipo" v={s.entidade?.tipo === "cnpj" ? "Com CNPJ" : "Ainda sem CNPJ"} />
        {s.entidade?.tipo === "cnpj" && (
          <>
            <Item r="CNPJ" v={mascaraCnpj(s.entidade.cnpj ?? "")} />
            <Item r="Razão social" v={s.entidade.razaoSocial} />
          </>
        )}
        <Item r="E-mail financeiro" v={s.entidade?.emailFinanceiro} />
      </Bloco>
      <Bloco titulo="Endereço">
        <Item r="CEP" v={mascaraCep(e?.cep ?? "")} />
        <Item r="Logradouro" v={[e?.logradouro, e?.numero, e?.complemento].filter(Boolean).join(", ")} />
        <Item r="Bairro" v={e?.bairro} />
        <Item r="Cidade" v={e ? `${e.cidade}/${e.uf}` : ""} />
      </Bloco>

      {s.status === "pendente" && !aprovada && !videoOk && (
        <p className="text-sm text-texto-3">Para aprovar, o responsável precisa enviar o vídeo de verificação (quadro acima).</p>
      )}
      {s.status === "pendente" && !aprovada && (
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Botao variante="perigo" icone="x" onClick={() => setRecusando(true)} className="sm:flex-1">
            Recusar
          </Botao>
          <Botao
            icone="check"
            onClick={() => setConfirmarAprovacao(true)}
            className="sm:flex-[2]"
            disabled={!videoOk}
            title={!videoOk ? "Aguardando o vídeo de verificação" : undefined}
          >
            Aprovar e criar torcida
          </Botao>
        </div>
      )}

      <Modal
        aberto={confirmarAprovacao}
        fechar={() => setConfirmarAprovacao(false)}
        titulo="Aprovar cadastro?"
        rodape={
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setConfirmarAprovacao(false)}>
              Cancelar
            </Botao>
            <Botao icone="check" carregando={salvando} onClick={aprovar} disabled={!conferido}>
              Aprovar
            </Botao>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <p>
            Vamos criar <strong>{s.nomeTorcida}</strong> em <strong>/{s.slug}</strong> e dar acesso de diretoria a <strong>{s.email}</strong>.
          </p>
          <p className="font-semibold">No vídeo, você conferiu:</p>
          <label className="flex items-start gap-3 min-h-11">
            <input type="checkbox" className="size-5 mt-0.5 accent-[var(--color-primaria)]" checked={documento} onChange={(e) => setDocumento(e.target.checked)} />
            O documento com foto do responsável: nome e CPF batem com o cadastro.
          </label>
          <label className="flex items-start gap-3 min-h-11">
            <input type="checkbox" className="size-5 mt-0.5 accent-[var(--color-primaria)]" checked={sedeOk} onChange={(e) => setSedeOk(e.target.checked)} />
            A sede (fachada e espaço), batendo com o endereço informado.
          </label>
          <Campo rotulo="Testemunhas que aparecem com documento" inputMode="numeric" value={testemunhas} onChange={(x) => setTestemunhas(x.replace(/\D/g, "").slice(0, 2))} className="max-w-40" erro={Number(testemunhas) < 2 && "Mínimo de 2."} />
          <AreaTexto rotulo="Observações (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} />
        </div>
      </Modal>
      <Modal
        aberto={recusando}
        fechar={() => setRecusando(false)}
        titulo="Recusar cadastro"
        descricao="O motivo aparece para quem fez o cadastro. O endereço volta a ficar livre."
        rodape={
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setRecusando(false)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" carregando={salvando} onClick={recusar}>
              Recusar
            </Botao>
          </div>
        }
      >
        <AreaTexto
          rotulo="Motivo"
          value={motivo}
          onChange={(ev) => setMotivo(ev.target.value)}
          maxLength={500}
          erro={tentou && motivo.trim().length < 3 && "Escreva o motivo."}
          placeholder="Ex.: Não conseguimos confirmar que você representa a torcida. Fale com a gente no WhatsApp."
        />
      </Modal>
    </div>
  );
}

function LinkCopiar({ rotulo, valor }: { rotulo: string; valor: string }) {
  const avisar = useToast();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-linha bg-superficie-2 pl-3">
      <span className="text-xs text-texto-3 shrink-0">{rotulo}</span>
      <a href={valor} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-sm py-2 underline text-texto">
        {valor.replace(/^https?:\/\//, "")}
      </a>
      <BotaoIcone icone="copiar" rotulo={`Copiar ${rotulo}`} onClick={async () => avisar((await copiarTexto(valor)) ? "Copiado!" : "Não foi possível copiar.", "sucesso")} />
    </div>
  );
}

/** Vídeo de verificação: a equipe assiste, confere pelo roteiro e aprova (ou pede outro vídeo). */
function BlocoVideo({ s }: { s: ComId<SolicitacaoTorcida> }) {
  const avisar = useToast();
  const v = s.verificacao;
  const [url, setUrl] = useState<string | null>(null);
  const [erroVideo, setErroVideo] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const registro = useDocumento<{ testemunhas: number; observacoes?: string; conferidoEm?: Timestamp }>(s.status === "aprovada" ? `verificacoesVideo/${s.id}` : null);

  useEffect(() => {
    let ativo = true;
    setUrl(null);
    setErroVideo(null);
    if (!v?.videoPath) return;
    void import("firebase/storage")
      .then(async ({ getDownloadURL, ref }) => {
        const { storage } = await import("@/lib/armazenamento");
        return getDownloadURL(ref(storage, v.videoPath!));
      })
      .then((u) => ativo && setUrl(u))
      .catch((e) => ativo && setErroVideo(mensagemDeErro(e)));
    return () => {
      ativo = false;
    };
  }, [v?.videoPath]);

  async function pedirOutro() {
    if (motivo.trim().length < 3) return;
    setSalvando(true);
    try {
      await api.pedirNovoVideo({ id: s.id, motivo: motivo.trim() });
      setPedindo(false);
      setMotivo("");
      avisar("Pedido enviado. O responsável recebeu o motivo por e-mail.", "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  const situacao =
    s.status === "aprovada" ? (
      <Selo tom="sucesso" ponto>Conferido</Selo>
    ) : v?.status === "enviado" ? (
      <Selo tom="info" ponto>Recebido</Selo>
    ) : v?.status === "refazer" ? (
      <Selo tom="alerta" ponto>Novo vídeo pedido</Selo>
    ) : (
      <Selo tom="alerta" ponto>Aguardando o vídeo</Selo>
    );

  return (
    <section className="rounded-2xl border border-primaria/40 p-4 space-y-3" data-verificacao-video="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Vídeo de verificação</h3>
        {situacao}
      </div>
      {!v?.videoPath && <p className="text-sm text-texto-2">O responsável ainda não enviou o vídeo. Ele vê o pedido ao entrar em /cadastro.</p>}
      {v?.status === "refazer" && v.motivoRefazer && <p className="text-sm text-texto-2">Motivo do pedido: {v.motivoRefazer}</p>}
      {v?.videoPath && (
        <>
          {url ? (
            <video src={url} controls playsInline preload="metadata" className="w-full max-h-[60vh] rounded-xl bg-black" data-video-verificacao="" />
          ) : erroVideo ? (
            <Aviso tom="perigo">Não foi possível abrir o vídeo: {erroVideo}</Aviso>
          ) : (
            <Carregando />
          )}
          <p className="text-xs text-texto-3">
            {v.enviadoEm ? `Enviado em ${dataHora(v.enviadoEm)}` : ""}
            {v.tamanho ? ` · ${(v.tamanho / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : ""}
            {url && (
              <>
                {" · "}
                <a href={url} target="_blank" rel="noreferrer" className="underline">
                  Abrir em outra aba
                </a>
              </>
            )}
          </p>
        </>
      )}
      <details className="rounded-xl bg-superficie-2 p-3 text-sm">
        <summary className="font-semibold cursor-pointer min-h-11 sm:min-h-0 flex items-center">O que o vídeo precisa mostrar</summary>
        <ol className="mt-2 space-y-1.5 list-decimal pl-5 text-texto-2">
          {ROTEIRO_VIDEO.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </details>
      {s.status === "pendente" && v?.status === "enviado" && (
        <Botao variante="fantasma" icone="camera" onClick={() => setPedindo(true)}>
          Pedir outro vídeo
        </Botao>
      )}
      {s.status === "aprovada" && registro.dados && (
        <p className="text-xs text-texto-3">
          Conferido{registro.dados.conferidoEm ? ` em ${dataHora(registro.dados.conferidoEm)}` : ""} · {registro.dados.testemunhas} testemunhas
          {registro.dados.observacoes ? ` · ${registro.dados.observacoes}` : ""}
        </p>
      )}

      <Modal
        aberto={pedindo}
        fechar={() => !salvando && setPedindo(false)}
        titulo="Pedir outro vídeo"
        descricao="O responsável recebe o motivo por e-mail e grava de novo. O resto do cadastro continua salvo."
        rodape={
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setPedindo(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao icone="enviar" carregando={salvando} onClick={pedirOutro} disabled={motivo.trim().length < 3}>
              Enviar pedido
            </Botao>
          </div>
        }
      >
        <AreaTexto
          rotulo="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={500}
          placeholder="Ex.: só apareceu 1 testemunha. Grave de novo com pelo menos 2, cada uma mostrando o documento."
        />
      </Modal>
    </section>
  );
}
