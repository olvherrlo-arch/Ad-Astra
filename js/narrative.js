/**
 * HISTORIA EN PANTALLA (prólogo e informes de misión), como cinemática
 * Una escena a la vez, en pantalla ancha con bandas de cine:
 * - La ilustración entra con un fundido y una cámara lenta (acerca, aleja o se desliza).
 * - El texto se escribe solo, oración por oración. Un clic sobre el texto (o Espacio) lo muestra entero.
 * - Si la escena trae una lista (qué llevar, qué hacer), sus puntos aparecen uno tras otro.
 * Todos ven la misma escena. El anfitrión pasa con SIGUIENTE (o las flechas) y puede volver o saltar
 * la historia; los demás avisan "Ya leí". Nada avanza solo.
 * Los textos están en js/story.js y las ilustraciones en js/art.js.
 */
import { drawArt } from './art.js';
import { isHost, on, sendAction, session } from './connection.js';
import { colorHex } from './shared.js';
import { sounds } from './sound.js';
import { getStory } from './story.js';

/** Después de pasar la escena, SIGUIENTE espera un momento: un doble clic no se salta una. */
const TURN_LOCK_MS = 900;
const TYPE_MS = 24; //      milisegundos por letra
const SENTENCE_PAUSE = 260; // pausa entre oraciones
const LIST_STEP_MS = 320; // entre un punto de la lista y el siguiente

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const STORY_HTML = `
<section class="story cine" aria-labelledby="story-heading">
  <div class="story-stage">
    <canvas class="story-art back" aria-hidden="true"></canvas>
    <canvas class="story-art front" aria-hidden="true"></canvas>
    <div class="story-caption">
      <p class="story-kicker"></p>
      <h2 class="story-heading" id="story-heading" tabindex="-1"></h2>
    </div>
  </div>
  <div class="story-text">
    <p class="story-speaker" hidden></p>
    <p class="story-passage" title="Clic para mostrar todo el texto">
      <span class="sr-only story-full"></span>
      <span class="story-typed" aria-hidden="true"></span><span class="story-caret" aria-hidden="true"></span>
    </p>
    <ul class="story-list" hidden></ul>
    <ul class="story-readers" aria-label="Quién ya leyó esta escena"></ul>
    <footer class="story-nav">
      <button type="button" class="story-back">Anterior</button>
      <span class="story-progress" aria-live="polite"></span>
      <button type="button" class="story-skip">Saltar</button>
      <button type="button" class="story-read" aria-pressed="false">Ya leí</button>
      <button type="button" class="story-next">Siguiente</button>
    </footer>
    <p class="story-hint"></p>
  </div>
</section>`;

export const mountNarrative = (container) => {
  container.innerHTML = STORY_HTML;
  const $ = (selector) => /** @type {HTMLElement} */ (container.querySelector(selector));
  const stage = $('.story-stage');
  let front = /** @type {HTMLCanvasElement} */ ($('.story-art.front'));
  let back = /** @type {HTMLCanvasElement} */ ($('.story-art.back'));
  const typed = $('.story-typed');
  const listBox = $('.story-list');
  const backButton = /** @type {HTMLButtonElement} */ ($('.story-back'));
  const skipButton = /** @type {HTMLButtonElement} */ ($('.story-skip'));
  const read = /** @type {HTMLButtonElement} */ ($('.story-read'));
  const next = /** @type {HTMLButtonElement} */ ($('.story-next'));
  let shownPage = ''; // escena + página que está en pantalla
  let shownArt = '';
  let locked = false;
  let lockTimer = 0;
  let typeTimer = 0;
  let typing = false;
  let skipArmed = 0; // el primer clic en Saltar pide confirmación
  /** El texto completo de la escena actual, dividido en oraciones. */
  let sentences = [];
  let listItems = [];

  const paintArt = () => {
    if (shownArt && front.clientWidth > 0) drawArt(front, shownArt);
  };

  // ---------- Texto que se escribe solo ----------
  const stopTyping = () => {
    clearTimeout(typeTimer);
    typing = false;
    stage.parentElement.classList.remove('typing');
  };

  const showList = (instant) => {
    listBox.hidden = listItems.length === 0;
    listBox.replaceChildren(...listItems.map((text, index) => {
      const item = document.createElement('li');
      item.textContent = text;
      item.style.animationDelay = instant ? '0ms' : `${index * LIST_STEP_MS}ms`;
      return item;
    }));
  };

  /** Muestra todo el texto ya (clic, Espacio o movimiento reducido). */
  const revealAll = () => {
    if (!typing) return;
    stopTyping();
    typed.textContent = sentences.join(' ');
    showList(true);
    render();
  };

  const typeText = () => {
    stopTyping();
    typed.textContent = '';
    listBox.hidden = true;
    if (reducedMotion()) {
      typed.textContent = sentences.join(' ');
      showList(true);
      return;
    }
    typing = true;
    stage.parentElement.classList.add('typing');
    const full = sentences.join(' ');
    let shown = 0;
    const tick = () => {
      shown++;
      typed.textContent = full.slice(0, shown);
      if (shown >= full.length) {
        typing = false;
        stage.parentElement.classList.remove('typing');
        showList(false);
        render();
        return;
      }
      const char = full[shown - 1];
      typeTimer = window.setTimeout(tick, '.!?:'.includes(char) && full[shown] === ' ' ? SENTENCE_PAUSE : TYPE_MS);
    };
    typeTimer = window.setTimeout(tick, 350); // deja ver la ilustración un instante
  };

  // ---------- Cambio de escena: fundido y cámara ----------
  const changeScene = (page, firstRender) => {
    // La ilustración nueva se pinta en el lienzo de atrás y pasa adelante con un fundido.
    [front, back] = [back, front];
    front.className = `story-art front cam-${page.camera ?? 'in'}`;
    back.className = 'story-art back';
    shownArt = page.art;
    paintArt();
    void front.offsetWidth; // reinicia la animación de cámara
    front.classList.add('playing');

    $('.story-heading').textContent = page.heading;
    const speaker = $('.story-speaker');
    speaker.hidden = !page.speaker;
    speaker.textContent = page.speaker ?? '';
    sentences = page.text.match(/[^.!?:]+[.!?:]+/g)?.map((s) => s.trim()) ?? [page.text];
    listItems = page.list ?? [];
    $('.story-full').textContent = [page.text, ...listItems].join(' ');
    typeText();

    locked = true;
    clearTimeout(lockTimer);
    lockTimer = window.setTimeout(() => { locked = false; render(); }, TURN_LOCK_MS);
    if (!firstRender) {
      sounds.page();
      $('.story-heading').focus({ preventScroll: true });
    }
  };

  // ---------- Dibujar ----------
  const render = () => {
    const state = session.state;
    const story = state && getStory(state.data.scene, state.data.missionId);
    if (!story || !session.room) return;
    const { page, read: readers } = state.data;
    const current = story.pages[page];
    const host = isHost();
    const isLast = page === story.pages.length - 1;

    const pageKey = `${state.data.scene}:${page}`;
    if (pageKey !== shownPage) {
      const firstRender = shownPage === '';
      shownPage = pageKey;
      $('.story-kicker').textContent = story.title;
      changeScene(current, firstRender);
    }

    $('.story-progress').textContent = `${page + 1}/${story.pages.length}`;

    // Quién ya leyó (el anfitrión no avisa: es quien pasa la escena).
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

    backButton.hidden = !host;
    next.hidden = !host;
    skipButton.hidden = !host;
    read.hidden = host;
    backButton.disabled = page === 0;
    next.disabled = locked || typing;
    next.textContent = isLast ? story.lastButton : 'Siguiente';
    next.title = typing ? 'Espera a que termine el texto, o haz clic en él para verlo entero' : '';
    const iRead = Boolean(readers[session.myId]);
    read.disabled = iRead || typing;
    read.setAttribute('aria-pressed', String(iRead));
    read.textContent = iRead ? '✓ Ya leí' : 'Ya leí';
    skipButton.textContent = skipArmed ? '¿Saltar para todos?' : 'Saltar';

    const waiting = others.filter((p) => !readers[p.id]).length;
    const hint = $('.story-hint');
    if (typing) hint.textContent = 'Clic en el texto (o Espacio) para verlo entero.';
    else if (!host) hint.textContent = 'El anfitrión pasa la escena cuando todos terminan de leer.';
    else if (others.length === 0) hint.textContent = 'Tú pasas la escena. También puedes usar las flechas ← →.';
    else hint.textContent = waiting === 0 ? 'Todos ya leyeron: puedes seguir.' : `Falta que ${waiting === 1 ? 'lea 1 tripulante' : `lean ${waiting} tripulantes`}.`;
  };

  // ---------- Controles ----------
  backButton.addEventListener('click', () => sendAction({ type: 'story:back' }));
  next.addEventListener('click', () => sendAction({ type: 'story:next' }));
  read.addEventListener('click', () => sendAction({ type: 'story:read' }));
  skipButton.addEventListener('click', () => {
    if (skipArmed) {
      clearTimeout(skipArmed);
      skipArmed = 0;
      sendAction({ type: 'story:skip' });
      return;
    }
    skipArmed = window.setTimeout(() => { skipArmed = 0; render(); }, 3_000);
    render();
  });
  $('.story-passage').addEventListener('click', revealAll);
  stage.addEventListener('click', revealAll);

  const onKeyDown = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('input, textarea')) return;
    if ((event.key === ' ' || event.key === 'Enter') && typing && !target.closest('button')) {
      event.preventDefault();
      revealAll();
      return;
    }
    if (!isHost()) return;
    if (event.key === 'ArrowRight' && !next.disabled) next.click();
    if (event.key === 'ArrowLeft' && !backButton.disabled) backButton.click();
  };
  window.addEventListener('keydown', onKeyDown);

  const resizeObserver = new ResizeObserver(paintArt);
  resizeObserver.observe(stage);
  render();
  const offs = [on('state', render), on('room', render)];
  return () => {
    stopTyping();
    clearTimeout(lockTimer);
    clearTimeout(skipArmed);
    window.removeEventListener('keydown', onKeyDown);
    resizeObserver.disconnect();
    offs.forEach((off) => off());
  };
};
