import { useEffect, useState } from "react";

/**
 * Vídeos curtos dos tutoriais, gravados a partir dos próprios tours:
 *   /tutoriais/{id}-desktop.webm e /tutoriais/{id}-mobile.webm, com cópia em MP4 (H.264) ao lado de cada um
 *   ({id}-desktop.mp4 e {id}-mobile.mp4) para o iPhone, que não toca todo WebM.
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

export interface VideoTutorial {
  webm: string;
  mp4: string;
}

/** Endereços do vídeo do tutorial para o tamanho de tela atual (WebM e MP4), ou null se ainda não houver vídeo. */
export function useVideoTutorial(id: string): VideoTutorial | null {
  const [url, setUrl] = useState<VideoTutorial | null>(null);
  useEffect(() => {
    let ativo = true;
    carregarManifest().then((ids) => {
      if (!ativo) return;
      if (!ids.has(id)) return setUrl(null);
      const base = `/tutoriais/${id}-${window.innerWidth < 640 ? "mobile" : "desktop"}`;
      setUrl({ webm: `${base}.webm`, mp4: `${base}.mp4` });
    });
    return () => {
      ativo = false;
    };
  }, [id]);
  return url;
}
