/**
 * CRÉDITOS
 * Pantalla completa como los créditos finales de un videojuego: campo de estrellas que se mueve,
 * la Luna en trama de risografía y los nombres que suben uno por uno.
 * Con "Reducir movimiento" (js/settings.js) los créditos aparecen quietos.
 *
 * Los nombres van tal cual los pidió el equipo: no los cambies sin que lo pidan.
 */
import { reducedMotion } from './settings.js';

export const CREDITS = [
  { name: 'MATEO BECERRIL VÁZQUEZ', role: 'Art Design' },
  { name: 'SANTIAGO SEBASTIAN ALVAREZ SUAREZ', role: 'Creative Director' },
  { name: 'RAÚL EMILIANO TREJO', role: 'Lead Developer' },
  { name: 'MARCELO SILVA BENÍTEZ', role: 'Narrative Designer & Story Writer' },
  { name: 'MARCELO SILVA BENÍTEZ', role: 'Co-Developer' },
];

const CREDITS_HTML = `
<div class="credits-screen" role="dialog" aria-modal="true" aria-labelledby="credits-title">
  <canvas class="credits-sky" aria-hidden="true"></canvas>
  <div class="credits-moon" aria-hidden="true"></div>
  <div class="credits-roll">
    <header class="credits-head">
      <img class="credits-star" src="assets/icons/star.svg" alt="" />
      <p class="credits-kicker">Una misión de</p>
      <h2 id="credits-title" class="credits-title">AD ASTRA</h2>
      <p class="credits-motto">Hacia las estrellas</p>
    </header>
    <ol class="credits-list"></ol>
    <p class="credits-end">Gracias por jugar</p>
  </div>
  <button type="button" class="credits-back">← Volver</button>
</div>`;

/**
 * Abre los créditos. `onClose` se llama al volver.
 * @param {{ onClose?: () => void }} [options]
 */
export const openCredits = ({ onClose } = {}) => {
  const holder = document.createElement('div');
  holder.innerHTML = CREDITS_HTML;
  const root = /** @type {HTMLElement} */ (holder.firstElementChild);
  const list = root.querySelector('.credits-list');
  CREDITS.forEach(({ name, role }, index) => {
    const item = document.createElement('li');
    item.className = 'credits-entry';
    item.style.setProperty('--i', String(index));
    const roleLine = document.createElement('p');
    roleLine.className = 'credits-role';
    roleLine.textContent = role;
    const nameLine = document.createElement('p');
    nameLine.className = 'credits-name';
    nameLine.textContent = name;
    item.append(roleLine, nameLine);
    list.append(item);
  });
  if (reducedMotion()) root.classList.add('still');
  document.body.append(root);

  // ---------- Estrellas que pasan (tres capas a distinta velocidad) ----------
  const sky = /** @type {HTMLCanvasElement} */ (root.querySelector('.credits-sky'));
  const ctx = sky.getContext('2d');
  const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), layer: 1 + Math.floor(Math.random() * 3), tint: Math.random() }));
  let raf = 0;
  let last = performance.now();
  const draw = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = sky.clientWidth, h = sky.clientHeight;
    if (sky.width !== Math.round(w * dpr)) { sky.width = Math.round(w * dpr); sky.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const star of stars) {
      if (!reducedMotion()) star.y -= dt * 0.012 * star.layer;
      if (star.y < 0) { star.y += 1; star.x = Math.random(); }
      ctx.fillStyle = star.tint > 0.88 ? 'rgba(243, 182, 65, 0.85)' : `rgba(239, 230, 207, ${0.25 + star.layer * 0.2})`;
      const size = star.layer * 0.8;
      ctx.fillRect(star.x * w, star.y * h, size, size);
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  const close = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    root.classList.add('leaving');
    window.setTimeout(() => root.remove(), reducedMotion() ? 0 : 350);
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);
  const back = /** @type {HTMLButtonElement} */ (root.querySelector('.credits-back'));
  back.addEventListener('click', close);
  back.focus();
  return { close };
};
