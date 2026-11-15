/**
 * TRANSICIONES DE CINE
 * Una toma corta a pantalla completa al cambiar de fase: despegue, alunizaje, regreso y resultado.
 * Dura un par de segundos, se cierra sola o con un clic, y nunca cambia nada del juego: es solo
 * la forma de mostrar algo que el servidor ya decidió. Cada jugador la ve en su pantalla.
 * Con "reducir movimiento" del sistema, es más corta y sin cámara.
 */
import { drawArt } from './art.js';

const SHOW_MS = 2_600;

/**
 * @param {{ art: string, kicker?: string, title: string, text?: string, camera?: string, tone?: 'good' | 'bad' }} shot
 */
export const playCinematic = ({ art, kicker = '', title, text = '', camera = 'in', tone }) => {
  document.querySelector('.cine-shot')?.remove();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
