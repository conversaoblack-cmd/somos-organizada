import { onCall, HttpsError } from "firebase-functions/v2/https";
import { MASTER_KEY, URL_APP } from "../config";
import { auth, db, refs, FieldValue, Timestamp } from "../util/firebase";
import { cifrar, tokenAleatorio } from "../util/cripto";
import { emailValido, texto, umDe } from "../util/validacao";
import { exigirMembro, type Membro, type Papel } from "../dominio/permissoes";
import { Pagarme, PagarmeErro } from "../pagarme/cliente";
import { encerrarPedidoNaoPago } from "../dominio/processamento";
import type { PrivadoPagarme } from "../pagarme/credenciais";
import type { Evento, Sede } from "../dominio/tipos";
import { contarEventosAVenda, exigeProducao, limitesDoPlano, planoDaTorcida, SAAS_PADRAO } from "./saas";
import { enviarConvite } from "./convite";
import { DIA_MS, dentroDoLimite } from "../util/limites";

export function urlWebhook(tid: string, token: string): string {
  return `${URL_APP.value().replace(/\/$/, "")}/api/pagarme/webhook/${tid}/${token}`;
}

/**
 * Passo final do assistente "Conectar Pagar.me": a diretoria cola as chaves da conta
 * da própria torcida. Validamos na API, ciframos e devolvemos a URL de webhook.
 */
/** Desfaz o que pertence ao ambiente anterior da Pagar.me: split, recebedores, cartões salvos e pedidos em aberto. */
async function limparAmbienteAnterior(tid: string) {
  await refs.torcida(tid).update({ "pagamentos.splitAtivo": false, "pagamentos.recebedorPrincipalId": FieldValue.delete() });
  const sedes = await db.collection(`torcidas/${tid}/sedes`).get();
  for (const s of sedes.docs) {
    if (s.get("recebedor")) await s.ref.update({ recebedor: FieldValue.delete(), recebedorAmbienteAnterior: s.get("recebedor") });
  }
  const comCartao = await refs.socios(tid).where("pagarme.customerId", ">", "").get();
  for (const s of comCartao.docs) {
    await s.ref.update({ "pagarme.customerId": FieldValue.delete(), "pagarme.cardId": FieldValue.delete() });
  }
  for (const status of ["aguardando", "criando"] as const) {
    const abertos = await refs.pedidos(tid).where("status", "==", status).limit(500).get();
    for (const p of abertos.docs) {
      await encerrarPedidoNaoPago(tid, p.id, "expirado", "Pagamento encerrado: a torcida trocou as chaves da Pagar.me.").catch(() => undefined);
    }
  }
}

export const salvarCredenciaisPagarme = onCall({ secrets: [MASTER_KEY] }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const membro = await exigirMembro(req, tid, ["diretoria"]);
  const sk = texto(d.chaveSecreta, "chave secreta", { min: 10, max: 200 });
  const pk = texto(d.chavePublica, "chave pública", { min: 10, max: 200 });
  if (!sk.startsWith("sk_")) throw new HttpsError("invalid-argument", "A chave secreta começa com sk_. Confira se não copiou a chave pública.");
  if (!pk.startsWith("pk_")) throw new HttpsError("invalid-argument", "A chave pública começa com pk_.");
  const demo = sk.startsWith("sk_demo_");
  if (sk.startsWith("sk_test_") !== pk.startsWith("pk_test_") || demo !== pk.startsWith("pk_demo_")) {
    throw new HttpsError("invalid-argument", "As duas chaves precisam ser do mesmo ambiente (as duas de teste, de produção ou de demonstração).");
  }
  // Simulador só antes de publicar: uma torcida no ar não pode trocar a Pagar.me real pelo modo demonstração
  // (ingressos e carteirinhas "pagos" sem dinheiro de verdade). Quem já estava em demonstração continua.
  // Torcida que já foi publicada (mesmo despublicada agora) não volta para teste nem demonstração: despublicar,
  // trocar para demo, "pagar" ingressos de mentira e voltar deixava ingressos válidos sem dinheiro.
  if (demo || sk.startsWith("sk_test_")) {
    const t = (await refs.torcida(tid).get()).data() as { publicada?: boolean; publicadaEm?: unknown; demonstracao?: boolean; pagamentos?: { ambiente?: string } } | undefined;
    const jaPublicou = (t?.publicada === true || !!t?.publicadaEm) && t?.demonstracao !== true;
    if (demo && jaPublicou && t?.pagamentos?.ambiente !== "demo") {
      throw new HttpsError("failed-precondition", "O modo demonstração só pode ser ativado antes de publicar o site. Use as chaves de produção da Pagar.me.");
    }
    if (!demo && jaPublicou && exigeProducao(t)) {
      throw new HttpsError("failed-precondition", "Depois que o site foi publicado, só as chaves de produção da Pagar.me podem ser usadas.");
    }
  }
  const pix = d.pix !== false;
  const cartao = d.cartao !== false;
  if (!pix && !cartao) throw new HttpsError("invalid-argument", "Ative ao menos uma forma de pagamento.");
  const descritorFatura = texto(d.descritorFatura, "nome na fatura", { max: 13, obrigatorio: false }) || undefined;

  const cliente = new Pagarme(sk);
  try {
    if (!demo) await cliente.testar(); // no modo demonstração não há Pagar.me para consultar
  } catch (e) {
    if (e instanceof PagarmeErro && (e.status === 401 || e.status === 403)) {
      throw new HttpsError("invalid-argument", "A Pagar.me recusou esta chave secreta. Copie novamente no painel da Pagar.me.");
    }
    throw new HttpsError("unavailable", "Não foi possível falar com a Pagar.me agora. Tente em alguns minutos.");
  }

  const privRef = refs.privadoPagarme(tid);
  const atual = (await privRef.get()).data() as PrivadoPagarme | undefined;
  const antes = ((await refs.torcida(tid).get()).get("pagamentos") ?? {}) as { configurado?: boolean; ambiente?: string };
  // Troca de ambiente (ex.: teste → produção): o que foi criado na Pagar.me do ambiente anterior não existe no
  // novo (recebedores, cartões salvos, pedidos). Sem limpar, a 1ª venda real seria recusada pela Pagar.me.
  if (antes.configurado && antes.ambiente && antes.ambiente !== cliente.ambiente) await limparAmbienteAnterior(tid);
  const webhookToken = atual?.webhookToken ?? tokenAleatorio(24);
  await privRef.set({
    skCifrada: cifrar(sk, MASTER_KEY.value()),
    webhookToken,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPor: membro.uid,
  });
  await refs.torcida(tid).update({
    "pagamentos.configurado": true,
    "pagamentos.ambiente": cliente.ambiente,
    "pagamentos.chavePublica": pk,
    "pagamentos.pix": pix,
    "pagamentos.cartao": cartao,
    "pagamentos.descritorFatura": descritorFatura ?? FieldValue.delete(),
    "pagamentos.configuradoEm": FieldValue.serverTimestamp(),
  });
  return { ambiente: cliente.ambiente, webhookUrl: urlWebhook(tid, webhookToken) };
});

export const obterWebhookUrl = onCall(async (req) => {
  const tid = texto((req.data ?? {}).tid, "torcida", { max: 40 });
  await exigirMembro(req, tid, ["diretoria"]);
  const priv = (await refs.privadoPagarme(tid).get()).data() as PrivadoPagarme | undefined;
  if (!priv?.webhookToken) return { webhookUrl: null };
  return { webhookUrl: urlWebhook(tid, priv.webhookToken) };
});

/** Cria (ou reaproveita) a conta do usuário e dá acesso ao painel. Devolve link para definir senha. */
export async function concederAcesso(args: {
  tid: string;
  email: string;
  nome: string;
  papel: Papel;
  sedeId?: string;
  convidadoPor: string;
  devolverLink?: boolean;
}) {
  const { tid, email, nome, papel, sedeId, convidadoPor } = args;
  let usuario;
  let contaNova = false;
  let semDonoComprovado = false;
  try {
    usuario = await auth.getUserByEmail(email);
    // Conta que existe mas nunca confirmou o e-mail: qualquer um pode ter criado antes com o e-mail do convidado
    // (e saberia a senha). Não confia: senha trocada por uma aleatória, sessões derrubadas, e o convite manda
    // criar a senha pelo link que só o dono do e-mail recebe.
    // (quem já é membro ativo desta torcida não é derrubado: o "Reenviar convite" passa por aqui)
    const jaMembroAtivo = (await refs.membro(tid, usuario.uid).get()).get("ativo") === true;
    if (!usuario.emailVerified && !jaMembroAtivo) {
      await auth.updateUser(usuario.uid, { password: tokenAleatorio(32) });
      await auth.revokeRefreshTokens(usuario.uid);
      semDonoComprovado = true;
    }
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
    usuario = await auth.createUser({ email, displayName: nome, password: tokenAleatorio(18) });
    contaNova = true;
  }
  const membro: Omit<Membro, "aguardandoConvite"> & Record<string, unknown> = {
    uid: usuario.uid,
    email,
    nome,
    papel,
    sedeId: sedeId ?? undefined,
    // sem dono comprovado: o acesso só vale quando o dono do e-mail aceitar o convite (quem criou a conta antes
    // ainda teria até 1 h de sessão aberta)
    ativo: !semDonoComprovado,
    aguardandoConvite: semDonoComprovado ? true : FieldValue.delete(),
    convidadoPor,
    criadoEm: FieldValue.serverTimestamp(),
  };
  await refs.membro(tid, usuario.uid).set(membro, { merge: true });
  await db.doc(`usuarios/${usuario.uid}/acessos/${tid}`).set({ papel, sedeId: sedeId ?? null, ativo: !semDonoComprovado });
  // Link de definir senha só para conta recém-criada e só para quem pediu explicitamente (equipe da plataforma).
  // Nunca para conta que já existe: quem convida poderia trocar a senha de outra pessoa e entrar no lugar dela.
  // No convite da diretoria o link vai só por e-mail, direto para o convidado (ninguém mais vê a senha).
  const linkDefinirSenha =
    contaNova && args.devolverLink ? await auth.generatePasswordResetLink(email, { url: `${URL_APP.value()}/entrar` }) : null;
  // Convidado antes e nunca entrou (não criou a senha): o "Reenviar" precisa mandar de novo o link de criar senha
  const nuncaEntrou = contaNova || semDonoComprovado || !usuario.metadata.lastSignInTime;
  return { uid: usuario.uid, contaNova, nuncaEntrou, linkDefinirSenha };
}

export const convidarMembro = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const quem = await exigirMembro(req, tid, ["diretoria"]);
  const email = texto(d.email, "e-mail", { max: 120 }).toLowerCase();
  if (!emailValido(email)) throw new HttpsError("invalid-argument", "E-mail inválido.");
  const nome = texto(d.nome, "nome", { min: 2, max: 64 });
  const papel = umDe(d.papel, "papel", ["diretoria", "subsede", "portaria"] as const);
  const sedeId = texto(d.sedeId, "sede", { max: 40, obrigatorio: false }) || undefined;
  if (papel === "subsede" && !sedeId) throw new HttpsError("invalid-argument", "Escolha a subsede deste usuário.");
  if (sedeId && !(await refs.sede(tid, sedeId).get()).exists) throw new HttpsError("invalid-argument", "Sede inválida.");
  // Convite manda e-mail (e, em conta sem e-mail confirmado, troca a senha): sem limite viraria envio em massa ou
  // derrubaria a mesma pessoa várias vezes
  if (!(await dentroDoLimite(`convite-torcida:${tid}`, 60, DIA_MS)) || !(await dentroDoLimite(`convite-email:${email}`, 5, DIA_MS))) {
    throw new HttpsError("resource-exhausted", "Muitos convites hoje. Tente de novo amanhã ou fale com a equipe pelo botão de ajuda.");
  }
  const r = await concederAcesso({ tid, email, nome, papel, sedeId, convidadoPor: quem.uid });
  // E-mail com a cara da torcida: "você foi convidado" com botão para criar a senha (nunca o "redefinir senha" do Google)
  const emailEnviado = await enviarConvite({ tid, uid: r.uid, email, nome, papel, sedeId, convidadoPor: quem.uid, precisaSenha: r.nuncaEntrou });
  return { uid: r.uid, contaNova: r.contaNova, nuncaEntrou: r.nuncaEntrou, emailEnviado };
});

export const atualizarMembro = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const quem = await exigirMembro(req, tid, ["diretoria"]);
  const uid = texto(d.uid, "usuário", { max: 128 });
  const ref = refs.membro(tid, uid);
  const atual = (await ref.get()).data() as Membro | undefined;
  if (!atual) throw new HttpsError("not-found", "Usuário não encontrado.");
  const upd: Record<string, unknown> = { atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: quem.uid };
  if (d.papel !== undefined) upd.papel = umDe(d.papel, "papel", ["diretoria", "subsede", "portaria"] as const);
  if (d.sedeId !== undefined) {
    const novaSede = d.sedeId ? texto(d.sedeId, "sede", { max: 40 }) : null;
    // Mesma conferência do convidarMembro: sede inexistente deixaria o usuário com um escopo fantasma
    if (novaSede && !(await refs.sede(tid, novaSede).get()).exists) throw new HttpsError("invalid-argument", "Sede inválida.");
    upd.sedeId = novaSede ?? FieldValue.delete();
  }
  if (d.ativo === false) {
    upd.ativo = false;
    upd.aguardandoConvite = FieldValue.delete();
  } else if (d.ativo === true && !atual.aguardandoConvite) upd.ativo = true; // aguardando: só o aceite do convite libera
  const ficaraDiretoriaAtiva = (upd.papel ?? atual.papel) === "diretoria" && (upd.ativo ?? atual.ativo);
  if (atual.papel === "diretoria" && atual.ativo && !ficaraDiretoriaAtiva) {
    const diretores = await db.collection(`torcidas/${tid}/membros`).where("papel", "==", "diretoria").where("ativo", "==", true).get();
    if (diretores.size <= 1) throw new HttpsError("failed-precondition", "A torcida precisa de pelo menos um usuário de diretoria ativo.");
  }
  const sedeFinal = d.sedeId !== undefined ? (typeof upd.sedeId === "string" ? upd.sedeId : undefined) : atual.sedeId;
  if ((upd.papel ?? atual.papel) === "subsede" && !sedeFinal) {
    throw new HttpsError("invalid-argument", "Usuário de subsede precisa de uma sede.");
  }
  await ref.update(upd);
  await db.doc(`usuarios/${uid}/acessos/${tid}`).set(
    { papel: upd.papel ?? atual.papel, sedeId: sedeFinal ?? null, ativo: upd.ativo ?? atual.ativo },
    { merge: true },
  );
  return { ok: true };
});

/**
 * Publica um evento (colocar à venda). Só o servidor grava status "publicado" (as regras do Firestore recusam
 * no navegador), porque aqui conferimos o limite de eventos à venda do plano Somos Organizada.
 * Mesmas condições das regras: diretoria; sede principal, ou subsede com conta de recebimento ativa.
 * Serve para criar já publicado (o painel grava rascunho e chama esta ação), aprovar evento de subsede
 * e reabrir as vendas de um evento encerrado.
 */
export const publicarEvento = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const eventoId = texto(d.eventoId, "evento", { max: 60 });
  const quem = await exigirMembro(req, tid, ["diretoria"]);
  const ref = refs.evento(tid, eventoId);
  const ev = (await ref.get()).data() as Evento | undefined;
  if (!ev) throw new HttpsError("not-found", "Evento não encontrado.");
  if (ev.status === "publicado") return { status: "publicado" as const };

  const sede = (await refs.sede(tid, ev.sedeId).get()).data() as Sede | undefined;
  if (!sede) throw new HttpsError("failed-precondition", "A sede deste evento não existe mais. Escolha outra sede.");
  if (sede.tipo !== "principal" && sede.recebedor?.status !== "active") {
    throw new HttpsError(
      "failed-precondition",
      "Esta subsede ainda não tem conta de recebimento ativa. Peça para o responsável dela cadastrar em Recebimentos.",
    );
  }

  // Limite do plano: só conta evento futuro (evento que já passou não fica à venda)
  const futuro = ev.data instanceof Timestamp ? ev.data.toMillis() >= Date.now() : true;
  const plano = futuro ? await planoDaTorcida(tid) : null;
  if (plano) {
    const limite = limitesDoPlano(plano).eventos;
    if ((await contarEventosAVenda(tid)) >= limite) {
      throw new HttpsError(
        "failed-precondition",
        `Seu plano ${SAAS_PADRAO.planos[plano].nome} permite ${limite} eventos à venda ao mesmo tempo. Encerre um evento ou mude de plano.`,
        { limitePlano: "eventos" },
      );
    }
  }

  await db.runTransaction(async (tx) => {
    const atual = (await tx.get(ref)).data() as Evento | undefined;
    if (!atual) throw new HttpsError("not-found", "Evento não encontrado.");
    if (atual.status === "publicado") return;
    tx.update(ref, {
      status: "publicado",
      publicadoEm: FieldValue.serverTimestamp(),
      publicadoPor: quem.uid,
      motivoDevolucao: FieldValue.delete(),
      atualizadoEm: FieldValue.serverTimestamp(),
      ...(atual.status === "em_aprovacao" ? { aprovadoEm: FieldValue.serverTimestamp(), aprovadoPor: quem.uid } : {}),
    });
  });
  return { status: "publicado" as const };
});
