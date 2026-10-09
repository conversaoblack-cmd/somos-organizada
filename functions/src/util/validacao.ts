import { HttpsError } from "firebase-functions/v2/https";

export const soDigitos = (s: unknown): string => String(s ?? "").replace(/\D/g, "");

export function cpfValido(valor: string): boolean {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

export function mascararCpf(cpf: string): string {
  const d = soDigitos(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "***";
}

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 120; // conta do Firebase aceita e-mail longo: não barrar a compra
}

/** Aceita (71) 99999-9999, 71999999999, +55 71 99999-9999. */
export function telefoneBR(valor: string): { country_code: string; area_code: string; number: string } | null {
  let d = soDigitos(valor);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  return { country_code: "55", area_code: d.slice(0, 2), number: d.slice(2) };
}

const SLUGS_RESERVADOS = new Set([
  "admin", "api", "app", "assets", "conta", "login", "plataforma", "suporte", "painel", "portaria",
  "static", "www", "somos", "organizada", "termos", "privacidade", "ajuda", "sobre", "contato", "cadastro", "entrar",
  "verificar", "convite",
]);

export function slugValido(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) && !SLUGS_RESERVADOS.has(slug);
}

export function texto(v: unknown, campo: string, { min = 1, max = 120, obrigatorio = true } = {}): string {
  const s = String(v ?? "").trim();
  if (!s && !obrigatorio) return "";
  if (s.length < min || s.length > max) {
    throw new HttpsError("invalid-argument", `Campo "${campo}" inválido (entre ${min} e ${max} caracteres).`);
  }
  return s;
}

export function inteiro(v: unknown, campo: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpsError("invalid-argument", `Campo "${campo}" inválido.`);
  }
  return n;
}

export function umDe<T extends string>(v: unknown, campo: string, opcoes: readonly T[]): T {
  if (!opcoes.includes(v as T)) throw new HttpsError("invalid-argument", `Campo "${campo}" inválido.`);
  return v as T;
}

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export function endereco(v: unknown): Endereco {
  const e = (v ?? {}) as Record<string, unknown>;
  const cep = soDigitos(e.cep);
  if (cep.length !== 8) throw new HttpsError("invalid-argument", "CEP inválido.");
  const uf = texto(e.uf, "UF", { min: 2, max: 2 }).toUpperCase();
  return {
    cep,
    logradouro: texto(e.logradouro, "logradouro", { max: 120 }),
    numero: texto(e.numero, "número", { max: 12 }),
    complemento: texto(e.complemento, "complemento", { max: 60, obrigatorio: false }) || undefined,
    bairro: texto(e.bairro, "bairro", { max: 80 }),
    cidade: texto(e.cidade, "cidade", { max: 64 }),
    uf,
  };
}

export interface Pessoa {
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
}

export function pessoa(v: unknown): Pessoa {
  const p = (v ?? {}) as Record<string, unknown>;
  const nome = texto(p.nome, "nome", { min: 3, max: 64 });
  const email = texto(p.email, "e-mail", { max: 120 }).toLowerCase();
  if (!emailValido(email)) throw new HttpsError("invalid-argument", "E-mail inválido.");
  const cpf = soDigitos(p.cpf);
  if (!cpfValido(cpf)) throw new HttpsError("invalid-argument", "CPF inválido.");
  const tel = String(p.telefone ?? "");
  if (!telefoneBR(tel)) throw new HttpsError("invalid-argument", "Telefone inválido. Use DDD + número.");
  return { nome, email, cpf, telefone: soDigitos(tel) };
}

/** Cores da Somos Organizada (azul e amarelo): padrão quando a torcida ainda não escolheu as dela. */
export const TEMA_PADRAO = { corPrimaria: "#2E6BFF", corSecundaria: "#FFCC00", corFundo: "#070A12", corTexto: "#F1F4FA" } as const;

/** Tema escolhido no cadastro: só as 4 cores em #RRGGBB; o que vier inválido ou faltando fica com o padrão. */
export function temaInformado(v: unknown): { corPrimaria: string; corSecundaria: string; corFundo: string; corTexto: string } {
  const t = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const cor = (c: unknown, padrao: string) => (typeof c === "string" && /^#[0-9A-Fa-f]{6}$/.test(c) ? c.toUpperCase() : padrao);
  return {
    corPrimaria: cor(t.corPrimaria, TEMA_PADRAO.corPrimaria),
    corSecundaria: cor(t.corSecundaria, TEMA_PADRAO.corSecundaria),
    corFundo: cor(t.corFundo, TEMA_PADRAO.corFundo),
    corTexto: cor(t.corTexto, TEMA_PADRAO.corTexto),
  };
}
