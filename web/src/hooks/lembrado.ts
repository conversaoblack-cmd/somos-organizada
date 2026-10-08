import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Estado que sobrevive a recarregar a página nesta aba (sessionStorage): queda de internet, erro ou o
 * celular que fechou a aba no meio da compra não fazem a pessoa recomeçar do zero.
 * Nunca guarde senha nem dados de cartão aqui.
 */
export function useLembrado<T>(chave: string, inicial: T): [T, Dispatch<SetStateAction<T>>] {
  const [valor, setValor] = useState<T>(() => {
    try {
      const bruto = sessionStorage.getItem(chave);
      return bruto ? ({ ...inicial, ...JSON.parse(bruto) } as T) : inicial;
    } catch {
      return inicial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      /* sem armazenamento (aba anônima cheia etc.): segue sem lembrar */
    }
  }, [chave, valor]);
  return [valor, setValor];
}

export function esquecer(chave: string) {
  try {
    sessionStorage.removeItem(chave);
  } catch {
    /* nada a fazer */
  }
}
