# Entrega · Apresentação (2026-10-15) · RASCUNHO

> Estado: **peça montada, sem voz final**. A mesa avaliou a peça completa (rodada 3: 8,16, meta 9,0, sem veto); as
> condições foram aplicadas na última rodada de correção permitida e a conferência final (rodada 4) sai depois do
> render. A voz é gerada pelo dono na ElevenLabs (passo 1 abaixo); com o take, o estúdio refaz a mix, o QC e a entrega.

## Arquivos

- Prévia (sem voz): `05-producao/apresentacao-previa.mp4` (fora do Git). Versão leve enviada ao dono no chat.
- MP4 final: render no Mac, depois da voz → Google Drive, pasta **"Somos Organizada · Motion" → `2026-10-15-apresentacao/`**.
- Timeline: `05-timeline.md` · QC: `auditoria/rodada-3-producao/qc.json` · Notas: `auditoria/rodada-*/resultado.json`.

## Passos que faltam (nesta ordem)

1. **Voz (dono):** colar o bloco de `audio/apresentacao/take/PARA-ELEVENLABS.md` na ElevenLabs (configuração no próprio
   arquivo), baixar e mandar o arquivo no chat. O estúdio corta, alinha e mede cada fala.
   - **Condições da mesa para o take valer:** nenhuma fala acima de 2,6 palavras/s; a fala do CTA começa no quadro 1176 e
     termina **até o quadro 1320**. Se não couber, o estúdio tira "Somos Organizada" da voz do CTA (o nome está escrito
     grande na tela) ou estende o fim da peça segurando o cartão; nunca acelera a voz nem tira "o site".
2. **Dono ouve a bateria** (trecho 39,5 → 83,2 s de `audio/biblioteca/blume-batucada-valparaiso.mp3`): sem canto nem
   grito de puxador. Se houver, volta a percussão sintetizada (histórico do Git).
3. Mix com voz (`node audio/montar-trilha.mjs apresentacao`), QC de novo (−14 LUFS, true peak ≤ −1 dBTP), render no Mac.
4. Instagram **@somosorganizada**: link da bio para `https://somosorganizada.com.br/cadastro`; publicar o Reels e
   **fixar no perfil**; colar o texto e o comentário fixado abaixo.

## Texto do post (legenda)

```
A torcida cresceu. O caderno não.

A Somos Organizada é o painel da torcida organizada: sócios com mensalidade no cartão ou no Pix com lembrete, ingresso no nome de quem vai (cada QR entra uma vez só na portaria), e o dinheiro direto na conta da torcida e de cada subsede. A gente não toca no dinheiro.

Sobre a taxa de 10%: ela é somada ao valor do ingresso, quem paga é o torcedor, e ela fica no caixa da torcida. O ingresso só precisa pagar o evento, e o caixa cresce a cada venda.

Pra torcida: plano mensal fixo, sem porcentagem das vendas. Só paga depois de publicar o site. Dá pra testar tudo antes em modo demonstração, sem dinheiro de verdade.

Por segurança, o cadastro termina com um vídeo de verificação gravado na sede (dados de torcida são públicos e a gente não deixa ninguém se passar pela sua).

Link na bio pra cadastrar sua torcida.

(Torcida Brasil é uma torcida de demonstração. Os dados do vídeo são de exemplo.)
```

## Comentário fixado

```
"10% de taxa? A torcida fica com uma parte?" Fica com tudo: os 10% são pagos pelo torcedor junto com o ingresso e vão pro caixa da torcida. A Somos Organizada não fica com porcentagem de venda nenhuma: a torcida paga um plano mensal fixo, e só depois de publicar o site. Link na bio.
```

Notas para quem publica:
- Não escrever que a taxa "cobre as tarifas": na venda de subsede é a subsede que paga as tarifas da Pagar.me e a taxa
  vai inteira para a torcida (`functions/src/dominio/split.ts`).
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
| 4 · conferência final | a fazer | — | depois do render com as correções da rodada 3 |
