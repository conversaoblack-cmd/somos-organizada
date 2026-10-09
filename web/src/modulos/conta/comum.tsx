import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/armazenamento";
import { registrarErro } from "@/lib/erros";
import { paraData } from "@/lib/formatos";
import type { Socio } from "@/lib/tipos";
import type { Tom } from "@/ui";

/** Cache simples da URL da foto 3x4 (evita piscar ao trocar de aba). */
const cacheFoto = new Map<string, string>();

/** URL de download da foto 3x4 do sócio (null enquanto carrega ou se não houver). */
export function useFotoSocio(fotoPath: string | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(fotoPath ? (cacheFoto.get(fotoPath) ?? null) : null);
  useEffect(() => {
    if (!fotoPath) {
      setUrl(null);
      return;
    }
    const emCache = cacheFoto.get(fotoPath);
    if (emCache) {
      setUrl(emCache);
      return;
    }
    let ativo = true;
    getDownloadURL(ref(storage, fotoPath))
      .then((u) => {
        cacheFoto.set(fotoPath, u);
        if (ativo) setUrl(u);
      })
      .catch((e) => {
        // Foto removida ou sem permissão: segue com as iniciais.
        if ((e as { code?: string })?.code !== "storage/object-not-found") registrarErro(e, "foto do sócio");
        if (ativo) setUrl(null);
      });
    return () => {
      ativo = false;
    };
  }, [fotoPath]);
  return url;
}

export type Situacao = "em_dia" | "vencida" | "pendente" | "analise" | "suspenso" | "cancelado" | "inadimplente";

const DIA = 86_400_000;

/** Situação prática da carteirinha (considera a validade, não só o status gravado). */
export function situacaoDoSocio(s: Pick<Socio, "status" | "validoAte">): Situacao {
  const validade = paraData(s.validoAte)?.getTime() ?? 0;
  switch (s.status) {
    case "pendente_pagamento":
      return "pendente";
    case "em_analise":
      return "analise";
    case "suspenso":
      return "suspenso";
    case "cancelado":
      return "cancelado";
    case "inadimplente":
      return "inadimplente";
    case "ativo":
      return validade > Date.now() ? "em_dia" : "vencida";
  }
}

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  em_dia: "Ativo",
  vencida: "Vencida",
  pendente: "Aguardando pagamento",
  analise: "Em análise",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
  inadimplente: "Mensalidade atrasada",
};

export const TOM_SITUACAO: Record<Situacao, Tom> = {
  em_dia: "sucesso",
  vencida: "alerta",
  pendente: "neutro",
  analise: "info",
  suspenso: "perigo",
  cancelado: "neutro",
  inadimplente: "alerta",
};

/** Dias até a validade (negativo = vencido). null se nunca pagou. */
export function diasParaVencer(s: Pick<Socio, "validoAte">): number | null {
  const d = paraData(s.validoAte);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / DIA);
}

/** "Mês/ano" curto para "Sócio desde". */
export function mesAno(v: Parameters<typeof paraData>[0]) {
  const d = paraData(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "America/Sao_Paulo" })
    .format(d)
    .replace(".", "")
    .replace(" de ", "/");
}

/** Mantém a tela acesa enquanto o componente estiver montado (quando o navegador permite). */
export function useTelaAcesa(ativo = true) {
  useEffect(() => {
    if (!ativo) return;
    type Trava = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Trava> } };
    let trava: Trava | null = null;
    let encerrado = false;
    const pedir = () => {
      nav.wakeLock
        ?.request("screen")
        .then((t) => {
          if (encerrado) t.release().catch(() => undefined);
          else trava = t;
        })
        .catch(() => undefined);
    };
    pedir();
    const aoVoltar = () => document.visibilityState === "visible" && pedir();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      encerrado = true;
      document.removeEventListener("visibilitychange", aoVoltar);
      trava?.release().catch(() => undefined);
    };
  }, [ativo]);
}

/** Relógio que atualiza a cada segundo (prova de que a tela não é um print). */
export function useRelogio(ativo = true) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(id);
  }, [ativo]);
  return agora;
}

/** CSS local do módulo (animações e efeitos 3D da carteirinha e dos bilhetes). */
export const CSS_CONTA = `
@keyframes so-reflexo { 0% { transform: translateX(-120%) skewX(-18deg); } 55%, 100% { transform: translateX(260%) skewX(-18deg); } }
@keyframes so-pulso { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes so-borda { to { --so-angulo: 360deg; } }
@keyframes so-entrar { from { opacity: 0; transform: translateY(14px) rotateX(8deg); } to { opacity: 1; transform: none; } }
@property --so-angulo { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
.so-reflexo::after {
  content: ""; position: absolute; inset: -20% auto -20% 0; width: 38%;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / .22), transparent);
  animation: so-reflexo 5.5s ease-in-out infinite; animation-delay: 1.2s; pointer-events: none;
}
.so-pulso { animation: so-pulso 1.6s ease-in-out infinite; }
.so-entrar { animation: so-entrar .6s cubic-bezier(.2,.8,.2,1) both; }
.so-borda-viva {
  background: conic-gradient(from var(--so-angulo), var(--color-primaria), var(--color-secundaria), var(--color-primaria));
  animation: so-borda 3s linear infinite;
}
.so-picote {
  background-image: radial-gradient(circle at center, var(--color-fundo) 0 3.5px, transparent 4px);
  background-size: 100% 12px; background-repeat: repeat-y;
}
.so-tracejado { background-image: linear-gradient(to bottom, var(--color-linha-forte) 50%, transparent 0); background-size: 1.5px 10px; background-repeat: repeat-y; background-position: center; }
@media (prefers-reduced-motion: reduce) { .so-reflexo::after, .so-borda-viva, .so-pulso { animation: none; } }
`;
