# Instalação do estúdio

O estúdio fica em `studio/`, **isolado do produto**: `package.json` próprio, não usa os `node_modules` de `web/` nem de
`functions/`, e só **lê** o produto. Montado em 15/10/2026 na nuvem (Linux, Node 22.22, 4 núcleos, sem GPU).

## O que foi instalado

| Peça | Versão | Licença | Teste | Resultado |
|---|---|---|---|---|
| Node.js | 22.22.0 (da nuvem) | MIT | `node -v` | ok |
| Remotion: `remotion`, `@remotion/cli`, `media`, `three`, `transitions`, `captions`, `shapes`, `effects`, `motion-blur`, `fonts` | 4.0.535 (todas iguais, sem `^`) | Remotion License (ver abaixo) | `node scripts/testar-render.mjs` | render ok; ver "Determinismo" |
| React / React DOM | 19.2.0 | MIT | `npx tsc --noEmit` | ok |
| React Three Fiber / three | 9.8.2 / 0.186.1 | MIT | still 3D `TesteCelular3D` | ok: 5,9 s o still; 60 quadros em 32 s (swangle) |
| GSAP | 3.15.0 | GSAP Standard "no charge" (uso comercial grátis) | ponte `src/lib/gsap-ponte.ts` no `TesteKit` | ok |
| TypeScript | 5.9.3 | Apache-2.0 | `npx tsc --noEmit` | ok |
| playwright-core | 1.56.1 (casa com o Chromium 1194 da nuvem) | Apache-2.0 | `scripts/testes/gravar-produto.test.mjs` | ok: retângulos iguais em 2 execuções; 1170×2532 conferido |
| FFmpeg / ffprobe | 6.1.1 (da nuvem) | LGPL/GPL | `scripts/testes/qc-evidencias.test.mjs` | ok |
| whisper.cpp | commit `0c7be69` (12/10/2026), modelo `ggml-small` | MIT | `bash scripts/instalar-whisper.sh small` + `audio.test.mjs` | ok (guia "whisper" no corte) |
| espeak-ng (voz guia, nuvem) | 1.51 (apt) | GPL-3 | `audio.test.mjs` | ok; no Mac a voz guia é o `say` |
| Skills Remotion | commit `7ba4dcf` (v4.0.535) | Remotion License | teste de ativação | ok (`docs/testes-ativacao/`) |
| Skills GSAP | commit `aed9cfd` | MIT | teste de ativação | ok |
| Archivo e Archivo Black | cópia de `web/public/fontes/` | OFL | stills `CardMarca-*` | ok |
| ElevenLabs | API (sem SDK) | plano comercial: **a definir** | `audio/gerar-take.mjs --elevenlabs` | **não testado**: falta `ELEVENLABS_API_KEY` no ambiente |
| Firebase CLI (só para o ambiente de demonstração) | 15.34.0 (global) | MIT | `bash testes-e2e/dev-local.sh` | ok |

## Subir na nuvem (sessão nova; o contêiner é apagado)

```bash
cd studio
npm ci
bash scripts/instalar-whisper.sh small          # ~1 min de build + 0,5 GB de modelo (huggingface.co)
sudo apt-get install -y espeak-ng || apt-get install -y espeak-ng   # voz guia
npm run teste                                  # 14 testes (QC, evidências, pontuação, áudio, captura*)
node scripts/testar-render.mjs                 # determinismo + tempo do 3D
```

\* O teste de captura só roda com o ambiente de demonstração no ar; sem ele, é pulado. Para gravar telas:

```bash
npm ci --prefix web && npm ci --prefix functions && npm ci --prefix testes-e2e && npm i -g firebase-tools
bash testes-e2e/dev-local.sh      # EM SEGUNDO PLANO, timeout de 2 h → http://127.0.0.1:5173/brasil
node scripts/gravar-produto.mjs <roteiro.json> assets/<nome>
```

Na nuvem o Remotion usa o Chromium que já está em `/opt/pw-browsers` (não baixe outro). Chave da ElevenLabs:
menu do ambiente no título da sessão → **Edit** → variáveis/segredos, nome `ELEVENLABS_API_KEY` (vale da próxima sessão em
diante). Domínios usados: `registry.npmjs.org`, `github.com`, `huggingface.co`, `api.elevenlabs.io` (todos liberados em
15/10/2026; se algum for recusado, liberar em **Network access → Allowed domains**).

## Mac do dono (render de entrega com 3D pesado e para ouvir a voz final)

```bash
cd studio
npm ci
npx remotion browser ensure
bash scripts/instalar-whisper.sh large-v3-turbo   # opcional (só para alinhar take); precisa de cmake (brew install cmake)
npx tsc --noEmit
npx remotion render src/index.ts <IdDaComposicao> campanhas/<pasta>/render/<slug>-vN.mp4
node scripts/qc.mjs campanhas/<pasta>/render/<slug>-vN.mp4 campanhas/<pasta>/qc --dur <segundos>
```

Depois, arraste o MP4 para o Google Drive: "Somos Organizada · Motion" → `AAAA-MM-DD-<slug>/` (pasta já criada).
No Mac o 3D usa a GPU (`angle`); confira um still 3D nas duas máquinas antes de confiar no visual.

Windows: use o WSL (Ubuntu) e siga os passos da nuvem.

## Comandos do dia a dia

| Para | Comando (dentro de `studio/`) |
|---|---|
| Prévia interativa | `npm run studio` |
| Styleframe | `npx remotion still <Id> campanhas/<pasta>/04-portao-visual/<nome>.png --frame=<n>` |
| Render | `npx remotion render <Id> campanhas/<pasta>/render/<slug>-vN.mp4` |
| QC | `node scripts/qc.mjs <mp4> <pasta> --dur <s>` |
| Evidências | `node scripts/evidencias.mjs <mp4> <pasta>` |
| Pontuar a mesa | `node auditoria/pontuar.mjs campanhas/<pasta>/auditoria/rodada-N` |
| Áudio | `audio/gerar-take.mjs` → `alinhar-take.mjs` → `narrar.mjs` → `montar-trilha.mjs` (ver skill do diretor) |

## Licenças

- **Remotion:** grátis para pessoa física e empresa com até 3 funcionários; acima disso, **Company License**.
  **Situação da Conversão Black: a confirmar com o dono** antes da primeira peça publicada.
- **GSAP:** grátis, inclusive uso comercial (licença padrão "no charge" da GreenSock/Webflow).
- **Archivo e Archivo Black:** OFL.
- **Música e SFX:** só com licença comercial **lida** e registrada em `audio/LICENCAS.md`.
- **Voz:** ElevenLabs com plano comercial (Starter ou maior).
- Skills: procedência e licença em `.claude/skills/PROCEDENCIA.md`.
