// Popula os emuladores com a torcida de demonstração "Brasil" (cores do Brasil).
// Contas (senha de todas: senha123456):
//   equipe@somos.test      → plataforma Somos Organizada
//   diretoria@brasil.test  → diretoria da torcida
//   subsede4@brasil.test   → subsede 4º Distrito (conta de recebimento ativa)
//   subsede7@brasil.test   → subsede 7º Distrito (sem conta de recebimento; evento aguardando aprovação)
//   portaria@brasil.test   → portaria
//   socio@brasil.test      → sócio ativo (Pix) · anual@brasil.test → sócio no cartão salvo
//   diretor@furiajovem.test → pedido de cadastro da torcida "Fúria Jovem" aguardando aprovação
import { initializeApp as adminApp } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminDb, Timestamp as AdminTs, FieldValue } from "firebase-admin/firestore";
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signInAnonymously, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, addDoc, updateDoc, collection, getDoc, Timestamp } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const PROJETO = "demo-somos";
const SENHA = "senha123456";
const PAGARME = "http://127.0.0.1:4010";
adminApp({ projectId: PROJETO });
const aAuth = adminAuth();
const aDb = adminDb();

let n = 0;
function navegador() {
  const app = initializeApp({ projectId: PROJETO, apiKey: "demo", authDomain: "demo" }, `seed${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const fns = getFunctions(app, "southamerica-east1");
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  return { auth, db, chamar: async (nome, dados) => (await httpsCallable(fns, nome)(dados)).data };
}

const existente = await aDb.doc("slugs/brasil").get();
if (existente.exists) {
  console.log("Dados de demonstração já existem (torcida 'brasil').");
  process.exit(0);
}

const dia = 86400_000;
const em = (dias, h = 19, m = 0) => {
  // horário de Brasília (UTC-3), independente do fuso da máquina
  const d = new Date(Date.now() + dias * dia);
  d.setUTCHours(h + 3, m, 0, 0);
  return Timestamp.fromDate(d);
};

// ── Plataforma cria a torcida ─────────────────────────────
const plat = await aAuth.createUser({ email: "equipe@somos.test", password: SENHA, emailVerified: true, displayName: "Equipe Somos" });
await aAuth.setCustomUserClaims(plat.uid, { plataforma: true });
const p = navegador();
await signInWithEmailAndPassword(p.auth, "equipe@somos.test", SENHA);
const { torcidaId: tid } = await p.chamar("criarTorcida", {
  nome: "Torcida Brasil",
  slug: "brasil",
  nomeSedePrincipal: "Sede Central",
  mensalidadeSaas: 49700,
  diretor: { nome: "Matheus Presidente", email: "diretoria@brasil.test" },
});
await p.chamar("atualizarTorcidaPlataforma", { tid, status: "ativa" });

// FAQ da plataforma
const faqs = [
  ["Como recebo meu ingresso?", "Assim que o pagamento é confirmado, seus ingressos aparecem na tela com QR Code e você recebe um link para acessá-los de qualquer aparelho. Guarde o link ou tire um print do QR.", ["ingresso", "receber", "qr", "link"], "torcedor"],
  ["O ingresso pode ser transferido?", "Não. Cada ingresso é nominal e intransferível: o nome e o CPF do titular são conferidos na entrada.", ["transferir", "nome", "cpf", "outra pessoa"], "torcedor"],
  ["Quanto tempo o Pix leva para confirmar?", "Normalmente segundos. Se demorar, toque em \"Já paguei\" na tela do pedido para conferirmos na hora.", ["pix", "demora", "confirmar", "pagamento"], "torcedor"],
  ["Por que existe uma taxa de serviço?", "A taxa de 10% vai para o caixa da torcida e mantém a estrutura: sedes, eventos e ações. O valor do ingresso cobre só o custo do evento.", ["taxa", "10%", "serviço"], "torcedor"],
  ["Sou sócio, como pago menos no ingresso?", "Entre na sua conta de sócio antes de comprar. Com a mensalidade em dia, o ingresso no seu nome sai com o preço de sócio.", ["sócio", "desconto", "preço"], "torcedor"],
  ["Como cancelo minha associação?", "Na sua conta de sócio, em Assinatura, toque em Cancelar renovação. Você continua sócio até o fim do período já pago.", ["cancelar", "associação", "assinatura"], "torcedor"],
  ["Onde encontro as chaves da Pagar.me?", "No painel da Pagar.me: Configurações → Chaves. Copie a chave secreta (sk_) e a pública (pk_). Use as de teste para experimentar e as de produção para vender de verdade.", ["pagarme", "chave", "sk", "pk", "api"], "diretoria"],
  ["Como configuro o webhook?", "Na Pagar.me, vá em Configurações → Webhooks → Criar webhook, cole a URL que aparece no seu painel (Pagamentos) e marque os eventos de pedido, cobrança, fatura e assinatura.", ["webhook", "pagarme", "configurar"], "diretoria"],
  ["Como repasso o dinheiro para a subsede?", "Em Financeiro você vê quanto cada subsede tem a receber (ingressos dos eventos dela e mensalidades dos sócios dela). Faça a transferência e registre o repasse para manter o saldo em dia.", ["repasse", "subsede", "financeiro"], "diretoria"],
  ["O cartão do torcedor foi recusado. O que fazer?", "A recusa vem do banco emissor. Peça para conferir os dados, o limite ou usar Pix. O motivo aparece na tela de pedidos do painel.", ["recusado", "cartão", "negado"], "todos"],
];
for (const [i, [pergunta, resposta, palavrasChave, publico]] of faqs.entries()) {
  await aDb.collection("faq").add({ pergunta, resposta, palavrasChave, publico, ordem: i });
}

// ── Diretoria configura tudo ───────────────────────────────
const dirUser = await aAuth.getUserByEmail("diretoria@brasil.test");
await aAuth.updateUser(dirUser.uid, { password: SENHA });
const d = navegador();
await signInWithEmailAndPassword(d.auth, "diretoria@brasil.test", SENHA);
const { webhookUrl } = await d.chamar("salvarCredenciaisPagarme", {
  tid, chaveSecreta: "sk_test_DEMOdemo1234567890", chavePublica: "pk_test_DEMOdemo1234567890", pix: true, cartao: true,
});
await updateDoc(doc(d.db, `torcidas/${tid}`), {
  textos: {
    titulo: "Torcida Brasil",
    subtitulo: "Desde 1990 na arquibancada. Eventos, caravanas e o programa oficial de sócios.",
    sobre: "A maior torcida organizada do país, presente em 12 distritos. Ser sócio é manter a nossa história viva e a estrutura de pé.",
  },
  contato: { whatsapp: "5571994095784", instagram: "torcidabrasil", email: "contato@torcidabrasil.test" },
});

const sedePrincipal = (await getDoc(doc(d.db, `torcidas/${tid}`))).get("sedePrincipalId");
const sedes = {};
for (const [chave, nome, bairro, ordem] of [
  ["d1", "1º Distrito · Região Central", "Centro", 1],
  ["d4", "4º Distrito · Subúrbio", "Periperi", 4],
  ["d7", "7º Distrito · Orla", "Itapuã", 7],
  ["d12", "12º Distrito · Interior", "Feira de Santana", 12],
]) {
  sedes[chave] = (await addDoc(collection(d.db, `torcidas/${tid}/sedes`), { nome, tipo: "subsede", ativa: true, ordem, bairro })).id;
}

const planos = [
  ["mensal", { nome: "Sócio Mensal", descricao: "O jeito mais fácil de fazer parte.", valor: 1000, intervalo: "mes", intervaloQtd: 1, destaque: true, ordem: 1,
    beneficios: ["Preço de sócio em todos os eventos", "Carteirinha digital com QR Code", "Prioridade nas caravanas", "Voto nas assembleias"] }],
  ["anual", { nome: "Sócio Anual", descricao: "12 meses pelo preço de 10.", valor: 10000, intervalo: "ano", intervaloQtd: 1, ordem: 2,
    beneficios: ["Tudo do plano mensal", "2 meses grátis", "Kit de boas-vindas"] }],
  ["infantil", { nome: "Sócio Mirim", descricao: "Para a nova geração da arquibancada (até 12 anos).", valor: 500, intervalo: "mes", intervaloQtd: 1, ordem: 3,
    beneficios: ["Carteirinha digital", "Preço de sócio nos eventos família"] }],
];
for (const [id, pl] of planos) {
  await setDoc(doc(d.db, `torcidas/${tid}/planos/${id}`), { pix: true, cartao: true, ativo: true, ...pl });
}

// Split: a torcida informa o recebedor principal (conta dela) e liga a divisão
await d.chamar("configurarSplit", { tid, recebedorPrincipalId: "rp_principal" });

// Membros do painel (o convite gera o acesso; aqui a senha é definida direto)
const contas = {};
for (const [email, nome, papel, sedeId] of [
  ["subsede4@brasil.test", "Coordenador 4º Distrito", "subsede", sedes.d4],
  ["subsede12@brasil.test", "Coordenador 12º Distrito", "subsede", sedes.d12],
  ["subsede7@brasil.test", "Coordenador 7º Distrito", "subsede", sedes.d7],
  ["portaria@brasil.test", "Equipe Portaria", "portaria", undefined],
]) {
  const r = await d.chamar("convidarMembro", { tid, email, nome, papel, sedeId });
  await aAuth.updateUser(r.uid, { password: SENHA });
  if (papel === "subsede") {
    const b = navegador();
    await signInWithEmailAndPassword(b.auth, email, SENHA);
    contas[email] = b;
  }
}

// 4º e 12º Distrito cadastram a conta de recebimento e passam na prova de vida; 7º ainda não
for (const [email, cpf, nomeTitular] of [
  ["subsede4@brasil.test", "25426823642", "Carlos Henrique do Periperi"],
  ["subsede12@brasil.test", "32006387022", "Joana Feirense Santos"],
]) {
  const b = contas[email];
  const { recebedor } = await b.chamar("cadastrarRecebedor", {
    tid,
    dados: {
      nome: nomeTitular, email, cpf, nascimento: "1982-07-15", nomeMae: "Maria das Graças", rendaMensal: 450000,
      profissao: "Comerciante", telefone: "71999887766",
      endereco: { cep: "40720000", logradouro: "Rua da Quadra", numero: "40", bairro: "Periperi", cidade: "Salvador", uf: "BA" },
      banco: { codigo: "341", agencia: "1234", conta: "45678", contaDv: "9", tipo: "checking" },
    },
  });
  await fetch(`${PAGARME}/__recebedor/${recebedor.id}`, { method: "POST" });
  await b.chamar("atualizarRecebedor", { tid });
}

const eventos = {};
const criarEvento = async (b, ev, status) =>
  (await addDoc(collection(b.db, `torcidas/${tid}/eventos`), { ...ev, vendidos: 0, reservados: 0, status, limitePorPedido: 6 })).id;
// Eventos da sede principal: a diretoria publica direto
for (const [chave, ev] of [
  ["final", { nome: "Caravana para a Final", descricao: "Ônibus saindo da Sede Central às 13h, ingresso do setor da torcida incluso. Chegue com 30 min de antecedência com documento com foto.", sedeId: sedePrincipal, local: "Saída: Sede Central", data: em(9, 13), valorSocio: 12000, valorPublico: 15000, capacidade: 180 }],
  ["aniversario", { nome: "Festa de 36 anos da Torcida", descricao: "A noite mais esperada do ano. Show, homenagens e o lançamento do novo bandeirão.", sedeId: sedePrincipal, local: "Clube Central", data: em(21, 21), valorSocio: 5000, valorPublico: 8000, capacidade: 600 }],
  ["classico", { nome: "Clássico — Bloco da Torcida", descricao: "Setor exclusivo da torcida. Ingresso nominal, entrada até 1h antes do jogo.", sedeId: sedePrincipal, local: "Arena", data: em(30, 16), valorSocio: 6000, valorPublico: 9000, capacidade: 400 }],
]) {
  eventos[chave] = await criarEvento(d, ev, "publicado");
}
// Eventos de subsede: a subsede envia para aprovação e a diretoria publica (conta de recebimento ativa)
for (const [chave, email, ev] of [
  ["churras", "subsede4@brasil.test", { nome: "Churrasco do 4º Distrito", descricao: "Confraternização com bateria ao vivo. Bebidas à parte.", sedeId: sedes.d4, local: "Quadra do Periperi", data: em(4, 12), valorSocio: 3000, valorPublico: 4000, capacidade: 120 }],
  ["interior", "subsede12@brasil.test", { nome: "Excursão Interior → Capital", descricao: "Ônibus do 12º Distrito para o jogo de domingo.", sedeId: sedes.d12, local: "Rodoviária de Feira", data: em(16, 9), valorSocio: 7000, valorPublico: 9000, capacidade: 46 }],
]) {
  eventos[chave] = await criarEvento(contas[email], ev, "em_aprovacao");
  await updateDoc(doc(d.db, `torcidas/${tid}/eventos/${eventos[chave]}`), { status: "publicado" });
}
// 7º Distrito: evento aguardando aprovação, mas sem conta de recebimento ainda (a diretoria não consegue aprovar)
eventos.bateria = await criarEvento(contas["subsede7@brasil.test"], {
  nome: "Ensaio aberto da bateria", descricao: "Ensaio para o clássico. Aberto à família.", sedeId: sedes.d7, local: "Praça de Itapuã",
  data: em(2, 18, 30), valorSocio: 0, valorPublico: 1000, capacidade: 200,
}, "em_aprovacao");
await addDoc(collection(d.db, `torcidas/${tid}/eventos`), {
  nome: "Bingo beneficente", descricao: "Rascunho — ainda não publicado.", sedeId: sedePrincipal, local: "Sede Central",
  data: em(40, 15), valorSocio: 1500, valorPublico: 2000, capacidade: 150, vendidos: 0, reservados: 0, status: "rascunho",
});
{
  const passado = await addDoc(collection(d.db, `torcidas/${tid}/eventos`), {
    nome: "Caravana semifinal", descricao: "Evento encerrado.", sedeId: sedePrincipal, local: "Arena",
    data: em(-12, 16), valorSocio: 9000, valorPublico: 12000, capacidade: 100, vendidos: 0, reservados: 0, status: "publicado",
  });
  await updateDoc(passado, { status: "encerrado" });
}

// Site publicado no plano "Torcida grande" (gera a 1ª fatura da mensalidade Somos Organizada)
await aDb.doc("plataforma/publico").set({ pix: { chave: "financeiro@somosorganizada.com.br", nome: "Somos Organizada", cidade: "Salvador" } });
await d.chamar("publicarSite", { tid, plano: "grande" });

// Pedido de cadastro de outra torcida aguardando a aprovação da equipe
{
  await aAuth.createUser({ email: "diretor@furiajovem.test", password: SENHA, emailVerified: true, displayName: "Paulo Fúria" });
  const b = navegador();
  await signInWithEmailAndPassword(b.auth, "diretor@furiajovem.test", SENHA);
  await b.chamar("solicitarTorcida", {
    nomeTorcida: "Fúria Jovem", slug: "furia-jovem", clube: "Esporte Clube Bahia", estimativaSocios: 1200, quantidadeSubsedes: 6,
    responsavel: { nome: "Paulo Fúria Santos", cpf: "39053344705", telefone: "71988776655", cargo: "Presidente" },
    entidade: { tipo: "cnpj", cnpj: "11222333000181", razaoSocial: "Associação Torcida Fúria Jovem", emailFinanceiro: "financeiro@furiajovem.test" },
    endereco: { cep: "40050000", logradouro: "Avenida Sete de Setembro", numero: "100", bairro: "Centro", cidade: "Salvador", uf: "BA" },
  });
}

// ── Vendas de demonstração ─────────────────────────────────
const pagar = (orderId) => fetch(`${PAGARME}/__pagar/${orderId}`, { method: "POST" });
async function pagarPedido(b, pedidoId) {
  const pd = await getDoc(doc(b.db, `torcidas/${tid}/pedidos/${pedidoId}`));
  await pagar(pd.get("pagarme").orderId);
  await b.chamar("verificarPedido", { tid, pedidoId });
}

const compradores = [
  ["Ana Souza", "39053344705", "71991110001", "final", 2],
  ["Bruno Lima", "11144477735", "71991110002", "final", 1],
  ["Carla Dias", "52998224725", "71991110003", "churras", 3],
  ["Diego Alves", "86288366757", "71991110004", "aniversario", 2],
  ["Elaine Rocha", "71428793860", "71991110005", "classico", 4],
];
const cpfsExtras = ["83400613991", "45317828791", "59790057067", "26631318300", "95473830862", "67129029919", "13711081703", "38640161852"];
let extra = 0;
for (const [nome, cpf, tel, ev, qtd] of compradores) {
  const b = navegador();
  await signInAnonymously(b.auth);
  const titulares = [{ nome, cpf }];
  for (let i = 1; i < qtd; i++) titulares.push({ nome: `Acompanhante ${i} de ${nome.split(" ")[0]}`, cpf: cpfsExtras[extra++ % cpfsExtras.length] });
  const r = await b.chamar("criarPedidoIngresso", {
    tid, eventoId: eventos[ev], metodo: "pix",
    comprador: { nome, email: `${nome.split(" ")[0].toLowerCase()}@exemplo.test`, cpf, telefone: tel }, titulares,
  });
  await pagarPedido(b, r.pedidoId);
}
// Um pedido Pix em aberto (aparece como "aguardando")
{
  const b = navegador();
  await signInAnonymously(b.auth);
  await b.chamar("criarPedidoIngresso", {
    tid, eventoId: eventos.interior, metodo: "pix",
    comprador: { nome: "Fábio Teixeira", email: "fabio@exemplo.test", cpf: "83400613991", telefone: "75991110006" },
    titulares: [{ nome: "Fábio Teixeira", cpf: "83400613991" }],
  });
}

// ── Sócios ─────────────────────────────────────────────────
const endereco = { cep: "41820020", logradouro: "Rua Edgar Santos", numero: "120", bairro: "Stiep", cidade: "Salvador", uf: "BA" };
async function novoSocio(email, nome, cpf, plano, sedeId, metodo = "pix", pagarAgora = true) {
  const b = navegador();
  await createUserWithEmailAndPassword(b.auth, email, SENHA);
  const r = await b.chamar("aderirSocio", {
    tid, planoId: plano, sedeId, metodo,
    dados: { nome, cpf, telefone: "71988887777", nascimento: "1992-03-14", endereco },
    ...(metodo === "cartao" ? { cartao: { token: "tok_demo" } } : {}),
  });
  if (metodo === "pix" && pagarAgora) await pagarPedido(b, r.pedidoId);
  return b;
}
const socio = await novoSocio("socio@brasil.test", "Rafael Torcedor", "32390330037", "mensal", sedes.d4);
await novoSocio("anual@brasil.test", "Juliana Arquibancada", "08064350115", "anual", sedePrincipal, "cartao");
await novoSocio("mirim@brasil.test", "Pedro Mirim", "26049410313", "infantil", sedes.d7);
await novoSocio("novo@brasil.test", "Lucas Recém-chegado", "73731513293", "mensal", sedes.d1, "pix", false);

// Sócio compra com preço de sócio
{
  const r = await socio.chamar("criarPedidoIngresso", {
    tid, eventoId: eventos.final, metodo: "pix",
    comprador: { nome: "Rafael Torcedor", email: "socio@brasil.test", cpf: "32390330037", telefone: "71988887777" },
    titulares: [{ nome: "Rafael Torcedor", cpf: "32390330037" }],
  });
  await pagarPedido(socio, r.pedidoId);
}

// Repasse já feito a uma subsede
await addDoc(collection(d.db, `torcidas/${tid}/repasses`), {
  sedeId: sedes.d4, valor: 5000, observacao: "Adiantamento churrasco", status: "registrado", registradoPor: dirUser.uid, criadoEm: Timestamp.now(),
});

// Chamado de suporte de exemplo
{
  const b = navegador();
  await signInWithEmailAndPassword(b.auth, "subsede4@brasil.test", SENHA);
  const c = await addDoc(collection(b.db, "suporte"), {
    uid: b.auth.currentUser.uid, nome: "Coordenador 4º Distrito", email: "subsede4@brasil.test",
    torcidaId: tid, torcidaNome: "Torcida Brasil", papel: "subsede",
    assunto: "Não acho onde mudar a foto do evento", status: "aberto", naoLidasPlataforma: 1,
    diagnostico: { url: "http://127.0.0.1:5173/brasil/admin/eventos", navegador: "Chrome Android", erros: [] },
    criadoEm: Timestamp.now(), atualizadoEm: Timestamp.now(),
  });
  await addDoc(collection(b.db, `suporte/${c.id}/mensagens`), {
    autor: "usuario", nome: "Coordenador 4º Distrito", texto: "Boa tarde! Criei o churrasco mas não estou achando onde troco a imagem do evento.", criadoEm: Timestamp.now(),
  });
  await signOut(b.auth);
}

console.log("✔ Torcida de demonstração criada: /brasil");
console.log(`  Webhook (simulado): ${webhookUrl}`);
console.log("  Contas (senha senha123456): equipe@somos.test · diretoria@brasil.test · subsede4@brasil.test (conta ativa) · subsede7@brasil.test (sem conta de recebimento) · portaria@brasil.test · socio@brasil.test");
process.exit(0);
