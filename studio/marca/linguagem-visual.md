# Linguagem visual

Fonte: prompt do estúdio (seção 2.2). O território é **proposta**: o portão visual da primeira peça aprova ou derruba.

## Território: "o mosaico da arquibancada"

- Os 4 quadrados do logo viram as placas de um **mosaico de arquibancada** (o "bandeirão" de cartões que a torcida monta).
- Cada sócio em dia é uma placa que acende; o caixa da torcida é o mosaico se completando.
- Nenhuma outra marca de pagamento ou ingresso usaria isso. É a imagem da torcida **organizada**.
- Componente: `src/biblioteca/Mosaico.tsx` (placas que viram em `rotateX`, como o cartão erguido, em onda com variação
  por semente: o mosaico humano nunca vira em sincronia perfeita).

## Luz

- Refletor de estádio à noite, vindo de cima e da frente, sobre o fundo `#070A12`.
- Azul nas ações. Amarelo quando o dinheiro "entra".
- Nunca luz de balada ou de cassino.

## Profundidade (3 planos no mínimo)

1. Fundo: arquibancada desfocada e mosaico.
2. Meio: celular ou cartão do produto (`Celular3D.tsx`, `RecorteApp.tsx`).
3. Frente: texto e legenda numa faixa (`FaixaTexto.tsx`, `Legenda.tsx`).

## Movimento

- Firme e coletivo: blocos que se alinham, placas que viram, contagem que sobe. Nada de "flutuar" genérico.
- Easing de entrada rápido, assentamento curto (`src/lib/movimento.ts`: `ENTRADA`, `FIRME`).
- Só o essencial se mexe ao mesmo tempo.
- Nada parado 1 s ou mais sem motivo (push-in lento, brilho pulsando).

## Transição

- "Virada de placa" (`src/biblioteca/transicoes.tsx`), como um cartão do mosaico virando, ou corte seco no tempo da música.
- Proibido: wipe genérico de apresentação.

## Zonas e checklist

- Zona essencial por formato: `src/formatos.json` (seção 6.4 do prompt). Checklist de direção de arte: seção 6.2.

## A definir com o dono

- Referências visuais que ele gosta (perfis, campanhas).
- Se aparecem pessoas filmadas (torcedores reais exigem autorização de imagem).
