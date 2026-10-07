/**
 * Recebedores (split): a subsede recebe o valor dos ingressos dos eventos dela direto na conta
 * bancária, pela Pagar.me, e a taxa de serviço vai para a torcida.
 *
 * Antifraude: só o usuário da própria subsede cadastra o recebedor dela (dados pessoais e conta
 * bancária do diretor da subsede + prova de vida da Pagar.me). A diretoria vê só o status.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { MASTER_KEY, URL_APP } from "../config";
import { refs, FieldValue } from "../util/firebase";
import { cpfValido, emailValido, mascararCpf, soDigitos, telefoneBR, texto, umDe, inteiro } from "../util/validacao";
import { exigirMembro } from "../dominio/permissoes";
import { RECEBEDOR_ATIVO } from "../dominio/split";
import { pagarmeDaTorcida } from "../pagarme/credenciais";
import { RECEBEDOR_PRINCIPAL_DEMO } from "../pagarme/demo";
import { PagarmeErro, type Pagarme } from "../pagarme/cliente";
import type { RecebedorSede, Sede, Torcida } from "../dominio/tipos";

/** Status que exigem a prova de vida (KYC) do titular. */
const PRECISA_KYC = new Set(["registration", "affiliation"]);

function erroPagarme(e: unknown, padrao: string): never {
  if (e instanceof HttpsError) throw e;
  if (e instanceof PagarmeErro) throw new HttpsError("invalid-argument", `Pagar.me: ${e.message}`);
  logger.error(padrao, { erro: String(e) });
  throw new HttpsError("internal", padrao);
}

/** Atualiza status do recebedor (e o link da prova de vida, quando ainda pendente). */
export async function sincronizarRecebedor(tid: string, sedeId: string, pg: Pagarme): Promise<RecebedorSede | null> {
  const ref = refs.sede(tid, sedeId);
  const sede = (await ref.get()).data() as Sede | undefined;
  if (!sede?.recebedor?.id) return null;
  const r = await pg.obterRecebedor(sede.recebedor.id);
  const kycStatus = r.kyc_details?.status ?? null;
  let kycUrl: string | null = null;
  let kycExpiraEm: string | null = null;
  if (PRECISA_KYC.has(r.status) || (kycStatus && kycStatus !== "approved")) {
    try {
      const k = await pg.linkKyc(r.id);
      kycUrl = k.url ? (k.url.startsWith("http") ? k.url : `https://${k.url}`) : null;
      kycExpiraEm = k.expires_at ?? null;
    } catch {
      // sem KYC pendente para gerar link (ex.: já enviado e em análise)
    }
  }
  const atualizado: RecebedorSede = {
    ...sede.recebedor,
    status: r.status,
    kycStatus,
    kycUrl,
    kycExpiraEm,
    atualizadoEm: FieldValue.serverTimestamp() as unknown as RecebedorSede["atualizadoEm"],
  };
  await ref.update({ recebedor: atualizado });
  return atualizado;
}

/** Diretoria informa o recebedor principal (rp_...) da conta Pagar.me da torcida e liga o split. */
export const configurarSplit = onCall({ secrets: [MASTER_KEY] }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  await exigirMembro(req, tid, ["diretoria"]);
  if (d.desativar === true) {
    await refs.torcida(tid).update({ "pagamentos.splitAtivo": false });
    return { splitAtivo: false };
  }
  const torcidaAtual = (await refs.torcida(tid).get()).data() as Torcida | undefined;
  const rp =
    torcidaAtual?.pagamentos?.ambiente === "demo" && !d.recebedorPrincipalId
      ? RECEBEDOR_PRINCIPAL_DEMO
      : texto(d.recebedorPrincipalId, "recebedor principal", { min: 5, max: 60 });
  if (!/^rp_[A-Za-z0-9]+$/.test(rp)) throw new HttpsError("invalid-argument", "O código do recebedor começa com rp_.");
  const pg = await pagarmeDaTorcida(tid);
  try {
    const r = await pg.obterRecebedor(rp);
    if (r.status !== RECEBEDOR_ATIVO) {
      throw new HttpsError("failed-precondition", `Este recebedor está com status "${r.status}" na Pagar.me. Ele precisa estar ativo.`);
    }
    await refs.torcida(tid).update({ "pagamentos.recebedorPrincipalId": rp, "pagamentos.splitAtivo": true });
    return { splitAtivo: true, nome: r.name ?? null };
  } catch (e) {
    erroPagarme(e, "Não foi possível validar o recebedor principal.");
  }
});

/**
 * O diretor da subsede cadastra a conta de recebimento dela (pessoa física: CPF do responsável).
 * Retorna o link da prova de vida da Pagar.me, que o titular faz pelo celular.
 */
export const cadastrarRecebedor = onCall({ secrets: [MASTER_KEY] }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const membro = await exigirMembro(req, tid, ["subsede"]);
  const sedeId = membro.sedeId;
  if (!sedeId) throw new HttpsError("failed-precondition", "Seu usuário não está vinculado a uma subsede.");

  const torcida = (await refs.torcida(tid).get()).data() as Torcida;
  if (!torcida.pagamentos?.configurado) throw new HttpsError("failed-precondition", "A torcida ainda não conectou a Pagar.me.");
  if (!torcida.pagamentos.splitAtivo) {
    throw new HttpsError("failed-precondition", "A diretoria ainda não ativou a divisão de pagamentos (split). Peça para configurar em Pagamentos.");
  }
  const sedeRef = refs.sede(tid, sedeId);
  const sede = (await sedeRef.get()).data() as Sede | undefined;
  if (!sede || sede.tipo !== "subsede") throw new HttpsError("failed-precondition", "Sede inválida.");
  if (sede.recebedor && !["refused", "inactive", "blocked"].includes(sede.recebedor.status)) {
    throw new HttpsError("already-exists", "Esta subsede já tem conta de recebimento cadastrada. Use \"Atualizar status\".");
  }

  const x = (d.dados ?? {}) as Record<string, unknown>;
  const nome = texto(x.nome, "nome completo", { min: 5, max: 64 });
  const email = texto(x.email, "e-mail", { max: 64 }).toLowerCase();
  if (!emailValido(email)) throw new HttpsError("invalid-argument", "E-mail inválido.");
  const cpf = soDigitos(x.cpf);
  if (!cpfValido(cpf)) throw new HttpsError("invalid-argument", "CPF inválido.");
  const nascimento = texto(x.nascimento, "data de nascimento", { min: 10, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) throw new HttpsError("invalid-argument", "Data de nascimento inválida.");
  const nomeMae = texto(x.nomeMae, "nome da mãe", { min: 5, max: 64 });
  const rendaMensal = inteiro(x.rendaMensal, "renda mensal", { min: 100, max: 100_000_000 });
  const profissao = texto(x.profissao, "profissão", { min: 2, max: 60 });
  const tel = telefoneBR(String(x.telefone ?? ""));
  if (!tel) throw new HttpsError("invalid-argument", "Telefone inválido.");
  const e = (x.endereco ?? {}) as Record<string, unknown>;
  const cep = soDigitos(e.cep);
  if (cep.length !== 8) throw new HttpsError("invalid-argument", "CEP inválido.");
  const b = (x.banco ?? {}) as Record<string, unknown>;
  const banco = soDigitos(b.codigo).padStart(3, "0");
  if (banco.length !== 3) throw new HttpsError("invalid-argument", "Código do banco inválido (3 dígitos).");
  const agencia = soDigitos(b.agencia);
  const conta = soDigitos(b.conta);
  const contaDv = String(b.contaDv ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (!agencia || agencia.length > 4) throw new HttpsError("invalid-argument", "Agência inválida (até 4 dígitos, sem o dígito).");
  if (!conta || conta.length > 13 || !contaDv || contaDv.length > 2) throw new HttpsError("invalid-argument", "Conta ou dígito inválido.");
  const agenciaDv = String(b.agenciaDv ?? "").replace(/[^0-9Xx]/g, "").toUpperCase().slice(0, 1);
  const tipoConta = umDe(b.tipo, "tipo de conta", ["checking", "savings"] as const);

  const pg = await pagarmeDaTorcida(tid);
  try {
    const r = await pg.criarRecebedor({
      code: sedeId,
      register_information: {
        name: nome,
        email,
        document: cpf,
        type: "individual",
        site_url: `${URL_APP.value().replace(/\/$/, "")}/${torcida.slug}`,
        mother_name: nomeMae,
        birthdate: `${nascimento}T00:00:00`,
        monthly_income: rendaMensal,
        professional_occupation: profissao,
        address: {
          street: texto(e.logradouro, "rua", { max: 120 }),
          complementary: texto(e.complemento, "complemento", { max: 60, obrigatorio: false }) || "Sem complemento",
          street_number: texto(e.numero, "número", { max: 12 }),
          neighborhood: texto(e.bairro, "bairro", { max: 80 }),
          city: texto(e.cidade, "cidade", { max: 64 }),
          state: texto(e.uf, "UF", { min: 2, max: 2 }).toUpperCase(),
          zip_code: cep,
          reference_point: texto(e.referencia, "ponto de referência", { max: 80, obrigatorio: false }) || "Não informado",
        },
        phone_numbers: [{ ddd: tel.area_code, number: tel.number, type: "mobile" }],
      },
      default_bank_account: {
        holder_name: nome.slice(0, 30),
        holder_type: "individual",
        holder_document: cpf,
        bank: banco,
        branch_number: agencia,
        branch_check_digit: agenciaDv || undefined,
        account_number: conta,
        account_check_digit: contaDv,
        type: tipoConta,
      },
      transfer_settings: { transfer_enabled: true, transfer_interval: "Daily", transfer_day: 0 },
      automatic_anticipation_settings: { enabled: false },
      metadata: { torcidaId: tid, sedeId },
    });
    const recebedor: RecebedorSede = {
      id: r.id,
      status: r.status,
      kycStatus: r.kyc_details?.status ?? null,
      nomeTitular: nome,
      documentoMascarado: mascararCpf(cpf),
      banco: { codigo: banco, agencia: `${agencia}${agenciaDv ? `-${agenciaDv}` : ""}`, conta: `•••${conta.slice(-3)}-${contaDv}` },
      kycUrl: null,
      kycExpiraEm: null,
      cadastradoPor: membro.uid,
      atualizadoEm: FieldValue.serverTimestamp() as unknown as RecebedorSede["atualizadoEm"],
    };
    await sedeRef.update({ recebedor });
    const sincronizado = await sincronizarRecebedor(tid, sedeId, pg);
    return { recebedor: sincronizado ?? recebedor };
  } catch (err) {
    erroPagarme(err, "Não foi possível cadastrar a conta de recebimento.");
  }
});

/** Subsede (a própria) ou diretoria (qualquer subsede) atualiza o status na Pagar.me. */
export const atualizarRecebedor = onCall({ secrets: [MASTER_KEY] }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const tid = texto(d.tid, "torcida", { max: 40 });
  const membro = await exigirMembro(req, tid, ["diretoria", "subsede"]);
  const sedeId = membro.papel === "subsede" ? membro.sedeId : texto(d.sedeId, "sede", { max: 40 });
  if (!sedeId) throw new HttpsError("failed-precondition", "Sede não informada.");
  const pg = await pagarmeDaTorcida(tid);
  try {
    const r = await sincronizarRecebedor(tid, sedeId, pg);
    if (!r) throw new HttpsError("not-found", "Esta sede ainda não cadastrou a conta de recebimento.");
    return { recebedor: r };
  } catch (e) {
    erroPagarme(e, "Não foi possível consultar a Pagar.me.");
  }
});
