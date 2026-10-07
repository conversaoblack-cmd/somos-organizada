import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret, defineString } from "firebase-functions/params";

export const REGIAO = "southamerica-east1";
export const FUSO = "America/Sao_Paulo";

/** Chave AES-256 (64 caracteres hex) usada para cifrar as credenciais Pagar.me de cada torcida. */
export const MASTER_KEY = defineSecret("MASTER_KEY");
/** Segredo HMAC que assina o QR Code de cada ingresso e carteirinha. */
export const QR_HMAC = defineSecret("QR_HMAC");
/** Chave da API de e-mail (Brevo "xkeysib-..." ou Resend "re_..."). "desativado" = não envia. */
export const EMAIL_API_KEY = defineSecret("EMAIL_API_KEY");

/** Endereço público do app (usado em links e na URL de webhook mostrada às torcidas). */
export const URL_APP = defineString("URL_APP", { default: "https://somosorganizada.com.br" });
/** E-mails (separados por vírgula) que podem reivindicar acesso ao painel da plataforma. */
/** Remetente dos e-mails (domínio verificado no Brevo/Resend). */
export const EMAIL_REMETENTE = defineString("EMAIL_REMETENTE", { default: "Somos Organizada <nao-responda@somosorganizada.com.br>" });
/** Chave pública do app Web: usada só para conferir a senha no login por CPF. */
export const WEB_API_KEY = defineString("WEB_API_KEY", { default: "" });
export const PLATAFORMA_EMAILS = defineString("PLATAFORMA_EMAILS", { default: "conversaoblack@gmail.com" });

// Cota de CPU por região do Cloud Run = soma de (vCPU x máx. instâncias) de todas as funções.
// Com 1 vCPU x 20 instâncias por função o deploy estoura a cota de projeto novo. Aqui: 1 vCPU,
// até 4 instâncias, cada uma atendendo 80 requisições simultâneas (o trabalho é quase todo I/O:
// Firestore e Pagar.me). ~320 compras em paralelo por função usando só 4 vCPU de cota.
// Projeto novo no Google Cloud tem cota baixa de CPU por região (soma de cpu × máximo de instâncias).
// Padrão enxuto (2 instâncias × 80 pedidos simultâneos cada) e mais fôlego só onde o torcedor está:
// compra, pagamento, carteirinha e portaria (ESCALA_PUBLICA).
setGlobalOptions({ region: REGIAO, maxInstances: 2, cpu: 1, concurrency: 80, memory: "512MiB" });
export const ESCALA_PUBLICA = { maxInstances: 5 } as const;

/** Regras de negócio padrão. Cada torcida pode sobrescrever algumas no próprio documento. */
export const PADROES = {
  taxaServicoPct: 10,
  pixExpiraSegundos: 30 * 60,
  pixRenovacaoExpiraDias: 7,
  diasAntecedenciaRenovacao: 5,
  carenciaInadimplenciaDias: 5,
  limiteIngressosPorPedido: 6,
} as const;
