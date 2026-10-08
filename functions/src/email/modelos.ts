/**
 * Modelos de e-mail com a cara da torcida (cor principal, escudo e nome).
 * Regra: nenhum e-mail leva ingresso ou QR Code. Todos levam a pessoa para a conta dela, onde o ingresso está.
 * HTML em tabelas e estilos inline: é o que funciona no Gmail, Outlook e apps de celular.
 */
import type { Torcida } from "../dominio/tipos";
import type { Mensagem } from "./enviar";

const FUSO = "America/Sao_Paulo";

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function dataHora(d: Date): string {
  const data = d.toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "long", day: "2-digit", month: "long" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
  return `${data.charAt(0).toUpperCase()}${data.slice(1)}, às ${hora}`;
}
export const dataCurta = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

/** Texto preto ou branco, o que tiver mais contraste com a cor. */
function sobre(cor: string): string {
  const h = /^#?([0-9a-f]{6})$/i.exec(cor.trim())?.[1];
  if (!h) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#111111" : "#ffffff";
}

/** Cor clara (amarelo, branco) some no fundo branco: escurece para usar em texto. */
function corParaTexto(cor: string): string {
  if (sobre(cor) !== "#111111") return cor;
  const h = cor.replace("#", "");
  return "#" + [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.5).toString(16).padStart(2, "0")).join("");
}

function corValida(c: string | undefined, padrao: string) {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : padrao;
}

interface Bloco {
  /** linha pequena acima do título */
  selo: string;
  titulo: string;
  /** parágrafos em HTML já escapado */
  paragrafos: string[];
  /** linhas de detalhe (rótulo → valor), já escapadas */
  detalhes?: [string, string][];
  /** lista com marcadores (ex.: titulares), já escapada */
  lista?: { titulo: string; itens: string[] };
  botao: { texto: string; url: string };
  /** aviso em destaque abaixo do botão */
  nota?: string;
  /** texto pequeno de rodapé específico do e-mail */
  rodape?: string;
}

export function montar(torcida: Torcida, assunto: string, para: Mensagem["para"], b: Bloco): Mensagem {
  const cor = corValida(torcida.tema?.corPrimaria, "#2E6BFF");
  const corTexto = sobre(cor);
  const corDestaque = corParaTexto(cor);
  const nome = esc(torcida.nome);
  const escudo = torcida.tema?.logoUrl
    ? `<img src="${esc(torcida.tema.logoUrl)}" width="56" height="56" alt="${nome}" style="display:block;width:56px;height:56px;border-radius:14px;object-fit:contain;background:#ffffff;border:0;">`
    : `<div style="width:56px;height:56px;border-radius:14px;background:rgba(255,255,255,.18);color:${corTexto};font:800 22px/56px Arial,Helvetica,sans-serif;text-align:center;">${esc(torcida.nome.trim().charAt(0).toUpperCase())}</div>`;

  const detalhes = b.detalhes?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;border:1px solid #e7e7ea;border-radius:14px;border-collapse:separate;">
        ${b.detalhes
          .map(
            ([r, v], i) => `<tr><td style="padding:12px 16px;${i ? "border-top:1px solid #efeff2;" : ""}font:500 13px/1.4 Arial,Helvetica,sans-serif;color:#6b6b76;width:38%;vertical-align:top;">${r}</td>
            <td style="padding:12px 16px;${i ? "border-top:1px solid #efeff2;" : ""}font:700 14px/1.4 Arial,Helvetica,sans-serif;color:#17171c;vertical-align:top;">${v}</td></tr>`,
          )
          .join("")}
      </table>`
    : "";
  const lista = b.lista
    ? `<p style="margin:22px 0 8px;font:700 13px/1.4 Arial,Helvetica,sans-serif;color:#6b6b76;text-transform:uppercase;letter-spacing:.08em;">${b.lista.titulo}</p>
       ${b.lista.itens.map((i) => `<p style="margin:0 0 6px;font:500 15px/1.5 Arial,Helvetica,sans-serif;color:#17171c;"><span style="color:${corDestaque};font-weight:800;">●</span>&nbsp; ${i}</p>`).join("")}`
    : "";
  const nota = b.nota
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;"><tr><td style="padding:14px 16px;border-radius:12px;background:#f5f5f7;font:500 13px/1.55 Arial,Helvetica,sans-serif;color:#45454f;">${b.nota}</td></tr></table>`
    : "";

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#f0f0f3;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(b.paragrafos[0]?.replace(/<[^>]+>/g, "") ?? "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f3;"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.05);">
    <tr><td style="background:${cor};padding:26px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;">${escudo}</td>
        <td style="vertical-align:middle;padding-left:14px;font:800 18px/1.2 Arial,Helvetica,sans-serif;color:${corTexto};text-transform:uppercase;letter-spacing:.02em;">${nome}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:30px 28px 8px;">
      <p style="margin:0 0 8px;font:800 12px/1.4 Arial,Helvetica,sans-serif;color:${corDestaque};text-transform:uppercase;letter-spacing:.14em;">${b.selo}</p>
      <h1 style="margin:0 0 14px;font:800 26px/1.2 Arial,Helvetica,sans-serif;color:#17171c;">${b.titulo}</h1>
      ${b.paragrafos.map((p) => `<p style="margin:0 0 12px;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:#3a3a44;">${p}</p>`).join("")}
      ${detalhes}${lista}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 6px;"><tr><td style="border-radius:14px;background:${cor};">
        <a href="${esc(b.botao.url)}" style="display:inline-block;padding:16px 28px;font:800 16px/1 Arial,Helvetica,sans-serif;color:${corTexto};text-decoration:none;border-radius:14px;">${b.botao.texto} &rarr;</a>
      </td></tr></table>
      <p style="margin:10px 0 0;font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#8a8a94;">Se o botão não abrir, copie: <a href="${esc(b.botao.url)}" style="color:#5a5a66;word-break:break-all;">${esc(b.botao.url)}</a></p>
      ${nota}
    </td></tr>
    <tr><td style="padding:22px 28px 28px;">
      <p style="margin:0;border-top:1px solid #efeff2;padding-top:18px;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#8a8a94;">
        ${b.rodape ? `${b.rodape}<br>` : ""}Por segurança, nunca enviamos ingresso, QR Code ou carteirinha por e-mail. Eles ficam só na sua conta.<br>
        ${nome} · tecnologia Somos Organizada. Este é um e-mail automático; não precisa responder.
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const limpo = (s: string) => s.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const texto = [
    torcida.nome.toUpperCase(),
    "",
    limpo(b.titulo),
    "",
    ...b.paragrafos.map(limpo),
    ...(b.detalhes ?? []).map(([r, v]) => `${limpo(r)}: ${limpo(v)}`),
    ...(b.lista ? ["", limpo(b.lista.titulo), ...b.lista.itens.map((i) => `- ${limpo(i)}`)] : []),
    "",
    `${limpo(b.botao.texto)}: ${b.botao.url}`,
    ...(b.nota ? ["", limpo(b.nota)] : []),
    "",
    "Por segurança, nunca enviamos ingresso, QR Code ou carteirinha por e-mail. Eles ficam só na sua conta.",
  ].join("\n");

  return { para, assunto, html, texto, nomeRemetente: torcida.nome, responderPara: torcida.contato?.email };
}

// ── Modelos ─────────────────────────────────────────────

export function emailIngressoComprado(a: {
  torcida: Torcida; url: string; nome: string; email: string; eventoNome: string; data: Date; local?: string;
  titulares: string[]; total: number; metodo: "pix" | "cartao";
}): Mensagem {
  const qtd = a.titulares.length;
  return montar(a.torcida, `Ingresso confirmado: ${a.eventoNome}`, { email: a.email, nome: a.nome }, {
    selo: "Pagamento confirmado",
    titulo: `${esc(primeiroNome(a.nome))}, ${qtd > 1 ? "seus ingressos estão garantidos" : "seu ingresso está garantido"}!`,
    paragrafos: [
      `Recebemos o pagamento e ${qtd > 1 ? `os ${qtd} ingressos já estão` : "o ingresso já está"} na sua conta da <b>${esc(a.torcida.nome)}</b>.`,
      `Para entrar no evento, abra a sua conta no celular e mostre o QR Code na portaria. Leve um documento com foto.`,
    ],
    detalhes: [
      ["Evento", esc(a.eventoNome)],
      ["Quando", esc(dataHora(a.data))],
      ...(a.local ? ([["Onde", esc(a.local)]] as [string, string][]) : []),
      ["Total pago", `${esc(moeda(a.total))} · ${a.metodo === "pix" ? "Pix" : "Cartão"}`],
    ],
    lista: { titulo: qtd > 1 ? "Titulares" : "Titular", itens: a.titulares.map(esc) },
    botao: { texto: qtd > 1 ? "Ver meus ingressos" : "Ver meu ingresso", url: a.url },
    nota: "Entre com o seu <b>CPF ou e-mail</b> e a senha criada na compra. Esqueceu a senha? Use “Esqueci minha senha” na tela de entrada.",
  });
}

export function emailIngressoNoSeuNome(a: { torcida: Torcida; url: string; nome: string; email: string; compradorNome: string; eventoNome: string; data: Date; local?: string }): Mensagem {
  return montar(a.torcida, `Tem ingresso no seu nome: ${a.eventoNome}`, { email: a.email, nome: a.nome }, {
    selo: "Ingresso no seu CPF",
    titulo: `${esc(primeiroNome(a.nome))}, tem ingresso te esperando!`,
    paragrafos: [`<b>${esc(a.compradorNome)}</b> comprou um ingresso no seu nome. Ele já aparece na sua área de sócio, junto com a carteirinha.`],
    detalhes: [["Evento", esc(a.eventoNome)], ["Quando", esc(dataHora(a.data))], ...(a.local ? ([["Onde", esc(a.local)]] as [string, string][]) : [])],
    botao: { texto: "Ver meu ingresso", url: a.url },
  });
}

export function emailSocioConfirmado(a: { torcida: Torcida; url: string; nome: string; email: string; renovacao: boolean; plano: string; validoAte: Date | null; total: number; matricula?: string; emAnalise: boolean }): Mensagem {
  const titulo = a.emAnalise
    ? `${esc(primeiroNome(a.nome))}, recebemos seu pagamento!`
    : a.renovacao
      ? `${esc(primeiroNome(a.nome))}, mensalidade em dia!`
      : `Bem-vindo, ${esc(primeiroNome(a.nome))}! Agora você é sócio.`;
  return montar(a.torcida, a.renovacao ? "Mensalidade confirmada" : `Bem-vindo à ${a.torcida.nome}`, { email: a.email, nome: a.nome }, {
    selo: a.renovacao ? "Renovação confirmada" : "Associação confirmada",
    titulo,
    paragrafos: [
      a.emAnalise
        ? "A diretoria está conferindo o seu cadastro. Assim que aprovar, a carteirinha digital é liberada na sua conta."
        : "Sua carteirinha digital está ativa na sua conta. Com ela você tem o preço de sócio nos ingressos.",
    ],
    detalhes: [
      ["Plano", esc(a.plano)],
      ...(a.matricula ? ([["Matrícula", esc(a.matricula)]] as [string, string][]) : []),
      ...(a.validoAte && !a.emAnalise ? ([["Válida até", esc(dataCurta(a.validoAte))]] as [string, string][]) : []),
      ["Valor pago", esc(moeda(a.total))],
    ],
    botao: { texto: "Abrir minha carteirinha", url: a.url },
  });
}

export function emailRenovacaoPix(a: { torcida: Torcida; url: string; nome: string; email: string; vence: Date; total: number; hoje: boolean }): Mensagem {
  return montar(a.torcida, a.hoje ? "Sua mensalidade vence hoje" : `Sua mensalidade vence em ${dataCurta(a.vence)}`, { email: a.email, nome: a.nome }, {
    selo: a.hoje ? "Vence hoje" : "Lembrete de renovação",
    titulo: a.hoje ? `${esc(primeiroNome(a.nome))}, sua mensalidade vence hoje` : `${esc(primeiroNome(a.nome))}, hora de renovar`,
    paragrafos: [
      a.hoje
        ? "O Pix da sua mensalidade ainda está em aberto. Pague hoje para continuar com a carteirinha ativa e o preço de sócio."
        : "O Pix da próxima mensalidade já está pronto na sua conta. É só abrir, copiar o código e pagar no app do banco.",
    ],
    detalhes: [["Vencimento", esc(dataCurta(a.vence))], ["Valor", esc(moeda(a.total))]],
    botao: { texto: "Pagar pelo Pix", url: a.url },
    nota: "Pagou e já recebeu a confirmação? Pode ignorar este e-mail.",
  });
}

export function emailCartaoRecusado(a: { torcida: Torcida; url: string; nome: string; email: string; motivo: string; definitiva: boolean }): Mensagem {
  return montar(a.torcida, "Não conseguimos cobrar sua mensalidade", { email: a.email, nome: a.nome }, {
    selo: "Atenção à sua mensalidade",
    titulo: `${esc(primeiroNome(a.nome))}, o cartão não passou`,
    paragrafos: [
      `Tentamos cobrar a mensalidade no seu cartão e o banco recusou: <b>${esc(a.motivo)}</b>`,
      a.definitiva
        ? "Não vamos tentar de novo neste cartão. Para continuar em dia, cadastre outro cartão ou pague pelo Pix na sua conta."
        : "Vamos tentar de novo automaticamente nos próximos dias. Se preferir resolver agora, troque o cartão ou pague pelo Pix na sua conta.",
    ],
    botao: { texto: "Resolver agora", url: a.url },
  });
}
