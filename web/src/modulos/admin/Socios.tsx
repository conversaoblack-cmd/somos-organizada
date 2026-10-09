import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { collection, getDocs, limit, orderBy, query, where, type QueryConstraint } from "firebase/firestore";
import { getDownloadURL, ref as refStorage } from "firebase/storage";
import { db } from "@/lib/firebase";
import { storage } from "@/lib/armazenamento";
import { api, mensagemDeErro } from "@/lib/api";
import {
  dataCurta,
  dataHora,
  mascaraCep,
  mascaraCpf,
  mascaraTelefone,
  moeda,
  periodicidade,
  ROTULO_STATUS_SOCIO,
  soDigitos,
  TOM_STATUS_SOCIO,
} from "@/lib/formatos";
import type { ComId, Membro, Socio, StatusSocio } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { Avatar, Aviso, Botao, CabecalhoPagina, Campo, Cartao, Gaveta, Icone, Selecao, Selo, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { baixarCsv, CarregarMais, Confirmar, contarNoServidor, decimalBR, EstadoLista, Linha, LOTE, normalizar, numero, numeroWhatsapp, Pilulas, useAgregado } from "./util";

const STATUS: StatusSocio[] = ["ativo", "em_analise", "inadimplente", "pendente_pagamento", "suspenso", "cancelado"];
type Acao = "aprovar" | "suspender" | "reativar" | "cancelar";

/** Busca que vai ao servidor: só números (CPF ou matrícula), a partir de 3 dígitos. */
function digitosDaBusca(busca: string): string | null {
  const t = busca.trim();
  const dig = soDigitos(t);
  return dig.length >= 3 && /^[\d.\-\s/]+$/.test(t) ? dig : null;
}

/** Espera a pessoa parar de digitar antes de consultar o servidor. */
function useAtrasado<T>(valor: T, ms = 400): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export default function Socios() {
  const { tid, ehDiretoria, sedeEscopo, sedes, nomeSede } = usePainel();
  const avisar = useToast();
  const [params] = useSearchParams();
  const inicial = params.get("status") as StatusSocio | null;
  const [status, setStatus] = useState<"todos" | StatusSocio>(inicial && STATUS.includes(inicial) ? inicial : "todos");
  const [sede, setSede] = useState("");
  const [busca, setBusca] = useState("");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  // Torcida grande tem milhares de sócios: lê 100 por vez (do cadastro mais recente para o mais antigo).
  const [qtd, setQtd] = useState(LOTE);
  useEffect(() => setQtd(LOTE), [status, sede]);
  useTourPagina("socios");

  const caminho = `torcidas/${tid}/socios`;
  // Subsede só enxerga a própria sede (as regras exigem o filtro); a diretoria pode filtrar por uma sede.
  const sedeFiltro = ehDiretoria ? sede : sedeEscopo;
  const podeLer = ehDiretoria || !!sedeEscopo;
  const filtrosServidor = (): QueryConstraint[] => [
    ...(sedeFiltro ? [where("sedeId", "==", sedeFiltro)] : []),
    ...(status !== "todos" ? [where("status", "==", status)] : []),
  ];

  const socios = useColecao<Socio>(
    podeLer ? query(collection(db, caminho), ...filtrosServidor(), orderBy("criadoEm", "desc"), limit(qtd)) : null,
    `socios-${tid}-${sedeFiltro || "todas"}-${status}-${qtd}`,
  );
  // Veio a página cheia: pode haver sócios mais antigos ainda não carregados.
  const temMais = socios.dados.length >= qtd;
  const carregandoMais = socios.carregando && socios.dados.length > 0;

  // CPF ou matrícula: procura no servidor entre todos os sócios (não só nos carregados).
  const digitos = useAtrasado(digitosDaBusca(busca));
  const daSede = !ehDiretoria && sedeEscopo ? [where("sedeId", "==", sedeEscopo)] : [];
  const porCpf = useColecao<Socio>(
    podeLer && digitos ? query(collection(db, caminho), ...daSede, where("cpf", ">=", digitos), where("cpf", "<=", `${digitos}\uf8ff`), orderBy("cpf"), limit(30)) : null,
    `socios-cpf-${tid}-${sedeEscopo ?? "todas"}-${digitos}`,
  );
  const porMatricula = useColecao<Socio>(
    podeLer && digitos && digitos.length <= 6 ? query(collection(db, caminho), ...daSede, where("matricula", "==", digitos.padStart(6, "0")), limit(5)) : null,
    `socios-mat-${tid}-${sedeEscopo ?? "todas"}-${digitos}`,
  );
  const buscaNoServidor = !!digitos && digitos === digitosDaBusca(busca);

  // Contadores das pílulas: contados no servidor (custa 1 leitura a cada 1.000 sócios), não na lista carregada.
  const contagem = useAgregado<Record<string, number>>(
    podeLer
      ? async () => {
          const daSedeFiltro = sedeFiltro ? [where("sedeId", "==", sedeFiltro)] : [];
          const valores = await Promise.all([
            contarNoServidor(caminho, ...daSedeFiltro),
            ...STATUS.map((st) => contarNoServidor(caminho, ...daSedeFiltro, where("status", "==", st))),
          ]);
          return Object.fromEntries([["todos", valores[0]!], ...STATUS.map((st, i) => [st, valores[i + 1]!])]);
        }
      : null,
    // refaz quando chega sócio novo ou muda a situação de alguém da lista
    `contagem-socios-${tid}-${sedeFiltro || "todas"}-${socios.dados[0]?.id ?? ""}-${socios.dados.slice(0, LOTE).map((s) => s.status).join(",")}`,
  );

  const filtrar = useMemo(() => {
    const b = normalizar(busca.trim());
    const dig = soDigitos(busca);
    return (lista: ComId<Socio>[]) =>
      lista.filter((s) => {
        if (status !== "todos" && s.status !== status) return false;
        if (sedeFiltro && s.sedeId !== sedeFiltro) return false;
        if (!b) return true;
        return normalizar(`${s.nome} ${s.email} ${s.matricula ?? ""}`).includes(b) || (dig.length >= 3 && (s.cpf.includes(dig) || (s.matricula ?? "").includes(dig)));
      });
  }, [busca, status, sedeFiltro]);

  const filtrados = useMemo(() => {
    if (!buscaNoServidor) return filtrar(socios.dados);
    const vistos = new Set<string>();
    return filtrar([...porMatricula.dados, ...porCpf.dados]).filter((s) => !vistos.has(s.id) && !!vistos.add(s.id));
  }, [buscaNoServidor, filtrar, socios.dados, porCpf.dados, porMatricula.dados]);

  const lista = buscaNoServidor ? { carregando: porCpf.carregando || porMatricula.carregando, erro: porCpf.erro || porMatricula.erro, semConexao: porCpf.semConexao } : socios;
  const aberto = abertoId ? (filtrados.find((s) => s.id === abertoId) ?? socios.dados.find((s) => s.id === abertoId) ?? null) : null;
  const buscaLocal = !!busca.trim() && !buscaNoServidor;

  // Planilha: lê todos os sócios com os filtros só na hora de baixar (não a cada vez que a tela abre).
  async function exportar() {
    if (!podeLer) return;
    setBaixando(true);
    try {
      const snap = await getDocs(query(collection(db, caminho), ...filtrosServidor()));
      const todos = filtrar(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Socio) }))).sort((a, b) => (b.criadoEm?.toMillis() ?? 0) - (a.criadoEm?.toMillis() ?? 0));
      if (!todos.length) {
        avisar("Nenhum sócio com esses filtros.", "info");
        return;
      }
      baixarCsv(
        `socios-${new Date().toISOString().slice(0, 10)}`,
        ["Matrícula", "Nome", "CPF", "E-mail", "Telefone", "Nascimento", "Plano", "Valor", "Forma de pagamento", "Situação", "Válido até", "Sede", "Cidade", "UF", "Cadastro"],
        todos.map((s) => [
          s.matricula ?? "",
          s.nome,
          mascaraCpf(s.cpf),
          s.email,
          mascaraTelefone(s.telefone ?? ""),
          s.nascimento ? s.nascimento.split("-").reverse().join("/") : "",
          s.planoNome,
          decimalBR(s.valorPlano),
          s.metodo === "pix" ? "Pix" : "Cartão",
          ROTULO_STATUS_SOCIO[s.status],
          s.validoAte ? dataCurta(s.validoAte) : "",
          nomeSede(s.sedeId),
          s.endereco?.cidade ?? "",
          s.endereco?.uf ?? "",
          dataCurta(s.criadoEm),
        ]),
      );
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setBaixando(false);
    }
  }

  const contador = (k: string) => contagem.dados?.[k];

  return (
    <div>
      <CabecalhoPagina
        titulo="Sócios"
        descricao={ehDiretoria ? "Todos os sócios da torcida, do cadastro mais recente para o mais antigo." : `Sócios da ${nomeSede(sedeEscopo)}.`}
        acoes={
          <Botao variante="contorno" tamanho="sm" icone="download" onClick={exportar} carregando={baixando} disabled={!podeLer || (!socios.dados.length && !socios.carregando)} data-tour="socios-exportar">
            Baixar planilha
          </Botao>
        }
      />

      <div className="flex flex-col gap-3 mb-5">
        <div data-tour="socios-status">
        <Pilulas
          valor={status}
          onChange={setStatus}
          opcoes={[
            { valor: "todos" as const, rotulo: "Todos", contador: contador("todos") },
            ...STATUS.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_SOCIO[s], contador: contador(s) })),
          ]}
        />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_260px]" data-tour="socios-busca">
          <Campo value={busca} onChange={setBusca} placeholder="Nome, CPF, matrícula ou e-mail" icone="busca" aria-label="Buscar sócios" />
          {ehDiretoria && (
            <Selecao value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Filtrar por sede">
              <option value="">Todas as sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Selecao>
          )}
        </div>
      </div>

      {buscaLocal && temMais && !socios.erro && (
        <Aviso tom="info" className="mb-4">
          A busca por nome ou e-mail olha só os {numero(socios.dados.length)} sócios já carregados. Para achar qualquer sócio, busque pelo CPF ou pela
          matrícula (só números).
        </Aviso>
      )}

      {(lista.carregando && !filtrados.length) || lista.erro || filtrados.length === 0 ? (
        <>
          <EstadoLista
            carregando={lista.carregando && !filtrados.length}
            erro={lista.erro}
            semConexao={lista.semConexao}
            vazio
            icone="usuarios"
            tituloVazio={socios.dados.length || busca.trim() || status !== "todos" || sede ? "Nenhum sócio com esses filtros" : "Nenhum sócio ainda"}
            textoVazio={
              socios.dados.length || busca.trim() || status !== "todos" || sede
                ? buscaNoServidor
                  ? "Confira os números do CPF ou da matrícula."
                  : "Mude os filtros ou a busca."
                : "Divulgue a página da torcida (aba Sócios) para receber as primeiras adesões."
            }
          />
          {!buscaNoServidor && temMais && !socios.erro && <CarregarMais rotulo="Carregar mais sócios" carregando={carregandoMais} mais={() => setQtd((n) => n + LOTE)} />}
        </>
      ) : (
        <div data-tour="socios-lista">
          <p className="text-sm text-texto-3 mb-3 numeros">
            {buscaNoServidor
              ? `${numero(filtrados.length)} ${filtrados.length === 1 ? "sócio encontrado" : "sócios encontrados"}`
              : `${numero(filtrados.length)} ${filtrados.length === 1 ? "sócio" : "sócios"}${temMais ? " · há cadastros mais antigos" : ""}`}
          </p>
          <Cartao className="hidden md:block overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-texto-3 text-xs uppercase tracking-wide">
                <tr className="border-b border-linha">
                  <th className="px-4 py-3 font-semibold">Sócio</th>
                  <th className="px-4 py-3 font-semibold">Matrícula</th>
                  <th className="px-4 py-3 font-semibold">Plano</th>
                  {ehDiretoria && <th className="px-4 py-3 font-semibold">Sede</th>}
                  <th className="px-4 py-3 font-semibold">Válido até</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((s) => (
                  <tr key={s.id} onClick={() => setAbertoId(s.id)} className="border-b border-linha last:border-0 hover:bg-superficie-2 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar nome={s.nome} tamanho="size-9" />
                        <div className="min-w-0">
                          {/* botão de verdade na primeira célula: abre a ficha pelo teclado e leitor de tela */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAbertoId(s.id);
                            }}
                            className="block max-w-full font-medium truncate text-left hover:underline focus-visible:outline-2 focus-visible:outline-primaria-texto rounded"
                          >
                            {s.nome}
                          </button>
                          <p className="text-xs text-texto-3 truncate">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 numeros text-texto-2">{s.matricula ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p>{s.planoNome}</p>
                      <p className="text-xs text-texto-3">{s.metodo === "pix" ? "Pix" : "Cartão"}</p>
                    </td>
                    {ehDiretoria && <td className="px-4 py-3 text-texto-2 max-w-48 truncate">{nomeSede(s.sedeId)}</td>}
                    <td className="px-4 py-3 text-texto-2 numeros">{s.validoAte ? dataCurta(s.validoAte) : "—"}</td>
                    <td className="px-4 py-3">
                      <Selo tom={TOM_STATUS_SOCIO[s.status]} ponto>
                        {ROTULO_STATUS_SOCIO[s.status]}
                      </Selo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
          <div className="md:hidden grid grid-cols-1 gap-2">
            {filtrados.map((s) => (
              <button key={s.id} type="button" onClick={() => setAbertoId(s.id)} className="text-left min-w-0 w-full">
                <Cartao className="p-4 flex items-center gap-3 active:bg-superficie-2">
                  <Avatar nome={s.nome} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{s.nome}</p>
                    <p className="text-xs text-texto-3 truncate">
                      {s.matricula ? `Nº ${s.matricula} · ` : ""}
                      {s.planoNome}
                    </p>
                  </div>
                  <Selo tom={TOM_STATUS_SOCIO[s.status]}>{ROTULO_STATUS_SOCIO[s.status]}</Selo>
                </Cartao>
              </button>
            ))}
          </div>
          {!buscaNoServidor && temMais && <CarregarMais rotulo="Carregar mais sócios" carregando={carregandoMais} mais={() => setQtd((n) => n + LOTE)} />}
        </div>
      )}

      <DetalheSocio s={aberto} fechar={() => setAbertoId(null)} />
    </div>
  );
}

const TEXTO_ACAO: Record<Acao, { titulo: string; rotulo: string; texto: string; perigo?: boolean }> = {
  aprovar: { titulo: "Aprovar sócio?", rotulo: "Aprovar", texto: "O sócio passa a ter carteirinha válida e preço de sócio nos eventos." },
  suspender: {
    titulo: "Suspender sócio?",
    rotulo: "Suspender",
    texto: "A carteirinha deixa de valer e ele perde o preço de sócio até ser reativado. Enquanto estiver suspenso, o sistema não gera novas cobranças.",
    perigo: true,
  },
  reativar: { titulo: "Reativar sócio?", rotulo: "Reativar", texto: "Se a mensalidade estiver em dia, ele volta a ficar ativo; senão, fica como inadimplente até pagar." },
  cancelar: {
    titulo: "Cancelar associação?",
    rotulo: "Cancelar associação",
    texto: "A associação é encerrada e as cobranças automáticas param. A carteirinha deixa de valer.",
    perigo: true,
  },
};

function DetalheSocio({ s, fechar }: { s: ComId<Socio> | null; fechar: () => void }) {
  const { tid, ehDiretoria, nomeSede } = usePainel();
  const avisar = useToast();
  const [foto, setFoto] = useState<string | null>(null);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const membros = useColecao<Membro>(ehDiretoria && s ? collection(db, `torcidas/${tid}/membros`) : null, `membros-hist-${tid}-${!!s}`);

  useEffect(() => {
    setFoto(null);
    if (!s?.fotoPath) return;
    let ativo = true;
    getDownloadURL(refStorage(storage, s.fotoPath))
      .then((u) => ativo && setFoto(u))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [s?.fotoPath]);

  if (!s) return <Gaveta aberto={false} fechar={fechar}>{null}</Gaveta>;

  const acoes: Acao[] = [];
  if (s.status === "em_analise") acoes.push("aprovar");
  if (["ativo", "inadimplente", "em_analise", "pendente_pagamento"].includes(s.status)) acoes.push("suspender");
  if (s.status === "suspenso" || s.status === "cancelado") acoes.push("reativar");
  if (ehDiretoria && s.status !== "cancelado") acoes.push("cancelar");
  const emDia = !!s.validoAte && s.validoAte.toMillis() > Date.now();
  const nomeMembro = (uid: string) => membros.dados.find((m) => m.id === uid)?.nome ?? (uid === s.uid ? "O próprio sócio" : "Painel");

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await api.sincronizarAssinatura({ tid, socioUid: s!.uid });
      avisar(r.pagas ? `${numero(r.pagas)} ${r.pagas === 1 ? "fatura paga encontrada" : "faturas pagas encontradas"} e lançada(s).` : "Tudo em dia com a Pagar.me.", "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSincronizando(false);
    }
  }

  const tel = numeroWhatsapp(s.telefone);
  const end = s.endereco;

  return (
    <Gaveta
      aberto
      fechar={fechar}
      titulo="Ficha do sócio"
      rodape={
        acoes.length > 0 || s.metodo === "cartao" ? (
          <div className="flex flex-wrap gap-2">
            {acoes.map((a) => (
              <Botao
                key={a}
                tamanho="sm"
                variante={a === "aprovar" || a === "reativar" ? "primaria" : a === "cancelar" ? "perigo" : "contorno"}
                icone={a === "aprovar" ? "check" : a === "reativar" ? "atualizar" : a === "cancelar" ? "xCirculo" : "cadeado"}
                onClick={() => setAcao(a)}
              >
                {TEXTO_ACAO[a].rotulo}
              </Botao>
            ))}
            {s.metodo === "cartao" && s.pagarme?.subscriptionId && (
              <Botao tamanho="sm" variante="suave" icone="atualizar" carregando={sincronizando} onClick={sincronizar}>
                Sincronizar cartão
              </Botao>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="flex items-center gap-4 mb-6">
        {foto ? (
          <img src={foto} alt={`Foto de ${s.nome}`} width={80} height={96} decoding="async" className="w-20 h-24 rounded-2xl object-cover bg-superficie-2 border border-linha" />
        ) : (
          <Avatar nome={s.nome} tamanho="size-20" className="text-xl" />
        )}
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight">{s.nome}</p>
          <p className="text-sm text-texto-3 mt-0.5 numeros">{s.matricula ? `Matrícula nº ${s.matricula}` : "Sem matrícula ainda"}</p>
          <Selo tom={TOM_STATUS_SOCIO[s.status]} ponto className="mt-2">
            {ROTULO_STATUS_SOCIO[s.status]}
          </Selo>
        </div>
      </div>

      {s.status === "em_analise" && (
        <div className="mb-6 rounded-2xl border border-info/30 bg-info/10 p-4 text-sm">
          <p className="font-semibold">Aguardando aprovação</p>
          <p className="text-texto-2 mt-0.5">O pagamento já foi confirmado. Confira os dados e a foto e aprove.</p>
        </div>
      )}
      {s.assinaturaCancelada && s.status !== "cancelado" && (
        <div className="mb-6 rounded-2xl border border-alerta/30 bg-alerta/10 p-4 text-sm">
          <p className="font-semibold">Renovação automática cancelada</p>
          <p className="text-texto-2 mt-0.5">O sócio continua até o fim do período já pago.</p>
        </div>
      )}

      <h3 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-1">Associação</h3>
      <div className="mb-6">
        <Linha rotulo="Plano">
          {s.planoNome} · {moeda(s.valorPlano)} {periodicidade(s.intervalo, s.intervaloQtd)}
        </Linha>
        <Linha rotulo="Válido até">
          <span className={emDia ? "text-sucesso" : "text-alerta"}>{s.validoAte ? dataCurta(s.validoAte) : "—"}</span>
        </Linha>
        <Linha rotulo="Pagamento">
          {s.metodo === "pix"
            ? "Pix (a cada vencimento)"
            : `Cartão${s.pagarme?.cartaoBandeira ? ` ${s.pagarme.cartaoBandeira}` : ""}${s.pagarme?.cartaoFinal ? ` final ${s.pagarme.cartaoFinal}` : ""} · automático`}
        </Linha>
        <Linha rotulo="Sede">{nomeSede(s.sedeId)}</Linha>
        <Linha rotulo="Sócio desde">{dataCurta(s.criadoEm)}</Linha>
      </div>

      <h3 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-1">Dados pessoais</h3>
      <div className="mb-6">
        <Linha rotulo="CPF">{mascaraCpf(s.cpf)}</Linha>
        <Linha rotulo="Nascimento">{s.nascimento ? s.nascimento.split("-").reverse().join("/") : "—"}</Linha>
        <Linha rotulo="E-mail">
          <a href={`mailto:${s.email}`} className="hover:text-primaria-texto">
            {s.email}
          </a>
        </Linha>
        <Linha rotulo="Telefone">
          {tel ? (
            <a href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-primaria-texto hover:underline">
              <Icone nome="whatsapp" className="size-4" /> {mascaraTelefone(s.telefone)}
            </a>
          ) : (
            "—"
          )}
        </Linha>
        {end && (
          <Linha rotulo="Endereço">
            {end.logradouro}, {end.numero}
            {end.complemento ? ` · ${end.complemento}` : ""}
            <br />
            {end.bairro} · {end.cidade}/{end.uf} · {mascaraCep(end.cep)}
          </Linha>
        )}
      </div>

      <h3 className="text-sm font-semibold text-texto-3 uppercase tracking-wide mb-2">Histórico</h3>
      {s.historico?.length ? (
        <ol className="relative border-l border-linha ml-2 space-y-4 pb-2">
          {[...s.historico].reverse().map((h, i) => (
            <li key={i} className="pl-5 relative">
              <span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-primaria" />
              <p className="text-sm">
                <span className="font-semibold capitalize">{h.acao}</span>: {ROTULO_STATUS_SOCIO[h.de] ?? h.de} → {ROTULO_STATUS_SOCIO[h.para] ?? h.para}
              </p>
              <p className="text-xs text-texto-3">
                {dataHora(h.em)} · {nomeMembro(h.por)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-texto-3">Nenhuma alteração manual de situação.</p>
      )}

      {acao && (
        <Confirmar
          aberto
          fechar={() => setAcao(null)}
          titulo={TEXTO_ACAO[acao].titulo}
          rotulo={TEXTO_ACAO[acao].rotulo}
          perigo={TEXTO_ACAO[acao].perigo}
          acao={async () => {
            const r = await api.alterarStatusSocio({ tid, socioUid: s.uid, acao });
            if (r.avisoAssinatura) avisar(r.avisoAssinatura, "erro");
            else avisar(`Pronto! Situação: ${ROTULO_STATUS_SOCIO[r.status as StatusSocio] ?? r.status}.`, "sucesso");
          }}
        >
          <strong className="block text-texto mb-1">{s.nome}</strong>
          {TEXTO_ACAO[acao].texto}
          {/* assinatura antiga no cartão é cobrada pela própria Pagar.me, fora da rotina do sistema */}
          {acao === "cancelar" && s.pagarme?.subscriptionId && !s.assinaturaCancelada && (
            <span className="block mt-2">Este sócio tem uma assinatura antiga no cartão: ela também será cancelada na Pagar.me.</span>
          )}
          {acao === "suspender" && s.pagarme?.subscriptionId && !s.assinaturaCancelada && (
            <span className="block mt-2">Este sócio tem uma assinatura antiga no cartão, que continua cobrando enquanto ele estiver suspenso. Para parar a cobrança, cancele o sócio.</span>
          )}
        </Confirmar>
      )}
    </Gaveta>
  );
}
