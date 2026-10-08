import { useMemo, useState, type FormEvent } from "react";
import { addDoc, collection, deleteDoc, doc, orderBy, query, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
import { useColecao } from "@/hooks/dados";
import type { ComId, Faq } from "@/lib/tipos";
import {
  Abas,
  AreaTexto,
  Aviso,
  Botao,
  BotaoIcone,
  CabecalhoPagina,
  Campo,
  Cartao,
  Carregando,
  Gaveta,
  Icone,
  Modal,
  Selecao,
  Selo,
  Vazio,
  useToast,
} from "@/ui";
import { buscarFaq, FAQ_EMBUTIDAS, PONTUACAO_MINIMA, type PublicoFaq } from "@/componentes/suporte/faqBusca";

const ROTULO_PUBLICO: Record<NonNullable<Faq["publico"]>, string> = { torcedor: "Torcedor", diretoria: "Diretoria", todos: "Todos" };

export default function FaqRobo() {
  const faqs = useColecao<Faq>(query(collection(db, "faq"), orderBy("ordem", "asc")), "faq-plataforma");
  const [editando, setEditando] = useState<ComId<Faq> | "nova" | null>(null);
  const [excluir, setExcluir] = useState<ComId<Faq> | null>(null);
  const [filtro, setFiltro] = useState<"todos" | NonNullable<Faq["publico"]>>("todos");
  const avisar = useToast();

  const lista = faqs.dados.filter((f) => filtro === "todos" || (f.publico ?? "todos") === filtro);

  const [excluindo, setExcluindo] = useState(false);
  async function confirmarExclusao() {
    if (!excluir || excluindo) return;
    setExcluindo(true);
    try {
      await deleteDoc(doc(db, "faq", excluir.id));
      avisar("Pergunta excluída.", "sucesso");
      setExcluir(null);
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="FAQ do robô"
        descricao="Perguntas frequentes que o assistente do botão de ajuda usa para responder torcedores e diretorias."
        acoes={
          <Botao tamanho="sm" icone="mais" onClick={() => setEditando("nova")}>
            Nova pergunta
          </Botao>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_400px] items-start">
        <div className="space-y-4 min-w-0">
          <div className="overflow-x-auto sem-rolagem">
            <Abas
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { valor: "todos", rotulo: "Todas", contador: faqs.dados.length },
                { valor: "torcedor", rotulo: "Torcedor" },
                { valor: "diretoria", rotulo: "Diretoria" },
              ]}
            />
          </div>
          {faqs.carregando ? (
            <Carregando />
          ) : faqs.erro ? (
            <Aviso tom="perigo">{mensagemDeErro(faqs.erro)}</Aviso>
          ) : lista.length === 0 ? (
            <Cartao>
              <Vazio icone="lista" titulo="Nenhuma pergunta cadastrada" acao={<Botao icone="mais" onClick={() => setEditando("nova")}>Nova pergunta</Botao>}>
                Enquanto a lista estiver vazia, o robô usa {FAQ_EMBUTIDAS.length} respostas embutidas.
              </Vazio>
            </Cartao>
          ) : (
            <ul className="space-y-3">
              {lista.map((f) => (
                <li key={f.id}>
                  <Cartao className="p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="text-xs text-texto-3 numeros w-6 pt-0.5">{f.ordem ?? "—"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{f.pergunta}</p>
                          <Selo tom={f.publico === "diretoria" ? "info" : f.publico === "torcedor" ? "primaria" : "neutro"}>
                            {ROTULO_PUBLICO[f.publico ?? "todos"]}
                          </Selo>
                        </div>
                        <p className="text-sm text-texto-2 mt-1.5 whitespace-pre-line">{f.resposta}</p>
                        {!!f.palavrasChave?.length && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {f.palavrasChave.map((p) => (
                              <span key={p} className="text-xs rounded-full bg-superficie-2 border border-linha px-2 py-0.5 text-texto-2">
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0">
                        <BotaoIcone icone="lapis" rotulo="Editar" onClick={() => setEditando(f)} />
                        <BotaoIcone icone="lixeira" rotulo="Excluir" onClick={() => setExcluir(f)} className="hover:text-perigo" />
                      </div>
                    </div>
                  </Cartao>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Testador faqs={faqs.dados} />
      </div>

      <EditorFaq
        key={editando === "nova" ? "nova" : editando?.id ?? "fechado"}
        faq={editando}
        proximaOrdem={Math.max(0, ...faqs.dados.map((f) => f.ordem ?? 0)) + 1}
        fechar={() => setEditando(null)}
      />
      <Modal
        aberto={!!excluir}
        fechar={() => !excluindo && setExcluir(null)}
        titulo="Excluir pergunta?"
        rodape={
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setExcluir(null)} disabled={excluindo}>
              Cancelar
            </Botao>
            <Botao variante="perigo" icone="lixeira" onClick={confirmarExclusao} carregando={excluindo}>
              Excluir
            </Botao>
          </div>
        }
      >
        <p className="text-sm">“{excluir?.pergunta}” deixará de ser usada pelo robô imediatamente.</p>
      </Modal>
    </>
  );
}

function Testador({ faqs }: { faqs: ComId<Faq>[] }) {
  const [pergunta, setPergunta] = useState("");
  const [publico, setPublico] = useState<PublicoFaq>("torcedor");
  const base = faqs.length ? faqs : FAQ_EMBUTIDAS;
  const resultado = useMemo(() => (pergunta.trim() ? buscarFaq(base, pergunta, publico) : null), [base, pergunta, publico]);
  const melhor = resultado?.[0];

  return (
    <Cartao className="p-5 sm:p-6 xl:sticky xl:top-24">
      <h2 className="font-bold flex items-center gap-2">
        <Icone nome="chat" className="size-5 text-primaria-texto" /> Testar o robô
      </h2>
      <p className="text-sm text-texto-3 mt-1 mb-4">Mesmo algoritmo do botão de ajuda (pontuação mínima {PONTUACAO_MINIMA}).</p>
      <div className="space-y-3">
        <Abas<PublicoFaq>
          valor={publico}
          onChange={setPublico}
          className="w-full"
          opcoes={[
            { valor: "torcedor", rotulo: "Como torcedor" },
            { valor: "diretoria", rotulo: "Como diretoria" },
          ]}
        />
        <Campo icone="busca" placeholder="Ex.: como recebo meu ingresso" value={pergunta} onChange={setPergunta} aria-label="Pergunta de teste" />
      </div>
      {resultado && (
        <div className="mt-4 space-y-3">
          {melhor ? (
            <div className="rounded-2xl bg-superficie-2 border border-linha p-4">
              <p className="text-xs text-texto-3 mb-1">O robô responderia ({melhor.pontos} pts):</p>
              <p className="font-semibold text-sm">{melhor.faq.pergunta}</p>
              <p className="text-sm text-texto-2 mt-1">{melhor.faq.resposta}</p>
              {melhor.motivos.length > 0 && <p className="text-xs text-texto-3 mt-2">Por quê: {melhor.motivos.join(", ")}</p>}
            </div>
          ) : (
            <Aviso tom="alerta" titulo="Nenhuma FAQ pontuou">
              O robô ofereceria falar com a equipe. Considere adicionar palavras-chave.
            </Aviso>
          )}
          {resultado.length > 1 && (
            <div>
              <p className="text-xs text-texto-3 mb-1.5">Outras candidatas</p>
              <ul className="space-y-1 text-sm">
                {resultado.slice(1, 5).map((r) => (
                  <li key={r.faq.id} className="flex justify-between gap-3">
                    <span className="truncate text-texto-2">{r.faq.pergunta}</span>
                    <span className="numeros text-texto-3 shrink-0">{r.pontos}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!faqs.length && <p className="text-xs text-texto-3">Usando as respostas embutidas (coleção vazia).</p>}
        </div>
      )}
    </Cartao>
  );
}

function EditorFaq({ faq, proximaOrdem, fechar }: { faq: ComId<Faq> | "nova" | null; proximaOrdem: number; fechar: () => void }) {
  const atual = faq && faq !== "nova" ? faq : null;
  const [pergunta, setPergunta] = useState(atual?.pergunta ?? "");
  const [resposta, setResposta] = useState(atual?.resposta ?? "");
  const [chaves, setChaves] = useState((atual?.palavrasChave ?? []).join(", "));
  const [publico, setPublico] = useState<NonNullable<Faq["publico"]>>(atual?.publico ?? "todos");
  const [ordem, setOrdem] = useState(String(atual?.ordem ?? proximaOrdem));
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const avisar = useToast();

  const erros = {
    pergunta: pergunta.trim().length < 5 ? "Escreva a pergunta." : null,
    resposta: resposta.trim().length < 5 ? "Escreva a resposta." : null,
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (erros.pergunta || erros.resposta) return;
    const dados: Faq = {
      pergunta: pergunta.trim(),
      resposta: resposta.trim(),
      palavrasChave: [...new Set(chaves.split(/[,;\n]/).map((c) => c.trim().toLowerCase()).filter(Boolean))].slice(0, 30),
      publico,
      ordem: Number.parseInt(ordem, 10) || 0,
    };
    setSalvando(true);
    try {
      if (atual) await setDoc(doc(db, "faq", atual.id), dados);
      else await addDoc(collection(db, "faq"), dados);
      avisar("Pergunta salva.", "sucesso");
      fechar();
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Gaveta
      aberto={!!faq}
      fechar={fechar}
      titulo={atual ? "Editar pergunta" : "Nova pergunta"}
      rodape={
        <Botao type="submit" form="form-faq" largo carregando={salvando} icone="check">
          Salvar
        </Botao>
      }
    >
      <form id="form-faq" onSubmit={salvar} className="space-y-5" noValidate>
        <Campo rotulo="Pergunta" value={pergunta} onChange={setPergunta} erro={tentou && erros.pergunta} maxLength={200} autoFocus={window.matchMedia("(pointer: fine)").matches} />
        <AreaTexto rotulo="Resposta" value={resposta} onChange={(e) => setResposta(e.target.value)} erro={tentou && erros.resposta} maxLength={2000} rows={6} />
        <Campo
          rotulo="Palavras-chave"
          value={chaves}
          onChange={setChaves}
          dica="Separe por vírgula. Valem 3 pontos cada; acentos e plurais são ignorados. Ex.: ingresso, qr, link"
        />
        <div className="grid grid-cols-2 gap-4">
          <Selecao rotulo="Público" value={publico} onChange={(e) => setPublico(e.target.value as NonNullable<Faq["publico"]>)}>
            <option value="todos">Todos</option>
            <option value="torcedor">Torcedor e sócio</option>
            <option value="diretoria">Diretoria</option>
          </Selecao>
          <Campo rotulo="Ordem" inputMode="numeric" value={ordem} onChange={(v) => setOrdem(v.replace(/[^\d]/g, "").slice(0, 4))} dica="Menor aparece primeiro" />
        </div>
      </form>
    </Gaveta>
  );
}
