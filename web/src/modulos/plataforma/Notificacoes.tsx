/** Configurações → "Alertas neste celular": liga as notificações da equipe (erros, cadastro para analisar, Pix informado). */
import { useState } from "react";
import { api, mensagemDeErro } from "@/lib/api";
import { ativarNotificacoes, diagnosticar, notificacaoLocal, situacaoNotificacao, type SituacaoNotificacao } from "@/lib/notificacoes";
import { Aviso, Botao, Cartao, useToast } from "@/ui";

const TEXTO: Record<SituacaoNotificacao, string> = {
  nao_configurado: "Falta configurar a chave de notificações do projeto (Firebase → Cloud Messaging).",
  instalar_no_iphone:
    "No iPhone, primeiro adicione o painel à tela de início: toque em Compartilhar (quadrado com seta) → “Adicionar à Tela de Início”. Depois abra pelo ícone novo e volte aqui.",
  sem_suporte: "Este navegador não recebe notificações. No iPhone, use o Safari atualizado (iOS 16.4 ou mais novo).",
  negada: "As notificações foram bloqueadas. Libere em Ajustes → Notificações → Somos Equipe e volte aqui.",
  desligada: "Receba no celular quando houver erro no sistema, cadastro de torcida para analisar ou Pix de mensalidade informado.",
  ligada: "Este celular recebe os alertas da equipe.",
};

export function CartaoNotificacoes() {
  const avisar = useToast();
  const [situacao, setSituacao] = useState<SituacaoNotificacao>(() => situacaoNotificacao());
  const [ocupado, setOcupado] = useState<"ativar" | "testar" | "diag" | "local" | null>(null);
  const [diag, setDiag] = useState<{ item: string; ok: boolean; detalhe: string }[] | null>(null);
  const [resultadoTeste, setResultadoTeste] = useState<string | null>(null);

  async function rodarDiagnostico() {
    setOcupado("diag");
    try {
      setDiag(await diagnosticar());
    } finally {
      setOcupado(null);
    }
  }

  async function testeLocal() {
    setOcupado("local");
    try {
      await notificacaoLocal();
      avisar("Notificação local enviada. Ela apareceu no topo da tela?", "info");
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setOcupado(null);
    }
  }

  async function ativar() {
    setOcupado("ativar");
    try {
      await ativarNotificacoes();
      setSituacao("ligada");
      avisar("Notificações ligadas neste celular.", "sucesso");
    } catch (e) {
      setSituacao(situacaoNotificacao());
      avisar(e instanceof Error && !("code" in e) ? e.message : mensagemDeErro(e), "erro");
    } finally {
      setOcupado(null);
    }
  }

  async function testar() {
    setOcupado("testar");
    try {
      const r = await api.testarNotificacao({});
      setResultadoTeste(`Servidor: ${r.enviadas} de ${r.aparelhos} aparelho(s) aceitos pelo Firebase${r.falhas.length ? ` · falhas: ${r.falhas.join(", ")}` : ""}${r.ids.length ? ` · id ${r.ids[0]!.slice(-10)}` : ""}`);
      avisar("O Firebase aceitou a notificação. Ela chegou?", "sucesso");
    } catch (e) {
      setResultadoTeste(`Servidor recusou: ${mensagemDeErro(e)}`);
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Cartao className="p-5 sm:p-6 space-y-3 mb-6" data-notificacoes>
      <div>
        <h2 className="font-bold">Alertas neste celular</h2>
        <p className="text-sm text-texto-3 mt-1">{TEXTO[situacao]}</p>
      </div>
      {situacao === "instalar_no_iphone" && <Aviso tom="info">Depois de instalado, o painel abre como um app, sem a barra do Safari.</Aviso>}
      <div className="flex flex-wrap gap-2">
        {(situacao === "desligada" || situacao === "ligada") && (
          <Botao icone="sino" carregando={ocupado === "ativar"} variante={situacao === "ligada" ? "contorno" : "primaria"} onClick={ativar}>
            {situacao === "ligada" ? "Registrar de novo" : "Ativar notificações"}
          </Botao>
        )}
        {situacao === "ligada" && (
          <Botao variante="contorno" carregando={ocupado === "testar"} onClick={testar}>
            Enviar teste
          </Botao>
        )}
      </div>
      {resultadoTeste && <p className="text-sm text-texto-2 break-words" data-resultado-teste>{resultadoTeste}</p>}
      <details className="pt-1">
        <summary className="min-h-11 inline-flex items-center cursor-pointer text-sm font-semibold text-texto-2">Não chegou? Diagnóstico deste celular</summary>
        <div className="mt-2 space-y-3">
          <p className="text-sm text-texto-3">Confere cada etapa até a notificação aparecer. Tire um print do resultado e mande para o suporte técnico.</p>
          <div className="flex flex-wrap gap-2">
            <Botao variante="contorno" tamanho="sm" carregando={ocupado === "diag"} onClick={rodarDiagnostico}>
              Rodar diagnóstico
            </Botao>
            <Botao variante="contorno" tamanho="sm" carregando={ocupado === "local"} onClick={testeLocal}>
              Notificação local (sem servidor)
            </Botao>
          </div>
          {diag && (
            <ul className="space-y-2 text-sm" data-diagnostico>
              {diag.map((d) => (
                <li key={d.item} className="flex gap-2">
                  <span className={d.ok ? "text-sucesso" : "text-perigo"} aria-hidden="true">
                    {d.ok ? "✓" : "✗"}
                  </span>
                  <span className="min-w-0">
                    <span className="font-semibold">{d.item}</span>
                    <span className="block text-texto-3 break-all">{d.detalhe}</span>
                  </span>
                </li>
              ))}
              <li className="text-texto-3 text-xs">{navigator.userAgent}</li>
            </ul>
          )}
        </div>
      </details>
    </Cartao>
  );
}
