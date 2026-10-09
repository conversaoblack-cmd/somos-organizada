/**
 * Portaria (painel da diretoria): explica como funciona a leitura dos ingressos, dá o link do leitor para mandar
 * aos porteiros, convida quem vai trabalhar na entrada e abre o leitor para a própria diretoria.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
import type { ComId, Membro } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Avatar, Botao, BotaoIcone, CabecalhoPagina, Cartao, cx, Icone, Selo, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { BotaoCopiar, EstadoLista } from "./util";
import { enviarConvite, ModalConvite, ResultadoConvite, type Convite } from "./ConviteUsuario";

export default function PortariaEquipe() {
  const { tid, torcida, nomeSede, uid } = usePainel();
  const avisar = useToast();
  useTourPagina("portaria");
  const q = useMemo(() => query(collection(db, `torcidas/${tid}/membros`), where("papel", "==", "portaria")), [tid]);
  const porteiros = useColecao<Membro>(q, `porteiros-${tid}`);
  const [convidar, setConvidar] = useState(false);
  const [resultado, setResultado] = useState<Convite | null>(null);
  const [reenviando, setReenviando] = useState<string | null>(null);
  const link = `${location.origin}/${torcida.slug}/portaria`;
  const textoZap = `Portaria da ${torcida.nome}: no dia do evento, abra ${link} no celular, entre com o seu e-mail e a senha que você criou no convite e aponte a câmera para o QR Code do ingresso.`;
  const lista = [...porteiros.dados].sort((a, b) => Number(b.ativo) - Number(a.ativo) || (a.nome ?? "").localeCompare(b.nome ?? ""));

  async function reenviar(m: ComId<Membro>) {
    setReenviando(m.id);
    try {
      setResultado(await enviarConvite({ tid, slug: torcida.slug, nome: m.nome || m.email, email: m.email, papel: "portaria", sedeId: m.sedeId }));
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setReenviando(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <CabecalhoPagina
        titulo="Portaria"
        descricao="Quem confere os ingressos na entrada dos eventos e como fazer isso pelo celular."
        acoes={
          <Botao icone="mais" onClick={() => setConvidar(true)} data-tour="convidar-porteiro">
            Convidar porteiro
          </Botao>
        }
      />

      <Cartao className="p-5 sm:p-6" data-tour="portaria-como">
        <h2 className="font-bold text-lg">Como funciona</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            { icone: "usuarios" as const, titulo: "1. Convide os porteiros", texto: "Cada um recebe um e-mail para criar a senha. Eles só veem o leitor: nada de dinheiro, sócios ou configurações." },
            { icone: "local" as const, titulo: "2. No dia, abram o leitor", texto: "No celular, pelo link abaixo, com o e-mail e a senha do convite. Ou pelo próprio painel, depois de entrar." },
            { icone: "qr" as const, titulo: "3. Leiam o QR Code", texto: "A tela mostra na hora se o ingresso é válido, já foi usado ou é inválido. Sem QR, busque pelo CPF do titular." },
          ].map((p) => (
            <li key={p.titulo} className="min-w-0 rounded-2xl bg-superficie-2 p-4">
              <span className="size-10 rounded-xl bg-primaria/15 text-primaria-texto grid place-items-center">
                <Icone nome={p.icone} className="size-5" />
              </span>
              <p className="font-semibold mt-3">{p.titulo}</p>
              <p className="text-sm text-texto-2 mt-1">{p.texto}</p>
            </li>
          ))}
        </ol>
      </Cartao>

      <Cartao className="p-5 sm:p-6 mt-4" data-tour="portaria-link">
        <h2 className="font-bold text-lg">Link do leitor</h2>
        <p className="text-sm text-texto-2 mt-1">Mande para quem vai trabalhar na entrada. Vale para todos os eventos da torcida.</p>
        <code className="mt-3 block rounded-xl bg-superficie-2 border border-linha px-3 py-2.5 text-sm break-all">{link}</code>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <BotaoCopiar texto={link} rotulo="Copiar link" variante="contorno" className="h-11" />
          <a
            href={`https://wa.me/?text=${encodeURIComponent(textoZap)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl font-semibold border border-linha-forte hover:bg-superficie-2"
          >
            <Icone nome="whatsapp" className="size-5" /> Mandar no WhatsApp
          </a>
          <Link
            to={`/${torcida.slug}/portaria`}
            className="sm:ml-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl font-semibold bg-primaria text-sobre-primaria hover:brightness-110"
            data-tour="abrir-leitor-diretoria"
          >
            <Icone nome="camera" className="size-5" /> Abrir o leitor agora
          </Link>
        </div>
      </Cartao>

      <h2 className="text-lg font-bold mt-8 mb-3">Equipe da portaria</h2>
      {porteiros.carregando || porteiros.erro || lista.length === 0 ? (
        <div data-tour="lista-porteiros">
          <EstadoLista
            carregando={porteiros.carregando}
            erro={porteiros.erro}
            semConexao={porteiros.semConexao}
            vazio
            icone="qr"
            tituloVazio="Ninguém na portaria ainda"
            textoVazio="Convide quem vai conferir os ingressos na entrada. A diretoria também pode usar o leitor."
            acaoVazio={
              <Botao tamanho="sm" icone="mais" onClick={() => setConvidar(true)}>
                Convidar porteiro
              </Botao>
            }
          />
        </div>
      ) : (
        <Cartao className="overflow-hidden" data-tour="lista-porteiros">
          <ul className="divide-y divide-linha">
            {lista.map((m) => (
              <li key={m.id} className={cx("flex items-center gap-3 px-4 py-3.5", !m.ativo && "opacity-60")}>
                <Avatar nome={m.nome || m.email} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{m.nome || m.email}</p>
                  <p className="text-xs text-texto-3 truncate">
                    {m.email} · {m.sedeId ? nomeSede(m.sedeId) : "Todas as sedes"}
                  </p>
                </div>
                {!m.ativo && <Selo tom="perigo">Sem acesso</Selo>}
                {m.ativo && m.id !== uid && (
                  <BotaoIcone
                    icone={reenviando === m.id ? "relogio" : "enviar"}
                    rotulo={`Reenviar convite para ${m.nome || m.email}`}
                    disabled={!!reenviando}
                    onClick={() => reenviar(m)}
                  />
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      )}
      <p className="text-xs text-texto-3 mt-3">Para tirar o acesso de alguém, vá em “Usuários do painel” e desligue o acesso.</p>

      <ModalConvite aberto={convidar} fechar={() => setConvidar(false)} sucesso={setResultado} inicial={{ papel: "portaria" }} />
      <ResultadoConvite convite={resultado} fechar={() => setResultado(null)} />
    </div>
  );
}
