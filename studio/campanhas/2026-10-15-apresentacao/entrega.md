# Entrega · Apresentação (2026-10-15) · ABAIXO DA META (8,49 / 9,0)

> Estado: **peça pronta com a voz final do dono** (render da nuvem `05-producao/apresentacao-final.mp4`, QC 10/10,
> −14,2 LUFS, −1,3 dBTP). Conferência final da mesa (rodada 4): **8,49, abaixo da meta de 9,0**, sem veto nem bloqueio;
> produto, marketing e roteirista APROVA; motion, torcida e estratégia APROVA COM CONDIÇÃO (condições de publicação,
> abaixo). As 2 rodadas de correção foram usadas: a nota é a que a mesa deu, sem inflar. Para publicar faltam as
> escutas do dono, a licença comercial da voz e o render de entrega no Mac.

## Arquivos

- Com voz (nuvem): `05-producao/apresentacao-final.mp4` (fora do Git). Versão leve enviada ao dono no chat.
- MP4 de entrega: render no Mac → Google Drive, pasta **"Somos Organizada · Motion" → `2026-10-15-apresentacao/`**.
- Timeline: `05-timeline.md` · QC: `auditoria/rodada-4-final/qc.json` · Notas: `auditoria/rodada-*/resultado.json`.

## Passos que faltam (nesta ordem)

1. **Voz: feita.** Take do dono importado, cortes conferidos pela transcrição, 5 falas desaceleradas só até 2,6
   palavras/s (rubberband), CTA de 1168 a 1327. **O dono confere ouvindo:** (a) o gancho e "O ingresso só precisa pagar
   o evento" (≈18% mais lentos) soam naturais; (b) "Cada subsede recebe direto" não soa "subsídio" (se soar, gerar só
   essa fala de novo escrevendo "sub-sede"); (c) licença comercial da ElevenLabs (plano Starter ou maior).
2. **Dono ouve a bateria** (trecho 39,5 → 83,2 s de `audio/biblioteca/blume-batucada-valparaiso.mp3`): sem canto nem
   grito de puxador. Se houver, volta a percussão sintetizada (histórico do Git) e a mix e o QC são refeitos.
3. Render de entrega no Mac (`npx remotion render Apresentacao out/apresentacao.mp4 --props='{"audio":"final"}'`) e
   **condição da motion-review:** `node scripts/qc.mjs` com o mesmo resultado (−14 ± 1 LUFS, TP ≤ −1 dBTP, 1350 quadros,
   sem preto nem congelado) e a folha de contato conferida contra `05-producao/evidencias-final/` nos quadros 495, 531,
   612, 936–1056 e 1188–1350 (o 3D por software da nuvem pode sair diferente do Mac). Depois, Drive.
4. Instagram **@somosorganizada**: link da bio para `https://somosorganizada.com.br/cadastro`; publicar o Reels e
   **fixar no perfil**; colar o texto e o comentário fixado abaixo.

## Texto do post (legenda)

```
A torcida cresceu. O caderno não.

A Somos Organizada é o painel da torcida organizada: sócios com mensalidade no cartão ou no Pix com lembrete, ingresso no nome de quem vai (cada QR entra uma vez só na portaria), e o dinheiro direto na conta da torcida e de cada subsede. A gente não toca no dinheiro.

Sobre a taxa de 10%: ela é somada ao valor do ingresso, quem paga é o torcedor, e ela fica no caixa da torcida. O ingresso só precisa pagar o evento, e o caixa cresce a cada venda.

Pra torcida: plano mensal fixo, sem porcentagem das vendas. Só paga depois de publicar o site.

Por segurança, o cadastro termina com um vídeo de verificação gravado na sede (dados de torcida são públicos e a gente não deixa ninguém se passar pela sua). Aprovado o cadastro, dá pra testar tudo em modo demonstração, sem dinheiro de verdade.

Link na bio pra cadastrar sua torcida.

(Torcida Brasil é uma torcida de demonstração. Os dados do vídeo são de exemplo.)
```

## Comentário fixado

```
"10% de taxa? A Somos fica com uma parte?" Não: a Somos Organizada não fica com nada dos 10%. Eles são pagos pelo torcedor junto com o ingresso e vão pra conta da torcida. A Somos não fica com porcentagem de venda nenhuma: a torcida paga um plano mensal fixo, e só depois de publicar o site. Link na bio.
```

Notas para quem publica:
- Não escrever que a taxa "cobre as tarifas" nem que os 10% "chegam limpos": na venda da sede principal, as tarifas da
  Pagar.me saem do total que cai na conta da torcida; na venda de subsede, a subsede paga as tarifas e a taxa vai
  inteira para a torcida (`functions/src/dominio/split.ts`, conferido pela produto-review).
- Sem preço de plano no post, nos comentários e nas respostas (decisão do dono).
- Resposta pronta para torcedor reclamando da taxa: a mesma do comentário fixado.

## Medição (o site não registra `?src=`)

Instagram (retenção nos 3 s ≥ 60%, retenção média ≥ 40%, curva entre 12 e 22 s, toques no link da bio ≥ 1% das contas
alcançadas) + cadastros de torcida nos 7 dias seguintes, perguntando "como conheceu" a cada torcida cadastrada. Se a
retenção média ficar abaixo de 30% sem toque no link, a próxima peça é a de aquisição (tipo F) só sobre "a taxa vira
caixa", com as mesmas gravações.

## Licenças (`audio/LICENCAS.md`)

| Item | Licença |
|---|---|
| Bateria gravada (Felix Blume, "Batucada rehearsal in Chile", Freesound 411465) | CC0 1.0 (prova em `audio/biblioteca/blume-batucada-valparaiso.PROCEDENCIA.md`) |
| Tensão sintetizada e SFX | autorais do estúdio |
| Remotion | licença gratuita (empresa com até 3 pessoas; confirmado pelo dono) |
| Fonte Archivo | SIL Open Font License |
| Voz | ElevenLabs: **plano com licença comercial a confirmar pelo dono** antes de publicar |
| Telas | produto próprio (gravado no ambiente de demonstração; "Torcida Brasil" fictícia e rotulada) |

## Honestidade sobre o que aparece

- Portaria: **leitor real, QR real, câmera simulada** (o navegador "filma" um vídeo do ingresso real; o leitor do
  produto decodifica de verdade). Diretoria: gravada no build de produção, apontado para os emuladores.
- O verde do LIBERADO é a cor real do produto; o CPF aparece mascarado pelo próprio produto (fictício).

## Notas da mesa

| Rodada | Situação | Nota | Observação |
|---|---|---|---|
| 0 · roteiro | INCONCLUSIVA (75% de cobertura) | 7,94 | todas APROVA COM CONDIÇÃO |
| 1 · portão | veto da motion-review | — | direção de arte refeita (v2) |
| 2 · portão | veto derrubado | — | motion e torcida APROVA COM CONDIÇÃO |
| 3 · peça completa | ABAIXO DA META (9,0) | 8,16 | sem veto; produto APROVA, as outras 5 APROVA COM CONDIÇÃO |
| 4 · conferência final | ABAIXO DA META (9,0) | **8,49** | sem veto; produto, marketing e roteirista APROVA; motion, torcida e estratégia APROVA COM CONDIÇÃO (só publicação) |

Notas finais por critério (rodada 4): objetivo 8,50 · clareza 8,83 · gancho 7,83 · visual 8,00 · fidelidade 8,75 ·
cta 8,75 · técnica 9,00.

**Diagnóstico (por que não chegou a 9):**
- **Gancho (7,83):** 7 palavras para ler em 1,5 s, sem algarismo, e a resposta vem pelo lado do sócio. A voz escolhida
  é "Excited, Cheerful" e o roteiro pedia um gancho sério: só a retenção nos 3 s vai dizer.
- **Visual (8,00):** o recorte da cena "A diretoria decide o preço" (828–936) corta texto nas bordas (problema médio novo
  da rodada 4, sem rodada para corrigir); a planilha ficou em ~32 px; detalhes baixos (visor vazio no início da
  portaria, halo verde do LIBERADO nas placas, anel de toque sobre o botão, torres nas bordas).
- **Hipótese não testada:** cinco assuntos em 33 s num perfil novo. A curva de retenção decide; se a média ficar
  abaixo de 30% sem toque no link, a próxima peça é a de aquisição (tipo F) só sobre a taxa.
