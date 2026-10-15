# Verdade do produto

O vídeo só mostra o que estiver **"Comunicável: Sim"**. Status "produção" = confirmado pelo dono em 15/10/2026.
Fonte: prompt do estúdio (seção 2.3). Caminhos relativos à raiz do repositório.

| Recurso | Plano | Status | Comunicável | Fonte |
|---|---|---|---|---|
| Site próprio da torcida (escudo, cores, eventos, planos de sócio, contatos) em `somosorganizada.com.br/{torcida}` | todos | produção | Sim | `web/src/modulos/publico/PaginaTorcida.tsx` |
| Venda de ingresso de evento, caravana e festa, com Pix e cartão; ingresso nominal; preço de sócio e preço público | todos | produção | Sim | `publico/PaginaEvento.tsx`, `CheckoutIngresso.tsx`, `functions/src/api/ingressos.ts` |
| Dinheiro direto na conta da torcida (Pagar.me); a plataforma não intermedia | todos | produção | Sim | `Landing.tsx` ("O dinheiro da torcida não passa pela gente") |
| Divisão automática do pagamento com subsedes (cada subsede recebe na própria conta) | todos | produção | Sim | `functions/src/api/recebedores.ts` |
| Sócio-torcedor: planos mensal e anual, cartão recorrente, Pix com lembrete ("mensalidade que se cobra sozinha") | todos | produção | Sim | `publico/CheckoutSocio.tsx`, `functions/src/api/socios.ts` |
| Carteirinha digital com QR no celular do sócio | todos | produção | Sim (como identificação do sócio; **a portaria não lê a carteirinha**, só ingresso) | `conta/Carteirinha.tsx`, `functions/src/api/ingressos.ts:462` |
| QR do ingresso e da carteirinha **aparece no celular do torcedor mesmo sem internet** | todos | produção | Sim (com essa frase exata) | `web/src/lib/offline.ts` |
| Portaria com leitor de QR pela câmera do celular; cada QR entra uma vez só (o segundo uso é barrado: "JÁ UTILIZADO") | todos | produção | Sim (não dizer "print é barrado" sem contexto: print de ingresso ainda não usado entra uma vez) | `portaria/Portaria.tsx`, `Leitor.tsx`, `functions/src/api/ingressos.ts:438-509` |
| **A portaria valida sem internet** | — | **não existe**: cada leitura consulta o servidor | **Não** | `Portaria.tsx` (`validarEntrada`) |
| Subsedes com acesso, eventos e caixa próprios | todos | produção | Sim | `admin/Sedes.tsx`, `admin/Recebimentos.tsx` |
| Financeiro, pedidos e repasses, com planilha para prestar contas | todos | produção | Sim (**não** existe prestação de contas pública: "números que a diretoria pode mostrar") | `admin/Financeiro.tsx`, `Pedidos.tsx` |
| Convite para diretoria, subsede e portaria por e-mail | todos | produção | Sim | `functions/src/api/convite.ts` |
| Modo demonstração (testar tudo sem dinheiro de verdade) | todos | produção | Sim | `functions/src/api/demo.ts` |
| Cadastro com vídeo de verificação na sede (anti-fraude) | todos | produção | Sim, como segurança | `functions/src/api/verificacaoVideo.ts` |
| Taxa de serviço de 10% sobre ingresso e mensalidade, paga pelo torcedor, mostrada antes de pagar, que fica com a torcida (cobre as tarifas do Pix e do cartão; o que sobra vira caixa) | todos | produção | **Sim** (dono, 15/10/2026; frase na seção abaixo) | `functions/src/config.ts:40` (`taxaServicoPct: 10`), `functions/src/api/recebedores.ts:3`, `Landing.tsx` |
| Mensalidade fixa, sem porcentagem sobre as vendas; só paga depois de publicar | todos | produção | Sim | `functions/src/api/saas.ts`, `Landing.tsx` |
| **Preços dos planos** (Pro R$ 197 / Plus R$ 347 / Max R$ 997) | — | produção | **Não** (dono: não mostrar preço) | `functions/src/api/saas.ts` |
| Limites dos planos (sócios e eventos simultâneos) | — | produção | Não (só se o dono pedir) | `web/src/lib/tipos.ts` |
| Domínio próprio da torcida | — | só via comercial | **Não** | `admin/Dominio.tsx` |
| Notificações no celular, painel da plataforma, depuração | interno | produção | **Não** (é da equipe) | `functions/src/api/alertas.ts` |

## Taxa de 10%: como falar (decisão do dono, 15/10/2026)

- **Intenção do dono:** a taxa é o dinheiro que forma o **caixa da torcida**; com o caixa, o ingresso precisa cobrir só a
  despesa do evento e pode ficar mais barato.
- **Frase do vídeo (escolhida pelo diretor):** "A taxa de 10% vira caixa da torcida. O ingresso só precisa pagar o evento."
  Variante longa (legenda/post): "A taxa de serviço de 10% é paga pelo torcedor, aparece antes de pagar e fica com a
  torcida: cobre as tarifas e o resto vira caixa. Com caixa, a diretoria pode cobrar no ingresso só o que o evento custa."
- **Cuidados:** nunca "lucro" (é um "nunca" da marca); o preço é decisão da diretoria, então "pode ficar mais barato",
  nunca "fica mais barato" como promessa da plataforma; a taxa cobre primeiro as tarifas do Pix e do cartão
  (`Landing.tsx`, FAQ "Quanto o torcedor paga a mais?").

## Armadilhas já conhecidas

- **Nunca** dizer que "a portaria funciona sem internet". O que funciona sem internet é o **QR no celular do torcedor**;
  a validação na portaria precisa de rede.
- Futuro nunca vira promessa: se não está "produção" + "Sim", não aparece.
- Telas no vídeo: só do produto real (`scripts/gravar-produto.mjs`), com dado fictício rotulado.
