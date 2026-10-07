import { useEffect, useState } from "react";

/**
 * Vídeos curtos dos tutoriais, gravados a partir dos próprios tours:
 *   /tutoriais/{id}-desktop.webm e /tutoriais/{id}-mobile.webm
 * O manifest lista os ids que já têm vídeo: /tutoriais/manifest.json → { "ids": ["admin-eventos", ...] }
 */
let manifest: Promise<Set<string>> | null = null;

function carregarManifest(): Promise<Set<string>> {
  manifest ??= fetch("/tutoriais/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : { ids: [] }))
    .then((j: { ids?: unknown }) => new Set(Array.isArray(j.ids) ? j.ids.filter((x): x is string => typeof x === "string") : []))
    .catch(() => new Set<string>());
  return manifest;
}

/** URL do vídeo do tutorial para o tamanho de tela atual, ou null se ainda não houver vídeo. */
export function useVideoTutorial(id: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    carregarManifest().then((ids) => {
      if (!ativo) return;
      setUrl(ids.has(id) ? `/tutoriais/${id}-${window.innerWidth < 640 ? "mobile" : "desktop"}.webm` : null);
    });
    return () => {
      ativo = false;
    };
  }, [id]);
  return url;
}
