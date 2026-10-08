import { rp } from "@/lib/hosts";
import { Link } from "react-router";
import { relativo } from "@/lib/formatos";
import { Aviso, CabecalhoPagina, Cartao, Carregando, Icone, Selo, Vazio } from "@/ui";
import { alertasDaTorcida, ROTULO_STATUS_TORCIDA, TOM_STATUS_TORCIDA, useResumo } from "./comum";

/** Atalho do menu: escolher a torcida para abrir a janela de depuração. */
export default function EscolherDepuracao() {
  const { resumo, carregando, erro } = useResumo();
  const lista = [...(resumo?.torcidas ?? [])].sort((a, b) => alertasDaTorcida(b).length - alertasDaTorcida(a).length || a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <>
      <CabecalhoPagina
        titulo="Depuração"
        descricao="Estado técnico de cada torcida: webhooks, pedidos, erros do navegador e eventos. Sem dados sensíveis."
      />
      {erro && <Aviso tom="perigo" className="mb-4">{erro}</Aviso>}
      {!resumo && carregando ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Cartao>
          <Vazio icone="bug" titulo="Nenhuma torcida cadastrada" />
        </Cartao>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((t) => {
            const alertas = alertasDaTorcida(t);
            return (
              <Link key={t.id} to={rp(`/torcidas/${t.id}/depuracao`)}>
                <Cartao className="p-4 h-full hover:border-linha-forte transition-colors flex items-start gap-3">
                  <span className={`size-10 shrink-0 rounded-xl grid place-items-center ${alertas.length ? "bg-alerta/12 text-alerta" : "bg-sucesso/12 text-sucesso"}`}>
                    <Icone nome={alertas.length ? "alerta" : "checkCirculo"} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{t.nome}</span>
                      <Selo tom={TOM_STATUS_TORCIDA[t.status]}>{ROTULO_STATUS_TORCIDA[t.status]}</Selo>
                    </span>
                    <span className="block text-xs text-texto-3 mt-1">
                      {t.pagamentos.webhookRecebidoEm ? `Último webhook ${relativo(t.pagamentos.webhookRecebidoEm)}` : "Nenhum webhook recebido"}
                    </span>
                    {alertas.length > 0 && <span className="block text-xs text-alerta mt-1">{alertas.map((a) => a.titulo).join(" · ")}</span>}
                  </span>
                  <Icone nome="chevronDireita" className="size-5 text-texto-3 self-center" />
                </Cartao>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
