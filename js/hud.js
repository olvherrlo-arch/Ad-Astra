/**
 * HUD DEL LOBBY (lo que se ve encima de la nave)
 * - Abajo izquierda: "Reglas" de la partida, en vivo.
 * - Arriba derecha: chat (con aviso de mensajes nuevos) y ajustes (volumen, controles, salir).
 * - Abajo centro: la tarjeta de embarque: puerta (código, se puede ocultar), tripulación,
 *   pública/privada y Despegar (el anfitrión) o Listo (los demás).
 *   Los roles no se ven aquí: se sortean al despegar y se revelan con js/rolereveal.js.
 * - Abajo derecha: Personalizar (se activa junto al vestidor).
 * - Centro: cuenta regresiva.
 */
import { mountChat } from './chat.js';
import { getMe, isHost, leaveRoom, on, session, setPrivacy, setReady, startGame } from './connection.js';
import { openCustomize } from './customize.js';
import { openTutorialLibrary } from './tutorial.js';
import { GAME_SETTINGS, formatSetting, startBlocker } from './shared.js';
import { onSettings, openSettings } from './settings.js';
import { getSoundPrefs, setSoundPrefs, sounds } from './sound.js';

const ICONS = {
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><path d="M4 4l16 16"/></svg>',
};

const HUD_HTML = `
<button class="hud-options-toggle" aria-expanded="true" aria-controls="hud-options">Reglas <span aria-hidden="true">▾</span></button>
<aside class="hud-options" id="hud-options" aria-label="Reglas de la partida">
  <h2>Reglas de la partida</h2>
  <dl class="hud-options-list"></dl>
  <p class="hud-options-note"></p>
</aside>

<div class="hud-top">
  <button class="hud-icon" data-panel="chat" aria-label="Chat" aria-expanded="false">${ICONS.chat}<span class="hud-unread" hidden></span></button>
  <button class="hud-icon" data-panel="settings" aria-label="Ajustes" aria-expanded="false">${ICONS.gear}</button>
</div>

<section class="hud-panel hud-chat" data-panel-body="chat" hidden></section>

<section class="hud-panel hud-settings" data-panel-body="settings" hidden aria-label="Ajustes">
  <h2>Ajustes</h2>
  <label class="field">Volumen <input type="range" min="0" max="1" step="0.05" data-volume /></label>
  <label class="hud-check"><input type="checkbox" data-mute /> Silenciar</label>
  <h3>Controles</h3>
  <ul class="hud-controls">
    <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o flechas: moverte</li>
    <li>Clic o toque en el piso: caminar hasta ahí</li>
    <li><kbd>E</kbd> junto al vestidor: personalizar</li>
    <li><kbd>Enter</kbd>: chat <kbd>Esc</kbd>: cerrar</li>
  </ul>
  <button class="hud-tutorials hud-more-options">Todas las opciones…</button>
  <button class="hud-tutorials">Tutoriales</button>
  <button class="hud-leave">Abandonar sala</button>
</section>


<div class="hud-bottom">
  <div class="hud-code">
    <span class="hud-pass-label">Puerta</span>
    <span class="hud-code-text"></span>
    <button class="hud-code-eye"></button>
  </div>
  <div class="hud-pass-crew">
    <span class="hud-pass-label">Tripulación</span>
    <div class="hud-count">${ICONS.person}<span></span></div>
  </div>
  <button class="hud-privacy"></button>
  <button class="hud-start">Despegar</button>
  <p class="hud-why" role="status" hidden></p>
  <button class="hud-ready" aria-pressed="false">Listo</button>
</div>

<button class="hud-customize" disabled>Personalizar</button>

<div class="hud-countdown" hidden aria-live="assertive"><span></span></div>`;

export const mountHud = (container) => {
  container.innerHTML = HUD_HTML;
  const $ = (selector) => container.querySelector(selector);
  const optionsToggle = $('.hud-options-toggle');
  const optionsPanel = $('.hud-options');
  const codeText = $('.hud-code-text');
  const codeEye = $('.hud-code-eye');
  const count = $('.hud-count');
  const privacy = $('.hud-privacy');
  const start = $('.hud-start');
  const ready = $('.hud-ready');
  const customizeButton = $('.hud-customize');
  const countdown = $('.hud-countdown');
  const unread = $('.hud-unread');
  let codeHidden = false;
  let closeCustomize = null;

  // ---------- Paneles de arriba a la derecha ----------
  const chat = mountChat($('.hud-chat'), { onClose: () => setPanel('chat', false) });

  const setPanel = (name, open) => {
    const body = container.querySelector(`[data-panel-body="${name}"]`);
    body.hidden = !open;
    container.querySelector(`[data-panel="${name}"]`).setAttribute('aria-expanded', String(open));
    if (name === 'chat' && open) {
      unread.hidden = true;
      chat.focusInput();
    }
  };
  const isPanelOpen = (name) => !container.querySelector(`[data-panel-body="${name}"]`).hidden;

  container.querySelectorAll('[data-panel]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.panel;
      const open = !isPanelOpen(name);
      setPanel('chat', false);
      setPanel('settings', false);
      setPanel(name, open);
    });
  });

  // ---------- Listo ----------
  ready.addEventListener('click', () => setReady(!getMe()?.ready));

  // ---------- Ajustes ----------
  const volume = $('[data-volume]');
  const mute = $('[data-mute]');
  const showSound = () => {
    const prefs = getSoundPrefs();
    volume.value = String(prefs.volume);
    mute.checked = prefs.muted;
  };
  showSound();
  const offSettings = onSettings(showSound);
  $('.hud-more-options').addEventListener('click', () => {
    setPanel('settings', false);
    openSettings();
  });
  volume.addEventListener('input', () => setSoundPrefs({ volume: Number(volume.value) }));
  mute.addEventListener('change', () => setSoundPrefs({ muted: mute.checked }));
  $('.hud-leave').addEventListener('click', leaveRoom);
  $('.hud-tutorials:not(.hud-more-options)').addEventListener('click', () => {
    setPanel('settings', false);
    openTutorialLibrary();
  });

  // ---------- Opciones (izquierda) ----------
  const setOptionsOpen = (open) => {
    optionsPanel.hidden = !open;
    optionsToggle.setAttribute('aria-expanded', String(open));
    optionsToggle.querySelector('span').textContent = open ? '▾' : '▴';
  };
  optionsToggle.addEventListener('click', () => setOptionsOpen(optionsPanel.hidden));
  setOptionsOpen(window.innerWidth > 720 && window.innerHeight > 520); // en pantallas chicas empieza cerrado

  // ---------- Código ----------
  const renderCode = () => {
    codeText.textContent = codeHidden ? '••••' : session.room.code;
    codeEye.innerHTML = codeHidden ? ICONS.eye : ICONS.eyeOff;
    codeEye.setAttribute('aria-label', codeHidden ? 'Mostrar código' : 'Ocultar código');
  };
  codeEye.addEventListener('click', () => {
    codeHidden = !codeHidden;
    renderCode();
  });

  // ---------- Botones del anfitrión ----------
  privacy.addEventListener('click', () => {
    if (isHost()) setPrivacy(!session.room.isPublic);
  });
  start.addEventListener('click', () => {
    if (isHost()) startGame();
  });
  // Modo SOLO (menú principal): la sala es solo tuya, así que despega sola.
  if (session.solo && isHost()) {
    session.solo = false;
    window.setTimeout(() => { if (isHost() && session.room?.players.length === 1) startGame(); }, 600);
  }

  // ---------- CUSTOMIZE ----------
  const showCustomize = () => {
    if (closeCustomize || customizeButton.disabled) return;
    setPanel('chat', false);
    setPanel('settings', false);
    closeCustomize = openCustomize(container, {
      onClose: () => {
        closeCustomize = null;
        customizeButton.focus();
      },
    });
  };
  customizeButton.addEventListener('click', showCustomize);

  // ---------- Dibujar con los datos de la sala ----------
  const render = () => {
    const { room } = session;
    const host = isHost();
    const me = getMe();
    const blocker = startBlocker(room);
    const away = room.players.filter((p) => p.connected === false);
    // El anfitrión ve en palabras por qué todavía no puede despegar (no solo al pasar el mouse).
    const why = $('.hud-why');
    const awayText = away.length ? `Reconectando: ${away.map((p) => p.name).join(', ')}.` : '';
    why.hidden = !host || (!blocker && !awayText);
    why.textContent = [blocker ? `${blocker}.` : '', awayText].filter(Boolean).join(' ');

    renderCode();
    count.querySelector('span').textContent = `${room.players.length}/${room.maxPlayers}`;
    count.classList.toggle('ready', blocker === null);
    count.title = blocker ?? 'Ya pueden despegar';


    privacy.textContent = room.isPublic ? 'Pública' : 'Privada';
    privacy.classList.toggle('public', room.isPublic);
    privacy.disabled = !host;
    privacy.title = host ? `Cambiar a ${room.isPublic ? 'privada' : 'pública'}` : 'Solo el anfitrión puede cambiarlo';

    start.hidden = !host;
    start.disabled = blocker !== null || room.phase !== 'lobby';
    start.title = blocker ?? '';

    ready.hidden = host;
    ready.disabled = room.phase !== 'lobby';
    ready.setAttribute('aria-pressed', String(Boolean(me?.ready)));
    ready.textContent = me?.ready ? '✓ Listo' : 'Listo';
    ready.title = me?.ready ? 'Clic para avisar que aún no estás listo' : 'Avisa al anfitrión que ya puede despegar';

    $('.hud-options-list').replaceChildren(
      ...GAME_SETTINGS.map((setting) => {
        const row = document.createElement('div');
        const term = document.createElement('dt');
        const value = document.createElement('dd');
        term.textContent = setting.label;
        value.textContent = formatSetting(setting, room.settings[setting.key]);
        row.append(term, value);
        return row;
      }),
    );
    $('.hud-options-note').textContent = host
      ? 'Eres el anfitrión: cámbialas en el vestidor (Personalizar → Partida).'
      : 'Solo el anfitrión puede cambiarlas. Pídeselo por el chat.';
  };

  const showCountdown = ({ seconds }) => {
    countdown.hidden = !seconds;
    if (!seconds) return;
    const number = countdown.querySelector('span');
    number.textContent = String(seconds);
    // Reinicia la animación del número en cada segundo.
    number.classList.remove('beat');
    void number.offsetWidth;
    number.classList.add('beat');
    sounds.tick();
  };

  const onKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    if (closeCustomize) closeCustomize();
    else {
      setPanel('chat', false);
      setPanel('settings', false);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  render();
  const offs = [
    on('room', render),
    on('countdown', showCountdown),
    on('chat-line', (line) => {
      if (isPanelOpen('chat')) return;
      unread.hidden = false;
      if (!line.mine) sounds.message();
    }),
  ];

  return {
    setNearStation: (isNear) => {
      customizeButton.disabled = !isNear;
      customizeButton.classList.toggle('ready', isNear);
    },
    /** El tablero de salidas también oculta el código cuando lo ocultas aquí. */
    isCodeHidden: () => codeHidden,
    /** Mientras la ventana de personalizar está abierta, el astronauta no se mueve. */
    isBlocking: () => Boolean(closeCustomize),
    openCustomize: showCustomize,
    openChat: () => {
      setPanel('settings', false);
      setPanel('chat', true);
    },
    destroy: () => {
      closeCustomize?.();
      window.removeEventListener('keydown', onKeyDown);
      offs.forEach((off) => off());
      offSettings();
      chat.destroy();
    },
  };
};
