import { useState } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import { moeda } from "@/lib/formatos";
import { PLANOS_SAAS_PADRAO, type ConfigPlataforma, type PlanoSaas } from "@/lib/tipos";
import { useDocumento } from "@/hooks/dados";
import { Aviso, Botao, CabecalhoPagina, Cartao, cx, Icone, Selo, useToast } from "@/ui";
import { QrCode } from "@/ui/qr";
import { usePainel } from "./contexto";
import { modulosDa } from "./PrimeirosPassos";
import { useTourPagina } from "./tours";
import { BotaoCopiar, Confirmar } from "./util";

export function usePlanosSaas() {
  const cfg = useDocumento<ConfigPlataforma>("plataforma/publico");
  const valor = (p: PlanoSaas) => cfg.dados?.planos?.[p]?.valor ?? PLANOS_SAAS_PADRAO[p].valor;
  const nome = (p: PlanoSaas) => cfg.dados?.planos?.[p]?.nome ?? PLANOS_SAAS_PADRAO[p].nome;
  const limite = cfg.dados?.limiteGigante ?? 3000;
  return { valor, nome, limite, carregando: cfg.carregando };
}

/** Cartões de escolha entre Torcida pequena e Torcida grande. */
export function EscolhaPlano({ valor: escolhido, onChange, atual }: { valor: "pequena" | "grande" | null; onChange: (p: "pequena" | "grande") => void; atual?: string }) {
  const planos = usePlanosSaas();
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Plano Somos Organizada">
        {(["pequena", "grande"] as const).map((p) => {
          const sel = escolhido === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => onChange(p)}
              className={cx(
                "text-left rounded-2xl border p-5 transition-all relative",
                sel ? "border-primaria bg-primaria/10 ring-1 ring-primaria" : "border-linha bg-superficie-2 hover:border-linha-forte",
              )}
            >
              {atual === p && <Selo tom="primaria" className="absolute top-4 right-4">Plano atual</Selo>}
              <p className="font-bold text-lg">{planos.nome(p)}</p>
              <p className="text-sm text-texto-2 mt-0.5">{PLANOS_SAAS_PADRAO[p].descricao}</p>
              <p className="mt-3">
                <span className="text-3xl font-bold numeros">{moeda(planos.valor(p))}</span>
                <span className="text-texto-3 text-sm"> /mês</span>
              </p>
              <span className={cx("absolute bottom-4 right-4 size-5 rounded-full border-2 grid place-items-center", sel ? "border-primaria" : "border-linha-forte")}>
                {sel && <span className="size-2.5 rounded-full bg-primaria" />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-texto-3 mt-3 flex gap-2">
        <Icone nome="info" className="size-4 shrink-0 mt-0.5" />
        Acima de {planos.limite.toLocaleString("pt-BR")} sócios ativos o plano passa automaticamente para {planos.nome("gigante")} ({moeda(planos.valor("gigante"))}/mês).
      </p>
    </div>
  );
}

export function ExplicacaoCobranca() {
  return (
    <ul className="space-y-2 text-sm text-texto-2">
      {[
        "Pagamento só por Pix, sem multa e sem juros.",
        "A primeira fatura vence 7 dias depois de publicar. Depois, todo mês no mesmo dia.",
        "Com 7 dias de atraso, o site e as vendas saem do ar até o pagamento ser confirmado.",
        "As vendas de ingressos e mensalidades caem na conta da torcida, não passam pela Somos Organizada.",
      ].map((t) => (
        <li key={t} className="flex gap-2">
          <Icone nome="check" className="size-4 text-primaria-texto shrink-0 mt-0.5" />
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function Publicar() {
  const { tid, torcida, base, assinatura, primeirosPassos } = usePainel();
  const avisar = useToast();
  const publicada = !!torcida.publicada;
  useTourPagina(publicada ? "publicado" : "publicar");
  const [plano, setPlano] = useState<"pequena" | "grande" | null>(assinatura?.plano ?? null);
  const [confirmar, setConfirmar] = useState(false);
  const [tirar, setTirar] = useState(false);
  const planos = usePlanosSaas();
  const m = modulosDa(torcida);
  const feito = (chave: string) => primeirosPassos.find((i) => i.chave === chave)?.feito ?? false;

  const obrigatorios = [
    { ok: !!torcida.pagamentos?.configurado, titulo: "Pagamentos configurados", detalhe: "Pagar.me conectada ou modo demonstração.", para: "pagamentos?tour=admin-pagamentos" },
    { ok: m.eventos || m.socios, titulo: "Pelo menos um módulo ligado", detalhe: "Eventos, Sócios ou os dois.", para: "personalizacao?tour=admin-personalizacao" },
  ];
  const recomendados = [
    { ok: !!torcida.tema?.logoUrl, titulo: "Escudo da torcida", detalhe: "Deixa a página com a cara de vocês.", para: "personalizacao?tour=admin-personalizacao" },
    ...(m.socios ? [{ ok: feito("planos"), titulo: "Plano de sócio criado", detalhe: "Para receber associações.", para: "planos?tour=admin-planos" }] : []),
    ...(m.eventos ? [{ ok: feito("evento"), titulo: "Evento criado", detalhe: "Para vender ingressos.", para: "eventos?novo=1&tour=admin-eventos-criar" }] : []),
  ];
  const prontoParaPublicar = obrigatorios.every((o) => o.ok) && (!!assinatura || !!plano) && !torcida.bloqueioSaas;

  const site = `${location.origin}/${torcida.slug}`;
  const siteSocios = `${site}?aba=socios`;
  const textoZap = `Conheça a página oficial da ${torcida.nome}: ${m.eventos ? "ingressos dos eventos" : ""}${m.eventos && m.socios ? " e " : ""}${m.socios ? "programa de sócios" : ""}. ${site}`;

  if (publicada) {
    return (
      <div className="max-w-4xl">
        <CabecalhoPagina titulo="Publicar site" descricao="Seu site está no ar. Divulgue!" />
        <Cartao className="p-5 sm:p-6 mb-4 border-sucesso/40" data-tour="publicar-links">
          <div className="flex items-center gap-3 mb-5">
            <span className="size-12 rounded-2xl bg-sucesso/15 text-sucesso grid place-items-center">
              <Icone nome="checkCirculo" className="size-7" />
            </span>
            <div>
              <p className="text-lg font-bold">Site no ar</p>
              <p className="text-sm text-texto-2">Qualquer pessoa com o link consegue ver e comprar.</p>
            </div>
          </div>
          <div className="grid md:grid-cols-[1fr_180px] gap-6 items-start">
            <div className="space-y-4 min-w-0">
              <LinkSite rotulo="Página da torcida" url={site} />
              {m.socios && <LinkSite rotulo="Direto na aba de sócios" url={siteSocios} />}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(textoZap)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl font-semibold bg-primaria text-sobre-primaria hover:brightness-110 w-full sm:w-auto"
              >
                <Icone nome="whatsapp" className="size-5" /> Compartilhar no WhatsApp
              </a>
            </div>
            <div className="text-center">
              <QrCode valor={site} className="w-40 mx-auto" />
              <p className="text-xs text-texto-3 mt-2">Imprima e cole na sede ou mostre nos eventos.</p>
            </div>
          </div>
        </Cartao>
        <Cartao className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="font-semibold">Tirar o site do ar</p>
            <p className="text-sm text-texto-3">A página deixa de aparecer para o público e as vendas param. Nada é apagado; dá para publicar de novo.</p>
          </div>
          <Botao variante="perigo" icone="xCirculo" onClick={() => setTirar(true)} data-tour="publicar-tirar">
            Tirar do ar
          </Botao>
        </Cartao>
        <Confirmar
          aberto={tirar}
          fechar={() => setTirar(false)}
          titulo="Tirar o site do ar?"
          rotulo="Tirar do ar"
          perigo
          acao={async () => {
            await api.despublicarSite({ tid });
            avisar("Site fora do ar. Só a sua equipe consegue ver.", "sucesso");
          }}
        >
          Ninguém de fora consegue comprar ingressos nem se associar enquanto o site estiver fora do ar. A mensalidade da plataforma continua valendo.
        </Confirmar>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <CabecalhoPagina titulo="Publicar site" descricao="Confira o que falta, escolha o plano e coloque a página da torcida no ar." />

      {torcida.bloqueioSaas && (
        <Aviso tom="perigo" titulo="Mensalidade em atraso" className="mb-4" acao={<Link to={`${base}/plano`} className="underline">Ir para o plano</Link>}>
          Regularize a fatura em aberto para publicar.
        </Aviso>
      )}

      <Cartao className="p-5 sm:p-6 mb-4" data-tour="publicar-checklist">
        <h2 className="font-bold text-lg">O que falta</h2>
        <p className="text-sm font-semibold text-texto-3 uppercase tracking-wide mt-4 mb-1">Obrigatório</p>
        <ul className="divide-y divide-linha">
          {obrigatorios.map((o) => (
            <ItemChecklist key={o.titulo} {...o} base={base} />
          ))}
        </ul>
        <p className="text-sm font-semibold text-texto-3 uppercase tracking-wide mt-4 mb-1">Recomendado</p>
        <ul className="divide-y divide-linha">
          {recomendados.map((o) => (
            <ItemChecklist key={o.titulo} {...o} base={base} recomendado />
          ))}
        </ul>
      </Cartao>

      {!assinatura ? (
        <Cartao className="p-5 sm:p-6 mb-4" data-tour="publicar-planos">
          <h2 className="font-bold text-lg">Plano Somos Organizada</h2>
          <p className="text-sm text-texto-2 mt-1 mb-4">A mensalidade da plataforma. Você pode trocar entre os planos depois.</p>
          <EscolhaPlano valor={plano} onChange={setPlano} />
        </Cartao>
      ) : (
        <Aviso tom="info" className="mb-4" titulo={`Plano ${planos.nome(assinatura.plano)}`}>
          Seu plano já está escolhido. Para trocar, vá em <Link to={`${base}/plano`} className="underline">Plano Somos Organizada</Link>.
        </Aviso>
      )}

      <Cartao className="p-5 sm:p-6 mb-6" data-tour="publicar-cobranca">
        <h2 className="font-bold text-lg mb-3">Como funciona a cobrança</h2>
        <ExplicacaoCobranca />
      </Cartao>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Botao tamanho="lg" icone="raio" disabled={!prontoParaPublicar} onClick={() => setConfirmar(true)} data-tour="publicar-botao">
          Publicar site
        </Botao>
        {!prontoParaPublicar && (
          <p className="text-sm text-texto-3">
            {!obrigatorios.every((o) => o.ok) ? "Complete os itens obrigatórios acima." : !assinatura && !plano ? "Escolha um plano." : ""}
          </p>
        )}
      </div>

      <Confirmar
        aberto={confirmar}
        fechar={() => setConfirmar(false)}
        titulo="Publicar o site da torcida?"
        rotulo="Publicar agora"
        acao={async () => {
          await api.publicarSite({ tid, ...(assinatura ? {} : { plano: plano! }) });
          avisar("Site publicado! Agora é só divulgar.", "sucesso");
        }}
      >
        A página fica visível para todo mundo e as vendas começam.
        {!assinatura && plano && (
          <strong className="block text-texto mt-2">
            Plano {planos.nome(plano)}: {moeda(planos.valor(plano))}/mês, primeira fatura em 7 dias, por Pix.
          </strong>
        )}
        {torcida.pagamentos?.ambiente === "demo" && (
          <span className="block mt-2 text-alerta">Atenção: os pagamentos estão em modo demonstração. Ninguém consegue pagar de verdade até conectar a Pagar.me.</span>
        )}
      </Confirmar>
    </div>
  );
}

function ItemChecklist({ ok, titulo, detalhe, para, base, recomendado }: { ok: boolean; titulo: string; detalhe: string; para: string; base: string; recomendado?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={cx(
          "size-8 shrink-0 rounded-full grid place-items-center",
          ok ? "bg-sucesso/15 text-sucesso" : recomendado ? "bg-superficie-2 text-texto-3" : "bg-alerta/15 text-alerta",
        )}
      >
        <Icone nome={ok ? "check" : recomendado ? "info" : "alerta"} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cx("font-medium", ok && "text-texto-2")}>{titulo}</p>
        <p className="text-xs text-texto-3">{detalhe}</p>
      </div>
      {!ok && (
        <Link to={`${base}/${para}`} className="text-sm font-semibold text-primaria-texto hover:underline shrink-0">
          Resolver
        </Link>
      )}
    </li>
  );
}

function LinkSite({ rotulo, url }: { rotulo: string; url: string }) {
  return (
    <div>
      <p className="text-sm text-texto-3 mb-1">{rotulo}</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <code className="flex-1 min-w-0 truncate rounded-xl bg-superficie-2 border border-linha px-3 h-10 leading-10 text-sm text-texto">{url}</code>
        <div className="flex gap-2">
          <BotaoCopiar texto={url} rotulo="Copiar" className="h-10" />
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-sm font-semibold bg-superficie-2 hover:bg-superficie-3">
            <Icone nome="externo" className="size-4" /> Abrir
          </a>
        </div>
      </div>
    </div>
  );
}
