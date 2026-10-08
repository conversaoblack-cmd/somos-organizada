import { moduloAtivo } from "./Portao";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  signOut,
  updateProfile,
} from "firebase/auth";
import { ref, uploadBytes } from "firebase/storage";
import { auth } from "@/lib/firebase";
import { storage } from "@/lib/armazenamento";
import { api, mensagemDeErro } from "@/lib/api";
import { buscarCep } from "@/lib/servicos";
import {
  cpfValido,
  emailValido,
  mascaraCpf,
  mascaraTelefone,
  moeda,
  periodicidade,
  periodicidadeCurta,
  soDigitos,
  taxa,
  telefoneValido,
} from "@/lib/formatos";
import { useUsuario } from "@/hooks/dados";
import { useMinhaFicha, useTorcida } from "@/hooks/torcida";
import { Login } from "@/componentes/Login";
import { Aviso, Botao, BotaoLink, Campo, Carregando, Cartao, cx, Etapas, Icone, OpcoesCartao, Selecao, Selo, Vazio } from "@/ui";
import { CabecalhoTorcida, LinhaValor, usePlanosAtivos, useSedes } from "./comum";
import { cartaoVazio, FormCartao, prepararCartao, validarCartao, type EstadoCartao } from "./FormCartao";

const ETAPAS = ["Plano", "Sua conta", "Seus dados", "Pagamento"];
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

interface Dados {
  nome: string;
  cpf: string;
  nascimento: string;
  telefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  sedeId: string;
}

/** Reduz a foto para 600x800 (3x4) em JPEG, recortando ao centro. */
async function prepararFoto(arquivo: File): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const alvoW = 600;
  const alvoH = 800;
  const escala = Math.max(alvoW / img.width, alvoH / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  const c = document.createElement("canvas");
  c.width = alvoW;
  c.height = alvoH;
  c.getContext("2d")!.drawImage(img, (alvoW - w) / 2, (alvoH - h) / 2, w, h);
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error("Falha ao processar a foto"))), "image/jpeg", 0.85));
}

export default function CheckoutSocio() {
  const { planoId: planoUrl } = useParams();
  const { tid, torcida } = useTorcida();
  const navegar = useNavigate();
  const usuario = useUsuario();
  const { ficha, carregando: carregandoFicha } = useMinhaFicha(tid);
  const planos = usePlanosAtivos(tid);
  const sedes = useSedes(tid);

  const [etapa, setEtapa] = useState(0);
  const [planoId, setPlanoId] = useState<string | null>(planoUrl ?? null);
  const [conta, setConta] = useState({ nome: "", email: "", senha: "" });
  const [modoConta, setModoConta] = useState<"criar" | "entrar">("criar");
  const [dados, setDados] = useState<Dados>({
    nome: "", cpf: "", nascimento: "", telefone: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", sedeId: "",
  });
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [metodo, setMetodo] = useState<"pix" | "cartao">("pix");
  const [cartao, setCartao] = useState<EstadoCartao>(cartaoVazio);
  const [aceite, setAceite] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  const plano = planos.dados.find((p) => p.id === planoId) ?? null;
  const logado = !!usuario && !usuario.isAnonymous;
  const pct = torcida.taxaServicoPct;

  useEffect(() => {
    if (!planoId && planos.dados.length) setPlanoId((planos.dados.find((p) => p.destaque) ?? planos.dados[0]).id);
  }, [planos.dados, planoId]);
  useEffect(() => {
    if (plano) setMetodo((m) => (m === "pix" && !(plano.pix && torcida.pagamentos.pix) ? "cartao" : m));
  }, [plano, torcida.pagamentos.pix]);
  useEffect(() => {
    if (!dados.sedeId && sedes.dados.length) setDados((d) => ({ ...d, sedeId: torcida.sedePrincipalId }));
  }, [sedes.dados, dados.sedeId, torcida.sedePrincipalId]);
  // Reaproveita dados de uma ficha anterior (ex.: pagamento não concluído)
  useEffect(() => {
    if (!ficha) return;
    setDados((d) =>
      d.cpf
        ? d
        : {
            nome: ficha.nome, cpf: mascaraCpf(ficha.cpf), nascimento: ficha.nascimento, telefone: mascaraTelefone(ficha.telefone),
            cep: ficha.endereco.cep, logradouro: ficha.endereco.logradouro, numero: ficha.endereco.numero, complemento: ficha.endereco.complemento ?? "",
            bairro: ficha.endereco.bairro, cidade: ficha.endereco.cidade, uf: ficha.endereco.uf, sedeId: ficha.sedeId,
          },
    );
  }, [ficha]);
  useEffect(() => {
    if (logado && usuario?.displayName) setDados((d) => (d.nome ? d : { ...d, nome: usuario.displayName ?? "" }));
  }, [logado, usuario]);

  const rolarErro = () => requestAnimationFrame(() => document.querySelector("[data-erro]")?.scrollIntoView({ behavior: "smooth", block: "center" }));

  async function criarConta() {
    const e: Record<string, string> = {};
    if (conta.nome.trim().split(/\s+/).length < 2) e.nome = "Nome e sobrenome.";
    if (!emailValido(conta.email)) e.email = "E-mail inválido.";
    if (conta.senha.length < 8) e.senha = "Mínimo de 8 caracteres.";
    setErros(e);
    if (Object.keys(e).length) return;
    setOcupado(true);
    setErro(null);
    try {
      const atual = auth.currentUser;
      const cred =
        atual?.isAnonymous
          ? await linkWithCredential(atual, EmailAuthProvider.credential(conta.email.trim(), conta.senha)) // mantém ingressos já comprados
          : await createUserWithEmailAndPassword(auth, conta.email.trim(), conta.senha);
      await updateProfile(cred.user, { displayName: conta.nome.trim() });
      setDados((d) => ({ ...d, nome: d.nome || conta.nome.trim() }));
      setEtapa(2);
    } catch (err) {
      const c = String((err as { code?: string }).code ?? "");
      setErro(
        /email-already-in-use|credential-already-in-use/.test(c)
          ? "Este e-mail já tem conta. Use “Já tenho conta” para entrar."
          : /weak-password/.test(c)
            ? "Senha fraca. Use pelo menos 8 caracteres."
            : mensagemDeErro(err),
      );
    } finally {
      setOcupado(false);
    }
  }

  async function cep(v: string) {
    setDados((d) => ({ ...d, cep: v }));
    if (soDigitos(v).length === 8) {
      const e = await buscarCep(v);
      if (e) setDados((d) => ({ ...d, logradouro: e.logradouro || d.logradouro, bairro: e.bairro || d.bairro, cidade: e.cidade || d.cidade, uf: e.uf || d.uf }));
    }
  }

  function validarDados() {
    const e: Record<string, string> = {};
    if (dados.nome.trim().split(/\s+/).length < 2) e.nome = "Nome completo.";
    if (!cpfValido(dados.cpf)) e.cpf = "CPF inválido.";
    const nasc = new Date(dados.nascimento);
    if (!dados.nascimento || Number.isNaN(nasc.getTime()) || nasc > new Date() || nasc.getFullYear() < 1900) e.nascimento = "Data inválida.";
    if (!telefoneValido(dados.telefone)) e.telefone = "Celular com DDD.";
    if (soDigitos(dados.cep).length !== 8) e.cep = "CEP inválido.";
    if (!dados.logradouro.trim()) e.logradouro = "Obrigatório.";
    if (!dados.numero.trim()) e.numero = "Obrigatório.";
    if (!dados.bairro.trim()) e.bairro = "Obrigatório.";
    if (!dados.cidade.trim()) e.cidade = "Obrigatório.";
    if (!UFS.includes(dados.uf)) e.uf = "UF";
    if (!dados.sedeId) e.sedeId = "Escolha sua sede.";
    setErros(e);
    if (Object.keys(e).length) rolarErro();
    return !Object.keys(e).length;
  }

  async function escolherFoto(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErro("Escolha uma imagem (JPG ou PNG).");
    if (f.size > 15 * 1024 * 1024) return setErro("Foto muito grande (máx. 15 MB).");
    try {
      const blob = await prepararFoto(f);
      setFoto({ blob, url: URL.createObjectURL(blob) });
      setErro(null);
    } catch {
      setErro("Não foi possível ler esta foto. Tente outra.");
    }
  }

  async function concluir() {
    if (!plano || !usuario) return;
    setErro(null);
    if (!aceite) return setErro("Confirme que leu e aceita as regras da associação.");
    if (metodo === "cartao") {
      const e = validarCartao(cartao);
      setErros(e);
      if (Object.keys(e).length) return;
    }
    setOcupado(true);
    try {
      let fotoPath: string | undefined;
      if (foto) {
        fotoPath = `torcidas/${tid}/socios/${usuario.uid}/foto.jpg`;
        await uploadBytes(ref(storage, fotoPath), foto.blob, { contentType: "image/jpeg" });
      }
      const dadosCartao = metodo === "cartao" ? await prepararCartao(torcida.pagamentos.chavePublica!, cartao) : undefined;
      const r = await api.aderirSocio({
        tid,
        planoId: plano.id,
        sedeId: dados.sedeId,
        metodo,
        fotoPath,
        dados: {
          nome: dados.nome.trim(),
          cpf: soDigitos(dados.cpf),
          telefone: soDigitos(dados.telefone),
          nascimento: dados.nascimento,
          endereco: {
            cep: soDigitos(dados.cep), logradouro: dados.logradouro.trim(), numero: dados.numero.trim(),
            complemento: dados.complemento.trim() || undefined, bairro: dados.bairro.trim(), cidade: dados.cidade.trim(), uf: dados.uf,
          },
        },
        cartao: dadosCartao,
      });
      if (r.modo === "pedido") navegar(`/${torcida.slug}/pedido/${r.pedidoId}`);
      else setConcluido(r.status);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  // ── Estados especiais ─────────────────────────────────
  if (planos.carregando || carregandoFicha) return <Moldura><Carregando /></Moldura>;
  if (!planos.dados.length || !moduloAtivo(torcida, "socios")) {
    return (
      <Moldura>
        <Vazio icone="escudo" titulo="Associação ainda não disponível" acao={<BotaoLink to={`/${torcida.slug}`}>Voltar</BotaoLink>}>
          A diretoria está preparando os planos.
        </Vazio>
      </Moldura>
    );
  }
  if (concluido) {
    return (
      <Moldura>
        <div className="text-center py-8 space-y-5 animate-surgir">
          <div className="mx-auto size-20 rounded-full bg-primaria/15 text-primaria-texto grid place-items-center">
            <Icone nome="escudo" className="size-10" />
          </div>
          <h1 className="text-3xl font-bold">{concluido === "em_analise" ? "Pagamento aprovado!" : "Bem-vindo, sócio!"}</h1>
          <p className="text-texto-2">
            {concluido === "em_analise"
              ? "Sua ficha está com a diretoria para aprovação. A cobrança automática já está ativa no seu cartão."
              : "Sua carteirinha digital já está disponível. A mensalidade será cobrada automaticamente no cartão."}
          </p>
          <BotaoLink to={`/${torcida.slug}/socio`} tamanho="lg" iconeDireita="setaDireita">
            Ver minha carteirinha
          </BotaoLink>
        </div>
      </Moldura>
    );
  }
  if (ficha && ["ativo", "em_analise", "suspenso", "inadimplente"].includes(ficha.status)) {
    return (
      <Moldura>
        <Vazio icone="escudo" titulo="Você já é sócio" acao={<BotaoLink to={`/${torcida.slug}/socio`}>Ir para minha conta</BotaoLink>}>
          Matrícula {ficha.matricula ?? "em processamento"} · {ficha.planoNome}
        </Vazio>
      </Moldura>
    );
  }

  const valores = plano ? { base: plano.valor, taxa: taxa(plano.valor, pct) } : { base: 0, taxa: 0 };

  return (
    <Moldura>
      <div className="mb-8">
        <Link to={`/${torcida.slug}?aba=socios`} className="text-sm text-texto-2 hover:text-texto inline-flex items-center gap-1">
          <Icone nome="setaEsquerda" className="size-4" /> Planos
        </Link>
        <h1 className="font-display uppercase text-3xl sm:text-4xl mt-3">Associe-se à {torcida.nome}</h1>
      </div>
      <Etapas etapas={ETAPAS} atual={etapa} />

      <div className="grid lg:grid-cols-[1fr_340px] gap-8 mt-8 items-start">
        <div className="min-w-0">
          {/* 1. PLANO */}
          {etapa === 0 && (
            <div className="space-y-5 animate-surgir">
              <OpcoesCartao
                nome="Plano"
                colunas={1}
                valor={planoId}
                onChange={setPlanoId}
                opcoes={planos.dados.map((p) => ({
                  valor: p.id,
                  titulo: (
                    <span className="flex flex-wrap items-center gap-2">
                      {p.nome} {p.destaque && <Selo tom="primaria">Mais escolhido</Selo>}
                    </span>
                  ),
                  descricao: `${moeda(p.valor)} ${periodicidade(p.intervalo, p.intervaloQtd)} + ${moeda(taxa(p.valor, pct))} de taxa`,
                  extra: p.beneficios?.length ? <span className="block text-xs text-texto-3 mt-2">{p.beneficios.slice(0, 3).join(" · ")}</span> : undefined,
                }))}
              />
              <Botao largo tamanho="lg" iconeDireita="setaDireita" disabled={!plano} onClick={() => setEtapa(logado ? 2 : 1)}>
                Continuar
              </Botao>
            </div>
          )}

          {/* 2. CONTA */}
          {etapa === 1 && (
            <div className="space-y-5 animate-surgir">
              {logado ? (
                <Cartao className="p-5 flex items-center gap-4">
                  <Icone nome="checkCirculo" className="size-6 text-sucesso" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">Conectado</p>
                    <p className="text-sm text-texto-2 truncate">{usuario?.email}</p>
                  </div>
                  <Botao variante="fantasma" tamanho="sm" onClick={() => signOut(auth)}>
                    Trocar
                  </Botao>
                </Cartao>
              ) : modoConta === "entrar" ? (
                <div className="[&>div]:max-w-none">
                  <Login
                    titulo="Entrar"
                    subtitulo="Use sua conta para continuar a associação."
                    rodape={
                      <button type="button" className="font-semibold text-primaria-texto" onClick={() => setModoConta("criar")}>
                        Criar uma conta nova
                      </button>
                    }
                  />
                </div>
              ) : (
                <Cartao className="p-6 space-y-4">
                  <div>
                    <h2 className="text-xl font-bold">Crie seu acesso</h2>
                    <p className="text-sm text-texto-2">É com ele que você abre sua carteirinha e gerencia a assinatura.</p>
                  </div>
                  <Campo rotulo="Nome completo" value={conta.nome} onChange={(v) => setConta({ ...conta, nome: v })} erro={erros.nome} autoComplete="name" />
                  <Campo rotulo="E-mail" type="email" value={conta.email} onChange={(v) => setConta({ ...conta, email: v })} erro={erros.email} autoComplete="email" />
                  <Campo rotulo="Senha" type="password" value={conta.senha} onChange={(v) => setConta({ ...conta, senha: v })} erro={erros.senha} autoComplete="new-password" dica="Mínimo de 8 caracteres." />
                  {erro && <Aviso tom="perigo">{erro}</Aviso>}
                  <Botao largo tamanho="lg" carregando={ocupado} onClick={criarConta} iconeDireita="setaDireita">
                    Criar conta e continuar
                  </Botao>
                  <button type="button" className="w-full text-sm text-texto-2 hover:text-texto" onClick={() => setModoConta("entrar")}>
                    Já tenho conta
                  </button>
                </Cartao>
              )}
              <div className="flex gap-3">
                <Botao aria-label="Voltar" className="shrink-0 px-4 sm:px-7" variante="contorno" tamanho="lg" icone="setaEsquerda" onClick={() => setEtapa(0)}>
                  <span className="hidden sm:inline">Voltar</span>
                </Botao>
                {logado && (
                  <Botao largo tamanho="lg" iconeDireita="setaDireita" onClick={() => setEtapa(2)}>
                    Continuar
                  </Botao>
                )}
              </div>
            </div>
          )}

          {/* 3. DADOS */}
          {etapa === 2 && (
            <div className="space-y-6 animate-surgir">
              <section className="space-y-4">
                <h2 className="text-lg font-bold">Dados pessoais</h2>
                <div className="flex gap-4 items-center">
                  <button
                    type="button"
                    onClick={() => inputFoto.current?.click()}
                    className="relative shrink-0 w-24 aspect-[3/4] rounded-2xl border-2 border-dashed border-linha-forte overflow-hidden grid place-items-center hover:border-primaria transition-colors"
                    aria-label="Escolher foto 3x4"
                  >
                    {foto ? <img src={foto.url} alt="Sua foto" className="absolute inset-0 size-full object-cover" /> : <Icone nome="camera" className="size-7 text-texto-3" />}
                  </button>
                  <div className="text-sm">
                    <p className="font-semibold">Foto 3x4 para a carteirinha</p>
                    <p className="text-texto-3">Rosto de frente, fundo claro. Você pode tirar agora com o celular.</p>
                    <button type="button" className="text-primaria-texto font-semibold mt-1" onClick={() => inputFoto.current?.click()}>
                      {foto ? "Trocar foto" : "Adicionar foto"}
                    </button>
                  </div>
                  <input ref={inputFoto} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => escolherFoto(e.target.files?.[0])} />
                </div>
                <Campo rotulo="Nome completo" value={dados.nome} onChange={(v) => setDados({ ...dados, nome: v })} erro={erros.nome} autoComplete="name" />
                <div className="grid sm:grid-cols-2 gap-3">
                  <Campo rotulo="CPF" mascara="cpf" value={dados.cpf} onChange={(v) => setDados({ ...dados, cpf: v })} erro={erros.cpf} />
                  <Campo rotulo="Data de nascimento" type="date" value={dados.nascimento} onChange={(v) => setDados({ ...dados, nascimento: v })} erro={erros.nascimento} />
                </div>
                <Campo rotulo="Celular (WhatsApp)" mascara="telefone" value={dados.telefone} onChange={(v) => setDados({ ...dados, telefone: v })} erro={erros.telefone} autoComplete="tel" />
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-bold">Sua sede</h2>
                <Selecao rotulo="A qual sede ou distrito você pertence?" value={dados.sedeId} onChange={(e) => setDados({ ...dados, sedeId: e.target.value })} erro={erros.sedeId}>
                  {sedes.dados.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </Selecao>
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-bold">Endereço</h2>
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <Campo rotulo="CEP" mascara="cep" value={dados.cep} onChange={cep} erro={erros.cep} autoComplete="postal-code" />
                  <Campo rotulo="Número" value={dados.numero} onChange={(v) => setDados({ ...dados, numero: v })} erro={erros.numero} />
                </div>
                <Campo rotulo="Rua" value={dados.logradouro} onChange={(v) => setDados({ ...dados, logradouro: v })} erro={erros.logradouro} />
                <div className="grid sm:grid-cols-2 gap-3">
                  <Campo rotulo="Complemento" value={dados.complemento} onChange={(v) => setDados({ ...dados, complemento: v })} />
                  <Campo rotulo="Bairro" value={dados.bairro} onChange={(v) => setDados({ ...dados, bairro: v })} erro={erros.bairro} />
                </div>
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  <Campo rotulo="Cidade" value={dados.cidade} onChange={(v) => setDados({ ...dados, cidade: v })} erro={erros.cidade} />
                  <Selecao rotulo="UF" value={dados.uf} onChange={(e) => setDados({ ...dados, uf: e.target.value })} erro={erros.uf}>
                    <option value="">—</option>
                    {UFS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </Selecao>
                </div>
              </section>
              {erro && <Aviso tom="perigo">{erro}</Aviso>}
              <div className="flex gap-3">
                <Botao aria-label="Voltar" className="shrink-0 px-4 sm:px-7" variante="contorno" tamanho="lg" icone="setaEsquerda" onClick={() => setEtapa(logado ? 0 : 1)}>
                  <span className="hidden sm:inline">Voltar</span>
                </Botao>
                <Botao largo tamanho="lg" iconeDireita="setaDireita" onClick={() => validarDados() && setEtapa(3)}>
                  Ir para pagamento
                </Botao>
              </div>
            </div>
          )}

          {/* 4. PAGAMENTO */}
          {etapa === 3 && plano && (
            <div className="space-y-5 animate-surgir">
              <OpcoesCartao
                nome="Forma de pagamento"
                valor={metodo}
                onChange={setMetodo}
                opcoes={[
                  ...(plano.pix && torcida.pagamentos.pix
                    ? [{ valor: "pix" as const, titulo: "Pix", descricao: "Você recebe a cobrança de cada período e paga pelo app do banco.", icone: "pix" as const }]
                    : []),
                  ...(plano.cartao && torcida.pagamentos.cartao
                    ? [{ valor: "cartao" as const, titulo: "Cartão de crédito", descricao: "Cobrança automática a cada período. Sem preocupação.", icone: "cartao" as const, extra: <Selo tom="sucesso" className="mt-2">Mais prático</Selo> }]
                    : []),
                ]}
              />
              {metodo === "cartao" && <FormCartao valor={cartao} onChange={setCartao} erros={erros} />}
              <label className="flex gap-3 items-start text-sm cursor-pointer">
                <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-1 size-4 accent-[var(--color-primaria)]" />
                <span className="text-texto-2">
                  Li e aceito o estatuto e as regras de associação da {torcida.nome}
                  {metodo === "cartao" ? `, e autorizo a cobrança automática de ${moeda(valores.base + valores.taxa)} ${periodicidade(plano.intervalo, plano.intervaloQtd)} até eu cancelar` : ""}.
                </span>
              </label>
              {erro && <Aviso tom="perigo" titulo="Não foi possível concluir">{erro}</Aviso>}
              <div className="flex gap-3">
                <Botao aria-label="Voltar" className="shrink-0 px-4 sm:px-7" variante="contorno" tamanho="lg" icone="setaEsquerda" disabled={ocupado} onClick={() => setEtapa(2)}>
                  <span className="hidden sm:inline">Voltar</span>
                </Botao>
                <Botao largo tamanho="lg" carregando={ocupado} icone={metodo === "pix" ? "pix" : "cadeado"} onClick={concluir}>
                  {metodo === "pix" ? "Gerar Pix" : "Assinar"} · {moeda(valores.base + valores.taxa)}
                </Botao>
              </div>
            </div>
          )}
        </div>

        {/* Resumo */}
        {plano && (
          <aside className="lg:sticky lg:top-24 order-first lg:order-none">
            <Cartao className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className="size-11 rounded-2xl bg-primaria/15 text-primaria-texto grid place-items-center">
                  <Icone nome="escudo" className="size-6" />
                </span>
                <div>
                  <p className="font-bold">{plano.nome}</p>
                  <p className="text-sm text-texto-3">Renova {periodicidade(plano.intervalo, plano.intervaloQtd)}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <LinhaValor rotulo="Plano" valor={moeda(valores.base)} />
                <LinhaValor rotulo={`Taxa de serviço (${pct}%)`} valor={moeda(valores.taxa)} sutil />
                <LinhaValor rotulo={`Total ${periodicidadeCurta(plano.intervalo, plano.intervaloQtd)}`} valor={moeda(valores.base + valores.taxa)} forte />
              </div>
              {!!plano.beneficios?.length && (
                <ul className={cx("space-y-2 pt-3 border-t border-linha", etapa > 0 && "hidden lg:block")}>
                  {plano.beneficios.map((b) => (
                    <li key={b} className="flex gap-2 text-sm text-texto-2">
                      <Icone nome="check" className="size-4 text-primaria-texto shrink-0 mt-0.5" /> {b}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </aside>
        )}
      </div>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <CabecalhoTorcida />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">{children}</main>
    </div>
  );
}
