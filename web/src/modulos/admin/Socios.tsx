import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { collection, orderBy, query, where } from "firebase/firestore";
import { getDownloadURL, ref as refStorage } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
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
import { Avatar, Botao, CabecalhoPagina, Campo, Cartao, Gaveta, Icone, Selecao, Selo, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { baixarCsv, Confirmar, decimalBR, EstadoLista, Linha, normalizar, numeroWhatsapp, Pilulas } from "./util";

const STATUS: StatusSocio[] = ["ativo", "em_analise", "inadimplente", "pendente_pagamento", "suspenso", "cancelado"];
type Acao = "aprovar" | "suspender" | "reativar" | "cancelar";

export default function Socios() {
  const { tid, ehDiretoria, sedeEscopo, sedes, nomeSede } = usePainel();
  const [params] = useSearchParams();
  const inicial = params.get("status") as StatusSocio | null;
  const [status, setStatus] = useState<"todos" | StatusSocio>(inicial && STATUS.includes(inicial) ? inicial : "todos");
  const [sede, setSede] = useState("");
  const [busca, setBusca] = useState("");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  useTourPagina("socios");

  const socios = useColecao<Socio>(
    ehDiretoria
      ? query(collection(db, `torcidas/${tid}/socios`), orderBy("criadoEm", "desc"))
      : sedeEscopo
        ? query(collection(db, `torcidas/${tid}/socios`), where("sedeId", "==", sedeEscopo), orderBy("criadoEm", "desc"))
        : null,
    `socios-${tid}-${sedeEscopo ?? "todas"}`,
  );

  const porSede = useMemo(() => socios.dados.filter((s) => !sede || s.sedeId === sede), [socios.dados, sede]);
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: porSede.length };
    for (const s of porSede) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [porSede]);

  const filtrados = useMemo(() => {
    const b = normalizar(busca.trim());
    const dig = soDigitos(busca);
    return porSede.filter((s) => {
      if (status !== "todos" && s.status !== status) return false;
      if (!b) return true;
      return normalizar(`${s.nome} ${s.email} ${s.matricula ?? ""}`).includes(b) || (dig.length >= 3 && (s.cpf.includes(dig) || (s.matricula ?? "").includes(dig)));
    });
  }, [porSede, status, busca]);

  const aberto = abertoId ? (socios.dados.find((s) => s.id === abertoId) ?? null) : null;

  function exportar() {
    baixarCsv(
      `socios-${new Date().toISOString().slice(0, 10)}`,
      ["Matrícula", "Nome", "CPF", "E-mail", "Telefone", "Nascimento", "Plano", "Valor", "Forma de pagamento", "Situação", "Válido até", "Sede", "Cidade", "UF", "Cadastro"],
      filtrados.map((s) => [
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
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Sócios"
        descricao={ehDiretoria ? "Todos os sócios da torcida." : `Sócios da ${nomeSede(sedeEscopo)}.`}
        acoes={
          <Botao variante="contorno" tamanho="sm" icone="download" onClick={exportar} disabled={!filtrados.length} data-tour="socios-exportar">
            Exportar CSV
          </Botao>
        }
      />

      <div className="flex flex-col gap-3 mb-5">
        <div data-tour="socios-status">
        <Pilulas
          valor={status}
          onChange={setStatus}
          opcoes={[
            { valor: "todos" as const, rotulo: "Todos", contador: contagem.todos ?? 0 },
            ...STATUS.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_SOCIO[s], contador: contagem[s] ?? 0 })),
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

      {socios.carregando || socios.erro || filtrados.length === 0 ? (
        <EstadoLista
          carregando={socios.carregando}
          erro={socios.erro}
          vazio
          icone="usuarios"
          tituloVazio={socios.dados.length ? "Nenhum sócio com esses filtros" : "Nenhum sócio ainda"}
          textoVazio={socios.dados.length ? "Mude os filtros ou a busca." : "Divulgue a página da torcida (aba Sócios) para receber as primeiras adesões."}
        />
      ) : (
        <div data-tour="socios-lista">
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
                          <p className="font-medium truncate">{s.nome}</p>
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
    texto: "A carteirinha deixa de valer e ele perde o preço de sócio até ser reativado. As cobranças não são canceladas.",
    perigo: true,
  },
  reativar: { titulo: "Reativar sócio?", rotulo: "Reativar", texto: "Se a mensalidade estiver em dia, ele volta a ficar ativo; senão, fica como inadimplente até pagar." },
  cancelar: {
    titulo: "Cancelar associação?",
    rotulo: "Cancelar associação",
    texto: "A associação é encerrada. Se ele paga por cartão, cancele também a assinatura no painel da Pagar.me para não haver novas cobranças.",
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
      avisar(r.pagas ? `${r.pagas} ${r.pagas === 1 ? "fatura paga encontrada" : "faturas pagas encontradas"} e lançada(s).` : "Tudo em dia com a Pagar.me.", "sucesso");
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
          <img src={foto} alt={`Foto de ${s.nome}`} className="w-20 h-24 rounded-2xl object-cover bg-superficie-2 border border-linha" />
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
          <a href={`mailto:${s.email}`} className="hover:text-primaria">
            {s.email}
          </a>
        </Linha>
        <Linha rotulo="Telefone">
          {tel ? (
            <a href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primaria hover:underline">
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
            avisar(`Pronto! Situação: ${ROTULO_STATUS_SOCIO[r.status as StatusSocio] ?? r.status}.`, "sucesso");
          }}
        >
          <strong className="block text-texto mb-1">{s.nome}</strong>
          {TEXTO_ACAO[acao].texto}
        </Confirmar>
      )}
    </Gaveta>
  );
}
