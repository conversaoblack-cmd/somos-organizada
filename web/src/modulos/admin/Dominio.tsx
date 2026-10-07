import { CabecalhoPagina, Cartao, Icone, Selo } from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { BotaoCopiar } from "./util";

/** Domínio próprio: ainda não disponível. Mostra o endereço atual. */
export default function Dominio() {
  const { torcida } = usePainel();
  useTourPagina("dominio");
  const endereco = `somosorganizada.com.br/${torcida.slug}`;
  return (
    <div className="max-w-3xl">
      <CabecalhoPagina titulo="Domínio" descricao="O endereço da página da torcida na internet." />
      <Cartao className="p-5 sm:p-6 mb-4" data-tour="dominio">
        <p className="text-sm text-texto-3">Endereço atual</p>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded-xl bg-superficie-2 border border-linha px-3 py-2.5 text-[15px] text-texto">{endereco}</code>
          <BotaoCopiar texto={`https://${endereco}`} rotulo="Copiar" />
        </div>
      </Cartao>
      <Cartao className="p-5 sm:p-6 flex items-start gap-4 opacity-90">
        <span className="size-12 shrink-0 rounded-2xl bg-superficie-2 text-texto-3 grid place-items-center">
          <Icone nome="cadeado" className="size-6" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-lg">Domínio próprio</p>
            <Selo tom="info">Em breve</Selo>
          </div>
          <p className="text-texto-2 mt-1">
            Use um endereço da torcida, como <strong className="text-texto">ingressos.suatorcida.com.br</strong>. Estamos preparando esta opção; avisaremos
            quando estiver disponível.
          </p>
        </div>
      </Cartao>
    </div>
  );
}
