import type { Papel } from "@/lib/tipos";

/**
 * id do tour da página para o papel do usuário (ex.: "eventos" → admin-eventos ou subsede-eventos).
 * Fica separado de tours.ts (textos de todos os passos) para o botão de ajuda usar sem carregar os tours.
 */
export function idTour(pagina: string, papel: Papel): string {
  const prefixo = papel === "diretoria" ? "admin" : papel === "subsede" ? "subsede" : "portaria";
  return `${prefixo}-${pagina}`;
}
