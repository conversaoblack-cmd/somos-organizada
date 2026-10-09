/** Gera o HTML estático da página inicial no build (e no servidor de desenvolvimento). */
import { renderToStaticMarkup } from "react-dom/server";
import { Landing, LINK_WHATSAPP, PERGUNTAS, type OpcoesLanding } from "./Landing";

export const URL_SITE = "https://somosorganizada.com.br";

/** Dados estruturados (schema.org) para o Google entender quem somos, o que oferecemos e as dúvidas frequentes. */
function dadosEstruturados(): string {
  const organizacao = {
    "@type": "Organization",
    "@id": `${URL_SITE}/#organizacao`,
    name: "Somos Organizada",
    url: `${URL_SITE}/`,
    logo: `${URL_SITE}/icone-512.png`,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", url: LINK_WHATSAPP, availableLanguage: "pt-BR", areaServed: "BR" },
  };
  const grafo = [
    organizacao,
    { "@type": "WebSite", "@id": `${URL_SITE}/#site`, url: `${URL_SITE}/`, name: "Somos Organizada", inLanguage: "pt-BR", publisher: { "@id": organizacao["@id"] } },
    {
      "@type": "Service",
      name: "Somos Organizada: sócios, ingressos e portaria para torcidas organizadas",
      serviceType: "Plataforma de gestão para torcidas organizadas",
      provider: { "@id": organizacao["@id"] },
      areaServed: { "@type": "Country", name: "Brasil" },
      description:
        "Programa de sócios com cobrança automática, venda de ingressos com QR Code e portaria antifraude. Os pagamentos caem direto na conta da torcida.",
    },
    {
      "@type": "FAQPage",
      mainEntity: PERGUNTAS.map((q) => ({ "@type": "Question", name: q.p, acceptedAnswer: { "@type": "Answer", text: q.r } })),
    },
  ];
  // "<" escapado para o JSON nunca fechar a tag <script> antes da hora
  return JSON.stringify({ "@context": "https://schema.org", "@graph": grafo }).replace(/</g, "\\u003c");
}

export function render(opcoes: OpcoesLanding): { corpo: string; dados: string } {
  return { corpo: renderToStaticMarkup(<Landing {...opcoes} />), dados: dadosEstruturados() };
}
