import { useEffect, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, mensagemDeErro } from "@/lib/api";
import type { ComId, Sede } from "@/lib/tipos";
import { Botao, BotaoIcone, CabecalhoPagina, Campo, Cartao, cx, Gaveta, Icone, Selo, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { Confirmar, EstadoLista } from "./util";
import { infoRecebedor, nomeBanco, SeloRecebedor } from "./recebedor";

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
  const { tid, sedes } = usePainel();
  const avisar = useToast();
  const [editando, setEditando] = useState<ComId<Sede> | "nova" | null>(null);
  const [alternar, setAlternar] = useState<ComId<Sede> | null>(null);
  const [atualizando, setAtualizando] = useState<string | null>(null);

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
  const proximaOrdem = Math.max(0, ...sedes.map((s) => s.ordem ?? 0)) + 1;
  const principal = sedes.find((s) => s.tipo === "principal");
  const subsedes = sedes.filter((s) => s.tipo !== "principal");

  const item = (s: ComId<Sede>) => (
    <Cartao key={s.id} className={cx("p-4 sm:p-5 flex items-start gap-4", s.ativa === false && "opacity-60")}>
      <span className={cx("size-11 shrink-0 rounded-2xl grid place-items-center", s.tipo === "principal" ? "bg-primaria/15 text-primaria" : "bg-superficie-2 text-texto-2")}>
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
                  ? `${s.recebedor.nomeTitular} · ${nomeBanco(s.recebedor.banco.codigo)} · ag. ${s.recebedor.banco.agencia} · conta ${s.recebedor.banco.conta}`
                  : "O responsável cadastra pelo painel da subsede, em Recebimentos. Sem ela, os eventos da subsede não podem ser publicados."}
              </p>
            </div>
            {s.recebedor && (
              <Botao tamanho="sm" variante="fantasma" icone="atualizar" className="shrink-0" carregando={atualizando === s.id} onClick={() => atualizarRecebedor(s.id)}>
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
        descricao="A sede principal fica com a taxa de serviço. Cada subsede recebe o valor dos próprios eventos direto na conta de recebimento dela (split) e, se configurado, as mensalidades dos seus sócios."
        acoes={
          <Botao icone="mais" onClick={() => setEditando("nova")}>
            Nova subsede
          </Botao>
        }
      />
      {sedes.length === 0 ? (
        <EstadoLista carregando={false} erro={null} vazio icone="casa" tituloVazio="Nenhuma sede cadastrada" />
      ) : (
        <div className="space-y-6">
          {principal && <div className="grid grid-cols-1 gap-3">{item(principal)}</div>}
          <section>
            <h2 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-3">Subsedes ({subsedes.length})</h2>
            {subsedes.length ? (
              <div className="grid grid-cols-1 gap-3">{subsedes.map(item)}</div>
            ) : (
              <Cartao className="p-5 text-sm text-texto-2">Nenhuma subsede ainda. Crie distritos, bairros ou cidades onde a torcida tem núcleo.</Cartao>
            )}
          </section>
        </div>
      )}

      <FormSede sede={editando} proximaOrdem={proximaOrdem} fechar={() => setEditando(null)} alternar={(s) => setAlternar(s)} />

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
}: {
  sede: ComId<Sede> | "nova" | null;
  proximaOrdem: number;
  fechar: () => void;
  alternar: (s: ComId<Sede>) => void;
}) {
  const { tid } = usePainel();
  const avisar = useToast();
  const existente = sede && sede !== "nova" ? sede : null;
  const [f, setF] = useState<Form>(() => formDe(existente, proximaOrdem));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (sede) {
      setF(formDe(existente, proximaOrdem));
      setErro(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sede]);
  const set = (k: keyof Form, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar() {
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
        await updateDoc(doc(db, `torcidas/${tid}/sedes/${existente.id}`), { ...dados, atualizadoEm: serverTimestamp() });
        avisar("Sede atualizada.", "sucesso");
      } else {
        await addDoc(collection(db, `torcidas/${tid}/sedes`), { ...dados, tipo: "subsede", ativa: true, criadoEm: serverTimestamp() });
        avisar("Subsede criada.", "sucesso");
      }
      fechar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
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
        {!existente && <p className="text-sm text-texto-3">Para dar acesso ao coordenador, convide-o em “Usuários do painel” com o papel Subsede.</p>}
      </form>
    </Gaveta>
  );
}
