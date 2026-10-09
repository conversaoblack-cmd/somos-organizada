import { useEffect, useRef, useState } from "react";
import { collection, doc, serverTimestamp, setDoc, updateDoc, type DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import type { ComId, Membro, Sede } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Botao, BotaoIcone, CabecalhoPagina, Campo, Cartao, cx, Gaveta, Icone, Selo, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { comPrazo, Confirmar, EstadoLista, mensagemGravacao, numero } from "./util";
import { infoRecebedor, SeloRecebedor } from "./recebedor";
import { enviarConvite, ModalConvite, ResultadoConvite, type Convite } from "./ConviteUsuario";

interface Form {
  nome: string;
  bairro: string;
  cidade: string;
  endereco: string;
  responsavel: string;
  ordem: string;
}

const formDe = (s: ComId<Sede> | null, ordem: number): Form => ({
  nome: s?.nome ?? "",
  bairro: s?.bairro ?? "",
  cidade: s?.cidade ?? "",
  endereco: s?.endereco ?? "",
  responsavel: s?.responsavel ?? "",
  ordem: String(s?.ordem ?? ordem),
});

export default function Sedes() {
  const { tid, sedes, demo, torcida } = usePainel();
  const avisar = useToast();
  const membros = useColecao<Membro>(collection(db, `torcidas/${tid}/membros`), `membros-${tid}`);
  const [convidarSede, setConvidarSede] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Convite | null>(null);
  const [reenviando, setReenviando] = useState<string | null>(null);
  const [editando, setEditando] = useState<ComId<Sede> | "nova" | null>(null);
  const [alternar, setAlternar] = useState<ComId<Sede> | null>(null);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  useTourPagina("sedes");

  async function simularProvaDeVida(sedeId: string) {
    setAtualizando(sedeId);
    try {
      await api.simularDemo({ tid, acao: "aprovar_recebedor", sedeId });
      avisar("Prova de vida aprovada (demonstração). Conta ativa.", "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setAtualizando(null);
    }
  }

  async function atualizarRecebedor(sedeId: string) {
    setAtualizando(sedeId);
    try {
      const r = await api.atualizarRecebedor({ tid, sedeId });
      avisar(`Conta de recebimento: ${infoRecebedor(r.recebedor).rotulo}.`, "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setAtualizando(null);
    }
  }
  async function reenviar(m: ComId<Membro>) {
    setReenviando(m.id);
    try {
      setResultado(await enviarConvite({ tid, slug: torcida.slug, nome: m.nome || m.email, email: m.email, papel: m.papel, sedeId: m.sedeId }));
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setReenviando(null);
    }
  }
  const responsaveis = (sedeId: string) => membros.dados.filter((m) => m.papel === "subsede" && m.sedeId === sedeId && m.ativo);

  const proximaOrdem = Math.max(0, ...sedes.map((s) => s.ordem ?? 0)) + 1;
  const principal = sedes.find((s) => s.tipo === "principal");
  const subsedes = sedes.filter((s) => s.tipo !== "principal");

  const item = (s: ComId<Sede>) => (
    <Cartao key={s.id} className={cx("p-4 sm:p-5 flex items-start gap-4", s.ativa === false && "opacity-60")}>
      <span className={cx("size-11 shrink-0 rounded-2xl grid place-items-center", s.tipo === "principal" ? "bg-primaria/15 text-primaria-texto" : "bg-superficie-2 text-texto-2")}>
        <Icone nome={s.tipo === "principal" ? "escudo" : "casa"} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{s.nome}</p>
          {s.tipo === "principal" ? <Selo tom="primaria">Sede principal</Selo> : s.ativa === false ? <Selo tom="perigo">Desativada</Selo> : null}
        </div>
        <p className="text-sm text-texto-3 mt-0.5">{[s.bairro, s.cidade].filter(Boolean).join(" · ") || "Endereço não informado"}</p>
        {s.responsavel && (
          <p className="text-sm text-texto-2 mt-1 inline-flex items-center gap-1.5">
            <Icone nome="usuario" className="size-4" /> {s.responsavel}
          </p>
        )}
        {s.tipo !== "principal" && (
          <div className="mt-3 rounded-2xl border border-linha bg-superficie-2 px-3 py-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-texto-3">Conta de recebimento</span>
                <SeloRecebedor r={s.recebedor} />
              </div>
              <p className="text-xs mt-1 text-texto-2">
                {s.recebedor
                  ? "Cadastrada pelo responsável da subsede. Por segurança, os dados bancários ficam só com ele."
                  : "O responsável cadastra pelo painel da subsede, em Recebimentos. Sem ela, os eventos da subsede não podem ser publicados."}
              </p>
              {!s.recebedor && s.ativa !== false && !membros.carregando && (
                <AcessoSubsede
                  responsaveis={responsaveis(s.id)}
                  reenviando={reenviando}
                  convidar={() => setConvidarSede(s.id)}
                  reenviar={reenviar}
                />
              )}
            </div>
            {demo && s.recebedor && s.recebedor.status !== "active" && (
              <Botao tamanho="sm" variante="suave" icone="raio" className="shrink-0" carregando={atualizando === s.id} onClick={() => simularProvaDeVida(s.id)}>
                <span className="hidden sm:inline">Simular prova de vida aprovada</span>
                <span className="sm:hidden">Simular</span>
              </Botao>
            )}
            {s.recebedor && (
              <Botao
                tamanho="sm"
                variante="fantasma"
                icone="atualizar"
                className="shrink-0"
                carregando={atualizando === s.id}
                onClick={() => atualizarRecebedor(s.id)}
                aria-label={`Atualizar a situação da conta de recebimento de ${s.nome}`}
                title="Atualizar situação"
              >
                <span className="hidden sm:inline">Atualizar</span>
              </Botao>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {s.tipo !== "principal" && (
          <span className="hidden sm:block">
            <Botao tamanho="sm" variante="fantasma" onClick={() => setAlternar(s)}>
              {s.ativa === false ? "Reativar" : "Desativar"}
            </Botao>
          </span>
        )}
        <BotaoIcone icone="lapis" rotulo={`Editar ${s.nome}`} onClick={() => setEditando(s)} />
      </div>
    </Cartao>
  );

  return (
    <div className="max-w-4xl">
      <CabecalhoPagina
        titulo="Sedes"
        descricao="A sede principal fica com a taxa de serviço. Cada subsede recebe o valor dos próprios eventos direto na conta de recebimento dela, dividido na hora pela Pagar.me, e, se configurado, as mensalidades dos seus sócios."
        acoes={
          <Botao icone="mais" onClick={() => setEditando("nova")} data-tour="nova-subsede">
            Nova subsede
          </Botao>
        }
      />
      {sedes.length === 0 ? (
        <EstadoLista carregando={false} erro={null} vazio icone="casa" tituloVazio="Nenhuma sede cadastrada" />
      ) : (
        <div className="space-y-6" data-tour="lista-sedes">
          {principal && <div className="grid grid-cols-1 gap-3">{item(principal)}</div>}
          <section>
            <h2 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-3">Subsedes ({numero(subsedes.length)})</h2>
            {subsedes.length ? (
              <div className="grid grid-cols-1 gap-3">{subsedes.map(item)}</div>
            ) : (
              <Cartao className="p-5 text-sm text-texto-2">Nenhuma subsede ainda. Crie distritos, bairros ou cidades onde a torcida tem núcleo.</Cartao>
            )}
          </section>
        </div>
      )}

      <FormSede sede={editando} proximaOrdem={proximaOrdem} fechar={() => setEditando(null)} alternar={(s) => setAlternar(s)} criada={(id) => setConvidarSede(id)} />
      <ModalConvite
        aberto={!!convidarSede}
        fechar={() => setConvidarSede(null)}
        sucesso={setResultado}
        inicial={convidarSede ? { papel: "subsede", sedeId: convidarSede } : undefined}
      />
      <ResultadoConvite convite={resultado} fechar={() => setResultado(null)} />

      {alternar && (
        <Confirmar
          aberto
          fechar={() => setAlternar(null)}
          titulo={alternar.ativa === false ? "Reativar subsede?" : "Desativar subsede?"}
          rotulo={alternar.ativa === false ? "Reativar" : "Desativar"}
          perigo={alternar.ativa !== false}
          acao={async () => {
            await updateDoc(doc(db, `torcidas/${tid}/sedes/${alternar.id}`), { ativa: alternar.ativa === false, atualizadoEm: serverTimestamp() });
            avisar(alternar.ativa === false ? "Subsede reativada." : "Subsede desativada.", "sucesso");
          }}
        >
          {alternar.ativa === false
            ? `“${alternar.nome}” volta a aparecer para novos sócios e eventos.`
            : `“${alternar.nome}” deixa de aparecer para novos sócios e eventos. O histórico, os sócios atuais e o extrato continuam.`}
        </Confirmar>
      )}
    </div>
  );
}

function FormSede({
  sede,
  proximaOrdem,
  fechar,
  alternar,
  criada,
}: {
  sede: ComId<Sede> | "nova" | null;
  proximaOrdem: number;
  fechar: () => void;
  alternar: (s: ComId<Sede>) => void;
  /** subsede nova salva: abre o convite do responsável na sequência */
  criada: (id: string) => void;
}) {
  const { tid } = usePainel();
  const avisar = useToast();
  const existente = sede && sede !== "nova" ? sede : null;
  const [f, setF] = useState<Form>(() => formDe(existente, proximaOrdem));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Subsede nova ganha o id ao abrir: se a internet cair e a pessoa tentar de novo, não duplica.
  const novaRef = useRef<DocumentReference | null>(null);

  useEffect(() => {
    if (sede) {
      setF(formDe(existente, proximaOrdem));
      setErro(null);
      novaRef.current = sede === "nova" ? doc(collection(db, `torcidas/${tid}/sedes`)) : null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sede]);
  const set = (k: keyof Form, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar() {
    if (salvando) return;
    if (f.nome.trim().length < 2) return setErro("Dê um nome à sede.");
    setSalvando(true);
    const dados = {
      nome: f.nome.trim(),
      bairro: f.bairro.trim(),
      cidade: f.cidade.trim(),
      endereco: f.endereco.trim(),
      responsavel: f.responsavel.trim(),
      ordem: Number(f.ordem || 0),
    };
    try {
      if (existente) {
        await comPrazo(updateDoc(doc(db, `torcidas/${tid}/sedes/${existente.id}`), { ...dados, atualizadoEm: serverTimestamp() }));
        avisar("Sede atualizada.", "sucesso");
      } else {
        novaRef.current ??= doc(collection(db, `torcidas/${tid}/sedes`));
        await comPrazo(setDoc(novaRef.current, { ...dados, tipo: "subsede", ativa: true, criadoEm: serverTimestamp() }));
        avisar("Subsede criada. Agora convide o responsável.", "sucesso");
        const id = novaRef.current.id;
        fechar();
        criada(id);
        return;
      }
      fechar();
    } catch (e) {
      avisar(mensagemGravacao(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Gaveta
      aberto={!!sede}
      fechar={() => !salvando && fechar()}
      titulo={existente ? (existente.tipo === "principal" ? "Editar sede principal" : "Editar subsede") : "Nova subsede"}
      rodape={
        <div className="flex gap-2 justify-between">
          {existente && existente.tipo !== "principal" ? (
            <Botao variante="fantasma" onClick={() => alternar(existente)}>
              {existente.ativa === false ? "Reativar" : "Desativar"}
            </Botao>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Botao variante="fantasma" onClick={fechar} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={salvar} carregando={salvando} icone="check">
              Salvar
            </Botao>
          </div>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <Campo rotulo="Nome" value={f.nome} onChange={(v) => set("nome", v)} erro={erro} placeholder="Ex.: 4º Distrito · Subúrbio" maxLength={80} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo rotulo="Bairro" value={f.bairro} onChange={(v) => set("bairro", v)} maxLength={80} />
          <Campo rotulo="Cidade" value={f.cidade} onChange={(v) => set("cidade", v)} maxLength={80} />
        </div>
        <Campo rotulo="Endereço" value={f.endereco} onChange={(v) => set("endereco", v)} placeholder="Rua, número, referência" maxLength={200} />
        <Campo rotulo="Responsável" value={f.responsavel} onChange={(v) => set("responsavel", v)} placeholder="Nome de quem coordena" maxLength={80} />
        <Campo
          rotulo="Ordem"
          inputMode="numeric"
          value={f.ordem}
          onChange={(v) => set("ordem", v.replace(/\D/g, ""))}
          dica="Ordem nas listas (menor primeiro)."
          className="max-w-40"
        />
        {!existente && <p className="text-sm text-texto-3">Ao salvar, já abrimos o convite para o responsável entrar no painel da subsede.</p>}
      </form>
    </Gaveta>
  );
}

/** Atalho no cartão da subsede sem conta de recebimento: convidar o responsável (ou reenviar o convite). */
function AcessoSubsede({
  responsaveis,
  reenviando,
  convidar,
  reenviar,
}: {
  responsaveis: ComId<Membro>[];
  reenviando: string | null;
  convidar: () => void;
  reenviar: (m: ComId<Membro>) => void;
}) {
  if (responsaveis.length === 0)
    return (
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-texto-3">Ninguém tem acesso ao painel desta subsede ainda.</span>
        <Botao tamanho="sm" icone="enviar" onClick={convidar}>
          Convidar responsável
        </Botao>
      </div>
    );
  return (
    <ul className="mt-2.5 space-y-1.5">
      {responsaveis.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-texto-2 min-w-0 truncate">
            Responsável: <strong className="text-texto">{m.nome || m.email}</strong> <span className="text-texto-3">({m.email})</span>
          </span>
          <Botao tamanho="sm" variante="suave" icone="enviar" carregando={reenviando === m.id} disabled={!!reenviando && reenviando !== m.id} onClick={() => reenviar(m)}>
            Reenviar convite
          </Botao>
        </li>
      ))}
    </ul>
  );
}
