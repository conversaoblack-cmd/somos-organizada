// Fluxo completo contra os emuladores do Firebase + Pagar.me simulada.
// Executado por rodar.sh (firebase emulators:exec).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp as adminApp } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminDb } from "firebase-admin/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, query, where, setDoc, updateDoc, addDoc, collection, Timestamp } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { getStorage, connectStorageEmulator, ref as sRef, uploadBytes } from "firebase/storage";
import { iniciar, chamadas } from "./pagarme-simulada.mjs";

const PROJETO = "demo-somos";
const REGIAO = "southamerica-east1";
const SENHA = "senha-teste-123";
adminApp({ projectId: PROJETO });
const aAuth = adminAuth();
const aDb = adminDb();

let pagarme;
const apps = [];

/** Um "navegador" isolado (app Firebase próprio) para cada pessoa do teste. */
function navegador(nome) {
  const app = initializeApp({ projectId: PROJETO, apiKey: "demo", authDomain: "demo" }, nome);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const fns = getFunctions(app, REGIAO);
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  const chamar = async (nomeFn, dados) => (await httpsCallable(fns, "api")({ acao: nomeFn, dados })).data;
  const storage = getStorage(app, "demo-somos.appspot.com");
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  const enviar = (caminho) => uploadBytes(sRef(storage, caminho), PNG, { contentType: "image/png" });
  return { auth, db, chamar, enviar };
}

async function webhook(tid, token, corpo) {
  const r = await fetch(`http://127.0.0.1:5001/${PROJETO}/${REGIAO}/pagarmeWebhook/${tid}/${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  return r.status;
}

const negado = async (promessa) => {
  await assert.rejects(promessa, (e) => /permission|PERMISSION_DENIED|insufficient/i.test(String(e?.code ?? e?.message)));
};

const ctx = {};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

before(async () => {
  pagarme = await iniciar(4010);
});
after(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  pagarme.close();
});

test("1. plataforma cria a torcida e a diretoria recebe acesso", async () => {
  const plat = await aAuth.createUser({ email: "equipe@somos.test", password: SENHA, emailVerified: true });
  await aAuth.setCustomUserClaims(plat.uid, { plataforma: true });
  const b = navegador("plataforma");
  await signInWithEmailAndPassword(b.auth, "equipe@somos.test", SENHA);
  const r = await b.chamar("criarTorcida", {
    nome: "Torcida Brasil Demo", slug: "brasil-demo", diretor: { nome: "Presidente", email: "diretoria@brasil.test" },
  });
  assert.ok(r.torcidaId);
  assert.match(r.linkDefinirSenha, /oobCode|mode=resetPassword/);
  ctx.tid = r.torcidaId;
  ctx.plat = b;

  await assert.rejects(
    b.chamar("criarTorcida", { nome: "Outra", slug: "brasil-demo", diretor: { nome: "Xavier", email: "x@x.test" } }),
    /já está em uso/,
  );
  const slug = await aDb.doc("slugs/brasil-demo").get();
  assert.equal(slug.get("torcidaId"), ctx.tid);
});

test("2. diretoria conecta a Pagar.me (chave validada e cifrada)", async () => {
  const dir = await aAuth.getUserByEmail("diretoria@brasil.test");
  await aAuth.updateUser(dir.uid, { password: SENHA });
  const b = navegador("diretoria");
  await signInWithEmailAndPassword(b.auth, "diretoria@brasil.test", SENHA);
  ctx.dir = b;
  ctx.dirUid = dir.uid;

  await assert.rejects(b.chamar("salvarCredenciaisPagarme", { tid: ctx.tid, chaveSecreta: "pk_test_errada123", chavePublica: "pk_test_123456789" }), /sk_/);
  await assert.rejects(b.chamar("salvarCredenciaisPagarme", { tid: ctx.tid, chaveSecreta: "sk_live_x123456789", chavePublica: "pk_test_123456789" }), /mesmo ambiente/);

  const r = await b.chamar("salvarCredenciaisPagarme", {
    tid: ctx.tid, chaveSecreta: "sk_test_SEGREDO123456", chavePublica: "pk_test_PUBLICA123456",
  });
  assert.equal(r.ambiente, "teste");
  assert.match(r.webhookUrl, new RegExp(`/api/pagarme/webhook/${ctx.tid}/[\\w-]{20,}$`));
  ctx.webhookToken = r.webhookUrl.split("/").pop();

  const priv = await aDb.doc(`torcidas/${ctx.tid}/privado/pagarme`).get();
  assert.ok(priv.get("skCifrada").startsWith("v1."));
  assert.ok(!priv.get("skCifrada").includes("SEGREDO"));
  // nem a diretoria lê as credenciais pelo navegador
  await negado(getDoc(doc(b.db, `torcidas/${ctx.tid}/privado/pagarme`)));
});

test("3. diretoria personaliza a página, cria subsede, plano e evento (regras do Firestore)", async () => {
  const b = ctx.dir;
  const t = await getDoc(doc(b.db, `torcidas/${ctx.tid}`));
  ctx.sedePrincipal = t.get("sedePrincipalId");

  await updateDoc(doc(b.db, `torcidas/${ctx.tid}`), {
    tema: { corPrimaria: "#00A94F", corSecundaria: "#FFDF00", corFundo: "#07090B", corTexto: "#FFFFFF" },
  });
  await negado(updateDoc(doc(b.db, `torcidas/${ctx.tid}`), { taxaServicoPct: 0 }));
  await negado(updateDoc(doc(b.db, `torcidas/${ctx.tid}`), { "pagamentos.chavePublica": "pk_test_HACKER123" }));

  const sub = await addDoc(collection(b.db, `torcidas/${ctx.tid}/sedes`), { nome: "4º Distrito", tipo: "subsede", ativa: true, ordem: 4 });
  ctx.subsede = sub.id;

  await setDoc(doc(b.db, `torcidas/${ctx.tid}/planos/mensal`), {
    nome: "Sócio Mensal", valor: 1000, intervalo: "mes", intervaloQtd: 1, pix: true, cartao: true, ativo: true, ordem: 1,
  });
  await setDoc(doc(b.db, `torcidas/${ctx.tid}/planos/infantil`), {
    nome: "Sócio Infantil", valor: 500, intervalo: "mes", intervaloQtd: 1, pix: true, cartao: false, ativo: true, ordem: 2,
  });

  // publicar (pôr à venda) é só pelo servidor: o navegador não cria nem passa evento para "publicado"
  const dadosReuniao = {
    nome: "Reunião geral", sedeId: ctx.sedePrincipal, data: Timestamp.fromMillis(Date.now() + 3 * 86400_000),
    valorSocio: 0, valorPublico: 100, vendidos: 0, reservados: 0,
  };
  await negado(addDoc(collection(b.db, `torcidas/${ctx.tid}/eventos`), { ...dadosReuniao, status: "publicado" }));
  const evP = await addDoc(collection(b.db, `torcidas/${ctx.tid}/eventos`), { ...dadosReuniao, status: "rascunho" });
  await negado(updateDoc(evP, { status: "publicado" }));
  assert.equal((await b.chamar("publicarEvento", { tid: ctx.tid, eventoId: evP.id })).status, "publicado");
  // contadores de venda são do servidor (testado num evento da sede principal)
  await negado(updateDoc(evP, { vendidos: 99 }));
  // evento já publicado continua editável pela diretoria (sem sair de "publicado")
  await updateDoc(evP, { local: "Sede Central" });

  // link direto (/torcida/e/codigo): código válido na criação, ganho depois por evento antigo e nunca trocado
  const base = { nome: "Caravana", sedeId: ctx.sedePrincipal, data: Timestamp.fromMillis(Date.now() + 5 * 86400_000), valorSocio: 1000, valorPublico: 2000, vendidos: 0, reservados: 0, status: "rascunho" };
  await negado(addDoc(collection(b.db, `torcidas/${ctx.tid}/eventos`), { ...base, codigo: "ABC123" }));
  await negado(addDoc(collection(b.db, `torcidas/${ctx.tid}/eventos`), { ...base, codigo: "abc10o" }));
  const evC = await addDoc(collection(b.db, `torcidas/${ctx.tid}/eventos`), { ...base, codigo: "k7p2qx" });
  await b.chamar("publicarEvento", { tid: ctx.tid, eventoId: evC.id });
  await negado(updateDoc(evC, { codigo: "m3n4pq" }));
  await updateDoc(evP, { codigo: "r5s6tu" });
  // o torcedor (sem login) acha o evento publicado pelo código
  const anon = navegador("anonimo-codigo");
  const achado = await getDocs(query(collection(anon.db, `torcidas/${ctx.tid}/eventos`), where("codigo", "==", "k7p2qx"), where("status", "in", ["publicado", "encerrado"])));
  assert.equal(achado.docs[0]?.id, evC.id);
});

test("3b. subsede: convite, conta de recebimento com prova de vida, evento aprovado pela diretoria", async () => {
  const dir = ctx.dir;
  // split da torcida: recebedor principal precisa existir e estar ativo
  await assert.rejects(dir.chamar("configurarSplit", { tid: ctx.tid, recebedorPrincipalId: "rp_naoexiste" }), /Pagar\.me|recebedor/i);
  const sp = await dir.chamar("configurarSplit", { tid: ctx.tid, recebedorPrincipalId: "rp_principal" });
  assert.equal(sp.splitAtivo, true);

  // diretoria convida o diretor da subsede
  const conv = await dir.chamar("convidarMembro", { tid: ctx.tid, email: "subsede4@brasil.test", nome: "Coordenador 4º", papel: "subsede", sedeId: ctx.subsede });
  assert.equal(conv.contaNova, true);
  assert.equal(conv.linkDefinirSenha ?? null, null); // quem convida nunca vê o link
  // o convite próprio (página /convite): no emulador o link fica em _emulador; em produção só no e-mail do convidado
  const { token, url } = (await aDb.doc(`_emulador/convite-${conv.uid}`).get()).data();
  assert.match(url, /\/convite\?c=/);
  assert.equal((await aDb.collection("convites").where("uid", "==", conv.uid).get()).docs.every((d) => d.id !== token), true); // guarda só o resumo
  const convidado = navegador("convidado");
  const visto = await convidado.chamar("verConvite", { c: token });
  assert.equal(visto.valido, true);
  assert.equal(visto.email, "subsede4@brasil.test");
  assert.equal(visto.papel, "subsede");
  assert.equal(visto.torcida.slug, "brasil-demo");
  assert.ok(visto.sedeNome);
  await assert.rejects(convidado.chamar("aceitarConvite", { c: token, senha: "curta" }), /8 caracteres/);
  await assert.rejects(convidado.chamar("aceitarConvite", { c: "x".repeat(43), senha: SENHA }), /não existe/);
  const aceito = await convidado.chamar("aceitarConvite", { c: token, senha: SENHA });
  assert.deepEqual(aceito, { email: "subsede4@brasil.test", slug: "brasil-demo" });
  assert.equal((await aAuth.getUser(conv.uid)).emailVerified, true); // e-mail confirmado pelo próprio convite
  await assert.rejects(convidado.chamar("aceitarConvite", { c: token, senha: "OutraSenha123" }), /já foi usado/);
  assert.equal((await convidado.chamar("verConvite", { c: token })).motivo, "usado");
  const sub = navegador("subsede");
  await signInWithEmailAndPassword(sub.auth, "subsede4@brasil.test", SENHA);
  ctx.sub = sub;

  // diretoria NÃO cadastra recebedor da subsede (antifraude); ninguém grava "recebedor" pelo navegador
  const dadosRecebedor = {
    nome: "Coordenador Quarto Distrito", email: "subsede4@brasil.test", cpf: "52998224725", nascimento: "1985-04-10",
    nomeMae: "Maria do Distrito", rendaMensal: 350000, profissao: "Comerciante", telefone: "71999990004",
    endereco: { cep: "40000000", logradouro: "Rua do Distrito", numero: "4", bairro: "Periperi", cidade: "Salvador", uf: "BA" },
    banco: { codigo: "341", agencia: "1234", conta: "56789", contaDv: "0", tipo: "checking" },
  };
  await assert.rejects(dir.chamar("cadastrarRecebedor", { tid: ctx.tid, dados: dadosRecebedor }), /permissão/);
  await negado(updateDoc(doc(dir.db, `torcidas/${ctx.tid}/sedes/${ctx.subsede}`), { recebedor: { id: "rp_hacker", status: "active" } }));

  // subsede cria evento e envia para aprovação; não consegue publicar sozinha
  const ev = await addDoc(collection(sub.db, `torcidas/${ctx.tid}/eventos`), {
    nome: "Caravana Final", descricao: "Ônibus + ingresso", sedeId: ctx.subsede, local: "Arena",
    data: Timestamp.fromMillis(Date.now() + 7 * 86400_000), valorSocio: 4000, valorPublico: 5000,
    capacidade: 3, vendidos: 0, reservados: 0, status: "em_aprovacao",
  });
  ctx.evento = ev.id;
  await negado(updateDoc(doc(sub.db, `torcidas/${ctx.tid}/eventos/${ev.id}`), { status: "publicado" }));
  await assert.rejects(sub.chamar("publicarEvento", { tid: ctx.tid, eventoId: ev.id }), /permissão/);
  // diretoria também não publica enquanto a conta da subsede não estiver ativa
  await negado(updateDoc(doc(dir.db, `torcidas/${ctx.tid}/eventos/${ev.id}`), { status: "publicado" }));
  await assert.rejects(dir.chamar("publicarEvento", { tid: ctx.tid, eventoId: ev.id }), /conta de recebimento ativa/);

  // subsede cadastra a conta de recebimento → precisa da prova de vida
  const cad = await sub.chamar("cadastrarRecebedor", { tid: ctx.tid, dados: dadosRecebedor });
  assert.equal(cad.recebedor.status, "registration");
  assert.match(cad.recebedor.kycUrl, /^https:\/\/www\.pagar\.me\/kyc\//);
  assert.equal(cad.recebedor.documentoMascarado, "***.982.247-**");
  ctx.recebedorSubsede = cad.recebedor.id;

  // titular faz a prova de vida; a Pagar.me ativa e avisa por webhook
  await fetch(`http://127.0.0.1:4010/__recebedor/${cad.recebedor.id}`, { method: "POST" });
  assert.equal(await webhook(ctx.tid, ctx.webhookToken, { id: "hook_rp1", type: "recipient.updated", data: { id: cad.recebedor.id } }), 200);
  const sede = await aDb.doc(`torcidas/${ctx.tid}/sedes/${ctx.subsede}`).get();
  assert.equal(sede.get("recebedor").status, "active");

  // dados bancários do titular ficam só com a subsede; a página pública e a diretoria veem só a situação
  const sedePublica = (await aDb.doc(`torcidas/${ctx.tid}/sedes/${ctx.subsede}`).get()).get("recebedor");
  assert.deepEqual(Object.keys(sedePublica).sort(), ["atualizadoEm", "id", "kycStatus", "status"]);
  const privado = await getDoc(doc(sub.db, `torcidas/${ctx.tid}/sedes/${ctx.subsede}/privado/recebedor`));
  assert.equal(privado.get("nomeTitular"), "Coordenador Quarto Distrito");
  await negado(getDoc(doc(dir.db, `torcidas/${ctx.tid}/sedes/${ctx.subsede}/privado/recebedor`)));
  const viaDiretoria = await dir.chamar("atualizarRecebedor", { tid: ctx.tid, sedeId: ctx.subsede });
  assert.equal(viaDiretoria.recebedor.nomeTitular, undefined);

  // agora a diretoria aprova (publica pelo servidor)
  await dir.chamar("publicarEvento", { tid: ctx.tid, eventoId: ev.id });
  const aprovado = await aDb.doc(`torcidas/${ctx.tid}/eventos/${ev.id}`).get();
  assert.equal(aprovado.get("status"), "publicado");
  assert.equal(aprovado.get("aprovadoPor"), ctx.dirUid);
  // depois de publicado, a subsede não altera mais o evento
  await negado(updateDoc(doc(sub.db, `torcidas/${ctx.tid}/eventos/${ev.id}`), { valorPublico: 1 }));
});

test("3c. site só vende depois de publicado; publicar escolhe o plano e gera a 1ª fatura no Pix", async () => {
  await aDb.doc("plataforma/publico").set({ pix: { chave: "financeiro@somosorganizada.test", nome: "Somos Organizada", cidade: "Salvador" } });
  const visitante = navegador("visitante-antes");
  await signInAnonymously(visitante.auth);
  await assert.rejects(
    visitante.chamar("criarPedidoIngresso", {
      tid: ctx.tid, eventoId: ctx.evento, metodo: "pix",
      comprador: { nome: "Antes Da Hora", email: "a@x.test", cpf: "11144477735", telefone: "71999990000" },
      titulares: [{ nome: "Antes Da Hora", cpf: "11144477735" }],
    }),
    /ainda não foi publicado/,
  );
  // módulos: a diretoria pode ligar/desligar eventos e sócios
  await updateDoc(doc(ctx.dir.db, `torcidas/${ctx.tid}`), { modulos: { eventos: true, socios: true } });
  await assert.rejects(ctx.sub.chamar("publicarSite", { tid: ctx.tid, plano: "pro" }), /permissão/);
  await assert.rejects(ctx.dir.chamar("publicarSite", { tid: ctx.tid, plano: "pequena" }), /Escolha um plano/);
  const r = await ctx.dir.chamar("publicarSite", { tid: ctx.tid, plano: "pro" });
  assert.equal(r.publicada, true);
  const faturas = await aDb.collection(`torcidas/${ctx.tid}/faturasSaas`).get();
  assert.equal(faturas.size, 1);
  const f = faturas.docs[0];
  assert.equal(f.get("valor"), 19700);
  assert.equal(f.get("plano"), "pro");
  assert.equal(f.get("status"), "aberta");
  assert.match(f.get("pixCopiaECola"), /^000201.*br\.gov\.bcb\.pix.*5406197\.00/);
  const venc = f.get("vencimento").toMillis();
  assert.ok(venc > Date.now() + 6 * 86400_000 && venc < Date.now() + 8 * 86400_000);
  ctx.faturaSaas = f.id;
  ctx.vencSaas = venc;
  const t = await aDb.doc(`torcidas/${ctx.tid}`).get();
  assert.equal(t.get("status"), "ativa");
  // sócio comum não lê as faturas da plataforma
  await negado(getDoc(doc(visitante.db, `torcidas/${ctx.tid}/faturasSaas/${f.id}`)));
});

test("4. torcedor sem cadastro compra no Pix; webhook confirma e emite ingresso com QR", async () => {
  const b = navegador("torcedor");
  await signInAnonymously(b.auth);
  ctx.torcedor = b;

  const cot = await b.chamar("cotarIngresso", { tid: ctx.tid, eventoId: ctx.evento });
  assert.equal(cot.taxaPublico, 500);
  assert.equal(cot.socio, null);

  const r = await b.chamar("criarPedidoIngresso", {
    tid: ctx.tid, eventoId: ctx.evento, metodo: "pix",
    comprador: { nome: "Torcedor Teste", email: "torcedor@x.test", cpf: "111.444.777-35", telefone: "71999990000" },
    titulares: [{ nome: "Torcedor Teste", cpf: "11144477735" }],
  });
  assert.equal(r.status, "aguardando");
  const pedido = await getDoc(doc(b.db, `torcidas/${ctx.tid}/pedidos/${r.pedidoId}`));
  assert.equal(pedido.get("total"), 5500); // R$50 + 10%
  assert.ok(pedido.get("pix").qrCode);
  const enviado = chamadas.findLast((c) => c.caminho === "/orders" && c.metodo === "POST").corpo;
  assert.deepEqual(enviado.items.map((i) => i.amount), [5000, 500]);
  assert.equal(enviado.code, r.pedidoId);
  // split: R$50 para a subsede (paga tarifas e chargeback), R$5 para a torcida
  assert.deepEqual(
    enviado.payments[0].split.map((x) => [x.recipient_id, x.amount, x.options.liable, x.options.charge_processing_fee]),
    [[ctx.recebedorSubsede, 5000, true, true], ["rp_principal", 500, false, false]],
  );

  // webhook com token errado é recusado
  assert.equal(await webhook(ctx.tid, "token-errado", { id: "hook_x", type: "order.paid", data: { id: "x" } }), 401);

  // cliente paga o Pix → Pagar.me avisa
  const orderId = pedido.get("pagarme").orderId;
  await fetch(`http://127.0.0.1:4010/__pagar/${orderId}`, { method: "POST" });
  assert.equal(await webhook(ctx.tid, ctx.webhookToken, { id: "hook_001", type: "order.paid", data: { id: orderId } }), 200);
  // reenvio do mesmo evento não duplica
  assert.equal(await webhook(ctx.tid, ctx.webhookToken, { id: "hook_001", type: "order.paid", data: { id: orderId } }), 200);

  const pago = await getDoc(doc(b.db, `torcidas/${ctx.tid}/pedidos/${r.pedidoId}`));
  assert.equal(pago.get("status"), "pago");
  assert.equal(pago.get("ingressoIds").length, 1);
  ctx.ingressoPublico = pago.get("ingressoIds")[0];
  ctx.pedidoPublico = { id: r.pedidoId, chave: pago.get("chaveAcesso") };

  const ing = await getDoc(doc(b.db, `torcidas/${ctx.tid}/ingressos/${ctx.ingressoPublico}`));
  assert.equal(ing.get("tipo"), "publico");
  assert.match(ing.get("qr"), /^SO1\.i\./);
  ctx.qrPublico = ing.get("qr");

  const ev = await aDb.doc(`torcidas/${ctx.tid}/eventos/${ctx.evento}`).get();
  assert.equal(ev.get("vendidos"), 1);
  assert.equal(ev.get("reservados"), 0);

  // extrato: base vai para a subsede do evento, taxa para a sede principal
  const base = await aDb.doc(`torcidas/${ctx.tid}/lancamentos/${r.pedidoId}_base`).get();
  const taxa = await aDb.doc(`torcidas/${ctx.tid}/lancamentos/${r.pedidoId}_taxa`).get();
  assert.equal(base.get("sedeId"), ctx.subsede);
  assert.equal(base.get("valor"), 5000);
  assert.equal(base.get("liquidacao"), "split"); // já caiu na conta da subsede: nada a repassar
  assert.equal(taxa.get("sedeId"), ctx.sedePrincipal);
  assert.equal(taxa.get("valor"), 500);

  // outro torcedor não enxerga este pedido
  const curioso = navegador("curioso");
  await signInAnonymously(curioso.auth);
  await negado(getDoc(doc(curioso.db, `torcidas/${ctx.tid}/pedidos/${r.pedidoId}`)));
});

test("5. link de ingressos funciona em outro aparelho só com a chave certa", async () => {
  const b = navegador("outro-aparelho");
  const r = await b.chamar("ingressosDoPedido", { tid: ctx.tid, pedidoId: ctx.pedidoPublico.id, chave: ctx.pedidoPublico.chave });
  assert.equal(r.ingressos.length, 1);
  assert.equal(r.ingressos[0].titularCpf, "***.444.777-**");
  await assert.rejects(b.chamar("ingressosDoPedido", { tid: ctx.tid, pedidoId: ctx.pedidoPublico.id, chave: "x".repeat(24) }), /Link inválido/);
});

test("6. cartão recusado libera a reserva e devolve o motivo", async () => {
  const r = ctx.torcedor.chamar("criarPedidoIngresso", {
    tid: ctx.tid, eventoId: ctx.evento, metodo: "cartao",
    comprador: { nome: "Torcedor Teste", email: "torcedor@x.test", cpf: "11144477735", telefone: "71999990000" },
    titulares: [{ nome: "Amigo", cpf: "52998224725" }],
    cartao: { token: "tok_recusado", endereco: { cep: "40000000", logradouro: "Rua A", numero: "1", bairro: "Centro", cidade: "Salvador", uf: "BA" } },
  });
  await assert.rejects(r, /Saldo ou limite insuficiente/);
  const ev = await aDb.doc(`torcidas/${ctx.tid}/eventos/${ctx.evento}`).get();
  assert.equal(ev.get("reservados"), 0);
});

test("7. adesão de sócio no Pix → ativo com matrícula; carteirinha com QR", async () => {
  const b = navegador("socio");
  await createUserWithEmailAndPassword(b.auth, "socio@x.test", SENHA);
  ctx.socio = b;
  ctx.socioUid = b.auth.currentUser.uid;

  const r = await b.chamar("aderirSocio", {
    tid: ctx.tid, planoId: "mensal", sedeId: ctx.subsede, metodo: "pix",
    dados: {
      nome: "Sócio Teste", cpf: "529.982.247-25", telefone: "(71) 98888-7777", nascimento: "1990-05-10",
      endereco: { cep: "40000-000", logradouro: "Rua B", numero: "10", bairro: "Stiep", cidade: "Salvador", uf: "BA" },
    },
  });
  assert.equal(r.modo, "pedido");
  const ficha = await getDoc(doc(b.db, `torcidas/${ctx.tid}/socios/${ctx.socioUid}`));
  assert.equal(ficha.get("status"), "pendente_pagamento");
  const pedido = await getDoc(doc(b.db, `torcidas/${ctx.tid}/pedidos/${r.pedidoId}`));
  assert.equal(pedido.get("total"), 1100); // R$10 + 10%
  assert.equal(pedido.get("liquidacao"), "split");
  const pedidoSocioPg = chamadas.findLast((c) => c.caminho === "/orders" && c.metodo === "POST").corpo;
  assert.deepEqual(pedidoSocioPg.payments[0].split.map((x) => x.amount), [1000, 100]);

  // o sócio não consegue se autoaprovar pelo navegador
  await negado(updateDoc(doc(b.db, `torcidas/${ctx.tid}/socios/${ctx.socioUid}`), { status: "ativo" }));

  // paga e, em vez de esperar o webhook, aperta "Já paguei"
  await fetch(`http://127.0.0.1:4010/__pagar/${pedido.get("pagarme").orderId}`, { method: "POST" });
  const v = await b.chamar("verificarPedido", { tid: ctx.tid, pedidoId: r.pedidoId });
  assert.equal(v.status, "pago");

  const ativo = await getDoc(doc(b.db, `torcidas/${ctx.tid}/socios/${ctx.socioUid}`));
  assert.equal(ativo.get("status"), "ativo");
  assert.equal(ativo.get("matricula"), "000001");
  assert.ok(ativo.get("validoAte").toMillis() > Date.now() + 27 * 86400_000);

  const cart = await b.chamar("minhaCarteirinha", { tid: ctx.tid });
  assert.match(cart.qr, /^SO1\.s\./);

  // mesmo CPF não vira sócio duas vezes
  const outro = navegador("socio-duplicado");
  await createUserWithEmailAndPassword(outro.auth, "dup@x.test", SENHA);
  await assert.rejects(
    outro.chamar("aderirSocio", {
      tid: ctx.tid, planoId: "mensal", sedeId: ctx.subsede, metodo: "pix",
      dados: { nome: "Clone", cpf: "52998224725", telefone: "71988887777", nascimento: "1990-05-10",
        endereco: { cep: "40000000", logradouro: "Rua B", numero: "10", bairro: "Stiep", cidade: "Salvador", uf: "BA" } },
    }),
    /CPF já está cadastrado/,
  );
});

test("8. sócio ativo compra com preço de sócio (uma vez por evento)", async () => {
  const b = ctx.socio;
  const cot = await b.chamar("cotarIngresso", { tid: ctx.tid, eventoId: ctx.evento });
  assert.equal(cot.socio.jaUsou, false);
  const r = await b.chamar("criarPedidoIngresso", {
    tid: ctx.tid, eventoId: ctx.evento, metodo: "cartao",
    comprador: { nome: "Sócio Teste", email: "socio@x.test", cpf: "52998224725", telefone: "71988887777" },
    titulares: [{ nome: "Sócio Teste", cpf: "52998224725" }, { nome: "Filho", cpf: "11144477735" }],
    cartao: { token: "tok_ok", endereco: { cep: "40000000", logradouro: "Rua B", numero: "10", bairro: "Stiep", cidade: "Salvador", uf: "BA" } },
  });
  assert.equal(r.status, "pago"); // cartão aprovado na hora
  const p = await getDoc(doc(b.db, `torcidas/${ctx.tid}/pedidos/${r.pedidoId}`));
  assert.deepEqual(p.get("itens").map((i) => i.tipo), ["socio", "publico"]);
  assert.equal(p.get("total"), 4000 + 5000 + 900);

  // capacidade 3 já atingida
  await assert.rejects(
    b.chamar("criarPedidoIngresso", {
      tid: ctx.tid, eventoId: ctx.evento, metodo: "pix",
      comprador: { nome: "Sócio Teste", email: "socio@x.test", cpf: "52998224725", telefone: "71988887777" },
      titulares: [{ nome: "Sócio Teste", cpf: "52998224725" }],
    }),
    /esgotados/,
  );
});

test("9. portaria: QR libera uma vez, segunda leitura acusa uso, QR forjado é barrado", async () => {
  const b = ctx.dir;
  const r1 = await b.chamar("validarEntrada", { tid: ctx.tid, eventoId: ctx.evento, qr: ctx.qrPublico });
  assert.equal(r1.resultado, "liberado");
  const r2 = await b.chamar("validarEntrada", { tid: ctx.tid, eventoId: ctx.evento, qr: ctx.qrPublico });
  assert.equal(r2.resultado, "ja_usado");
  const forjado = ctx.qrPublico.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  const r3 = await b.chamar("validarEntrada", { tid: ctx.tid, eventoId: ctx.evento, qr: forjado });
  assert.equal(r3.resultado, "invalido");
  // pelo código impresso no ingresso (sem traço e em minúsculas também vale)
  const outro = (await aDb.collection(`torcidas/${ctx.tid}/ingressos`).where("tipo", "==", "socio").limit(1).get()).docs[0];
  const r4 = await b.chamar("validarEntrada", { tid: ctx.tid, eventoId: ctx.evento, codigo: outro.get("codigo").replace("-", "").toLowerCase() });
  assert.equal(r4.resultado, "liberado");
  assert.equal(r4.tipo, "socio");
  const r5 = await b.chamar("validarEntrada", { tid: ctx.tid, eventoId: ctx.evento, codigo: "ZZZZ-ZZZZ" });
  assert.equal(r5.resultado, "nao_encontrado");
  // torcedor comum não acessa a portaria
  await assert.rejects(ctx.torcedor.chamar("validarEntrada", { tid: ctx.tid, eventoId: ctx.evento, qr: ctx.qrPublico }), /permissão|login/i);
});

test("10. sócio no cartão: cartão salvo, 1ª cobrança na hora e troca de cartão", async () => {
  const b = navegador("socio-cartao");
  await createUserWithEmailAndPassword(b.auth, "cartao@x.test", SENHA);
  const dados = { nome: "Sócia Cartão", cpf: "39053344705", telefone: "71977776666", nascimento: "1995-01-20",
    endereco: { cep: "40000000", logradouro: "Rua C", numero: "5", bairro: "Pituba", cidade: "Salvador", uf: "BA" } };
  // cartão recusado: não ativa
  await assert.rejects(
    b.chamar("aderirSocio", { tid: ctx.tid, planoId: "mensal", sedeId: ctx.sedePrincipal, metodo: "cartao", cartao: { token: "tok_recusado" }, dados }),
    /insuficiente/i,
  );
  // troca para um cartão bom: cobra na hora e ativa
  const t = await b.chamar("atualizarCartao", { tid: ctx.tid, cartao: { token: "tok_ok" } });
  assert.equal(t.cobrado, true);
  assert.equal(t.status, "ativo");
  const ordem = chamadas.findLast((c) => c.caminho === "/orders" && c.metodo === "POST").corpo;
  assert.ok(ordem.customer_id);
  assert.ok(ordem.payments[0].credit_card.card_id);
  assert.equal(ordem.payments[0].credit_card.recurrence_cycle, "first");
  assert.equal(ordem.payments[0].split, undefined); // sede principal: tudo na conta da torcida
  const ficha = await getDoc(doc(b.db, `torcidas/${ctx.tid}/socios/${b.auth.currentUser.uid}`));
  assert.equal(ficha.get("matricula"), "000002");
  assert.equal(ficha.get("metodo"), "cartao");
  assert.equal(ficha.get("pagarme").cartaoFinal, "1111");
});

test("11. KPIs e diagnóstico da plataforma sem vazar dados sensíveis", async () => {
  const stats = await aDb.doc(`torcidas/${ctx.tid}/stats/geral`).get();
  assert.equal(stats.get("ingressosQtd"), 3);
  assert.equal(stats.get("receitaIngressos"), 5000 + 4000 + 5000);
  assert.equal(stats.get("receitaSocios"), 2000);
  assert.equal(stats.get("taxaServico"), 500 + 900 + 100 + 100);
  assert.equal(stats.get("socios").ativo, 2);

  const resumo = await ctx.plat.chamar("resumoPlataforma", {});
  const linha = resumo.torcidas.find((t) => t.id === ctx.tid);
  assert.equal(linha.pagamentos.configurado, true);
  assert.equal(linha.geral.pedidosPagos, 4);

  const diag = await ctx.plat.chamar("diagnosticoTorcida", { tid: ctx.tid });
  assert.equal(diag.credenciais.salvas, true);
  assert.ok(!JSON.stringify(diag).includes("SEGREDO"));
  assert.ok(!JSON.stringify(diag).includes("11144477735"));
  assert.ok(diag.webhooks.some((w) => w.tipo === "order.paid" && w.processado));

  // diretoria não acessa ferramentas da plataforma
  await assert.rejects(ctx.dir.chamar("resumoPlataforma", {}), /equipe Somos Organizada/);
});

test("12. usuário de subsede tem escopo limitado", async () => {
  const b = ctx.sub;
  // vê o sócio da própria subsede
  const socio = await getDoc(doc(b.db, `torcidas/${ctx.tid}/socios/${ctx.socioUid}`));
  assert.equal(socio.get("nome"), "Sócio Teste");
  // não cria evento para a sede principal
  await negado(addDoc(collection(b.db, `torcidas/${ctx.tid}/eventos`), {
    nome: "Evento indevido", sedeId: ctx.sedePrincipal, data: Timestamp.now(), valorSocio: 0, valorPublico: 100,
    vendidos: 0, reservados: 0, status: "rascunho",
  }));
  // não mexe em credenciais nem no split
  await assert.rejects(b.chamar("salvarCredenciaisPagarme", { tid: ctx.tid, chaveSecreta: "sk_test_x123456789", chavePublica: "pk_test_x123456789" }), /permissão/);
  await assert.rejects(b.chamar("configurarSplit", { tid: ctx.tid, recebedorPrincipalId: "rp_x123" }), /permissão/);
});

test("14. mensalidade Somos Organizada: 7 dias de atraso derrubam o site; confirmação do Pix reativa", async () => {
  // diretoria avisa que pagou, mas a equipe ainda não confirmou
  await ctx.dir.chamar("informarPagamentoSaas", { tid: ctx.tid, faturaId: ctx.faturaSaas });
  await assert.rejects(ctx.dir.chamar("confirmarFaturaSaas", { tid: ctx.tid, faturaId: ctx.faturaSaas }), /equipe Somos Organizada/);
  // 8 dias depois do vencimento, a rotina bloqueia
  const r = await ctx.plat.chamar("executarRotinaSaas", { agora: ctx.vencSaas + 8 * 86400_000 });
  assert.equal(r.bloqueadas, 1);
  let t = await aDb.doc(`torcidas/${ctx.tid}`).get();
  assert.equal(t.get("status"), "suspensa");
  assert.equal(t.get("bloqueioSaas"), true);
  await assert.rejects(
    ctx.torcedor.chamar("criarPedidoIngresso", {
      tid: ctx.tid, eventoId: ctx.evento, metodo: "pix",
      comprador: { nome: "Torcedor Teste", email: "torcedor@x.test", cpf: "11144477735", telefone: "71999990000" },
      titulares: [{ nome: "Torcedor Teste", cpf: "11144477735" }],
    }),
    /indisponíveis/,
  );
  await assert.rejects(ctx.dir.chamar("publicarSite", { tid: ctx.tid }), /atraso/);
  // a equipe confirma o Pix: volta ao ar
  await ctx.plat.chamar("confirmarFaturaSaas", { tid: ctx.tid, faturaId: ctx.faturaSaas });
  t = await aDb.doc(`torcidas/${ctx.tid}`).get();
  assert.equal(t.get("status"), "ativa");
  assert.equal(t.get("bloqueioSaas"), false);
  const resumo = await ctx.plat.chamar("resumoPlataforma", {});
  assert.equal(resumo.torcidas.find((x) => x.id === ctx.tid).saas.plano, "pro");
});

test("14b. limites do plano Torcida Pro: 3 eventos à venda e 300 sócios; troca de plano confere o uso", async () => {
  const { tid, dir } = { tid: ctx.tid, dir: ctx.dir };
  // a torcida já tem 3 eventos à venda (Reunião geral, Caravana e Caravana Final), o limite do Pro
  const resumo = await ctx.plat.chamar("resumoPlataforma", {});
  assert.equal(resumo.torcidas.find((x) => x.id === tid).saas.eventosAVenda, 3);
  const quarto = await addDoc(collection(dir.db, `torcidas/${tid}/eventos`), {
    nome: "Quarto evento", sedeId: ctx.sedePrincipal, data: Timestamp.fromMillis(Date.now() + 12 * 86400_000),
    valorSocio: 1000, valorPublico: 2000, vendidos: 0, reservados: 0, status: "rascunho",
  });
  // nem pelo navegador (regras) nem pelo servidor (limite do plano)
  await negado(updateDoc(quarto, { status: "publicado" }));
  await assert.rejects(dir.chamar("publicarEvento", { tid, eventoId: quarto.id }), (e) => {
    assert.match(e.message, /Seu plano Torcida Pro permite 3 eventos à venda ao mesmo tempo\. Encerre um evento ou mude de plano\./);
    assert.equal(e.details?.limitePlano, "eventos");
    return true;
  });
  assert.equal((await aDb.doc(`torcidas/${tid}/eventos/${quarto.id}`).get()).get("status"), "rascunho");
  // evento que já passou não conta como "à venda": dá para publicar mesmo no limite
  const passado = await addDoc(collection(dir.db, `torcidas/${tid}/eventos`), {
    nome: "Evento passado", sedeId: ctx.sedePrincipal, data: Timestamp.fromMillis(Date.now() - 2 * 86400_000),
    valorSocio: 1000, valorPublico: 2000, vendidos: 0, reservados: 0, status: "rascunho",
  });
  await dir.chamar("publicarEvento", { tid, eventoId: passado.id });
  // ...mas trocar só a data dele para o futuro (e furar o limite) é barrado pelas regras
  await negado(updateDoc(passado, { data: Timestamp.fromMillis(Date.now() + 20 * 86400_000) }));
  await updateDoc(passado, { nome: "Evento passado (editado)" }); // editar o resto continua livre

  // sócios: no limite, novas adesões param (quem já é sócio não é afetado)
  const statsRef = aDb.doc(`torcidas/${tid}/stats/geral`);
  const antes = (await statsRef.get()).get("socios");
  await statsRef.set({ socios: { ...antes, ativo: 298, inadimplente: 1, em_analise: 1 } }, { merge: true });
  const novo = navegador("socio-no-limite");
  await createUserWithEmailAndPassword(novo.auth, "nolimite@x.test", SENHA);
  const dadosNovo = {
    nome: "Torcedor No Limite", cpf: "86288366757", telefone: "71988880011", nascimento: "1995-02-02",
    endereco: { cep: "40000000", logradouro: "Rua L", numero: "3", bairro: "Centro", cidade: "Salvador", uf: "BA" },
  };
  await assert.rejects(
    novo.chamar("aderirSocio", { tid, planoId: "mensal", sedeId: ctx.sedePrincipal, metodo: "pix", dados: dadosNovo }),
    /As novas associações desta torcida estão pausadas no momento\. Fale com a diretoria\./,
  );
  // troca só aceita os ids novos (pro, plus, max)
  await assert.rejects(dir.chamar("alterarPlanoSaas", { tid, plano: "pequena" }), /Escolha um plano/);
  // a diretoria muda para o Plus: os limites maiores valem na hora
  await dir.chamar("alterarPlanoSaas", { tid, plano: "plus" });
  await dir.chamar("publicarEvento", { tid, eventoId: quarto.id });
  assert.equal((await aDb.doc(`torcidas/${tid}/eventos/${quarto.id}`).get()).get("status"), "publicado");
  // voltar para o Pro agora não cabe (301+ sócios ou 4 eventos à venda)
  await statsRef.set({ socios: { ativo: 412 } }, { merge: true });
  await assert.rejects(
    dir.chamar("alterarPlanoSaas", { tid, plano: "pro" }),
    /O plano Torcida Pro vai até 300 sócios e 3 eventos à venda\. Hoje vocês têm 414 sócios e 4 eventos à venda\. Escolha um plano maior\./,
  );
  await statsRef.update({ socios: antes });
  const assRef = aDb.doc(`torcidas/${tid}/saas/assinatura`);
  assert.equal((await assRef.get()).get("plano"), "plus");
  // torcida antiga (id "grande" gravado antes dos planos Pro/Plus/Max) aparece como Torcida Plus
  await assRef.update({ plano: "grande" });
  const legado = await ctx.plat.chamar("resumoPlataforma", {});
  assert.equal(legado.torcidas.find((x) => x.id === tid).saas.plano, "plus");
  await assRef.update({ plano: "plus" });
});

test("15. cadastro pela página principal: diretor solicita, equipe aprova, torcida nasce em implantação", async () => {
  const u = await aAuth.createUser({ email: "novo.diretor@x.test", password: SENHA, emailVerified: true });
  const b = navegador("novo-diretor");
  await signInWithEmailAndPassword(b.auth, "novo.diretor@x.test", SENHA);
  const disp = await b.chamar("slugDisponivel", { slug: "furia-azul" });
  assert.equal(disp.disponivel, true);
  const dados = {
    nomeTorcida: "Fúria Azul", slug: "furia-azul", clube: "Esporte Clube Exemplo", estimativaSocios: 800, quantidadeSubsedes: 3,
    responsavel: { nome: "Diretor Novo da Silva", cpf: "52998224725", telefone: "71988887777", cargo: "Presidente" },
    entidade: { tipo: "cnpj", cnpj: "11.222.333/0001-81", razaoSocial: "Associação Fúria Azul", emailFinanceiro: "fin@furia.test" },
    endereco: { cep: "40000000", logradouro: "Rua A", numero: "1", bairro: "Centro", cidade: "Salvador", uf: "BA" },
    // cores escolhidas no cadastro (a de fundo inválida volta para o padrão azul e amarelo)
    tema: { corPrimaria: "#ffffff", corSecundaria: "#9CA3AF", corFundo: "preto", corTexto: "#F5F5F5", logoUrl: "https://x.test/a.png" },
  };
  await assert.rejects(b.chamar("solicitarTorcida", { ...dados, entidade: { ...dados.entidade, cnpj: "11222333000100" } }), /CNPJ/);
  const sol = await b.chamar("solicitarTorcida", dados);
  assert.equal(sol.status, "pendente");
  // endereço fica reservado
  assert.equal((await b.chamar("slugDisponivel", { slug: "furia-azul" })).disponivel, false);
  await assert.rejects(b.chamar("solicitarTorcida", { ...dados, slug: "furia-azul-2" }), /em análise/);
  // diretor vê o próprio pedido; diretor não aprova a si mesmo
  assert.equal((await getDoc(doc(b.db, `solicitacoes/${sol.solicitacaoId}`))).get("status"), "pendente");
  await assert.rejects(b.chamar("avaliarSolicitacao", { id: sol.solicitacaoId, aprovar: true }), /equipe Somos Organizada/);
  const ap = await ctx.plat.chamar("avaliarSolicitacao", { id: sol.solicitacaoId, aprovar: true });
  assert.equal(ap.slug, "furia-azul");
  const t = await aDb.doc(`torcidas/${ap.torcidaId}`).get();
  assert.equal(t.get("status"), "implantacao");
  assert.equal(t.get("publicada"), false);
  assert.deepEqual(t.get("tema"), { corPrimaria: "#FFFFFF", corSecundaria: "#9CA3AF", corFundo: "#070A12", corTexto: "#F5F5F5" });
  const membro = await aDb.doc(`torcidas/${ap.torcidaId}/membros/${u.uid}`).get();
  assert.equal(membro.get("papel"), "diretoria");
  ctx.demo = { tid: ap.torcidaId, dir: b };
});

test("16. modo demonstração: torcida sem Pagar.me vende ingresso (Pix simulado) e sócio no cartão de teste, com split", async () => {
  const { tid, dir } = ctx.demo;
  await assert.rejects(dir.chamar("salvarCredenciaisPagarme", { tid, chaveSecreta: "sk_demo_abc123456", chavePublica: "pk_test_abc123456" }), /mesmo ambiente/);
  const cred = await dir.chamar("salvarCredenciaisPagarme", { tid, chaveSecreta: "sk_demo_abc123456", chavePublica: "pk_demo_abc123456" });
  assert.equal(cred.ambiente, "demo");
  const sp = await dir.chamar("configurarSplit", { tid }); // demonstração: recebedor principal automático
  assert.equal(sp.splitAtivo, true);
  const t0 = (await aDb.doc(`torcidas/${tid}`).get()).data();
  // subsede da demonstração com conta de recebimento simulada
  const sede = await addDoc(collection(dir.db, `torcidas/${tid}/sedes`), { nome: "Zona Norte", tipo: "subsede", ativa: true, ordem: 1 });
  const conv = await dir.chamar("convidarMembro", { tid, email: "zn@furia.test", nome: "Coord ZN", papel: "subsede", sedeId: sede.id });
  await aAuth.updateUser(conv.uid, { password: SENHA });
  const zn = navegador("demo-zn");
  await signInWithEmailAndPassword(zn.auth, "zn@furia.test", SENHA);
  const cad = await zn.chamar("cadastrarRecebedor", { tid, dados: {
    nome: "Coordenador Zona Norte", email: "zn@furia.test", cpf: "39053344705", nascimento: "1990-01-01", nomeMae: "Mae da Zona",
    rendaMensal: 300000, profissao: "Autônomo", telefone: "71988880000",
    endereco: { cep: "40000000", logradouro: "Rua Z", numero: "9", bairro: "Norte", cidade: "Salvador", uf: "BA" },
    banco: { codigo: "260", agencia: "0001", conta: "1234567", contaDv: "8", tipo: "checking" },
  } });
  assert.equal(cad.recebedor.status, "registration");
  const kyc = await zn.chamar("simularDemo", { tid, acao: "aprovar_recebedor" });
  assert.equal(kyc.recebedor.status, "active");
  const ev = await addDoc(collection(zn.db, `torcidas/${tid}/eventos`), {
    nome: "Caravana demo", sedeId: sede.id, data: Timestamp.fromMillis(Date.now() + 5 * 86400_000),
    valorSocio: 2000, valorPublico: 3000, vendidos: 0, reservados: 0, status: "em_aprovacao",
  });
  await updateDoc(ev, { status: "publicado" }).catch(() => undefined); // subsede não publica
  await dir.chamar("publicarEvento", { tid, eventoId: ev.id });
  await setDoc(doc(dir.db, `torcidas/${tid}/planos/mensal`), { nome: "Mensal", valor: 1500, intervalo: "mes", intervaloQtd: 1, pix: true, cartao: true, ativo: true });
  await dir.chamar("publicarSite", { tid, plano: "plus" });
  assert.equal(t0.pagamentos.ambiente, "demo");

  // torcedor compra no Pix e "paga" pelo simulador
  const tor = navegador("demo-torcedor");
  await signInAnonymously(tor.auth);
  const p = await tor.chamar("criarPedidoIngresso", {
    tid, eventoId: ev.id, metodo: "pix",
    comprador: { nome: "Torcedor Demo", email: "td@x.test", cpf: "11144477735", telefone: "71999990000" },
    titulares: [{ nome: "Torcedor Demo", cpf: "11144477735" }],
  });
  assert.equal(p.status, "aguardando");
  const sim = await tor.chamar("simularDemo", { tid, acao: "pagar_pedido", pedidoId: p.pedidoId });
  assert.equal(sim.status, "pago");
  const pedido = await aDb.doc(`torcidas/${tid}/pedidos/${p.pedidoId}`).get();
  assert.equal(pedido.get("status"), "pago");
  assert.equal(pedido.get("liquidacao"), "split");

  // sócio no cartão de teste: 4000000000000028 recusa, 4000000000000010 aprova (tokens gerados pelo navegador)
  const s = navegador("demo-socio");
  await createUserWithEmailAndPassword(s.auth, "socio@furia.test", SENHA);
  const dadosSocio = { nome: "Sócio Demo", cpf: "86288366757", telefone: "71977770000", nascimento: "1999-09-09",
    endereco: { cep: "40000000", logradouro: "Rua S", numero: "1", bairro: "Norte", cidade: "Salvador", uf: "BA" } };
  await assert.rejects(s.chamar("aderirSocio", { tid, planoId: "mensal", sedeId: sede.id, metodo: "cartao", cartao: { token: "tok_demo_recusado_0028" }, dados: dadosSocio }), /banco não autorizou/i);
  const ok = await s.chamar("atualizarCartao", { tid, cartao: { token: "tok_demo_aprovado_0010" } });
  assert.equal(ok.status, "ativo");

  ctx.demo.evento = ev.id;
  ctx.demo.socio = s;

  // simulador nunca funciona em torcida com Pagar.me de verdade
  await assert.rejects(ctx.torcedor.chamar("simularDemo", { tid: ctx.tid, acao: "pagar_pedido", pedidoId: "x" }), /demonstração/);
});

test("17. conta do torcedor: ingresso no CPF do sócio aparece no painel dele (sem QR); login com CPF e senha", async () => {
  const { tid, evento, socio } = ctx.demo;
  const amigo = navegador("demo-amigo");
  await createUserWithEmailAndPassword(amigo.auth, "amigo@x.test", SENHA);
  const p = await amigo.chamar("criarPedidoIngresso", {
    tid, eventoId: evento, metodo: "pix",
    comprador: { nome: "Amigo Comprador", email: "amigo@x.test", cpf: "11144477735", telefone: "71999991111" },
    titulares: [{ nome: "Sócio Demo", cpf: "86288366757" }, { nome: "Amigo Comprador", cpf: "11144477735" }],
  });
  await amigo.chamar("simularDemo", { tid, acao: "pagar_pedido", pedidoId: p.pedidoId });

  // quem comprou vê os 2; o sócio vê só o que está no CPF dele
  const doAmigo = await getDocs(query(collection(amigo.db, `torcidas/${tid}/ingressos`), where("uid", "==", amigo.auth.currentUser.uid)));
  assert.equal(doAmigo.size, 2);
  // o titular não lê o documento (QR e código ficam com quem comprou): vê pela ação, sem QR e com CPF mascarado
  await negado(getDocs(query(collection(socio.db, `torcidas/${tid}/ingressos`), where("titularUid", "==", socio.auth.currentUser.uid))));
  const noNome = await socio.chamar("ingressosNoMeuNome", { tid });
  assert.equal(noNome.ingressos.length, 1);
  assert.equal(noNome.ingressos[0].titularCpf, "***.883.667-**");
  assert.equal(noNome.ingressos[0].qr, undefined);
  assert.equal(noNome.ingressos[0].codigo, undefined);
  const doSocio = { docs: [{ id: noNome.ingressos[0].id }] };
  // e-mails: comprador recebe a confirmação; o sócio titular recebe o aviso. Sem chave de e-mail no teste = "sem_provedor"
  const emailCompra = await aDb.doc(`torcidas/${tid}/emails/ingresso-${p.pedidoId}`).get();
  assert.equal(emailCompra.get("para"), "amigo@x.test");
  assert.equal(emailCompra.get("status"), "sem_provedor");
  assert.match(emailCompra.get("assunto"), /Ingresso confirmado: Caravana demo/);
  const ingSocio = doSocio.docs[0].id;
  assert.equal((await aDb.doc(`torcidas/${tid}/emails/ingresso-titular-${ingSocio}`).get()).get("para"), "socio@furia.test");
  // pagar de novo (webhook repetido) não duplica
  await amigo.chamar("simularDemo", { tid, acao: "pagar_pedido", pedidoId: p.pedidoId });
  assert.equal((await aDb.doc(`torcidas/${tid}/emails/ingresso-${p.pedidoId}`).get()).get("tentativas"), 1);
  const outro = doAmigo.docs.find((d) => d.get("titularCpf") === "11144477735");
  await negado(getDoc(doc(socio.db, `torcidas/${tid}/ingressos/${outro.id}`)));

  // login com CPF: devolve o e-mail só com a senha certa
  const visitante = navegador("login-cpf");
  assert.deepEqual(await visitante.chamar("entrarComCpf", { cpf: "111.444.777-35", senha: SENHA }), { email: "amigo@x.test" });
  assert.deepEqual(await visitante.chamar("entrarComCpf", { cpf: "86288366757", senha: SENHA }), { email: "socio@furia.test" });
  await assert.rejects(visitante.chamar("entrarComCpf", { cpf: "12345678909", senha: SENHA }), /incorretos/); // CPF sem conta: mesma resposta
  // 5 tentativas erradas por CPF a cada 15 min. O acerto não gasta tentativa (quem entra em dois celulares não
  // fica bloqueado), mas também não zera o contador (ele é do CPF, não de uma conta)
  for (let i = 0; i < 3; i++) assert.deepEqual(await visitante.chamar("entrarComCpf", { cpf: "11144477735", senha: SENHA }), { email: "amigo@x.test" });
  for (let i = 0; i < 5; i++) await assert.rejects(visitante.chamar("entrarComCpf", { cpf: "11144477735", senha: "errada-123" }), /incorretos/);
  await assert.rejects(visitante.chamar("entrarComCpf", { cpf: "11144477735", senha: SENHA }), /Muitas tentativas/);

  // "Esqueci minha senha" com CPF: manda o link ao e-mail da conta e mostra só o e-mail mascarado
  // mesma resposta com ou sem conta (não revela quem é sócio); o link vai para o e-mail cadastrado
  assert.deepEqual(await visitante.chamar("redefinirSenhaPorCpf", { tid, cpf: "862.883.667-57" }), { enviado: true });
  // CPF sem conta: mesma resposta, sem e-mail (não revela quem tem cadastro)
  assert.deepEqual(await visitante.chamar("redefinirSenhaPorCpf", { tid, cpf: "12345678909" }), { enviado: true });
  await assert.rejects(visitante.chamar("redefinirSenhaPorCpf", { tid, cpf: "123" }), /CPF inválido/);
  // mesmo limite do login por CPF
  await assert.rejects(visitante.chamar("redefinirSenhaPorCpf", { tid, cpf: "11144477735" }), /Muitas tentativas/);
});

test("18. segurança: convite não toma conta existente; estorno só com confirmação da Pagar.me; sócio cancelado não volta sozinho", async () => {
  const { tid, dir } = { tid: ctx.tid, dir: ctx.dir };
  // convidar o e-mail de uma conta que já existe não gera link de senha (ninguém troca a senha de outra pessoa)
  const conv = await dir.chamar("convidarMembro", { tid, email: "equipe@somos.test", nome: "Equipe", papel: "portaria" });
  assert.equal(conv.contaNova, false);
  assert.equal(conv.linkDefinirSenha ?? null, null);
  assert.equal(conv.nuncaEntrou, false);
  assert.equal((await aDb.doc(`_emulador/convite-${conv.uid}`).get()).exists, false); // conta em uso: nenhum convite de criar senha
  const novo = await dir.chamar("convidarMembro", { tid, email: "porteiro2@brasil.test", nome: "Porteiro Dois", papel: "portaria" });
  assert.equal(novo.contaNova, true);
  assert.equal(novo.linkDefinirSenha ?? null, null); // nem para conta nova: o link vai só por e-mail ao convidado

  // compra de 2 ingressos no cartão
  const ev = await addDoc(collection(dir.db, `torcidas/${tid}/eventos`), {
    nome: "Jogo do estorno", sedeId: ctx.sedePrincipal, data: Timestamp.fromMillis(Date.now() + 9 * 86400_000),
    valorSocio: 5000, valorPublico: 5000, capacidade: 10, vendidos: 0, reservados: 0, status: "rascunho",
  });
  await dir.chamar("publicarEvento", { tid, eventoId: ev.id });
  const b = navegador("estorno");
  await createUserWithEmailAndPassword(b.auth, "estorno@x.test", SENHA);
  const r = await b.chamar("criarPedidoIngresso", {
    tid, eventoId: ev.id, metodo: "cartao",
    comprador: { nome: "Compra Estorno", email: "estorno@x.test", cpf: "86288366757", telefone: "71988880001" },
    titulares: [{ nome: "Compra Estorno", cpf: "86288366757" }, { nome: "Amigo Estorno", cpf: "11144477735" }],
    cartao: { token: "tok_ok", endereco: { cep: "40000000", logradouro: "Rua E", numero: "1", bairro: "Centro", cidade: "Salvador", uf: "BA" } },
  });
  assert.equal(r.status, "pago");
  const ped = (await aDb.doc(`torcidas/${tid}/pedidos/${r.pedidoId}`).get()).data();
  const evento = (id) => ({ id, type: "charge.refunded", data: { id: ped.pagarme.chargeId, order: { id: ped.pagarme.orderId } } });
  const situacao = async () => (await aDb.collection(`torcidas/${tid}/ingressos`).where("pedidoId", "==", r.pedidoId).get()).docs.map((d) => d.get("status"));

  // webhook forjado (sem estorno de verdade na Pagar.me) não cancela nada
  assert.equal(await webhook(tid, ctx.webhookToken, evento("hook_forjado")), 200);
  assert.deepEqual(await situacao(), ["valido", "valido"]);
  // estorno parcial: não cancela tudo, fica marcado para a diretoria
  await fetch(`http://127.0.0.1:4010/__estornar/${ped.pagarme.orderId}?valor=5500`, { method: "POST" });
  assert.equal(await webhook(tid, ctx.webhookToken, evento("hook_parcial")), 200);
  assert.deepEqual(await situacao(), ["valido", "valido"]);
  assert.equal((await aDb.doc(`torcidas/${tid}/pedidos/${r.pedidoId}`).get()).get("estornoParcial").valor, 5500);
  // estorno do restante: agora sim cancela
  await fetch(`http://127.0.0.1:4010/__estornar/${ped.pagarme.orderId}?valor=5500`, { method: "POST" });
  assert.equal(await webhook(tid, ctx.webhookToken, evento("hook_total")), 200);
  assert.deepEqual(await situacao(), ["cancelado", "cancelado"]);
  assert.equal((await aDb.doc(`torcidas/${tid}/pedidos/${r.pedidoId}`).get()).get("status"), "estornado");

  // sócio: adesão no Pix estornada → validade volta e a associação é cancelada
  const s = navegador("socio-estorno");
  await createUserWithEmailAndPassword(s.auth, "socioestorno@x.test", SENHA);
  const ad = await s.chamar("aderirSocio", {
    tid, planoId: "mensal", sedeId: ctx.sedePrincipal, metodo: "pix",
    dados: { nome: "Sócio Estorno", cpf: "12345678909", telefone: "71977770002", nascimento: "1992-02-02",
      endereco: { cep: "40000000", logradouro: "Rua S", numero: "2", bairro: "Centro", cidade: "Salvador", uf: "BA" } },
  });
  const pedSocio = (await aDb.doc(`torcidas/${tid}/pedidos/${ad.pedidoId}`).get()).data();
  await fetch(`http://127.0.0.1:4010/__pagar/${pedSocio.pagarme.orderId}`, { method: "POST" });
  assert.equal((await s.chamar("verificarPedido", { tid, pedidoId: ad.pedidoId })).status, "pago");
  const uidS = s.auth.currentUser.uid;
  assert.equal((await aDb.doc(`torcidas/${tid}/socios/${uidS}`).get()).get("status"), "ativo");
  await fetch(`http://127.0.0.1:4010/__estornar/${pedSocio.pagarme.orderId}`, { method: "POST" });
  const pedSocioPago = (await aDb.doc(`torcidas/${tid}/pedidos/${ad.pedidoId}`).get()).data();
  assert.equal(await webhook(tid, ctx.webhookToken, { id: "hook_socio", type: "charge.chargedback", data: { id: pedSocioPago.pagarme.chargeId, order: { id: pedSocioPago.pagarme.orderId } } }), 200);
  assert.equal((await aDb.doc(`torcidas/${tid}/socios/${uidS}`).get()).get("status"), "cancelado");

  // trocar de plano com um Pix barato em aberto: o Pix antigo é cancelado e, se pago, nunca libera o plano mais longo
  await setDoc(doc(dir.db, `torcidas/${tid}/planos/anual`), { nome: "Anual", valor: 12000, intervalo: "ano", intervaloQtd: 1, pix: true, cartao: true, ativo: true });
  const t = navegador("troca-plano");
  await createUserWithEmailAndPassword(t.auth, "trocaplano@x.test", SENHA);
  const dadosT = { nome: "Troca Plano", cpf: "71460238001", telefone: "71977770003", nascimento: "1993-03-03",
    endereco: { cep: "40000000", logradouro: "Rua T", numero: "3", bairro: "Centro", cidade: "Salvador", uf: "BA" } };
  const barato = await t.chamar("aderirSocio", { tid, planoId: "mensal", sedeId: ctx.sedePrincipal, metodo: "pix", dados: dadosT });
  const caro = await t.chamar("aderirSocio", { tid, planoId: "anual", sedeId: ctx.sedePrincipal, metodo: "pix", dados: dadosT });
  assert.equal((await aDb.doc(`torcidas/${tid}/pedidos/${barato.pedidoId}`).get()).get("status"), "cancelado");
  const pCaro = (await aDb.doc(`torcidas/${tid}/pedidos/${caro.pedidoId}`).get()).data();
  assert.equal(pCaro.plano.intervalo, "ano");
  assert.equal(pCaro.total, 13200);

  // cancelado pela diretoria não se reativa pagando nem se associando de novo
  const s2 = navegador("socio-cancelado");
  await signInWithEmailAndPassword(s2.auth, "socio@x.test", SENHA);
  await dir.chamar("alterarStatusSocio", { tid, socioUid: s2.auth.currentUser.uid, acao: "cancelar" });
  await assert.rejects(s2.chamar("pagarMensalidade", { tid }), /cancelada/);
});

test("13. Storage: sócio envia a própria foto; estranhos são barrados", async () => {
  await ctx.socio.enviar(`suporte/${ctx.socioUid}/print.png`);
  await ctx.socio.enviar(`torcidas/${ctx.tid}/socios/${ctx.socioUid}/foto.png`);
  await assert.rejects(ctx.torcedor.enviar(`torcidas/${ctx.tid}/socios/${ctx.socioUid}/foto.png`));
  await assert.rejects(ctx.torcedor.enviar(`torcidas/${ctx.tid}/publico/marca/hack.png`));
  // Regras que consultam o Firestore (diretoria enviando banner/logo) dependem do acesso
  // cruzado Storage→Firestore do emulador, que não funciona em todo ambiente (ex.: sem IPv6).
  // Rode com STORAGE_CRUZADO=1 onde funcionar; em produção é validado no primeiro upload.
  if (process.env.STORAGE_CRUZADO === "1") await ctx.dir.enviar(`torcidas/${ctx.tid}/publico/marca/banner.png`);
});

test("19. compra repetida não cobra duas vezes; sócio grátis sai sem cobrança; a mesma leitura da portaria não vira 'já utilizado'", async () => {
  const { tid, dir } = ctx.demo;
  const t = (await aDb.doc(`torcidas/${tid}`).get()).data();
  const ev = await addDoc(collection(dir.db, `torcidas/${tid}/eventos`), {
    nome: "Festa sócio grátis", sedeId: t.sedePrincipalId, data: Timestamp.fromMillis(Date.now() + 9 * 86400_000),
    valorSocio: 0, valorPublico: 2500, vendidos: 0, reservados: 0, status: "rascunho",
  });
  await dir.chamar("publicarEvento", { tid, eventoId: ev.id });
  const reservados = async () => (await aDb.doc(`torcidas/${tid}/eventos/${ev.id}`).get()).get("reservados") ?? 0;

  // 1) a mesma compra enviada duas vezes (resposta perdida e "pagar" de novo): um pedido só, uma reserva só
  const tor = navegador("repete-compra");
  await signInAnonymously(tor.auth);
  const idCompra = "AbCdEfGhIjKlMnOpQr12";
  const compra = {
    tid, eventoId: ev.id, metodo: "pix", idCompra,
    comprador: { nome: "Torcedor Repetido", email: "rep@x.test", cpf: "11144477735", telefone: "71999990011" },
    titulares: [{ nome: "Torcedor Repetido", cpf: "11144477735" }],
  };
  const a = await tor.chamar("criarPedidoIngresso", compra);
  const b = await tor.chamar("criarPedidoIngresso", compra);
  assert.equal(a.pedidoId, idCompra);
  assert.equal(b.pedidoId, a.pedidoId);
  assert.equal(b.status, "aguardando");
  assert.equal(await reservados(), 1);
  // outra pessoa não "pega" o pedido de alguém pelo id
  const intruso = navegador("intruso-compra");
  await signInAnonymously(intruso.auth);
  await assert.rejects(intruso.chamar("criarPedidoIngresso", compra), /já foi registrada/);
  // tentativa encerrada (recusada/expirada): o aparelho precisa gerar outro id
  await aDb.doc(`torcidas/${tid}/pedidos/${idCompra}`).update({ status: "falhou" });
  await assert.rejects(tor.chamar("criarPedidoIngresso", compra), /tentativa anterior/);

  // 2) sócio em dia num evento em que sócio não paga: o ingresso dele sai na hora, sem Pagar.me
  const s = navegador("socio-gratis");
  await createUserWithEmailAndPassword(s.auth, "gratis@furia.test", SENHA);
  await s.chamar("aderirSocio", { tid, planoId: "mensal", sedeId: t.sedePrincipalId, metodo: "cartao", cartao: { token: "tok_demo_aprovado_0010" },
    dados: { nome: "Sócio Grátis", cpf: "39053344705", telefone: "71977770011", nascimento: "1995-05-05",
      endereco: { cep: "40000000", logradouro: "Rua G", numero: "2", bairro: "Centro", cidade: "Salvador", uf: "BA" } } });
  assert.equal((await aDb.doc(`torcidas/${tid}/socios/${s.auth.currentUser.uid}`).get()).get("status"), "ativo");
  const gratis = await s.chamar("criarPedidoIngresso", {
    tid, eventoId: ev.id, metodo: "pix",
    comprador: { nome: "Sócio Grátis", email: "gratis@furia.test", cpf: "39053344705", telefone: "71977770011" },
    titulares: [{ nome: "Sócio Grátis", cpf: "39053344705" }],
  });
  assert.equal(gratis.status, "pago");
  const pg = (await aDb.doc(`torcidas/${tid}/pedidos/${gratis.pedidoId}`).get()).data();
  assert.equal(pg.total, 0);
  assert.equal(pg.pagarme ?? null, null); // nada foi à Pagar.me
  const [ingresso] = (await aDb.collection(`torcidas/${tid}/ingressos`).where("pedidoId", "==", gratis.pedidoId).get()).docs;
  assert.equal(ingresso.get("tipo"), "socio");
  assert.equal(ingresso.get("status"), "valido");

  // 3) portaria: a resposta da baixa se perdeu e o porteiro tocou em "Tentar de novo" (mesma leitura) → "liberado"
  const leituraId = "leitura-teste-123";
  const r1 = await dir.chamar("validarEntrada", { tid, eventoId: ev.id, codigo: ingresso.get("codigo"), leituraId });
  assert.equal(r1.resultado, "liberado");
  const r2 = await dir.chamar("validarEntrada", { tid, eventoId: ev.id, codigo: ingresso.get("codigo"), leituraId });
  assert.equal(r2.resultado, "liberado");
  // outra leitura (outra pessoa tentando entrar com o mesmo ingresso) continua barrada
  const r3 = await dir.chamar("validarEntrada", { tid, eventoId: ev.id, codigo: ingresso.get("codigo"), leituraId: "outra-leitura-456" });
  assert.equal(r3.resultado, "ja_usado");
  assert.equal((await aDb.doc(`torcidas/${tid}/eventos/${ev.id}`).get()).get("entradas"), 1);

  // 4) troca de ambiente da Pagar.me (aqui: demonstração → teste): o que era da conta anterior é desfeito
  const pendente = await tor.chamar("criarPedidoIngresso", { ...compra, idCompra: "ZyXwVuTsRqPoNmLkJi98" });
  assert.equal(pendente.status, "aguardando");
  assert.ok((await aDb.collection(`torcidas/${tid}/socios`).where("pagarme.customerId", ">", "").get()).size > 0);
  await dir.chamar("salvarCredenciaisPagarme", { tid, chaveSecreta: "sk_test_troca123456", chavePublica: "pk_test_troca123456" });
  const tDepois = (await aDb.doc(`torcidas/${tid}`).get()).data();
  assert.equal(tDepois.pagamentos.ambiente, "teste");
  assert.equal(tDepois.pagamentos.splitAtivo, false);
  assert.equal(tDepois.pagamentos.recebedorPrincipalId ?? null, null);
  assert.equal((await aDb.doc(`torcidas/${tid}/pedidos/${pendente.pedidoId}`).get()).get("status"), "expirado");
  assert.equal((await aDb.collection(`torcidas/${tid}/socios`).where("pagarme.customerId", ">", "").get()).size, 0);
  const sedesComRecebedor = (await aDb.collection(`torcidas/${tid}/sedes`).get()).docs.filter((x) => x.get("recebedor"));
  assert.equal(sedesComRecebedor.length, 0);
});
