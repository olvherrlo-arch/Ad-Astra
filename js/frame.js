/**
 * CUADROS DE ANIMACIÓN
 * Llama a `step(dt, now)` en cada cuadro. Usa requestAnimationFrame y, si el navegador no lo está
 * disparando (pestaña en segundo plano o panel oculto), sigue con un temporizador para que el juego
 * no se quede congelado. Devuelve una función para detenerlo.
 */
export const frameLoop = (step) => {
  let raf = 0;
  let timer = 0;
  let last = performance.now();
  let stopped = false;
  const run = (now) => {
    if (stopped) return;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    schedule(); // primero el siguiente cuadro: si algo falla al dibujar, no se congela
    step(dt, now);
  };
  const schedule = () => {
    raf = requestAnimationFrame(run);
    timer = window.setTimeout(() => run(performance.now()), 150);
  };
  schedule();
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
  };
};
