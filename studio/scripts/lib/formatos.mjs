import {readFileSync} from 'node:fs';

/** Formatos e zona essencial: lê src/formatos.json (fonte única, a mesma do código das composições). */
export const FORMATOS = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(new URL('../../src/formatos.json', import.meta.url), 'utf8'))).filter(([k]) => !k.startsWith('_')),
);

export function formatoDoTamanho(w, h) {
  const e = Object.entries(FORMATOS).find(([, f]) => f.width === w && f.height === h);
  return e ? {id: e[0], ...e[1]} : null;
}
