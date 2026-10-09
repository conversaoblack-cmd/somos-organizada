/**
 * Convidar alguém para o painel (usado em "Usuários do painel" e no atalho da subsede em "Sedes").
 * O servidor dá o acesso e manda o e-mail "Você foi convidado" com as cores da torcida e o botão para criar a senha
 * (página /convite). O link de senha nunca aparece para quem convidou: só o convidado define a própria senha
 * (anti-fraude: ninguém da diretoria consegue entrar como responsável da subsede e trocar a conta de recebimento dele).
 */
import { useEffect, useState } from "react";
import { enviarRedefinicaoSenha } from "@/lib/emailsConta";
import { api, mensagemDeErro } from "@/lib/api";
import { emailValido } from "@/lib/formatos";
import type { Papel } from "@/lib/tipos";
import { Aviso, Botao, Campo, Modal, OpcoesCartao, Selecao, useToast } from "@/ui";
import { ROTULO_PAPEL, usePainel } from "./contexto";
import { BotaoCopiar } from "./util";

export interface Convite {
  nome: string;
  email: string;
  painel: string;
  /** ainda não tem senha (conta nova ou nunca entrou): o e-mail leva o botão de criar senha */
  contaNova: boolean;
  emailEnviado: boolean;
}

export const DESCRICAO_PAPEL: Record<Papel, string> = {
  diretoria: "Acesso total: finanças, pagamentos, sócios, planos e usuários.",
  subsede: "Só a própria sede: eventos, pedidos, financeiro e conta de recebimento dela.",
  portaria: "Só o leitor de ingressos na entrada dos eventos.",
};

export async function enviarConvite(args: { tid: string; slug: string; nome: string; email: string; papel: Papel; sedeId?: string }): Promise<Convite> {
  const { tid, slug, nome, email, papel, sedeId } = args;
  const r = await api.convidarMembro({ tid, nome, email, papel, ...(papel !== "diretoria" && sedeId ? { sedeId } : {}) });
  const painel = `${location.origin}/${slug}/admin`;
  const precisaSenha = r.contaNova || !!r.nuncaEntrou;
  let emailEnviado = !!r.emailEnviado;
  // Servidor sem provedor de e-mail (ou falhou): cai no e-mail padrão do Firebase, só para quem ainda não tem senha
  if (!emailEnviado && precisaSenha) emailEnviado = await enviarRedefinicaoSenha(email, painel).then(() => true).catch(() => false);
  return { nome, email, painel, contaNova: precisaSenha, emailEnviado };
}

/** Resultado do convite: o que aconteceu e atalho para avisar no WhatsApp. */
export function ResultadoConvite({ convite: c, fechar }: { convite: Convite | null; fechar: () => void }) {
  return (
    <Modal aberto={!!c} fechar={fechar} titulo="Convite enviado" descricao={c ? `${c.nome} já tem acesso ao painel.` : undefined}>
      {c && (
        <div className="space-y-4">
          {!c.contaNova ? (
            <Aviso tom="sucesso" titulo="Acesso liberado">
              <strong className="text-texto">{c.email}</strong> já tem conta na Somos Organizada: é só entrar no painel com a senha de sempre.
              {c.emailEnviado && " Mandamos um e-mail avisando, com o botão para o painel."}
            </Aviso>
          ) : c.emailEnviado ? (
            <Aviso tom="sucesso" titulo="E-mail enviado">
              Enviamos para <strong className="text-texto">{c.email}</strong> o convite com o botão para criar a senha. Só essa pessoa recebe o link: ninguém mais
              vê a senha dela, nem a diretoria. O convite vale por 7 dias.
            </Aviso>
          ) : (
            <Aviso tom="alerta" titulo="Não conseguimos enviar o e-mail agora">
              Peça para <strong className="text-texto">{c.email}</strong> abrir o painel e tocar em “Esqueci minha senha” para criar a senha.
            </Aviso>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <BotaoCopiar texto={c.painel} rotulo="Copiar endereço do painel" variante="contorno" className="h-11 flex-1" />
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                c.contaNova
                  ? `Olá, ${c.nome}! Você foi convidado(a) para o painel. Abra o e-mail “Você foi convidado” que enviamos para ${c.email}, toque em “Aceitar convite e criar senha” e pronto. Não achou? Confira o spam.`
                  : `Olá, ${c.nome}! Você já tem acesso ao painel: entre em ${c.painel} com o seu e-mail ${c.email} e a senha de sempre.`,
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
  );
}

export function ModalConvite({
  aberto,
  fechar,
  sucesso,
  inicial,
}: {
  aberto: boolean;
  fechar: () => void;
  sucesso: (r: Convite) => void;
  /** Atalhos (Sedes, Portaria): o papel já vem escolhido e travado; a sede também, quando informada. */
  inicial?: { papel: Papel; sedeId?: string };
}) {
  const { tid, sedes, torcida, nomeSede } = usePainel();
  const avisar = useToast();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("subsede");
  const [sedeId, setSedeId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const subsedes = sedes.filter((s) => s.tipo !== "principal" && s.ativa !== false);
  const travado = !!inicial;

  useEffect(() => {
    if (aberto) {
      setNome("");
      setEmail("");
      setPapel(inicial?.papel ?? "subsede");
      setSedeId(inicial?.sedeId ?? "");
      setErro(null);
    }
  }, [aberto, inicial?.papel, inicial?.sedeId]);

  async function enviar() {
    setErro(null);
    if (nome.trim().length < 2) return setErro("Informe o nome.");
    if (!emailValido(email.trim())) return setErro("Informe um e-mail válido.");
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
      titulo={
        inicial?.papel === "subsede" && inicial.sedeId ? `Convidar responsável · ${nomeSede(inicial.sedeId)}` : inicial?.papel === "portaria" ? "Convidar porteiro" : "Convidar usuário"
      }
      descricao={
        inicial?.papel === "subsede"
          ? "A pessoa recebe um e-mail com o botão para criar a senha, entra no painel da subsede e cadastra a conta de recebimento."
          : inicial?.papel === "portaria"
            ? "A pessoa recebe um e-mail com o botão para criar a senha. No dia do evento, ela entra no leitor da portaria com esse e-mail e senha."
            : "A pessoa recebe um e-mail com o botão para criar a senha."
      }
      rodape={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Botao variante="fantasma" onClick={fechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao icone="enviar" onClick={enviar} carregando={enviando}>
            Enviar convite
          </Botao>
        </div>
      }
    >
      <div className="space-y-4">
        <Campo rotulo="Nome" value={nome} onChange={setNome} maxLength={64} autoComplete="off" />
        <Campo rotulo="E-mail" type="email" value={email} onChange={setEmail} maxLength={120} autoComplete="off" autoCapitalize="none" spellCheck={false} />
        {!travado && (
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
        )}
        {(!travado || (papel === "portaria" && !inicial?.sedeId)) && papel !== "diretoria" && (
          <Selecao
            rotulo={papel === "subsede" ? "Subsede" : "Sede (opcional)"}
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            dica={papel === "portaria" ? (sedeId ? "Esta portaria só confere os eventos desta sede." : "Em “Todas”, a portaria confere os eventos de todas as sedes.") : undefined}
          >
            <option value="">{papel === "subsede" ? "Escolha…" : "Todas"}</option>
            {(papel === "subsede" ? subsedes : sedes).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Selecao>
        )}
        {travado && inicial?.papel === "subsede" && inicial.sedeId && (
          <Aviso tom="info">
            Papel: <strong className="text-texto">responsável pela subsede {nomeSede(inicial.sedeId)}</strong>. {DESCRICAO_PAPEL.subsede}
          </Aviso>
        )}
        {travado && inicial?.papel === "portaria" && (
          <Aviso tom="info">
            Papel: <strong className="text-texto">portaria</strong>. {DESCRICAO_PAPEL.portaria} Não vê dinheiro, sócios nem configurações.
          </Aviso>
        )}
        {!travado && papel === "subsede" && subsedes.length === 0 && <Aviso tom="alerta">Cadastre uma subsede em “Sedes” antes de convidar.</Aviso>}
        {papel === "diretoria" && <Aviso tom="alerta">Diretoria vê o dinheiro e as chaves de pagamento de {torcida.nome}. Convide só quem é da diretoria.</Aviso>}
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </div>
    </Modal>
  );
}
