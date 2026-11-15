/**
 * TUTORIALES (el motor)
 * Muestra los módulos de js/tutorials.js cuando el jugador llega por primera vez a algo nuevo.
 * - Un panel chico, puesto al lado de lo que explica, sin tapar lo importante.
 * - Resalta la parte real de la pantalla con un borde que late.
 * - Algunos pasos esperan a que el jugador HAGA la acción (abrir una ficha, poner una pieza…):
 *   el botón Continuar aparece recién cuando la hizo. No se bloquea el resto de la pantalla.
 * - Cada quien ve sus tutoriales: no adelantan ni frenan a nadie más. Lo que el equipo hace junto
 *   (pasar de etapa, la historia) ya está sincronizado por el servidor.
 * - Se pueden saltar, apagar del todo y repetir desde la biblioteca (botón "Tutoriales").
 * Lo que ya viste se guarda en este navegador.
 */
import { on, session, storage } from './connection.js';
import { getMission } from './missions.js';
import { ROLES, canActAs } from './shared.js';
import { TUTORIALS } from './tutorials.js';

const STORE_KEY = 'adastra.tutorials';
const CHECK_MS = 400;

const PANEL_HTML = `
<div class="tut-panel" role="dialog" aria-live="polite" aria-labelledby="tut-title">
  <div class="tut-head">
    <span class="tut-icon" aria-hidden="true"></span>
    <div>
      <p class="tut-module"></p>
      <h3 id="tut-title" class="tut-title"></h3>
    </div>
  </div>
  <p class="tut-text"></p>
  <p class="tut-todo" hidden></p>
  <footer class="tut-foot">
    <span class="tut-step"></span>
    <button type="button" class="tut-skip">Saltar</button>
    <button type="button" class="tut-next">Continuar</button>
  </footer>
</div>`;

/** Lo que el tutorial necesita saber del juego para decidir qué mostrar. */
export const tutorialContext = () => {
  const data = session.state?.data ?? null;
  const mission = data?.missionId ? getMission(data.missionId) : null;
  const room = session.room;
  const players = room?.players ?? [];
  return {
    screen: document.querySelector('.lobby') ? 'lobby' : document.querySelector('.mission') ? 'game' : 'menu',
    data,
    room,
    me: players.find((p) => p.id === session.myId) ?? null,
    stageId: data?.scene === 'mission' ? mission?.stages[data.stageIndex]?.id ?? null : null,
    /** Roles que este jugador maneja (el suyo, o varios en modo demo). */
    roles: room ? ROLES.filter((role) => canActAs(players, session.myId, role.id)).map((role) => role.id) : [],
    $: (selector) => /** @type {HTMLElement | null} */ (document.querySelector(selector)),
  };
};

/** ¿Este módulo o paso le toca a este jugador? (sin `roles`, le toca a todos) */
const forMe = (item, context) => !item.roles || item.roles.some((role) => context.roles.includes(role));

let prefs = storage.get(STORE_KEY, { done: [], off: false });
const savePrefs = () => storage.set(STORE_KEY, prefs);

let active = null; // { module, steps, index, baseline }
let panel = null;
let highlighted = null;
let timer = 0;

const clearHighlight = () => {
  highlighted?.classList.remove('tut-target');
  highlighted = null;
};

const finish = (markDone = true) => {
  if (active && markDone && !prefs.done.includes(active.module.id)) prefs.done = [...prefs.done, active.module.id];
  savePrefs();
  active = null;
  clearHighlight();
  panel?.remove();
  panel = null;
  check();
};

/** Paneles del juego que el tutorial nunca tapa (mientras están abiertos). */
const KEEP_CLEAR = ['.hud-bottom', '.hud-panel', '.customize', '.flight-emergency', '.stage-footer', '.drag-ghost'];

/**
 * Ubica el panel junto a lo resaltado sin taparlo, ni a los paneles abiertos del juego:
 * prueba abajo, arriba, a la derecha, a la izquierda y las esquinas, y se queda con el primero libre.
 */
const place = (target, avoid = []) => {
  if (!panel) return;
  const box = panel.getBoundingClientRect();
  const margin = 12;
  const clear = [target, ...[...KEEP_CLEAR, ...avoid].flatMap((selector) => [...document.querySelectorAll(selector)])]
    .filter((node) => node && node !== panel && node.getClientRects().length > 0)
    .map((node) => node.getBoundingClientRect());
  const fits = (left, top) => left >= margin && top >= margin && left + box.width <= innerWidth - margin && top + box.height <= innerHeight - margin
    && clear.every((r) => left + box.width < r.left || left > r.right || top + box.height < r.top || top > r.bottom);
  const clampX = (x) => Math.min(innerWidth - box.width - margin, Math.max(margin, x));
  const clampY = (y) => Math.min(innerHeight - box.height - margin, Math.max(margin, y));
  const rect = target?.getBoundingClientRect();
  const candidates = rect
    ? [
        { left: clampX(rect.left + rect.width / 2 - box.width / 2), top: rect.bottom + margin, arrow: 'up' },
        { left: clampX(rect.left + rect.width / 2 - box.width / 2), top: rect.top - margin - box.height, arrow: 'down' },
        { left: rect.right + margin, top: clampY(rect.top + rect.height / 2 - box.height / 2), arrow: 'none' },
        { left: rect.left - margin - box.width, top: clampY(rect.top + rect.height / 2 - box.height / 2), arrow: 'none' },
      ]
    // Sin nada que señalar: arriba al centro, donde no tapa los botones de abajo (Listo, Despegar, la acción principal).
    : [
        { left: clampX((innerWidth - box.width) / 2), top: margin + 60, arrow: 'none' },
        { left: clampX((innerWidth - box.width) / 2), top: clampY(innerHeight - box.height - 90), arrow: 'none' },
      ];
  candidates.push(
    { left: margin, top: margin, arrow: 'none' },
    { left: innerWidth - box.width - margin, top: margin, arrow: 'none' },
    { left: margin, top: innerHeight - box.height - margin, arrow: 'none' },
    { left: innerWidth - box.width - margin, top: innerHeight - box.height - margin, arrow: 'none' },
  );
  const spot = candidates.find((c) => fits(c.left, c.top)) ?? candidates[0];
  panel.style.left = `${clampX(spot.left)}px`;
  panel.style.top = `${clampY(spot.top)}px`;
  panel.dataset.arrow = spot.arrow;
  if (rect) panel.style.setProperty('--arrow-x', `${Math.min(box.width - 24, Math.max(24, rect.left + rect.width / 2 - clampX(spot.left)))}px`);
};

const showStep = () => {
  const context = tutorialContext();
  const step = active.steps[active.index];
  if (!panel) {
    const holder = document.createElement('div');
    holder.innerHTML = PANEL_HTML;
    panel = /** @type {HTMLElement} */ (holder.firstElementChild);
    document.body.append(panel);
    panel.querySelector('.tut-next').addEventListener('click', next);
    panel.querySelector('.tut-skip').addEventListener('click', () => finish(true));
  }
  panel.querySelector('.tut-icon').textContent = step.icon ?? active.module.icon ?? '★';
  panel.querySelector('.tut-module').textContent = active.module.title;
  panel.querySelector('.tut-title').textContent = step.title;
  panel.querySelector('.tut-text').textContent = typeof step.text === 'function' ? step.text(context) : step.text;
  panel.querySelector('.tut-step').textContent = `${active.index + 1}/${active.steps.length}`;
  active.baseline = step.baseline?.(context);
  // Si lo que se explica está fuera de la pantalla, se trae a la vista.
  const target = step.target ? context.$(step.target) : null;
  if (target) {
    const rect = target.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > innerHeight) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  refreshStep();
};

/** Revisa si el paso actual ya se cumplió y mueve el panel junto a su objetivo. */
const refreshStep = () => {
  if (!active || !panel) return;
  const context = tutorialContext();
  const step = active.steps[active.index];
  // Si el jugador ya no está en la pantalla de este módulo (cambió de etapa, salió), se pausa.
  // Abierto a mano desde la biblioteca, se puede leer en cualquier pantalla.
  if (!active.manual && !active.module.when(context)) {
    panel.hidden = true;
    clearHighlight();
    return;
  }
  panel.hidden = false;
  const target = step.target ? context.$(step.target) : null;
  const visible = target && target.getClientRects().length > 0 ? target : null;
  if (visible !== highlighted) {
    clearHighlight();
    highlighted = visible;
    highlighted?.classList.add('tut-target');
  }
  // Leído fuera de su pantalla, los pasos de "hazlo tú" no esperan: no hay dónde hacerlo.
  const waiting = step.waitFor && !(active.manual && !visible) && !step.waitFor(context, active.baseline);
  const todo = /** @type {HTMLElement} */ (panel.querySelector('.tut-todo'));
  todo.hidden = !step.todo;
  todo.textContent = step.todo ? `${waiting ? '👉' : '✓'} ${step.todo}` : '';
  todo.classList.toggle('done', !waiting);
  const nextButton = /** @type {HTMLButtonElement} */ (panel.querySelector('.tut-next'));
  nextButton.disabled = Boolean(waiting);
  nextButton.textContent = active.index === active.steps.length - 1 ? 'Entendido' : 'Continuar';
  place(visible, step.avoid ?? []);
};

const next = () => {
  if (!active) return;
  if (active.index >= active.steps.length - 1) return finish(true);
  active.index++;
  showStep();
};

/** Arranca un módulo. `manual` = abierto desde la biblioteca (se puede leer en cualquier pantalla). */
export const startTutorial = (moduleId, manual = false) => {
  const module = TUTORIALS.find((m) => m.id === moduleId);
  if (!module) return;
  const context = tutorialContext();
  const steps = module.steps.filter((step) => forMe(step, context));
  if (steps.length === 0) return;
  if (active) finish(false);
  active = { module, steps, index: 0, baseline: undefined, manual };
  showStep();
};

/** Si no hay ninguno en curso, busca el primero que le toque a este jugador ahora. */
const check = () => {
  if (active) return refreshStep();
  if (prefs.off) return;
  const context = tutorialContext();
  const due = TUTORIALS.find((module) => !prefs.done.includes(module.id) && forMe(module, context) && module.when(context));
  if (due) startTutorial(due.id);
};

/** Apaga o prende los tutoriales automáticos. */
export const setTutorialsOff = (off) => {
  prefs = { ...prefs, off };
  savePrefs();
  if (off && active) finish(false);
};

// ---------- Biblioteca ----------
export const openTutorialLibrary = () => {
  document.querySelector('.tut-library')?.remove();
  const context = tutorialContext();
  const box = document.createElement('div');
  box.className = 'tut-library';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Tutoriales');
  const list = TUTORIALS.map((module) => {
    const here = module.when(context);
    const seen = prefs.done.includes(module.id);
    if (!forMe(module, context) && context.roles.length > 0) return '';
    return `<li><button type="button" data-id="${module.id}">
      <span>${module.icon ?? '★'}</span><strong>${module.title}</strong>
      <small>${seen ? 'Visto' : 'Sin ver'} · ${here ? 'aquí, con la pantalla resaltada' : `${module.whereText ?? 'en su pantalla'}; aquí se puede leer`}</small></button></li>`;
  }).join('');
  box.innerHTML = `
    <header><h3>Tutoriales</h3><button type="button" class="tut-close" aria-label="Cerrar">✕</button></header>
    <p>Repite cualquiera cuando quieras. En su pantalla te muestra dónde está cada cosa; en otra, se puede leer igual.</p>
    <ul>${list}</ul>
    <label class="tut-off"><input type="checkbox" ${prefs.off ? 'checked' : ''}/> No mostrar tutoriales automáticamente</label>
    <button type="button" class="tut-reset">Volver a ver todos desde el principio</button>`;
  document.body.append(box);
  box.querySelector('.tut-close').addEventListener('click', () => box.remove());
  box.querySelectorAll('button[data-id]').forEach((button) => button.addEventListener('click', () => {
    box.remove();
    startTutorial(/** @type {HTMLElement} */ (button).dataset.id, true);
  }));
  box.querySelector('.tut-off input').addEventListener('change', (event) => setTutorialsOff(/** @type {HTMLInputElement} */ (event.target).checked));
  box.querySelector('.tut-reset').addEventListener('click', () => {
    prefs = { done: [], off: false };
    savePrefs();
    box.remove();
    check();
  });
};

// ---------- Arranque ----------
/** Lo llama js/main.js una sola vez. */
export const startTutorials = () => {
  for (const event of ['state', 'room', 'enter', 'leave', 'phase']) on(event, () => setTimeout(check, 50));
  addEventListener('resize', () => refreshStep());
  addEventListener('scroll', () => refreshStep(), { passive: true });
  // Algunos pasos esperan cosas de la pantalla (abrir una ficha, cambiar de pestaña): se revisan seguido.
  clearInterval(timer);
  timer = window.setInterval(check, CHECK_MS);
};
