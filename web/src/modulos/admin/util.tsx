/** Utilitários locais do painel da diretoria. */
import { useState, type ReactNode } from "react";
import { Timestamp } from "firebase/firestore";
import { getDownloadURL, ref as refStorage, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/armazenamento";
import { ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import { copiarTexto } from "@/lib/servicos";
import { Aviso, Botao, Carregando, cx, Icone, Modal, useToast, Vazio, type NomeIcone, type Tom } from "@/ui";

const FUSO = "America/Sao_Paulo";

/** "2026-10" do mês atual no fuso de São Paulo (mesma chave usada em stats/{mes} e lancamentos.competencia). */
export function mesAtualSP(d: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${partes.find((p) => p.type === "year")?.value}-${partes.find((p) => p.type === "month")?.value}`;
}

/** Últimos `n` meses (do mais antigo para o atual), ex.: ["2026-05", ..., "2026-10"]. */
export function ultimosMeses(n: number): string[] {
  const [a, m] = mesAtualSP().split("-").map(Number) as [number, number];
  const lista: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = a * 12 + (m - 1) - i;
    lista.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return lista;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10" → "out/26" */
export function rotuloMes(c: string, longo = false): string {
  const [a, m] = c.split("-");
  const i = Number(m) - 1;
  if (longo) {
    const nome = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][i];
    return `${nome} de ${a}`;
  }
  return `${MESES[i] ?? m}/${a?.slice(2)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

const NUMERO = new Intl.NumberFormat("pt-BR");
/** 1234 → "1.234" (contagens: vendidos, sócios, entradas). */
export const numero = (n: number | null | undefined) => NUMERO.format(n ?? 0);

// Tudo no painel é mostrado no horário de Brasília (lib/formatos.ts); a ida e a volta dos campos de data
// também precisam ser, senão quem está em outro fuso (ou com o celular em outro fuso) grava a hora errada.
const PARTES_SP = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Ano, mês, dia, hora e minuto de um instante no horário de Brasília. */
function partesSP(d: Date) {
  const p = Object.fromEntries(PARTES_SP.formatToParts(d).map((x) => [x.type, x.value]));
  return { a: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) };
}

/** Minutos de diferença entre Brasília e UTC naquele instante (hoje: -180). */
function deslocamentoSP(instante: number): number {
  const p = partesSP(new Date(instante));
  return (Date.UTC(p.a, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instante / 1000) * 1000) / 60000;
}

/** Data e hora "de parede" em Brasília → instante. */
export function instanteSP(a: number, m: number, d: number, h = 0, mi = 0): Date {
  const comoUTC = Date.UTC(a, m - 1, d, h, mi);
  let t = comoUTC - deslocamentoSP(comoUTC) * 60000;
  t = comoUTC - deslocamentoSP(t) * 60000; // segunda passada: acerta mudanças de horário
  return new Date(t);
}

/** Meia-noite de hoje (ou do dia de `d`) no horário de Brasília. */
export function inicioDoDiaSP(d: Date = new Date()): Date {
  const p = partesSP(d);
  return instanteSP(p.a, p.m, p.d);
}

/** Date → valor de <input type="datetime-local"> no horário de Brasília. */
export function paraInputDataHora(v: Timestamp | Date | null | undefined): string {
  if (!v) return "";
  const p = partesSP(v instanceof Date ? v : v.toDate());
  return `${p.a}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** Valor de <input type="datetime-local"> (sempre lido como horário de Brasília) → Timestamp. */
export function deInputDataHora(s: string): Timestamp | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s ?? "");
  if (!r) return null;
  const [a, m, d, h, mi] = r.slice(1).map(Number) as [number, number, number, number, number];
  const data = instanteSP(a, m, d, h, mi);
  return Number.isNaN(data.getTime()) ? null : Timestamp.fromDate(data);
}

/** Dica padrão dos campos de data e hora. */
export const DICA_FUSO = "Horário de Brasília.";

/** Quanto esperar uma gravação antes de concluir que a internet caiu. */
const PRAZO_GRAVACAO_MS = 15000;
const MSG_SEM_INTERNET = "Sem internet: não foi possível salvar. Tente de novo.";

class TempoEsgotado extends Error {}

/**
 * Espera a gravação por no máximo ~15 s. Com internet ruim o Firestore guarda a escrita e a promessa
 * fica pendurada para sempre; o botão não pode ficar girando sem fim.
 */
export async function comPrazo<T>(p: Promise<T>, ms = PRAZO_GRAVACAO_MS): Promise<T> {
  let id: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, rejeitar) => (id = setTimeout(() => rejeitar(new TempoEsgotado(MSG_SEM_INTERNET)), ms)))]);
  } finally {
    clearTimeout(id);
  }
}

/** Mensagem de erro de gravação: sem internet tem texto próprio. */
export function mensagemGravacao(e: unknown): string {
  if (e instanceof TempoEsgotado || ehErroDeConexao(e)) return MSG_SEM_INTERNET;
  return mensagemDeErro(e);
}

/** Valor em centavos → texto para Campo mascara="moeda" ("55,00"). */
export function textoMoeda(centavos: number | null | undefined): string {
  if (centavos == null) return "";
  const v = Math.round(centavos);
  const inteiro = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${inteiro},${pad(v % 100)}`;
}

/** Centavos → "55,00" (sem símbolo, para CSV). */
export const decimalBR = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

/** Gera e baixa um CSV (separador ";" e BOM, para abrir certo no Excel em português). */
export function baixarCsv(nome: string, cabecalho: string[], linhas: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const conteudo = [cabecalho, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome.endsWith(".csv") ? nome : `${nome}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
const QUALIDADE_IMAGEM = 0.82;

/** Lado maior padrão: escudo/logo é pequeno na tela; banner e evento ocupam a largura toda. */
const ladoPadrao = (prefixo: string) => (/logo|escudo/i.test(prefixo) ? 512 : 1600);

/**
 * Reduz a foto no navegador antes de subir (o torcedor abre a página com pouco dado): lado maior até
 * `ladoMaximo` px, WebP (ou JPEG se o navegador não gerar WebP). Se não der para reduzir, sobe a original.
 */
async function reduzirImagem(arquivo: File, ladoMaximo: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const gerar = (tipo: string) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, QUALIDADE_IMAGEM));
    let blob = await gerar("image/webp");
    // Safari antigo não gera WebP: PNG continua PNG (escudo com fundo transparente), o resto vira JPEG
    if (!blob || blob.type !== "image/webp") blob = await gerar(arquivo.type === "image/png" ? "image/png" : "image/jpeg");
    if (!blob) return arquivo;
    // só troca se ficou menor (ex.: PNG pequeno e já otimizado)
    return blob.size < arquivo.size || escala < 1 ? blob : arquivo;
  } catch {
    return arquivo;
  }
}

/** Envia imagem pública (logo, banner, evento), reduzida, e devolve a URL de download. */
export async function enviarImagem(pasta: string, arquivo: File, prefixo = "img", ladoMaximo = ladoPadrao(prefixo)): Promise<string> {
  if (!TIPOS_IMAGEM.includes(arquivo.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (arquivo.size >= 5 * 1024 * 1024) throw new Error("A imagem precisa ter menos de 5 MB.");
  const conteudo = await reduzirImagem(arquivo, ladoMaximo);
  const tipo = conteudo.type || arquivo.type;
  const ext = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
  const caminho = `${pasta}/${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const r = refStorage(storage, caminho);
  try {
    await uploadBytes(r, conteudo, { contentType: tipo, cacheControl: "public, max-age=31536000" });
    return await getDownloadURL(r);
  } catch (e) {
    const codigo = (e as { code?: string }).code ?? "";
    if (codigo === "storage/unauthorized") throw new Error("Sem permissão para enviar a imagem. Confira se seu usuário está ativo e tente de novo.");
    if (codigo === "storage/retry-limit-exceeded" || codigo === "storage/canceled") throw new Error("O envio não terminou. Verifique a conexão e tente de novo.");
    throw e;
  }
}

/** Remove chaves com undefined (o Firestore não aceita undefined). */
export function semIndefinidos<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Carregando / erro / vazio para listas. Retorna null quando há dados. */
export function EstadoLista({
  carregando,
  erro,
  vazio,
  semConexao,
  tentarDeNovo,
  icone = "lista",
  tituloVazio,
  textoVazio,
  acaoVazio,
}: {
  carregando: boolean;
  erro: Error | null;
  vazio: boolean;
  /** O servidor não respondeu e o aparelho não tem nada guardado: "vazio" aqui não é verdade. */
  semConexao?: boolean;
  /** Padrão: recarrega a página. */
  tentarDeNovo?: () => void;
  icone?: NomeIcone;
  tituloVazio: string;
  textoVazio?: ReactNode;
  acaoVazio?: ReactNode;
}) {
  const recarregar = tentarDeNovo ?? (() => window.location.reload());
  const botao = (
    <Botao tamanho="sm" variante="contorno" icone="atualizar" className="mt-3" onClick={recarregar}>
      Tentar de novo
    </Botao>
  );
  if (carregando) return <Carregando texto="Carregando…" />;
  if (erro)
    return (
      <Aviso tom="perigo" titulo="Não foi possível carregar">
        {mensagemDeErro(erro)}
        <div>{botao}</div>
      </Aviso>
    );
  if (semConexao)
    return (
      <Aviso tom="alerta" titulo="Sem internet. Confira a conexão.">
        Os dados aparecem assim que o aparelho voltar a falar com o servidor.
        <div>{botao}</div>
      </Aviso>
    );
  if (vazio)
    return (
      <Vazio icone={icone} titulo={tituloVazio} acao={acaoVazio}>
        {textoVazio}
      </Vazio>
    );
  return null;
}

/**
 * Valor grande de indicador (R$ 1.360,00): fonte menor no celular para não sair do cartão nem invadir o vizinho.
 * Use dentro de `Indicador valor={...}`.
 */
export function ValorKpi({ children }: { children: ReactNode }) {
  return <span className="block text-lg min-[400px]:text-xl sm:text-[28px] leading-tight break-words">{children}</span>;
}

/** Quantos itens desenhar de cada vez em listas longas (sócios, ingressos): celular simples trava com milhares. */
export const POR_PAGINA = 60;

/** "Mostrando 60 de 1.234" + botão "Mostrar mais". Some quando já mostra tudo. */
export function MostrarMais({ total, mostrando, mais }: { total: number; mostrando: number; mais: () => void }) {
  if (total <= mostrando) return null;
  return (
    <div className="flex flex-col items-center gap-2 pt-4">
      <p className="text-xs text-texto-3 numeros">
        Mostrando {numero(mostrando)} de {numero(total)}
      </p>
      <Botao variante="contorno" icone="chevronBaixo" onClick={mais}>
        Mostrar mais
      </Botao>
    </div>
  );
}

/** Modal de confirmação para ações sensíveis. */
export function Confirmar({
  aberto,
  fechar,
  titulo,
  children,
  rotulo = "Confirmar",
  perigo,
  acao,
  prazo = PRAZO_GRAVACAO_MS,
}: {
  aberto: boolean;
  fechar: () => void;
  titulo: string;
  children?: ReactNode;
  rotulo?: string;
  perigo?: boolean;
  acao: () => Promise<unknown>;
  /** Quanto esperar antes de dizer "sem internet" (ações que falam com a Pagar.me demoram mais). */
  prazo?: number;
}) {
  const avisar = useToast();
  const [ocupado, setOcupado] = useState(false);
  async function confirmar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      await comPrazo(acao(), prazo);
      fechar();
    } catch (e) {
      avisar(mensagemGravacao(e), "erro");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <Modal
      aberto={aberto}
      fechar={() => !ocupado && fechar()}
      titulo={titulo}
      largura="max-w-md"
      rodape={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Botao variante="fantasma" onClick={fechar} disabled={ocupado}>
            Voltar
          </Botao>
          <Botao variante={perigo ? "perigo" : "primaria"} onClick={confirmar} carregando={ocupado}>
            {rotulo}
          </Botao>
        </div>
      }
    >
      <div className="text-texto-2 text-[15px] leading-relaxed">{children}</div>
    </Modal>
  );
}

/** Botão de copiar com retorno visual. */
export function BotaoCopiar({ texto, rotulo = "Copiar", className, variante = "suave" }: { texto: string; rotulo?: string; className?: string; variante?: "suave" | "contorno" | "primaria" }) {
  const [ok, setOk] = useState(false);
  const avisar = useToast();
  return (
    <Botao
      tamanho="sm"
      variante={variante}
      icone={ok ? "check" : "copiar"}
      className={className}
      onClick={async () => {
        const feito = await copiarTexto(texto);
        if (feito) {
          setOk(true);
          setTimeout(() => setOk(false), 1800);
        } else avisar("Não foi possível copiar. Selecione e copie manualmente.", "erro");
      }}
    >
      {ok ? "Copiado" : rotulo}
    </Botao>
  );
}

/** Barra de ocupação vendidos/capacidade. */
export function BarraOcupacao({ vendidos, reservados = 0, capacidade, className }: { vendidos: number; reservados?: number; capacidade?: number | null; className?: string }) {
  if (!capacidade) {
    return <p className={cx("text-xs text-texto-3 numeros", className)}>{numero(vendidos)} vendidos · sem limite</p>;
  }
  const pct = Math.min(100, Math.round((vendidos / capacidade) * 100));
  const pctRes = Math.min(100 - pct, Math.round((reservados / capacidade) * 100));
  return (
    <div className={className}>
      <div className="h-2 rounded-full bg-superficie-3 overflow-hidden flex" role="meter" aria-valuemin={0} aria-valuemax={capacidade} aria-valuenow={vendidos} aria-label="Ocupação">
        <div className={cx("h-full rounded-full", pct >= 90 ? "bg-alerta" : "bg-primaria")} style={{ width: `${pct}%` }} />
        {pctRes > 0 && <div className="h-full bg-primaria/35" style={{ width: `${pctRes}%` }} />}
      </div>
      <p className="mt-1.5 text-xs text-texto-3 numeros">
        {numero(vendidos)} de {numero(capacidade)} vendidos · {pct}%{reservados > 0 && ` · ${numero(reservados)} reservados`}
      </p>
    </div>
  );
}

/** Linha "rótulo: valor" usada nos detalhes. */
export function Linha({ rotulo, children, className }: { rotulo: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 py-2.5 border-b border-linha last:border-0 text-sm", className)}>
      <span className="text-texto-3 shrink-0">{rotulo}</span>
      <span className="text-right font-medium min-w-0 break-words">{children}</span>
    </div>
  );
}

/** Pílulas de filtro roláveis (melhor que Abas no celular quando há muitas opções). */
export function Pilulas<T extends string>({
  valor,
  onChange,
  opcoes,
  className,
}: {
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; rotulo: ReactNode; contador?: number }[];
  className?: string;
}) {
  return (
    <div className={cx("flex gap-2 overflow-x-auto sem-rolagem -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap", className)} role="tablist">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onChange(o.valor)}
            className={cx(
              "shrink-0 inline-flex items-center gap-2 h-11 sm:h-9 px-3.5 rounded-full border text-sm font-semibold transition-colors",
              ativo ? "bg-primaria text-sobre-primaria border-primaria" : "bg-superficie border-linha text-texto-2 hover:text-texto hover:border-linha-forte",
            )}
          >
            {o.rotulo}
            {o.contador !== undefined && (
              <span className={cx("text-xs rounded-full px-1.5 min-w-5 numeros", ativo ? "bg-black/15" : "bg-superficie-3")}>{numero(o.contador)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Seletor de imagem com prévia e envio imediato ao Storage. */
export function SeletorImagem({
  url,
  onChange,
  pasta,
  prefixo,
  rotulo,
  dica,
  proporcao = "aspect-[16/9]",
  ladoMaximo,
  className,
}: {
  url?: string | null;
  onChange: (url: string | null) => void;
  pasta: string;
  prefixo: string;
  rotulo: string;
  dica?: string;
  proporcao?: string;
  /** Lado maior da imagem enviada (padrão: 512 px para logo/escudo, 1600 px para o resto). */
  ladoMaximo?: number;
  className?: string;
}) {
  const avisar = useToast();
  const [enviando, setEnviando] = useState(false);
  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(true);
    try {
      onChange(await enviarImagem(pasta, arquivo, prefixo, ladoMaximo));
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <div className={className}>
      <p className="block text-sm font-medium text-texto-2 mb-1.5">{rotulo}</p>
      <div className={cx("relative rounded-2xl border border-dashed border-linha-forte bg-superficie-2 overflow-hidden", proporcao)}>
        {url ? (
          <img src={url} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-texto-3 text-sm text-center px-4">
            <span>
              <span className="block mx-auto mb-2 size-10 rounded-xl bg-superficie-3 grid place-items-center">
                <Icone nome="imagem" className="size-5" />
              </span>
              Nenhuma imagem
            </span>
          </div>
        )}
        {enviando && (
          <div className="absolute inset-0 bg-black/50 grid place-items-center">
            <Carregando className="py-0" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <label
          className={cx(
            "inline-flex items-center gap-1.5 h-11 sm:h-9 px-3.5 rounded-xl text-sm font-semibold cursor-pointer bg-superficie-2 hover:bg-superficie-3 focus-within:ring-2 focus-within:ring-primaria-texto/60",
            enviando && "opacity-50 pointer-events-none",
          )}
        >
          <Icone nome="upload" className="size-4" />
          {enviando ? "Enviando…" : url ? "Trocar imagem" : "Enviar imagem"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              void escolher(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <Botao tamanho="sm" variante="fantasma" icone="lixeira" onClick={() => onChange(null)}>
            Remover
          </Botao>
        )}
      </div>
      {dica && <p className="text-xs text-texto-3 mt-1.5">{dica}</p>}
    </div>
  );
}

export const TOM_PEDIDO: Record<string, Tom> = {
  pago: "sucesso",
  aguardando: "alerta",
  criando: "neutro",
  falhou: "perigo",
  expirado: "neutro",
  cancelado: "neutro",
  estornado: "info",
};

/** Número de telefone → número para wa.me (com DDI 55). */
export function numeroWhatsapp(tel: string | undefined | null): string {
  const d = (tel ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length > 11 ? d : `55${d}`;
}
