/** Utilitários locais do painel da diretoria. */
import { useState, type ReactNode } from "react";
import { Timestamp } from "firebase/firestore";
import { getDownloadURL, ref as refStorage, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
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

/** Date → valor de <input type="datetime-local"> no fuso do navegador. */
export function paraInputDataHora(v: Timestamp | Date | null | undefined): string {
  if (!v) return "";
  const d = v instanceof Date ? v : v.toDate();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> (interpretado no fuso do navegador) → Timestamp. */
export function deInputDataHora(s: string): Timestamp | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
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

/** Envia imagem pública (logo, banner, evento) e devolve a URL de download. */
export async function enviarImagem(pasta: string, arquivo: File, prefixo = "img"): Promise<string> {
  if (!TIPOS_IMAGEM.includes(arquivo.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (arquivo.size >= 5 * 1024 * 1024) throw new Error("A imagem precisa ter menos de 5 MB.");
  const ext = arquivo.type === "image/png" ? "png" : arquivo.type === "image/webp" ? "webp" : "jpg";
  const caminho = `${pasta}/${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const r = refStorage(storage, caminho);
  try {
    await uploadBytes(r, arquivo, { contentType: arquivo.type, cacheControl: "public, max-age=31536000" });
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
  icone = "lista",
  tituloVazio,
  textoVazio,
  acaoVazio,
}: {
  carregando: boolean;
  erro: Error | null;
  vazio: boolean;
  icone?: NomeIcone;
  tituloVazio: string;
  textoVazio?: ReactNode;
  acaoVazio?: ReactNode;
}) {
  if (carregando) return <Carregando texto="Carregando..." />;
  if (erro)
    return (
      <Aviso tom="perigo" titulo="Não foi possível carregar">
        {mensagemDeErro(erro)}
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

/** Modal de confirmação para ações sensíveis. */
export function Confirmar({
  aberto,
  fechar,
  titulo,
  children,
  rotulo = "Confirmar",
  perigo,
  acao,
}: {
  aberto: boolean;
  fechar: () => void;
  titulo: string;
  children?: ReactNode;
  rotulo?: string;
  perigo?: boolean;
  acao: () => Promise<unknown>;
}) {
  const avisar = useToast();
  const [ocupado, setOcupado] = useState(false);
  async function confirmar() {
    setOcupado(true);
    try {
      await acao();
      fechar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
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
    return <p className={cx("text-xs text-texto-3 numeros", className)}>{vendidos} vendidos · sem limite</p>;
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
        {vendidos} de {capacidade} vendidos · {pct}%{reservados > 0 && ` · ${reservados} reservados`}
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
              "shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-sm font-semibold transition-colors",
              ativo ? "bg-primaria text-sobre-primaria border-primaria" : "bg-superficie border-linha text-texto-2 hover:text-texto hover:border-linha-forte",
            )}
          >
            {o.rotulo}
            {o.contador !== undefined && (
              <span className={cx("text-xs rounded-full px-1.5 min-w-5 numeros", ativo ? "bg-black/15" : "bg-superficie-3")}>{o.contador}</span>
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
  className,
}: {
  url?: string | null;
  onChange: (url: string | null) => void;
  pasta: string;
  prefixo: string;
  rotulo: string;
  dica?: string;
  proporcao?: string;
  className?: string;
}) {
  const avisar = useToast();
  const [enviando, setEnviando] = useState(false);
  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(true);
    try {
      onChange(await enviarImagem(pasta, arquivo, prefixo));
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
          <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
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
        <label className={cx("inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold cursor-pointer bg-superficie-2 hover:bg-superficie-3", enviando && "opacity-50 pointer-events-none")}>
          <Icone nome="upload" className="size-4" />
          {url ? "Trocar imagem" : "Enviar imagem"}
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
