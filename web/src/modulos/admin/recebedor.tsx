import type { RecebedorPublico, Sede } from "@/lib/tipos";
import { Selo, type Tom } from "@/ui";

export const RECEBEDOR_ATIVO = "active";

const STATUS: Record<string, { rotulo: string; tom: Tom; explicacao: string }> = {
  registration: { rotulo: "Em cadastro", tom: "alerta", explicacao: "Falta a prova de vida do titular (selfie e documento pelo celular)." },
  affiliation: { rotulo: "Em análise", tom: "info", explicacao: "A Pagar.me está analisando os dados. Costuma levar de algumas horas a 2 dias úteis." },
  active: { rotulo: "Ativa", tom: "sucesso", explicacao: "Tudo certo: as vendas dos eventos da subsede caem direto nesta conta." },
  refused: { rotulo: "Recusada", tom: "perigo", explicacao: "A Pagar.me recusou o cadastro. Confira os dados e cadastre de novo." },
  suspended: { rotulo: "Suspensa", tom: "perigo", explicacao: "A conta foi suspensa pela Pagar.me. Fale com o suporte deles." },
  blocked: { rotulo: "Bloqueada", tom: "perigo", explicacao: "A conta foi bloqueada pela Pagar.me. Cadastre outra conta ou fale com o suporte deles." },
  inactive: { rotulo: "Inativa", tom: "neutro", explicacao: "A conta está inativa. Cadastre de novo para voltar a receber." },
};

export function infoRecebedor(r: RecebedorPublico | undefined | null) {
  if (!r) return { rotulo: "Sem conta", tom: "neutro" as Tom, explicacao: "A subsede ainda não cadastrou a conta de recebimento." };
  return STATUS[r.status] ?? { rotulo: r.status, tom: "neutro" as Tom, explicacao: "Situação informada pela Pagar.me." };
}

export function SeloRecebedor({ r, className }: { r: RecebedorPublico | undefined | null; className?: string }) {
  const i = infoRecebedor(r);
  return (
    <Selo tom={i.tom} ponto className={className}>
      {i.rotulo}
    </Selo>
  );
}

/** Pode cadastrar (de novo) a conta: sem cadastro ou recusada/inativa/bloqueada. */
export const podeCadastrarRecebedor = (r: RecebedorPublico | undefined | null) => !r || ["refused", "inactive", "blocked"].includes(r.status);

export const recebedorAtivo = (s: Sede | undefined | null) => !!s && (s.tipo === "principal" || s.recebedor?.status === RECEBEDOR_ATIVO);

export const BANCOS: { codigo: string; nome: string }[] = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "033", nome: "Santander" },
  { codigo: "104", nome: "Caixa Econômica" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "341", nome: "Itaú" },
  { codigo: "260", nome: "Nubank" },
  { codigo: "077", nome: "Inter" },
  { codigo: "336", nome: "C6 Bank" },
  { codigo: "290", nome: "PagBank" },
  { codigo: "380", nome: "PicPay" },
  { codigo: "323", nome: "Mercado Pago" },
  { codigo: "756", nome: "Sicoob" },
  { codigo: "748", nome: "Sicredi" },
];

export const nomeBanco = (codigo: string) => BANCOS.find((b) => b.codigo === codigo.padStart(3, "0"))?.nome ?? `Banco ${codigo}`;
