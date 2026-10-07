// Mantém a Pagar.me simulada no ar durante o desenvolvimento local (porta 4010).
import { iniciar } from "./pagarme-simulada.mjs";
await iniciar(4010);
console.log("Pagar.me simulada em http://127.0.0.1:4010");
