/**
 * CRÉDITOS
 * Pantalla completa como los créditos finales de un videojuego. Todo el equipo se muestra POR IGUAL (pedido del
 * equipo): solo los nombres, sin roles, una tarjeta del mismo tamaño por persona, en orden alfabético y a la vez.
 * De fondo: estrellas en tres capas, cometas, un planeta con anillo que gira despacio, la Luna en trama de
 * risografía y la tripulación del juego caminando abajo.
 * Con "Reducir movimiento" (js/settings.js) todo queda quieto.
 *
 * Los nombres van tal cual los pidió el equipo: no los cambies sin que lo pidan.
 */
import { FRAME_COUNT, WALK_FPS, characterReady, drawAstronaut } from './character.js';
import { reducedMotion } from './settings.js';

export const CREDITS = [
  'MATEO BECERRIL VÁZQUEZ',
  'SANTIAGO SEBASTIAN ALVAREZ SUAREZ',
  'RAÚL EMILIANO TREJO',
  'MARCELO SILVA BENÍTEZ',
];

/** Los nombres en orden alfabético: nadie va primero por ser más importante. */
export const creditPeople = () => [...CREDITS].sort((a, b) => a.localeCompare(b, 'es'));

/** La tripulación que camina al pie de los créditos (los personajes del juego, uno por rol). */
const WALKERS = [
  { role: 'scientist', color: 'teal', seed: 'a' },
  { role: 'merchant', color: 'gold', seed: 'b' },
  { role: 'engineer', color: 'coral', seed: 'a' },
  { role: 'pilot', color: 'coral', seed: 'b' },
];

const CREDITS_HTML = `
<div class="credits-screen" role="dialog" aria-modal="true" aria-labelledby="credits-title">
  <canvas class="credits-sky" aria-hidden="true"></canvas>
  <div class="credits-moon" aria-hidden="true"></div>
  <svg class="credits-planet" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="54" class="credits-planet-body" />
    <ellipse cx="100" cy="104" rx="92" ry="20" class="credits-planet-ring" transform="rotate(-16 100 104)" />
  </svg>
  <div class="credits-roll">
    <header class="credits-head">
      <img class="credits-star" src="assets/icons/star.svg" alt="" />
      <p class="credits-kicker">Una misión de</p>
      <h2 id="credits-title" class="credits-title">AD ASTRA</h2>
      <p class="credits-motto">Hacia las estrellas</p>
    </header>
    <p class="credits-kicker credits-by">Un juego de</p>
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
  for (const name of creditPeople()) {
    const item = document.createElement('li');
    item.className = 'credits-entry';
    const nameLine = document.createElement('p');
    nameLine.className = 'credits-name';
    nameLine.textContent = name;
    item.append(nameLine);
    list.append(item);
  }
  if (reducedMotion()) root.classList.add('still');
  document.body.append(root);

  // ---------- Estrellas que pasan (tres capas a distinta velocidad) ----------
  const sky = /** @type {HTMLCanvasElement} */ (root.querySelector('.credits-sky'));
  const ctx = sky.getContext('2d');
  const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), layer: 1 + Math.floor(Math.random() * 3), tint: Math.random() }));
  /** Cometas: cruzan en diagonal cada tanto. */
  const comets = [];
  let nextComet = 0.8;
  /** La tripulación camina de izquierda a derecha por el borde de abajo, separada en fila. */
  const walkers = WALKERS.map((walker, index) => ({ ...walker, x: -0.12 - index * 0.16 }));
  let walkTime = 0;
  let ready = false;
  characterReady.then(() => { ready = true; });
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
    const moving = !reducedMotion();
    for (const star of stars) {
      if (moving) star.y -= dt * 0.012 * star.layer;
      if (star.y < 0) { star.y += 1; star.x = Math.random(); }
      // Titilan: cada estrella sube y baja su brillo a su propio ritmo.
      const twinkle = moving ? 0.75 + 0.25 * Math.sin(now / 600 + star.x * 40) : 1;
      ctx.fillStyle = star.tint > 0.88 ? `rgba(243, 182, 65, ${0.85 * twinkle})` : `rgba(239, 230, 207, ${(0.25 + star.layer * 0.2) * twinkle})`;
      const size = star.layer * 0.8;
      ctx.fillRect(star.x * w, star.y * h, size, size);
    }
    if (moving) {
      nextComet -= dt;
      if (nextComet <= 0) {
        comets.push({ x: Math.random() * 0.7, y: Math.random() * 0.35, life: 0 });
        nextComet = 2.5 + Math.random() * 3;
      }
      for (const comet of comets) {
        comet.life += dt;
        const x = (comet.x + comet.life * 0.35) * w, y = (comet.y + comet.life * 0.16) * h;
        const fade = Math.max(0, 1 - comet.life / 1.6);
        const trail = ctx.createLinearGradient(x - 110, y - 50, x, y);
        trail.addColorStop(0, 'rgba(239, 230, 207, 0)');
        trail.addColorStop(1, `rgba(239, 230, 207, ${0.8 * fade})`);
        ctx.strokeStyle = trail;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 110, y - 50);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      while (comets.length && comets[0].life > 1.6) comets.shift();
      walkTime += dt;
      for (const walker of walkers) {
        walker.x += dt * 0.045;
        // Al salir por la derecha vuelve a entrar por la izquierda, detrás del último de la fila.
        if (walker.x > 1.12) walker.x -= 1.12 + 0.16 * WALKERS.length;
      }
    }
    // La tripulación del juego, caminando al pie de la pantalla (sobre la franja negra de abajo).
    if (ready) {
      const scale = Math.max(0.28, Math.min(0.42, h / 2000));
      const ground = h - h * 0.08 - 6;
      for (const walker of walkers) {
        drawAstronaut(ctx, {
          x: walker.x * w, y: ground, color: walker.color, role: walker.role, seed: walker.seed,
          walkTime: moving ? walkTime : null, frame: moving ? Math.floor(walkTime * WALK_FPS) % FRAME_COUNT : 1, scale,
        });
      }
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
