import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api, mensagemDeErro, type DiagnosticoTorcida } from "@/lib/api";
import { dataHora, moeda, relativo, ROTULO_STATUS_PEDIDO } from "@/lib/formatos";
import type { StatusPedido, Tema } from "@/lib/tipos";
import { Aviso, Botao, Cartao, Carregando, cx, Icone, Selo, type NomeIcone, type Tom } from "@/ui";
import { msDe, ROTULO_AMBIENTE, ROTULO_STATUS_TORCIDA, TOM_AMBIENTE, TOM_STATUS_TORCIDA } from "./comum";

type ItemSaude = { tom: "sucesso" | "alerta" | "perigo" | "info"; texto: string; detalhe?: string };

const DIA = 86_400_000;

const TOM_PEDIDO: Partial<Record<string, Tom>> = {
  pago: "sucesso",
  aguardando: "info",
  falhou: "perigo",
  expirado: "neutro",
  cancelado: "neutro",
  estornado: "alerta",
  criando: "neutro",
};

export default function Depuracao({ tid }: { tid: string }) {
  const [diag, setDiag] = useState<DiagnosticoTorcida | null>(null);
  const [datas, setDatas] = useState<Record<string, number | null>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [em, setEm] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [d, evs] = await Promise.all([
        api.diagnosticoTorcida({ tid }),
        // o diagnóstico não traz a data do evento; a plataforma pode ler os eventos direto
        getDocs(collection(db, `torcidas/${tid}/eventos`)).catch(() => null),
      ]);
      setDiag(d);
      setDatas(Object.fromEntries((evs?.docs ?? []).map((e) => [e.id, msDe(e.get("data"))])));
      setEm(Date.now());
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, [tid]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const saude = useMemo(() => (diag ? checklist(diag, datas) : []), [diag, datas]);

  if (!diag && carregando) return <Carregando texto="Coletando o diagnóstico…" />;
  if (!diag) {
    return (
      <Aviso tom="perigo" titulo="Não foi possível carregar o diagnóstico" acao={<Botao tamanho="sm" variante="contorno" onClick={carregar}>Tentar de novo</Botao>}>
        {erro}
      </Aviso>
    );
  }

  const t = diag.torcida as {
    nome?: string;
    slug?: string;
    status?: keyof typeof ROTULO_STATUS_TORCIDA;
    taxaServicoPct?: number;
    tema?: Partial<Tema>;
    aprovacaoManualSocio?: boolean;
    destinoMensalidade?: string;
    pagamentos?: { configurado?: boolean; ambiente?: string; pix?: boolean; cartao?: boolean; chavePublica?: string; webhookRecebidoEm?: unknown };
  };
  const pg = t.pagamentos ?? {};
  const webhookEm = msDe(pg.webhookRecebidoEm);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-texto-3">
          Somente leitura · sem senhas, chaves ou dados completos de compradores.
          {em && <> Atualizado {relativo(em)}.</>}
        </p>
        <Botao variante="contorno" tamanho="sm" icone="atualizar" carregando={carregando} onClick={carregar}>
          Atualizar
        </Botao>
      </div>
      {erro && <Aviso tom="perigo">{erro}</Aviso>}

      <Cartao className="p-5 sm:p-6">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Icone nome="checkCirculo" className="size-5 text-primaria" /> Checklist de saúde
        </h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {saude.map((s, i) => (
            <li
              key={i}
              className={cx(
                "flex gap-3 rounded-xl border px-3.5 py-3 text-sm",
                s.tom === "sucesso" && "border-sucesso/25 bg-sucesso/8",
                s.tom === "alerta" && "border-alerta/30 bg-alerta/10",
                s.tom === "perigo" && "border-perigo/30 bg-perigo/10",
                s.tom === "info" && "border-info/25 bg-info/8",
              )}
            >
              <Icone
                nome={s.tom === "sucesso" ? "check" : s.tom === "info" ? "info" : "alerta"}
                className={cx("size-5 shrink-0", s.tom === "sucesso" ? "text-sucesso" : s.tom === "alerta" ? "text-alerta" : s.tom === "perigo" ? "text-perigo" : "text-info")}
              />
              <span>
                <span className="font-medium">{s.texto}</span>
                {s.detalhe && <span className="block text-texto-2 text-xs mt-0.5">{s.detalhe}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Cartao>

      <div className="grid gap-6 xl:grid-cols-2">
        <Painel titulo="Configuração" icone="engrenagem">
          <Linhas
            itens={[
              ["Status", t.status ? <Selo tom={TOM_STATUS_TORCIDA[t.status]}>{ROTULO_STATUS_TORCIDA[t.status]}</Selo> : "—"],
              ["Endereço", `/${t.slug ?? "—"}`],
              ["Taxa de serviço", `${t.taxaServicoPct ?? "—"}%`],
              ["Aprovação manual de sócio", t.aprovacaoManualSocio ? "Sim" : "Não"],
              ["Destino da mensalidade", t.destinoMensalidade === "principal" ? "Sede principal" : "Sede do sócio"],
              [
                "Tema",
                <span className="inline-flex items-center gap-1.5">
                  {(["corPrimaria", "corSecundaria", "corFundo", "corTexto"] as const).map((k) => (
                    <span key={k} title={`${k}: ${t.tema?.[k] ?? "—"}`} className="size-5 rounded-full border border-linha-forte" style={{ background: t.tema?.[k] }} />
                  ))}
                </span>,
              ],
            ]}
          />
        </Painel>

        <Painel titulo="Pagamentos" icone="cartao">
          <Linhas
            itens={[
              ["Configurado", pg.configurado ? <Selo tom="sucesso">Sim</Selo> : <Selo tom="perigo">Não</Selo>],
              ["Ambiente", pg.ambiente ? <Selo tom={TOM_AMBIENTE[pg.ambiente] ?? "alerta"}>{ROTULO_AMBIENTE[pg.ambiente] ?? pg.ambiente}</Selo> : "—"],
              ["Pix / Cartão", `${pg.pix ? "Pix ✓" : "Pix ✗"} · ${pg.cartao ? "Cartão ✓" : "Cartão ✗"}`],
              ["Chave pública", pg.chavePublica ? `${pg.chavePublica.slice(0, 8)}…${pg.chavePublica.slice(-4)}` : "—"],
              [
                "Credenciais salvas",
                diag.credenciais.salvas ? (
                  <span>
                    <Selo tom="sucesso">Sim</Selo>
                    {diag.credenciais.atualizadoEm && <span className="text-xs text-texto-3 ml-2">{dataHora(diag.credenciais.atualizadoEm)}</span>}
                  </span>
                ) : (
                  <Selo tom="perigo">Não</Selo>
                ),
              ],
              ["Último webhook", webhookEm ? `${relativo(webhookEm)} (${dataHora(webhookEm)})` : "Nunca recebido"],
            ]}
          />
        </Painel>
      </div>

      <Painel titulo={`Últimos webhooks (${diag.webhooks.length})`} icone="raio">
        {diag.webhooks.length === 0 ? (
          <Nada>Nenhum webhook recebido.</Nada>
        ) : (
          <Tabela
            cabecalho={["Tipo", "Processado", "Resultado / erro", "Tentativas", "Quando"]}
            linhas={diag.webhooks.map((w) => [
              <code className="text-xs">{w.tipo || "—"}</code>,
              w.processado ? <Selo tom="sucesso">Sim</Selo> : <Selo tom={w.erro ? "perigo" : "alerta"}>Não</Selo>,
              w.erro ? <span className="text-perigo text-xs break-all">{w.erro}</span> : <span className="text-texto-2">{w.resultado ?? "—"}</span>,
              <span className="numeros">{w.tentativas ?? 1}</span>,
              <Quando ms={w.recebidoEm} />,
            ])}
          />
        )}
      </Painel>

      <Painel titulo={`Últimos pedidos (${diag.pedidos.length})`} icone="ingresso">
        {diag.pedidos.length === 0 ? (
          <Nada>Nenhum pedido ainda.</Nada>
        ) : (
          <Tabela
            cabecalho={["Status", "Tipo / método", "Total", "Comprador", "Motivo da recusa", "Pagar.me", "Quando"]}
            linhas={diag.pedidos.map((p) => [
              <Selo tom={TOM_PEDIDO[p.status] ?? "neutro"}>{ROTULO_STATUS_PEDIDO[p.status as StatusPedido] ?? p.status}</Selo>,
              <span>
                {p.tipo === "socio" ? "Sócio" : p.eventoNome ?? "Ingresso"}
                <span className="block text-xs text-texto-3">{p.metodo === "cartao" ? "Cartão" : "Pix"}</span>
              </span>,
              <span className="numeros">{moeda(p.total)}</span>,
              <span>
                {p.comprador?.nome ?? "—"}
                <span className="block text-xs text-texto-3">
                  {p.comprador?.email} · {p.comprador?.cpf}
                </span>
              </span>,
              p.motivo ? <span className="text-perigo text-xs">{p.motivo}</span> : <span className="text-texto-3">—</span>,
              p.pagarmeOrderId ? <code className="text-xs whitespace-nowrap">{p.pagarmeOrderId}</code> : <span className="text-texto-3">—</span>,
              <Quando ms={p.criadoEm} />,
            ])}
          />
        )}
      </Painel>

      <Painel titulo={`Erros do navegador (${diag.erros.length})`} icone="bug">
        {diag.erros.length === 0 ? (
          <Nada>Nenhum erro registrado pelo navegador.</Nada>
        ) : (
          <ul className="divide-y divide-linha -my-2">
            {diag.erros.map((e) => (
              <li key={e.id} className="py-2">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start gap-3 py-1">
                    <Icone nome="chevronDireita" className="size-4 mt-0.5 shrink-0 text-texto-3 transition-transform group-open:rotate-90" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words">{e.mensagem}</span>
                      <span className="block text-xs text-texto-3 truncate">
                        {e.contexto ? `${e.contexto} · ` : ""}
                        {caminhoDe(e.url)}
                      </span>
                    </span>
                    <Quando ms={e.criadoEm} />
                  </summary>
                  <div className="ml-7 mt-2 space-y-2 text-xs">
                    <Linhas
                      itens={[
                        ["URL", <span className="break-all">{e.url ?? "—"}</span>],
                        ["Contexto", e.contexto || "—"],
                        ["Navegador", <span className="break-all">{e.navegador ?? "—"}</span>],
                        ["Versão", String((e as { versao?: string }).versao ?? "—")],
                        ["Usuário", e.uid ? <code>{e.uid.slice(0, 8)}…</code> : "anônimo"],
                        ["Quando", dataHora(e.criadoEm)],
                      ]}
                    />
                    {(e as { stack?: string }).stack && (
                      <pre className="rounded-xl bg-superficie-2 border border-linha p-3 overflow-x-auto rolagem-fina text-[11px] leading-relaxed text-texto-2 max-h-64">
                        {(e as { stack?: string }).stack}
                      </pre>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Painel titulo={`Eventos (${diag.eventos.length})`} icone="calendario">
          {diag.eventos.length === 0 ? (
            <Nada>Nenhum evento cadastrado.</Nada>
          ) : (
            <Tabela
              larga={false}
              cabecalho={["Evento", "Status", "Vendidos", "Reservados"]}
              linhas={diag.eventos.map((e) => {
                const data = datas[e.id] ?? null;
                const preso = (e.reservados ?? 0) > 0 && data !== null && data < Date.now();
                return [
                  <span>
                    {e.nome}
                    <span className="block text-xs text-texto-3">{data ? dataHora(data) : "data indisponível"}</span>
                  </span>,
                  <Selo tom={e.status === "publicado" ? "sucesso" : e.status === "cancelado" ? "perigo" : "neutro"}>{e.status}</Selo>,
                  <span className="numeros">{e.vendidos ?? 0}</span>,
                  preso ? (
                    <Selo tom="perigo">
                      <Icone nome="alerta" className="size-3.5" /> {e.reservados} presos
                    </Selo>
                  ) : (
                    <span className={cx("numeros", (e.reservados ?? 0) > 0 && "text-alerta font-semibold")}>{e.reservados ?? 0}</span>
                  ),
                ];
              })}
            />
          )}
        </Painel>
        <Painel titulo={`Planos de sócio (${diag.planos.length})`} icone="estrela">
          {diag.planos.length === 0 ? (
            <Nada>Nenhum plano cadastrado.</Nada>
          ) : (
            <Tabela
              larga={false}
              cabecalho={["Plano", "Valor", "Ativo"]}
              linhas={diag.planos.map((p) => [
                p.nome,
                <span className="numeros">{moeda(p.valor)}</span>,
                p.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo>Inativo</Selo>,
              ])}
            />
          )}
        </Painel>
      </div>
    </div>
  );
}

function checklist(d: DiagnosticoTorcida, datas: Record<string, number | null>): ItemSaude[] {
  const r: ItemSaude[] = [];
  const t = d.torcida as { status?: string; pagamentos?: { configurado?: boolean; ambiente?: string; webhookRecebidoEm?: unknown } };
  const pg = t.pagamentos ?? {};
  const agora = Date.now();

  if (t.status === "suspensa") r.push({ tom: "perigo", texto: "Torcida suspensa", detalhe: "Vendas bloqueadas até reativação." });

  if (!pg.configurado) {
    r.push({ tom: t.status === "ativa" ? "perigo" : "alerta", texto: "Pagamentos não configurados", detalhe: "A diretoria ainda não salvou as chaves da Pagar.me." });
  } else {
    r.push({ tom: "sucesso", texto: "Pagamentos configurados" });
    if (!d.credenciais.salvas) r.push({ tom: "perigo", texto: "Chave secreta ausente", detalhe: "Pagamentos marcados como configurados, mas não há credencial cifrada salva." });
    if (pg.ambiente === "demo") r.push({ tom: "info", texto: "Modo demonstração", detalhe: "Pagamentos simulados: nada é cobrado de verdade." });
    if (pg.ambiente === "teste" && t.status === "ativa") r.push({ tom: "alerta", texto: "Ambiente de teste em torcida ativa", detalhe: "As vendas não são reais." });
  }

  const webhookEm = msDe(pg.webhookRecebidoEm) ?? d.webhooks[0]?.recebidoEm ?? null;
  if (pg.configurado && pg.ambiente !== "demo" && !webhookEm) {
    r.push({ tom: "alerta", texto: "Webhook nunca recebido", detalhe: "Confira se o webhook foi criado na Pagar.me com a URL do painel da diretoria." });
  } else if (webhookEm) {
    r.push({ tom: "sucesso", texto: `Último webhook ${relativo(webhookEm)}` });
  }

  const comErro = d.webhooks.filter((w) => w.erro || !w.processado);
  if (comErro.length) {
    r.push({ tom: "perigo", texto: `${comErro.length} webhook(s) com falha no processamento`, detalhe: comErro[0]?.erro ?? "Não processado." });
  }

  const falhos = d.pedidos.filter((p) => p.status === "falhou");
  if (falhos.length) {
    const motivos = new Map<string, number>();
    for (const p of falhos) motivos.set(p.motivo || "motivo não informado", (motivos.get(p.motivo || "motivo não informado") ?? 0) + 1);
    const [motivo, qtd] = [...motivos.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const pct = Math.round((falhos.length / d.pedidos.length) * 100);
    r.push({
      tom: falhos.length >= 3 || pct >= 30 ? "perigo" : "alerta",
      texto: `Pedidos falhando por “${motivo}”`,
      detalhe: `${falhos.length} de ${d.pedidos.length} pedidos recentes recusados (${pct}%) · ${qtd} por esse motivo.`,
    });
  } else if (d.pedidos.length) {
    r.push({ tom: "sucesso", texto: "Nenhum pedido recusado recentemente" });
  }

  const parados = d.pedidos.filter((p) => p.status === "aguardando" && p.criadoEm && agora - p.criadoEm > DIA);
  if (parados.length) r.push({ tom: "alerta", texto: `${parados.length} pedido(s) aguardando há mais de 24 h`, detalhe: "Podem indicar webhook que não chega ou Pix abandonado." });

  const errosRecentes = d.erros.filter((e) => e.criadoEm && agora - e.criadoEm < DIA);
  if (errosRecentes.length) {
    r.push({ tom: errosRecentes.length >= 5 ? "perigo" : "alerta", texto: `${errosRecentes.length} erro(s) no navegador nas últimas 24 h`, detalhe: errosRecentes[0]?.mensagem });
  } else {
    r.push({ tom: "sucesso", texto: "Sem erros recentes no navegador" });
  }

  const presos = d.eventos.filter((e) => (e.reservados ?? 0) > 0 && (datas[e.id] ?? Infinity) < agora);
  if (presos.length) {
    r.push({ tom: "alerta", texto: `Reservas presas em ${presos.length} evento(s) já realizado(s)`, detalhe: presos.map((e) => `${e.nome}: ${e.reservados}`).join(" · ") });
  }

  if (!d.planos.some((p) => p.ativo)) r.push({ tom: "info", texto: "Nenhum plano de sócio ativo" });
  if (!d.eventos.some((e) => e.status === "publicado")) r.push({ tom: "info", texto: "Nenhum evento publicado" });

  const ordem = { perigo: 0, alerta: 1, info: 2, sucesso: 3 };
  return r.sort((a, b) => ordem[a.tom] - ordem[b.tom]);
}

const caminhoDe = (url?: string) => {
  if (!url) return "";
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

function Painel({ titulo, icone, children }: { titulo: string; icone: NomeIcone; children: ReactNode }) {
  return (
    <Cartao className="p-5 sm:p-6 min-w-0">
      <h2 className="font-bold mb-4 flex items-center gap-2">
        <Icone nome={icone} className="size-5 text-texto-3" />
        {titulo}
      </h2>
      {children}
    </Cartao>
  );
}

function Linhas({ itens }: { itens: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-linha text-sm">
      {itens.map(([r, v]) => (
        <div key={r} className="flex items-center justify-between gap-4 py-2">
          <dt className="text-texto-2 shrink-0">{r}</dt>
          <dd className="text-right min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tabela({ cabecalho, linhas, larga = true }: { cabecalho: string[]; linhas: ReactNode[][]; larga?: boolean }) {
  return (
    <div className="overflow-x-auto rolagem-fina -mx-5 sm:-mx-6 px-5 sm:px-6">
      <table className={cx("w-full text-sm", larga && "min-w-[640px]")}>
        <thead className="text-left text-xs text-texto-3">
          <tr>
            {cabecalho.map((c) => (
              <th key={c} className="py-2 pr-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t border-linha align-top">
              {l.map((c, j) => (
                <td key={j} className="py-2.5 pr-3">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Quando({ ms }: { ms: number | null }) {
  if (!ms) return <span className="text-texto-3 text-xs">—</span>;
  return (
    <time dateTime={new Date(ms).toISOString()} title={dataHora(ms)} className="text-xs text-texto-2 whitespace-nowrap">
      {relativo(ms)}
    </time>
  );
}

function Nada({ children }: { children: ReactNode }) {
  return <p className="text-sm text-texto-3 py-4 text-center">{children}</p>;
}
