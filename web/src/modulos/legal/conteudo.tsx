/**
 * Textos dos Termos de uso e das Políticas de privacidade.
 *  - Plataforma (/termos, /privacidade): a relação da Somos Organizada com as torcidas (diretoria, subsedes, portaria)
 *    e os dados de quem cadastra e administra uma torcida.
 *  - Torcida (/{torcida}/termos, /{torcida}/privacidade): a relação da torcida com o torcedor que compra ingresso ou
 *    vira sócio. A torcida vende e é a controladora dos dados; a Somos Organizada é a fornecedora da tecnologia (operadora).
 * Os fatos citados aqui (taxa, carência, cobrança da mensalidade, ingresso nominal...) espelham as regras do sistema:
 * mudou a regra no código, mude o texto e a data de atualização.
 */
import type { ReactNode } from "react";

import { ATUALIZADO_EM, EMPRESA } from "./versao";

export { ATUALIZADO_EM, EMPRESA };

export interface Secao {
  id: string;
  titulo: string;
  corpo: ReactNode;
}

export interface InfoTorcida {
  nome: string;
  slug: string;
  taxaServicoPct: number;
  razaoSocial?: string;
  cnpj?: string;
  cidade?: string;
  uf?: string;
  email?: string;
  whatsapp?: string;
}

const Email = () => (
  <a href={`mailto:${EMPRESA.email}`} className="font-semibold text-primaria-texto underline underline-offset-2 break-all">
    {EMPRESA.email}
  </a>
);

const Lista = ({ itens }: { itens: ReactNode[] }) => (
  <ul className="list-disc pl-5 space-y-1.5">
    {itens.map((x, i) => (
      <li key={i}>{x}</li>
    ))}
  </ul>
);

const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} className="font-semibold text-primaria-texto underline underline-offset-2">
    {children}
  </a>
);

export function formatarCnpj(c: string): string {
  const d = c.replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : c;
}

const identificacaoEmpresa = (
  <>
    <strong>{EMPRESA.nome}</strong>, serviço de {EMPRESA.razaoSocial}, CNPJ {EMPRESA.cnpj}, com sede em {EMPRESA.cidade}
  </>
);

/** "Torcida X (Razão, CNPJ ..., Cidade/UF)" ou só o nome quando a torcida ainda não tem esses dados públicos. */
function quemETorcida(t: InfoTorcida): ReactNode {
  const partes = [t.razaoSocial, t.cnpj ? `CNPJ ${formatarCnpj(t.cnpj)}` : "", t.cidade && t.uf ? `${t.cidade}/${t.uf}` : ""].filter(Boolean);
  return (
    <>
      <strong>{t.nome}</strong>
      {partes.length > 0 && ` (${partes.join(", ")})`}
    </>
  );
}

function contatoTorcida(t: InfoTorcida): ReactNode {
  const zap = t.whatsapp?.replace(/\D/g, "");
  if (!t.email && !zap) return <>pelos canais de atendimento informados na página da torcida</>;
  return (
    <>
      {t.email && (
        <>
          pelo e-mail{" "}
          <a href={`mailto:${t.email}`} className="font-semibold text-primaria-texto underline underline-offset-2 break-all">
            {t.email}
          </a>
        </>
      )}
      {t.email && zap && " ou "}
      {zap && (
        <>
          pelo{" "}
          <a href={`https://wa.me/${zap}`} target="_blank" rel="noreferrer" className="font-semibold text-primaria-texto underline underline-offset-2">
            WhatsApp da torcida
          </a>
        </>
      )}
    </>
  );
}

/* ────────────────────────────── Plataforma: Termos de uso ────────────────────────────── */

export function termosPlataforma(): Secao[] {
  return [
    {
      id: "quem-somos",
      titulo: "Quem somos e o que estes termos cobrem",
      corpo: (
        <>
          <p>
            A plataforma {EMPRESA.site} é oferecida por {identificacaoEmpresa}. Nestes termos, “nós” somos a Somos Organizada e “a torcida” é a
            entidade que se cadastra para usar a plataforma, representada pela sua diretoria.
          </p>
          <p>
            Estes termos valem para quem cadastra e administra uma torcida: diretoria, responsáveis por subsedes e porteiros. O torcedor que compra
            ingresso ou vira sócio segue os Termos de uso e a Política de privacidade da própria torcida, que ficam no rodapé da página dela.
          </p>
          <p>Ao criar a conta e enviar o cadastro, você declara que leu e aceita estes termos e a nossa <Link href="/privacidade">Política de privacidade</Link>.</p>
        </>
      ),
    },
    {
      id: "servico",
      titulo: "O que a plataforma faz (e o que não faz)",
      corpo: (
        <>
          <p>A Somos Organizada fornece a tecnologia para a torcida:</p>
          <Lista
            itens={[
              "página pública da torcida, com eventos e planos de sócio;",
              "programa de sócios com cobrança recorrente, carteirinha digital e benefícios;",
              "venda de ingressos nominais com QR Code;",
              "portaria pelo celular, que valida cada ingresso e carteirinha uma única vez, inclusive sem internet;",
              "painel para diretoria e subsedes, com financeiro, relatórios e convites de equipe.",
            ]}
          />
          <p>
            <strong>Não somos organizadores de eventos nem vendedores de ingressos ou planos.</strong> Quem vende, define preços, benefícios e
            regras de entrada, organiza o evento e atende o torcedor é a torcida. Também não recebemos nem guardamos o dinheiro dos torcedores: os
            pagamentos caem direto na conta da torcida na Pagar.me (veja a seção “Pagamentos dos torcedores”).
          </p>
        </>
      ),
    },
    {
      id: "cadastro",
      titulo: "Cadastro da torcida e vídeo de verificação",
      corpo: (
        <>
          <p>
            Só pode cadastrar uma torcida quem tem 18 anos ou mais e representa de verdade a entidade (presidente ou integrante da diretoria com
            autorização). Os dados informados (torcida, responsável, entidade e endereço da sede) precisam ser verdadeiros e ficar atualizados.
          </p>
          <p>
            <strong>Por que pedimos um vídeo:</strong> o nome, a sede e a diretoria de uma torcida organizada são informações públicas. Sem uma
            conferência, qualquer pessoa poderia se cadastrar no lugar da diretoria e receber o dinheiro de ingressos e mensalidades. Por isso o
            cadastro só é analisado depois que o responsável envia um vídeo gravado na sede, mostrando o documento com foto e pelo menos duas
            testemunhas da diretoria ou do conselho, que confirmam que ele representa a torcida.
          </p>
          <p>
            O vídeo fica guardado com acesso restrito (só o próprio responsável e a nossa equipe), como prova de quem fez o cadastro. Ele não é
            publicado nem compartilhado, salvo por ordem de autoridade ou para defesa em caso de fraude.
          </p>
          <p>
            Podemos pedir outro vídeo, pedir documentos (estatuto, ata de eleição, cartão do CNPJ) ou recusar o cadastro quando houver dúvida sobre a
            representação. A aprovação confirma só a conferência feita pela nossa equipe. Ela não é um atestado da regularidade jurídica da entidade.
          </p>
        </>
      ),
    },
    {
      id: "contas",
      titulo: "Contas, senhas e equipe da torcida",
      corpo: (
        <>
          <Lista
            itens={[
              "Cada pessoa usa a própria conta. Login e senha são pessoais e não podem ser compartilhados.",
              "A diretoria convida e remove quem trabalha no painel (diretoria, subsedes e portaria) e responde pelo que essas pessoas fazem com o acesso recebido.",
              "Cada função vê só o que precisa: a subsede não vê sócios, planos, página, domínio nem usuários; a portaria só valida entradas.",
              <>Suspeita de uso indevido de uma conta? Troque a senha e avise a nossa equipe em <Email />.</>,
            ]}
          />
        </>
      ),
    },
    {
      id: "responsabilidades",
      titulo: "Responsabilidades da torcida",
      corpo: (
        <>
          <p>Ao usar a plataforma, a torcida se compromete a:</p>
          <Lista
            itens={[
              "ser a vendedora e a organizadora do que oferece (ingressos, eventos, planos e benefícios) e cumprir o que anunciar;",
              "cumprir as leis aplicáveis, entre elas o Código de Defesa do Consumidor, a Lei Geral de Proteção de Dados (LGPD), a Lei Geral do Esporte (Lei 14.597/2023) e as regras de estádios, federações e autoridades de segurança;",
              "atender os torcedores, inclusive em pedidos de cancelamento, reembolso e sobre dados pessoais;",
              "publicar só conteúdo (escudo, fotos, textos) que tem direito de usar;",
              "não usar a plataforma para cambismo, fraude, incitação à violência, discriminação ou qualquer atividade ilegal;",
              "manter em dia o cadastro na Pagar.me e os dados de contato da página.",
            ]}
          />
        </>
      ),
    },
    {
      id: "pagamentos",
      titulo: "Pagamentos dos torcedores",
      corpo: (
        <>
          <p>
            Para vender, a torcida conecta a <strong>própria conta na Pagar.me</strong> (empresa de pagamentos autorizada). Pix e cartão dos
            torcedores são processados pela Pagar.me e o dinheiro cai direto nessa conta. Quando a torcida ativa a divisão para subsedes, a própria
            Pagar.me reparte os valores entre as contas cadastradas.
          </p>
          <Lista
            itens={[
              "As tarifas da Pagar.me, os prazos de recebimento, os estornos e as contestações (chargebacks) seguem o contrato entre a torcida e a Pagar.me.",
              "A taxa de serviço cobrada do torcedor (percentual mostrado no painel e no pagamento) fica com a torcida. A Somos Organizada não cobra porcentagem sobre as vendas.",
              "As chaves de acesso à Pagar.me ficam guardadas cifradas e só são usadas para criar as cobranças e conferir os pagamentos da própria torcida.",
              "Os dados do cartão são digitados direto para a Pagar.me. Eles não passam pelos nossos servidores.",
            ]}
          />
        </>
      ),
    },
    {
      id: "mensalidade",
      titulo: "Mensalidade da plataforma",
      corpo: (
        <>
          <Lista
            itens={[
              "O uso é cobrado por mensalidade fixa, conforme o plano escolhido. Cada plano tem um limite de sócios e de eventos à venda ao mesmo tempo, e o valor aparece no painel antes de publicar.",
              "Montar a página e testar é gratuito. A cobrança começa quando a torcida publica o site: a primeira fatura vence em 7 dias e as próximas, todo mês no mesmo dia.",
              "O pagamento é por Pix, sem multa e sem juros. A fatura chega por e-mail e fica no painel, em Plano Somos Organizada.",
              "Se a fatura passar 7 dias do vencimento sem pagamento, o site e as vendas da torcida saem do ar até o Pix ser confirmado. Dados, sócios e ingressos ficam preservados e tudo volta sozinho com a confirmação.",
              "Mudanças de preço são avisadas com pelo menos 30 dias de antecedência e valem a partir da fatura seguinte ao aviso.",
            ]}
          />
        </>
      ),
    },
    {
      id: "disponibilidade",
      titulo: "Disponibilidade e suporte",
      corpo: (
        <>
          <p>
            Trabalhamos para a plataforma ficar no ar o tempo todo, mas ela depende de internet, de serviços de terceiros (Google, Pagar.me,
            provedor de e-mail) e de manutenções. Por isso não garantimos funcionamento sem nenhuma interrupção. Avisamos com antecedência as
            manutenções programadas sempre que possível. A portaria guarda no celular o que precisa para validar entradas mesmo sem conexão.
          </p>
          <p>
            Suporte: pelo botão de ajuda do painel, pelo WhatsApp da equipe ou em <Email />.
          </p>
        </>
      ),
    },
    {
      id: "propriedade",
      titulo: "Propriedade intelectual",
      corpo: (
        <p>
          O software, a marca e o visual da Somos Organizada são nossos. A torcida continua dona do seu nome, escudo, fotos e textos, e nos autoriza a
          exibi-los na plataforma enquanto usar o serviço. Não é permitido copiar, revender ou fazer engenharia reversa da plataforma.
        </p>
      ),
    },
    {
      id: "dados",
      titulo: "Dados pessoais: quem é responsável pelo quê",
      corpo: (
        <>
          <p>
            Os dados de quem cadastra e administra a torcida são tratados pela Somos Organizada como <strong>controladora</strong>, conforme a{" "}
            <Link href="/privacidade">Política de privacidade</Link>.
          </p>
          <p>
            Os dados dos torcedores (compradores de ingresso e sócios) pertencem à relação deles com a torcida. A torcida é a{" "}
            <strong>controladora</strong> e a Somos Organizada é a <strong>operadora</strong> (LGPD, art. 5º, VI e VII). Como operadora, nós nos
            comprometemos a:
          </p>
          <Lista
            itens={[
              "tratar esses dados só para prestar o serviço contratado pela torcida e seguir as instruções dela, dentro da lei;",
              "manter medidas de segurança e acesso restrito, inclusive para a nossa equipe, que acessa dados só para suporte e operação;",
              "usar apenas fornecedores necessários ao serviço (Google Cloud/Firebase para hospedagem e banco de dados, e o provedor de e-mail), com as garantias exigidas pela LGPD;",
              "avisar a torcida sem demora sobre incidente de segurança que envolva esses dados e ajudar a atender os pedidos dos titulares;",
              "ao fim do contrato, entregar uma cópia dos dados à torcida, se pedida em até 30 dias, e depois eliminá-los, salvo o que a lei mandar guardar.",
            ]}
          />
          <p>A torcida, como controladora, define para que usa os dados dos torcedores, responde pelo uso que faz deles e atende os pedidos dos titulares.</p>
        </>
      ),
    },
    {
      id: "responsabilidade",
      titulo: "Limites da nossa responsabilidade",
      corpo: (
        <>
          <p>A Somos Organizada responde pela tecnologia que fornece. Não respondemos por:</p>
          <Lista
            itens={[
              "realização, adiamento, cancelamento, segurança ou qualidade dos eventos e benefícios oferecidos pela torcida;",
              "decisões de estádios, federações, clubes e autoridades;",
              "atos da diretoria, da equipe da torcida ou de torcedores;",
              "falhas, bloqueios, prazos e tarifas da Pagar.me ou de bancos;",
              "danos indiretos e lucros cessantes.",
            ]}
          />
          <p>
            Quando a lei permitir limitar, a nossa responsabilidade total perante a torcida fica limitada ao valor das mensalidades pagas nos 12 meses
            anteriores ao fato. Nada nestes termos limita direitos que o Código de Defesa do Consumidor garante aos torcedores.
          </p>
        </>
      ),
    },
    {
      id: "encerramento",
      titulo: "Suspensão e encerramento",
      corpo: (
        <>
          <p>
            A torcida pode deixar de usar a plataforma quando quiser, sem multa, pedindo o encerramento em <Email />. A mensalidade já vencida
            continua devida. O encerramento não cancela os ingressos já vendidos: a torcida segue responsável perante quem comprou.
          </p>
          <p>
            Podemos suspender ou encerrar o acesso, com aviso sempre que possível, em caso de fraude ou suspeita fundada de fraude, uso ilegal,
            violação destes termos, ordem de autoridade ou mensalidade em atraso (veja “Mensalidade da plataforma”).
          </p>
        </>
      ),
    },
    {
      id: "alteracoes",
      titulo: "Alterações destes termos",
      corpo: (
        <p>
          Podemos atualizar estes termos. Mudanças importantes são avisadas por e-mail ou no painel com pelo menos 15 dias de antecedência. Continuar
          usando a plataforma depois disso significa aceitar a nova versão. A data da última atualização fica no topo desta página.
        </p>
      ),
    },
    {
      id: "foro",
      titulo: "Lei aplicável e foro",
      corpo: (
        <p>
          Estes termos seguem as leis do Brasil. Fica eleito o foro da comarca de Salvador/BA para resolver qualquer questão, ressalvado o direito do
          consumidor de propor ação no foro do seu domicílio.
        </p>
      ),
    },
    {
      id: "contato",
      titulo: "Contato",
      corpo: (
        <p>
          {identificacaoEmpresa}. E-mail: <Email />.
        </p>
      ),
    },
  ];
}

/* ─────────────────────────── Plataforma: Política de privacidade ─────────────────────────── */

export function privacidadePlataforma(): Secao[] {
  return [
    {
      id: "quem-somos",
      titulo: "Quem somos e a quem esta política se aplica",
      corpo: (
        <>
          <p>
            Esta política explica como {identificacaoEmpresa}, trata dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei
            13.709/2018, LGPD).
          </p>
          <p>Ela vale para:</p>
          <Lista
            itens={[
              "quem visita o site somosorganizada.com.br;",
              "quem cadastra uma torcida (o responsável) e quem aparece no vídeo de verificação;",
              "quem trabalha no painel de uma torcida (diretoria, subsedes e portaria).",
            ]}
          />
          <p>
            <strong>Comprou ingresso ou é sócio de uma torcida?</strong> Nesse caso a responsável pelos seus dados é a torcida, e quem explica como
            eles são usados é a Política de privacidade dela, no rodapé da página da torcida. Lá, a Somos Organizada atua como operadora: guarda e
            processa os dados em nome da torcida, para o sistema funcionar.
          </p>
        </>
      ),
    },
    {
      id: "dados",
      titulo: "Quais dados tratamos",
      corpo: (
        <>
          <Lista
            itens={[
              <>
                <strong>Conta:</strong> nome, e-mail e senha (guardada pelo Google Firebase em formato cifrado; nós não temos acesso a ela).
              </>,
              <>
                <strong>Cadastro da torcida:</strong> nome completo, CPF, telefone e cargo do responsável; tipo de entidade, CNPJ, razão social e
                e-mail financeiro; endereço da sede; nome, endereço e cores escolhidos para a torcida.
              </>,
              <>
                <strong>Vídeo de verificação:</strong> imagem e voz do responsável e das testemunhas, os documentos mostrados e as imagens da sede. Junto
                fica o registro da conferência feita pela nossa equipe (quem conferiu, quando e o que foi visto).
              </>,
              <>
                <strong>Uso do painel:</strong> função de cada pessoa (diretoria, subsede, portaria), convites enviados e aceitos, e registros das ações
                importantes (por exemplo, aprovar sócio, publicar evento, validar entrada).
              </>,
              <>
                <strong>Mensalidade:</strong> plano, faturas, datas de pagamento e e-mails enviados.
              </>,
              <>
                <strong>Suporte:</strong> mensagens enviadas pelo botão de ajuda ou por e-mail.
              </>,
              <>
                <strong>Dados técnicos:</strong> registros de acesso (endereço IP, data e hora), e, quando uma tela apresenta erro, o endereço da página,
                a versão do sistema e o navegador usado, para corrigirmos o problema.
              </>,
            ]}
          />
          <p>
            <strong>Armazenamento no aparelho:</strong> o sistema guarda no navegador o login, o passo em que você parou em um cadastro ou compra e,
            para a portaria e o torcedor, os QR Codes que precisam abrir sem internet (apagados ao sair da conta). Não usamos cookies de publicidade
            nem ferramentas de rastreamento de terceiros.
          </p>
        </>
      ),
    },
    {
      id: "finalidades",
      titulo: "Para que usamos e com qual base legal",
      corpo: (
        <Lista
          itens={[
            <>
              <strong>Criar e manter a conta, analisar o cadastro, liberar o painel e cobrar a mensalidade:</strong> execução do contrato (LGPD, art.
              7º, V).
            </>,
            <>
              <strong>Vídeo de verificação e registro da conferência:</strong> prevenção à fraude e segurança do titular, para evitar que alguém se
              passe pela diretoria e receba o dinheiro da torcida, e guarda de prova para o exercício regular de direitos (art. 7º, IX e VI). Não
              fazemos reconhecimento facial nem identificação biométrica automática: a conferência é feita por pessoas da nossa equipe.
            </>,
            <>
              <strong>E-mails de serviço</strong> (confirmação de e-mail, convites, redefinição de senha, resultado da análise, faturas): execução do
              contrato. Não enviamos propaganda sem a sua permissão.
            </>,
            <>
              <strong>Registros de acesso:</strong> cumprimento de obrigação legal (Marco Civil da Internet, art. 15) e segurança.
            </>,
            <>
              <strong>Registros de erro e suporte:</strong> legítimo interesse em manter o sistema funcionando e atender você (art. 7º, IX).
            </>,
          ]}
        />
      ),
    },
    {
      id: "compartilhamento",
      titulo: "Com quem compartilhamos",
      corpo: (
        <>
          <p>Não vendemos dados pessoais. Compartilhamos só o necessário com:</p>
          <Lista
            itens={[
              "Google Cloud / Firebase: hospedagem do site, banco de dados, arquivos (como o vídeo de verificação), login e envio de tarefas automáticas;",
              "provedor de envio de e-mails (Brevo): só o nome, o e-mail e o conteúdo de cada mensagem de serviço;",
              "Pagar.me: quando a diretoria conecta a conta de pagamentos da torcida, os dados de cadastro da conta vão direto para a Pagar.me, que é a responsável por eles;",
              "autoridades públicas, quando houver ordem judicial ou obrigação legal, ou para defesa em processo.",
            ]}
          />
          <p>
            Alguns desses fornecedores podem guardar dados fora do Brasil. Nesses casos, a transferência segue o art. 33 da LGPD, com as garantias
            contratuais e de segurança oferecidas por eles.
          </p>
        </>
      ),
    },
    {
      id: "retencao",
      titulo: "Por quanto tempo guardamos",
      corpo: (
        <>
          <Lista
            itens={[
              "Conta e dados do painel: enquanto a conta estiver ativa.",
              "Cadastro da torcida, vídeo de verificação e registro da conferência: enquanto a torcida usar a plataforma e por até 5 anos depois, para defesa em caso de fraude ou disputa. O mesmo vale para cadastros recusados.",
              "Faturas e dados fiscais: pelo prazo exigido pela legislação fiscal (em geral, 5 anos).",
              "Registros de acesso: pelo menos 6 meses, como manda o Marco Civil da Internet.",
              "Registros de erro: até 12 meses.",
            ]}
          />
          <p>Passados esses prazos, os dados são eliminados ou anonimizados.</p>
        </>
      ),
    },
    {
      id: "seguranca",
      titulo: "Como protegemos",
      corpo: (
        <Lista
          itens={[
            "conexão sempre cifrada (HTTPS);",
            "regras de acesso por função: cada pessoa vê só o que a sua função permite, e o vídeo de verificação só é visto pelo responsável e pela nossa equipe;",
            "chaves da Pagar.me guardadas cifradas; dados de cartão nunca passam pelos nossos servidores;",
            "QR Codes de ingressos e carteirinhas assinados digitalmente, para evitar falsificação.",
          ]}
        />
      ),
    },
    {
      id: "incidentes",
      titulo: "Incidentes de segurança",
      corpo: (
        <p>
          Se acontecer um incidente que possa trazer risco ou dano relevante, avisamos os titulares afetados, as torcidas envolvidas e a Autoridade
          Nacional de Proteção de Dados (ANPD), como manda a LGPD (art. 48).
        </p>
      ),
    },
    {
      id: "direitos",
      titulo: "Seus direitos",
      corpo: (
        <>
          <p>Pela LGPD (art. 18), você pode pedir a qualquer momento:</p>
          <Lista
            itens={[
              "confirmação de que tratamos seus dados e acesso a eles;",
              "correção de dados incompletos, inexatos ou desatualizados;",
              "anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;",
              "portabilidade dos dados a outro fornecedor;",
              "informação sobre com quem compartilhamos;",
              "eliminação dos dados tratados com o seu consentimento, e revogação desse consentimento;",
              "oposição a um tratamento que descumpra a lei.",
            ]}
          />
          <p>
            Para pedir, escreva para <Email /> a partir do e-mail da sua conta. Respondemos em até 15 dias. Alguns dados podem continuar guardados
            quando a lei obriga ou para defesa em caso de fraude (veja “Por quanto tempo guardamos”). Você também pode reclamar à ANPD
            (gov.br/anpd).
          </p>
        </>
      ),
    },
    {
      id: "idade",
      titulo: "Idade mínima",
      corpo: <p>Cadastrar e administrar uma torcida é permitido só para maiores de 18 anos.</p>,
    },
    {
      id: "alteracoes",
      titulo: "Alterações desta política",
      corpo: <p>Podemos atualizar esta política. Mudanças importantes são avisadas por e-mail ou no painel. A data da última atualização fica no topo.</p>,
    },
    {
      id: "contato",
      titulo: "Encarregado e contato",
      corpo: (
        <p>
          Dúvidas e pedidos sobre dados pessoais: <Email />, canal do encarregado pelo tratamento de dados da {identificacaoEmpresa}.
        </p>
      ),
    },
  ];
}

/* ─────────────────────────────── Torcida: Termos de uso ─────────────────────────────── */

export function termosTorcida(t: InfoTorcida): Secao[] {
  const pct = Number.isFinite(t.taxaServicoPct) ? t.taxaServicoPct : 0;
  const base = `/${t.slug}`;
  return [
    {
      id: "quem-vende",
      titulo: "Quem vende e quem fornece o sistema",
      corpo: (
        <>
          <p>
            Esta página, os eventos, os ingressos e o programa de sócios são de {quemETorcida(t)}, aqui chamada de “a torcida”. A torcida define
            preços, benefícios e regras de entrada, organiza os eventos, recebe os pagamentos e atende você.
          </p>
          <p>
            O sistema é fornecido pela {identificacaoEmpresa}, que cuida da tecnologia (site, pagamentos, carteirinha, portaria) e não é vendedora nem
            organizadora dos eventos.
          </p>
          <p>
            Ao criar sua conta, comprar um ingresso ou se associar, você aceita estes termos e a{" "}
            <Link href={`${base}/privacidade`}>Política de privacidade da torcida</Link>.
          </p>
        </>
      ),
    },
    {
      id: "conta",
      titulo: "Sua conta",
      corpo: (
        <Lista
          itens={[
            "Informe dados verdadeiros e seus: nome completo, CPF, e-mail e telefone. Eles são usados para emitir e conferir ingressos e carteirinhas.",
            "A conta é pessoal. Não compartilhe a senha; os ingressos e a carteirinha ficam na conta, no site da torcida.",
            "Compras e adesões são feitas por maiores de 18 anos. Ingresso para menor de idade deve ser comprado pelo responsável legal, com os dados do menor como titular.",
          ]}
        />
      ),
    },
    {
      id: "ingressos",
      titulo: "Ingressos",
      corpo: (
        <Lista
          itens={[
            <>
              <strong>Nominal e intransferível:</strong> cada ingresso leva nome e CPF do titular, conferidos na entrada com documento oficial com
              foto. Revenda é proibida.
            </>,
            <>
              <strong>Onde fica o ingresso:</strong> o QR Code fica na sua conta, no site da torcida, e abre mesmo sem internet depois da primeira
              vez. Por segurança, o QR não é enviado por e-mail.
            </>,
            <>
              <strong>Cada QR entra uma vez:</strong> a portaria registra a leitura. Print, cópia ou ingresso repassado que já tenha sido usado é
              barrado.
            </>,
            <>
              <strong>Preço de sócio:</strong> o sócio em dia pode comprar um ingresso com preço de sócio por evento, no próprio nome. Os demais saem
              com o preço normal.
            </>,
            "Os ingressos são limitados à capacidade informada. A entrada também depende das regras do local, do clube, da federação e das autoridades de segurança, que podem exigir revista, cadastro ou outras condições.",
          ]}
        />
      ),
    },
    {
      id: "pagamento",
      titulo: "Preço, taxa de serviço e pagamento",
      corpo: (
        <Lista
          itens={[
            pct > 0
              ? `O valor total aparece antes de você pagar: preço do ingresso ou do plano mais a taxa de serviço de ${pct.toLocaleString("pt-BR")}%, que fica com a torcida.`
              : "O valor total aparece antes de você pagar.",
            "Os pagamentos são feitos por Pix ou cartão e processados pela Pagar.me, direto para a conta da torcida.",
            "Os dados do cartão são digitados direto para a Pagar.me, que os guarda de forma segura. A torcida e a Somos Organizada veem só a bandeira e os últimos números.",
            "O Pix tem prazo para ser pago. Se ele passar, o pedido expira e os ingressos reservados voltam a ficar disponíveis.",
          ]}
        />
      ),
    },
    {
      id: "cancelamento",
      titulo: "Cancelamento, desistência e reembolso",
      corpo: (
        <>
          <Lista
            itens={[
              "Compra pela internet: você pode desistir em até 7 dias após a compra, como prevê o art. 49 do Código de Defesa do Consumidor, desde que o pedido seja feito antes do início do evento e o ingresso não tenha sido usado.",
              "Evento cancelado pela torcida ou pelas autoridades: o valor pago, com a taxa de serviço, é devolvido.",
              "Evento adiado: o ingresso vale para a nova data. Se você não puder ir, pode pedir o reembolso à torcida.",
              "Os reembolsos são feitos pela torcida, no mesmo meio de pagamento, pela Pagar.me. No cartão, o prazo para aparecer na fatura depende do banco emissor.",
            ]}
          />
          <p>Os pedidos de cancelamento e reembolso são feitos à torcida, {contatoTorcida(t)}.</p>
        </>
      ),
    },
    {
      id: "socios",
      titulo: "Programa de sócios",
      corpo: (
        <Lista
          itens={[
            "Os planos, valores, períodos e benefícios são definidos pela torcida e aparecem antes da adesão. A torcida pode exigir aprovação da diretoria: nesse caso a associação fica “em análise” até a resposta.",
            "Renovação no cartão: o cartão salvo é cobrado automaticamente a cada vencimento. Se a cobrança for recusada, o sistema tenta de novo por alguns dias e avisa você por e-mail para trocar o cartão ou pagar no Pix.",
            "Renovação no Pix: o Pix da renovação é gerado alguns dias antes do vencimento e enviado por e-mail.",
            "Se o pagamento não for confirmado em até 5 dias após o vencimento, a associação fica inadimplente e os benefícios param até a regularização.",
            "Você pode cancelar quando quiser pela sua conta, sem multa. Os benefícios continuam até o fim do período já pago e não há novas cobranças.",
            "A carteirinha digital é pessoal e intransferível e pode ser conferida na portaria com documento com foto.",
          ]}
        />
      ),
    },
    {
      id: "conduta",
      titulo: "Regras de conduta",
      corpo: (
        <p>
          É proibido usar a página para fraude, revenda de ingressos (cambismo), uso de dados de outra pessoa ou qualquer ato ilegal. Nesses casos a
          torcida pode cancelar ingressos e associações, nos limites da lei, e comunicar as autoridades.
        </p>
      ),
    },
    {
      id: "responsabilidades",
      titulo: "Quem responde pelo quê",
      corpo: (
        <p>
          A torcida responde pelos eventos, ingressos, benefícios, preços, entrada e atendimento. A Somos Organizada responde pelo funcionamento do
          sistema. Data, horário e local dos eventos podem mudar por decisão do clube, da federação ou das autoridades; a torcida avisa pelos seus
          canais e pelo e-mail da conta.
        </p>
      ),
    },
    {
      id: "atendimento",
      titulo: "Atendimento",
      corpo: (
        <p>
          Dúvidas sobre ingressos, sócios, eventos e reembolsos: fale com a torcida {contatoTorcida(t)}, ou pelo botão de ajuda do site. Problemas
          técnicos no site: <Email />.
        </p>
      ),
    },
    {
      id: "foro",
      titulo: "Alterações, lei e foro",
      corpo: (
        <p>
          Estes termos podem ser atualizados; a data da última atualização fica no topo. Compras já feitas seguem as regras da época da compra. Valem
          as leis do Brasil, inclusive o Código de Defesa do Consumidor, e você pode propor ação no foro do seu domicílio.
        </p>
      ),
    },
  ];
}

/* ─────────────────────────── Torcida: Política de privacidade ─────────────────────────── */

export function privacidadeTorcida(t: InfoTorcida): Secao[] {
  return [
    {
      id: "quem-cuida",
      titulo: "Quem cuida dos seus dados",
      corpo: (
        <>
          <p>Esta política explica como seus dados são tratados quando você compra ingresso ou vira sócio pelo site da torcida, conforme a LGPD (Lei 13.709/2018).</p>
          <Lista
            itens={[
              <>
                <strong>Controladora:</strong> {quemETorcida(t)}. É a torcida que decide para que os dados são usados e responde pelos pedidos sobre
                eles.
              </>,
              <>
                <strong>Operadora:</strong> {identificacaoEmpresa}, que fornece o sistema e guarda e processa os dados em nome da torcida.
              </>,
              <>
                <strong>Pagamentos:</strong> a Pagar.me processa Pix e cartão e trata os dados de pagamento conforme a política dela.
              </>,
            ]}
          />
        </>
      ),
    },
    {
      id: "dados",
      titulo: "Quais dados são tratados",
      corpo: (
        <>
          <Lista
            itens={[
              <>
                <strong>Conta:</strong> nome, e-mail, CPF e telefone. A senha fica guardada de forma cifrada pelo Google Firebase; ninguém da torcida ou da
                Somos Organizada tem acesso a ela.
              </>,
              <>
                <strong>Ingressos:</strong> nome e CPF de cada titular, evento, tipo de ingresso, valores, situação do pagamento e entradas registradas na
                portaria (data, hora e quem validou).
              </>,
              <>
                <strong>Sócios:</strong> data de nascimento, endereço, foto 3x4 da carteirinha, sede, plano, matrícula, histórico de pagamentos e
                situação da associação.
              </>,
              <>
                <strong>Pagamento:</strong> forma de pagamento e, no cartão, só a bandeira e os últimos números. O número completo e o código de
                segurança ficam só com a Pagar.me.
              </>,
              <>
                <strong>Suporte e dados técnicos:</strong> mensagens enviadas pelo botão de ajuda, registros de acesso (IP, data e hora) e, quando uma tela
                apresenta erro, o endereço da página e o navegador usado.
              </>,
            ]}
          />
          <p>
            <strong>No seu aparelho:</strong> o site guarda o login, o passo da compra em andamento e os QR Codes dos ingressos e da carteirinha para
            abrirem sem internet na portaria. Tudo isso é apagado ao sair da conta. Não há cookies de publicidade nem rastreadores de terceiros.
          </p>
        </>
      ),
    },
    {
      id: "finalidades",
      titulo: "Para que os dados são usados",
      corpo: (
        <Lista
          itens={[
            <>
              <strong>Vender e entregar ingressos, manter a associação, cobrar renovações e emitir a carteirinha:</strong> execução do contrato com você
              (LGPD, art. 7º, V).
            </>,
            <>
              <strong>Conferir quem entra e evitar fraude</strong> (ingresso nominal, QR que entra uma vez, foto da carteirinha): prevenção à fraude e
              segurança, legítimo interesse da torcida e cumprimento das exigências da Lei Geral do Esporte e das autoridades, quando houver (art. 7º, II
              e IX).
            </>,
            <>
              <strong>E-mails de serviço</strong> (pedido, ingressos disponíveis na conta, renovação, avisos de evento): execução do contrato. A torcida
              não envia propaganda sem a sua permissão.
            </>,
            <>
              <strong>Registros fiscais e de acesso:</strong> cumprimento de obrigação legal (art. 7º, II).
            </>,
          ]}
        />
      ),
    },
    {
      id: "quem-ve",
      titulo: "Quem vê os seus dados",
      corpo: (
        <>
          <Lista
            itens={[
              "a diretoria da torcida e a equipe autorizada por ela, cada uma só no que a função precisa (a portaria, por exemplo, vê o nome do titular e a situação do ingresso na hora da leitura);",
              "a Somos Organizada, para operar o sistema e dar suporte;",
              "a Pagar.me, para processar os pagamentos;",
              "o Google Cloud/Firebase (hospedagem e banco de dados) e o provedor de envio de e-mails (Brevo), como fornecedores da Somos Organizada;",
              "autoridades públicas, quando houver obrigação legal ou ordem judicial.",
            ]}
          />
          <p>
            Seus dados não são vendidos. Alguns fornecedores podem guardá-los fora do Brasil; nesses casos a transferência segue o art. 33 da LGPD.
          </p>
        </>
      ),
    },
    {
      id: "retencao",
      titulo: "Por quanto tempo",
      corpo: (
        <>
          <Lista
            itens={[
              "Conta e dados de sócio: enquanto a conta e a associação existirem.",
              "Compras, pagamentos e entradas na portaria: por 5 anos, pelo prazo das obrigações fiscais e do Código de Defesa do Consumidor.",
              "Registros de acesso: pelo menos 6 meses (Marco Civil da Internet).",
            ]}
          />
          <p>Depois disso, os dados são eliminados ou anonimizados.</p>
        </>
      ),
    },
    {
      id: "seguranca",
      titulo: "Segurança",
      corpo: (
        <p>
          Conexão sempre cifrada (HTTPS), acesso por função, QR Codes assinados digitalmente e dados de cartão fora do sistema. Se acontecer um
          incidente que possa trazer risco relevante, você e a Autoridade Nacional de Proteção de Dados (ANPD) são avisados, como manda a LGPD.
        </p>
      ),
    },
    {
      id: "direitos",
      titulo: "Seus direitos e como pedir",
      corpo: (
        <>
          <p>
            Você pode pedir confirmação e acesso aos seus dados, correção, anonimização, bloqueio ou eliminação do que for desnecessário,
            portabilidade, informação sobre com quem são compartilhados, e revogar consentimentos (LGPD, art. 18). Os dados da conta também podem ser
            corrigidos na própria conta, em “Meus dados”.
          </p>
          <p>
            Faça o pedido à torcida, {contatoTorcida(t)}. Se não conseguir falar com ela, escreva para <Email />, que encaminhamos e acompanhamos o
            atendimento. Alguns dados podem continuar guardados quando a lei obriga (por exemplo, compras para fins fiscais). Você também pode reclamar
            à ANPD (gov.br/anpd).
          </p>
        </>
      ),
    },
    {
      id: "menores",
      titulo: "Crianças e adolescentes",
      corpo: (
        <p>
          Compras e associações são feitas por maiores de 18 anos. Os dados de menores de idade, como titulares de ingresso, são informados pelo
          responsável legal e usados só para emitir e conferir o ingresso, no melhor interesse da criança ou do adolescente (LGPD, art. 14).
        </p>
      ),
    },
    {
      id: "alteracoes",
      titulo: "Alterações",
      corpo: <p>Esta política pode ser atualizada. A data da última atualização fica no topo da página.</p>,
    },
  ];
}
