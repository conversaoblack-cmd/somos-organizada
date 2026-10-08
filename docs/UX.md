# Somos Organizada: padrão de UX

Vale para quem mexe em qualquer tela (pessoas e Claude). Objetivo: a torcida tem um site **único** sobre uma
estrutura padrão, e comprar ingresso, virar sócio e gerir a torcida é fácil para quem tem pouca intimidade
com tecnologia, celular simples e internet pré-paga.

## Quem usa (e o que isso exige)

| Quem | Contexto real | Exigência de tela |
|---|---|---|
| Torcedor que compra ingresso | Chega pelo link no grupo do WhatsApp, no celular, muitas vezes com pouco dado | Abrir rápido, entender preço na hora, pagar no Pix sem cadastro longo |
| Sócio | Volta todo mês para pagar e mostrar a carteirinha | Entrar sem lembrar de senha difícil (CPF + senha), ver "em dia" de cara |
| Diretoria e subsede | Organiza caravana pelo celular, entre trabalho e arquibancada | Criar evento e divulgar o link em poucos toques; números claros |
| Portaria | Fila andando, sol, internet ruim | Botão grande, resposta verde/vermelha imediata, sem texto para ler |

## Referências de fora (o que copiamos de cada uma)

- **FanForce (Bélgica)**: plataforma que liga clubes, associações de torcedores e seus membros, com sócios,
  distribuição de ingressos de jogos fora, ônibus e eventos. É o modelo mais próximo do nosso: cada
  associação é uma "loja" com seus membros. [essma.eu](https://essma.eu/partners/fanforce/)
- **Fanbase (Reino Unido)**: ingressos, sócios e comunicação num só sistema para clubes. Lição: sócio e
  ingresso são o mesmo cadastro; o sócio vê o preço dele. [fanbaseclub.com](https://fanbaseclub.com/theclubhouse/best-sports-ticketing-software)
- **DICE**: compra pensada para o celular, preço final sem susto e ingresso preso ao nome (antifraude).
  Lição: mostrar o total com taxa antes de pagar; ingresso nominal com QR.
- **Shopify (lojas)**: mesma estrutura, identidade de cada loja (cores, logo, banner, textos).
  Lição: o tema é dado da torcida, não código; tudo personalizável sem quebrar o layout.
- **GOV.UK (serviços públicos)**: "uma coisa por página" funciona melhor para quem tem pouca confiança
  digital, no celular e para lidar com erros. [GDS](https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/)
- **Baymard (checkout)**: cadastro obrigatório antes de comprar é uma das maiores causas de abandono;
  menos campos, uma coluna, teclado certo no celular. [Baymard](https://baymard.com/blog/mobile-checkout)

## Regras (checklist de toda tela)

1. **Celular primeiro**: tudo funciona em 360 px de largura, sem rolagem lateral. Botões com 44 px ou mais de altura.
2. **Uma decisão por passo** em compra, adesão e cadastro. Passos numerados e "Voltar" sempre visível.
3. **Preço final antes de pagar**: valor + taxa de serviço + total, sem surpresa no fim.
4. **Teclado certo**: CPF, telefone e valores com `inputMode="numeric"`; e-mail com `type="email"`; máscara enquanto digita.
5. **Erro que ensina**: diz o que aconteceu e o que fazer ("Cartão recusado pelo banco: tente outro cartão ou pague no Pix"),
   nunca código técnico.
6. **Linguagem de torcedor**: frases curtas, sem jargão ("Entrar", "Meus ingressos", "Pagar mensalidade").
7. **Separação de torcidas**: dentro de `/{torcida}` só aparece a marca e as cores da torcida; a Somos Organizada
   só no rodapé. Login do torcedor e do sócio é no site da torcida; o "Entrar" do nosso site é só da diretoria
   e pergunta primeiro qual é a torcida.
8. **Link direto para tudo que se divulga**: evento = `/{torcida}/e/{codigo}` (6 caracteres, nunca muda), com
   prévia no WhatsApp (imagem, data, preço) e QR Code para cartaz.
9. **Leve**: página inicial estática (Lighthouse 100); páginas da torcida sem imagens gigantes (o painel deve
   reduzir fotos antes de subir).
10. **Contraste AA** (4,5:1 em texto) com qualquer cor que a torcida escolher: o tema corrige cor ilegível.
11. **Verde só para "deu certo"** (pago, em dia, entrada liberada); a marca é azul e amarelo; dentro da torcida, as cores dela.

## Próximas melhorias (uma por vez, nesta ordem)

1. **Ingresso salvo no celular**: botão "Salvar ingresso" (imagem com QR, nome e evento) para mostrar na portaria
   sem internet.
2. **Entrar sem senha**: código de acesso por WhatsApp ou e-mail para quem esqueceu a senha (exige avaliar custo
   da API do WhatsApp).
3. **Site ainda mais único**: escolha de fonte do título (3 opções), galeria de fotos, história da torcida, redes sociais
   e contagem regressiva para o próximo evento.
4. **Modelos de evento** no painel (caravana, festa, jogo) com campos já preenchidos.
5. **Painel em 1 toque no celular**: atalhos para "Novo evento", "Divulgar link" e "Vendas de hoje".

## Skills de UX/UI para quem desenvolve com Claude Code

Conferidas no GitHub em 08/10/2026 (todas com mais de 1.000 estrelas e 500 forks):

| Skill | Estrelas | Forks | Para quê | Instalar |
|---|---|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) (frontend-design e outras, oficial) | 180k | 21,3k | Interfaces com cara própria, fugindo do visual genérico | `/plugin marketplace add anthropics/skills` |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 133,9k | 14,2k | Sistema de design: estilos, paletas, fontes, regras de UX | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` |
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | 93,8k | 6,4k | Layout, tipografia, espaçamento e movimento com "bom gosto" | `npx skills add https://github.com/Leonxlnx/taste-skill` |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | 78,6k | 4,7k | Comandos de crítica, auditoria e polimento de telas | `/plugin marketplace add pbakaus/impeccable` |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 32,1k | 2,8k | 100+ regras de acessibilidade, desempenho e UX; boas práticas de React | `npx skills add vercel-labs/agent-skills` |
