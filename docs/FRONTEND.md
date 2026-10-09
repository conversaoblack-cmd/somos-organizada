# Front-end: convenções

App único em `web/` (Vite + React 19 + TypeScript + Tailwind v4 + react-router 7 + Firebase 12).
Um só deploy atende todas as torcidas. A torcida é resolvida pelo endereço: `/:slug/...`.

## Rotas

| Rota | Módulo | Quem usa |
|---|---|---|
| `/` | `modulos/inicio/Inicio` | apresentação da Somos Organizada |
| `/entrar` | `modulos/inicio/Entrar` | login genérico; leva ao painel certo |
| `/plataforma/*` | `modulos/plataforma` | equipe Somos Organizada (claim `plataforma`) |
| `/:slug` (`?aba=eventos\|socios`) | `modulos/publico/PaginaTorcida` | torcedor: calendário de eventos e planos de sócio |
| `/:slug/evento/:id` | `PaginaTorcida` (abre o evento + checkout) | torcedor |
| `/:slug/associar/:planoId?` | `modulos/publico/CheckoutSocio` | adesão de sócio |
| `/:slug/pedido/:id` | `modulos/publico/PaginaPedido` | acompanhar Pix / resultado |
| `/:slug/ingressos/:pedidoId?k=` | `modulos/publico/IngressosDoPedido` | link dos ingressos (sem login) |
| `/:slug/conta/*` | `modulos/conta` | sócio logado |
| `/:slug/admin/*` | `modulos/admin` | diretoria, subsede e portaria |
| `/:slug/portaria` | `modulos/portaria` | leitor de QR na entrada |

## Regras de ouro

- **Dinheiro e status nunca são gravados pelo navegador.** Pedidos, ingressos, sócios, lançamentos,
  credenciais e membros são escritos só pelas Cloud Functions (`web/src/lib/api.ts`).
  O navegador grava direto no Firestore apenas: eventos (menos a publicação, que é `api.publicarEvento` por causa
  do limite do plano), planos, sedes, aparência/textos/contato da
  torcida, repasses (diretoria), chamados e mensagens de suporte, e `logsErro`. As regras estão em
  `firestore.rules`; leia antes de gravar qualquer coisa.
- **Valores em centavos** (`number` inteiro). Use `moeda()` de `lib/formatos.ts` para exibir e
  `Campo mascara="moeda"` + `centavosDeTexto()` para editar.
- **Tema:** use só os tokens (`bg-fundo`, `bg-superficie`, `bg-superficie-2/3`, `border-linha`,
  `text-texto`, `text-texto-2/3`, `bg-primaria`, `text-sobre-primaria`, `bg-secundaria`, `sucesso`,
  `alerta`, `perigo`, `info`). Nunca escreva cores fixas: a página pública troca as cores conforme a torcida.
- **Componentes:** reaproveite `web/src/ui` (Botao, Campo, Selecao, Modal, Gaveta, Abas, Etapas,
  Indicador, Selo, Aviso, Vazio, Carregando, QrCode, Icone, useToast...) e `componentes/LayoutPainel`
  e `componentes/Login`.
- **Dados em tempo real:** `useDocumento` e `useColecao` de `hooks/dados.ts`; contexto da torcida
  com `useTorcida()`, `useMembro(tid)` e `useMinhaFicha(tid)` de `hooks/torcida.tsx`.
- **Erros:** mostre `mensagemDeErro(e)` (lib/api) num toast ou `Aviso`; erros inesperados já são
  registrados automaticamente para a janela de depuração do suporte.
- **Mobile-first:** a maior parte dos torcedores usa celular. Tudo precisa funcionar em 360px de largura.
- Textos em português do Brasil, tom direto e respeitoso.

## Rodando local

```bash
bash testes-e2e/dev-local.sh      # emuladores + Pagar.me simulada + torcida demo + Vite
# http://127.0.0.1:5173/brasil
```

Contas de demonstração (senha `senha123456`): `equipe@somos.test` (plataforma),
`diretoria@brasil.test`, `subsede4@brasil.test`, `portaria@brasil.test`, `socio@brasil.test`.
Cartão de teste: qualquer número válido; terminado em `0002` é recusado.
