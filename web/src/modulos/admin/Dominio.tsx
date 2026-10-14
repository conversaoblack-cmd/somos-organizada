import { CabecalhoPagina, Cartao, Icone, Selo } from "@/ui";
import { origemTorcidas } from "@/lib/hosts";
import { linkWhatsappEquipe } from "@/lib/contato";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { BotaoCopiar } from "./util";

/** Uma linha de endereço com botão de copiar. */
function Endereco({ rotulo, endereco, detalhe }: { rotulo: string; endereco: string; detalhe?: string }) {
  return (
    <div>
      <p className="text-sm text-texto-3">{rotulo}</p>
      <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded-xl bg-superficie-2 border border-linha px-3 py-2.5 text-[15px] text-texto">{endereco}</code>
        <BotaoCopiar texto={`https://${endereco}`} rotulo="Copiar" />
      </div>
      {detalhe && <p className="text-xs text-texto-3 mt-1.5">{detalhe}</p>}
    </div>
  );
}

/**
 * Domínio: mostra o endereço da torcida. O domínio próprio (ex.: suatorcida.com.br) não é autoatendimento: a diretoria
 * fala com o comercial e a equipe liga pelo painel da plataforma. Ligado, ele aparece aqui como endereço principal.
 */
export default function Dominio() {
  const { torcida } = usePainel();
  useTourPagina("dominio");
  const padrao = `${origemTorcidas().replace(/^https?:\/\//, "")}/${torcida.slug}`;
  const vitrine = torcida.dominio?.vitrine;
  const painel = torcida.dominio?.painel;
  const temProprio = !!(vitrine || painel);
  const falar = linkWhatsappEquipe(
    temProprio
      ? `Olá! Sou da diretoria da ${torcida.nome} (${padrao}) e quero falar sobre o nosso domínio próprio.`
      : `Olá! Sou da diretoria da ${torcida.nome} (${padrao}) e quero um domínio próprio para o site da torcida.`,
  );
  return (
    <div className="max-w-3xl">
      <CabecalhoPagina titulo="Domínio" descricao="O endereço da página da torcida na internet." />
      <Cartao className="p-5 sm:p-6 mb-4 space-y-5" data-tour="dominio">
        {temProprio ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-lg">Domínio próprio</p>
              <Selo tom="sucesso">No ar</Selo>
            </div>
            {vitrine && <Endereco rotulo="Site da torcida (eventos, ingressos e sócios)" endereco={vitrine} detalhe={`www.${vitrine} leva para o mesmo site.`} />}
            {painel && <Endereco rotulo="Painel (diretoria, subsedes e portaria)" endereco={painel} />}
            <Endereco rotulo="Também funciona" endereco={padrao} detalhe="O endereço da Somos Organizada continua valendo para sempre: links antigos não quebram." />
          </>
        ) : (
          <Endereco rotulo="Endereço atual" endereco={padrao} detalhe="Este endereço é para sempre. Divulgue sem medo nos grupos e nas redes." />
        )}
      </Cartao>
      <Cartao className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-4">
        <span className="size-12 shrink-0 rounded-2xl bg-superficie-2 text-texto-2 grid place-items-center">
          <Icone nome="cadeado" className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-lg">{temProprio ? "Mudar ou ampliar o domínio" : "Quer um endereço só da torcida?"}</p>
          <p className="text-texto-2 mt-1">
            {temProprio ? (
              "Para trocar o domínio, ligar o painel num subdomínio ou tirar o domínio próprio, fale com a nossa equipe."
            ) : (
              <>
                Dá para usar um domínio da torcida, como <strong className="text-texto">suatorcida.com.br</strong> para o site e{" "}
                <strong className="text-texto">painel.suatorcida.com.br</strong> para o painel. A nossa equipe faz a ligação com você e o endereço atual
                continua funcionando.
              </>
            )}
          </p>
          <a
            href={falar}
            target="_blank"
            rel="noopener"
            className="mt-4 inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-2xl bg-primaria text-sobre-primaria font-semibold text-center"
          >
            <Icone nome="whatsapp" className="size-5 shrink-0" />
            {temProprio ? "Falar com a equipe" : "Quero um domínio próprio: falar com o comercial"}
          </a>
        </div>
      </Cartao>
    </div>
  );
}
