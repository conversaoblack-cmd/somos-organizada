import { useMemo } from "react";
import { Link } from "react-router";
import { collection, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { dataExtensa, diaDoMes, hora, mesAbrev } from "@/lib/formatos";
import type { Evento } from "@/lib/tipos";
import { useColecao } from "@/hooks/dados";
import { CabecalhoPagina, Cartao, Icone, Selo } from "@/ui";
import { usePainel } from "./contexto";
import { EstadoLista } from "./util";

/** Tela inicial da portaria: atalho grande para o leitor e eventos de hoje. */
export default function InicioPortaria() {
  const { tid, torcida, membro, nomeSede } = usePainel();
  const inicioHoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const q = useMemo(
    () =>
      query(
        collection(db, `torcidas/${tid}/eventos`),
        where("status", "==", "publicado"),
        where("data", ">=", Timestamp.fromDate(inicioHoje)),
        orderBy("data"),
        limit(12),
      ),
    [tid, inicioHoje],
  );
  const eventos = useColecao<Evento>(q, `portaria-eventos-${tid}-${inicioHoje.getTime()}`);
  const fimHoje = inicioHoje.getTime() + 86400_000;
  const hoje = eventos.dados.filter((e) => e.data.toMillis() < fimHoje);
  const proximos = eventos.dados.filter((e) => e.data.toMillis() >= fimHoje).slice(0, 6);

  return (
    <div className="max-w-3xl">
      <CabecalhoPagina titulo={`Olá, ${membro.nome?.split(" ")[0] || "equipe"}`} descricao="Confira os ingressos na entrada pelo leitor de QR Code." />

      <Link
        to={`/${torcida.slug}/portaria`}
        className="group relative block overflow-hidden rounded-[28px] bg-primaria text-sobre-primaria p-7 sm:p-9 shadow-[0_20px_60px_-25px_var(--color-primaria)] active:scale-[0.99] transition-transform"
      >
        <div className="absolute -right-10 -top-10 size-48 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-5">
          <span className="size-16 sm:size-20 shrink-0 rounded-2xl bg-black/15 grid place-items-center">
            <Icone nome="qr" className="size-9 sm:size-11" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-2xl sm:text-3xl font-bold leading-tight">Abrir leitor da portaria</p>
            <p className="opacity-85 mt-1">Leia o QR Code ou busque pelo CPF do titular.</p>
          </div>
          <Icone nome="setaDireita" className="size-7 shrink-0 hidden sm:block transition-transform group-hover:translate-x-1" />
        </div>
      </Link>

      <h2 className="text-lg font-bold mt-10 mb-3">Eventos de hoje</h2>
      {eventos.carregando || eventos.erro ? (
        <EstadoLista carregando={eventos.carregando} erro={eventos.erro} vazio={false} tituloVazio="" />
      ) : hoje.length === 0 ? (
        <Cartao className="p-5 text-texto-2 text-sm">Nenhum evento publicado para hoje.</Cartao>
      ) : (
        <div className="grid gap-3">
          {hoje.map((e) => (
            <ItemEvento key={e.id} e={e} sede={nomeSede(e.sedeId)} destaque />
          ))}
        </div>
      )}

      {proximos.length > 0 && (
        <>
          <h2 className="text-lg font-bold mt-10 mb-3">Próximos eventos</h2>
          <div className="grid gap-3">
            {proximos.map((e) => (
              <ItemEvento key={e.id} e={e} sede={nomeSede(e.sedeId)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ItemEvento({ e, sede, destaque }: { e: Evento & { id: string }; sede: string; destaque?: boolean }) {
  return (
    <Cartao className="p-4 flex items-center gap-4">
      <div className="size-14 shrink-0 rounded-2xl bg-superficie-2 grid place-items-center text-center leading-none">
        <span>
          <span className="block text-xl font-bold numeros">{diaDoMes(e.data)}</span>
          <span className="block text-[11px] text-texto-3 font-semibold mt-0.5">{mesAbrev(e.data)}</span>
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold truncate">{e.nome}</p>
        <p className="text-sm text-texto-3 truncate">
          {dataExtensa(e.data)} · {hora(e.data)} · {e.local || sede}
        </p>
      </div>
      <div className="text-right shrink-0">
        {destaque && <Selo tom="sucesso" ponto>Hoje</Selo>}
        <p className="text-xs text-texto-3 mt-1 numeros">
          {e.entradas ?? 0}/{e.vendidos} entradas
        </p>
      </div>
    </Cartao>
  );
}
