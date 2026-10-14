/** Configurações → "Alertas neste celular": liga as notificações da equipe (erros, cadastro para analisar, Pix informado). */
import { useState } from "react";
import { api, mensagemDeErro } from "@/lib/api";
import { ativarNotificacoes, situacaoNotificacao, type SituacaoNotificacao } from "@/lib/notificacoes";
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
  const [ocupado, setOcupado] = useState<"ativar" | "testar" | null>(null);

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
      await api.testarNotificacao({});
      avisar("Notificação de teste enviada.", "sucesso");
    } catch (e) {
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
    </Cartao>
  );
}
