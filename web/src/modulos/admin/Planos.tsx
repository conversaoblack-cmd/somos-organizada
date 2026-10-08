import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
import { centavosDeTexto, moeda, periodicidade, periodicidadeCurta, taxa } from "@/lib/formatos";
import type { ComId, Intervalo, Plano } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { AreaTexto, Aviso, Botao, BotaoIcone, CabecalhoPagina, Campo, Cartao, cx, Gaveta, Icone, Interruptor, Selecao, Selo, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { Confirmar, EstadoLista, textoMoeda } from "./util";

interface Form {
  nome: string;
  descricao: string;
  valor: string;
  intervalo: Intervalo;
  intervaloQtd: number;
  beneficios: string[];
  pix: boolean;
  cartao: boolean;
  ativo: boolean;
  destaque: boolean;
  ordem: string;
}

const ATALHOS: { rotulo: string; intervalo: Intervalo; qtd: number }[] = [
  { rotulo: "Mensal", intervalo: "mes", qtd: 1 },
  { rotulo: "Trimestral", intervalo: "mes", qtd: 3 },
  { rotulo: "Semestral", intervalo: "mes", qtd: 6 },
  { rotulo: "Anual", intervalo: "ano", qtd: 1 },
];

const MODELOS: (Partial<Form> & { nome: string })[] = [
  {
    nome: "Sócio Mensal",
    descricao: "O jeito mais fácil de fazer parte.",
    valor: "10,00",
    intervalo: "mes",
    intervaloQtd: 1,
    destaque: true,
    beneficios: ["Preço de sócio em todos os eventos", "Carteirinha digital com QR Code", "Prioridade nas caravanas", "Voto nas assembleias"],
  },
  {
    nome: "Sócio Anual",
    descricao: "12 meses pelo preço de 10.",
    valor: "100,00",
    intervalo: "ano",
    intervaloQtd: 1,
    beneficios: ["Tudo do plano mensal", "2 meses grátis", "Kit de boas-vindas"],
  },
  {
    nome: "Sócio Mirim",
    descricao: "Para a nova geração da arquibancada (até 12 anos).",
    valor: "5,00",
    intervalo: "mes",
    intervaloQtd: 1,
    beneficios: ["Carteirinha digital", "Preço de sócio nos eventos família"],
  },
];

function formDe(p: ComId<Plano> | null, ordem: number): Form {
  return {
    nome: p?.nome ?? "",
    descricao: p?.descricao ?? "",
    valor: p ? textoMoeda(p.valor) : "",
    intervalo: p?.intervalo ?? "mes",
    intervaloQtd: p?.intervaloQtd ?? 1,
    beneficios: p?.beneficios?.length ? [...p.beneficios] : [""],
    pix: p?.pix ?? true,
    cartao: p?.cartao ?? true,
    ativo: p?.ativo ?? true,
    destaque: p?.destaque ?? false,
    ordem: String(p?.ordem ?? ordem),
  };
}

export default function Planos() {
  const { tid, pct } = usePainel();
  const planos = useColecao<Plano>(collection(db, `torcidas/${tid}/planos`), `planos-${tid}`);
  const [editando, setEditando] = useState<ComId<Plano> | "novo" | null>(null);
  useTourPagina("planos");
  const ordenados = useMemo(
    () => [...planos.dados].sort((a, b) => Number(b.ativo) - Number(a.ativo) || (a.ordem ?? 99) - (b.ordem ?? 99) || a.valor - b.valor),
    [planos.dados],
  );
  const proximaOrdem = Math.max(0, ...planos.dados.map((p) => p.ordem ?? 0)) + 1;

  return (
    <div>
      <CabecalhoPagina
        titulo="Planos de sócio"
        descricao={`Os planos que aparecem na aba Sócios da página. O torcedor paga o valor + ${pct}% de taxa de serviço.`}
        acoes={
          <Botao icone="mais" onClick={() => setEditando("novo")} data-tour="novo-plano">
            Novo plano
          </Botao>
        }
      />

      {planos.carregando || planos.erro || ordenados.length === 0 ? (
        <EstadoLista
          carregando={planos.carregando}
          erro={planos.erro}
          vazio
          icone="estrela"
          tituloVazio="Nenhum plano ainda"
          textoVazio="Crie pelo menos um plano para começar a receber sócios. Dá para começar com um modelo pronto."
          acaoVazio={
            <Botao icone="mais" onClick={() => setEditando("novo")}>
              Criar primeiro plano
            </Botao>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-tour="lista-planos">
          {ordenados.map((p) => (
            <Cartao key={p.id} className={cx("p-5 sm:p-6 flex flex-col relative", p.destaque && p.ativo && "border-primaria/50 ring-1 ring-primaria/30", !p.ativo && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {p.destaque && <Selo tom="primaria">Destaque</Selo>}
                  {!p.ativo && <Selo>Desativado</Selo>}
                  {p.pix && <Selo>Pix</Selo>}
                  {p.cartao && <Selo>Cartão</Selo>}
                </div>
                <BotaoIcone icone="lapis" rotulo={`Editar ${p.nome}`} onClick={() => setEditando(p)} className="-mt-2 -mr-2" />
              </div>
              <h2 className="text-xl font-bold mt-3">{p.nome}</h2>
              {p.descricao && <p className="text-sm text-texto-2 mt-1">{p.descricao}</p>}
              <p className="mt-4">
                <span className="text-3xl font-bold numeros">{moeda(p.valor)}</span>
                <span className="text-texto-3 text-sm"> {periodicidadeCurta(p.intervalo, p.intervaloQtd)}</span>
              </p>
              <p className="text-xs text-texto-3 numeros">
                Torcedor paga {moeda(p.valor + taxa(p.valor, pct))} {periodicidade(p.intervalo, p.intervaloQtd)}
              </p>
              {!!p.beneficios?.length && (
                <ul className="mt-4 space-y-2 text-sm">
                  {p.beneficios.map((b) => (
                    <li key={b} className="flex gap-2">
                      <Icone nome="check" className="size-4 text-primaria-texto shrink-0 mt-0.5" />
                      <span className="text-texto-2">{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          ))}
        </div>
      )}

      <FormPlano plano={editando} proximaOrdem={proximaOrdem} fechar={() => setEditando(null)} />
    </div>
  );
}

function FormPlano({ plano, proximaOrdem, fechar }: { plano: ComId<Plano> | "novo" | null; proximaOrdem: number; fechar: () => void }) {
  const { tid, pct } = usePainel();
  const avisar = useToast();
  const existente = plano && plano !== "novo" ? plano : null;
  const [f, setF] = useState<Form>(() => formDe(existente, proximaOrdem));
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const [confirmarDesativar, setConfirmarDesativar] = useState(false);

  useEffect(() => {
    if (plano) {
      setF(formDe(existente, proximaOrdem));
      setErros({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plano]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const valor = centavosDeTexto(f.valor || "0");

  function validar() {
    const e: Partial<Record<keyof Form, string>> = {};
    if (f.nome.trim().length < 2) e.nome = "Dê um nome ao plano.";
    if (valor < 100) e.valor = "O valor mínimo é R$ 1,00.";
    if (!Number.isInteger(f.intervaloQtd) || f.intervaloQtd < 1 || f.intervaloQtd > 12) e.intervaloQtd = "Entre 1 e 12.";
    if (!f.pix && !f.cartao) e.pix = "Aceite ao menos uma forma de pagamento.";
    if (f.ordem && !/^\d+$/.test(f.ordem)) e.ordem = "Use um número.";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function pedirSalvar() {
    if (!validar()) return;
    if (existente?.ativo && !f.ativo) return setConfirmarDesativar(true);
    void salvar();
  }

  async function salvar() {
    setSalvando(true);
    const dados = {
      nome: f.nome.trim(),
      descricao: f.descricao.trim(),
      valor,
      intervalo: f.intervalo,
      intervaloQtd: f.intervaloQtd,
      beneficios: f.beneficios.map((b) => b.trim()).filter(Boolean),
      pix: f.pix,
      cartao: f.cartao,
      ativo: f.ativo,
      destaque: f.destaque,
      ordem: Number(f.ordem || 0),
    };
    try {
      if (existente) {
        await updateDoc(doc(db, `torcidas/${tid}/planos/${existente.id}`), { ...dados, atualizadoEm: serverTimestamp() });
        avisar("Plano atualizado.", "sucesso");
      } else {
        await addDoc(collection(db, `torcidas/${tid}/planos`), { ...dados, criadoEm: serverTimestamp() });
        avisar("Plano criado.", "sucesso");
      }
      fechar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  const atalhoAtual = ATALHOS.find((a) => a.intervalo === f.intervalo && a.qtd === f.intervaloQtd);

  return (
    <Gaveta
      aberto={!!plano}
      fechar={() => !salvando && fechar()}
      titulo={existente ? "Editar plano" : "Novo plano"}
      rodape={
        <div className="flex gap-2 justify-end">
          <Botao variante="fantasma" onClick={fechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao onClick={pedirSalvar} carregando={salvando} icone="check">
            {existente ? "Salvar plano" : "Criar plano"}
          </Botao>
        </div>
      }
    >
      <div className="space-y-5">
        {!existente && (
          <div>
            <p className="text-sm font-medium text-texto-2 mb-2">Começar com um modelo</p>
            <div className="flex flex-wrap gap-2">
              {MODELOS.map((m) => (
                <button
                  key={m.nome}
                  type="button"
                  onClick={() => setF((x) => ({ ...x, ...m, beneficios: [...(m.beneficios ?? [])] }))}
                  className="h-9 px-3.5 rounded-xl border border-linha bg-superficie-2 hover:border-linha-forte text-sm font-semibold"
                >
                  {m.nome}
                </button>
              ))}
            </div>
          </div>
        )}

        <Campo rotulo="Nome do plano" value={f.nome} onChange={(v) => set("nome", v)} erro={erros.nome} maxLength={60} placeholder="Ex.: Sócio Mensal" />
        <AreaTexto rotulo="Descrição curta" value={f.descricao} onChange={(e) => set("descricao", e.target.value)} maxLength={300} className="[&_textarea]:min-h-20" />

        <div>
          <p className="block text-sm font-medium text-texto-2 mb-1.5">Cobrança</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {ATALHOS.map((a) => (
              <button
                key={a.rotulo}
                type="button"
                onClick={() => setF((x) => ({ ...x, intervalo: a.intervalo, intervaloQtd: a.qtd }))}
                className={cx(
                  "h-11 rounded-2xl border text-sm font-semibold transition-colors",
                  atalhoAtual === a ? "border-primaria bg-primaria/10 ring-1 ring-primaria" : "border-linha bg-superficie-2 text-texto-2 hover:border-linha-forte",
                )}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Selecao rotulo="A cada" value={String(f.intervaloQtd)} onChange={(e) => set("intervaloQtd", Number(e.target.value))} erro={erros.intervaloQtd}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Selecao>
            <Selecao rotulo="Período" value={f.intervalo} onChange={(e) => set("intervalo", e.target.value as Intervalo)}>
              <option value="mes">{f.intervaloQtd === 1 ? "mês" : "meses"}</option>
              <option value="ano">{f.intervaloQtd === 1 ? "ano" : "anos"}</option>
            </Selecao>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-start">
          <Campo rotulo="Valor do plano" mascara="moeda" value={f.valor} onChange={(v) => set("valor", v)} erro={erros.valor} placeholder="0,00" />
          <div className="rounded-2xl border border-linha bg-superficie p-4 sm:mt-7">
            <p className="text-xs text-texto-3">Torcedor paga</p>
            <p className="text-xl font-bold numeros">
              {moeda(valor + taxa(valor, pct))} <span className="text-sm font-normal text-texto-3">{periodicidade(f.intervalo, f.intervaloQtd)}</span>
            </p>
            <p className="text-xs text-texto-3 numeros">
              {moeda(valor)} + {moeda(taxa(valor, pct))} de taxa ({pct}%)
            </p>
          </div>
        </div>
        {existente && valor !== existente.valor && (
          <Aviso tom="alerta">O novo valor vale para novas adesões e próximas cobranças por Pix. Assinaturas no cartão já criadas mantêm o valor antigo.</Aviso>
        )}

        <div>
          <p className="block text-sm font-medium text-texto-2 mb-1.5">Benefícios</p>
          <div className="space-y-2">
            {f.beneficios.map((b, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Campo
                  value={b}
                  onChange={(v) => set("beneficios", f.beneficios.map((x, j) => (j === i ? v : x)))}
                  placeholder="Ex.: Preço de sócio nos eventos"
                  maxLength={120}
                  className="flex-1"
                  aria-label={`Benefício ${i + 1}`}
                />
                <BotaoIcone
                  icone="chevronBaixo"
                  rotulo="Subir"
                  className="rotate-180"
                  disabled={i === 0}
                  onClick={() => {
                    const l = [...f.beneficios];
                    [l[i - 1], l[i]] = [l[i]!, l[i - 1]!];
                    set("beneficios", l);
                  }}
                />
                <BotaoIcone icone="lixeira" rotulo="Remover benefício" onClick={() => set("beneficios", f.beneficios.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
          <Botao tamanho="sm" variante="suave" icone="mais" className="mt-2" onClick={() => set("beneficios", [...f.beneficios, ""])} disabled={f.beneficios.length >= 12}>
            Adicionar benefício
          </Botao>
        </div>

        <Cartao className="p-4 space-y-4">
          <Interruptor ligado={f.pix} onChange={(v) => set("pix", v)} rotulo="Aceita Pix" descricao="O sócio paga cada período por Pix." />
          <Interruptor ligado={f.cartao} onChange={(v) => set("cartao", v)} rotulo="Aceita cartão" descricao="Cobrança automática no cartão de crédito." />
          {erros.pix && <p className="text-xs text-perigo">{erros.pix}</p>}
        </Cartao>
        <Cartao className="p-4 space-y-4">
          <Interruptor ligado={f.ativo} onChange={(v) => set("ativo", v)} rotulo="Plano ativo" descricao="Desativado não aparece para novas adesões. Os sócios atuais continuam." />
          <Interruptor ligado={f.destaque} onChange={(v) => set("destaque", v)} rotulo="Destacar" descricao="Aparece com selo de recomendado na página." />
        </Cartao>
        <Campo
          rotulo="Ordem de exibição"
          inputMode="numeric"
          value={f.ordem}
          onChange={(v) => set("ordem", v.replace(/\D/g, ""))}
          erro={erros.ordem}
          dica="Menor aparece primeiro."
          className="max-w-40"
        />
      </div>

      <Confirmar
        aberto={confirmarDesativar}
        fechar={() => setConfirmarDesativar(false)}
        titulo="Desativar plano?"
        rotulo="Desativar"
        perigo
        acao={salvar}
      >
        O plano “{f.nome}” deixa de aparecer para novas adesões. Os sócios que já estão nele continuam normalmente. Planos não são excluídos para não perder o histórico.
      </Confirmar>
    </Gaveta>
  );
}
