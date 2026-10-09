# Implantação: colocar a Somos Organizada no ar

Passo a passo para subir o sistema num projeto Firebase **novo** (separado do `brasil-estrutura`,
que continua como demonstração antiga). Comandos pensados para o PowerShell do Windows.
Tempo estimado: 40 minutos.

## 1. Criar o projeto Firebase

1. https://console.firebase.google.com → **Adicionar projeto** → nome `somos-organizada`.
   Se o ID `somos-organizada` já estiver em uso, o Firebase sugere outro (ex.: `somos-organizada-1a2b`);
   anote o ID e troque em `.firebaserc`.
2. **Plano Blaze**: Console → ⚙️ → Uso e faturamento → Modificar plano → Blaze.
   Sem ele não existem Cloud Functions, e sem Functions não há pagamento seguro.
   Configure um alerta de orçamento (ex.: R$ 100/mês). No começo o custo fica perto de zero.

## 2. Ligar os serviços (Console)

| Serviço | Onde | O que fazer |
|---|---|---|
| Authentication | Criação → Authentication → Método de login | Ativar **E-mail/senha** e **Anônimo** (o anônimo permite comprar ingresso sem criar conta) |
| Authentication | Configurações → Domínios autorizados | Adicionar `somosorganizada.com.br` |
| Firestore | Criação → Firestore Database | Criar no modo **produção**, local **southamerica-east1 (São Paulo)** |
| Storage | Criação → Storage | Criar com o mesmo local |
| App Web | ⚙️ Configurações do projeto → Seus apps → `</>` | Registrar app "web". Copie o objeto `firebaseConfig` |

## Atalho: tudo de uma vez

Depois dos passos 1 e 2 (criar o projeto e ligar os serviços no console), um único comando faz o resto:
gera e guarda as chaves, configura o app Web, roda os testes, faz o build e o deploy.

```bash
git clone https://github.com/conversaoblack-cmd/somos-organizada.git
cd somos-organizada && git checkout claude/firebase-access-oxibba
bash scripts/implantar.sh
```

No Windows, rode no Git Bash ou no WSL. Os passos 3 a 6 abaixo são o mesmo processo feito à mão.

## 3. Preparar a máquina

```powershell
npm install -g firebase-tools
firebase login
git clone https://github.com/conversaoblack-cmd/somos-organizada.git
cd somos-organizada
git checkout claude/firebase-access-oxibba
npm --prefix functions install
npm --prefix web install
```

## 4. Segredos do servidor

Gere duas chaves aleatórias e grave como segredos (ficam no Secret Manager do Google, nunca no código):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
firebase functions:secrets:set MASTER_KEY      # cole a 1ª chave gerada
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
firebase functions:secrets:set QR_HMAC         # cole a 2ª chave gerada
```

- `MASTER_KEY` cifra as chaves Pagar.me de cada torcida. **Se for perdida ou trocada, todas as torcidas
  precisam colar as chaves de novo.** Guarde uma cópia num cofre de senhas.
- `QR_HMAC` assina os QR Codes. Se trocar, ingressos já emitidos deixam de passar na portaria.

Parâmetros não secretos (crie `functions/.env`):

```
URL_APP=https://somosorganizada.com.br
PLATAFORMA_EMAILS=conversaoblack@gmail.com
```

`PLATAFORMA_EMAILS` são os e-mails da equipe que podem ativar o acesso ao painel `/plataforma`
(separe por vírgula).

## 5. Configuração do front-end

Crie `web/.env.production.local` com os dados do app Web (passo 2):

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=somos-organizada.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=somos-organizada
VITE_FIREBASE_STORAGE_BUCKET=somos-organizada.firebasestorage.app
VITE_FIREBASE_APP_ID=1:...:web:...
VITE_VERSAO=1.0.0
```

## 6. Publicar

```powershell
npm --prefix web run build
firebase deploy
```

O primeiro deploy demora (cria funções, índices e agendamentos). Se o CLI perguntar se pode dar ao Storage acesso de leitura ao Firestore, responda **sim**: as regras do Storage consultam quem é diretoria. Se aparecer erro de índice ainda
"building", espere alguns minutos e rode `firebase deploy --only firestore:indexes` de novo.

## 7. Domínio

Endereços:
- `somosorganizada.com.br/{torcida}`: página da torcida (ingressos e adesão de sócio);
- `somosorganizada.com.br/{torcida}/conta`: quem comprou ingresso e não é sócio (meus ingressos);
- `somosorganizada.com.br/{torcida}/socio`: painel do sócio (carteirinha, ingressos, mensalidade, dados);
- `somosorganizada.com.br/{torcida}/admin`: diretoria, subsedes e portaria (cada um vê só o que pode);
- `plataforma.somosorganizada.com.br`: painel da equipe Somos Organizada, em subdomínio próprio para a sessão
  da equipe ficar separada das páginas das torcidas (`somosorganizada.com.br/plataforma` redireciona para lá).

No futuro, a torcida que contratar domínio próprio terá tudo no domínio dela (página **Domínio** do painel).

Passos:
1. Firebase Console → Hosting → **Adicionar domínio personalizado**: `somosorganizada.com.br`,
   `www.somosorganizada.com.br` (redirecionando para o principal) e `plataforma.somosorganizada.com.br`.
   Se o domínio estava em outro projeto, remova de lá antes.
2. No Registro.br, cole só o que o Firebase pedir para cada um.
3. Rode `bash scripts/implantar.sh`. Ele:
   - grava `URL_APP=https://somosorganizada.com.br` em `functions/.env` (links de e-mail, convites e webhook);
   - liga o painel da equipe em `plataforma.` só quando esse endereço já responde (antes disso fica em `/plataforma`);
   - autoriza os domínios no login do Firebase se o `gcloud` estiver logado (senão: Authentication →
     Configurações → Domínios autorizados → adicione os três).
   Para outro domínio: `DOMINIO=meudominio.com.br bash scripts/implantar.sh`.

### Chaves de segurança: nunca recriar

`scripts/implantar.sh` nunca cria nem troca a MASTER_KEY e a QR_HMAC de um projeto que já existe: ele confere a
existência pelos metadados do segredo e, se não conseguir confirmar (login com outra conta, falta de permissão,
sem internet), **para sem alterar nada**. Trocar a MASTER_KEY deixaria ilegíveis as chaves Pagar.me das torcidas;
trocar a QR_HMAC invalidaria ingressos e carteirinhas. Casos especiais, sempre de propósito:
- projeto novo, sem torcidas: `CRIAR_CHAVES=1 bash scripts/implantar.sh` (pede para digitar o nome do projeto);
- segredo apagado por engano no Google: `RESTAURAR_CHAVES=1 bash scripts/implantar.sh` (usa a cópia local da
  máquina onde a chave foi criada, em `~/.somos-organizada/<projeto>`).

## 8. Primeiro acesso da equipe

1. Abra `https://somosorganizada.com.br/plataforma`, crie a conta com o e-mail de `PLATAFORMA_EMAILS`
   (o painel pede a verificação do e-mail) e clique em **Ativar acesso da equipe**.
2. Em **Configurações**: cadastre a **chave Pix** que recebe as mensalidades da plataforma, o nome e a cidade
   do recebedor e confira os valores dos planos. Padrão: **Torcida Pro** R$ 197 (até 300 sócios e 3 eventos à venda),
   **Torcida Plus** R$ 347 (até 600 sócios e 6 eventos) e **Torcida Max** R$ 997 (até 2.000 sócios e 20 eventos).
   A equipe muda só o preço; nome e limites são fixos no código (`functions/src/api/saas.ts`, `SAAS_PADRAO`).
3. Torcidas novas chegam pelo cadastro da página inicial (`/cadastro`) e aparecem em **Solicitações**: aprovar cria
   a torcida e libera o painel para o diretor (ele entra com a mesma conta do cadastro). Também dá para criar
   direto em **Torcidas → Nova torcida**.
4. **Mensalidades**: a 1ª fatura sai 7 dias depois de a torcida publicar o site; as seguintes 5 dias antes de vencer.
   Pagamento só no Pix, sem multa nem juros. Ao receber, toque em **Confirmar Pix recebido**.
   Com 7 dias de atraso o site da torcida sai do ar sozinho e volta na confirmação.
5. **Limites do plano** (todos os planos têm todos os recursos; muda só o tamanho). Valem a partir da assinatura
   (quando a diretoria publica o site); antes disso, não há limite.
   - **Sócios** = ativos + inadimplentes + em análise (contador `stats/geral.socios`). No limite, `aderirSocio`
     recusa só **novas** adesões ("As novas associações desta torcida estão pausadas no momento. Fale com a
     diretoria."). Quem já é sócio renova normalmente e a diretoria pode reativar sócio pelo painel.
   - **Eventos à venda** = publicados com data no futuro. Só o servidor publica evento (ação `publicarEvento`;
     as regras recusam `status: "publicado"` vindo do navegador, salvo editar um evento que já está publicado).
     No limite, a publicação é recusada e o painel leva a diretoria para **Plano Somos Organizada**.
   - Escolher ou trocar de plano (`publicarSite`, `alterarPlanoSaas`) é recusado se o uso de hoje não couber no
     plano novo. O preço novo vale na próxima fatura; os limites, na hora.
   - Torcidas antigas: os ids `pequena`, `grande` e `gigante` gravados em assinaturas e faturas são lidos como
     `pro`, `plus` e `max` (`normalizarPlano`, igual no servidor e no painel). Não existe mais plano automático
     por número de sócios.

## 9. Onboarding de cada torcida (feito pela diretoria)

### Como o dinheiro é dividido (split)

- Cada torcida usa **a própria conta Pagar.me** (tipo PSP, com split liberado: confirme com a Pagar.me).
- Cada **subsede vira um recebedor** dentro dessa conta. Quem cadastra é o diretor da subsede, no painel dele
  (CPF, conta bancária e prova de vida da Pagar.me). A diretoria só vê o status, nunca os dados.
- Venda de evento de subsede: o **valor do ingresso cai direto na conta da subsede** (ela paga as tarifas da
  Pagar.me e responde por chargeback); os **10% de taxa caem inteiros na conta da torcida**.
- Eventos da sede principal: tudo na conta da torcida.
- Evento de subsede só vai para a página depois que a **diretoria aprova**, e a aprovação só é liberada com a
  conta de recebimento da subsede **ativa**.
- Mensalidade de sócio: a diretoria escolhe em Personalização se vai para a subsede do sócio (com split) ou para a torcida.


Tudo guiado no painel `/{torcida}/admin`:

1. **Pagamentos**: criar conta na Pagar.me, colar chave secreta + pública, cadastrar o domínio
   `somosorganizada.com.br` na Pagar.me (necessário para cartão) e configurar o webhook com a URL
   mostrada no painel. Depois, **ativar a divisão (split)** informando o ID do recebedor principal (`rp_...`).
2. **Sedes e usuários**: cadastrar as subsedes/distritos e convidar o diretor de cada uma (ele recebe um
   e-mail para criar a senha). Cada diretor de subsede entra em **Recebimentos** e cadastra a conta dele.
3. **Planos**: mensal, anual, mirim...
4. **Eventos**: criar e publicar (o número de eventos à venda ao mesmo tempo depende do plano Somos Organizada).
5. **Personalização**: cores, logo, banner e textos.
6. **Usuários**: convidar subsedes e portaria.

Recomendado: fazer a 1ª venda com chaves de **teste** (evento de R$ 1,00) e só depois trocar para as de produção.

Sem conta na Pagar.me ainda? Em **Pagamentos → modo demonstração** o sistema simula a Pagar.me (nenhum dinheiro
circula), seguindo o simulador oficial: cartão `4000 0000 0000 0010` aprova, `4000 0000 0000 0028` recusa; Pix e
prova de vida da subsede têm botão "Simular". Depois é só trocar pelas chaves reais.

### Recorrência do sócio

- A Pagar.me não oferece Pix Automático (out/2026) e a assinatura dela não aceita Pix nem divide o valor (split).
  Por isso a renovação é feita pelo próprio sistema:
  - **Pix**: 5 dias antes do vencimento o sistema gera o Pix do ciclo (válido por 7 dias); o sócio paga pelo painel.
  - **Cartão**: cobrado no vencimento no cartão salvo. Recusa que pode passar depois (saldo, banco fora do ar)
    é tentada de novo todo dia por até 15 dias; recusa definitiva (vencido, bloqueado, dados errados) **para** de
    cobrar aquele cartão (as bandeiras penalizam insistir) e pede cartão novo ou Pix.
  - O motivo aparece em linguagem simples, a partir do código ABECS que a Pagar.me devolve.

### E-mails automáticos

O Firebase não tem servidor de e-mail próprio, então os e-mails saem pela API do **Brevo** (recomendado:
grátis até 300/dia) ou do **Resend**. O sistema reconhece pela chave (`xkeysib-...` ou `re_...`).

Que e-mails saem (todos com a cor e o escudo da torcida, e **nenhum leva ingresso, QR ou carteirinha**;
todos levam a pessoa para a conta dela):
- compra de ingresso confirmada (para quem comprou, sócio ou não);
- "tem ingresso no seu nome" (para o sócio, quando outra pessoa compra no CPF dele);
- associação ou renovação confirmada;
- lembrete do Pix da mensalidade (quando a cobrança é gerada, 5 dias antes) e no dia do vencimento;
- cartão recusado na renovação (motivo em linguagem simples e o que fazer).

Cada e-mail sai uma única vez (registro em `torcidas/{id}/emails`, sem o conteúdo).

Como ligar:
1. Crie a conta no Brevo e, em **Remetentes e domínios**, autentique o domínio `somosorganizada.com.br`
   (o Brevo mostra os registros DNS de SPF, DKIM e DMARC para colar no Registro.br).
2. Em **SMTP e API → Chaves de API**, gere uma chave.
3. Rode `TROCAR_EMAIL=1 bash scripts/implantar.sh` e cole a chave quando o terminal pedir (ela não aparece na
   tela e vai direto para o Secret Manager). Nunca cole a chave em chat.
4. Remetente padrão: `Somos Organizada <nao-responda@somosorganizada.com.br>`. Para trocar, adicione
   `EMAIL_REMETENTE=Nome <email@dominio>` em `functions/.env`. O nome exibido é sempre o da torcida.

Sem chave, tudo funciona normalmente; os e-mails só ficam registrados como "sem_provedor".

### Conta do torcedor e portaria

- Toda compra de ingresso cria (ou usa) uma conta: o comprador cria a senha no checkout e depois entra com
  **CPF ou e-mail + senha** em `/{torcida}/conta`. Ingresso comprado por outra pessoa no CPF de um sócio
  aparece também no painel do sócio.
- O login por CPF confere a senha no servidor com a chave pública do app Web (`WEB_API_KEY` em
  `functions/.env`, preenchida pelo `scripts/implantar.sh`).
- Portaria: a diretoria convida o usuário com papel **Portaria**; ele entra em `/{torcida}/admin` no celular ou
  tablet e cai direto no leitor. Portaria/subsede ligada a uma sede só confere eventos dessa sede.

## Rodar localmente (sem tocar em nada real)

```bash
bash testes-e2e/dev-local.sh     # Linux/macOS/WSL; precisa de Java para os emuladores
```

Sobe os emuladores, uma Pagar.me simulada e a torcida de demonstração em `http://127.0.0.1:5173/brasil`.

## Testes

```bash
npm --prefix functions test       # regras de preço, taxa, criptografia, QR
bash testes-e2e/rodar.sh          # 12 cenários ponta a ponta nos emuladores
```

## Custos a acompanhar

Quem paga o quê:
- **Somos Organizada**: plano Blaze do Firebase (Functions, Firestore, Hosting, Storage, agendamentos,
  Secret Manager), o serviço de e-mail e o domínio. A mensalidade das torcidas entra por Pix copia e cola
  direto na conta, sem gateway (confira se o seu banco cobra tarifa por Pix recebido na conta PJ).
- **Torcida e subsedes**: tarifas da Pagar.me nas vendas de ingresso e mensalidades de sócio (na conta delas).


- Cloud Functions: 6 serviços (a `api`, que atende todas as chamadas, o webhook, a prévia dos links para o WhatsApp e 3 rotinas agendadas).
- Firestore: leituras do painel e da página pública.
- Cloud Scheduler: 3 jobs (cabe na cota gratuita de 3 jobs por conta).
- Secret Manager: 3 segredos (centavos por mês).
