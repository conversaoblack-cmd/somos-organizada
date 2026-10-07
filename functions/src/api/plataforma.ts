import { onCall, HttpsError } from "firebase-functions/v2/https";
import { PADROES, PLATAFORMA_EMAILS } from "../config";
import { auth, db, refs, FieldValue, Timestamp } from "../util/firebase";
import { mascararCpf } from "../util/validacao";
import { emailValido, slugValido, texto, umDe } from "../util/validacao";
import { competencia } from "../util/datas";
import { exigirLogin, exigirPlataforma } from "../dominio/permissoes";
import { concederAcesso } from "./torcida";
import type { Pedido, Torcida } from "../dominio/tipos";

/** Primeiro acesso da equipe Somos Organizada: e-mail verificado e listado em PLATAFORMA_EMAILS. */
export const reivindicarPlataforma = onCall(async (req) => {
  const uid = exigirLogin(req);
  const email = String(req.auth?.token.email ?? "").toLowerCase();
  const permitidos = PLATAFORMA_EMAILS.value().split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!req.auth?.token.email_verified || !permitidos.includes(email)) {
    throw new HttpsError("permission-denied", "Este e-mail não faz parte da equipe Somos Organizada.");
  }
  await auth.setCustomUserClaims(uid, { plataforma: true });
  return { ok: true };
});

export const criarTorcida = onCall(async (req) => {
  const quem = exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const nome = texto(d.nome, "nome da torcida", { min: 2, max: 80 });
  const slug = texto(d.slug, "endereço", { min: 3, max: 40 }).toLowerCase();
  if (!slugValido(slug)) throw new HttpsError("invalid-argument", "Endereço inválido: use letras minúsculas, números e hífen.");
  const diretor = (d.diretor ?? {}) as Record<string, unknown>;
  const emailDiretor = texto(diretor.email, "e-mail do diretor", { max: 64 }).toLowerCase();
  if (!emailValido(emailDiretor)) throw new HttpsError("invalid-argument", "E-mail do diretor inválido.");
  const nomeDiretor = texto(diretor.nome, "nome do diretor", { min: 2, max: 64 });
  const nomeSede = texto(d.nomeSedePrincipal, "sede principal", { max: 80, obrigatorio: false }) || "Sede principal";
  const mensalidade = Number(d.mensalidadeSaas ?? 0);

  const tRef = db.collection("torcidas").doc();
  const sedeRef = refs.sedes(tRef.id).doc();
  await db.runTransaction(async (tx) => {
    const sSnap = await tx.get(refs.slug(slug));
    if (sSnap.exists) throw new HttpsError("already-exists", "Este endereço já está em uso.");
    tx.set(refs.slug(slug), { torcidaId: tRef.id });
    const torcida: Torcida = {
      nome,
      slug,
      status: "implantacao",
      taxaServicoPct: PADROES.taxaServicoPct,
      aprovacaoManualSocio: false,
      destinoMensalidade: "sede_do_socio",
      sedePrincipalId: sedeRef.id,
      proximaMatricula: 1,
      tema: { corPrimaria: "#009C3B", corSecundaria: "#FFDF00", corFundo: "#07090B", corTexto: "#F2F5F3" },
      textos: { titulo: nome, subtitulo: "Eventos e associação oficial" },
      pagamentos: { configurado: false, pix: true, cartao: true },
      criadoEm: Timestamp.now(),
    };
    tx.set(tRef, torcida);
    tx.set(sedeRef, { nome: nomeSede, tipo: "principal", ativa: true, ordem: 0, criadoEm: FieldValue.serverTimestamp() });
    tx.set(refs.contrato(tRef.id), {
      mensalidadeSaas: Number.isFinite(mensalidade) ? Math.round(mensalidade) : 0,
      criadoPor: quem,
      criadoEm: FieldValue.serverTimestamp(),
    });
  });
  const acesso = await concederAcesso({
    tid: tRef.id, email: emailDiretor, nome: nomeDiretor, papel: "diretoria", convidadoPor: quem,
  });
  return { torcidaId: tRef.id, slug, linkDefinirSenha: acesso.linkDefinirSenha };
});

export const atualizarTorcidaPlataforma = onCall(async (req) => {
  exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const upd: Record<string, unknown> = {};
  if (d.status !== undefined) upd.status = umDe(d.status, "status", ["implantacao", "ativa", "suspensa"] as const);
  if (d.taxaServicoPct !== undefined) {
    const pct = Number(d.taxaServicoPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 30) throw new HttpsError("invalid-argument", "Taxa inválida.");
    upd.taxaServicoPct = pct;
  }
  if (Object.keys(upd).length) await refs.torcida(tid).update(upd);
  if (d.contrato && typeof d.contrato === "object") {
    const c = d.contrato as Record<string, unknown>;
    await refs.contrato(tid).set(
      {
        mensalidadeSaas: Math.round(Number(c.mensalidadeSaas ?? 0)) || 0,
        diaVencimento: Math.min(28, Math.max(1, Math.round(Number(c.diaVencimento ?? 10)))),
        observacoes: texto(c.observacoes, "observações", { max: 1000, obrigatorio: false }),
        atualizadoEm: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  return { ok: true };
});

/** KPIs consolidados de todas as torcidas para o dashboard da plataforma. */
export const resumoPlataforma = onCall(async (req) => {
  exigirPlataforma(req);
  const mes = competencia();
  const torcidas = await db.collection("torcidas").get();
  const linhas = await Promise.all(
    torcidas.docs.map(async (t) => {
      const [geral, doMes, contrato, chamados] = await Promise.all([
        refs.statsGeral(t.id).get(),
        refs.statsMes(t.id, mes).get(),
        refs.contrato(t.id).get(),
        db.collection("suporte").where("torcidaId", "==", t.id).where("status", "==", "aberto").count().get(),
      ]);
      const dados = t.data() as Torcida;
      return {
        id: t.id,
        nome: dados.nome,
        slug: dados.slug,
        status: dados.status,
        pagamentos: {
          configurado: dados.pagamentos?.configurado ?? false,
          ambiente: dados.pagamentos?.ambiente ?? null,
          webhookRecebidoEm: dados.pagamentos?.webhookRecebidoEm?.toMillis() ?? null,
        },
        geral: geral.data() ?? {},
        mes: doMes.data() ?? {},
        mensalidadeSaas: contrato.get("mensalidadeSaas") ?? 0,
        contrato: {
          mensalidadeSaas: contrato.get("mensalidadeSaas") ?? 0,
          diaVencimento: contrato.get("diaVencimento") ?? 10,
          observacoes: contrato.get("observacoes") ?? "",
        },
        chamadosAbertos: chamados.data().count,
      };
    }),
  );
  const historico = await db.collection("plataforma/stats/meses").orderBy("mes", "desc").limit(12).get();
  return { mes, torcidas: linhas, historico: historico.docs.map((h) => h.data()) };
});

/**
 * Janela de depuração do suporte: mostra o estado técnico da torcida sem expor
 * credenciais nem dados pessoais completos (CPF e e-mail mascarados).
 */
export const diagnosticoTorcida = onCall(async (req) => {
  exigirPlataforma(req);
  const tid = texto((req.data ?? {}).tid, "torcida", { max: 40 });
  const [t, priv, webhooks, pedidos, erros, eventos, planos] = await Promise.all([
    refs.torcida(tid).get(),
    refs.privadoPagarme(tid).get(),
    db.collection(`torcidas/${tid}/webhooks`).orderBy("recebidoEm", "desc").limit(25).get(),
    refs.pedidos(tid).orderBy("criadoEm", "desc").limit(25).get(),
    db.collection("logsErro").where("torcidaId", "==", tid).orderBy("criadoEm", "desc").limit(30).get(),
    db.collection(`torcidas/${tid}/eventos`).orderBy("data", "desc").limit(10).get(),
    db.collection(`torcidas/${tid}/planos`).get(),
  ]);
  if (!t.exists) throw new HttpsError("not-found", "Torcida não encontrada.");
  const mascararEmail = (e: string) => e.replace(/^(.{2}).*(@.*)$/, "$1***$2");
  return {
    torcida: t.data(),
    credenciais: {
      salvas: priv.exists && !!priv.get("skCifrada"),
      atualizadoEm: priv.get("atualizadoEm")?.toMillis?.() ?? null,
    },
    webhooks: webhooks.docs.map((w) => ({ id: w.id, ...w.data(), recebidoEm: w.get("recebidoEm")?.toMillis?.() ?? null })),
    pedidos: pedidos.docs.map((p) => {
      const x = p.data() as Pedido;
      return {
        id: p.id, tipo: x.tipo, status: x.status, metodo: x.metodo, total: x.total, motivo: x.motivo ?? null,
        eventoNome: x.eventoNome ?? null, criadoEm: x.criadoEm?.toMillis() ?? null,
        comprador: { nome: x.comprador?.nome, email: mascararEmail(x.comprador?.email ?? ""), cpf: mascararCpf(x.comprador?.cpf ?? "") },
        pagarmeOrderId: x.pagarme?.orderId ?? null,
      };
    }),
    erros: erros.docs.map((e) => ({ id: e.id, ...e.data(), criadoEm: e.get("criadoEm")?.toMillis?.() ?? null })),
    eventos: eventos.docs.map((e) => ({ id: e.id, nome: e.get("nome"), status: e.get("status"), vendidos: e.get("vendidos"), reservados: e.get("reservados") })),
    planos: planos.docs.map((p) => ({ id: p.id, nome: p.get("nome"), valor: p.get("valor"), ativo: p.get("ativo") })),
  };
});
