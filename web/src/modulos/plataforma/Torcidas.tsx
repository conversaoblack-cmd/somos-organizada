import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { api, mensagemDeErro } from "@/lib/api";
import { emailValido, moeda, relativo } from "@/lib/formatos";
import { copiarTexto } from "@/lib/servicos";
import {
  Aviso,
  Botao,
  BotaoIcone,
  CabecalhoPagina,
  Campo,
  Cartao,
  Carregando,
  Gaveta,
  Icone,
  Selo,
  Vazio,
  useToast,
} from "@/ui";
import {
  alertasDaTorcida,
  gmv,
  numero,
  ROTULO_AMBIENTE,
  ROTULO_PLANO_SAAS,
  TOM_AMBIENTE,
  ROTULO_SITUACAO_SAAS,
  ROTULO_STATUS_TORCIDA,
  TOM_SITUACAO_SAAS,
  SLUG_VALIDO,
  slugDoNome,
  TOM_STATUS_TORCIDA,
  useResumo,
  type LinhaTorcida,
} from "./comum";

export function SeloPagamentos({ t }: { t: LinhaTorcida }) {
  if (!t.pagamentos.configurado) return <Selo tom="perigo">Não configurado</Selo>;
  return (
    <span className="inline-flex flex-col gap-1">
      <Selo tom={TOM_AMBIENTE[t.pagamentos.ambiente ?? ""] ?? "alerta"} ponto>
        {ROTULO_AMBIENTE[t.pagamentos.ambiente ?? ""] ?? "—"}
      </Selo>
      <span className="text-xs text-texto-3">
        {t.pagamentos.webhookRecebidoEm ? `webhook ${relativo(t.pagamentos.webhookRecebidoEm)}` : "nenhum webhook"}
      </span>
    </span>
  );
}

/** Plano Somos Organizada + situação da mensalidade. */
export function SeloPlano({ t }: { t: LinhaTorcida }) {
  if (!t.saas) return <span className="text-xs text-texto-3">{t.publicada ? "Sem assinatura" : "Ainda não publicou"}</span>;
  return (
    <span className="inline-flex flex-col gap-1 items-start">
      <span className="text-sm">{ROTULO_PLANO_SAAS[t.saas.plano] ?? t.saas.plano}</span>
      <Selo tom={TOM_SITUACAO_SAAS[t.saas.situacao]}>{ROTULO_SITUACAO_SAAS[t.saas.situacao]}</Selo>
    </span>
  );
}

/** Publicada sim/não + módulos ligados. */
export function SeloSite({ t }: { t: LinhaTorcida }) {
  return (
    <span className="inline-flex flex-col gap-1 items-start">
      <Selo tom={t.publicada ? "sucesso" : "neutro"} ponto>
        {t.publicada ? "No ar" : "Não publicada"}
      </Selo>
      <span className="text-xs text-texto-3">
        {[t.modulos?.eventos !== false && "Eventos", t.modulos?.socios !== false && "Sócios"].filter(Boolean).join(" + ") || "Nenhum módulo"}
      </span>
    </span>
  );
}

export default function Torcidas() {
  const { resumo, carregando, erro, recarregar } = useResumo();
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState(false);
  const navegar = useNavigate();

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (resumo?.torcidas ?? [])
      .filter((t) => !q || t.nome.toLowerCase().includes(q) || t.slug.includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [resumo, busca]);

  return (
    <>
      <CabecalhoPagina
        titulo="Torcidas"
        descricao="Status técnico, pagamentos e contrato de cada torcida."
        acoes={
          <>
            <Botao variante="contorno" tamanho="sm" icone="atualizar" carregando={carregando} onClick={recarregar}>
              Atualizar
            </Botao>
            <Botao tamanho="sm" icone="mais" onClick={() => setNova(true)}>
              Nova torcida
            </Botao>
          </>
        }
      />
      {erro && <Aviso tom="perigo" className="mb-4">{erro}</Aviso>}
      <Campo icone="busca" placeholder="Buscar por nome ou endereço" value={busca} onChange={setBusca} className="mb-4 max-w-md" aria-label="Buscar torcida" />

      {!resumo && carregando ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Cartao>
          <Vazio icone="bandeira" titulo={busca ? "Nenhuma torcida encontrada" : "Nenhuma torcida ainda"} acao={!busca && <Botao icone="mais" onClick={() => setNova(true)}>Nova torcida</Botao>} />
        </Cartao>
      ) : (
        <>
          {/* Desktop: tabela */}
          <Cartao className="hidden lg:block overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-texto-3 border-b border-linha">
                <tr>
                  <th className="px-5 py-3 font-medium">Torcida</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Site</th>
                  <th className="px-3 py-3 font-medium">Pagamentos</th>
                  <th className="px-3 py-3 font-medium text-right">Sócios ativos</th>
                  <th className="px-3 py-3 font-medium text-right">Receita do mês</th>
                  <th className="px-3 py-3 font-medium">Plano Somos</th>
                  <th className="px-3 py-3 font-medium text-right">Chamados</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {lista.map((t) => {
                  const alertas = alertasDaTorcida(t);
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-linha last:border-0 hover:bg-superficie-2/60 cursor-pointer"
                      onClick={() => navegar(`/plataforma/torcidas/${t.id}`)}
                    >
                      <td className="px-5 py-3.5">
                        <Link to={`/plataforma/torcidas/${t.id}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
                          {t.nome}
                        </Link>
                        <p className="text-xs text-texto-3">/{t.slug}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        <Selo tom={TOM_STATUS_TORCIDA[t.status]}>{ROTULO_STATUS_TORCIDA[t.status]}</Selo>
                      </td>
                      <td className="px-3 py-3.5">
                        <SeloSite t={t} />
                      </td>
                      <td className="px-3 py-3.5">
                        <SeloPagamentos t={t} />
                      </td>
                      <td className="px-3 py-3.5 text-right numeros">{numero(t.geral.socios?.ativo)}</td>
                      <td className="px-3 py-3.5 text-right numeros">{moeda(gmv(t.mes))}</td>
                      <td className="px-3 py-3.5">
                        <SeloPlano t={t} />
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        {t.chamadosAbertos ? <Selo tom="alerta">{t.chamadosAbertos}</Selo> : <span className="text-texto-3">0</span>}
                      </td>
                      <td className="px-3 py-3.5 text-right whitespace-nowrap">
                        {alertas.length > 0 && (
                          <span title={alertas.map((a) => a.titulo).join(" · ")} className="inline-flex text-alerta align-middle mr-1">
                            <Icone nome="alerta" className="size-5" />
                          </span>
                        )}
                        <Link
                          to={`/plataforma/torcidas/${t.id}/depuracao`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-grid place-items-center size-9 rounded-xl text-texto-2 hover:text-texto hover:bg-superficie-3 align-middle"
                          aria-label={`Depuração de ${t.nome}`}
                          title="Depuração"
                        >
                          <Icone nome="bug" className="size-5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Cartao>

          {/* Celular: cartões */}
          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {lista.map((t) => {
              const alertas = alertasDaTorcida(t);
              return (
                <Link key={t.id} to={`/plataforma/torcidas/${t.id}`} className="block">
                  <Cartao className="p-4 hover:border-linha-forte transition-colors h-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{t.nome}</p>
                        <p className="text-xs text-texto-3">/{t.slug}</p>
                      </div>
                      <Selo tom={TOM_STATUS_TORCIDA[t.status]}>{ROTULO_STATUS_TORCIDA[t.status]}</Selo>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mt-4 text-sm">
                      <div>
                        <dt className="text-xs text-texto-3">Receita do mês</dt>
                        <dd className="font-semibold numeros">{moeda(gmv(t.mes))}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-texto-3">Sócios ativos</dt>
                        <dd className="font-semibold numeros">{numero(t.geral.socios?.ativo)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-texto-3 mb-1">Plano Somos</dt>
                        <dd>
                          <SeloPlano t={t} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-texto-3">Chamados abertos</dt>
                        <dd className="numeros">{t.chamadosAbertos}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-texto-3 mb-1">Site</dt>
                        <dd>
                          <SeloSite t={t} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-texto-3 mb-1">Pagamentos</dt>
                        <dd>
                          <SeloPagamentos t={t} />
                        </dd>
                      </div>
                    </dl>
                    {alertas.length > 0 && (
                      <p className="mt-3 text-xs text-alerta flex items-center gap-1.5">
                        <Icone nome="alerta" className="size-4" />
                        {alertas.map((a) => a.titulo).join(" · ")}
                      </p>
                    )}
                  </Cartao>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <NovaTorcida
        aberto={nova}
        fechar={() => setNova(false)}
        aoCriar={() => void recarregar()}
        slugsUsados={(resumo?.torcidas ?? []).map((t) => t.slug)}
      />
    </>
  );
}

interface Criada {
  torcidaId: string;
  slug: string;
  nome: string;
  diretor: string;
  linkDefinirSenha: string | null;
}

function NovaTorcida({ aberto, fechar, aoCriar, slugsUsados }: { aberto: boolean; fechar: () => void; aoCriar: () => void; slugsUsados: string[] }) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [sede, setSede] = useState("");
  const [diretorNome, setDiretorNome] = useState("");
  const [diretorEmail, setDiretorEmail] = useState("");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criada, setCriada] = useState<Criada | null>(null);

  const slugFinal = slugEditado ? slug : slugDoNome(nome);
  const erros = {
    nome: nome.trim().length < 2 ? "Informe o nome da torcida." : null,
    slug: !SLUG_VALIDO.test(slugFinal)
      ? "Use 3 a 40 caracteres: letras minúsculas, números e hífen (sem começar ou terminar com hífen)."
      : slugsUsados.includes(slugFinal)
        ? "Este endereço já está em uso."
        : null,
    diretorNome: diretorNome.trim().length < 2 ? "Informe o nome do diretor." : null,
    diretorEmail: !emailValido(diretorEmail) ? "E-mail inválido." : null,
  };
  const valido = !Object.values(erros).some(Boolean);

  function limpar() {
    setNome("");
    setSlug("");
    setSlugEditado(false);
    setSede("");
    setDiretorNome("");
    setDiretorEmail("");
    setTentou(false);
    setErro(null);
    setCriada(null);
  }
  function sair() {
    fechar();
    if (criada) limpar();
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    setErro(null);
    if (!valido) return;
    setSalvando(true);
    try {
      const r = await api.criarTorcida({
        nome: nome.trim(),
        slug: slugFinal,
        nomeSedePrincipal: sede.trim() || undefined,
        diretor: { nome: diretorNome.trim(), email: diretorEmail.trim().toLowerCase() },
      });
      setCriada({ ...r, nome: nome.trim(), diretor: diretorNome.trim() });
      aoCriar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Gaveta
      aberto={aberto}
      fechar={sair}
      titulo={criada ? "Torcida criada" : "Nova torcida"}
      rodape={
        criada ? (
          <div className="flex gap-2">
            <Botao variante="contorno" onClick={limpar} icone="mais">
              Criar outra
            </Botao>
            <Botao className="flex-1" onClick={sair}>
              Concluir
            </Botao>
          </div>
        ) : (
          <Botao type="submit" form="form-nova-torcida" largo carregando={salvando} icone="check">
            Criar torcida
          </Botao>
        )
      }
    >
      {criada ? (
        <ResultadoCriacao c={criada} />
      ) : (
        <form id="form-nova-torcida" onSubmit={enviar} className="space-y-5" noValidate>
          <Campo rotulo="Nome da torcida" value={nome} onChange={setNome} placeholder="Ex.: Torcida Jovem do Leão" erro={tentou && erros.nome} autoFocus />
          <Campo
            rotulo="Endereço (slug)"
            value={slugFinal}
            onChange={(v) => {
              setSlugEditado(true);
              setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40));
            }}
            erro={(tentou || slugEditado) && erros.slug}
            dica={`${location.origin}/${slugFinal || "endereco"}`}
            icone="link"
          />
          <Campo rotulo="Nome da sede principal" value={sede} onChange={setSede} placeholder="Sede principal" />
          <div className="rounded-2xl border border-linha p-4 space-y-4">
            <p className="text-sm font-semibold">Diretor responsável</p>
            <Campo rotulo="Nome" value={diretorNome} onChange={setDiretorNome} erro={tentou && erros.diretorNome} />
            <Campo rotulo="E-mail" type="email" value={diretorEmail} onChange={setDiretorEmail} erro={tentou && erros.diretorEmail} dica="Vai receber o acesso de diretoria ao painel." />
          </div>
          <Aviso tom="info">
            A torcida nasce <strong>em implantação</strong> e fora do ar. A mensalidade começa quando a diretoria publicar o site e escolher o plano. A diretoria configura a própria conta Pagar.me no painel dela — nós não temos
            acesso ao dinheiro.
          </Aviso>
          {erro && <Aviso tom="perigo">{erro}</Aviso>}
        </form>
      )}
    </Gaveta>
  );
}

function LinhaCopiar({ rotulo, valor, abrir }: { rotulo: string; valor: string; abrir?: boolean }) {
  const avisar = useToast();
  return (
    <div>
      <p className="text-xs text-texto-3 mb-1">{rotulo}</p>
      <div className="flex items-center gap-1 rounded-2xl border border-linha bg-superficie-2 pl-3">
        <code className="flex-1 min-w-0 truncate text-sm py-2.5">{valor}</code>
        {abrir && (
          <a href={valor} target="_blank" rel="noreferrer" className="inline-grid place-items-center size-10 rounded-xl text-texto-2 hover:text-texto" aria-label={`Abrir ${rotulo}`} title="Abrir">
            <Icone nome="externo" className="size-5" />
          </a>
        )}
        <BotaoIcone
          icone="copiar"
          rotulo={`Copiar ${rotulo}`}
          onClick={async () => avisar((await copiarTexto(valor)) ? "Copiado!" : "Não foi possível copiar.", "sucesso")}
        />
      </div>
    </div>
  );
}

function ResultadoCriacao({ c }: { c: Criada }) {
  const pagina = `${location.origin}/${c.slug}`;
  const painel = `${pagina}/admin`;
  const mensagem =
    `Olá, ${c.diretor.split(" ")[0]}! A ${c.nome} já está na Somos Organizada.\n\n` +
    (c.linkDefinirSenha
      ? `1) Defina sua senha: ${c.linkDefinirSenha}\n2) Painel da diretoria: ${painel}\n3) Página da torcida: ${pagina}\n\n`
      : `Você já tem conta: entre com a senha de sempre.\n1) Painel da diretoria: ${painel}\n2) Página da torcida: ${pagina}\n\n`) +
    `No painel, comece por Pagamentos (conta Pagar.me da torcida). Qualquer dúvida, use o botão de ajuda.`;
  const avisar = useToast();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="size-12 rounded-2xl bg-sucesso/15 text-sucesso grid place-items-center">
          <Icone nome="checkCirculo" className="size-6" />
        </span>
        <div>
          <p className="font-bold text-lg">{c.nome}</p>
          <p className="text-sm text-texto-2">Em implantação · diretor {c.diretor}</p>
        </div>
      </div>
      <LinhaCopiar rotulo="Página pública" valor={pagina} abrir />
      <LinhaCopiar rotulo="Painel da diretoria" valor={painel} abrir />
      {c.linkDefinirSenha ? (
        <>
          <LinhaCopiar rotulo="Link para definir a senha (diretor)" valor={c.linkDefinirSenha} />
          <Aviso tom="alerta">O link de senha é pessoal: envie só para o diretor.</Aviso>
        </>
      ) : (
        <Aviso tom="info">Este e-mail já tem conta na Somos Organizada: o diretor entra com a senha que já usa.</Aviso>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl font-semibold bg-sucesso text-fundo hover:brightness-105 flex-1"
        >
          <Icone nome="whatsapp" className="size-5" />
          Enviar no WhatsApp
        </a>
        <Botao variante="contorno" icone="copiar" className="flex-1" onClick={async () => avisar((await copiarTexto(mensagem)) ? "Mensagem copiada!" : "Não foi possível copiar.", "sucesso")}>
          Copiar mensagem
        </Botao>
      </div>
      <Link to={`/plataforma/torcidas/${c.torcidaId}`} className="inline-flex items-center gap-1.5 text-sm text-primaria font-semibold hover:underline">
        Ver detalhes da torcida <Icone nome="setaDireita" className="size-4" />
      </Link>
    </div>
  );
}
