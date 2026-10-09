/**
 * Página inicial da Somos Organizada (somosorganizada.com.br/).
 * Renderizada como HTML estático no build (render.tsx): abre sem esperar JavaScript e sem carregar o sistema.
 * Só os preços, a calculadora e o menu "Entrar" ganham um script pequeno (cliente.ts).
 * Os números da página são reais do produto: taxa de serviço de 10%, mensalidade fixa, 7 dias para a 1ª fatura.
 */
import type { ReactNode } from "react";
import { Icone, type NomeIcone } from "@/ui/icones";
import { PLANOS_SAAS_PADRAO } from "@/lib/tipos";
import { CALCULO_INICIAL, calcularTaxa, reais } from "./calculo";

export const WHATSAPP = "5571994095784";
export const LINK_WHATSAPP = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Olá! Quero conhecer a Somos Organizada para a minha torcida.")}`;

export interface OpcoesLanding {
  /** Endereço da torcida de demonstração (ex.: "demo"); sem ele o botão não aparece. */
  slugDemo?: string;
}


export const PERGUNTAS: { p: string; r: string }[] = [
  {
    p: "O dinheiro passa pela Somos Organizada?",
    r: "Não. Cada torcida tem a própria conta na Pagar.me e os pagamentos caem direto nela. A parte de cada subsede vai para a conta da subsede. A Somos Organizada não segura repasse e não cobra porcentagem das vendas.",
  },
  {
    p: "Quanto o torcedor paga a mais?",
    r: "O preço é a diretoria que define. Em cima dele entra uma taxa de serviço de 10%, mostrada antes do pagamento. Essa taxa fica com a torcida: ajuda a cobrir as tarifas do cartão e do Pix e o que sobra vira caixa.",
  },
  {
    p: "E quando o sócio não paga?",
    r: "No cartão, a mensalidade é cobrada sozinha todo mês. Se o banco recusar, o sócio recebe o motivo em linguagem simples e pode trocar o cartão ou pagar no Pix. No Pix, ele recebe lembrete por e-mail antes do vencimento. Quem atrasa aparece na hora no painel da diretoria, sem conferir comprovante.",
  },
  {
    p: "Como a portaria evita ingresso falso?",
    r: "Cada ingresso é nominal e tem um QR Code assinado digitalmente. O porteiro lê com a câmera do celular: QR copiado, print repassado ou ingresso já usado é barrado na hora, porque cada código só entra uma vez.",
  },
  {
    p: "Preciso de CNPJ para começar?",
    r: "Não para se cadastrar: o cadastro aceita torcida que ainda não tem CNPJ. Para receber pagamentos de verdade, a torcida abre a conta dela na Pagar.me seguindo as exigências da própria Pagar.me.",
  },
  {
    p: "Dá para testar antes de pagar?",
    r: "Sim. Depois da aprovação, a torcida monta tudo em modo demonstração, com pagamentos simulados. A mensalidade da plataforma só começa quando a diretoria publica o site, e a primeira vence 7 dias depois.",
  },
  {
    p: "O que acontece quando a torcida chega no limite do plano?",
    r: "Quem já é sócio continua normal: paga, renova e entra nos eventos. No limite de sócios, novas adesões ficam pausadas até a diretoria mudar de plano, direto no painel. Eventos à venda são os publicados com data no futuro: no limite, é só encerrar um evento ou mudar de plano.",
  },
  {
    p: "Funciona com subsedes em outras cidades?",
    r: "Sim. Cada subsede tem o próprio acesso, vende os próprios eventos e recebe na própria conta, com divisão automática do pagamento. A diretoria acompanha o extrato de todas; a subsede vê só o que é dela.",
  },
  {
    p: "E se a diretoria tiver dúvida no dia a dia?",
    r: "Cada tela do painel tem passo a passo com vídeo, e o painel tem ajuda dentro dele. Se precisar de gente, a equipe atende pelo WhatsApp.",
  },
];

export function Landing({ slugDemo }: OpcoesLanding) {
  return (
    <div className="min-h-dvh flex flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-secundaria focus:text-sobre-secundaria focus:px-4 focus:py-2 focus:font-bold">
        Pular para o conteúdo
      </a>
      <Cabecalho />
      <main id="conteudo">
        <Hero slugDemo={slugDemo} />
        <Problema />
        <Recursos />
        <Dinheiro />
        <Calculadora />
        <ComoFunciona />
        <Planos />
        <Duvidas />
        <ChamadaFinal />
      </main>
      <Rodape />
    </div>
  );
}

// ── Cabeçalho ──────────────────────────────────────────────────────────────

function Marca() {
  return (
    <a href="/" className="font-display uppercase tracking-tight flex items-center gap-2 text-[15px] shrink-0" aria-label="Somos Organizada, página inicial">
      <span className="grid grid-cols-2 gap-0.5 size-7 p-1 rounded-lg bg-superficie-2 border border-linha" aria-hidden="true">
        <span className="rounded-[2px] bg-primaria" />
        <span className="rounded-[2px] bg-secundaria" />
        <span className="rounded-[2px] bg-secundaria" />
        <span className="rounded-[2px] bg-texto" />
      </span>
      Somos Organizada
    </a>
  );
}

function Cabecalho() {
  return (
    <header className="sticky top-0 z-40 border-b border-linha bg-fundo/85 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-4">
        <Marca />
        <nav aria-label="Seções" className="hidden lg:flex items-center gap-1 ml-6 text-sm text-texto-2">
          {[
            ["#recursos", "Recursos"],
            ["#dinheiro", "Como o dinheiro anda"],
            ["#como-funciona", "Como funciona"],
            ["#planos", "Planos"],
            ["#duvidas", "Dúvidas"],
          ].map(([href, t]) => (
            <a key={href} href={href} className="px-3 py-2 rounded-lg hover:text-texto hover:bg-superficie-2">
              {t}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <BotaoEntrar />
          <a
            href="/cadastro"
            className="hidden sm:inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primaria text-sobre-primaria text-sm font-bold hover:brightness-110"
          >
            Cadastrar torcida
          </a>
        </div>
      </div>
    </header>
  );
}

/** "Entrar" no nosso site é só para a equipe da torcida; sócio e torcedor entram pelo site da própria torcida. */
function BotaoEntrar() {
  return (
    <a
      href="/entrar"
      className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-linha-forte text-sm font-semibold hover:bg-superficie-2"
      title="Painel da diretoria, subsede e portaria"
    >
      <Icone nome="painel" className="size-4" />
      Entrar
    </a>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────

function Hero({ slugDemo }: OpcoesLanding) {
  return (
    <section className="relative overflow-hidden" aria-labelledby="titulo-principal">
      <div className="absolute inset-0 brilho-primaria" aria-hidden="true" />
      <div className="absolute inset-0 grade-fundo" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24 grid lg:grid-cols-[1.15fr_0.85fr] gap-12 items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-secundaria">Para diretorias de torcidas organizadas</p>
          <h1 id="titulo-principal" className="font-display uppercase text-[32px] min-[400px]:text-[38px] sm:text-6xl lg:text-[64px] leading-[0.98] mt-4 text-balance">
            Sócio em dia, ingresso sem fraude e o <span className="text-secundaria">caixa na conta da torcida</span>.
          </h1>
          <p className="text-texto-2 text-lg sm:text-xl mt-6 max-w-2xl text-pretty">
            Programa de sócios, venda de ingressos e portaria com QR Code numa plataforma só. Cada pagamento cai direto na conta da torcida e de cada
            subsede, com tudo registrado para a diretoria prestar contas.
          </p>
          <div className="mt-8 flex flex-col min-[480px]:flex-row gap-3">
            <a
              href="/cadastro"
              className="inline-flex items-center justify-center gap-2 h-13 px-6 rounded-2xl bg-primaria text-sobre-primaria font-bold text-[16px] shadow-lg shadow-primaria/30 hover:brightness-110"
            >
              <Icone nome="bandeira" className="size-5" /> Cadastrar minha torcida
            </a>
            {slugDemo ? (
              <a
                href={`/${slugDemo}`}
                className="inline-flex items-center justify-center gap-2 h-13 px-6 rounded-2xl border border-linha-forte font-semibold hover:bg-superficie-2"
              >
                Ver uma torcida de exemplo <Icone nome="setaDireita" className="size-5" />
              </a>
            ) : (
              <a href="#como-funciona" className="inline-flex items-center justify-center gap-2 h-13 px-6 rounded-2xl border border-linha-forte font-semibold hover:bg-superficie-2">
                Ver como funciona <Icone nome="setaDireita" className="size-5" />
              </a>
            )}
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-texto-2">
            {["Cadastro em 5 minutos", "Teste tudo em modo demonstração", "Só paga depois de publicar o site"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Icone nome="check" className="size-4 text-secundaria" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <VitrineProduto />
      </div>
    </section>
  );
}

/** Ilustração do produto em HTML/CSS (sem imagem para baixar): ingresso no celular + avisos do painel. */
function VitrineProduto() {
  return (
    <div className="relative mx-auto w-full max-w-[380px] lg:max-w-none" aria-hidden="true">
      <div className="relative mx-auto w-[260px] sm:w-[280px] rounded-[40px] border border-linha-forte bg-superficie p-3 shadow-2xl shadow-black/60">
        <div className="rounded-[30px] bg-fundo overflow-hidden border border-linha">
          <div className="h-24 bg-gradient-to-br from-primaria to-[#1a3a9e] p-4 flex items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Caravana · Final</p>
              <p className="font-display uppercase text-white text-lg leading-tight">Torcida Exemplo</p>
            </div>
          </div>
          <div className="p-4">
            <div className="flex justify-between text-[11px] text-texto-2">
              <span>Titular</span>
              <span>Lugar</span>
            </div>
            <div className="flex justify-between font-semibold text-sm">
              <span>João P. Santos</span>
              <span>Ônibus 2 · 14</span>
            </div>
            <div className="mt-4 rounded-2xl bg-white p-3">
              <QrIlustrativo />
            </div>
            <p className="mt-3 text-center text-[11px] text-texto-2">Mostre na portaria · vale uma entrada</p>
          </div>
        </div>
      </div>
      <Aviso className="absolute right-0 sm:-right-8 -top-5" icone="pix" titulo="Pix aprovado" detalhe="Ingresso liberado na hora" />
      <Aviso className="absolute left-0 sm:-left-10 top-[46%]" icone="cadeado" titulo="QR já utilizado" detalhe="Entrada barrada na portaria" tom="secundaria" />
      <Aviso className="absolute right-0 sm:-right-6 bottom-6" icone="escudo" titulo="Mensalidade paga" detalhe="Cartão cobrado sozinho" />
    </div>
  );
}

function Aviso({ className, icone, titulo, detalhe, tom = "primaria" }: { className: string; icone: NomeIcone; titulo: string; detalhe: string; tom?: "primaria" | "secundaria" }) {
  return (
    <div className={`${className} flex items-center gap-2.5 rounded-2xl border border-linha-forte bg-superficie-2/95 backdrop-blur px-3 py-2.5 shadow-xl shadow-black/40`}>
      <span className={`size-8 rounded-xl grid place-items-center ${tom === "primaria" ? "bg-primaria text-sobre-primaria" : "bg-secundaria text-sobre-secundaria"}`}>
        <Icone nome={icone} className="size-4" />
      </span>
      <span>
        <span className="block text-xs font-bold">{titulo}</span>
        <span className="block text-[11px] text-texto-2">{detalhe}</span>
      </span>
    </div>
  );
}

/** QR Code meramente ilustrativo (padrão fixo, não lê nada). */
function QrIlustrativo() {
  const n = 25;
  let d = "";
  const marcador = (x: number, y: number) => {
    d += `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  };
  marcador(0, 0);
  marcador(n - 7, 0);
  marcador(0, n - 7);
  let s = 7;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const emMarcador = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      if (!emMarcador && s % 100 < 47) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="w-full h-auto" shapeRendering="crispEdges">
      <path d={d} fill="#0b0d12" fillRule="evenodd" />
    </svg>
  );
}

// ── Seções ─────────────────────────────────────────────────────────────────

function Secao({ id, rotulo, titulo, children, descricao, className = "" }: { id: string; rotulo: string; titulo: ReactNode; descricao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 mx-auto max-w-6xl w-full px-4 sm:px-6 py-16 sm:py-24 ${className}`} aria-labelledby={`titulo-${id}`}>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-secundaria">{rotulo}</p>
      <h2 id={`titulo-${id}`} className="text-3xl sm:text-[44px] leading-[1.08] font-bold tracking-tight mt-3 max-w-3xl text-balance">
        {titulo}
      </h2>
      {descricao && <p className="text-texto-2 text-lg mt-4 max-w-2xl text-pretty">{descricao}</p>}
      {children}
    </section>
  );
}

function Problema() {
  const dores: { icone: NomeIcone; titulo: string; texto: string }[] = [
    { icone: "chat", titulo: "Mensalidade cobrada no grupo", texto: "Comprovante por comprovante no WhatsApp e uma planilha que ninguém confia. No fim do mês, ninguém sabe ao certo quem está em dia." },
    { icone: "lista", titulo: "Caravana vendida no boca a boca", texto: "Lista no papel, dinheiro em várias mãos e gente embarcando sem ter pago. Quem organiza arca com a diferença." },
    { icone: "ingresso", titulo: "Ingresso que vira print", texto: "O mesmo comprovante circula em vários celulares e, na portaria, ninguém consegue saber qual é o verdadeiro." },
    { icone: "casa", titulo: "Subsede que repassa quando pode", texto: "Cada sede vende do seu jeito e repassa depois. Na hora de prestar contas, cada um tem um número diferente." },
  ];
  return (
    <Secao
      id="problema"
      rotulo="A realidade de quem é da diretoria"
      titulo="A torcida cresce. O controle continua no caderno e no grupo do WhatsApp."
      descricao="Não é falta de vontade da diretoria. É falta de uma ferramenta feita para o dia a dia de torcida organizada."
    >
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {dores.map((d) => (
          <article key={d.titulo} className="rounded-cartao border border-linha bg-superficie p-6 flex gap-4">
            <span className="size-11 shrink-0 rounded-2xl bg-superficie-3 text-texto-2 grid place-items-center">
              <Icone nome={d.icone} className="size-5" />
            </span>
            <div>
              <h3 className="font-bold text-lg">{d.titulo}</h3>
              <p className="text-texto-2 mt-1.5 leading-relaxed">{d.texto}</p>
            </div>
          </article>
        ))}
      </div>
    </Secao>
  );
}

function Recursos() {
  const recursos: { icone: NomeIcone; rotulo: string; titulo: string; itens: string[] }[] = [
    {
      icone: "escudo",
      rotulo: "Programa de sócios",
      titulo: "Mensalidade que se cobra sozinha",
      itens: [
        "Planos mensal, anual ou do jeito da diretoria",
        "Cartão cobrado automaticamente todo mês",
        "Pix com lembrete por e-mail antes do vencimento",
        "Carteirinha digital com QR Code no celular",
      ],
    },
    {
      icone: "ingresso",
      rotulo: "Ingressos e eventos",
      titulo: "Caravana, festa e jogo vendidos por um link",
      itens: [
        "Preço de sócio e preço público no mesmo evento",
        "Para de vender sozinho quando os lugares acabam",
        "Pagamento no Pix ou no cartão, aprovado na hora",
        "Ingresso nominal que o torcedor acessa com CPF e senha",
      ],
    },
    {
      icone: "qr",
      rotulo: "Portaria",
      titulo: "Cada QR Code entra uma vez só",
      itens: [
        "O porteiro usa a câmera do próprio celular",
        "QR assinado digitalmente: cópia e print são barrados",
        "Login de portaria criado pela diretoria, só para essa função",
        "Contagem de quem já entrou em tempo real",
      ],
    },
    {
      icone: "casa",
      rotulo: "Subsedes",
      titulo: "Cada subsede recebe na própria conta",
      itens: [
        "Divisão automática do pagamento, sem repasse manual",
        "A subsede vende os próprios eventos e vê só o que é dela",
        "A diretoria acompanha o extrato de todas as sedes",
        "Dados bancários da subsede cadastrados por ela mesma",
      ],
    },
    {
      icone: "pincel",
      rotulo: "Página da torcida",
      titulo: "Um site oficial com a cara da torcida",
      itens: [
        "somosorganizada.com.br/sua-torcida com escudo e cores",
        "Eventos, planos de sócio e contatos num lugar só",
        "E-mails de confirmação com a identidade da torcida",
        "Funciona bem no celular, onde o torcedor está",
      ],
    },
    {
      icone: "grafico",
      rotulo: "Gestão e prestação de contas",
      titulo: "Números que a diretoria pode mostrar",
      itens: [
        "Vendas, sócios ativos e atrasos de cada sede",
        "Histórico de todos os pagamentos e estornos",
        "Exportação para planilha quando precisar",
        "Acesso por função: diretoria, subsede e portaria",
      ],
    },
  ];
  return (
    <Secao
      id="recursos"
      rotulo="Recursos"
      titulo="Tudo o que a torcida vende e controla, num painel só."
      descricao="Cada parte foi pensada para um problema real de torcida, do sócio que esquece de pagar ao print repassado na porta do ônibus."
      className="border-t border-linha"
    >
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {recursos.map((r) => (
          <article key={r.rotulo} className="rounded-cartao border border-linha bg-superficie p-6 flex flex-col">
            <span className="size-11 rounded-2xl bg-primaria/15 text-destaque grid place-items-center">
              <Icone nome={r.icone} className="size-6" />
            </span>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-texto-2">{r.rotulo}</p>
            <h3 className="font-bold text-xl mt-1.5 leading-snug">{r.titulo}</h3>
            <ul className="mt-4 space-y-2.5 text-[15px] text-texto-2">
              {r.itens.map((i) => (
                <li key={i} className="flex gap-2.5">
                  <Icone nome="check" className="size-4 text-secundaria shrink-0 mt-1" />
                  {i}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Secao>
  );
}

function Dinheiro() {
  const passos: { icone: NomeIcone; titulo: string; texto: string }[] = [
    { icone: "usuario", titulo: "O torcedor paga", texto: "No Pix ou no cartão, pela página da torcida." },
    { icone: "cadeado", titulo: "A Pagar.me processa", texto: "Empresa de pagamentos do grupo Stone, na conta aberta pela própria torcida." },
    { icone: "dinheiro", titulo: "Cai na conta certa", texto: "Direto na conta da torcida. A parte da subsede vai para a conta da subsede." },
  ];
  return (
    <section id="dinheiro" className="scroll-mt-20 border-y border-linha bg-superficie/60" aria-labelledby="titulo-dinheiro">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-secundaria">Como o dinheiro anda</p>
          <h2 id="titulo-dinheiro" className="text-3xl sm:text-[44px] leading-[1.08] font-bold tracking-tight mt-3 text-balance">
            O dinheiro da torcida não passa pela gente.
          </h2>
          <p className="text-texto-2 text-lg mt-4 text-pretty">
            A Somos Organizada é a ferramenta, não a intermediária. Não toca no dinheiro, não segura repasse e não cobra porcentagem das vendas: cobra só
            uma mensalidade fixa da diretoria.
          </p>
          <div className="mt-8 rounded-cartao border border-secundaria/40 bg-secundaria/8 p-6">
            <p className="font-bold text-lg">A taxa de serviço de 10% fica com a torcida</p>
            <p className="text-texto-2 mt-2 leading-relaxed">
              Em cada ingresso e mensalidade, o torcedor vê uma taxa de serviço de 10% antes de pagar. Ela ajuda a cobrir as tarifas do cartão e do Pix, e
              o que sobra vira caixa da torcida.
            </p>
          </div>
        </div>
        <ol className="relative space-y-4">
          {passos.map((p, i) => (
            <li key={p.titulo} className="relative flex gap-4 rounded-cartao border border-linha bg-fundo p-5">
              <span className="relative size-12 shrink-0 rounded-2xl bg-primaria text-sobre-primaria grid place-items-center">
                <Icone nome={p.icone} className="size-6" />
                <span className="absolute -top-2 -right-2 size-6 rounded-full bg-secundaria text-sobre-secundaria text-xs font-bold grid place-items-center">{i + 1}</span>
              </span>
              <div>
                <h3 className="font-bold text-lg">{p.titulo}</h3>
                <p className="text-texto-2 mt-1">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Conta simples com os números da própria torcida. Valores iniciais de exemplo; o script recalcula ao digitar. */

function Calculadora() {
  const campos: { id: keyof typeof CALCULO_INICIAL; rotulo: string; prefixo?: string; max: number }[] = [
    { id: "socios", rotulo: "Sócios pagantes", max: 100000 },
    { id: "mensalidade", rotulo: "Mensalidade média", prefixo: "R$", max: 10000 },
    { id: "ingressos", rotulo: "Ingressos vendidos no mês", max: 100000 },
    { id: "preco", rotulo: "Preço médio do ingresso", prefixo: "R$", max: 10000 },
  ];
  const taxa = calcularTaxa(CALCULO_INICIAL);
  const plano = PLANOS_SAAS_PADRAO.pro.valor;
  return (
    <Secao
      id="conta"
      rotulo="Faça a conta"
      titulo="Quanto a taxa de serviço rende para a sua torcida?"
      descricao="Coloque os números da sua torcida. A conta é só a taxa de serviço de 10%, que fica com a torcida."
    >
      <form className="mt-10 grid lg:grid-cols-[1fr_0.9fr] gap-4" data-calculadora>
        <div className="rounded-cartao border border-linha bg-superficie p-6 grid gap-5 sm:grid-cols-2">
          {campos.map((c) => (
            <div key={c.id}>
              <label htmlFor={`calc-${c.id}`} className="block text-sm font-medium text-texto-2 mb-1.5">
                {c.rotulo}
              </label>
              <div className="flex items-center h-12 rounded-2xl bg-superficie-2 border border-linha px-4 focus-within:border-primaria">
                {c.prefixo && <span className="text-texto-2 mr-2">{c.prefixo}</span>}
                <input
                  id={`calc-${c.id}`}
                  name={c.id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={c.max}
                  step={1}
                  defaultValue={CALCULO_INICIAL[c.id]}
                  className="w-full bg-transparent outline-none text-[16px] font-semibold numeros"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-cartao border border-primaria/50 bg-primaria/10 p-6 flex flex-col">
          <p className="text-sm text-texto-2">Taxa de serviço no mês, para a torcida</p>
          <p className="font-display text-5xl mt-1 numeros" data-calc="taxa" aria-live="polite">
            {reais(taxa)}
          </p>
          <dl className="mt-6 space-y-2 text-[15px] border-t border-linha pt-4">
            <div className="flex justify-between gap-4">
              <dt className="text-texto-2">Plano {PLANOS_SAAS_PADRAO.pro.nome}</dt>
              <dd className="font-semibold numeros" data-calc="plano">
                {reais(plano)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-texto-2">Diferença no mês</dt>
              <dd className="font-bold numeros text-secundaria" data-calc="saldo">
                {reais(taxa - plano)}
              </dd>
            </div>
          </dl>
          <p className="mt-auto pt-6 text-xs text-texto-2 leading-relaxed">
            Conta de exemplo, antes das tarifas da Pagar.me, que dependem do contrato de cada torcida. O plano ideal depende do tamanho da torcida (veja
            abaixo).
          </p>
        </div>
      </form>
    </Secao>
  );
}

function ComoFunciona() {
  const passos: { titulo: string; texto: string }[] = [
    { titulo: "Cadastre a torcida", texto: "Nome, endereço do site, cores e responsável. Leva uns 5 minutos. A equipe confere e aprova, normalmente em até 1 dia útil." },
    { titulo: "Monte tudo em modo demonstração", texto: "Eventos, planos de sócio, subsedes e usuários. Faça compras de teste com pagamento simulado, sem risco nenhum." },
    { titulo: "Conecte a conta da torcida", texto: "Um passo a passo com vídeo mostra onde pegar as chaves da Pagar.me. Cada subsede cadastra a conta dela." },
    { titulo: "Publique e divulgue o link", texto: "A mensalidade da plataforma começa aqui, e a primeira vence 7 dias depois. Daí em diante, é vender e acompanhar." },
  ];
  return (
    <Secao id="como-funciona" rotulo="Como funciona" titulo="Do cadastro à primeira venda em 4 passos." className="border-t border-linha">
      <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {passos.map((p, i) => (
          <li key={p.titulo} className="rounded-cartao border border-linha bg-superficie p-6">
            <span className="font-display text-4xl text-secundaria numeros" aria-hidden="true">
              0{i + 1}
            </span>
            <h3 className="font-bold text-lg mt-3">{p.titulo}</h3>
            <p className="text-texto-2 mt-2 leading-relaxed text-[15px]">{p.texto}</p>
          </li>
        ))}
      </ol>
    </Secao>
  );
}

function Planos() {
  const ordem = ["pro", "plus", "max"] as const;
  const numero = (n: number) => n.toLocaleString("pt-BR");
  return (
    <Secao
      id="planos"
      rotulo="Planos"
      titulo="Mensalidade fixa. Nenhuma porcentagem sobre as vendas."
      descricao={
        <>
          Todos os planos têm tudo; muda só o tamanho. A cobrança só começa quando a diretoria publica o site. Pagamento{" "}
          <strong className="text-texto">no Pix</strong>, sem multa e sem juros.
        </>
      }
      className="border-t border-linha"
    >
      <div className="grid gap-4 md:grid-cols-3 mt-10">
        {ordem.map((k) => {
          const destaque = k === "plus";
          const p = PLANOS_SAAS_PADRAO[k];
          const itens = [`Até ${numero(p.socios)} sócios`, `Até ${numero(p.eventos)} eventos à venda ao mesmo tempo`];
          return (
            <article
              key={k}
              className={`rounded-cartao border p-6 flex flex-col ${destaque ? "border-primaria bg-primaria/8 ring-1 ring-primaria" : "border-linha bg-superficie"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-lg">{p.nome}</h3>
                {destaque && <span className="text-[11px] font-bold uppercase rounded-full bg-primaria text-sobre-primaria px-2 py-0.5">Recomendado</span>}
              </div>
              <p className="mt-3">
                <span className="text-4xl font-bold numeros" data-plano={k}>
                  {reais(p.valor)}
                </span>
                <span className="text-texto-2"> /mês</span>
              </p>
              <p className="text-sm text-texto-2 mt-1">{p.descricao}</p>
              <ul className="mt-5 space-y-2 text-[15px] flex-1">
                {itens.map((d) => (
                  <li key={d} className="flex gap-2">
                    <Icone nome="check" className="size-4 text-secundaria shrink-0 mt-1" />
                    {d}
                  </li>
                ))}
                <li className="flex gap-2">
                  <Icone nome="check" className="size-4 text-secundaria shrink-0 mt-1" />
                  Subsedes, portaria e divisão automática dos pagamentos
                </li>
              </ul>
              <a
                href="/cadastro"
                className={`mt-6 inline-flex items-center justify-center h-11 rounded-2xl font-semibold ${destaque ? "bg-primaria text-sobre-primaria hover:brightness-110" : "border border-linha-forte hover:bg-superficie-2"}`}
              >
                Começar com este plano<span className="sr-only">: {p.nome}</span>
              </a>
            </article>
          );
        })}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3 text-sm text-texto-2">
        {[
          ["pix", "1ª mensalidade vence 7 dias depois de publicar o site."],
          ["dinheiro", "Tarifas da Pagar.me são da conta da torcida, como em qualquer maquininha."],
          ["alerta", "Com 7 dias de atraso, o site sai do ar até o Pix ser confirmado."],
        ].map(([ic, t]) => (
          <p key={t} className="flex gap-3 rounded-2xl border border-linha bg-superficie p-4">
            <Icone nome={ic as NomeIcone} className="size-5 shrink-0 text-texto-2" />
            {t}
          </p>
        ))}
      </div>
    </Secao>
  );
}

function Duvidas() {
  return (
    <Secao id="duvidas" rotulo="Dúvidas" titulo="Perguntas que toda diretoria faz." className="border-t border-linha">
      <div className="mt-10 grid gap-3 lg:grid-cols-2 items-start">
        {PERGUNTAS.map((q) => (
          <details key={q.p} className="group rounded-2xl border border-linha bg-superficie open:border-linha-forte">
            <summary className="list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-4 p-5 cursor-pointer font-semibold">
              <h3 className="text-[16px]">{q.p}</h3>
              <Icone nome="mais" className="size-5 shrink-0 text-texto-2 transition-transform group-open:rotate-45" />
            </summary>
            <p className="px-5 pb-5 -mt-1 text-texto-2 leading-relaxed">{q.r}</p>
          </details>
        ))}
      </div>
    </Secao>
  );
}

function ChamadaFinal() {
  return (
    <section className="mx-auto max-w-6xl w-full px-4 sm:px-6 pb-20" aria-labelledby="titulo-final">
      <div className="relative overflow-hidden rounded-[28px] border border-primaria/40 bg-gradient-to-br from-primaria/25 via-superficie to-superficie p-8 sm:p-12">
        <div className="relative max-w-2xl">
          <h2 id="titulo-final" className="text-3xl sm:text-[44px] leading-[1.08] font-bold tracking-tight text-balance">
            Um caixa que toda a torcida pode conferir.
          </h2>
          <p className="text-texto-2 text-lg mt-4 text-pretty">
            Cadastre a torcida hoje, monte tudo em modo demonstração e só publique quando a diretoria estiver segura.
          </p>
          <div className="mt-8 flex flex-col min-[480px]:flex-row gap-3">
            <a href="/cadastro" className="inline-flex items-center justify-center gap-2 h-13 px-6 rounded-2xl bg-primaria text-sobre-primaria font-bold hover:brightness-110">
              <Icone nome="bandeira" className="size-5" /> Cadastrar minha torcida
            </a>
            <a
              href={LINK_WHATSAPP}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center justify-center gap-2 h-13 px-6 rounded-2xl bg-secundaria text-sobre-secundaria font-bold hover:brightness-105"
            >
              <Icone nome="whatsapp" className="size-5" /> Falar com a equipe
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="mt-auto border-t border-linha">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Marca />
          <p className="text-sm text-texto-2 mt-3 max-w-sm">Sócios, ingressos e portaria para torcidas organizadas, com o dinheiro direto na conta da torcida.</p>
        </div>
        <nav aria-label="Plataforma" className="text-sm">
          <p className="font-semibold">Plataforma</p>
          <ul className="mt-3 space-y-2 text-texto-2">
            <li><a className="hover:text-texto" href="#recursos">Recursos</a></li>
            <li><a className="hover:text-texto" href="#planos">Planos</a></li>
            <li><a className="hover:text-texto" href="#duvidas">Dúvidas</a></li>
            <li><a className="hover:text-texto" href="/cadastro">Cadastrar torcida</a></li>
          </ul>
        </nav>
        <nav aria-label="Acesso" className="text-sm">
          <p className="font-semibold">Acesso</p>
          <ul className="mt-3 space-y-2 text-texto-2">
            <li><a className="hover:text-texto" href="/entrar">Painel da diretoria</a></li>
            <li><a className="hover:text-texto" href={LINK_WHATSAPP} target="_blank" rel="noopener">WhatsApp da equipe</a></li>
          </ul>
        </nav>
      </div>
      <p className="border-t border-linha py-5 text-center text-xs text-texto-2">Somos Organizada · Uma solução Conversão Black</p>
    </footer>
  );
}
