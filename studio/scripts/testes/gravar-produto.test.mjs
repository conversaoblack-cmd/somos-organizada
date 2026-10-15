import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {CAPTURA, gravar} from '../gravar-produto.mjs';
import {sonda} from '../lib/ff.mjs';

const roteiro = JSON.parse(readFileSync(new URL('./roteiro-teste.json', import.meta.url), 'utf8'));
const noAr = await fetch(`${roteiro.base}/brasil`).then((r) => r.ok, () => false);

test('Captura: duas execuções dão os mesmos retângulos de toque e a dimensão é a real', {skip: noAr ? false : 'ambiente de demonstração fora do ar (bash testes-e2e/dev-local.sh)', timeout: 300000}, async () => {
  const base = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'cap-'));
  const a = await gravar(roteiro, join(base, 'a'));
  const b = await gravar(roteiro, join(base, 'b'), {video: false});
  const sem = (m) => m.map(({ms, ...r}) => r);
  assert.ok(a.marcas.length >= 2);
  assert.deepEqual(sem(a.marcas), sem(b.marcas));
  for (const p of a.prints) {
    const s = sonda(join(base, 'a', p.arquivo)).streams[0];
    assert.deepEqual([s.width, s.height], [CAPTURA.width, CAPTURA.height]);
  }
  const v = sonda(join(base, 'a', 'gravacao.mp4')).streams.find((x) => x.codec_type === 'video');
  assert.deepEqual([v.width, v.height, v.avg_frame_rate], [CAPTURA.width, CAPTURA.height, '30/1']);
});
