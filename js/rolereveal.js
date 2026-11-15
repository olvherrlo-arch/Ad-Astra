/**
 * REVELACIÓN DE ROLES
 * Al despegar, el servidor sortea los roles. Esta cinemática se los muestra a cada quien:
 *   1. La tripulación en fila, bajo un foco, con una carta boca abajo sobre cada uno: "¿Quién será quién?"
 *   2. Se apagan los demás y se da vuelta TU carta: tu rol en grande, con lo que te toca hacer.
 *   3. Se dan vuelta las cartas de todos: así cada quien sabe a quién preguntarle qué.
 * Clic (o cualquier tecla) adelanta; al final, "¡A trabajar!". Solo muestra lo que el servidor ya decidió.
 */
import { characterReady, drawAstronaut } from './character.js';
import { session } from './connection.js';
import { ROLES } from './shared.js';
import { sounds } from './sound.js';

/** Cómo se ve cada rol en la revelación (ícono y tinta de fondo). */
const LOOK = {
  scientist: { icon: '🔬', ink: '#3fa597' },
  merchant: { icon: '💰', ink: '#f3b641' },
  engineer: { icon: '🔧', ink: '#ff6b5b' },
  pilot: { icon: '🚀', ink: '#7ea6ff' },
};
const SUSPENSE_MS = 1_900; // la fila con las cartas boca abajo
const ALL_MS = 2_200; //     desde tu rol hasta que se dan vuelta los demás
const CLOSE_MS = 12_000; //  si nadie toca nada, se cierra sola

const roleOf = (id) => ROLES.find((role) => role.id === id);

const portrait = (player, size = 1) => {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const w = 110 * size, h = 150 * size;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  drawAstronaut(ctx, { x: w / 2 - 6, y: h - 6, color: player.color, hat: player.hat, scale: 0.78 * size });
  return canvas;
};

export const showRoleReveal = async () => {
  const room = session.room;
  const me = room?.players.find((p) => p.id === session.myId);
  if (!me?.role) return;
  await characterReady;
  document.querySelector('.role-reveal')?.remove();

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const crew = room.players.filter((p) => p.connected !== false);
  const mine = roleOf(me.role);
  const look = LOOK[me.role];

  const box = document.createElement('div');
  box.className = 'role-reveal stage-1';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', `Tu rol: ${mine.name}`);
  box.style.setProperty('--role-ink', look.ink);
  box.innerHTML = `
    <div class="reveal-spot" aria-hidden="true"></div>
    <p class="reveal-kicker">Tripulación de la misión</p>
    <h2 class="reveal-question">¿Quién será quién?</h2>
    <div class="reveal-crew"></div>
    <div class="reveal-mine" aria-live="assertive">
      <p class="reveal-you">Tu rol es</p>
      <div class="reveal-card">
        <span class="reveal-icon" aria-hidden="true">${look.icon}</span>
        <h2 class="reveal-name"></h2>
      </div>
      <p class="reveal-duty"></p>
      <p class="reveal-demo" hidden></p>
    </div>
    <button type="button" class="reveal-go">¡A trabajar!</button>
    <p class="reveal-skip">Clic para seguir</p>`;
  box.querySelector('.reveal-name').textContent = mine.name;
  box.querySelector('.reveal-duty').textContent = mine.duty;
  // Con menos de 4, se avisa qué roles quedaron libres (los maneja cualquiera).
  const free = ROLES.filter((role) => !crew.some((p) => p.role === role.id));
  if (free.length > 0) {
    const demo = /** @type {HTMLElement} */ (box.querySelector('.reveal-demo'));
    demo.hidden = false;
    demo.textContent = `Quedaron sin dueño: ${free.map((r) => r.name).join(', ')}. En la misión los maneja cualquiera.`;
  }

  // Un tripulante por lugar: su astronauta y su carta (boca abajo hasta el final).
  const lineup = box.querySelector('.reveal-crew');
  for (const player of crew) {
    const role = roleOf(player.role);
    const seat = document.createElement('figure');
    seat.className = `reveal-seat${player.id === me.id ? ' me' : ''}`;
    if (role) seat.style.setProperty('--seat-ink', LOOK[role.id].ink);
    const flip = document.createElement('div');
    flip.className = 'reveal-flip';
    flip.innerHTML = `<span class="back">?</span><span class="front">${role ? `${LOOK[role.id].icon} ${role.name}` : 'Libre'}</span>`;
    const name = document.createElement('figcaption');
    name.textContent = player.id === me.id ? `${player.name} (tú)` : player.name;
    seat.append(flip, portrait(player), name);
    lineup.append(seat);
  }
  document.body.append(box);
  sounds.reveal?.('drum');

  // Las tres partes, una tras otra. Un clic adelanta a la siguiente; en la última, cierra.
  let step = 1;
  let timer = 0;
  const close = () => {
    clearTimeout(timer);
    removeEventListener('keydown', onKey, true);
    box.classList.add('leaving');
    setTimeout(() => box.remove(), 400);
  };
  const goTo = (next) => {
    clearTimeout(timer);
    step = next;
    box.className = `role-reveal stage-${step}`;
    if (step === 2) {
      sounds.reveal?.('hit');
      timer = window.setTimeout(() => goTo(3), reduced ? 600 : ALL_MS);
    } else if (step === 3) {
      timer = window.setTimeout(close, CLOSE_MS);
      /** @type {HTMLElement} */ (box.querySelector('.reveal-go')).focus();
    }
  };
  const advance = () => (step < 3 ? goTo(step + 1) : close());
  // Mientras está abierta, las teclas son de la revelación (que una flecha no pase la historia de abajo).
  const onKey = (event) => {
    if (event.key === 'Tab') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    advance();
  };
  box.addEventListener('click', (event) => {
    if (/** @type {HTMLElement} */ (event.target).closest('.reveal-go')) return close();
    advance();
  });
  addEventListener('keydown', onKey, true);
  timer = window.setTimeout(() => goTo(2), reduced ? 500 : SUSPENSE_MS);
};
