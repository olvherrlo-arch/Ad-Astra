/**
 * HISTORIA EN PANTALLA (prólogo e informes de misión)
 * Una página a la vez: ilustración, texto, "3/6" y los botones.
 * Todos ven la misma página. El anfitrión la pasa con SIGUIENTE (y puede volver con Anterior);
 * los demás avisan "Ya leí" para que el anfitrión sepa cuándo seguir. Nada avanza solo.
 * Los textos están en js/story.js y las ilustraciones en js/art.js.
 */
import { drawArt } from './art.js';
import { isHost, on, sendAction, session } from './connection.js';
import { colorHex } from './shared.js';
import { sounds } from './sound.js';
import { getStory } from './story.js';

/** Después de pasar la página, SIGUIENTE espera un momento: un doble clic no se salta una página. */
const TURN_LOCK_MS = 1_200;

const STORY_HTML = `
<section class="story" aria-labelledby="story-heading">
  <canvas class="story-art" aria-hidden="true"></canvas>
  <div class="story-text">
    <p class="story-kicker"></p>
    <h2 class="story-heading" id="story-heading" tabindex="-1"></h2>
    <p class="story-passage"></p>
    <ul class="story-readers" aria-label="Quién ya leyó esta página"></ul>
    <footer class="story-nav">
      <button type="button" class="story-back">Anterior</button>
      <span class="story-progress" aria-live="polite"></span>
      <button type="button" class="story-read" aria-pressed="false">Ya leí</button>
      <button type="button" class="story-next">Siguiente</button>
    </footer>
    <p class="story-hint"></p>
  </div>
</section>`;

export const mountNarrative = (container) => {
  container.innerHTML = STORY_HTML;
  const $ = (selector) => /** @type {HTMLElement} */ (container.querySelector(selector));
  const art = /** @type {HTMLCanvasElement} */ ($('.story-art'));
  const text = $('.story-text');
  const back = /** @type {HTMLButtonElement} */ ($('.story-back'));
  const read = /** @type {HTMLButtonElement} */ ($('.story-read'));
  const next = /** @type {HTMLButtonElement} */ ($('.story-next'));
  let shownPage = ''; // escena + página que está en pantalla
  let shownArt = '';
  let lockTimer = 0;
  let locked = false;

  const paintArt = () => {
    if (shownArt && art.clientWidth > 0) drawArt(art, shownArt);
  };

  const render = () => {
    const state = session.state;
    const story = state && getStory(state.data.scene, state.data.missionId);
    if (!story || !session.room) return;
    const { page, read: readers } = state.data;
    const current = story.pages[page];
    const host = isHost();
    const isLast = page === story.pages.length - 1;

    // Página nueva: cambia el dibujo y el texto, y SIGUIENTE espera un momento.
    const pageKey = `${state.data.scene}:${page}`;
    if (pageKey !== shownPage) {
      const firstRender = shownPage === '';
      shownPage = pageKey;
      shownArt = current.art;
      paintArt();
      $('.story-kicker').textContent = story.title;
      $('.story-heading').textContent = current.heading;
      $('.story-passage').textContent = current.text;
      text.classList.remove('turn');
      void text.offsetWidth; // reinicia la animación de entrada
      text.classList.add('turn');
      locked = true;
      clearTimeout(lockTimer);
      lockTimer = window.setTimeout(() => { locked = false; render(); }, TURN_LOCK_MS);
      if (!firstRender) {
        sounds.page();
        $('.story-heading').focus({ preventScroll: true });
      }
    }

    $('.story-progress').textContent = `${page + 1}/${story.pages.length}`;

    // Quién ya leyó (el anfitrión no avisa: es quien pasa la página).
    const others = session.room.players.filter((p) => p.id !== session.room.hostId && p.connected !== false);
    $('.story-readers').replaceChildren(
      ...others.map((player) => {
        const done = Boolean(readers[player.id]);
        const item = document.createElement('li');
        item.className = done ? 'done' : '';
        const dot = document.createElement('i');
        dot.style.background = colorHex(player.color);
        item.append(dot, `${player.id === session.myId ? 'Tú' : player.name} ${done ? '✓ ya leyó' : '· leyendo'}`);
        return item;
      }),
    );

    back.hidden = !host;
    next.hidden = !host;
    read.hidden = host;
    back.disabled = page === 0;
    next.disabled = locked;
    next.textContent = isLast ? story.lastButton : 'Siguiente';
    const iRead = Boolean(readers[session.myId]);
    read.disabled = iRead;
    read.setAttribute('aria-pressed', String(iRead));
    read.textContent = iRead ? '✓ Ya leí' : 'Ya leí';

    const waiting = others.filter((p) => !readers[p.id]).length;
    if (!host) $('.story-hint').textContent = 'El anfitrión pasa la página cuando todos terminan de leer.';
    else if (others.length === 0) $('.story-hint').textContent = 'Tú pasas la página. También puedes usar las flechas ← →.';
    else $('.story-hint').textContent = waiting === 0 ? 'Todos ya leyeron: puedes seguir.' : `Falta que ${waiting === 1 ? 'lea 1 tripulante' : `lean ${waiting} tripulantes`}.`;
  };

  back.addEventListener('click', () => sendAction({ type: 'story:back' }));
  next.addEventListener('click', () => sendAction({ type: 'story:next' }));
  read.addEventListener('click', () => sendAction({ type: 'story:read' }));

  const onKeyDown = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!isHost() || target.closest('input, textarea')) return;
    if (event.key === 'ArrowRight' && !next.disabled) next.click();
    if (event.key === 'ArrowLeft' && !back.disabled) back.click();
  };
  window.addEventListener('keydown', onKeyDown);

  const resizeObserver = new ResizeObserver(paintArt);
  resizeObserver.observe(art);
  render();
  const offs = [on('state', render), on('room', render)];
  return () => {
    clearTimeout(lockTimer);
    window.removeEventListener('keydown', onKeyDown);
    resizeObserver.disconnect();
    offs.forEach((off) => off());
  };
};
