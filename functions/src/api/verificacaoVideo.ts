/**
 * Verificação por vídeo do cadastro da torcida (último passo antes da análise).
 *
 * Por quê: os dados de uma torcida organizada (nome, sede, presidente, CNPJ) são públicos. Qualquer pessoa poderia
 * usá-los para se cadastrar no lugar da diretoria e receber o dinheiro de ingressos e mensalidades. Por isso o
 * responsável marca uma chamada rápida com a equipe, feita na sede e com pelo menos duas testemunhas da diretoria
 * ou do conselho. A chamada é gravada e guardada com acesso restrito, só como prova de quem fez o cadastro.
 *
 * - horariosVerificacao: horários livres (agenda padrão abaixo; a equipe pode trocar em plataforma/agendaVerificacao).
 * - agendarVerificacao: o responsável reserva (ou remarca) um horário. Um horário = um cadastro (agendaVerificacao/{id}).
 * - atualizarVerificacao (equipe): envia o link da chamada, marca como feita (com onde ficou a gravação) ou
 *   "não compareceu" (libera para remarcar). A aprovação do cadastro exige a chamada feita.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { URL_APP } from "../config";
import { db, FieldValue, Timestamp } from "../util/firebase";
import { exigirLogin, exigirPlataforma } from "../dominio/permissoes";
import { inteiro, texto, umDe } from "../util/validacao";
import { enviarAgora } from "../email/enviar";
import { esc, montar } from "../email/modelos";
import { MARCA_PLATAFORMA } from "./verificacao";
import type { Torcida } from "../dominio/tipos";

export interface AgendaVerificacao {
  /** 0 = domingo … 6 = sábado */
  diasSemana: number[];
  /** primeiro e último início de chamada, "HH:MM" no horário de Brasília */
  inicio: string;
  fim: string;
  duracaoMin: number;
  /** o horário mais cedo que dá para marcar, a partir de agora */
  antecedenciaHoras: number;
  diasAFrente: number;
  /** horários fechados pela equipe ("AAAA-MM-DDTHH:MM") */
  bloqueados?: string[];
}

/** Padrão: segunda a sábado, das 10h às 21h, de 20 em 20 minutos, a partir de 3 h e por 14 dias. */
export const AGENDA_PADRAO: AgendaVerificacao = { diasSemana: [1, 2, 3, 4, 5, 6], inicio: "10:00", fim: "21:00", duracaoMin: 20, antecedenciaHoras: 3, diasAFrente: 14 };
const REMARCAR_ATE_MS = 2 * 3600_000;
const MAX_REMARCACOES = 5;
const OFFSET_SP = -3; // Brasil sem horário de verão desde 2019

const minutos = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** "2026-10-12T14:20" (Brasília) → instante. */
export function instanteDoHorario(id: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(id);
  if (!m) return null;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]! - OFFSET_SP, +m[5]!));
}

/** Todos os horários da agenda entre agora + antecedência e os próximos dias (sem tirar os já reservados). */
export function horariosDaAgenda(agenda: AgendaVerificacao, agora = Date.now()): string[] {
  const lista: string[] = [];
  const minimo = agora + agenda.antecedenciaHoras * 3600_000;
  const bloqueados = new Set(agenda.bloqueados ?? []);
  for (let d = 0; d <= agenda.diasAFrente; d++) {
    // dia no calendário de Brasília
    const base = new Date(agora + OFFSET_SP * 3600_000 + d * 86400_000);
    const ano = base.getUTCFullYear();
    const mes = base.getUTCMonth() + 1;
    const dia = base.getUTCDate();
    if (!agenda.diasSemana.includes(base.getUTCDay())) continue;
    for (let t = minutos(agenda.inicio); t <= minutos(agenda.fim); t += agenda.duracaoMin) {
      const id = `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}T${doisDigitos(Math.floor(t / 60))}:${doisDigitos(t % 60)}`;
      const instante = instanteDoHorario(id)!.getTime();
      if (instante < minimo || bloqueados.has(id)) continue;
      lista.push(id);
    }
  }
  return lista;
}

async function lerAgenda(): Promise<AgendaVerificacao> {
  const d = (await db.doc("plataforma/agendaVerificacao").get().catch(() => null))?.data() as Partial<AgendaVerificacao> | undefined;
  return { ...AGENDA_PADRAO, ...(d ?? {}) };
}

/** Cadastro em análise desta conta (o pedido de vídeo só existe para ele). */
async function minhaSolicitacao(uid: string) {
  const snap = await db.collection("solicitacoes").where("uid", "==", uid).where("status", "==", "pendente").limit(1).get();
  const doc = snap.docs[0];
  if (!doc) throw new HttpsError("failed-precondition", "Não encontramos um cadastro em análise nesta conta.");
  return doc;
}

const quando = (d: Date) =>
  d.toLocaleString("pt-BR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Nome e cores escolhidos no cadastro: o e-mail já sai com a cara da torcida. */
function marcaDa(sol: FirebaseFirestore.DocumentData): Torcida {
  return { ...MARCA_PLATAFORMA, nome: sol.nomeTorcida ?? MARCA_PLATAFORMA.nome, tema: { ...MARCA_PLATAFORMA.tema, ...(sol.tema ?? {}) } } as Torcida;
}

export const horariosVerificacao = onCall(async (req) => {
  exigirLogin(req);
  const agenda = await lerAgenda();
  const todos = horariosDaAgenda(agenda);
  if (!todos.length) return { horarios: [], duracaoMin: agenda.duracaoMin };
  const inicio = instanteDoHorario(todos[0]!)!;
  const fim = instanteDoHorario(todos[todos.length - 1]!)!;
  const ocupados = await db.collection("agendaVerificacao").where("inicio", ">=", Timestamp.fromDate(inicio)).where("inicio", "<=", Timestamp.fromDate(fim)).get();
  const meu = req.auth!.uid;
  const tomados = new Set(ocupados.docs.filter((d) => d.get("uid") !== meu).map((d) => d.id));
  return { horarios: todos.filter((h) => !tomados.has(h)), duracaoMin: agenda.duracaoMin };
});

export const agendarVerificacao = onCall(async (req) => {
  const uid = exigirLogin(req);
  const horario = texto((req.data as Record<string, unknown> | undefined)?.horario, "horário", { max: 16 });
  const agenda = await lerAgenda();
  if (!horariosDaAgenda(agenda).includes(horario)) throw new HttpsError("invalid-argument", "Este horário não está disponível. Escolha outro.");
  const inicio = instanteDoHorario(horario)!;
  const solDoc = await minhaSolicitacao(uid);
  const refSol = solDoc.ref;
  const refHorario = db.doc(`agendaVerificacao/${horario}`);

  const resultado = await db.runTransaction(async (tx) => {
    const [h, s] = await Promise.all([tx.get(refHorario), tx.get(refSol)]);
    const sol = s.data()!;
    if (sol.status !== "pendente") throw new HttpsError("failed-precondition", "Este cadastro já foi avaliado.");
    const v = (sol.verificacao ?? {}) as { status?: string; horarioId?: string; inicio?: Timestamp; remarcacoes?: number };
    if (v.status === "realizada") throw new HttpsError("failed-precondition", "A chamada de verificação já foi feita.");
    if (h.exists && h.get("solicitacaoId") !== refSol.id) throw new HttpsError("already-exists", "Este horário acabou de ser reservado. Escolha outro.");
    if (v.horarioId === horario && v.status === "agendada") return { mesmo: true, sol };
    const remarcando = !!v.horarioId && v.status === "agendada";
    if (remarcando && v.inicio && v.inicio.toMillis() - Date.now() < REMARCAR_ATE_MS) {
      throw new HttpsError("failed-precondition", "Faltam menos de 2 horas para a chamada. Para mudar, fale com a equipe no WhatsApp.");
    }
    const remarcacoes = (v.remarcacoes ?? 0) + (v.horarioId ? 1 : 0);
    if (remarcacoes > MAX_REMARCACOES) throw new HttpsError("resource-exhausted", "Você já remarcou muitas vezes. Fale com a equipe no WhatsApp.");
    if (v.horarioId && v.horarioId !== horario) tx.delete(db.doc(`agendaVerificacao/${v.horarioId}`));
    tx.set(refHorario, { solicitacaoId: refSol.id, uid, inicio: Timestamp.fromDate(inicio), criadoEm: FieldValue.serverTimestamp() });
    tx.update(refSol, {
      verificacao: { status: "agendada", horarioId: horario, inicio: Timestamp.fromDate(inicio), agendadaEm: FieldValue.serverTimestamp(), remarcacoes, link: null },
    });
    return { mesmo: false, sol };
  });

  if (!resultado.mesmo) {
    const sol = resultado.sol;
    const fimEvento = new Date(inicio.getTime() + agenda.duracaoMin * 60_000);
    const g = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const agendaGoogle =
      "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      `&text=${encodeURIComponent(`Verificação em vídeo · ${sol.nomeTorcida} · Somos Organizada`)}` +
      `&dates=${g(inicio)}/${g(fimEvento)}` +
      `&details=${encodeURIComponent("Na sede da torcida, com documento com foto e pelo menos 2 testemunhas da diretoria ou do conselho. O link da chamada chega por e-mail.")}`;
    const m = montar(marcaDa(sol), "Cadastro quase concluído: sua chamada de verificação está marcada", { email: sol.email, nome: sol.responsavel?.nome }, {
      selo: "Cadastro quase concluído",
      titulo: "Falta só a chamada de verificação",
      paragrafos: [
        `A sua chamada de vídeo com a equipe Somos Organizada está marcada para <strong>${esc(quando(inicio))}</strong> (horário de Brasília). Dura de 2 a 5 minutos.`,
        "O link da chamada chega neste e-mail antes do horário. É só tocar nele na hora marcada, pelo celular ou pelo computador.",
        "<strong>Por que essa chamada?</strong> Os dados de uma torcida organizada são públicos, e alguém poderia usá-los para se cadastrar no lugar da diretoria e receber o dinheiro dos ingressos e das mensalidades. A chamada confirma que quem pediu a conta é mesmo o responsável pela torcida e protege vocês e os torcedores.",
        `<a href="${esc(agendaGoogle)}">Adicionar à minha agenda</a>`,
      ],
      lista: {
        titulo: "Para a chamada, tenha em mãos",
        itens: [
          "Estar na sede da torcida (vamos pedir para mostrar a fachada e o espaço).",
          "Documento oficial com foto do responsável (o mesmo CPF do cadastro).",
          "Pelo menos 2 testemunhas da diretoria ou do conselho, com documento com foto.",
          "Se tiver: estatuto, ata da eleição da diretoria e cartão do CNPJ.",
          "Celular com câmera e internet boa (de preferência no Wi-Fi).",
        ],
      },
      detalhes: [
        ["Torcida", esc(sol.nomeTorcida)],
        ["Endereço reservado", `somosorganizada.com.br/${esc(sol.slug)}`],
        ["Responsável", esc(sol.responsavel?.nome ?? "")],
      ],
      botao: { texto: "Ver meu cadastro", url: `${URL_APP.value()}/cadastro` },
      nota: "Precisa mudar o horário? Remarque na página do cadastro até 2 horas antes.",
      rodape: "A chamada é gravada e guardada com acesso restrito, só como prova de quem fez o cadastro (prevenção à fraude). Ela não é publicada nem compartilhada.",
      conta: true,
    });
    await enviarAgora(m, `verificacao/${refSol.id}/${horario}`).catch((e) => logger.error("Falha ao enviar e-mail de chamada agendada", { erro: String(e) }));
  }
  return { status: "agendada", horario, inicio: inicio.toISOString() };
});

/** Equipe: envia o link, marca a chamada como feita ou registra que não compareceu. */
export const atualizarVerificacao = onCall(async (req) => {
  const quem = exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const id = texto(d.id, "solicitação", { max: 40 });
  const acao = umDe(d.acao, "ação", ["link", "realizada", "nao_compareceu"] as const);
  const ref = db.doc(`solicitacoes/${id}`);
  const sol = (await ref.get()).data();
  if (!sol) throw new HttpsError("not-found", "Solicitação não encontrada.");
  if (sol.status !== "pendente") throw new HttpsError("failed-precondition", "Esta solicitação já foi avaliada.");
  const v = (sol.verificacao ?? {}) as { status?: string; horarioId?: string; inicio?: Timestamp };

  if (acao === "link") {
    const link = texto(d.link, "link", { max: 300 });
    if (!/^https:\/\/[^\s]+$/.test(link)) throw new HttpsError("invalid-argument", "Cole o link completo da chamada (começa com https://).");
    if (v.status !== "agendada" || !v.inicio) throw new HttpsError("failed-precondition", "O responsável ainda não marcou o horário.");
    await ref.update({ "verificacao.link": link, "verificacao.linkEnviadoEm": FieldValue.serverTimestamp() });
    const m = montar(marcaDa(sol), "Link da sua chamada de verificação", { email: sol.email, nome: sol.responsavel?.nome }, {
      selo: "Chamada de verificação",
      titulo: "Aqui está o link da chamada",
      paragrafos: [
        `A chamada é <strong>${esc(quando(v.inicio.toDate()))}</strong> (horário de Brasília). Toque no botão na hora marcada.`,
        "Esteja na sede, com o seu documento com foto e pelo menos 2 testemunhas da diretoria ou do conselho.",
      ],
      botao: { texto: "Entrar na chamada", url: link },
      nota: "Se não conseguir entrar, chame a equipe no WhatsApp que a gente resolve na hora.",
      rodape: "A chamada é gravada e guardada com acesso restrito, só como prova de quem fez o cadastro.",
      conta: true,
    });
    const r = await enviarAgora(m, `verificacao-link/${id}/${Date.now()}`).catch(() => ({ provedor: null }));
    return { ok: true, emailEnviado: !!r.provedor };
  }

  if (acao === "nao_compareceu") {
    await db.runTransaction(async (tx) => {
      if (v.horarioId) tx.delete(db.doc(`agendaVerificacao/${v.horarioId}`));
      tx.update(ref, { "verificacao.status": "remarcar", "verificacao.horarioId": null, "verificacao.link": null, "verificacao.atualizadoPor": quem });
    });
    const m = montar(marcaDa(sol), "Vamos remarcar a sua chamada de verificação", { email: sol.email, nome: sol.responsavel?.nome }, {
      selo: "Chamada de verificação",
      titulo: "Não conseguimos fazer a chamada",
      paragrafos: ["Sem problema: escolha um novo horário na página do cadastro. O resto do cadastro continua salvo."],
      botao: { texto: "Escolher novo horário", url: `${URL_APP.value()}/cadastro` },
      conta: true,
    });
    await enviarAgora(m, `verificacao-remarcar/${id}/${Date.now()}`).catch(() => undefined);
    return { ok: true };
  }

  // realizada: a equipe confirma o que conferiu e onde guardou a gravação (registro só da plataforma)
  const gravacao = texto(d.gravacao, "onde ficou a gravação", { min: 3, max: 300 });
  const testemunhas = inteiro(d.testemunhas, "testemunhas", { min: 0, max: 50 });
  if (testemunhas < 2) throw new HttpsError("failed-precondition", "São necessárias pelo menos 2 testemunhas da diretoria ou do conselho.");
  if (d.documentoConferido !== true || d.sedeConferida !== true) {
    throw new HttpsError("failed-precondition", "Confirme que conferiu o documento do responsável e a sede antes de concluir.");
  }
  const observacoes = texto(d.observacoes, "observações", { max: 1000, obrigatorio: false });
  await db.runTransaction(async (tx) => {
    tx.set(db.doc(`verificacoesVideo/${id}`), {
      solicitacaoId: id, gravacao, testemunhas, documentoConferido: true, sedeConferida: true, observacoes,
      horarioId: v.horarioId ?? null, realizadaPor: quem, realizadaEm: FieldValue.serverTimestamp(),
    });
    tx.update(ref, { "verificacao.status": "realizada", "verificacao.realizadaEm": FieldValue.serverTimestamp() });
  });
  return { ok: true };
});
