import { useRef, useState } from "react";
import type { Endereco } from "@/lib/tipos";
import { buscarCep, bandeiraCartao, tokenizarCartao } from "@/lib/servicos";
import { soDigitos } from "@/lib/formatos";
import { useTorcida } from "@/hooks/torcida";
import { Botao, Campo, Icone, Selecao } from "@/ui";

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export interface EstadoCartao {
  numero: string;
  nome: string;
  validade: string;
  cvv: string;
  cep: string;
  numeroEndereco: string;
  endereco: Partial<Endereco> | null;
}

export const cartaoVazio = (): EstadoCartao => ({ numero: "", nome: "", validade: "", cvv: "", cep: "", numeroEndereco: "", endereco: null });

export function validarCartao(c: EstadoCartao): Record<string, string> {
  const e: Record<string, string> = {};
  const n = soDigitos(c.numero);
  if (n.length < 13 || !luhn(n)) e.numero = "Número do cartão inválido.";
  if (c.nome.trim().split(/\s+/).length < 2) e.nome = "Nome como está no cartão.";
  const [mm, aa] = c.validade.split("/");
  const mes = Number(mm);
  const ano = 2000 + Number(aa);
  const agora = new Date();
  if (!mm || !aa || mes < 1 || mes > 12 || ano < agora.getFullYear() || (ano === agora.getFullYear() && mes < agora.getMonth() + 1)) {
    e.validade = "Validade inválida.";
  }
  if (soDigitos(c.cvv).length < 3) e.cvv = "CVV inválido.";
  if (soDigitos(c.cep).length !== 8) e.cep = "Informe o CEP de cobrança.";
  else if (!c.endereco?.cidade?.trim()) e.cidade = "Informe a cidade.";
  if (soDigitos(c.cep).length === 8 && !/^[A-Z]{2}$/.test(c.endereco?.uf ?? "")) e.uf = "UF";
  if (!c.numeroEndereco.trim()) e.numeroEndereco = "Nº";
  return e;
}

function luhn(n: string) {
  let soma = 0;
  let dobrar = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (dobrar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    dobrar = !dobrar;
  }
  return soma % 10 === 0;
}

/** Tokeniza na Pagar.me e devolve { token, endereco } prontos para a Cloud Function. */
export async function prepararCartao(chavePublica: string, c: EstadoCartao): Promise<{ token: string; endereco: Endereco }> {
  const token = await tokenizarCartao(chavePublica, { numero: c.numero, nome: c.nome, validade: c.validade, cvv: c.cvv });
  const e = c.endereco!;
  return {
    token,
    endereco: {
      cep: soDigitos(c.cep),
      logradouro: e.logradouro || "Não informado",
      numero: c.numeroEndereco.trim(),
      bairro: e.bairro || "Centro",
      cidade: e.cidade!,
      uf: e.uf!,
    },
  };
}

export function FormCartao({ valor, onChange, erros }: { valor: EstadoCartao; onChange: (c: EstadoCartao) => void; erros: Record<string, string> }) {
  const [buscando, setBuscando] = useState(false);
  const [manual, setManual] = useState(false);
  // valor mais recente: a busca de CEP é assíncrona e não pode apagar o que foi digitado nesse meio-tempo
  const atual = useRef(valor);
  atual.current = valor;
  const set = (k: keyof EstadoCartao) => (v: string) => onChange({ ...atual.current, [k]: v });
  const setEnd = (k: keyof Endereco) => (v: string) => onChange({ ...atual.current, endereco: { ...(atual.current.endereco ?? {}), [k]: v } });
  const bandeira = bandeiraCartao(valor.numero);
  const demo = useTorcida().torcida.pagamentos?.ambiente === "demo";

  // Cartões do simulador oficial da Pagar.me (modo demonstração)
  const cartaoTeste = (numero: string) =>
    onChange({
      ...atual.current,
      numero: numero.replace(/(\d{4})(?=\d)/g, "$1 "),
      nome: "CLIENTE TESTE",
      validade: "12/30",
      cvv: "123",
      cep: "40000-000",
      numeroEndereco: "100",
      endereco: { cep: "40000000", logradouro: "Rua de Teste", bairro: "Centro", cidade: "Salvador", uf: "BA" },
    });

  async function cep(v: string) {
    onChange({ ...atual.current, cep: v });
    if (soDigitos(v).length !== 8) return;
    setBuscando(true);
    const e = await buscarCep(v);
    setBuscando(false);
    setManual(!e?.cidade);
    onChange({ ...atual.current, cep: v, endereco: e?.cidade ? e : { ...(atual.current.endereco ?? {}), cep: soDigitos(v) } });
  }

  return (
    <div className="space-y-3">
      {demo && (
        <div className="rounded-2xl border border-alerta/25 bg-alerta/12 p-3 space-y-2">
          <p className="text-xs text-alerta font-semibold">Demonstração: use um cartão de teste da Pagar.me</p>
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" variante="contorno" type="button" onClick={() => cartaoTeste("4000000000000010")}>Cartão que aprova</Botao>
            <Botao tamanho="sm" variante="contorno" type="button" onClick={() => cartaoTeste("4000000000000028")}>Cartão que recusa</Botao>
          </div>
        </div>
      )}
      <Campo
        rotulo="Número do cartão"
        mascara="cartao"
        autoComplete="cc-number"
        value={valor.numero}
        onChange={set("numero")}
        erro={erros.numero}
        icone="cartao"
        sufixo={bandeira && <span className="text-xs font-bold text-texto-2 pr-2">{bandeira}</span>}
      />
      <Campo rotulo="Nome impresso no cartão" autoComplete="cc-name" value={valor.nome} onChange={(v) => set("nome")(v.toUpperCase())} erro={erros.nome} />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Validade" mascara="validade" placeholder="MM/AA" autoComplete="cc-exp" value={valor.validade} onChange={set("validade")} erro={erros.validade} />
        <Campo rotulo="CVV" inputMode="numeric" maxLength={4} autoComplete="cc-csc" value={valor.cvv} onChange={(v) => set("cvv")(soDigitos(v))} erro={erros.cvv} />
      </div>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Campo
          rotulo="CEP do endereço de cobrança"
          mascara="cep"
          value={valor.cep}
          onChange={cep}
          erro={erros.cep}
          dica={
            buscando
              ? "Buscando..."
              : !manual && valor.endereco?.cidade
                ? `${valor.endereco.logradouro ? valor.endereco.logradouro + ", " : ""}${valor.endereco.cidade}/${valor.endereco.uf}`
                : undefined
          }
        />
        <Campo rotulo="Número" value={valor.numeroEndereco} onChange={set("numeroEndereco")} erro={erros.numeroEndereco} />
      </div>
      {manual && (
        <div className="space-y-3 rounded-2xl border border-linha p-3">
          <p className="text-xs text-texto-3">Não encontramos o CEP automaticamente. Preencha o endereço de cobrança:</p>
          <Campo rotulo="Rua" value={valor.endereco?.logradouro ?? ""} onChange={setEnd("logradouro")} />
          <Campo rotulo="Bairro" value={valor.endereco?.bairro ?? ""} onChange={setEnd("bairro")} />
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Campo rotulo="Cidade" value={valor.endereco?.cidade ?? ""} onChange={setEnd("cidade")} erro={erros.cidade} />
            <Selecao rotulo="UF" value={valor.endereco?.uf ?? ""} onChange={(e) => setEnd("uf")(e.target.value)} erro={erros.uf}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Selecao>
          </div>
        </div>
      )}
      <p className="flex items-center gap-2 text-xs text-texto-3">
        <Icone nome="cadeado" className="size-4" />
        Os dados do cartão vão direto para a Pagar.me, criptografados. Não ficam salvos na torcida.
      </p>
    </div>
  );
}
