/**
 * TRANSICIONES DE CINE
 * Una toma corta a pantalla completa al cambiar de fase: despegue, alunizaje, regreso y resultado.
 * Dura un par de segundos, se cierra sola o con un clic, y nunca cambia nada del juego: es solo
 * la forma de mostrar algo que el servidor ya decidió. Cada jugador la ve en su pantalla.
 * Con "reducir movimiento" del sistema, es más corta y sin cámara.
 */
import { drawArt } from './art.js';
import { reducedMotion } from './settings.js';

const SHOW_MS = 2_600;

/**
 * El rayo de la leyenda: primero ROJO, enseguida un destello AZUL, y una onda que se abre.
 * Solo se muestra cuando el servidor ya dijo que el experimento se sincronizó (`flight.activated`).
 * Con "reducir movimiento" no hay parpadeos: dos fundidos suaves. Al terminar llama a `then`.
 * @param {() => void} [then]
 */
export const playLightning = (then = () => {}) => {
  document.querySelector('.lightning-shot')?.remove();
  const reduced = reducedMotion();
  const shot = document.createElement('div');
  shot.className = `lightning-shot${reduced ? ' calm' : ''}`;
  shot.setAttribute('role', 'status');
  shot.setAttribute('aria-label', 'Un rayo rojo cae sobre el Prisma, seguido de un destello azul');
  shot.innerHTML = `
    <div class="lightning-red"></div>
    <svg class="lightning-bolt" viewBox="0 0 200 400" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
      <polygon points="118,0 62,150 100,156 44,290 84,296 60,400 150,236 108,230 162,96 124,90 150,0" />
    </svg>
    <div class="lightning-blue"></div>
    <div class="lightning-wave"></div>`;
  document.body.append(shot);
  setTimeout(() => { shot.remove(); then(); }, reduced ? 1_800 : 3_600);
};

/**
 * @param {{ art: string, kicker?: string, title: string, text?: string, camera?: string, tone?: 'good' | 'bad' }} shot
 */
export const playCinematic = ({ art, kicker = '', title, text = '', camera = 'in', tone }) => {
  document.querySelector('.cine-shot')?.remove();
  const reduced = reducedMotion();
  const shot = document.createElement('div');
  shot.className = `cine-shot${tone ? ` ${tone}` : ''}`;
  shot.setAttribute('role', 'status');
  shot.innerHTML = `
    <canvas class="cine-art cam-${camera}" aria-hidden="true"></canvas>
    <div class="cine-words">
      <p class="cine-kicker"></p>
      <h2 class="cine-title"></h2>
      <p class="cine-text"></p>
      <p class="cine-dismiss">Clic para seguir</p>
    </div>`;
  shot.querySelector('.cine-kicker').textContent = kicker;
  shot.querySelector('.cine-title').textContent = title;
  shot.querySelector('.cine-text').textContent = text;
  document.body.append(shot);
  const canvas = /** @type {HTMLCanvasElement} */ (shot.querySelector('canvas'));
  drawArt(canvas, art);
  canvas.classList.add('playing');

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    shot.classList.add('leaving');
    setTimeout(() => shot.remove(), 400);
  };
  shot.addEventListener('click', close);
  addEventListener('keydown', close, { once: true });
  setTimeout(close, reduced ? 1_200 : SHOW_MS);
};
