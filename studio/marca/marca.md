# Marca: Somos Organizada

Fonte: prompt do estúdio (seção 2.1), preenchido em 15/10/2026 a partir do código do produto e das respostas do dono.
O que está **"a definir"** fica assim e é perguntado ao dono antes de usar. Nenhuma peça usa um "a definir" que a afete.
No código, a única fonte de verdade é `src/marca/tokens.ts` (mesmos valores daqui).

## Nome e o que é

- **Nome:** Somos Organizada. O rodapé do site diz "Uma solução Conversão Black"; a Conversão Black é a agência do dono e
  a marca dela **não** aparece nas peças da Somos Organizada.
- **O que é:** plataforma para **diretorias de torcidas organizadas**. Reúne programa de sócios, venda de ingressos
  (eventos, caravanas, festas) e portaria com QR Code. O dinheiro cai direto na conta da torcida e de cada subsede.

## Promessa e frases já usadas

- **Promessa (abertura do site):** "Sócio em dia, ingresso sem fraude e o caixa na conta da torcida." No site,
  "caixa na conta da torcida" vem em amarelo.
- **Frases de apoio** (`web/src/landing/Landing.tsx`):
  - "A torcida cresce. O controle continua no caderno e no grupo do WhatsApp."
  - "Tudo o que a torcida vende e controla, num painel só."
  - "O dinheiro da torcida não passa pela gente." / "A Somos Organizada é a ferramenta, não a intermediária."
  - "Cada QR Code entra uma vez só."
  - "Mensalidade que se cobra sozinha."
  - "Do cadastro à primeira venda em 4 passos."
  - "Mensalidade fixa. Nenhuma porcentagem sobre as vendas."
  - "Um caixa que toda a torcida pode conferir."

## Tom de voz

- **3 adjetivos:** direto; de arquibancada (fala a língua da torcida: caravana, subsede, bandeirão, sócio, mensalidade,
  diretoria); transparente (prestação de contas, dinheiro rastreável).
- **3 "nunca":**
  1. violência, briga, provocação a rival, sinalizador ou pirotecnia;
  2. promessa de dinheiro fácil ou de "lucro";
  3. jargão técnico ou de startup ("SaaS", "plataforma disruptiva", "gateway").

## Paleta

Regra da marca: **azul e amarelo, sem verde** (verde é a cor do rival de muitas torcidas).

| Cor | Hex | Semântica no vídeo |
|---|---|---|
| Azul primária | `#2E6BFF` | ação e produto: botão, CTA, toque, o que a pessoa faz |
| Amarelo secundária | `#FFCC00` | o que é da torcida e entra: caixa, dinheiro na conta, destaque da frase-chave |
| Fundo | `#070A12` | noite de estádio; base de todas as cenas |
| Texto | `#F1F4FA` | texto principal |
| Superfícies | `#0F131B`, `#171A23`, `#20242D` | cartões e faixas atrás do texto |
| Texto secundário | `#A1A5AC`; discreto `#888C93` | legenda secundária, linha legal |
| Perigo | `#EF4444` | o problema: calote, fraude, print falso, dinheiro perdido |
| Gradiente do ingresso | `#2E6BFF` → `#1a3a9e` | ingresso e carteirinha |

- **Verde de sucesso (`#22C55E`):** só aparece **dentro de telas do produto** (status "pago"), nunca como cor de marca
  ou de legenda.
- **Semântica completa das cores: a definir** (confirmar com o dono no primeiro briefing).

## Tipografia

Arquivos OFL copiados de `web/public/fontes/` para `public/fontes/`, carregados com `staticFile()` (sem Google Fonts).

- **Archivo Black:** títulos, números de impacto e logotipo, em caixa alta.
- **Archivo** (variável, 100 a 900): corpo e legenda.

## Logo

- Grade 2×2 de quadrados arredondados em azul, amarelo, amarelo e branco-gelo, seguida do nome "Somos Organizada".
- Arquivos (cópias em `marca/logos/`): `icone.svg` (vetor 64×64), `icone-512.png`, `og.png` (1200×630).
- Fundo permitido: escuro (`#070A12`).
- **Área de respiro: a definir** (sugestão: um quadrado da grade em volta; é o que `Logo.tsx` usa até o dono decidir).

## Assinatura do fim de vídeo

Grade 2×2 + "Somos Organizada" + "Cadastre sua torcida" + `somosorganizada.com.br` (`src/biblioteca/CardMarca.tsx`).

- Linha legal: "Só paga depois de publicar o site. Teste grátis em modo demonstração."
- **Sem preço** (decisão do dono, 15/10/2026).

## Marcas de terceiros

- **Nunca** use nome, escudo, uniforme ou cântico de clube ou torcida real sem autorização por escrito.
- Torcida de exemplo é fictícia e rotulada ("Torcida Brasil", "dados de demonstração").
- A semente do ambiente local tem a "Fúria Jovem (Esporte Clube Bahia)": **não usar** (nome de clube real).
