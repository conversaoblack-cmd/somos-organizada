/**
 * QR guardado no aparelho para a portaria sem internet (estádio, sinal ruim, pré-pago sem dados):
 * - carteirinha: último QR válido + nome, matrícula, plano, validade e foto, por torcida e conta;
 * - link dos ingressos do pedido (/{torcida}/ingressos/{pedido}?k=...): última resposta, por pedido.
 * Fica só neste aparelho (localStorage), nunca no cache do service worker, e é apagado ao sair da conta
 * ou quando outra conta entra. Os ingressos comprados pela conta já ficam no cache do Firestore (firebase.ts).
 */
import { useSyncExternalStore } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, LIMPAR_CACHE_FIRESTORE } from "./firebase";

const PREFIXO = "so-offline:";
const CHAVE_CONTA = `${PREFIXO}conta`;
const DIA = 86_400_000;

export interface CarteirinhaSalva {
  tid: string;
  uid: string;
  qr: string;
  nome: string;
  matricula: string | null;
  planoNome: string;
  status: string;
  validoAte: number | null;
  criadoEm: number | null;
  /** Foto 3x4 reduzida (data:image/jpeg), quando o navegador deixou ler a imagem. */
  foto: string | null;
  /** De qual foto da ficha é a foto guardada (trocou a foto = guarda de novo). */
  fotoPath: string | null;
  salvoEm: number;
}

export interface BilheteSalvo {
  id: string;
  eventoNome: string;
  eventoData: number;
  tipo: "socio" | "publico";
  titularNome: string;
  titularCpf: string;
  codigo: string;
  qr: string;
  status: "valido" | "usado" | "cancelado";
}

export interface IngressosSalvos {
  tid: string;
  pedidoId: string;
  /** Resumo da chave do link: só mostra o que foi salvo para o mesmo link (com o mesmo ?k=). */
  chave: string;
  eventoNome: string;
  ingressos: BilheteSalvo[];
  salvoEm: number;
}

function ler<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: unknown): boolean {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false; // sem espaço ou armazenamento bloqueado (aba anônima): segue sem guardar
  }
}

function remover(chave: string) {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* nada a fazer */
  }
}

function chaves(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO));
  } catch {
    return [];
  }
}

// ── Carteirinha ─────────────────────────────────────────

const chaveCarteirinha = (tid: string, uid: string) => `${PREFIXO}carteirinha:${tid}:${uid}`;

export function salvarCarteirinha(c: Omit<CarteirinhaSalva, "salvoEm">) {
  // Uma pessoa por aparelho: guardar a carteirinha de uma conta apaga a de outra conta
  for (const k of chaves()) if (k.startsWith(`${PREFIXO}carteirinha:`) && !k.endsWith(`:${c.uid}`)) remover(k);
  const salva = { ...c, salvoEm: Date.now() };
  // Sem espaço com a foto: guarda sem ela (o QR é o que importa)
  if (!gravar(chaveCarteirinha(c.tid, c.uid), salva) && salva.foto) gravar(chaveCarteirinha(c.tid, c.uid), { ...salva, foto: null });
}

export function carteirinhaSalva(tid: string, uid: string): CarteirinhaSalva | null {
  const c = ler<CarteirinhaSalva>(chaveCarteirinha(tid, uid));
  return c && c.tid === tid && c.uid === uid && typeof c.qr === "string" && c.qr ? c : null;
}

export function esquecerCarteirinha(tid: string, uid: string) {
  remover(chaveCarteirinha(tid, uid));
}

const fotosTentadas = new Set<string>();

/**
 * Foto 3x4 reduzida (até 240×320, JPEG) para guardar com a carteirinha. Só funciona se o Storage deixar o site
 * ler a imagem (CORS do bucket); se não deixar, devolve null e a carteirinha salva mostra as iniciais.
 * Uma tentativa por foto em cada abertura do site.
 */
export async function fotoParaGuardar(url: string, fotoPath: string): Promise<string | null> {
  if (fotosTentadas.has(fotoPath)) return null;
  fotosTentadas.add(fotoPath);
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const imagem = await createImageBitmap(await r.blob());
    const escala = Math.min(1, 240 / imagem.width, 320 / imagem.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imagem.width * escala));
    canvas.height = Math.max(1, Math.round(imagem.height * escala));
    canvas.getContext("2d")?.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    imagem.close();
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}

// ── Ingressos do link do pedido ─────────────────────────

const chaveIngressos = (tid: string, pedidoId: string) => `${PREFIXO}ingressos:${tid}:${pedidoId}`;

/**
 * Resumo curto da chave do link (cyrb53). Não é proteção: o QR fica no mesmo lugar. Serve só para não mostrar
 * os ingressos salvos para um link incompleto ou de outra pessoa aberto no mesmo aparelho.
 */
function resumo(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Ingresso de evento que já passou há mais de 2 dias não precisa mais ficar no aparelho. */
const vencido = (s: IngressosSalvos) => !s.ingressos.length || Math.max(...s.ingressos.map((i) => i.eventoData)) + 2 * DIA < Date.now();

export function salvarIngressosDoPedido(tid: string, pedidoId: string, chave: string, eventoNome: string, ingressos: BilheteSalvo[]) {
  const salvo: IngressosSalvos = { tid, pedidoId, chave: resumo(chave), eventoNome, ingressos, salvoEm: Date.now() };
  if (vencido(salvo)) return remover(chaveIngressos(tid, pedidoId));
  gravar(chaveIngressos(tid, pedidoId), salvo);
}

export function ingressosSalvosDoPedido(tid: string, pedidoId: string, chave: string): IngressosSalvos | null {
  const s = ler<IngressosSalvos>(chaveIngressos(tid, pedidoId));
  if (!s || s.tid !== tid || s.pedidoId !== pedidoId || s.chave !== resumo(chave) || !Array.isArray(s.ingressos)) return null;
  return vencido(s) ? null : s;
}

export function esquecerIngressosDoPedido(tid: string, pedidoId: string) {
  remover(chaveIngressos(tid, pedidoId));
}

// ── Limpeza ─────────────────────────────────────────────

/** Apaga tudo que foi guardado para mostrar sem internet (carteirinhas e ingressos). */
export function apagarDadosOffline() {
  for (const k of chaves()) remover(k);
}

/**
 * Apaga o que foi guardado quando a conta sai ou troca (em qualquer aba, por qualquer botão "Sair") e limpa
 * ingressos de eventos que já passaram. Quem nunca entrou numa conta (só abriu o link dos ingressos) não perde nada.
 * O cache do Firestore (ingressos comprados pela conta, com QR) é apagado na próxima abertura do site (firebase.ts).
 */
export function vigiarDadosOffline() {
  for (const k of chaves()) {
    if (!k.startsWith(`${PREFIXO}ingressos:`)) continue;
    const s = ler<IngressosSalvos>(k);
    if (!s || vencido(s)) remover(k);
  }
  onAuthStateChanged(auth, (u) => {
    const anterior = ler<string>(CHAVE_CONTA);
    if (anterior && anterior !== (u?.uid ?? null)) {
      apagarDadosOffline();
      gravar(LIMPAR_CACHE_FIRESTORE, 1);
    }
    if (u) gravar(CHAVE_CONTA, u.uid);
    else remover(CHAVE_CONTA);
  });
}

/** "às 14:32" (hoje) ou "em 08/10 às 14:32". */
export function quandoFoiSalvo(ms: number): string {
  const d = new Date(ms);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `às ${hora}` : `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
}

/** O aparelho diz que está com internet? (com sinal muito ruim pode dizer que sim e as respostas não chegarem) */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      window.addEventListener("online", avisar);
      window.addEventListener("offline", avisar);
      return () => {
        window.removeEventListener("online", avisar);
        window.removeEventListener("offline", avisar);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
