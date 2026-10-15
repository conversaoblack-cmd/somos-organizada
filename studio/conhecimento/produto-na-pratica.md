# O produto na prática (mapa para roteiro e avaliação)

Levantado em 15/10/2026 no código (branch com `da0d31f` do produto) e no ambiente de demonstração. Caminhos relativos à
raiz do repositório. Use junto com `verdade-do-produto.md` (o que é comunicável).

## Jornada da diretoria (cadastro → primeira venda)

- Landing promete "Do cadastro à primeira venda em 4 passos" (`web/src/landing/Landing.tsx:520-528`): 1 Cadastre a
  torcida · 2 Monte tudo em modo demonstração · 3 Conecte a conta da torcida (Pagar.me) · 4 Publique e divulgue o link.
- `/cadastro` tem 8 etapas (Conta, E-mail, Torcida, Pessoa, Entidade, Revisão, **Vídeo**, Análise); CNPJ não é obrigatório;
  o **vídeo de verificação** é obrigatório (documento, sede, 2+ testemunhas) e a equipe aprova em ~1 dia útil.
- Painel `/{torcida}/admin` → "Primeiros passos" (9 itens); "Publicar site" exige escudo, 1 módulo e pagamentos
  (Pagar.me ou modo demonstração). A 1ª mensalidade da plataforma vence 7 dias depois de publicar.
- Menu: Visão geral · Primeiros passos · Eventos · Pedidos e ingressos · Sócios · Financeiro · Pagamentos · Planos de
  sócio · Personalizar página · Publicar site · Sedes · Portaria · Usuários do painel · Ver página da torcida.

## Jornada do torcedor

- Site `/{torcida}`: abas "Eventos" e "Seja sócio"; cada evento mostra preço de sócio e de público "+ taxa".
- Compra: Ingressos → Titulares → Pagamento; resumo com "Taxa de serviço (10%)" e Total antes de pagar; ingresso
  **nominal e intransferível** (nome e CPF conferidos com documento); Pix ("Aprovação na hora") ou cartão.
- Pix: QR + "Copiar código Pix" + "Já paguei"; confirmado → "Pagamento confirmado!".
- Ingresso (`Bilhete.tsx`): canhoto picotado, QR, titular, código K7QM-2XRA, "Salvar ingresso (imagem)".
- **Sem internet:** o QR do ingresso e a carteirinha ficam no celular do torcedor ("O QR continua valendo na portaria").
- Sócio: adesão em 4 passos; cartão com cobrança automática; Pix com cobrança gerada 5 dias antes + lembrete por e-mail.
- Carteirinha (`/{torcida}/socio`): "Sócio oficial", foto, nº, plano, "Você está em dia — Preço de sócio liberado nos
  ingressos no seu nome". Vira e mostra o QR de "Conferência".

## Portaria (`/{torcida}/portaria`)

- Câmera ou "Digitar CPF / QR"; contadores "Liberei agora", "Entraram", "Vendidos".
- Resultados em tela cheia: **LIBERADO** (verde, "Entrada liberada."), **JÁ UTILIZADO** (âmbar, "Entrou às HH:MM"),
  **INVÁLIDO** (vermelho), **NÃO ENCONTRADO**, **OUTRO EVENTO**, **SEM CONEXÃO** (azul). Precisa de internet.

## Dinheiro

- Taxa 10% (`functions/src/config.ts:40`), sobre cada ingresso e mensalidade, **sempre fica com a torcida** (com divisão,
  o valor do ingresso vai para a subsede e a taxa vai inteira para a torcida: `functions/src/dominio/split.ts`).
- Visão geral: card "Taxa de serviço (caixa)". Financeiro: "Vendido (sem a taxa)", "Taxa de serviço — Caixa da
  diretoria", "Já repassado", "A repassar", saldo por sede, extrato, "Baixar planilha", "Registrar repasse".

## Cuidados para o vídeo (o código NÃO confirma)

1. **"Um caixa que toda a torcida pode conferir"** não é página pública: a prestação de contas é o painel + a planilha
   que a diretoria baixa e mostra. Diga "números que a diretoria pode mostrar" / "prestar contas com a planilha".
2. **Print de QR válido e ainda não usado entra uma vez.** O que barra é o uso único (+ nome com documento). Diga
   "cada QR entra uma vez só; o segundo é barrado" — nunca "print é barrado" sem contexto.
3. **A portaria não lê a carteirinha** (só ingresso). Nunca mostre carteirinha sendo lida na portaria.
4. O vídeo de verificação do cadastro existe e é anti-fraude: pode aparecer como segurança, não como atrito escondido.
5. Preço de sócio vale para 1 ingresso por evento, no nome do sócio.
6. Estorno é feito na Pagar.me, não no painel.

## Telas para gravar (ambiente local, senha `senha123456`)

| Tela | Rota | Conta |
|---|---|---|
| Site da torcida | `/brasil` (roda `node scripts/semente-estudio.mjs` antes: escudo e cores fictícios) | — |
| Evento e compra | `/brasil` → "Caravana para a Final" → "Comprar ingresso" (cartão aprova direto) | — |
| Carteirinha | `/brasil/socio` | socio@brasil.test |
| Ingresso com QR | `/brasil/socio/ingressos` → "Caravana para a Final" → "Mostrar ingresso (QR)" | socio@brasil.test |
| Portaria | `/brasil/portaria` → "Caravana para a Final" → "Toque para começar" → "Digitar CPF / QR"; CPF 39053344705 = LIBERADO, repetir = JÁ UTILIZADO | portaria@brasil.test |
| Visão geral / Financeiro | `/brasil/admin`, `/brasil/admin/financeiro` | diretoria@brasil.test |
| Subsede | `/brasil/admin/financeiro`, `/brasil/admin/recebimentos` | subsede4@brasil.test |
