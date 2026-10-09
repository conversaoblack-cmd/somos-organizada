# Suíte de navegador

Os fluxos críticos pela **tela**, como uma pessoa faria (Playwright + Chromium), contra os emuladores e a
Pagar.me simulada. Existe porque o `fluxo.test.mjs` testa servidor e regras pelo SDK e não pega erro de tela:
o cadastro de diretoria caiu em produção ("q is not a function") só no Chrome novo, em que `scrollIntoView`
passou a devolver uma Promise.

```bash
bash testes-e2e/navegador.sh          # ~5 min com o ambiente de pé; ~7 min subindo do zero
```

Se o ambiente local (`testes-e2e/dev-local.sh`) já estiver de pé, a suíte usa ele e não derruba. Se não estiver,
sobe, roda e derruba no fim. Código de saída diferente de 0 = algum fluxo falhou. Na primeira vez instala o
Playwright em `testes-e2e/node_modules` e, se faltar, baixa o Chromium dele.

## O que roda

Cada fluxo roda em 4 combinações: modo **normal** e **chrome-novo** (os métodos de rolagem de `Element` e
`window` devolvem `Promise.resolve()`), em **360x740** (celular, toque) e **1280x800**.

| # | Fluxo |
|---|---|
| 1 | Cadastro de diretoria: conta → confirmar e-mail (link do emulador aberto em `/verificar`) → Torcida (paleta e seletor de cor) → Pessoa → Entidade (com CNPJ; no chrome-novo troca para sem CNPJ) → Revisão → Em análise. Recarregar em cada passo; outro navegador com o mesmo e-mail ("Continuar meu cadastro"); `/entrar` oferece continuar |
| 2 | Equipe aprova em `/plataforma` → a tela do cadastro muda sozinha → diretoria entra em `/{slug}/admin` |
| 3 | Diretoria da `brasil`: plano de sócio com benefícios; evento criado já publicado (`publicarEvento`); link `/brasil/e/{codigo}` e QR de divulgação; página pública |
| 4 | Torcedor não sócio: link do evento → 2 ingressos no Pix (cria a conta) → Pix pago → ingressos com QR no pedido e em `/brasil/conta` → e-mail registrado (`sem_provedor`) → link do e-mail abre a conta com CPF e senha |
| 5 | O mesmo torcedor vira sócio no Pix → carteirinha com QR e benefícios → sai → entra pelo site com CPF + senha → carteirinha e ingressos → "Esqueci minha senha" pelo CPF → senha nova |
| 6 | Portaria: código → Liberado; mesmo ingresso pelo QR → Já utilizado; código inexistente e QR forjado → recusados; sem internet → Sem conexão (nunca Inválido) |
| 7a/7b | **Pendente** (`todo`): sem internet, `/brasil/conta`, `/brasil/socio` e `/brasil/socio/ingressos` recarregados mostram o QR. Roda sempre e aparece no resumo; não reprova a suíte. Com `EXIGIR_SEM_INTERNET=1` passa a reprovar |

**Reprova na hora:** qualquer `pageerror`; qualquer `console.error` fora da lista de esperados (cada exceção
está no próprio fluxo, com o motivo, via `comErrosEsperados`); a tela "Algo deu errado nesta tela"; rolagem
horizontal em 360 px nas telas do torcedor (e da portaria).

## Variáveis

| Variável | Padrão | Para quê |
|---|---|---|
| `NAVEGADOR_ALVO` | `build` | `build`: site de produção minificado, com service worker (`vite build --mode emulador` + `vite preview` na 4173). `dev`: Vite na 5173, com os avisos do React de desenvolvimento (sem service worker: o fluxo 7 sempre falha) |
| `NAVEGADOR_MODOS` | `normal,chrome-novo` | só um modo |
| `NAVEGADOR_LARGURAS` | `360,1280` | só uma largura |
| `NAVEGADOR_FLUXOS` | todos | ex.: `1,2` (os que dependem de um fluxo fora da lista são pulados) |
| `EXIGIR_SEM_INTERNET` | — | `1` torna o fluxo 7 obrigatório |
| `NAVEGADOR_DEBUG` | — | `1` mostra no terminal o console de todas as páginas |
| `NAVEGADOR_SAIDA` | `/tmp/somos-navegador` | resumo (`resumo.md`, `resultados.json`), erros esperados, telas e diário de cada falha |
| `CHROMIUM_PATH` | do Playwright | outro executável do Chromium |

## Quando falha

O terminal mostra o passo, a mensagem e a **causa provável** (erros do navegador e o texto de "Detalhes técnicos"
da tela de erro). Em `$NAVEGADOR_SAIDA/<modo>-<largura>/` ficam a foto de cada página e o diário do aparelho
(navegações e todo o console). Cada rodada usa nomes, e-mails e CPFs novos, então dá para repetir sem reiniciar
os emuladores. Para respeitar o limite de 6 eventos à venda do plano da `brasil`, o fluxo 3 encerra (direto no
emulador) os eventos "Caravana Navegador" deixados por rodadas anteriores.

## Arquivos

- `../navegador.sh`: sobe/usa o ambiente, gera o build, roda e derruba.
- `suite.test.mjs`: a matriz (node:test), dependências entre fluxos e o resumo.
- `lib.mjs`: aparelhos (contextos), vigia de erros, emuladores (Auth, Firestore REST, Pagar.me simulada), CPF.
- `fluxos/*.mjs`: um arquivo por fluxo.
