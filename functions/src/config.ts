import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret, defineString } from "firebase-functions/params";

export const REGIAO = "southamerica-east1";
export const FUSO = "America/Sao_Paulo";

/** Chave AES-256 (64 caracteres hex) usada para cifrar as credenciais Pagar.me de cada torcida. */
export const MASTER_KEY = defineSecret("MASTER_KEY");
/** Segredo HMAC que assina o QR Code de cada ingresso e carteirinha. */
export const QR_HMAC = defineSecret("QR_HMAC");

/** Endereço público do app (usado em links e na URL de webhook mostrada às torcidas). */
export const URL_APP = defineString("URL_APP", { default: "https://somosorganizada.com.br" });
/** E-mails (separados por vírgula) que podem reivindicar acesso ao painel da plataforma. */
export const PLATAFORMA_EMAILS = defineString("PLATAFORMA_EMAILS", { default: "conversaoblack@gmail.com" });

// Cota de CPU por região do Cloud Run = soma de (vCPU x máx. instâncias) de todas as funções.
// Com 1 vCPU x 20 instâncias por função o deploy estoura a cota de projeto novo. Aqui: 1 vCPU,
// até 4 instâncias, cada uma atendendo 80 requisições simultâneas (o trabalho é quase todo I/O:
// Firestore e Pagar.me). ~320 compras em paralelo por função usando só 4 vCPU de cota.
setGlobalOptions({ region: REGIAO, maxInstances: 4, cpu: 1, concurrency: 80, memory: "512MiB" });

/** Regras de negócio padrão. Cada torcida pode sobrescrever algumas no próprio documento. */
export const PADROES = {
  taxaServicoPct: 10,
  pixExpiraSegundos: 30 * 60,
  pixRenovacaoExpiraDias: 7,
  diasAntecedenciaRenovacao: 5,
  carenciaInadimplenciaDias: 5,
  limiteIngressosPorPedido: 6,
} as const;
