/**
 * Passo a passo de cada página do painel. IDs ESTÁVEIS: são usados para marcar "já viu"
 * e para os vídeos em /tutoriais/{id}-desktop.webm e /tutoriais/{id}-mobile.webm.
 * Cada passo aponta para um elemento com data-tour="..." (se não existir na tela, aparece centralizado).
 */
import { usePassoAPasso, type PassoTour } from "@/componentes/tutorial";
import { usePainel } from "./contexto";
import type { Papel } from "@/lib/tipos";

const ajuda: PassoTour = {
  alvo: "botao-passo-a-passo",
  titulo: "Ficou com dúvida?",
  texto: "Toque em “Ver passo a passo” a qualquer momento para rever esta explicação.",
};

export const TOURS: Record<string, PassoTour[]> = {
  // ── Diretoria ─────────────────────────────────────────
  "admin-visao-geral": [
    { titulo: "Bem-vindo ao painel da torcida", texto: "Aqui você cuida de tudo: página da torcida, eventos, sócios, pagamentos e o dinheiro de cada subsede. Vamos dar uma volta rápida." },
    { alvo: "primeiros-passos", opcional: true, titulo: "Comece por aqui", texto: "Esta lista mostra o que falta para colocar o site no ar. Toque em cada item e o painel te leva até lá, com o passo a passo." },
    { alvo: "pendencias", opcional: true, titulo: "Avisos importantes", texto: "Quando algo precisa da sua atenção (pagamentos, eventos para aprovar, sócios para conferir), aparece aqui." },
    { alvo: "kpis", titulo: "Números do mês", texto: "Quanto entrou com ingressos, com sócios e com a taxa de serviço, que fica no caixa da diretoria." },
    { alvo: "grafico-receita", opcional: true, titulo: "Receita dos últimos meses", texto: "Passe o dedo (ou o mouse) nas barras para ver o valor de cada mês." },
    { alvo: "proximos-eventos", opcional: true, titulo: "Próximos eventos", texto: "Acompanhe quantos ingressos já foram vendidos em cada evento." },
    ajuda,
  ],
  "admin-primeiros-passos": [
    { alvo: "lista-primeiros-passos", titulo: "Primeiros passos", texto: "Siga a lista de cima para baixo. Cada item fica verde quando estiver feito." },
    { alvo: "primeiro-pendente", opcional: true, titulo: "Próxima tarefa", texto: "Toque em “Fazer agora”: o painel abre a página certa e mostra o passo a passo dela." },
    ajuda,
  ],
  "admin-eventos": [
    { alvo: "novo-evento", titulo: "Criar um evento", texto: "Caravana, festa, churrasco, jogo: toque aqui para criar. Você define preço para sócio e para o público." },
    { alvo: "filtros-eventos", titulo: "Filtrar por situação", texto: "“Aguardando aprovação” mostra os eventos que as subsedes mandaram para você conferir e publicar." },
    { alvo: "lista-eventos", titulo: "Seus eventos", texto: "Toque num evento para ver as vendas, a lista de ingressos e o link para divulgar. O lápis abre a edição." },
    ajuda,
  ],
  "admin-eventos-criar": [
    { alvo: "evento-nome", titulo: "Nome e descrição", texto: "Escreva um nome curto e, na descrição, horário de saída, o que está incluso e as regras de entrada." },
    { alvo: "evento-sede", opcional: true, titulo: "Sede organizadora", texto: "O valor dos ingressos vai para esta sede. Para publicar evento de subsede, ela precisa ter conta de recebimento ativa." },
    { alvo: "evento-data", titulo: "Data, hora e local", texto: "Use o horário do início do evento (ou da saída do ônibus)." },
    { alvo: "evento-valores", titulo: "Preços", texto: "Coloque o valor para sócio e para o público. Embaixo aparece quanto o torcedor paga com a taxa de serviço." },
    { alvo: "evento-capacidade", titulo: "Lugares e limite por compra", texto: "Se o ônibus tem 46 lugares, coloque 46: o sistema para de vender quando lotar." },
    { alvo: "evento-imagem", opcional: true, titulo: "Imagem", texto: "Uma foto bonita faz vender mais. Prefira imagem horizontal." },
    { alvo: "evento-situacao", titulo: "Rascunho ou publicado", texto: "Rascunho não aparece para ninguém. Publicado aparece na página e já pode ser comprado." },
    { alvo: "evento-salvar", titulo: "Salvar", texto: "Pronto! Depois você pode voltar e editar quando quiser." },
  ],
  "admin-evento-detalhe": [
    { alvo: "evento-aprovacao", opcional: true, titulo: "Aprovar ou devolver", texto: "Quando uma subsede manda um evento, confira os dados. “Aprovar e publicar” coloca à venda; “Devolver” manda de volta com o que ajustar." },
    { alvo: "evento-acoes", titulo: "Editar e divulgar", texto: "Edite o evento, veja como ficou na página ou abra a portaria no dia." },
    { alvo: "evento-link", opcional: true, titulo: "Link para divulgar", texto: "Copie o link ou mande direto no WhatsApp dos grupos da torcida." },
    { alvo: "evento-numeros", titulo: "Vendas", texto: "Vendidos, reservados (Pix aguardando pagamento), entradas na portaria e quanto entrou." },
    { alvo: "evento-ingressos", opcional: true, titulo: "Lista de ingressos", texto: "Procure pelo nome, código ou CPF do torcedor." },
  ],
  "admin-pedidos": [
    { alvo: "pedidos-filtros", titulo: "Encontre um pedido", texto: "Busque pelo nome, e-mail, CPF ou evento. Filtre por ingressos ou sócios e pela situação do pagamento." },
    { alvo: "pedidos-lista", titulo: "Detalhes do pedido", texto: "Toque num pedido para ver quem comprou, os ingressos, os valores e o motivo de uma recusa do cartão. Dá para reenviar o link dos ingressos." },
    { alvo: "pedidos-exportar", titulo: "Planilha", texto: "Baixe a lista em planilha para abrir no Excel ou no Google Planilhas." },
  ],
  "admin-socios": [
    { alvo: "socios-status", titulo: "Situação dos sócios", texto: "Ativos, em análise (aguardando sua aprovação), inadimplentes… toque para filtrar." },
    { alvo: "socios-busca", titulo: "Buscar", texto: "Procure pelo nome, CPF, matrícula ou e-mail." },
    { alvo: "socios-lista", titulo: "Ficha do sócio", texto: "Toque num sócio para ver foto, dados, plano, validade e para aprovar, suspender ou reativar." },
    { alvo: "socios-exportar", titulo: "Planilha", texto: "Baixe a lista de sócios em planilha." },
  ],
  "admin-planos": [
    { alvo: "novo-plano", titulo: "Criar um plano", texto: "Comece por um modelo pronto (Mensal, Anual, Mirim) e ajuste o valor e os benefícios." },
    { alvo: "lista-planos", titulo: "Seus planos", texto: "É assim que eles aparecem na aba Sócios da página. Para tirar um plano do ar, desative (não exclui, para não perder o histórico)." },
    ajuda,
  ],
  "admin-financeiro": [
    { alvo: "fin-resumo", titulo: "Resumo do dinheiro", texto: "Quanto foi vendido, quanto é taxa de serviço (caixa da diretoria) e quanto ainda falta repassar às subsedes." },
    { alvo: "fin-sedes", opcional: true, titulo: "Saldo de cada sede", texto: "Com a divisão ativa, o valor dos eventos da subsede cai direto na conta dela. O que caiu na conta da torcida aparece aqui como “a repassar”." },
    { alvo: "registrar-repasse", opcional: true, titulo: "Registrar repasse", texto: "Depois de transferir para uma subsede (Pix ou dinheiro), registre aqui para o saldo ficar certo." },
    { alvo: "fin-extrato", titulo: "Extrato", texto: "Todos os lançamentos, filtráveis por mês e sede. Baixe a planilha para a prestação de contas." },
  ],
  "admin-sedes": [
    { alvo: "nova-subsede", titulo: "Cadastrar subsedes", texto: "Crie uma subsede para cada distrito, bairro ou cidade onde a torcida tem núcleo." },
    { alvo: "lista-sedes", titulo: "Conta de recebimento", texto: "Cada subsede mostra se já tem conta para receber as vendas. Quem cadastra é o responsável da subsede, pelo painel dele." },
    { titulo: "Convide o responsável", texto: "Depois de criar a subsede, vá em “Usuários do painel” e convide o diretor dela com o papel Subsede." },
  ],
  "admin-usuarios": [
    { alvo: "convidar-usuario", titulo: "Convidar alguém", texto: "Coloque nome e e-mail. A pessoa recebe um e-mail para criar a senha; você também pode mandar o link pelo WhatsApp." },
    { alvo: "papeis", titulo: "Quem pode o quê", texto: "Diretoria vê tudo. Subsede vê só a sede dela. Portaria só usa o leitor de ingressos." },
    { alvo: "lista-usuarios", titulo: "Equipe", texto: "Edite o papel, bloqueie o acesso ou reenvie o convite de quem não conseguiu entrar." },
  ],
  "admin-personalizacao": [
    { alvo: "modulos", titulo: "O que o site vai oferecer", texto: "Escolha venda de ingressos, associação de sócios ou os dois." },
    { alvo: "cores", titulo: "Cores da torcida", texto: "Escolha uma paleta pronta ou ajuste cada cor. A prévia mostra na hora como fica." },
    { alvo: "imagens", titulo: "Escudo e banner", texto: "Envie o escudo (de preferência PNG com fundo transparente) e uma foto da arquibancada para o topo." },
    { alvo: "textos", titulo: "Textos", texto: "Título, frase de apresentação e a história da torcida, que aparece na aba Sócios." },
    { alvo: "previa", titulo: "Prévia ao vivo", texto: "Assim fica a página no celular do torcedor." },
    { alvo: "regras-socio", titulo: "Regras de sócio", texto: "Decida se aprova cada sócio novo e para onde vai o valor das mensalidades. Depois toque em “Salvar alterações”." },
  ],
  "admin-pagamentos": [
    { alvo: "pag-status", titulo: "Situação dos pagamentos", texto: "Aqui você vê se a Pagar.me está conectada, em teste ou vendendo de verdade." },
    { alvo: "pag-demo", opcional: true, titulo: "Quer só testar?", texto: "O modo demonstração deixa você experimentar tudo sem conta na Pagar.me. Nenhum pagamento é real." },
    { alvo: "passo-1", titulo: "Conta na Pagar.me", texto: "Para vender de verdade, a torcida cria a própria conta na Pagar.me. O dinheiro cai direto na conta de vocês." },
    { alvo: "passo-3", titulo: "Cole as chaves", texto: "Copie as chaves no painel da Pagar.me e cole aqui. Ninguém consegue ver a chave secreta depois." },
    { alvo: "passo-5", opcional: true, titulo: "Aviso de pagamento (webhook)", texto: "Copie a URL e cadastre na Pagar.me para os Pix confirmarem na hora." },
    { alvo: "passo-6", opcional: true, titulo: "Divisão com as subsedes", texto: "Opcional: cada subsede recebe as vendas dos próprios eventos direto na conta dela." },
  ],
  "admin-publicar": [
    { alvo: "publicar-checklist", titulo: "O que falta", texto: "Os itens obrigatórios precisam estar prontos. Os recomendados deixam o site mais completo." },
    { alvo: "publicar-planos", opcional: true, titulo: "Plano Somos Organizada", texto: "Escolha pelo tamanho da torcida: quantos sócios e quantos eventos à venda ao mesmo tempo. Todos os planos têm todos os recursos, e dá para trocar depois." },
    { alvo: "publicar-cobranca", titulo: "Como funciona a cobrança", texto: "Só Pix, sem multa e sem juros. A primeira fatura vence 7 dias depois de publicar." },
    { alvo: "publicar-botao", titulo: "Publicar", texto: "Pronto! Depois de publicar, compartilhe o link nos grupos da torcida." },
  ],
  "admin-publicado": [
    { alvo: "publicar-links", titulo: "Seu site está no ar", texto: "Copie o link, mostre o QR Code nos eventos ou mande no WhatsApp." },
    { alvo: "publicar-tirar", titulo: "Tirar do ar", texto: "Se precisar, tire o site do ar. Os dados não são apagados." },
  ],
  "admin-plano-somos": [
    { alvo: "plano-uso", opcional: true, titulo: "Uso do plano", texto: "Quantos sócios e eventos à venda vocês têm agora. Fica amarelo perto do limite e vermelho quando chega nele." },
    { alvo: "plano-atual", titulo: "Seu plano", texto: "Torcida Pro, Plus ou Max. Os limites novos valem na hora; o preço novo, a partir da próxima fatura." },
    { alvo: "fatura-aberta", titulo: "Pagar a fatura", texto: "Leia o QR Code no app do banco ou copie o “Pix copia e cola”. Depois toque em “Já paguei”." },
    { alvo: "faturas", titulo: "Histórico", texto: "Todas as faturas, pagas e em aberto." },
  ],
  "admin-dominio": [{ alvo: "dominio", titulo: "Endereço do site", texto: "Este é o endereço da sua página. Domínio próprio chega em breve." }],

  // ── Subsede ──────────────────────────────────────────
  "subsede-visao-geral": [
    { titulo: "Bem-vindo ao painel da subsede", texto: "Aqui você cria os eventos da sua subsede, acompanha as vendas, os sócios da sua região e o dinheiro." },
    { alvo: "primeiros-passos", opcional: true, titulo: "Comece por aqui", texto: "Siga os primeiros passos: conta de recebimento, primeiro evento e acompanhamento das vendas." },
    { alvo: "pendencias", opcional: true, titulo: "Avisos", texto: "O que precisa da sua atenção aparece aqui, como a conta de recebimento pendente." },
    { alvo: "kpis", titulo: "Números da sua sede", texto: "Quanto os eventos e as mensalidades da sua sede renderam e quanto você tem a receber." },
    ajuda,
  ],
  "subsede-primeiros-passos": [
    { alvo: "lista-primeiros-passos", titulo: "Primeiros passos", texto: "Siga a lista de cima para baixo. Cada item fica verde quando estiver feito." },
    { alvo: "primeiro-pendente", opcional: true, titulo: "Próxima tarefa", texto: "Toque em “Fazer agora” para ir até a página certa, com o passo a passo." },
  ],
  "subsede-eventos": [
    { alvo: "aviso-conta", opcional: true, titulo: "Conta de recebimento", texto: "Sem a conta de recebimento ativa, a diretoria não consegue aprovar seus eventos. Cadastre em Recebimentos." },
    { alvo: "novo-evento", titulo: "Criar evento", texto: "Crie o evento da sua subsede e envie para a diretoria aprovar. Depois de publicado, só a diretoria altera." },
    { alvo: "filtros-eventos", titulo: "Situação", texto: "Acompanhe o que está em rascunho, aguardando aprovação ou publicado." },
    { alvo: "lista-eventos", titulo: "Seus eventos", texto: "Toque num evento para ver as vendas e o link para divulgar. Se a diretoria devolver, o motivo aparece lá." },
    ajuda,
  ],
  "subsede-eventos-criar": [
    { alvo: "evento-nome", titulo: "Nome e descrição", texto: "Nome curto e uma descrição com horário, local e o que está incluso." },
    { alvo: "evento-data", titulo: "Data, hora e local", texto: "Use o horário de início (ou de saída do ônibus)." },
    { alvo: "evento-valores", titulo: "Preços", texto: "Valor para sócio e para o público. O valor do ingresso cai na conta da sua subsede; a taxa de serviço vai para a torcida." },
    { alvo: "evento-capacidade", titulo: "Lugares", texto: "Coloque quantos lugares tem. O sistema para de vender quando lotar." },
    { alvo: "evento-situacao", titulo: "Enviar para aprovação", texto: "Escolha “Aguardando aprovação” para a diretoria conferir e publicar. Rascunho fica só com você." },
    { alvo: "evento-salvar", titulo: "Enviar", texto: "Pronto! Você recebe o retorno da diretoria no próprio evento." },
  ],
  "subsede-evento-detalhe": [
    { alvo: "evento-situacao-subsede", opcional: true, titulo: "Situação", texto: "Aqui você vê se o evento está aguardando aprovação, foi devolvido (com o motivo) ou já foi publicado." },
    { alvo: "evento-link", opcional: true, titulo: "Divulgue", texto: "Depois de publicado, copie o link ou mande no WhatsApp." },
    { alvo: "evento-numeros", titulo: "Vendas", texto: "Vendidos, reservados e entradas na portaria." },
    { alvo: "evento-ingressos", opcional: true, titulo: "Lista de ingressos", texto: "Procure pelo nome, código ou CPF." },
  ],
  "subsede-pedidos": [
    { alvo: "pedidos-filtros", titulo: "Pedidos da sua sede", texto: "Busque pelo nome, CPF ou evento e filtre pela situação do pagamento." },
    { alvo: "pedidos-lista", titulo: "Detalhes", texto: "Toque num pedido para ver quem comprou e os valores." },
  ],
  "subsede-socios": [
    { alvo: "socios-status", titulo: "Sócios da sua sede", texto: "Veja quem está ativo, em análise ou inadimplente." },
    { alvo: "socios-lista", titulo: "Ficha do sócio", texto: "Toque num sócio para ver os dados e aprovar ou suspender." },
  ],
  "subsede-financeiro": [
    { alvo: "fin-resumo", titulo: "Seu dinheiro", texto: "“Direto na sua conta” já é seu (caiu pela Pagar.me). “Pela conta da torcida” é o que a diretoria precisa repassar." },
    { alvo: "fin-extrato", titulo: "Extrato", texto: "Cada venda e cada repasse recebido. Baixe a planilha quando precisar." },
  ],
  "subsede-recebimentos": [
    { alvo: "receb-status", titulo: "Sua conta de recebimento", texto: "É para esta conta que a Pagar.me manda o dinheiro dos ingressos dos seus eventos." },
    { alvo: "receb-como-funciona", titulo: "Como o dinheiro é dividido", texto: "O valor do ingresso é da subsede; a taxa de serviço vai para a torcida. A divisão é automática." },
    { alvo: "receb-cadastro", opcional: true, titulo: "Cadastrar a conta", texto: "Tenha em mãos CPF, documento e os dados da sua conta bancária. A conta precisa estar no seu CPF." },
    { alvo: "receb-kyc", opcional: true, titulo: "Prova de vida", texto: "Depois do cadastro, faça a selfie e a foto do documento pelo celular (QR Code) e toque em “Atualizar status”." },
  ],

  // ── Portaria ─────────────────────────────────────────
  "portaria-inicio": [
    { alvo: "abrir-leitor", titulo: "Leitor de ingressos", texto: "No dia do evento, toque aqui e aponte a câmera para o QR Code do ingresso. Também dá para buscar pelo CPF." },
    { alvo: "eventos-hoje", titulo: "Eventos do dia", texto: "Veja quantas pessoas já entraram em cada evento." },
  ],
};

/** id do tour da página para o papel do usuário (ex.: "eventos" → admin-eventos ou subsede-eventos). */
export function idTour(pagina: string, papel: Papel): string {
  const prefixo = papel === "diretoria" ? "admin" : papel === "subsede" ? "subsede" : "portaria";
  return `${prefixo}-${pagina}`;
}

export const SEM_PASSOS: PassoTour[] = [];
export const passosDe = (id: string): PassoTour[] => TOURS[id] ?? SEM_PASSOS;

/** Tour da página conforme o papel (diretoria → admin-*, subsede → subsede-*). */
export function useTourPagina(pagina: string, opcoes?: { autoIniciar?: boolean; ativo?: boolean }) {
  const { papel } = usePainel();
  const id = idTour(pagina, papel);
  return usePassoAPasso(id, passosDe(id), opcoes);
}
