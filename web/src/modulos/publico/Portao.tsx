import type { ReactNode } from "react";
import { Link } from "react-router";
import { useMembro, useTorcida } from "@/hooks/torcida";
import type { Torcida } from "@/lib/tipos";
import { cx, Icone, TelaCarregando } from "@/ui";
import { Marca } from "./comum";

export const torcidaBloqueada = (t: Torcida) => !!t.bloqueioSaas || (t.status === "suspensa" && t.suspensaPor === "saas");
export const moduloAtivo = (t: Torcida, m: "eventos" | "socios") => t.modulos?.[m] !== false;

/**
 * Decide o que o visitante vê nas páginas públicas da torcida:
 * - site ainda não publicado → "em breve" (a equipe da torcida vê a prévia com uma faixa);
 * - mensalidade da plataforma vencida há mais de 7 dias → página indisponível para todos fora da equipe;
 * - modo demonstração → faixa avisando que os pagamentos são simulados.
 */
export function PortaoTorcida({ children }: { children: ReactNode }) {
  const { tid, torcida } = useTorcida();
  const { membro, carregando } = useMembro(tid);
  const bloqueada = torcidaBloqueada(torcida);
  const naoPublicada = torcida.publicada === false;
  const semModulos = !moduloAtivo(torcida, "eventos") && !moduloAtivo(torcida, "socios");

  if ((bloqueada || naoPublicada || semModulos) && carregando) return <TelaCarregando />;
  if (!membro) {
    if (bloqueada) return <Indisponivel />;
    if (naoPublicada || semModulos) return <EmBreve />;
  }

  const faixas: { tom: "alerta" | "info" | "perigo"; texto: ReactNode }[] = [];
  if (membro && bloqueada) {
    faixas.push({
      tom: "perigo",
      texto: (
        <>
          Página fora do ar para o público: mensalidade da plataforma em atraso.{" "}
          <Link to={`/${torcida.slug}/admin/plano`} className="underline font-semibold">Regularizar</Link>
        </>
      ),
    });
  } else if (membro && naoPublicada) {
    faixas.push({
      tom: "info",
      texto: (
        <>
          Prévia: só a equipe da torcida vê esta página.{" "}
          <Link to={`/${torcida.slug}/admin/publicar`} className="underline font-semibold">Publicar o site</Link>
        </>
      ),
    });
  }
  if (torcida.pagamentos?.ambiente === "demo") {
    faixas.push({ tom: "alerta", texto: "Demonstração: nenhum pagamento é real. Cartão de teste 4000 0000 0000 0010 aprova; 4000 0000 0000 0028 recusa." });
  } else if (torcida.pagamentos?.ambiente === "teste" && torcida.pagamentos?.configurado) {
    faixas.push({ tom: "alerta", texto: "Ambiente de teste da Pagar.me: os pagamentos não são reais." });
  }

  return (
    <>
      {faixas.map((f, i) => (
        <div
          key={i}
          role="status"
          className={cx(
            "px-4 py-2 text-center text-[13px] leading-snug font-medium border-b",
            f.tom === "perigo" && "bg-perigo/12 border-perigo/25 text-perigo",
            f.tom === "alerta" && "bg-alerta/12 border-alerta/25 text-alerta",
            f.tom === "info" && "bg-info/12 border-info/25 text-info",
          )}
        >
          {f.texto}
        </div>
      ))}
      {children}
    </>
  );
}

function TelaAviso({ icone, titulo, children }: { icone: "relogio" | "cadeado"; titulo: string; children: ReactNode }) {
  const { torcida } = useTorcida();
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="absolute inset-0 brilho-primaria pointer-events-none" />
      <header className="relative mx-auto max-w-6xl w-full h-16 px-4 sm:px-6 flex items-center">
        <Marca />
      </header>
      <main className="relative flex-1 grid place-items-center px-6 py-16">
        <div className="max-w-md text-center">
          <span className="mx-auto mb-6 grid place-items-center size-16 rounded-2xl bg-superficie-2 border border-linha">
            <Icone nome={icone} className="size-7 text-primaria" />
          </span>
          <h1 className="font-display uppercase text-3xl sm:text-4xl tracking-tight">{titulo}</h1>
          <div className="mt-4 text-texto-2">{children}</div>
          <Link to={`/${torcida.slug}/admin`} className="inline-block mt-10 text-xs text-texto-3 hover:text-texto underline">
            Sou da diretoria
          </Link>
        </div>
      </main>
    </div>
  );
}

function EmBreve() {
  const { torcida } = useTorcida();
  return (
    <TelaAviso icone="relogio" titulo="Em breve">
      A página oficial de {torcida.nome} está sendo preparada. Volte em alguns dias.
    </TelaAviso>
  );
}

function Indisponivel() {
  return (
    <TelaAviso icone="cadeado" titulo="Temporariamente indisponível">
      Esta página está fora do ar no momento. Fale com a diretoria pelos canais oficiais.
    </TelaAviso>
  );
}
