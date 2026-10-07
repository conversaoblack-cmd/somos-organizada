// Fluxo completo contra os emuladores do Firebase + Pagar.me simulada.
// Executado por rodar.sh (firebase emulators:exec).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp as adminApp } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminDb } from "firebase-admin/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, addDoc, collection, Timestamp } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
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
  const chamar = async (nomeFn, dados) => (await httpsCallable(fns, nomeFn)(dados)).data;
  return { auth, db, chamar };
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

  const ev = await addDoc(collection(b.db, `torcidas/${ctx.tid}/eventos`), {
    nome: "Caravana Final", descricao: "Ônibus + ingresso", sedeId: ctx.subsede, local: "Arena",
    data: Timestamp.fromMillis(Date.now() + 7 * 86400_000), valorSocio: 4000, valorPublico: 5000,
    capacidade: 3, vendidos: 0, reservados: 0, status: "publicado",
  });
  ctx.evento = ev.id;
  // contadores de venda são do servidor
  await negado(updateDoc(doc(b.db, `torcidas/${ctx.tid}/eventos/${ctx.evento}`), { vendidos: 99 }));
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
  await assert.rejects(r, /não autorizada/);
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

test("10. sócio no cartão: assinatura recorrente e fatura paga ativam o sócio", async () => {
  const b = navegador("socio-cartao");
  await createUserWithEmailAndPassword(b.auth, "cartao@x.test", SENHA);
  const r = await b.chamar("aderirSocio", {
    tid: ctx.tid, planoId: "mensal", sedeId: ctx.sedePrincipal, metodo: "cartao",
    cartao: { token: "tok_ok" },
    dados: { nome: "Sócia Cartão", cpf: "39053344705", telefone: "71977776666", nascimento: "1995-01-20",
      endereco: { cep: "40000000", logradouro: "Rua C", numero: "5", bairro: "Pituba", cidade: "Salvador", uf: "BA" } },
  });
  assert.equal(r.modo, "assinatura");
  assert.equal(r.status, "ativo");
  const sub = chamadas.findLast((c) => c.caminho === "/subscriptions").corpo;
  assert.deepEqual(sub.items.map((i) => i.pricing_scheme.price), [1000, 100]);
  assert.equal(sub.interval, "month");
  const ficha = await getDoc(doc(b.db, `torcidas/${ctx.tid}/socios/${b.auth.currentUser.uid}`));
  assert.equal(ficha.get("matricula"), "000002");
  assert.equal(ficha.get("pagarme").cartaoFinal, "4242");
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

test("12. diretoria convida usuário de subsede com escopo limitado", async () => {
  const r = await ctx.dir.chamar("convidarMembro", {
    tid: ctx.tid, email: "subsede4@brasil.test", nome: "Coordenador 4º", papel: "subsede", sedeId: ctx.subsede,
  });
  assert.ok(r.linkDefinirSenha);
  await aAuth.updateUser(r.uid, { password: SENHA });
  const b = navegador("subsede");
  await signInWithEmailAndPassword(b.auth, "subsede4@brasil.test", SENHA);
  // vê o sócio da própria subsede
  const socio = await getDoc(doc(b.db, `torcidas/${ctx.tid}/socios/${ctx.socioUid}`));
  assert.equal(socio.get("nome"), "Sócio Teste");
  // não cria evento para a sede principal
  await negado(addDoc(collection(b.db, `torcidas/${ctx.tid}/eventos`), {
    nome: "Evento indevido", sedeId: ctx.sedePrincipal, data: Timestamp.now(), valorSocio: 0, valorPublico: 100,
    vendidos: 0, reservados: 0, status: "rascunho",
  }));
  // não mexe em credenciais
  await assert.rejects(b.chamar("salvarCredenciaisPagarme", { tid: ctx.tid, chaveSecreta: "sk_test_x123456789", chavePublica: "pk_test_x123456789" }), /permissão/);
});
