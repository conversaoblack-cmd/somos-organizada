import { telefoneBR, type Endereco, type Pessoa } from "../util/validacao";
import type { PgCustomer, PgEndereco } from "./cliente";

export function enderecoPg(e: Endereco): PgEndereco {
  return {
    line_1: `${e.numero}, ${e.logradouro}, ${e.bairro}`.slice(0, 256),
    line_2: e.complemento?.slice(0, 128),
    zip_code: e.cep,
    city: e.cidade,
    state: e.uf,
    country: "BR",
  };
}

export function clientePg(p: Pessoa, codigo?: string, endereco?: Endereco): PgCustomer {
  return {
    name: p.nome.slice(0, 64),
    email: p.email,
    document: p.cpf,
    document_type: "CPF",
    type: "individual",
    code: codigo?.slice(0, 52),
    phones: { mobile_phone: telefoneBR(p.telefone)! },
    address: endereco ? enderecoPg(endereco) : undefined,
  };
}

/** Texto que aparece na fatura do cartão (máx. 13 para contas PSP). */
export function descritor(nome: string): string {
  return nome.normalize("NFD").replace(/[^\w ]/g, "").toUpperCase().slice(0, 13).trim() || "TORCIDA";
}
