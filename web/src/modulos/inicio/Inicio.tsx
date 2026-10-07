import { useEffect } from "react";
import { aplicarTema, TEMA_PADRAO } from "@/lib/tema";
import { BotaoLink, Icone } from "@/ui";
import { moeda } from "@/lib/formatos";
import { ORDEM_PLANOS, usePlanosSaas } from "./planos";

const WHATSAPP = "5571994095784";

/** Apresentação da plataforma Somos Organizada. */
export default function Inicio() {
  useEffect(() => {
    aplicarTema(TEMA_PADRAO);
    document.title = "Somos Organizada · Sócios e ingressos para torcidas organizadas";
  }, []);
  const contato = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Quero conhecer a Somos Organizada para a minha torcida.")}`;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="mx-auto max-w-6xl w-full px-4 sm:px-6 h-16 flex items-center justify-between">
        <span className="font-display uppercase tracking-tight flex items-center gap-2">
          <span className="grid grid-cols-2 gap-0.5 size-7 p-1 rounded-lg bg-superficie-2 border border-linha">
            <span className="rounded-[2px] bg-primaria" />
            <span className="rounded-[2px] bg-secundaria" />
            <span className="rounded-[2px] bg-info" />
            <span className="rounded-[2px] bg-texto" />
          </span>
          Somos Organizada
        </span>
        <BotaoLink to="/entrar" variante="contorno" tamanho="sm" icone="usuario">
          Entrar
        </BotaoLink>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 brilho-primaria" />
        <div className="absolute inset-0 grade-fundo" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primaria">Gestão profissional para torcidas organizadas</p>
          <h1 className="font-display uppercase text-[34px] min-[400px]:text-[40px] leading-[0.95] sm:text-7xl max-w-4xl mt-4 break-words">
            Sócios e ingressos. <span className="text-secundaria">Caixa forte</span>, torcida independente.
          </h1>
          <p className="text-texto-2 text-lg sm:text-xl max-w-2xl mt-6">
            As duas maiores fontes de receita da torcida numa plataforma só: associação com cobrança automática e venda de ingressos com QR na portaria.
            O dinheiro cai direto na conta da torcida.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <BotaoLink to="/cadastro" tamanho="lg" icone="bandeira">
              Cadastrar minha torcida
            </BotaoLink>
            <BotaoLink to="/brasil" variante="contorno" tamanho="lg" iconeDireita="setaDireita">
              Ver demonstração
            </BotaoLink>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl w-full px-4 sm:px-6 py-16 grid md:grid-cols-3 gap-4">
        {[
          ["escudo", "Programa de sócios", "Planos mensal, anual, mirim e o que a diretoria quiser. Pix ou cartão recorrente, carteirinha digital e inadimplência automática."],
          ["ingresso", "Ingressos e eventos", "Calendário com eventos de todas as sedes. Preço de sócio e público, ingresso nominal com QR e controle de entrada."],
          ["grafico", "Painel da diretoria", "KPIs de cada frente, extrato por subsede, repasses, usuários com permissão por sede e página com as cores da torcida."],
        ].map(([ic, t, d]) => (
          <div key={t} className="rounded-cartao border border-linha bg-superficie p-6">
            <span className="size-11 rounded-2xl bg-primaria/15 text-primaria grid place-items-center">
              <Icone nome={ic as "escudo"} className="size-6" />
            </span>
            <h2 className="font-bold text-lg mt-4">{t}</h2>
            <p className="text-texto-2 mt-2 text-sm leading-relaxed">{d}</p>
          </div>
        ))}
      </section>

      <SecaoPlanos />

      <section className="mx-auto max-w-6xl w-full px-4 sm:px-6 pb-20">
        <div className="rounded-cartao border border-linha bg-superficie p-8 sm:p-10 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <h2 className="text-2xl font-bold">Taxa de serviço de 10% fica com a torcida</h2>
            <p className="text-texto-2 mt-2 max-w-2xl">
              O ingresso cobre o custo do evento, a mensalidade mantém as sedes e a taxa vira caixa. A plataforma cobra só uma mensalidade fixa da diretoria, paga no Pix.
            </p>
          </div>
          <a href={contato} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-2xl bg-secundaria text-sobre-secundaria font-bold">
            Falar com a equipe
          </a>
        </div>
      </section>

      <footer className="mt-auto border-t border-linha py-6 text-center text-xs text-texto-3">
        Somos Organizada · Uma solução Conversão Black
      </footer>
    </div>
  );
}

function SecaoPlanos() {
  const { planos, limiteGigante } = usePlanosSaas();
  const detalhes: Record<string, string[]> = {
    pequena: ["Eventos e programa de sócios", "Página com as cores da torcida", "Painel da diretoria e portaria"],
    grande: ["Tudo do plano pequena", "Várias subsedes com repasses", "Usuários por sede"],
    gigante: [`Acima de ${limiteGigante.toLocaleString("pt-BR")} sócios ativos`, "Muda sozinho, sem precisar pedir", "Tudo do plano grande"],
  };
  return (
    <section id="planos" className="mx-auto max-w-6xl w-full px-4 sm:px-6 pb-16" aria-labelledby="titulo-planos">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primaria">Planos</p>
      <h2 id="titulo-planos" className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">
        Uma mensalidade fixa. Sem taxa sobre as vendas.
      </h2>
      <p className="text-texto-2 mt-2 max-w-2xl">
        A cobrança só começa quando a diretoria publica o site. Pagamento <strong className="text-texto">só no Pix</strong>, sem multa e sem juros.
      </p>
      <div className="grid gap-4 md:grid-cols-3 mt-8">
        {ORDEM_PLANOS.map((k) => {
          const destaque = k === "grande";
          return (
            <div
              key={k}
              className={`rounded-cartao border p-6 flex flex-col ${destaque ? "border-primaria bg-primaria/8 ring-1 ring-primaria" : "border-linha bg-superficie"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-lg">{planos[k].nome}</h3>
                {k === "gigante" && <span className="text-[11px] font-bold uppercase rounded-full bg-secundaria text-sobre-secundaria px-2 py-0.5">Automático</span>}
                {destaque && <span className="text-[11px] font-bold uppercase rounded-full bg-primaria text-sobre-primaria px-2 py-0.5">Mais escolhido</span>}
              </div>
              <p className="mt-3">
                <span className="text-4xl font-bold numeros">{moeda(planos[k].valor).replace(",00", "")}</span>
                <span className="text-texto-3"> /mês</span>
              </p>
              <p className="text-sm text-texto-2 mt-1">{planos[k].descricao}</p>
              <ul className="mt-5 space-y-2 text-sm flex-1">
                {detalhes[k]!.map((d) => (
                  <li key={d} className="flex gap-2">
                    <Icone nome="check" className="size-4 text-primaria shrink-0 mt-0.5" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4 rounded-cartao border border-linha bg-superficie p-5">
        <Icone nome="pix" className="size-8 text-primaria shrink-0" />
        <p className="text-sm text-texto-2 flex-1">
          1ª mensalidade vence 7 dias depois de publicar o site. Pagamento só no Pix, sem multa nem juros. Com 7 dias de atraso o site sai do ar até o Pix ser
          confirmado.
        </p>
        <BotaoLink to="/cadastro" iconeDireita="setaDireita">
          Cadastrar minha torcida
        </BotaoLink>
      </div>
    </section>
  );
}
