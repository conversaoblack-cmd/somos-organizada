/** Ícones de traço (24x24, currentColor). Uso: <Icone nome="calendario" className="size-5" /> */
import type { SVGProps } from "react";

const caminhos = {
  calendario: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  ingresso: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V7ZM13 5v2M13 11v2M13 17v2",
  escudo: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z",
  cartao: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM3 10h18M7 15h4",
  pix: "M12 3l3.5 3.5L12 10 8.5 6.5 12 3ZM3 12l3.5-3.5L10 12l-3.5 3.5L3 12ZM14 12l3.5-3.5L21 12l-3.5 3.5L14 12ZM12 14l3.5 3.5L12 21l-3.5-3.5L12 14Z",
  usuario: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
  usuarios: "M17 21a6 6 0 0 0-12 0M11 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21a5 5 0 0 0-4-4.9M16 3.1a4 4 0 0 1 0 7.8",
  local: "M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12ZM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  relogio: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  check: "M5 12.5l4.5 4.5L19 7.5",
  checkCirculo: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.5l2.8 2.8L16.5 9.5",
  x: "M6 6l12 12M18 6L6 18",
  xCirculo: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 9l6 6M15 9l-6 6",
  alerta: "M12 9v4M12 17h.01M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01",
  setaDireita: "M5 12h14M13 6l6 6-6 6",
  setaEsquerda: "M19 12H5M11 6l-6 6 6 6",
  chevronDireita: "M9 6l6 6-6 6",
  chevronEsquerda: "M15 6l-6 6 6 6",
  chevronBaixo: "M6 9l6 6 6-6",
  mais: "M12 5v14M5 12h14",
  menos: "M5 12h14",
  copiar: "M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V9ZM5 15H4a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v1",
  qr: "M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z",
  camera: "M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  painel: "M3 3h8v10H3V3ZM13 3h8v6h-8V3ZM13 11h8v10h-8V11ZM3 15h8v6H3v-6Z",
  grafico: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  dinheiro: "M3 7h18v10H3V7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 10v4M18 10v4",
  casa: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z",
  pincel: "M18.4 2.6a2 2 0 0 1 2.9 2.9L11 15.8 8.2 13 18.4 2.6ZM7 14.5c-2 0-3.5 1.6-3.5 3.5 0 1.2-.6 2.2-1.5 2.5 1 .9 2.5 1.5 4 1.5 2.5 0 4.5-2 4.5-4.5L7 14.5Z",
  engrenagem: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  chave: "M15.5 7.5a3.5 3.5 0 1 1-3.4 4.3L3 21h-.5v-3h2v-2h2v-2l3.1-3.1a3.5 3.5 0 0 1 5.9-3.4Z",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z",
  enviar: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7Z",
  sair: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  lixeira: "M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14",
  lapis: "M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4",
  olho: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  imagem: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  busca: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-5-5",
  filtro: "M3 5h18l-7 8v6l-4 2v-8L3 5Z",
  raio: "M13 2L4 14h7l-1 8 9-12h-7l1-8Z",
  estrela: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z",
  sino: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  bandeira: "M4 21V4M4 4h13l-2 4 2 4H4",
  bug: "M8 8V6a4 4 0 0 1 8 0v2M6 10h12v5a6 6 0 0 1-12 0v-5ZM3 13h3M18 13h3M4 8l2 2M20 8l-2 2M4 19l2-2M20 19l-2-2M12 10v11",
  lista: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  grade: "M3 3h7v7H3V3ZM14 3h7v7h-7V3ZM3 14h7v7H3v-7ZM14 14h7v7h-7v-7Z",
  menu: "M3 6h18M3 12h18M3 18h18",
  externo: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  whatsapp: "M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.6ZM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.4-2.4-1.8-2.8-2.8l.8-1-1-2L9 8.5Z",
  instagram: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17.5 6.5h.01",
  cadeado: "M5 11h14v10H5V11ZM8 11V7a4 4 0 0 1 8 0v4",
  presente: "M3 8h18v4H3V8ZM5 12v9h14v-9M12 8v13M12 8S10.5 3 8 3.5 7 7 12 8ZM12 8s1.5-5 4-4.5S17 7 12 8Z",
  atualizar: "M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5",
} as const;

export type NomeIcone = keyof typeof caminhos;

export function Icone({ nome, ...props }: { nome: NomeIcone } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={caminhos[nome]} />
    </svg>
  );
}
