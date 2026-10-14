/**
 * Sistema com cara de app no celular: sem zoom de pinça nem de toque duplo.
 * O Android respeita o maximum-scale do app.html; o iPhone (Safari e o atalho na tela de início) ignora
 * desde o iOS 10, então o gesto de pinça é cancelado aqui. Só o app (app.html) carrega isto: a página
 * inicial mantém o zoom livre.
 */
export function bloquearZoom() {
  const cancelar = (e: Event) => e.preventDefault();
  // eventos de gesto só existem no Safari do iPhone/iPad
  for (const nome of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(nome, cancelar, { passive: false });
  // pinça com dois dedos em navegadores que não têm os eventos de gesto
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
