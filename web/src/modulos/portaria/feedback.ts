/** Bipe (WebAudio) e vibração diferentes para cada resultado da leitura. */

let ctx: AudioContext | null = null;

/** Deve ser chamado num toque do usuário (desbloqueia o áudio no iOS/Android). */
export function prepararAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tom(freq: number, inicio: number, duracao: number, tipo: OscillatorType = "sine", volume = 0.22) {
  if (!ctx) return;
  const t0 = ctx.currentTime + inicio;
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, t0);
  ganho.gain.setValueAtTime(0.0001, t0);
  ganho.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
  ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);
  osc.connect(ganho).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duracao + 0.02);
}

function vibrar(padrao: number | number[]) {
  try {
    navigator.vibrate?.(padrao);
  } catch {
    /* sem vibração neste aparelho */
  }
}

export type TipoFeedback = "ok" | "aviso" | "erro" | "leitura";

export function feedback(tipo: TipoFeedback) {
  prepararAudio();
  switch (tipo) {
    case "leitura": // QR detectado: clique curtinho
      tom(1800, 0, 0.05, "sine", 0.12);
      vibrar(25);
      break;
    case "ok": // duas notas subindo
      tom(988, 0, 0.11);
      tom(1480, 0.11, 0.2);
      vibrar(90);
      break;
    case "aviso": // duas notas iguais, médias
      tom(660, 0, 0.14, "triangle", 0.28);
      tom(660, 0.2, 0.14, "triangle", 0.28);
      vibrar([120, 80, 120]);
      break;
    case "erro": // zumbido grave
      tom(196, 0, 0.22, "square", 0.16);
      tom(147, 0.26, 0.34, "square", 0.16);
      vibrar([300, 100, 300]);
      break;
  }
}
