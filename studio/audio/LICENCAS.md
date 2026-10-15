# Licenças de áudio

Toda música, batida e SFX usados numa peça precisam de **licença comercial lida** e registrada aqui **antes** do render
de entrega. Sem linha aqui = não entra na peça. Cântico real de torcida e gravação de torcida real: proibido.

| Arquivo | Tipo | Origem (link) | Licença (nome e versão) | Uso comercial | Atribuição exigida | Lida por / em | Peças |
|---|---|---|---|---|---|---|---|
| `audio/apresentacao/trilha.wav` (gerada de `partitura.json`) | trilha de percussão (surdo, caixa, repique, tamborim, ganzá) | **síntese do próprio estúdio** (`audio/lib/sintese.mjs`, `audio/gerar-trilha.mjs`): osciladores e ruído com semente, sem amostra gravada de ninguém | autoral do estúdio (Conversão Black / Somos Organizada) | sim | não | diretor do estúdio, 15/10/2026 | apresentação |
| `audio/sfx/*.wav` (virada, acende, liberado, barrado, entra, sopro, impacto) | efeitos sonoros | **síntese do próprio estúdio** (`audio/gerar-sfx.mjs`) | autoral do estúdio | sim | não | diretor do estúdio, 15/10/2026 | apresentação |

Nota: a levada é genérica de percussão brasileira (marcação de surdos, caixa em semicolcheias, tamborim sincopado) e
**não reproduz** o toque, a chamada ou o arranjo de nenhuma bateria de torcida real.

## Voz

- ElevenLabs, plano com licença comercial (Starter ou maior). **Plano contratado: a definir com o dono.**
- Voz guia (espeak-ng / `say` do Mac): só para cronometrar; nunca publicada.

## Gerados pelo próprio estúdio (sem terceiros)

- `scripts/testes/audio.test.mjs` gera uma trilha sintética e um "toque" (senoides do ffmpeg) só para teste; não são peça.
