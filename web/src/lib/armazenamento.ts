/**
 * Storage (fotos de sócio, escudo, banner, imagem de evento) separado do firebase.ts: só entra no pedaço do app
 * que envia ou mostra arquivos, e não pesa no carregamento de quem só vai comprar ingresso.
 */
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { app, USANDO_EMULADORES } from "./firebase";

export const storage = getStorage(app);
if (USANDO_EMULADORES) connectStorageEmulator(storage, "127.0.0.1", 9199);
