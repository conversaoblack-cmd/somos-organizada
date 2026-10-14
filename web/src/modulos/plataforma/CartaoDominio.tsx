import { useEffect, useState } from "react";
import { api, mensagemDeErro, type HostDominio, type ResumoDominio } from "@/lib/api";
import { dataCurta } from "@/lib/formatos";
import { Aviso, Botao, Campo, Cartao, Carregando, Modal, Selo, useToast, type Tom } from "@/ui";
import { BotaoCopiar } from "@/modulos/admin/util";

const ROTULO_ESTADO: Record<HostDominio["estado"], string> = {
  pendente_dns: "Aguardando DNS",
  emitindo_certificado: "Gerando certificado",
  ativo: "No ar",
  erro: "Erro",
};
const TOM_ESTADO: Record<HostDominio["estado"], Exclude<Tom, "primaria">> = {
  pendente_dns: "alerta",
  emitindo_certificado: "info",
  ativo: "sucesso",
  erro: "perigo",
};
const ROTULO_TIPO: Record<HostDominio["tipo"], string> = {
  vitrine: "Site da torcida (vitrine)",
  www: "www (redireciona para o site)",
  painel: "Painel da diretoria",
};

/** Texto pronto para mandar a quem cuida do domínio da torcida (Registro.br, Hostinger, GoDaddy...). */
function instrucoes(hosts: HostDominio[]): string {
  const linhas = ["Registros de DNS para o site da torcida na Somos Organizada:", ""];
  for (const h of hosts) {
    for (const r of h.registros) {
      if (r.acao === "ok") continue;
      linhas.push(`${r.acao === "remover" ? "REMOVER" : "ADICIONAR"} · ${r.tipo} · nome: ${r.nome} · valor: ${r.valor}`);
    }
  }
  linhas.push("", "Os registros de e-mail (MX) não mudam. Depois de salvar, avise a gente: o cadeado sai em algumas horas.");
  return linhas.join("\n");
}

/**
 * Domínio próprio da torcida (só a equipe liga; a diretoria pede pelo comercial). Vitrine = domínio raiz (o www
 * redireciona para ele); painel = subdomínio. Mostra os registros de DNS para mandar à torcida e a situação de cada um.
 */
export function CartaoDominio({ tid }: { tid: string }) {
  const [resumo, setResumo] = useState<ResumoDominio | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [vitrine, setVitrine] = useState("");
  const [painel, setPainel] = useState("");
  const [ocupado, setOcupado] = useState<"ligar" | "verificar" | null>(null);
  const [remover, setRemover] = useState<HostDominio | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const avisar = useToast();

  async function verificar(silencioso = false) {
    setOcupado("verificar");
    try {
      setResumo(await api.consultarDominio({ tid }));
      setErroCarga(null);
      if (!silencioso) avisar("Situação atualizada.", "sucesso");
    } catch (e) {
      if (silencioso) setErroCarga(mensagemDeErro(e));
      else avisar(mensagemDeErro(e), "erro");
    } finally {
      setOcupado(null);
    }
  }

  useEffect(() => {
    void verificar(true);
  }, [tid]);

  const hosts = resumo?.hosts ?? [];
  const temVitrine = hosts.some((h) => h.tipo === "vitrine");
  const temPainel = hosts.some((h) => h.tipo === "painel");

  async function ligar() {
    if (!vitrine.trim() && !painel.trim()) return avisar("Preencha o domínio do site, do painel ou os dois.", "erro");
    setOcupado("ligar");
    try {
      setResumo(await api.configurarDominio({ tid, ...(vitrine.trim() ? { vitrine: vitrine.trim() } : {}), ...(painel.trim() ? { painel: painel.trim() } : {}) }));
      setVitrine("");
      setPainel("");
      avisar("Domínio ligado. Agora mande os registros de DNS para a torcida.", "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setOcupado(null);
    }
  }

  async function confirmarRemocao() {
    if (!remover) return;
    setRemovendo(true);
    try {
      setResumo(await api.removerDominio({ tid, host: remover.host }));
      avisar(`${remover.host} foi desligado. O endereço padrão continua funcionando.`, "sucesso");
      setRemover(null);
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <Cartao className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="font-bold">Domínio próprio</h2>
        {hosts.length > 0 && (
          <Botao tamanho="sm" variante="contorno" icone="atualizar" carregando={ocupado === "verificar"} onClick={() => void verificar()}>
            Verificar agora
          </Botao>
        )}
      </div>
      <p className="text-sm text-texto-3 mb-4">
        Só a equipe liga, depois de combinar com a diretoria. O endereço padrão continua valendo sempre.
      </p>

      {!resumo && !erroCarga && <Carregando />}
      {erroCarga && (
        <Aviso tom="perigo" className="mb-4" acao={<Botao tamanho="sm" variante="contorno" onClick={() => void verificar(true)}>Tentar de novo</Botao>}>
          {erroCarga}
        </Aviso>
      )}

      {hosts.length > 0 && (
        <ul className="space-y-4 mb-5">
          {hosts.map((h) => (
            <li key={h.host} className="rounded-2xl border border-linha p-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-semibold text-[15px] break-all">{h.host}</code>
                <Selo tom={TOM_ESTADO[h.estado]} ponto>
                  {ROTULO_ESTADO[h.estado]}
                </Selo>
              </div>
              <p className="text-xs text-texto-3 mt-1">
                {ROTULO_TIPO[h.tipo]}
                {h.criadoEm ? ` · ligado em ${dataCurta(new Date(h.criadoEm))}` : ""}
                {h.ativoEm ? ` · no ar desde ${dataCurta(new Date(h.ativoEm))}` : ""}
              </p>
              {h.erro && <p className="text-sm text-perigo mt-2">{h.erro}</p>}
              {h.registros.length > 0 && (
                <div className="mt-3 space-y-2">
                  {h.registros.map((r) => (
                    <div key={`${r.tipo}-${r.nome}-${r.valor}`} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl bg-superficie-2 px-3 py-2">
                      <div className="flex-1 min-w-0 text-sm">
                        <span className="font-semibold">{r.acao === "remover" ? "Remover" : r.acao === "ok" ? "Certo" : "Adicionar"}</span>{" "}
                        <span className="text-texto-3">{r.tipo}</span> <span className="text-texto-2 break-all">{r.nome}</span>
                        <code className="block break-all text-texto">{r.valor}</code>
                      </div>
                      {r.acao !== "ok" && <BotaoCopiar texto={r.valor} rotulo="Copiar valor" />}
                    </div>
                  ))}
                </div>
              )}
              {h.tipo !== "www" && (
                <Botao className="mt-3" tamanho="sm" variante="fantasma" icone="lixeira" onClick={() => setRemover(h)}>
                  Remover
                </Botao>
              )}
            </li>
          ))}
        </ul>
      )}

      {hosts.some((h) => h.registros.some((r) => r.acao !== "ok")) && (
        <div className="mb-5">
          <BotaoCopiar texto={instrucoes(hosts)} rotulo="Copiar instruções para a torcida" variante="contorno" />
        </div>
      )}

      {resumo && (!temVitrine || !temPainel) && (
        <div className="space-y-3">
          {!temVitrine && (
            <Campo
              rotulo="Site da torcida (domínio raiz)"
              placeholder="furiaamapaense.com.br"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={vitrine}
              onChange={setVitrine}
              dica="Eventos, ingressos, sócios e conta. O www vem junto, redirecionando."
            />
          )}
          {!temPainel && (
            <Campo
              rotulo="Painel (subdomínio)"
              placeholder="painel.furiaamapaense.com.br"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={painel}
              onChange={setPainel}
              dica="Diretoria, subsedes e portaria. Opcional."
            />
          )}
          <Botao onClick={ligar} carregando={ocupado === "ligar"} icone="cadeado">
            Ligar domínio
          </Botao>
        </div>
      )}

      <Aviso tom="alerta" className="mt-5" titulo="Antes de mandar os registros">
        <ul className="list-disc pl-5 space-y-1">
          <li>Se já existe um site no domínio raiz, ele sai do ar (os registros antigos são trocados). O e-mail (MX) não muda.</li>
          <li>Na conta Pagar.me da torcida, inclua o domínio do site nos domínios permitidos; sem isso o pagamento com cartão não funciona (o Pix funciona).</li>
          <li>Sem DNS em 30 dias, o Firebase apaga o domínio. Avisamos a equipe com 25 dias.</li>
        </ul>
      </Aviso>

      <Modal
        aberto={!!remover}
        fechar={() => setRemover(null)}
        titulo="Remover domínio próprio"
        rodape={
          <div className="flex gap-2 justify-end">
            <Botao variante="fantasma" onClick={() => setRemover(null)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" carregando={removendo} onClick={confirmarRemocao}>
              Remover
            </Botao>
          </div>
        }
      >
        {remover && (
          <div className="space-y-3 text-sm">
            <p>
              <strong className="break-all">{remover.host}</strong> deixa de abrir o {remover.tipo === "painel" ? "painel" : "site"} da torcida
              {remover.tipo === "vitrine" ? ` (o www.${remover.host} sai junto)` : ""}.
            </p>
            <p className="text-texto-2">Links divulgados com esse endereço param de funcionar. O endereço padrão continua valendo.</p>
          </div>
        )}
      </Modal>
    </Cartao>
  );
}
