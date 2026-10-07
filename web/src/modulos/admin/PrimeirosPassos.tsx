import { useMemo } from "react";
import { TEMA_PADRAO } from "@/lib/tema";
import { Link } from "react-router";
import { collection, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ComId, Evento, Membro, Plano, Sede, Torcida, Papel } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { BotaoLink, CabecalhoPagina, Cartao, cx, Icone, Selo } from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";

export interface ItemPrimeiroPasso {
  chave: string;
  titulo: string;
  descricao: string;
  feito: boolean;
  opcional?: boolean;
  /** Rota relativa a /:slug/admin, já com ?tour= para abrir o passo a passo da página. */
  para: string;
  acao: string;
}

export const modulosDa = (t: Torcida) => ({ eventos: t.modulos?.eventos !== false, socios: t.modulos?.socios !== false });

/** Lista de primeiros passos com o status calculado dos dados reais. */
export function usePrimeirosPassos(args: { tid: string; torcida: ComId<Torcida>; papel: Papel; sedeEscopo: string | null; sedes: ComId<Sede>[] }): ItemPrimeiroPasso[] {
  const { tid, torcida, papel, sedeEscopo, sedes } = args;
  const diretoria = papel === "diretoria";
  const subsede = papel === "subsede" && !!sedeEscopo;
  const planos = useColecao<Plano>(diretoria ? query(collection(db, `torcidas/${tid}/planos`), where("ativo", "==", true), limit(1)) : null, `pp-planos-${tid}-${diretoria}`);
  const eventos = useColecao<Evento>(
    diretoria
      ? query(collection(db, `torcidas/${tid}/eventos`), limit(1))
      : subsede
        ? query(collection(db, `torcidas/${tid}/eventos`), where("sedeId", "==", sedeEscopo), limit(30))
        : null,
    `pp-eventos-${tid}-${papel}-${sedeEscopo}`,
  );
  const membrosSubsede = useColecao<Membro>(
    diretoria ? query(collection(db, `torcidas/${tid}/membros`), where("papel", "==", "subsede"), limit(1)) : null,
    `pp-membros-${tid}-${diretoria}`,
  );

  return useMemo(() => {
    if (diretoria) {
      const m = modulosDa(torcida);
      const p = torcida.pagamentos;
      const subsedes = sedes.filter((s) => s.tipo === "subsede");
      const itens: ItemPrimeiroPasso[] = [
        {
          chave: "personalizar",
          titulo: "Personalizar a página",
          descricao: "Cores, escudo, banner e textos da torcida.",
          // escudo/banner enviados ou cores trocadas (as padrão são as do Brasil)
          feito: !!(torcida.tema?.logoUrl || torcida.tema?.bannerUrl || (torcida.tema?.corPrimaria && torcida.tema.corPrimaria.toUpperCase() !== TEMA_PADRAO.corPrimaria)),
          para: "personalizacao?tour=admin-personalizacao",
          acao: "Personalizar",
        },
        {
          chave: "modulos",
          titulo: "Escolher o que o site oferece",
          descricao: "Venda de ingressos (Eventos), associação de Sócios ou os dois.",
          feito: torcida.modulos !== undefined,
          para: "personalizacao?tour=admin-personalizacao",
          acao: "Escolher",
        },
        {
          chave: "pagamentos",
          titulo: "Configurar pagamentos",
          descricao: "Conecte a Pagar.me da torcida ou use o modo demonstração para testar.",
          feito: !!p?.configurado,
          para: "pagamentos?tour=admin-pagamentos",
          acao: "Configurar",
        },
        {
          chave: "split",
          titulo: "Ativar divisão com as subsedes",
          descricao: "Cada subsede recebe as vendas dos próprios eventos direto na conta dela.",
          feito: !!p?.splitAtivo,
          opcional: true,
          para: "pagamentos?tour=admin-pagamentos",
          acao: "Ver como",
        },
      ];
      if (m.socios)
        itens.push({
          chave: "planos",
          titulo: "Criar os planos de sócio",
          descricao: "Mensal, anual, mirim... com valor e benefícios.",
          feito: planos.dados.length > 0,
          para: "planos?tour=admin-planos",
          acao: "Criar plano",
        });
      if (m.eventos)
        itens.push({
          chave: "evento",
          titulo: "Criar o primeiro evento",
          descricao: "Caravana, festa, jogo: com preço para sócio e para o público.",
          feito: eventos.dados.length > 0,
          para: "eventos?novo=1&tour=admin-eventos-criar",
          acao: "Criar evento",
        });
      itens.push(
        {
          chave: "subsedes",
          titulo: "Cadastrar subsedes e convidar os diretores",
          descricao: "Cada subsede ganha o próprio painel para criar eventos e receber.",
          feito: subsedes.length > 0 && membrosSubsede.dados.length > 0,
          opcional: true,
          para: subsedes.length ? "usuarios?tour=admin-usuarios" : "sedes?tour=admin-sedes",
          acao: subsedes.length ? "Convidar" : "Cadastrar",
        },
        {
          chave: "publicar",
          titulo: "Publicar o site",
          descricao: "Escolha o plano Somos Organizada e coloque a página no ar.",
          feito: !!torcida.publicada,
          para: "publicar?tour=admin-publicar",
          acao: "Publicar",
        },
      );
      return itens;
    }
    if (papel === "subsede") {
      const sede = sedes.find((s) => s.id === sedeEscopo);
      const enviados = eventos.dados.filter((e) => e.status !== "rascunho" && e.status !== "cancelado");
      return [
        { chave: "senha", titulo: "Criar sua senha", descricao: "Você já entrou no painel.", feito: true, para: "", acao: "" },
        {
          chave: "recebedor",
          titulo: "Cadastrar a conta de recebimento",
          descricao: "Dados do responsável, conta bancária no seu CPF e prova de vida pelo celular.",
          feito: sede?.recebedor?.status === "active",
          para: "recebimentos?tour=subsede-recebimentos",
          acao: "Cadastrar",
        },
        {
          chave: "evento",
          titulo: "Criar um evento e enviar para aprovação",
          descricao: "A diretoria confere e publica.",
          feito: enviados.length > 0,
          para: "eventos?novo=1&tour=subsede-eventos-criar",
          acao: "Criar evento",
        },
        {
          chave: "vendas",
          titulo: "Acompanhar vendas e repasses",
          descricao: "Veja o que caiu direto na sua conta e o que a diretoria repassou.",
          feito: eventos.dados.some((e) => e.status === "publicado" || e.status === "encerrado"),
          para: "financeiro?tour=subsede-financeiro",
          acao: "Ver financeiro",
        },
      ];
    }
    return [];
  }, [diretoria, papel, torcida, sedes, sedeEscopo, planos.dados.length, eventos.dados, membrosSubsede.dados.length]);
}

function ListaPassos({ itens, compacta }: { itens: ItemPrimeiroPasso[]; compacta?: boolean }) {
  const { base } = usePainel();
  const primeiroPendente = itens.find((i) => !i.feito && !i.opcional)?.chave ?? itens.find((i) => !i.feito)?.chave;
  return (
    <ol className="divide-y divide-linha">
      {itens.map((it, n) => (
        <li
          key={it.chave}
          className={cx("flex items-center gap-3 py-3.5", compacta && it.feito && "hidden sm:flex")}
          data-tour={it.chave === primeiroPendente ? "primeiro-pendente" : undefined}
        >
          <span
            className={cx(
              "size-9 shrink-0 rounded-full grid place-items-center text-sm font-bold",
              it.feito ? "bg-sucesso/15 text-sucesso" : it.chave === primeiroPendente ? "bg-primaria text-sobre-primaria" : "bg-superficie-2 text-texto-2",
            )}
          >
            {it.feito ? <Icone nome="check" className="size-5" /> : n + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cx("font-semibold leading-snug", it.feito && "text-texto-2")}>
              {it.titulo}
              {it.opcional && <span className="text-xs font-normal text-texto-3"> · opcional</span>}
            </p>
            {!compacta && <p className="text-sm text-texto-3 mt-0.5">{it.descricao}</p>}
          </div>
          {it.feito ? (
            <Selo tom="sucesso" className="shrink-0">
              Feito
            </Selo>
          ) : it.para ? (
            <BotaoLink
              to={`${base}/${it.para}`}
              tamanho="sm"
              variante={it.chave === primeiroPendente ? "primaria" : "suave"}
              iconeDireita="setaDireita"
              className="shrink-0"
            >
              <span className="hidden sm:inline">{it.acao}</span>
              <span className="sm:hidden">Fazer</span>
            </BotaoLink>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Cartão da Visão geral: fica visível até concluir os passos obrigatórios. */
export function CartaoPrimeirosPassos() {
  const { primeirosPassos: itens, base } = usePainel();
  const obrigatorios = itens.filter((i) => !i.opcional);
  const feitos = obrigatorios.filter((i) => i.feito).length;
  if (!itens.length || feitos === obrigatorios.length) return null;
  return (
    <Cartao className="p-5 sm:p-6 mb-6 border-primaria/35" data-tour="primeiros-passos">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Primeiros passos</h2>
          <p className="text-sm text-texto-2">
            {feitos} de {obrigatorios.length} concluídos
          </p>
        </div>
        <Link to={`${base}/primeiros-passos`} className="text-sm text-texto-2 hover:text-texto inline-flex items-center gap-1 shrink-0">
          Ver tudo <Icone nome="chevronDireita" className="size-4" />
        </Link>
      </div>
      <div className="h-2 rounded-full bg-superficie-3 overflow-hidden mt-3">
        <div className="h-full bg-primaria rounded-full transition-all" style={{ width: `${(feitos / Math.max(1, obrigatorios.length)) * 100}%` }} />
      </div>
      <div className="mt-2">
        <ListaPassos itens={itens} compacta />
      </div>
    </Cartao>
  );
}

export default function PrimeirosPassos() {
  const { primeirosPassos: itens, ehDiretoria } = usePainel();
  useTourPagina("primeiros-passos");
  const obrigatorios = itens.filter((i) => !i.opcional);
  const feitos = obrigatorios.filter((i) => i.feito).length;
  const tudo = feitos === obrigatorios.length;
  return (
    <div className="max-w-3xl">
      <CabecalhoPagina
        titulo="Primeiros passos"
        descricao={
          ehDiretoria
            ? "O caminho para colocar o site da torcida no ar. Cada item abre a página certa já com o passo a passo."
            : "O que a sua subsede precisa fazer para vender eventos."
        }
      />
      {tudo && (
        <Cartao className="p-5 mb-4 border-sucesso/40 flex items-center gap-3">
          <span className="size-10 rounded-xl bg-sucesso/15 text-sucesso grid place-items-center">
            <Icone nome="checkCirculo" className="size-6" />
          </span>
          <p className="font-semibold">Tudo pronto! Você concluiu os primeiros passos.</p>
        </Cartao>
      )}
      <Cartao className="px-5 sm:px-6 py-2" data-tour="lista-primeiros-passos">
        <div className="h-2 rounded-full bg-superficie-3 overflow-hidden mt-4">
          <div className="h-full bg-primaria rounded-full" style={{ width: `${(feitos / Math.max(1, obrigatorios.length)) * 100}%` }} />
        </div>
        <p className="text-sm text-texto-3 mt-2">
          {feitos} de {obrigatorios.length} obrigatórios concluídos
        </p>
        <ListaPassos itens={itens} />
      </Cartao>
    </div>
  );
}
