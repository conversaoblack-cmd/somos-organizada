/**
 * Cadastro de torcida pela página principal da Somos Organizada.
 * O diretor cria a conta (e-mail verificado), preenche os dados da torcida e da entidade, e escolhe o
 * endereço (/nome-da-torcida). O endereço fica reservado e o pedido aguarda a aprovação da equipe.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ESCALA_PUBLICA, URL_APP } from "../config";
import { db, refs, FieldValue, Timestamp } from "../util/firebase";
import { cpfValido, emailValido, endereco, inteiro, slugValido, soDigitos, telefoneBR, temaInformado, texto, umDe } from "../util/validacao";
import { exigirLogin, exigirPlataforma } from "../dominio/permissoes";
import { criarTorcidaInterno } from "./plataforma";
import { refsSaas } from "./saas";
import { MARCA_PLATAFORMA } from "./verificacao";
import { enviarAgora } from "../email/enviar";
import { esc, montar } from "../email/modelos";
import type { Torcida } from "../dominio/tipos";

const refSolicitacao = (id: string) => db.doc(`solicitacoes/${id}`);

function cnpjValido(v: string): boolean {
  const c = soDigitos(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((s, d, i) => s + Number(d) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(c.slice(0, 12)) === Number(c[12]) && calc(c.slice(0, 13)) === Number(c[13]);
}

export const slugDisponivel = onCall(async (req) => {
  const slug = String((req.data ?? {}).slug ?? "").trim().toLowerCase();
  if (!slugValido(slug)) return { disponivel: false, motivo: "Use de 3 a 40 letras minúsculas, números e hífen." };
  const s = await refs.slug(slug).get();
  return s.exists ? { disponivel: false, motivo: "Este endereço já está em uso." } : { disponivel: true };
});

export const solicitarTorcida = onCall(async (req) => {
  const uid = exigirLogin(req);
  if (!req.auth?.token.email_verified) throw new HttpsError("failed-precondition", "Confirme seu e-mail antes de cadastrar a torcida.");
  const email = String(req.auth.token.email ?? "").toLowerCase();
  const d = (req.data ?? {}) as Record<string, unknown>;

  const nomeTorcida = texto(d.nomeTorcida, "nome da torcida", { min: 2, max: 80 });
  const slug = texto(d.slug, "endereço", { min: 3, max: 40 }).toLowerCase();
  if (!slugValido(slug)) throw new HttpsError("invalid-argument", "Endereço inválido: use letras minúsculas, números e hífen.");
  const clube = texto(d.clube, "clube", { max: 80, obrigatorio: false });
  const estimativaSocios = inteiro(d.estimativaSocios ?? 0, "estimativa de sócios", { min: 0, max: 1_000_000 });
  const subsedes = inteiro(d.quantidadeSubsedes ?? 0, "quantidade de subsedes", { min: 0, max: 500 });

  const r = (d.responsavel ?? {}) as Record<string, unknown>;
  const responsavel = {
    nome: texto(r.nome, "nome do responsável", { min: 5, max: 64 }),
    cpf: soDigitos(r.cpf),
    telefone: soDigitos(r.telefone),
    cargo: texto(r.cargo, "cargo", { max: 40 }),
  };
  if (!cpfValido(responsavel.cpf)) throw new HttpsError("invalid-argument", "CPF do responsável inválido.");
  if (!telefoneBR(responsavel.telefone)) throw new HttpsError("invalid-argument", "Telefone do responsável inválido.");

  const e = (d.entidade ?? {}) as Record<string, unknown>;
  const tipo = umDe(e.tipo, "tipo de entidade", ["cnpj", "sem_cnpj"] as const);
  const entidade: Record<string, unknown> = { tipo };
  if (tipo === "cnpj") {
    entidade.cnpj = soDigitos(e.cnpj);
    if (!cnpjValido(String(entidade.cnpj))) throw new HttpsError("invalid-argument", "CNPJ inválido.");
    entidade.razaoSocial = texto(e.razaoSocial, "razão social", { min: 3, max: 120 });
  }
  const emailFinanceiro = texto(e.emailFinanceiro, "e-mail financeiro", { max: 64, obrigatorio: false }).toLowerCase() || email;
  if (!emailValido(emailFinanceiro)) throw new HttpsError("invalid-argument", "E-mail financeiro inválido.");
  entidade.emailFinanceiro = emailFinanceiro;
  const end = endereco(d.endereco);
  const tema = temaInformado(d.tema);

  const pendentes = await db.collection("solicitacoes").where("uid", "==", uid).where("status", "==", "pendente").limit(1).get();
  if (!pendentes.empty) throw new HttpsError("already-exists", "Você já tem um cadastro em análise.");

  const ref = db.collection("solicitacoes").doc();
  await db.runTransaction(async (tx) => {
    const s = await tx.get(refs.slug(slug));
    if (s.exists) throw new HttpsError("already-exists", "Este endereço já está em uso. Escolha outro.");
    tx.set(refs.slug(slug), { solicitacaoId: ref.id, reservado: true });
    tx.set(ref, {
      uid, email, status: "pendente", nomeTorcida, slug, clube, estimativaSocios, quantidadeSubsedes: subsedes,
      responsavel, entidade, endereco: end, tema, criadoEm: FieldValue.serverTimestamp(),
    });
    // O rascunho (com CPF) não é mais necessário: o pedido enviado é a fonte agora
    tx.delete(db.doc(`usuarios/${uid}/rascunhos/cadastroTorcida`));
  });
  return { solicitacaoId: ref.id, status: "pendente" };
});

export const avaliarSolicitacao = onCall(async (req) => {
  const quem = exigirPlataforma(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const id = texto(d.id, "solicitação", { max: 40 });
  const aprovar = d.aprovar === true;
  const ref = refSolicitacao(id);
  const sol = (await ref.get()).data();
  if (!sol) throw new HttpsError("not-found", "Solicitação não encontrada.");
  if (sol.status !== "pendente") throw new HttpsError("failed-precondition", "Esta solicitação já foi avaliada.");

  if (!aprovar) {
    const motivo = texto(d.motivo, "motivo", { min: 3, max: 500 });
    await db.runTransaction(async (tx) => {
      const s = await tx.get(refs.slug(sol.slug));
      if (s.get("solicitacaoId") === id) tx.delete(refs.slug(sol.slug));
      // libera o horário da chamada de verificação, se havia um marcado
      if (sol.verificacao?.horarioId) tx.delete(db.doc(`agendaVerificacao/${sol.verificacao.horarioId}`));
      tx.update(ref, { status: "recusada", motivo, avaliadoPor: quem, avaliadoEm: FieldValue.serverTimestamp() });
    });
    await avisarResultado(sol, "recusada", { motivo });
    return { status: "recusada" };
  }
  // Os dados de torcida são públicos: só aprova depois da chamada de vídeo feita e gravada (verificacaoVideo.ts)
  if (sol.verificacao?.status !== "realizada") {
    throw new HttpsError("failed-precondition", "Faça a chamada de verificação em vídeo e marque como feita antes de aprovar.");
  }

  const r = await criarTorcidaInterno({
    nome: sol.nomeTorcida,
    slug: sol.slug,
    diretor: { nome: sol.responsavel.nome, email: sol.email },
    criadoPor: quem,
    solicitacaoId: id,
    tema: sol.tema,
  });
  await refsSaas.cadastro(r.torcidaId).set({
    clube: sol.clube ?? "", estimativaSocios: sol.estimativaSocios ?? 0, quantidadeSubsedes: sol.quantidadeSubsedes ?? 0,
    responsavel: sol.responsavel, entidade: sol.entidade, endereco: sol.endereco, solicitacaoId: id, criadoEm: Timestamp.now(),
  });
  await ref.update({ status: "aprovada", torcidaId: r.torcidaId, avaliadoPor: quem, avaliadoEm: FieldValue.serverTimestamp() });
  await avisarResultado(sol, "aprovada", { slug: r.slug });
  return { status: "aprovada", torcidaId: r.torcidaId, slug: r.slug };
});

/** E-mail ao responsável com o resultado da análise (nas cores escolhidas no cadastro). */
async function avisarResultado(sol: FirebaseFirestore.DocumentData, resultado: "aprovada" | "recusada", extra: { slug?: string; motivo?: string }) {
  const marca = { ...MARCA_PLATAFORMA, nome: sol.nomeTorcida, tema: { ...MARCA_PLATAFORMA.tema, ...(sol.tema ?? {}) } } as Torcida;
  const primeiro = String(sol.responsavel?.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const m =
    resultado === "aprovada"
      ? montar(marca, `${sol.nomeTorcida} aprovada na Somos Organizada`, { email: sol.email, nome: sol.responsavel?.nome }, {
          selo: "Cadastro aprovado",
          titulo: primeiro ? `${esc(primeiro)}, a ${esc(sol.nomeTorcida)} está aprovada!` : `A ${esc(sol.nomeTorcida)} está aprovada!`,
          paragrafos: [
            "O painel da torcida já está liberado. Entre com o mesmo e-mail e a senha do cadastro.",
            "Os primeiros passos estão no próprio painel: conectar a Pagar.me, personalizar a página com o escudo, criar eventos e planos de sócio e publicar o site.",
          ],
          botao: { texto: "Entrar no painel da torcida", url: `${URL_APP.value()}/${extra.slug ?? sol.slug}/admin` },
          conta: true,
        })
      : montar(marca, `Cadastro da ${sol.nomeTorcida} não aprovado`, { email: sol.email, nome: sol.responsavel?.nome }, {
          selo: "Resultado da análise",
          titulo: "O cadastro não foi aprovado",
          paragrafos: [`Motivo informado pela equipe: ${esc(extra.motivo ?? "")}`, "Se for um engano ou quiser corrigir os dados, fale com a equipe ou faça um novo cadastro."],
          botao: { texto: "Ver meu cadastro", url: `${URL_APP.value()}/cadastro` },
          conta: true,
        });
  await enviarAgora(m, `cadastro-${resultado}/${sol.slug}/${Date.now()}`).catch(() => undefined);
}

/** Tira acento, espaço e hífen: "Fúria Amapá" e "furia-amapa" viram "furiaamapa". */
const compacto = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0]!;
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j]!;
      linha[j] = Math.min(linha[j]! + 1, linha[j - 1]! + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return linha[b.length]!;
}

let cacheTorcidas: { ate: number; lista: { slug: string; nome: string; logoUrl: string | null; c: string[] }[] } | null = null;

/**
 * "Seria esta torcida?" no login da equipe: endereço digitado errado (letra trocada, tudo junto, sem hífen) devolve
 * até 3 torcidas parecidas pelo endereço ou pelo nome. Só nome, endereço e escudo (o que já é público).
 */
export const sugerirTorcidas = onCall(ESCALA_PUBLICA, async (req) => {
  const busca = compacto(String((req.data ?? {}).texto ?? "").slice(0, 80));
  if (busca.length < 3) return { sugestoes: [] };
  if (!cacheTorcidas || cacheTorcidas.ate < Date.now()) {
    const snap = await db.collection("torcidas").select("nome", "slug", "tema", "status").get();
    cacheTorcidas = {
      ate: Date.now() + 5 * 60_000,
      lista: snap.docs
        .map((d) => d.data() as { nome?: string; slug?: string; tema?: { logoUrl?: string }; status?: string })
        .filter((t) => t.slug && t.nome && t.status !== "suspensa")
        .map((t) => ({ slug: t.slug!, nome: t.nome!, logoUrl: t.tema?.logoUrl ?? null, c: [compacto(t.slug!), compacto(t.nome!)] })),
    };
  }
  return { sugestoes: escolherSugestoes(busca, cacheTorcidas.lista) };
});

/** Até 3 torcidas mais parecidas (0 = igual sem acento/hífen; 1 = contém; depois, letras de diferença). */
export function escolherSugestoes(texto: string, lista: { slug: string; nome: string; logoUrl: string | null; c?: string[] }[]) {
  const busca = compacto(texto);
  if (busca.length < 3) return [];
  const limite = Math.max(2, Math.round(busca.length * 0.34));
  return lista
    .map((t) => {
      const chaves = t.c ?? [compacto(t.slug), compacto(t.nome)];
      const nota = Math.min(...chaves.map((c) => (c === busca ? 0 : c.includes(busca) || (busca.length >= 6 && busca.includes(c)) ? 1 : distancia(busca, c))));
      return { t, nota };
    })
    .filter((x) => x.nota <= limite)
    .sort((a, b) => a.nota - b.nota || a.t.nome.localeCompare(b.t.nome))
    .slice(0, 3)
    .map(({ t }) => ({ slug: t.slug, nome: t.nome, logoUrl: t.logoUrl }));
}

