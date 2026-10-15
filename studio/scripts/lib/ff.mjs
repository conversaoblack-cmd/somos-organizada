// Utilitários de FFmpeg/ffprobe para os scripts do estúdio (sem dependências externas).
import {spawnSync} from 'node:child_process';

export function rodar(cmd, args, {permitirFalha = false} = {}) {
  const r = spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024});
  if (r.error) throw r.error;
  if (r.status !== 0 && !permitirFalha) {
    throw new Error(`${cmd} saiu com ${r.status}: ${(r.stderr || '').slice(-1500)}`);
  }
  return r;
}

export function sonda(arquivo) {
  const r = rodar('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', arquivo]);
  return JSON.parse(r.stdout);
}

export function fracao(txt) {
  if (!txt) return 0;
  const [a, b] = String(txt).split('/').map(Number);
  return b ? a / b : a;
}

/** Loudness EBU R128: integrado (LUFS), faixa (LU) e true peak (dBTP). */
export function loudness(arquivo) {
  const r = rodar('ffmpeg', ['-hide_banner', '-nostats', '-i', arquivo, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], {
    permitirFalha: true,
  });
  const txt = r.stderr;
  const resumo = txt.slice(txt.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = resumo.match(re);
    return m ? Number(m[1]) : null;
  };
  return {
    integradoLufs: num(/I:\s+(-?[\d.]+|-inf)\s+LUFS/),
    faixaLu: num(/LRA:\s+(-?[\d.]+)\s+LU/),
    truePeakDbtp: num(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/),
  };
}

/** Lê pares "chave: valor" de linhas do stderr do ffmpeg. */
export function segmentos(stderr, reInicio, reFim) {
  const inicios = [...stderr.matchAll(reInicio)].map((m) => Number(m[1]));
  const fins = [...stderr.matchAll(reFim)].map((m) => Number(m[1]));
  return inicios.map((ini, i) => ({inicio: ini, fim: fins[i] ?? null}));
}
