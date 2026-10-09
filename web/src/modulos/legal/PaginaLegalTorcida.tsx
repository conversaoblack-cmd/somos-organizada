/**
 * /{torcida}/termos e /{torcida}/privacidade: Termos de uso e Política de privacidade da torcida para o torcedor
 * (comprador de ingresso e sócio), nas cores da torcida. A torcida é a vendedora e a controladora dos dados.
 */
import { useEffect } from "react";
import { useTorcida } from "@/hooks/torcida";
import { CabecalhoTorcida, RodapeTorcida } from "../publico/comum";
import { Documento } from "./Documento";
import { privacidadeTorcida, termosTorcida, type InfoTorcida } from "./conteudo";

export default function PaginaLegalTorcida({ tipo }: { tipo: "termos" | "privacidade" }) {
  const { torcida } = useTorcida();
  const termos = tipo === "termos";
  const titulo = termos ? "Termos de uso" : "Política de privacidade";
  useEffect(() => {
    document.title = `${titulo} · ${torcida.nome}`;
  }, [titulo, torcida.nome]);
  const info: InfoTorcida = {
    nome: torcida.nome,
    slug: torcida.slug,
    taxaServicoPct: torcida.taxaServicoPct,
    ...torcida.identificacao,
    email: torcida.contato?.email,
    whatsapp: torcida.contato?.whatsapp,
  };
  const base = `/${torcida.slug}`;
  return (
    <div className="min-h-dvh flex flex-col">
      <CabecalhoTorcida />
      <main className="flex-1">
        <Documento
          titulo={titulo}
          subtitulo={
            termos ? (
              <p>
                Regras para comprar ingressos e ser sócio da <strong className="text-texto">{torcida.nome}</strong> por este site.
              </p>
            ) : (
              <p>
                Como a <strong className="text-texto">{torcida.nome}</strong> trata os dados de quem compra ingresso ou é sócio por este site.
              </p>
            )
          }
          secoes={termos ? termosTorcida(info) : privacidadeTorcida(info)}
          outro={termos ? { href: `${base}/privacidade`, texto: "Política de privacidade" } : { href: `${base}/termos`, texto: "Termos de uso" }}
        />
      </main>
      <RodapeTorcida />
    </div>
  );
}
