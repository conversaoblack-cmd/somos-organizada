import { useEffect, useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import { emailValido } from "@/lib/formatos";
import type { ComId, Membro, Papel } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Aviso, Avatar, Botao, BotaoIcone, CabecalhoPagina, Campo, Cartao, cx, Interruptor, Modal, OpcoesCartao, Selecao, Selo, useToast } from "@/ui";
import { ROTULO_PAPEL, usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { BotaoCopiar, Confirmar, EstadoLista } from "./util";

interface Convite {
  nome: string;
  email: string;
  painel: string;
  contaNova: boolean;
  emailEnviado: boolean;
}

/**
 * Dá o acesso e, se a conta é nova, o Firebase manda o e-mail de criar senha direto para o convidado.
 * O link de senha nunca aparece para quem convidou: só o convidado define a própria senha (anti-fraude:
 * ninguém da diretoria consegue entrar como diretor da subsede e trocar a conta de recebimento dele).
 */
async function enviarConvite(args: { tid: string; slug: string; nome: string; email: string; papel: Papel; sedeId?: string }): Promise<Convite> {
  const { tid, slug, nome, email, papel, sedeId } = args;
  const r = await api.convidarMembro({ tid, nome, email, papel, ...(papel !== "diretoria" && sedeId ? { sedeId } : {}) });
  const painel = `${location.origin}/${slug}/admin`;
  const emailEnviado = r.contaNova
    ? await sendPasswordResetEmail(auth, email, { url: painel }).then(() => true).catch(() => false)
    : false;
  return { nome, email, painel, contaNova: r.contaNova, emailEnviado };
}

const DESCRICAO_PAPEL: Record<Papel, string> = {
  diretoria: "Acesso total: finanças, pagamentos, sócios, planos e usuários.",
  subsede: "Só a própria sede: eventos, sócios, pedidos e extrato dela.",
  portaria: "Só o leitor de ingressos na entrada dos eventos.",
};

export default function Usuarios() {
  const { tid, uid, nomeSede, torcida } = usePainel();
  const avisar = useToast();
  const [reenviando, setReenviando] = useState<string | null>(null);
  const membros = useColecao<Membro>(collection(db, `torcidas/${tid}/membros`), `membros-${tid}`);
  const [convidar, setConvidar] = useState(false);
  const [editando, setEditando] = useState<ComId<Membro> | null>(null);
  const [link, setLink] = useState<Convite | null>(null);
  useTourPagina("usuarios");

  async function reenviar(m: ComId<Membro>) {
    setReenviando(m.id);
    try {
      setLink(await enviarConvite({ tid, slug: torcida.slug, nome: m.nome || m.email, email: m.email, papel: m.papel, sedeId: m.sedeId }));
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

      <div className="grid sm:grid-cols-3 gap-3 mb-6" data-tour="papeis">
        {(["diretoria", "subsede", "portaria"] as Papel[]).map((p) => (
          <Cartao key={p} className="p-4">
            <p className="font-semibold">{ROTULO_PAPEL[p]}</p>
            <p className="text-xs text-texto-3 mt-1">{DESCRICAO_PAPEL[p]}</p>
          </Cartao>
        ))}
      </div>

      {membros.carregando || membros.erro || ordenados.length === 0 ? (
        <EstadoLista carregando={membros.carregando} erro={membros.erro} vazio icone="usuarios" tituloVazio="Nenhum usuário" />
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
                </div>
                <div className="hidden sm:flex gap-1.5">
                  <Selo tom={m.papel === "diretoria" ? "primaria" : m.papel === "subsede" ? "info" : "neutro"}>{ROTULO_PAPEL[m.papel]}</Selo>
                  {!m.ativo && <Selo tom="perigo">Sem acesso</Selo>}
                </div>
                {m.ativo && m.id !== uid && (
                  <BotaoIcone
                    icone={reenviando === m.id ? "relogio" : "enviar"}
                    rotulo={`Reenviar convite para ${m.nome || m.email}`}
                    disabled={!!reenviando}
                    onClick={() => reenviar(m)}
                  />
                )}
                <BotaoIcone icone="lapis" rotulo={`Editar ${m.nome}`} onClick={() => setEditando(m)} />
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <ModalConvite aberto={convidar} fechar={() => setConvidar(false)} sucesso={(r) => setLink(r)} />
      {editando && <ModalEditar m={editando} fechar={() => setEditando(null)} />}

      <Modal aberto={!!link} fechar={() => setLink(null)} titulo="Convite enviado" descricao={link ? `${link.nome} já tem acesso ao painel.` : undefined}>
        {link && (
          <div className="space-y-4">
            {!link.contaNova ? (
              <Aviso tom="sucesso" titulo="Acesso liberado">
                <strong className="text-texto">{link.email}</strong> já tem conta na Somos Organizada: é só entrar no painel com a senha de sempre.
              </Aviso>
            ) : link.emailEnviado ? (
              <Aviso tom="sucesso" titulo="E-mail enviado">
                Enviamos para <strong className="text-texto">{link.email}</strong> o link para criar a senha. Só essa pessoa recebe o link: ninguém mais vê a senha
                dela, nem a diretoria.
              </Aviso>
            ) : (
              <Aviso tom="alerta" titulo="Não conseguimos enviar o e-mail agora">
                Peça para <strong className="text-texto">{link.email}</strong> abrir o painel e tocar em “Esqueci minha senha” para criar a senha.
              </Aviso>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <BotaoCopiar texto={link.painel} rotulo="Copiar endereço do painel" variante="contorno" className="h-11 flex-1" />
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  link.contaNova
                    ? `Olá, ${link.nome}! Você foi convidado(a) para o painel. Abra o e-mail que enviamos para ${link.email} e crie sua senha. Depois entre em ${link.painel}. Não chegou? Lá mesmo toque em “Esqueci minha senha”.`
                    : `Olá, ${link.nome}! Você já tem acesso ao painel: entre em ${link.painel} com o seu e-mail ${link.email} e a senha de sempre.`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl font-semibold bg-primaria text-sobre-primaria hover:brightness-110"
              >
                Avisar no WhatsApp
              </a>
            </div>

          </div>
        )}
      </Modal>
    </div>
  );
}

function ModalConvite({ aberto, fechar, sucesso }: { aberto: boolean; fechar: () => void; sucesso: (r: Convite) => void }) {
  const { tid, sedes, torcida } = usePainel();
  const avisar = useToast();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("subsede");
  const [sedeId, setSedeId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const subsedes = sedes.filter((s) => s.tipo !== "principal" && s.ativa !== false);

  useEffect(() => {
    if (aberto) {
      setNome("");
      setEmail("");
      setPapel("subsede");
      setSedeId("");
      setErro(null);
    }
  }, [aberto]);

  async function enviar() {
    setErro(null);
    if (nome.trim().length < 2) return setErro("Informe o nome.");
    if (!emailValido(email)) return setErro("Informe um e-mail válido.");
    if (papel === "subsede" && !sedeId) return setErro("Escolha a subsede deste usuário.");
    setEnviando(true);
    try {
      sucesso(await enviarConvite({ tid, slug: torcida.slug, nome: nome.trim(), email: email.trim().toLowerCase(), papel, sedeId }));
      avisar("Usuário convidado.", "sucesso");
      fechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      fechar={() => !enviando && fechar()}
      titulo="Convidar usuário"
      descricao="A pessoa recebe um link para criar a senha."
      rodape={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Botao variante="fantasma" onClick={fechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao icone="enviar" onClick={enviar} carregando={enviando}>
            Gerar convite
          </Botao>
        </div>
      }
    >
      <div className="space-y-4">
        <Campo rotulo="Nome" value={nome} onChange={setNome} maxLength={64} autoComplete="off" />
        <Campo rotulo="E-mail" type="email" value={email} onChange={setEmail} maxLength={64} autoComplete="off" />
        <div>
          <p className="block text-sm font-medium text-texto-2 mb-1.5">Papel</p>
          <OpcoesCartao
            nome="Papel"
            colunas={1}
            valor={papel}
            onChange={setPapel}
            opcoes={(["diretoria", "subsede", "portaria"] as Papel[]).map((p) => ({
              valor: p,
              titulo: ROTULO_PAPEL[p],
              descricao: DESCRICAO_PAPEL[p],
              icone: p === "diretoria" ? "escudo" : p === "subsede" ? "casa" : "qr",
            }))}
          />
        </div>
        {papel !== "diretoria" && (
          <Selecao
            rotulo={papel === "subsede" ? "Subsede" : "Sede (opcional)"}
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            dica={papel === "portaria" ? "A portaria valida ingressos de todos os eventos." : undefined}
          >
            <option value="">{papel === "subsede" ? "Escolha..." : "Todas"}</option>
            {(papel === "subsede" ? subsedes : sedes).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Selecao>
        )}
        {papel === "subsede" && subsedes.length === 0 && <Aviso tom="alerta">Cadastre uma subsede em “Sedes” antes de convidar.</Aviso>}
        {papel === "diretoria" && <Aviso tom="alerta">Diretoria vê o dinheiro e as chaves de pagamento de {torcida.nome}. Convide só quem é da diretoria.</Aviso>}
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

function ModalEditar({ m, fechar }: { m: ComId<Membro>; fechar: () => void }) {
  const { tid, uid, sedes } = usePainel();
  const avisar = useToast();
  const [papel, setPapel] = useState<Papel>(m.papel);
  const [sedeId, setSedeId] = useState(m.sedeId ?? "");
  const [ativo, setAtivo] = useState(m.ativo);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const ehVoce = m.id === uid;
  const subsedes = sedes.filter((s) => s.tipo !== "principal");

  function revisar() {
    setErro(null);
    if (papel === "subsede" && !sedeId) return setErro("Escolha a subsede.");
    const sensivel = (!ativo && m.ativo) || (m.papel === "diretoria" && papel !== "diretoria") || (papel === "diretoria" && m.papel !== "diretoria");
    if (sensivel) return setConfirmar(true);
    void salvar().catch((e) => setErro(mensagemDeErro(e)));
  }

  async function salvar() {
    const novaSede = papel === "diretoria" ? null : sedeId || null;
    await api.atualizarMembro({
      tid,
      uid: m.id,
      ...(papel !== m.papel ? { papel } : {}),
      ...(novaSede !== (m.sedeId ?? null) ? { sedeId: novaSede } : {}),
      ...(ativo !== m.ativo ? { ativo } : {}),
    });
    avisar("Usuário atualizado.", "sucesso");
    fechar();
  }

  return (
    <Modal
      aberto
      fechar={fechar}
      titulo={m.nome || m.email}
      descricao={m.email}
      rodape={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Botao variante="fantasma" onClick={fechar}>
            Cancelar
          </Botao>
          <Botao icone="check" onClick={revisar}>
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
            <option value="">{papel === "subsede" ? "Escolha..." : "Todas"}</option>
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
