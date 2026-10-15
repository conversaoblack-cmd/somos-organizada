import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Fontes locais (OFL), copiadas de web/public/fontes/. Sem Google Fonts.
let carregando: Promise<unknown> | null = null;

export function carregarFontes() {
  carregando ??= Promise.all([
    loadFont({family: 'Archivo Black', url: staticFile('fontes/archivo-black.woff2'), weight: '400', display: 'block'}),
    loadFont({family: 'Archivo', url: staticFile('fontes/archivo.woff2'), weight: '100 900', display: 'block'}),
  ]);
  return carregando;
}
