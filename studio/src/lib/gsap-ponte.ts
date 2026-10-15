import {gsap} from 'gsap';
import {useLayoutEffect, useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * GSAP determinístico: a timeline nasce `paused` e é posicionada por `seek(frame / fps)` a cada frame,
 * em layout effect (antes da captura do quadro). Nunca use `play()`, ticker, ScrollTrigger nem tempo real:
 * o Remotion renderiza quadros fora de ordem e em várias abas.
 *
 * Uso:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useGsapTimeline((tl) => { tl.from(ref.current, {y: 80, duration: 0.4, ease: 'power3.out'}); });
 */
// Sem translate3d: camada de GPU faz o Chrome capturar raster dependente do tempo de CPU (MP4 deixa de ser idêntico).
gsap.config({force3D: false});

export function useGsapTimeline(montar: (tl: gsap.core.Timeline) => void) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const tl = useMemo(() => gsap.timeline({paused: true}), []);

  useLayoutEffect(() => {
    montar(tl);
    return () => {
      tl.clear();
    };
    // a timeline é montada uma vez; mudar a coreografia = remontar o componente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl]);

  useLayoutEffect(() => {
    tl.seek(frame / fps, false);
  }, [tl, frame, fps]);

  return tl;
}

/** Easing do GSAP como função pura (0..1 → 0..1), para usar dentro de `interpolate`. */
export const easeGsap = (nome: string) => gsap.parseEase(nome) as (t: number) => number;
