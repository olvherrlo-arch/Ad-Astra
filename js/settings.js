/**
 * OPCIONES DEL JUGADOR
 * Preferencias de cada quien, guardadas en este navegador (localStorage `adastra.settings`).
 * No viajan al servidor: no cambian nada de los demás tripulantes.
 *
 * Cada opción está conectada a algo real:
 *   master, music, sfx, muted   js/sound.js (efectos y música generada)
 *   walkSpeed                   velocidad al caminar (js/world.js y js/lobby.js)
 *   cameraZoom, cameraFollow    cámara de la misión (js/world.js)
 *   cameraShake                 la nave tiembla al encender motores (js/world.js)
 *   quality                     resolución de los lienzos (densidad de píxeles)
 *   textSize                    tamaño del texto de la interfaz (rem en css/styles.css)
 *   reduceMotion                cámaras lentas, texto que se escribe solo, animaciones (también respeta el sistema)
 *   reduceEffects               destellos, parpadeos, bordes que laten y sacudidas
 * Pantalla completa no se guarda: la decide el navegador (se pide con un clic).
 *
 * `openSettings()` abre la pantalla de opciones (desde el menú principal, el lobby o la partida).
 */
import { storage } from './connection.js';

const KEY = 'adastra.settings';

export const DEFAULT_SETTINGS = Object.freeze({
  master: 0.8,
  music: 0.45,
  sfx: 0.8,
  muted: false,
  walkSpeed: 1,
  cameraZoom: 1,
  cameraFollow: 8,
  cameraShake: true,
  quality: 'high',
  textSize: 1,
  reduceMotion: false,
  reduceEffects: false,
});

/** Densidad de píxeles máxima de los lienzos según la calidad elegida. */
const QUALITY_DPR = { high: 2, medium: 1.25, low: 1 };

const clampNumber = (value, min, max, fallback) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

/** Limpia lo guardado (puede venir de una versión vieja o estar roto). */
const sanitize = (raw) => {
  const saved = typeof raw === 'object' && raw !== null ? raw : {};
  const d = DEFAULT_SETTINGS;
  // Versión anterior: { volume, muted } en `adastra.sound`.
  const legacy = storage.get('adastra.sound', null);
  const master = saved.master ?? legacy?.volume;
  return {
    master: clampNumber(Number(master), 0, 1, d.master),
    music: clampNumber(Number(saved.music), 0, 1, d.music),
    sfx: clampNumber(Number(saved.sfx), 0, 1, d.sfx),
    muted: typeof saved.muted === 'boolean' ? saved.muted : Boolean(legacy?.muted),
    walkSpeed: clampNumber(Number(saved.walkSpeed), 0.75, 1.25, d.walkSpeed),
    cameraZoom: clampNumber(Number(saved.cameraZoom), 0.8, 1.3, d.cameraZoom),
    cameraFollow: clampNumber(Number(saved.cameraFollow), 3, 14, d.cameraFollow),
    cameraShake: typeof saved.cameraShake === 'boolean' ? saved.cameraShake : d.cameraShake,
    quality: saved.quality in QUALITY_DPR ? saved.quality : d.quality,
    textSize: clampNumber(Number(saved.textSize), 0.9, 1.3, d.textSize),
    reduceMotion: typeof saved.reduceMotion === 'boolean' ? saved.reduceMotion : d.reduceMotion,
    reduceEffects: typeof saved.reduceEffects === 'boolean' ? saved.reduceEffects : d.reduceEffects,
  };
};

let current = sanitize(storage.get(KEY, null));
const listeners = new Set();

export const getSettings = () => ({ ...current });

/** Cambia una o más opciones, las guarda y avisa a quien escuche (sonido, mundo, etc.). */
export const setSettings = (changes) => {
  current = sanitize({ ...current, ...changes });
  storage.set(KEY, current);
  applyToPage();
  for (const listener of listeners) listener(getSettings());
};

export const resetSettings = () => setSettings({ ...DEFAULT_SETTINGS });

/** Escucha cambios de opciones. Devuelve la función para dejar de escuchar. */
export const onSettings = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** ¿Hay que evitar el movimiento? Lo pide el jugador aquí, o su sistema operativo. */
export const reducedMotion = () => current.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
export const reducedEffects = () => current.reduceEffects;
/** Densidad de píxeles para un lienzo, recortada por la calidad elegida. */
export const canvasDpr = (cap = 2) => Math.min(window.devicePixelRatio || 1, cap, QUALITY_DPR[current.quality]);

/** Lo que se aplica a toda la página: tamaño del texto y marcas para el CSS. */
const applyToPage = () => {
  const root = document.documentElement;
  root.style.fontSize = `${Math.round(16 * current.textSize)}px`;
  root.dataset.motion = current.reduceMotion ? 'reduced' : 'full';
  root.dataset.effects = current.reduceEffects ? 'reduced' : 'full';
};
applyToPage();

// ============================================================
//  Pantalla de opciones
// ============================================================

const percent = (value) => `${Math.round(value * 100)} %`;
const QUALITY_NAMES = { high: 'Alta', medium: 'Media', low: 'Baja' };

/** Las filas de la pantalla, por sección. `kind`: range | toggle | select. */
const SECTIONS = [
  {
    title: 'Audio',
    rows: [
      { key: 'master', label: 'Volumen general', kind: 'range', min: 0, max: 1, step: 0.05, show: percent },
      { key: 'music', label: 'Música', kind: 'range', min: 0, max: 1, step: 0.05, show: percent },
      { key: 'sfx', label: 'Efectos de sonido', kind: 'range', min: 0, max: 1, step: 0.05, show: percent },
      { key: 'muted', label: 'Silenciar todo', kind: 'toggle' },
    ],
  },
  {
    title: 'Juego',
    rows: [
      { key: 'walkSpeed', label: 'Velocidad al caminar', kind: 'range', min: 0.75, max: 1.25, step: 0.05, show: percent, note: 'Solo cambia tu astronauta.' },
      { key: 'cameraFollow', label: 'Velocidad de la cámara', kind: 'range', min: 3, max: 14, step: 1, show: (v) => (v <= 5 ? `${v} · suave` : v >= 11 ? `${v} · rápida` : String(v)), note: 'Qué tan rápido te sigue en la misión.' },
      { key: 'cameraZoom', label: 'Acercamiento de la cámara', kind: 'range', min: 0.8, max: 1.3, step: 0.05, show: percent },
      { key: 'cameraShake', label: 'La nave tiembla al encender motores', kind: 'toggle' },
    ],
  },
  {
    title: 'Pantalla',
    rows: [
      { key: 'fullscreen', label: 'Pantalla completa', kind: 'toggle', live: true },
      { key: 'quality', label: 'Resolución de los dibujos', kind: 'select', options: Object.keys(QUALITY_NAMES), names: QUALITY_NAMES, note: 'Baja ayuda en computadoras lentas.' },
      { key: 'textSize', label: 'Tamaño del texto', kind: 'range', min: 0.9, max: 1.3, step: 0.05, show: percent },
    ],
  },
  {
    title: 'Accesibilidad',
    rows: [
      { key: 'reduceMotion', label: 'Reducir movimiento', kind: 'toggle', note: 'Sin cámaras lentas ni texto que se escribe solo.' },
      { key: 'reduceEffects', label: 'Reducir efectos de pantalla', kind: 'toggle', note: 'Sin destellos, parpadeos ni sacudidas.' },
    ],
  },
];

const fullscreenOn = () => Boolean(document.fullscreenElement);
const canFullscreen = () => Boolean(document.documentElement.requestFullscreen) && document.fullscreenEnabled !== false;

let openScreen = null;

/**
 * Abre la pantalla de opciones encima de lo que haya. `onClose` se llama al cerrarla.
 * @param {{ onClose?: () => void }} [options]
 */
export const openSettings = ({ onClose } = {}) => {
  if (openScreen) return openScreen;
  const root = document.createElement('div');
  root.className = 'settings-screen';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'settings-title');
  root.innerHTML = `
    <div class="settings-card">
      <header class="settings-head">
        <p class="settings-kicker">Ad Astra</p>
        <h2 id="settings-title">Opciones</h2>
        <p class="settings-note">Se guardan en este navegador y solo cambian tu juego.</p>
      </header>
      <div class="settings-body"></div>
      <footer class="settings-foot">
        <button type="button" class="settings-reset">Restaurar valores</button>
        <button type="button" class="settings-back">← Volver</button>
      </footer>
    </div>`;
  const body = root.querySelector('.settings-body');
  const inputs = new Map();

  for (const section of SECTIONS) {
    const group = document.createElement('section');
    group.className = 'settings-group';
    const heading = document.createElement('h3');
    heading.textContent = section.title;
    group.append(heading);
    for (const row of section.rows) {
      if (row.key === 'fullscreen' && !canFullscreen()) continue;
      const line = document.createElement('label');
      line.className = `settings-row ${row.kind}`;
      const name = document.createElement('span');
      name.className = 'settings-label';
      name.textContent = row.label;
      if (row.note) {
        const note = document.createElement('small');
        note.textContent = row.note;
        name.append(note);
      }
      const value = document.createElement('output');
      value.className = 'settings-value';
      let input;
      if (row.kind === 'range') {
        input = document.createElement('input');
        input.type = 'range';
        Object.assign(input, { min: String(row.min), max: String(row.max), step: String(row.step) });
        input.addEventListener('input', () => setSettings({ [row.key]: Number(input.value) }));
      } else if (row.kind === 'toggle') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('role', 'switch');
        input.addEventListener('change', () => {
          if (row.key === 'fullscreen') {
            const request = input.checked ? document.documentElement.requestFullscreen?.() : document.exitFullscreen?.();
            Promise.resolve(request).catch(() => {}).finally(refresh);
            return;
          }
          setSettings({ [row.key]: input.checked });
        });
      } else {
        input = document.createElement('select');
        for (const option of row.options) {
          const item = document.createElement('option');
          item.value = option;
          item.textContent = row.names[option];
          input.append(item);
        }
        input.addEventListener('change', () => setSettings({ [row.key]: input.value }));
      }
      input.className = 'settings-input';
      inputs.set(row.key, { input, value, row });
      line.append(name, input, value);
      group.append(line);
    }
    body.append(group);
  }

  const refresh = () => {
    const now = getSettings();
    for (const [key, { input, value, row }] of inputs) {
      if (row.kind === 'toggle') {
        const on = key === 'fullscreen' ? fullscreenOn() : Boolean(now[key]);
        /** @type {HTMLInputElement} */ (input).checked = on;
        value.textContent = on ? 'Sí' : 'No';
      } else if (row.kind === 'range') {
        /** @type {HTMLInputElement} */ (input).value = String(now[key]);
        value.textContent = row.show(now[key]);
        input.style.setProperty('--fill', `${((now[key] - row.min) / (row.max - row.min)) * 100}%`);
      } else {
        /** @type {HTMLSelectElement} */ (input).value = now[key];
        value.textContent = row.names[now[key]];
      }
    }
  };

  const close = () => {
    off();
    document.removeEventListener('fullscreenchange', refresh);
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    openScreen = null;
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      close();
    }
  };

  root.querySelector('.settings-reset').addEventListener('click', () => resetSettings());
  root.querySelector('.settings-back').addEventListener('click', close);
  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });
  const off = onSettings(refresh);
  document.addEventListener('fullscreenchange', refresh);
  window.addEventListener('keydown', onKey, true);
  document.body.append(root);
  refresh();
  /** @type {HTMLElement} */ (root.querySelector('.settings-input'))?.focus();
  openScreen = { close };
  return openScreen;
};
