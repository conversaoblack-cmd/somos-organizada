# Licenças de áudio

Toda música, batida e SFX usados numa peça precisam de **licença comercial lida** e registrada aqui **antes** do render
de entrega. Sem linha aqui = não entra na peça. Cântico real de torcida e gravação de torcida real: proibido.

| Arquivo | Tipo | Origem (link) | Licença (nome e versão) | Uso comercial | Atribuição exigida | Lida por / em | Peças |
|---|---|---|---|---|---|---|---|
| `audio/apresentacao/trilha.wav` (gerada de `partitura.json`) | trilha de percussão (surdo, caixa, repique, tamborim, ganzá) | **síntese do próprio estúdio** (`audio/lib/sintese.mjs`, `audio/gerar-trilha.mjs`): osciladores e ruído com semente, sem amostra gravada de ninguém | autoral do estúdio (Conversão Black / Somos Organizada) | sim | não | diretor do estúdio, 15/10/2026 | apresentação |
| `audio/biblioteca/blume-batucada-valparaiso.mp3` → `audio/apresentacao/trilha-batucada.wav` (`montar-batucada.mjs`) | bateria GRAVADA de batucada (ensaio de uma banda de batucada num galpão em Valparaíso, Chile; só percussão, sem canto) | Felix Blume, "Batucada rehearsal in Chile", https://freesound.org/people/felix.blume/sounds/411465/ (cópia baixada de https://archive.org/details/aporee_38753_44271) | **Creative Commons 0** (CC0 1.0): "You can copy, modify, distribute and perform the sound, even for commercial purposes" | sim | não (CC0) | diretor do estúdio, 15/10/2026 (página do Freesound lida; sem pedido de crédito nem ressalva do autor) | apresentação |
| `audio/sfx/*.wav` (virada, acende, liberado, barrado, entra, sopro, impacto) | efeitos sonoros | **síntese do próprio estúdio** (`audio/gerar-sfx.mjs`) | autoral do estúdio | sim | não | diretor do estúdio, 15/10/2026 | apresentação |

Nota sobre a bateria gravada: o CC0 é do gravador (Felix Blume); a banda gravada é de rua/ensaio, sem música cantada,
arranjo reconhecível ou marca, e não é torcida (a regra acima continua: gravação de torcida real é proibida). Risco
residual baixo; se algum dia houver contestação, a trilha sintetizada (`trilha.wav` com a partitura antiga, no histórico
do Git) volta no lugar. Guardar: página do Freesound e `_ia_meta.xml` do Internet Archive (licença registrada).
Outras gravações avaliadas e descartadas (CC-BY, NC, disco comercial com marcação falsa, voz de rádio): ver
`docs/decisoes.md` (15/10/2026).

Nota: a levada sintetizada é genérica de percussão brasileira (marcação de surdos, caixa em semicolcheias, tamborim sincopado) e
**não reproduz** o toque, a chamada ou o arranjo de nenhuma bateria de torcida real.

## Voz

- ElevenLabs, plano com licença comercial (Starter ou maior). **Plano contratado: a definir com o dono.**
- Voz guia (espeak-ng / `say` do Mac): só para cronometrar; nunca publicada.

## Gerados pelo próprio estúdio (sem terceiros)

- `scripts/testes/audio.test.mjs` gera uma trilha sintética e um "toque" (senoides do ffmpeg) só para teste; não são peça.
