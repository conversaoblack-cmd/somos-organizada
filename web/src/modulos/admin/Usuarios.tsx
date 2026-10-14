import { useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import type { ComId, Membro, Papel } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Aviso, Avatar, Botao, BotaoIcone, CabecalhoPagina, Cartao, cx, Icone, Interruptor, Modal, Selecao, Selo, useToast } from "@/ui";
import { ROTULO_PAPEL, usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { DESCRICAO_PAPEL, enviarConvite, ModalConvite, ResultadoConvite, type Convite } from "./ConviteUsuario";
import { comPrazo, Confirmar, EstadoLista, mensagemGravacao } from "./util";

export default function Usuarios() {
  const { tid, uid, nomeSede, torcida } = usePainel();
  const avisar = useToast();
  const [reenviando, setReenviando] = useState<string | null>(null);
  const membros = useColecao<Membro>(collection(db, `torcidas/${tid}/membros`), `membros-${tid}`);
  const [convidar, setConvidar] = useState(false);
  const [editando, setEditando] = useState<ComId<Membro> | null>(null);
  const [link, setLink] = useState<Convite | null>(null);
  useTourPagina("usuarios");
  const [papeisAbertos, setPapeisAbertos] = useState(() => {
    try {
      return window.matchMedia("(min-width: 640px)").matches;
    } catch {
      return true;
    }
  });

  async function reenviar(m: ComId<Membro>) {
    setReenviando(m.id);
    try {
      setLink(await enviarConvite({ tid, slug: torcida.slug, dominio: torcida.dominio, nome: m.nome || m.email, email: m.email, papel: m.papel, sedeId: m.sedeId }));
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setReenviando(null);
    }
  }

  const ordenados = useMemo(
    () =>
      [...membros.dados].sort(
        (a, b) => Number(b.ativo) - Number(a.ativo) || ["diretoria", "subsede", "portaria"].indexOf(a.papel) - ["diretoria", "subsede", "portaria"].indexOf(b.papel) || (a.nome ?? "").localeCompare(b.nome ?? ""),
      ),
    [membros.dados],
  );

  return (
    <div className="max-w-4xl">
      <CabecalhoPagina
        titulo="Usuários do painel"
        descricao="Quem pode entrar no painel e o que cada um pode fazer."
        acoes={
          <Botao icone="mais" onClick={() => setConvidar(true)} data-tour="convidar-usuario">
            Convidar usuário
          </Botao>
        }
      />

      {/* "Quem pode o quê": aberto no computador; no celular começa fechado para a equipe aparecer sem rolar */}
      <details
        className="group mb-6"
        data-tour="papeis"
        open={papeisAbertos}
        onToggle={(e) => {
          setPapeisAbertos(e.currentTarget.open);
        }}
      >
        <summary className="flex items-center justify-between gap-2 min-h-11 cursor-pointer list-none rounded-xl font-semibold [&::-webkit-details-marker]:hidden">
          Quem pode o quê
          <Icone nome="chevronBaixo" className="size-5 text-texto-3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          {(["diretoria", "subsede", "portaria"] as Papel[]).map((p) => (
            <Cartao key={p} className="p-4">
              <p className="font-semibold">{ROTULO_PAPEL[p]}</p>
              <p className="text-xs text-texto-3 mt-1">{DESCRICAO_PAPEL[p]}</p>
            </Cartao>
          ))}
        </div>
      </details>

      {membros.carregando || membros.erro || ordenados.length === 0 ? (
        <EstadoLista carregando={membros.carregando} erro={membros.erro} semConexao={membros.semConexao} vazio icone="usuarios" tituloVazio="Nenhum usuário" />
      ) : (
        <Cartao className="overflow-hidden" data-tour="lista-usuarios">
          <ul className="divide-y divide-linha">
            {ordenados.map((m) => (
              <li key={m.id} className={cx("flex items-center gap-3 px-4 py-3.5", !m.ativo && "opacity-60")}>
                <Avatar nome={m.nome || m.email} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {m.nome || m.email}
                    {m.id === uid && <span className="text-texto-3 font-normal"> (você)</span>}
                  </p>
                  <p className="text-xs text-texto-3 truncate">
                    {m.email}
                    {m.sedeId && ` · ${nomeSede(m.sedeId)}`}
                  </p>
                  {/* no celular o papel e o "Sem acesso" ficam embaixo do e-mail (sem espremer o nome) */}
                  <div className="sm:hidden mt-1.5 flex flex-wrap gap-1.5">
                    <Selo tom={m.papel === "diretoria" ? "primaria" : m.papel === "subsede" ? "info" : "neutro"}>{ROTULO_PAPEL[m.papel]}</Selo>
                    {!m.ativo && <Selo tom="perigo">Sem acesso</Selo>}
                  </div>
                </div>
                <div className="hidden sm:flex gap-1.5">
                  <Selo tom={m.papel === "diretoria" ? "primaria" : m.papel === "subsede" ? "info" : "neutro"}>{ROTULO_PAPEL[m.papel]}</Selo>
                  {!m.ativo && <Selo tom="perigo">Sem acesso</Selo>}
                </div>
                {/* no celular só o lápis (o nome não fica espremido): "Reenviar convite" fica dentro da edição */}
                {m.ativo && m.id !== uid && (
                  <BotaoIcone
                    icone={reenviando === m.id ? "relogio" : "enviar"}
                    rotulo={`Reenviar convite para ${m.nome || m.email}`}
                    disabled={!!reenviando}
                    onClick={() => reenviar(m)}
                    className="max-sm:hidden"
                  />
                )}
                <BotaoIcone icone="lapis" rotulo={`Editar ${m.nome}`} onClick={() => setEditando(m)} />
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <ModalConvite aberto={convidar} fechar={() => setConvidar(false)} sucesso={(r) => setLink(r)} />
      {editando && (
        <ModalEditar
          m={editando}
          fechar={() => setEditando(null)}
          reenviar={
            editando.ativo && editando.id !== uid
              ? () => {
                  const m = editando;
                  setEditando(null);
                  void reenviar(m);
                }
              : undefined
          }
          reenviando={reenviando === editando.id}
        />
      )}

      <ResultadoConvite convite={link} fechar={() => setLink(null)} />
    </div>
  );
}

function ModalEditar({ m, fechar, reenviar, reenviando }: { m: ComId<Membro>; fechar: () => void; reenviar?: () => void; reenviando?: boolean }) {
  const { tid, uid, sedes } = usePainel();
  const avisar = useToast();
  const [papel, setPapel] = useState<Papel>(m.papel);
  const [sedeId, setSedeId] = useState(m.sedeId ?? "");
  const [ativo, setAtivo] = useState(m.ativo);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const ehVoce = m.id === uid;
  const subsedes = sedes.filter((s) => s.tipo !== "principal");

  function revisar() {
    setErro(null);
    if (papel === "subsede" && !sedeId) return setErro("Escolha a subsede.");
    const sensivel = (!ativo && m.ativo) || (m.papel === "diretoria" && papel !== "diretoria") || (papel === "diretoria" && m.papel !== "diretoria");
    if (sensivel) return setConfirmar(true);
    if (salvando) return;
    setSalvando(true);
    salvar()
      .catch((e) => setErro(mensagemGravacao(e)))
      .finally(() => setSalvando(false));
  }

  async function salvar() {
    const novaSede = papel === "diretoria" ? null : sedeId || null;
    await comPrazo(
      api.atualizarMembro({
        tid,
        uid: m.id,
        ...(papel !== m.papel ? { papel } : {}),
        ...(novaSede !== (m.sedeId ?? null) ? { sedeId: novaSede } : {}),
        ...(ativo !== m.ativo ? { ativo } : {}),
      }),
    );
    avisar("Usuário atualizado.", "sucesso");
    fechar();
  }

  return (
    <Modal
      aberto
      fechar={() => !salvando && fechar()}
      titulo={m.nome || m.email}
      descricao={m.email}
      rodape={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Botao variante="fantasma" onClick={fechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao icone="check" onClick={revisar} carregando={salvando}>
            Salvar
          </Botao>
        </div>
      }
    >
      <div className="space-y-4">
        <Selecao rotulo="Papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
          {(["diretoria", "subsede", "portaria"] as Papel[]).map((p) => (
            <option key={p} value={p}>
              {ROTULO_PAPEL[p]}
            </option>
          ))}
        </Selecao>
        <p className="text-xs text-texto-3 -mt-2">{DESCRICAO_PAPEL[papel]}</p>
        {papel !== "diretoria" && (
          <Selecao rotulo={papel === "subsede" ? "Subsede" : "Sede (opcional)"} value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
            <option value="">{papel === "subsede" ? "Escolha…" : "Todas"}</option>
            {(papel === "subsede" ? subsedes : sedes).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Selecao>
        )}
        <Cartao className="p-4">
          <Interruptor ligado={ativo} onChange={setAtivo} rotulo="Acesso liberado" descricao="Desligue para bloquear o acesso sem apagar o histórico." />
        </Cartao>
        {reenviar && (
          <Botao variante="contorno" icone="enviar" largo onClick={reenviar} carregando={reenviando} disabled={salvando}>
            Reenviar convite
          </Botao>
        )}
        {ehVoce && <Aviso tom="alerta">Este é o seu usuário. Se tirar seu próprio acesso de diretoria, você sai do painel.</Aviso>}
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </div>
      <Confirmar aberto={confirmar} fechar={() => setConfirmar(false)} titulo="Confirmar alteração de acesso?" rotulo="Confirmar" perigo={!ativo} acao={salvar}>
        {!ativo && m.ativo
          ? `${m.nome} não vai mais conseguir entrar no painel.`
          : papel === "diretoria"
            ? `${m.nome} passará a ter acesso total, incluindo finanças e pagamentos.`
            : `${m.nome} deixará de ser diretoria e terá acesso reduzido.`}
      </Confirmar>
    </Modal>
  );
}
