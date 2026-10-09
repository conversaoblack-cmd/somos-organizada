import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

export const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
auth.languageCode = "pt-BR";
// Cache no aparelho: carteirinha, ingressos e dados já vistos abrem mesmo com internet ruim (portaria, estádio).
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
export const fns = getFunctions(app, "southamerica-east1");

export const USANDO_EMULADORES = import.meta.env.VITE_USAR_EMULADORES === "true";
if (USANDO_EMULADORES) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
}

/**
 * Alguém saiu da conta neste aparelho (lib/offline.ts marca): na abertura seguinte do site, apaga o cache do
 * Firestore, que guarda os ingressos com QR, antes de qualquer leitura (só funciona com o Firestore ainda parado).
 * Se outra aba do site estiver aberta, o Firestore dela é encerrado pelo SDK para a limpeza acontecer (aquela aba
 * precisa ser recarregada); se a limpeza falhar, a marca fica e tenta de novo na próxima abertura.
 */
export const LIMPAR_CACHE_FIRESTORE = "so-offline-limpar-cache";
try {
  if (localStorage.getItem(LIMPAR_CACHE_FIRESTORE)) {
    clearIndexedDbPersistence(db)
      .then(() => localStorage.removeItem(LIMPAR_CACHE_FIRESTORE))
      .catch(() => undefined);
  }
} catch {
  /* sem armazenamento: nada guardado */
}

export const VERSAO_APP = import.meta.env.VITE_VERSAO ?? "dev";
