/**
 * E-mails da mensalidade da Somos Organizada para a diretoria da torcida (antes, só o painel mostrava).
 *  - gerada: fatura nova, com valor, vencimento e Pix copia e cola;
 *  - lembrete: faltam 2 dias e ainda não foi informado o pagamento;
 *  - atraso: venceu; diz quantos dias faltam para o site sair do ar;
 *  - bloqueio: o site saiu do ar por atraso;
 *  - paga: a equipe confirmou o Pix.
 * Vai para cada diretor ativo e para o e-mail financeiro do cadastro. Uma vez por fatura, tipo e endereço
 * (enviarUmaVez); falha de envio nunca interrompe a rotina nem a confirmação.
 */
import { createHash } from "node:crypto";
import { logger } from "firebase-functions/v2";
import { URL_APP } from "../config";
import { refs } from "../util/firebase";
import type { Torcida } from "../dominio/tipos";
import { enviarUmaVez } from "./enviar";
import { dataCurta, esc, montar, moeda } from "./modelos";
import { MARCA_PLATAFORMA } from "../api/verificacao";
import { normalizarPlano, refsSaas, SAAS_PADRAO, type FaturaSaas } from "../api/saas";

const nomePlano = (plano: unknown) => {
  const p = normalizarPlano(plano);
  return p ? SAAS_PADRAO.planos[p].nome : String(plano ?? "");
};

export type AvisoSaas = "gerada" | "lembrete" | "atraso" | "bloqueio" | "paga";

/** Diretores ativos + e-mail financeiro informado no cadastro (sem repetir). */
async function destinatarios(tid: string): Promise<{ email: string; nome?: string }[]> {
  const [membros, cadastro] = await Promise.all([
    refs.torcida(tid).collection("membros").where("papel", "==", "diretoria").where("ativo", "==", true).get(),
    refsSaas.cadastro(tid).get(),
  ]);
  const lista = new Map<string, { email: string; nome?: string }>();
  for (const m of membros.docs) {
    const email = String(m.get("email") ?? "").trim().toLowerCase();
    if (email) lista.set(email, { email, nome: (m.get("nome") as string | undefined) ?? undefined });
  }
  const fin = String(cadastro.get("entidade.emailFinanceiro") ?? "").trim().toLowerCase();
  if (fin && !lista.has(fin)) lista.set(fin, { email: fin });
  return [...lista.values()];
}

export async function avisarFaturaSaas(tid: string, faturaId: string, tipo: AvisoSaas, extra: { diasParaBloqueio?: number } = {}) {
  try {
    const [tSnap, fSnap] = await Promise.all([refs.torcida(tid).get(), refsSaas.fatura(tid, faturaId).get()]);
    const torcida = tSnap.data() as Torcida | undefined;
    const f = fSnap.data() as FaturaSaas | undefined;
    if (!torcida || !f) return;
    const painel = `${URL_APP.value().replace(/\/+$/, "")}/${torcida.slug}/admin/plano`;
    const venc = f.vencimento.toDate();
    const valor = moeda(f.valor);
    const pix = f.pixCopiaECola
      ? `<strong>Pix copia e cola:</strong><br><span style="font-family:monospace;font-size:12px;word-break:break-all">${esc(f.pixCopiaECola)}</span>`
      : "O Pix desta fatura está no painel, em Plano Somos Organizada.";
    const detalhes: [string, string][] = [
      ["Torcida", esc(torcida.nome)],
      ["Plano", esc(nomePlano(f.plano))],
      ["Valor", valor],
      ["Vencimento", dataCurta(venc)],
    ];
    const textos: Record<AvisoSaas, { assunto: string; selo: string; titulo: string; paragrafos: string[]; botao: string; nota?: string }> = {
      gerada: {
        assunto: `Fatura da Somos Organizada · ${torcida.nome} · vence em ${dataCurta(venc)}`,
        selo: "Mensalidade",
        titulo: "Sua fatura chegou",
        paragrafos: [
          `A mensalidade da Somos Organizada da <strong>${esc(torcida.nome)}</strong> está disponível: <strong>${valor}</strong>, com vencimento em <strong>${dataCurta(venc)}</strong>.`,
          pix,
          "Depois de pagar, toque em “Já paguei” no painel para a equipe confirmar mais rápido.",
        ],
        botao: "Ver a fatura no painel",
      },
      lembrete: {
        assunto: `Lembrete: a fatura da ${torcida.nome} vence em ${dataCurta(venc)}`,
        selo: "Lembrete",
        titulo: "A fatura vence em 2 dias",
        paragrafos: [`A mensalidade de <strong>${valor}</strong> da ${esc(torcida.nome)} vence em <strong>${dataCurta(venc)}</strong>.`, pix],
        botao: "Pagar pelo painel",
        nota: "Já pagou? Toque em “Já paguei” no painel e ignore este lembrete.",
      },
      atraso: {
        assunto: `Fatura em atraso · ${torcida.nome}`,
        selo: "Fatura em atraso",
        titulo: "A mensalidade venceu",
        paragrafos: [
          `A fatura de <strong>${valor}</strong> da ${esc(torcida.nome)} venceu em ${dataCurta(venc)}.`,
          extra.diasParaBloqueio != null
            ? `Se o pagamento não for confirmado em <strong>${extra.diasParaBloqueio} ${extra.diasParaBloqueio === 1 ? "dia" : "dias"}</strong>, o site e as vendas saem do ar até o Pix ser confirmado.`
            : "Pague o quanto antes para o site e as vendas não saírem do ar.",
          pix,
        ],
        botao: "Pagar agora",
        nota: "Sem multa e sem juros. Já pagou? Toque em “Já paguei” no painel.",
      },
      bloqueio: {
        assunto: `Site da ${torcida.nome} fora do ar por atraso`,
        selo: "Site fora do ar",
        titulo: "O site saiu do ar por atraso",
        paragrafos: [
          `A fatura de <strong>${valor}</strong> (vencida em ${dataCurta(venc)}) ainda não foi paga. Por isso o site e as vendas da ${esc(torcida.nome)} estão fora do ar.`,
          "Assim que o Pix for confirmado, tudo volta ao ar sozinho, com os mesmos dados, sócios e ingressos.",
          pix,
        ],
        botao: "Regularizar agora",
      },
      paga: {
        assunto: `Pagamento confirmado · ${torcida.nome}`,
        selo: "Pagamento confirmado",
        titulo: "Recebemos o seu Pix. Obrigado!",
        paragrafos: [`A mensalidade de <strong>${valor}</strong> da ${esc(torcida.nome)} (vencimento ${dataCurta(venc)}) está paga.`],
        botao: "Ver no painel",
      },
    };
    const t = textos[tipo];
    if (tipo === "paga") detalhes.push(["Situação", "Paga"]);
    const marca = { ...MARCA_PLATAFORMA, nome: "Somos Organizada" } as Torcida;
    for (const para of await destinatarios(tid)) {
      const m = montar(marca, t.assunto, para, {
        selo: t.selo,
        titulo: t.titulo,
        paragrafos: t.paragrafos,
        detalhes,
        botao: { texto: t.botao, url: painel },
        nota: t.nota,
        rodape: "Mensalidade fixa, sem porcentagem sobre as vendas. Dúvidas: contato@somosorganizada.com.br.",
        conta: true,
      });
      const quem = createHash("sha256").update(para.email).digest("hex").slice(0, 12);
      await enviarUmaVez(tid, `saas-${faturaId}-${tipo}-${quem}`, `saas_${tipo}`, m);
    }
  } catch (e) {
    logger.error("E-mail da fatura não enviado", { tid, faturaId, tipo, erro: String(e) });
  }
}
