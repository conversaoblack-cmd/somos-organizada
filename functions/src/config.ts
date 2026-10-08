import { setGlobalOptions } from "firebase-functions/v2";
import { defineInt, defineSecret, defineString } from "firebase-functions/params";

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

// Cota de CPU por região do Cloud Run = soma de (vCPU × máx. instâncias) de todas as funções, e projeto
// novo tem cota baixa. Cada instância (1 vCPU) atende 80 pedidos ao mesmo tempo (o trabalho é quase todo
// espera de Firestore e Pagar.me). Padrão enxuto (1 instância = 80 pedidos simultâneos; painéis e rotinas)
// e 3 instâncias (240 simultâneos) onde o torcedor está (ESCALA_PUBLICA). Total: 28×1 + 11×3 = 61 vCPU.
// Ajustável por projeto em functions/.env, sem mexer no código: MAX_INSTANCIAS e MAX_INSTANCIAS_PUBLICAS.
export const MAX_INSTANCIAS = defineInt("MAX_INSTANCIAS", { default: 1 });
export const MAX_INSTANCIAS_PUBLICAS = defineInt("MAX_INSTANCIAS_PUBLICAS", { default: 3 });
setGlobalOptions({ region: REGIAO, maxInstances: MAX_INSTANCIAS, cpu: 1, concurrency: 80, memory: "512MiB" });
/** Compra, pagamento, aviso da Pagar.me, carteirinha, login por CPF e portaria. */
export const ESCALA_PUBLICA = { maxInstances: MAX_INSTANCIAS_PUBLICAS };

/** Regras de negócio padrão. Cada torcida pode sobrescrever algumas no próprio documento. */
export const PADROES = {
  taxaServicoPct: 10,
  pixExpiraSegundos: 30 * 60,
  pixRenovacaoExpiraDias: 7,
  diasAntecedenciaRenovacao: 5,
  carenciaInadimplenciaDias: 5,
  limiteIngressosPorPedido: 6,
} as const;
