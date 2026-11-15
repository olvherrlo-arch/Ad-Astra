/**
 * MENÚ PRINCIPAL
 * PLAY → SOLO / MULTIPLAYER → CREATE A LOBBY / USE A CODE, más OPTIONS y CREDITS.
 * Se maneja con mouse o teclado (↑ ↓ para moverse, Enter para elegir, Esc para volver).
 */
import { createRoom, joinRoom, listPublicRooms, on, session } from './connection.js';
import { openCredits } from './credits.js';
import { openRecords } from './recordsview.js';
import { openSettings, reducedMotion } from './settings.js';
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from './shared.js';

const PILOT_NAME_KEY = 'adastra.pilotName';
const TOP_SECTIONS = ['play'];
// Orden para cerrar con Esc: primero lo más profundo.
const CLOSE_ORDER = ['code', 'find', 'multiplayer', ...TOP_SECTIONS];

const MENU_HTML = `
<div class="menu-screen">
  <section class="menu-side">
    <!-- Logo del equipo: assets/images/logo.png (se muestra tal cual, sin deformarlo). -->
    <h1 class="title"><img class="title-logo" src="assets/images/logo.png" width="1200" height="409" alt="Ad Astra" /></h1>
    <p class="menu-tagline">Una aventura espacial para cuatro oficios</p>

    <nav class="menu" aria-label="Menú principal">
      <button type="button" class="menu-btn level-0" data-nav data-toggle="play" aria-expanded="false">Play</button>
      <div class="submenu" id="section-play" hidden>
        <button type="button" class="menu-btn level-1" data-nav data-action="solo">
          Solo <span class="menu-btn-note">Tú solo, con los 4 roles</span>
        </button>
        <button type="button" class="menu-btn level-1" data-nav data-toggle="multiplayer" aria-expanded="false">Multiplayer</button>

        <div class="submenu" id="section-multiplayer" hidden>
          <img class="submenu-star" src="assets/icons/star.svg" alt="" />
          <label class="field">
            <span>Nombre de piloto</span>
            <input data-nav data-pilot-name maxlength="${MAX_NAME_LENGTH}" placeholder="Cómo te verá la tripulación" />
          </label>
          <button type="button" class="menu-btn level-2" data-nav data-action="create">Create a lobby</button>
          <button type="button" class="menu-btn level-2" data-nav data-toggle="code" aria-expanded="false">Use a code</button>
          <form class="code-entry" id="section-code" hidden>
            <input data-nav class="code-input" aria-label="Código de sala" maxlength="${ROOM_CODE_LENGTH}" placeholder="ABCD" />
            <button data-nav class="code-go" disabled>Entrar</button>
          </form>
          <button type="button" class="menu-btn level-2" data-nav data-toggle="find" aria-expanded="false">Find a lobby</button>
          <div class="public-rooms" id="section-find" hidden>
            <div class="public-rooms-head">
              <span>Salas públicas</span>
              <button type="button" data-nav class="public-refresh">Actualizar</button>
            </div>
            <ul class="public-list"></ul>
          </div>
        </div>
      </div>

      <button type="button" class="menu-btn level-0" data-nav data-action="options" aria-haspopup="dialog">Options</button>
      <button type="button" class="menu-btn level-0" data-nav data-action="records" aria-haspopup="dialog">Records</button>
      <button type="button" class="menu-btn level-0" data-nav data-action="credits" aria-haspopup="dialog">Credits</button>
    </nav>

    <p class="menu-error" role="alert" hidden></p>

    <footer class="menu-footer">
      <span class="signal">Buscando servidor…</span>
      <span class="keys"><kbd>↑</kbd><kbd>↓</kbd> moverte <kbd>Enter</kbd> elegir <kbd>Esc</kbd> volver</span>
    </footer>
  </section>

  <div class="menu-divider" aria-hidden="true"></div>

  <!-- Escena: el boceto del transbordador (assets/images/shuttle-sketch.png) flota sobre un planeta lejano. -->
  <div class="hero" aria-hidden="true">
    <span class="hero-stars"></span>
    <svg class="hero-planet" viewBox="0 0 220 220">
      <defs><clipPath id="hero-planet-clip"><circle cx="110" cy="110" r="78" /></clipPath></defs>
      <circle class="hero-planet-body" cx="110" cy="110" r="78" />
      <g clip-path="url(#hero-planet-clip)" class="hero-planet-hatch">
        <path d="M20 150 L150 20 M40 170 L170 40 M62 188 L188 62 M90 200 L200 90 M124 206 L206 124" />
        <path class="hero-planet-band" d="M28 96 Q110 70 192 104 M34 130 Q112 112 188 138" />
      </g>
      <circle class="hero-planet-line" cx="110" cy="110" r="78" />
      <ellipse class="hero-planet-ring" cx="110" cy="112" rx="104" ry="22" transform="rotate(-18 110 112)" />
    </svg>
    <img class="hero-ship" src="assets/images/shuttle-sketch.png" width="868" height="1280" alt="" />
    <span class="hero-comet"></span>
  </div>
</div>`;

const readPilotName = () => {
  try {
    return localStorage.getItem(PILOT_NAME_KEY) ?? '';
  } catch {
    return '';
  }
};

const savePilotName = (name) => {
  try {
    localStorage.setItem(PILOT_NAME_KEY, name);
  } catch {
    // Modo privado sin almacenamiento: el nombre solo dura esta visita.
  }
};

export const mountMenu = (container) => {
  container.innerHTML = MENU_HTML;
  const nav = container.querySelector('.menu');
  const errorBox = container.querySelector('.menu-error');
  const signal = container.querySelector('.signal');
  const nameInputs = [...container.querySelectorAll('[data-pilot-name]')];
  const createButton = container.querySelector('[data-action="create"]');
  const codeForm = container.querySelector('#section-code');
  const codeInput = codeForm.querySelector('input');
  const codeButton = codeForm.querySelector('button');
  let pending = false;

  // ---------- Mensajes ----------
  const showError = (message) => {
    errorBox.textContent = message ?? '';
    errorBox.hidden = !message;
  };

  const refreshButtons = () => {
    createButton.disabled = !session.connected || pending;
    createButton.textContent = pending ? 'Creating…' : 'Create a lobby';
    codeButton.disabled = !session.connected || pending || codeInput.value.length !== ROOM_CODE_LENGTH;
  };

  const showConnection = (connected) => {
    signal.classList.toggle('on', connected);
    signal.textContent = connected ? 'Conectado al servidor' : 'Buscando servidor…';
    refreshButtons();
  };

  // ---------- Abrir y cerrar secciones ----------
  const isOpen = (name) => !container.querySelector(`#section-${name}`).hidden;

  const setOpen = (name, open) => {
    container.querySelector(`#section-${name}`).hidden = !open;
    nav.querySelector(`[data-toggle="${name}"]`).setAttribute('aria-expanded', String(open));
  };

  const toggle = (name) => {
    const open = !isOpen(name);
    if (TOP_SECTIONS.includes(name)) TOP_SECTIONS.forEach((section) => setOpen(section, false));
    setOpen(name, open);
    if (name === 'code' && open) codeInput.focus();
    if (name === 'find' && open) loadPublicRooms();
  };

  // ---------- Salas públicas ----------
  const publicList = container.querySelector('.public-list');
  const listMessage = (text) => {
    const item = document.createElement('li');
    item.className = 'public-empty';
    item.textContent = text;
    return item;
  };

  const loadPublicRooms = async () => {
    publicList.replaceChildren(listMessage('Buscando salas…'));
    const rooms = await listPublicRooms();
    if (!rooms) return publicList.replaceChildren(listMessage('El servidor no respondió. Intenta de nuevo.'));
    if (rooms.length === 0) return publicList.replaceChildren(listMessage('No hay salas públicas ahora. Crea una y márcala como pública.'));

    publicList.replaceChildren(
      ...rooms.map((room) => {
        const item = document.createElement('li');
        const code = Object.assign(document.createElement('span'), { className: 'public-code', textContent: room.code });
        const host = Object.assign(document.createElement('span'), { className: 'public-host', textContent: room.hostName });
        const count = Object.assign(document.createElement('span'), { className: 'public-count', textContent: `${room.players}/${room.maxPlayers}` });
        const join = Object.assign(document.createElement('button'), { type: 'button', className: 'code-go', textContent: 'Entrar' });
        join.dataset.nav = '';
        join.setAttribute('aria-label', `Entrar a la sala ${room.code} de ${room.hostName}`);
        join.addEventListener('click', () => enterLobby((name) => joinRoom(room.code, name)));
        item.append(code, host, count, join);
        return item;
      }),
    );
  };
  container.querySelector('.public-refresh').addEventListener('click', loadPublicRooms);

  const closeDeepest = () => {
    const name = CLOSE_ORDER.find((section) => isOpen(section) && !container.querySelector(`#section-${section}`).closest('[hidden]'));
    if (!name) return;
    setOpen(name, false);
    nav.querySelector(`[data-toggle="${name}"]`).focus();
  };

  // ---------- Entrar a una sala ----------
  const enterLobby = async (request, fallbackName = '') => {
    const name = nameInputs[0].value.trim() || fallbackName;
    if (!name) {
      showError('Escribe tu nombre de piloto para entrar.');
      nameInputs[0].focus();
      return;
    }
    showError(null);
    pending = true;
    refreshButtons();
    const error = await request(name);
    // Si entraste, esta pantalla ya se cerró. Si no, mostramos el error.
    if (error) {
      pending = false;
      refreshButtons();
      showError(error);
    }
  };

  // ---------- Eventos ----------
  nav.addEventListener('click', (event) => {
    const toggleButton = event.target.closest('[data-toggle]');
    if (toggleButton) toggle(toggleButton.dataset.toggle);
    if (event.target.closest('[data-action="create"]')) enterLobby(createRoom);
    // SOLO: una sala privada solo para ti que despega sola. Manejas los cuatro roles (modo demo).
    if (event.target.closest('[data-action="solo"]')) {
      const name = nameInputs[0].value.trim() || 'Piloto';
      session.solo = true;
      enterLobby(createRoom, name).then(() => { if (!session.room) session.solo = false; });
    }
    const opener = event.target.closest('[data-action="options"], [data-action="credits"], [data-action="records"]');
    if (opener) {
      const back = () => opener.focus();
      if (opener.dataset.action === 'options') openSettings({ onClose: back });
      else if (opener.dataset.action === 'records') openRecords({ onClose: back });
      else openCredits({ onClose: back });
    }
  });

  // Flechas para moverse entre lo visible; Esc cierra el submenú más profundo.
  nav.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...nav.querySelectorAll('[data-nav]')].filter((item) => !item.closest('[hidden]'));
      const current = items.indexOf(document.activeElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(current + step + items.length) % items.length]?.focus();
    }
    if (event.key === 'Escape') closeDeepest();
  });

  // El cursor sigue al mouse solo cuando el mouse se mueve de verdad, y nunca mientras escribes.
  const lastPointer = { x: -1, y: -1 };
  nav.addEventListener('mousemove', (event) => {
    const moved = event.clientX !== lastPointer.x || event.clientY !== lastPointer.y;
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
    const button = event.target.closest('.menu-btn');
    if (!moved || !button || document.activeElement instanceof HTMLInputElement) return;
    if (document.activeElement !== button) button.focus();
  });

  for (const input of nameInputs) {
    input.value = readPilotName();
    input.addEventListener('input', () => {
      nameInputs.forEach((other) => other !== input && (other.value = input.value));
      savePilotName(input.value);
    });
  }

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
    refreshButtons();
  });

  codeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (codeInput.value.length !== ROOM_CODE_LENGTH) return;
    enterLobby((name) => joinRoom(codeInput.value, name));
  });

  // Paralaje suave: la escena se corre un poco con el puntero (no con "reducir movimiento").
  const screen = container.querySelector('.menu-screen');
  const parallax = (event) => {
    if (reducedMotion()) return;
    screen.style.setProperty('--px', ((event.clientX / innerWidth) - 0.5).toFixed(3));
    screen.style.setProperty('--py', ((event.clientY / innerHeight) - 0.5).toFixed(3));
  };
  screen.addEventListener('pointermove', parallax);

  // ---------- Estado inicial ----------
  showConnection(session.connected);
  showError(session.error);
  nav.querySelector('[data-toggle="play"]').focus();

  const offs = [on('connection', showConnection), on('error', showError)];
  return () => offs.forEach((off) => off());
};
