#!/usr/bin/env node
/**
 * Semente PRÓPRIA do estúdio (seção 6.6): roda DEPOIS do testes-e2e/semear.mjs, só no emulador local, e dá à
 * "Torcida Brasil" de demonstração uma identidade própria (escudo e cores fictícios), para o vídeo mostrar "cada
 * torcida com a cara dela" sem confundir com a marca da Somos Organizada.
 * - Não altera nada em testes-e2e/ (só usa os pacotes instalados lá) nem produção.
 * - Cores: roxo e branco (não remetem a clube grande do Brasil; sem verde; não colidem com a semântica do vídeo).
 * Uso: node scripts/semente-estudio.mjs   (com `bash testes-e2e/dev-local.sh` no ar)
 */
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('só roda contra o emulador local');
const require = createRequire(new URL('../../testes-e2e/package.json', import.meta.url));
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');

initializeApp({projectId: 'demo-somos'});
const db = getFirestore();
const svg = readFileSync(new URL('../marca/demo/escudo-torcida-brasil.svg', import.meta.url));
const logoUrl = `data:image/svg+xml;base64,${svg.toString('base64')}`;

const q = await db.collection('torcidas').where('slug', '==', 'brasil').limit(1).get();
if (q.empty) throw new Error('Torcida Brasil não encontrada: rode o dev-local.sh primeiro');
await q.docs[0].ref.update({
  tema: {corPrimaria: '#7C3AED', corSecundaria: '#F5F3FF', corFundo: '#0B0714', corTexto: '#F4F2FA', logoUrl},
});
console.log(`Torcida Brasil (${q.docs[0].id}) com escudo e cores fictícios do estúdio.`);
process.exit(0);
