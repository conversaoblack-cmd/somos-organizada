/**
 * Quem responde pelos dados de sócios e compradores na página da torcida (Termos e Política de privacidade).
 * Só dados já públicos: razão social e CNPJ (Receita Federal), cidade e UF. Nunca CPF nem endereço do responsável.
 */
export interface IdentificacaoTorcida {
  razaoSocial?: string;
  cnpj?: string;
  cidade: string;
  uf: string;
}

/** A partir do cadastro (solicitação aprovada ou torcidas/{tid}/saas/cadastro). */
export function identificacaoPublica(cadastro: { entidade?: Record<string, unknown>; endereco?: Record<string, unknown> } | undefined): IdentificacaoTorcida {
  const ent = cadastro?.entidade ?? {};
  return {
    ...(ent.tipo === "cnpj" && ent.cnpj ? { cnpj: String(ent.cnpj), razaoSocial: String(ent.razaoSocial ?? "") } : {}),
    cidade: String(cadastro?.endereco?.cidade ?? ""),
    uf: String(cadastro?.endereco?.uf ?? ""),
  };
}
