import { useState, type ReactNode } from "react";
import { api, mensagemDeErro, type DadosRecebedor } from "@/lib/api";
import { buscarCep } from "@/lib/servicos";
import { centavosDeTexto, cpfValido, dataHora, emailValido, mascaraCpf, moeda, soDigitos, taxa, telefoneValido } from "@/lib/formatos";
import { Aviso, Botao, CabecalhoPagina, Campo, Cartao, cx, Icone, OpcoesCartao, QrCode, Selecao, useToast } from "@/ui";
import { usePainel } from "./contexto";
import { useTourPagina } from "./tours";
import { BANCOS, infoRecebedor, nomeBanco, podeCadastrarRecebedor, SeloRecebedor } from "./recebedor";
import { Confirmar, Linha } from "./util";

interface Form {
  nome: string;
  email: string;
  cpf: string;
  nascimento: string;
  nomeMae: string;
  renda: string;
  profissao: string;
  telefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  referencia: string;
  banco: string;
  bancoOutro: string;
  agencia: string;
  agenciaDv: string;
  conta: string;
  contaDv: string;
  tipo: "checking" | "savings";
}

type Erros = Partial<Record<keyof Form, string>>;

function idade(iso: string): number {
  const n = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(n.getTime())) return -1;
  const h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
  return a;
}

export default function Recebimentos() {
  const { tid, torcida, sedes, sedeEscopo, nomeSede, pct, demo } = usePainel();
  useTourPagina("recebimentos");
  const avisar = useToast();
  const sede = sedes.find((s) => s.id === sedeEscopo);
  const r = sede?.recebedor;
  const splitAtivo = torcida.pagamentos?.splitAtivo === true;
  const [atualizando, setAtualizando] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const info = infoRecebedor(r);

  async function atualizar() {
    setAtualizando(true);
    try {
      const res = await api.atualizarRecebedor({ tid });
      avisar(`Situação atualizada: ${infoRecebedor(res.recebedor).rotulo}.`, "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setAtualizando(false);
    }
  }

  async function simular() {
    setAtualizando(true);
    try {
      await api.simularDemo({ tid, acao: "aprovar_recebedor" });
      avisar("Prova de vida aprovada (demonstração). Sua conta está ativa.", "sucesso");
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setAtualizando(false);
    }
  }

  const exemplo = 5000;
  const mensalidadeNaSede = torcida.destinoMensalidade === "sede_do_socio";

  return (
    <div className="max-w-4xl">
      <CabecalhoPagina
        titulo="Recebimentos"
        descricao={`Conta bancária onde a ${nomeSede(sedeEscopo)} recebe o dinheiro dos próprios eventos, direto pela Pagar.me.`}
      />

      {!sede && <Aviso tom="alerta">Seu usuário não está vinculado a uma subsede. Fale com a diretoria.</Aviso>}

      {/* Situação */}
      {sede && (
        <Cartao data-tour="receb-status" className={cx("p-5 sm:p-6 mb-6", r?.status === "active" ? "border-sucesso/40" : r ? "border-alerta/40" : "")}>
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <span
              className={cx(
                "size-14 shrink-0 rounded-2xl grid place-items-center",
                r?.status === "active" ? "bg-sucesso/15 text-sucesso" : r ? "bg-alerta/15 text-alerta" : "bg-superficie-2 text-texto-3",
              )}
            >
              <Icone nome={r?.status === "active" ? "checkCirculo" : r ? "relogio" : "cartao"} className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold">Conta de recebimento</p>
                <SeloRecebedor r={r} />
              </div>
              <p className="text-sm text-texto-2 mt-0.5">{info.explicacao}</p>
              {r?.atualizadoEm && <p className="text-xs text-texto-3 mt-1">Atualizado em {dataHora(r.atualizadoEm)}</p>}
            </div>
            {r && (
              <Botao variante="contorno" tamanho="sm" icone="atualizar" carregando={atualizando} onClick={atualizar} className="self-start">
                Atualizar status
              </Botao>
            )}
          </div>
          {r && (
            <div className="mt-5 grid sm:grid-cols-2 gap-x-8">
              <div>
                <Linha rotulo="Titular">{r.nomeTitular}</Linha>
                <Linha rotulo="CPF">{r.documentoMascarado}</Linha>
              </div>
              <div>
                <Linha rotulo="Banco">
                  {r.banco.codigo} · {nomeBanco(r.banco.codigo)}
                </Linha>
                <Linha rotulo="Agência / conta">
                  {r.banco.agencia} / {r.banco.conta}
                </Linha>
              </div>
            </div>
          )}
        </Cartao>
      )}

      {/* Prova de vida */}
      {demo && r && r.status !== "active" && (
        <Cartao className="p-5 sm:p-6 mb-6 border-info/40 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="font-semibold">Modo demonstração</p>
            <p className="text-sm text-texto-2">Na demonstração não existe prova de vida de verdade. Simule a aprovação para a conta ficar ativa.</p>
          </div>
          <Botao icone="raio" carregando={atualizando} onClick={simular}>
            Simular prova de vida aprovada
          </Botao>
        </Cartao>
      )}

      {r?.kycUrl && r.status !== "active" && (
        <Cartao className="p-5 sm:p-6 mb-6 border-info/40" data-tour="receb-kyc">
          <div className="grid md:grid-cols-[200px_1fr] gap-6 items-center">
            <QrCode valor={r.kycUrl} className="w-44 md:w-full mx-auto" />
            <div>
              <p className="text-lg font-bold">Falta a prova de vida</p>
              <p className="text-sm text-texto-2 mt-1">
                A Pagar.me precisa confirmar que o titular da conta é uma pessoa real. Leva uns 3 minutos e é feito pelo celular do <strong>titular</strong> ({r.nomeTitular}).
              </p>
              <ol className="list-decimal pl-5 mt-3 space-y-1 text-sm text-texto-2">
                <li>Aponte a câmera do celular para o QR Code (ou toque em “Abrir no celular”).</li>
                <li>Tire uma selfie seguindo as instruções da tela.</li>
                <li>Fotografe o documento com foto (RG ou CNH), frente e verso.</li>
                <li>Volte aqui e toque em “Atualizar status”.</li>
              </ol>
              <div className="flex flex-wrap gap-2 mt-4">
                <a
                  href={r.kycUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold bg-primaria text-sobre-primaria hover:brightness-110"
                >
                  <Icone nome="externo" className="size-4" /> Abrir no celular
                </a>
                <Botao variante="suave" tamanho="sm" icone="atualizar" carregando={atualizando} onClick={atualizar}>
                  Já fiz, atualizar
                </Botao>
              </div>
              {r.kycExpiraEm && (
                <p className="text-xs text-texto-3 mt-3">
                  Este link vale até {dataHora(new Date(r.kycExpiraEm))}. Se vencer, toque em “Atualizar status” para gerar outro.
                </p>
              )}
            </div>
          </div>
        </Cartao>
      )}

      {/* Como funciona */}
      <Cartao className="p-5 sm:p-6 mb-6" data-tour="receb-como-funciona">
        <h2 className="font-bold text-lg">Como o dinheiro é dividido</h2>
        <p className="text-sm text-texto-2 mt-1">
          A Pagar.me divide cada venda na hora (o chamado “split”). Ninguém precisa repassar nada à mão.
        </p>
        <div className="mt-4 rounded-2xl border border-linha bg-superficie-2 p-4">
          <p className="text-sm font-semibold mb-3">Exemplo: ingresso de {moeda(exemplo)} num evento da sua subsede</p>
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-superficie p-3">
              <p className="text-texto-3 text-xs">Torcedor paga</p>
              <p className="font-bold numeros text-lg">{moeda(exemplo + taxa(exemplo, pct))}</p>
            </div>
            <div className="rounded-xl bg-sucesso/10 border border-sucesso/25 p-3">
              <p className="text-texto-3 text-xs">Vai para a subsede</p>
              <p className="font-bold numeros text-lg">{moeda(exemplo)}</p>
              <p className="text-xs text-texto-3">menos as tarifas da Pagar.me</p>
            </div>
            <div className="rounded-xl bg-superficie p-3">
              <p className="text-texto-3 text-xs">Taxa de serviço (torcida)</p>
              <p className="font-bold numeros text-lg">{moeda(taxa(exemplo, pct))}</p>
            </div>
          </div>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-texto-2">
          <li className="flex gap-2">
            <Icone nome="check" className="size-4 text-primaria shrink-0 mt-0.5" />A subsede paga as tarifas da Pagar.me sobre a parte dela e responde por contestações (chargeback) dos eventos dela.
          </li>
          <li className="flex gap-2">
            <Icone nome="check" className="size-4 text-primaria shrink-0 mt-0.5" />
            {mensalidadeNaSede
              ? "Mensalidades dos sócios da sua subsede também caem nesta conta (a taxa de serviço continua com a torcida)."
              : "Mensalidades de sócio ficam com a sede principal (decisão da diretoria)."}
          </li>
          <li className="flex gap-2">
            <Icone nome="check" className="size-4 text-primaria shrink-0 mt-0.5" />
            Sem conta ativa, a diretoria não consegue aprovar os eventos da sua subsede.
          </li>
        </ul>
      </Cartao>

      {sede && !splitAtivo && (
        <Aviso tom="alerta" titulo="A diretoria ainda não ativou a divisão de pagamentos">
          Quando a diretoria ativar o split em Pagamentos, você poderá cadastrar a conta de recebimento aqui.
        </Aviso>
      )}

      {sede && splitAtivo && podeCadastrarRecebedor(r) && (
        <>
          {!formAberto ? (
            <Cartao className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4" data-tour="receb-cadastro">
              <div className="flex-1">
                <p className="font-bold">{r ? "Cadastrar a conta novamente" : "Cadastrar a conta de recebimento"}</p>
                <p className="text-sm text-texto-2 mt-0.5">
                  Tenha em mãos: CPF e documento do responsável pela subsede, dados da conta bancária no nome dele e o celular para a prova de vida.
                </p>
              </div>
              <Botao icone="mais" onClick={() => setFormAberto(true)}>
                Começar cadastro
              </Botao>
            </Cartao>
          ) : (
            <FormRecebedor cancelar={() => setFormAberto(false)} concluido={() => setFormAberto(false)} />
          )}
        </>
      )}
    </div>
  );
}

function Secao({ titulo, porque, children }: { titulo: string; porque: ReactNode; children: ReactNode }) {
  return (
    <Cartao className="p-5 sm:p-6">
      <h3 className="font-bold text-lg">{titulo}</h3>
      <p className="text-sm text-texto-3 mt-1 flex gap-2">
        <Icone nome="info" className="size-4 shrink-0 mt-0.5 text-info" />
        <span>{porque}</span>
      </p>
      <div className="mt-4 space-y-4">{children}</div>
    </Cartao>
  );
}

function FormRecebedor({ cancelar, concluido }: { cancelar: () => void; concluido: () => void }) {
  const { tid, membro } = usePainel();
  const avisar = useToast();
  const [f, setF] = useState<Form>({
    nome: membro.nome ?? "",
    email: membro.email ?? "",
    cpf: "",
    nascimento: "",
    nomeMae: "",
    renda: "",
    profissao: "",
    telefone: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    referencia: "",
    banco: "",
    bancoOutro: "",
    agencia: "",
    agenciaDv: "",
    conta: "",
    contaDv: "",
    tipo: "checking",
  });
  const [erros, setErros] = useState<Erros>({});
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const codigoBanco = f.banco === "outro" ? soDigitos(f.bancoOutro).padStart(3, "0") : f.banco;

  async function aoMudarCep(v: string) {
    set("cep", v);
    if (soDigitos(v).length !== 8) return;
    setBuscandoCep(true);
    const e = await buscarCep(v);
    setBuscandoCep(false);
    if (e) setF((x) => ({ ...x, logradouro: e.logradouro || x.logradouro, bairro: e.bairro || x.bairro, cidade: e.cidade || x.cidade, uf: e.uf || x.uf }));
  }

  function validar(): boolean {
    const e: Erros = {};
    if (f.nome.trim().split(/\s+/).length < 2 || f.nome.trim().length < 5) e.nome = "Nome completo, como no documento.";
    if (!emailValido(f.email)) e.email = "E-mail inválido.";
    if (!cpfValido(f.cpf)) e.cpf = "CPF inválido.";
    const id = idade(f.nascimento);
    if (id < 0) e.nascimento = "Informe a data de nascimento.";
    else if (id < 18) e.nascimento = "O titular precisa ser maior de 18 anos.";
    if (f.nomeMae.trim().length < 5) e.nomeMae = "Nome completo da mãe.";
    if (centavosDeTexto(f.renda || "0") < 100) e.renda = "Informe a renda mensal aproximada.";
    if (f.profissao.trim().length < 2) e.profissao = "Informe a profissão.";
    if (!telefoneValido(f.telefone)) e.telefone = "Celular com DDD.";
    if (soDigitos(f.cep).length !== 8) e.cep = "CEP inválido.";
    if (!f.logradouro.trim()) e.logradouro = "Informe a rua.";
    if (!f.numero.trim()) e.numero = "Informe o número.";
    if (!f.bairro.trim()) e.bairro = "Informe o bairro.";
    if (!f.cidade.trim()) e.cidade = "Informe a cidade.";
    if (!/^[A-Za-z]{2}$/.test(f.uf.trim())) e.uf = "UF";
    if (!f.banco) e.banco = "Escolha o banco.";
    else if (f.banco === "outro" && !/^\d{1,3}$/.test(soDigitos(f.bancoOutro))) e.bancoOutro = "Código de 3 dígitos.";
    if (!/^\d{1,4}$/.test(soDigitos(f.agencia))) e.agencia = "Até 4 números, sem o dígito.";
    if (f.agenciaDv && !/^[0-9Xx]$/.test(f.agenciaDv)) e.agenciaDv = "1 dígito";
    if (!/^\d{1,13}$/.test(soDigitos(f.conta))) e.conta = "Número da conta, sem o dígito.";
    if (!/^[0-9Xx]{1,2}$/.test(f.contaDv)) e.contaDv = "Dígito";
    setErros(e);
    if (Object.keys(e).length) {
      avisar("Confira os campos destacados.", "erro");
      setTimeout(() => document.querySelector("[data-erro]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    }
    return Object.keys(e).length === 0;
  }

  async function enviar() {
    setErroEnvio(null);
    const dados: DadosRecebedor = {
      nome: f.nome.trim(),
      email: f.email.trim().toLowerCase(),
      cpf: soDigitos(f.cpf),
      nascimento: f.nascimento,
      nomeMae: f.nomeMae.trim(),
      rendaMensal: centavosDeTexto(f.renda),
      profissao: f.profissao.trim(),
      telefone: soDigitos(f.telefone),
      endereco: {
        cep: soDigitos(f.cep),
        logradouro: f.logradouro.trim(),
        numero: f.numero.trim(),
        ...(f.complemento.trim() ? { complemento: f.complemento.trim() } : {}),
        bairro: f.bairro.trim(),
        cidade: f.cidade.trim(),
        uf: f.uf.trim().toUpperCase(),
        ...(f.referencia.trim() ? { referencia: f.referencia.trim() } : {}),
      },
      banco: {
        codigo: codigoBanco,
        agencia: soDigitos(f.agencia),
        ...(f.agenciaDv ? { agenciaDv: f.agenciaDv.toUpperCase() } : {}),
        conta: soDigitos(f.conta),
        contaDv: f.contaDv.toUpperCase(),
        tipo: f.tipo,
      },
    };
    try {
      const r = await api.cadastrarRecebedor({ tid, dados });
      avisar(r.recebedor.status === "active" ? "Conta de recebimento ativa!" : "Cadastro enviado! Agora falta a prova de vida.", "sucesso");
      concluido();
    } catch (e) {
      setErroEnvio(mensagemDeErro(e));
      throw e;
    }
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (validar()) setConfirmar(true);
      }}
    >
      <Aviso tom="info" titulo="Por que tantos dados?">
        Para receber dinheiro de vendas, o Banco Central exige que a Pagar.me conheça quem é o dono da conta (regra “conheça seu cliente”). Os dados vão direto para a
        Pagar.me; a diretoria só vê o nome do titular e o banco mascarado.
      </Aviso>

      <Secao titulo="Titular da conta" porque="O responsável pela subsede, pessoa física. A Pagar.me confere nome, CPF e nascimento na Receita Federal.">
        <Campo rotulo="Nome completo" value={f.nome} onChange={(v) => set("nome", v)} erro={erros.nome} maxLength={64} autoComplete="name" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo rotulo="CPF" mascara="cpf" value={f.cpf} onChange={(v) => set("cpf", v)} erro={erros.cpf} />
          <Campo rotulo="Data de nascimento" type="date" value={f.nascimento} onChange={(v) => set("nascimento", v)} erro={erros.nascimento} />
        </div>
        <Campo
          rotulo="Nome da mãe"
          value={f.nomeMae}
          onChange={(v) => set("nomeMae", v)}
          erro={erros.nomeMae}
          maxLength={64}
          dica="Usado para confirmar a identidade, como em qualquer banco."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            rotulo="Renda mensal aproximada"
            mascara="moeda"
            value={f.renda}
            onChange={(v) => set("renda", v)}
            erro={erros.renda}
            dica="Exigência do Banco Central para prevenção à lavagem de dinheiro."
          />
          <Campo rotulo="Profissão" value={f.profissao} onChange={(v) => set("profissao", v)} erro={erros.profissao} maxLength={60} placeholder="Ex.: Comerciante" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo rotulo="E-mail" type="email" value={f.email} onChange={(v) => set("email", v)} erro={erros.email} maxLength={64} />
          <Campo rotulo="Celular" mascara="telefone" value={f.telefone} onChange={(v) => set("telefone", v)} erro={erros.telefone} dica="A Pagar.me pode mandar avisos para este número." />
        </div>
      </Secao>

      <Secao titulo="Endereço do titular" porque="Endereço residencial de quem é dono da conta. Também faz parte do cadastro obrigatório.">
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4">
          <Campo rotulo="CEP" mascara="cep" value={f.cep} onChange={aoMudarCep} erro={erros.cep} dica={buscandoCep ? "Buscando endereço..." : undefined} />
          <Campo rotulo="Rua" value={f.logradouro} onChange={(v) => set("logradouro", v)} erro={erros.logradouro} maxLength={120} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-[140px_1fr] gap-4">
          <Campo rotulo="Número" value={f.numero} onChange={(v) => set("numero", v)} erro={erros.numero} maxLength={12} />
          <Campo rotulo="Complemento" value={f.complemento} onChange={(v) => set("complemento", v)} maxLength={60} placeholder="Opcional" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_90px] gap-4">
          <Campo rotulo="Bairro" value={f.bairro} onChange={(v) => set("bairro", v)} erro={erros.bairro} maxLength={80} />
          <Campo rotulo="Cidade" value={f.cidade} onChange={(v) => set("cidade", v)} erro={erros.cidade} maxLength={64} />
          <Campo rotulo="UF" value={f.uf} onChange={(v) => set("uf", v.toUpperCase().slice(0, 2))} erro={erros.uf} maxLength={2} />
        </div>
        <Campo rotulo="Ponto de referência (opcional)" value={f.referencia} onChange={(v) => set("referencia", v)} maxLength={80} />
      </Secao>

      <Secao
        titulo="Conta bancária"
        porque="É para esta conta que a Pagar.me transfere o valor dos ingressos. Ela precisa estar no CPF informado acima; conta de outra pessoa é recusada."
      >
        <Aviso tom="alerta">A conta precisa estar no CPF do titular. Não use conta de parente, da torcida (CNPJ) ou de terceiros.</Aviso>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Selecao rotulo="Banco" value={f.banco} onChange={(e) => set("banco", e.target.value)} erro={erros.banco}>
            <option value="">Escolha...</option>
            {BANCOS.map((b) => (
              <option key={b.codigo} value={b.codigo}>
                {b.codigo} · {b.nome}
              </option>
            ))}
            <option value="outro">Outro banco</option>
          </Selecao>
          {f.banco === "outro" && (
            <Campo
              rotulo="Código do banco"
              inputMode="numeric"
              value={f.bancoOutro}
              onChange={(v) => set("bancoOutro", soDigitos(v).slice(0, 3))}
              erro={erros.bancoOutro}
              dica="3 números. Aparece no app do banco ou no extrato."
            />
          )}
        </div>
        <div className="grid grid-cols-[1fr_100px] gap-4">
          <Campo rotulo="Agência" inputMode="numeric" value={f.agencia} onChange={(v) => set("agencia", soDigitos(v).slice(0, 4))} erro={erros.agencia} dica="Sem o dígito" />
          <Campo rotulo="Dígito" value={f.agenciaDv} onChange={(v) => set("agenciaDv", v.replace(/[^0-9Xx]/g, "").slice(0, 1))} erro={erros.agenciaDv} dica="Se tiver" />
        </div>
        <div className="grid grid-cols-[1fr_100px] gap-4">
          <Campo rotulo="Conta" inputMode="numeric" value={f.conta} onChange={(v) => set("conta", soDigitos(v).slice(0, 13))} erro={erros.conta} dica="Sem o dígito" />
          <Campo rotulo="Dígito" value={f.contaDv} onChange={(v) => set("contaDv", v.replace(/[^0-9Xx]/g, "").slice(0, 2))} erro={erros.contaDv} />
        </div>
        <OpcoesCartao
          nome="Tipo de conta"
          valor={f.tipo}
          onChange={(v) => set("tipo", v)}
          opcoes={[
            { valor: "checking", titulo: "Conta corrente", icone: "cartao" },
            { valor: "savings", titulo: "Poupança", icone: "dinheiro" },
          ]}
        />
      </Secao>

      {erroEnvio && <Aviso tom="perigo" titulo="A Pagar.me não aceitou o cadastro">{erroEnvio}</Aviso>}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
        <Botao variante="fantasma" onClick={cancelar}>
          Cancelar
        </Botao>
        <Botao type="submit" icone="cadeado" tamanho="lg">
          Revisar e enviar
        </Botao>
      </div>

      <Confirmar aberto={confirmar} fechar={() => setConfirmar(false)} titulo="Enviar cadastro para a Pagar.me?" rotulo="Enviar cadastro" acao={enviar}>
        <p className="mb-3">Confira antes de enviar. Depois do envio, para trocar a conta é preciso falar com a Pagar.me.</p>
        <div className="rounded-2xl border border-linha bg-superficie-2 px-4 py-1 text-sm">
          <Linha rotulo="Titular">{f.nome}</Linha>
          <Linha rotulo="CPF">{mascaraCpf(f.cpf)}</Linha>
          <Linha rotulo="Banco">
            {codigoBanco} · {nomeBanco(codigoBanco)}
          </Linha>
          <Linha rotulo="Agência / conta">
            {f.agencia}
            {f.agenciaDv && `-${f.agenciaDv}`} / {f.conta}-{f.contaDv} ({f.tipo === "checking" ? "corrente" : "poupança"})
          </Linha>
        </div>
        <p className="mt-3">Em seguida, o titular faz a prova de vida pelo celular.</p>
      </Confirmar>
    </form>
  );
}
