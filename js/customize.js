/**
 * LAPTOP DE PERSONALIZACIÓN (CUSTOMIZE)
 * Pestañas: Color, Sombrero y, solo para el anfitrión, Partida (reglas).
 * Los colores de otros jugadores aparecen bloqueados. Todo cambio se ve al instante para todos.
 */
import { drawAstronaut, drawHead, FRAME_COUNT, WALK_FPS } from './character.js';
import { customize, getMe, isHost, on, session, setSetting } from './connection.js';
import { GAME_SETTINGS, HATS, PLAYER_COLORS, formatSetting } from './shared.js';

const CUSTOMIZE_HTML = `
<div class="customize" role="dialog" aria-modal="true" aria-labelledby="customize-title">
  <header class="customize-header">
    <h2 id="customize-title">Personalizar</h2>
    <button class="customize-close" aria-label="Cerrar">✕</button>
  </header>
  <div class="customize-body">
    <canvas class="customize-preview" aria-hidden="true"></canvas>
    <div class="customize-main">
      <div class="customize-tabs" role="tablist">
        <button role="tab" data-tab="color" aria-selected="true">Color</button>
        <button role="tab" data-tab="hat" aria-selected="false">Sombrero</button>
        <button role="tab" data-tab="settings" aria-selected="false">Partida</button>
      </div>
      <div class="customize-panel color-grid" data-panel="color" role="tabpanel"></div>
      <div class="customize-panel hat-grid" data-panel="hat" role="tabpanel" hidden></div>
      <div class="customize-panel" data-panel="settings" role="tabpanel" hidden>
        <p class="customize-note">Los cambios se ven al instante en el panel "Opciones" de todos.</p>
        <div class="settings-rows"></div>
      </div>
    </div>
  </div>
</div>`;

const PREVIEW = { width: 150, height: 210 };

/** Abre la ventana dentro de `host`. Devuelve la función para cerrarla. */
export const openCustomize = (host, { onClose }) => {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = CUSTOMIZE_HTML;
  host.append(overlay);

  const $ = (selector) => overlay.querySelector(selector);
  const tabs = /** @type {HTMLButtonElement[]} */ ([...overlay.querySelectorAll('[role="tab"]')]);
  const preview = $('.customize-preview');
  const previewCtx = preview.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  preview.width = PREVIEW.width * dpr;
  preview.height = PREVIEW.height * dpr;
  let frameId = 0;

  // ---------- Pestañas ----------
  const selectTab = (name) => {
    for (const tab of tabs) {
      const selected = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = /** @type {HTMLElement} */ (overlay.querySelector(`[data-panel="${tab.dataset.tab}"]`));
      panel.hidden = !selected;
    }
  };
  tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
  $('.customize-tabs').addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const visible = tabs.filter((tab) => !tab.hidden);
    const index = visible.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    const next = visible[(index + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length];
    next.focus();
    selectTab(next.dataset.tab);
  });

  // ---------- Color ----------
  const renderColors = () => {
    const me = getMe();
    const takenBy = new Map(session.room.players.filter((p) => p.id !== me.id).map((p) => [p.color, p.name]));
    $('[data-panel="color"]').replaceChildren(
      ...PLAYER_COLORS.map((color) => {
        const button = document.createElement('button');
        const owner = takenBy.get(color.id);
        button.className = 'swatch';
        button.style.setProperty('--swatch', color.hex);
        button.disabled = Boolean(owner);
        button.setAttribute('aria-pressed', String(me.color === color.id));
        button.setAttribute('aria-label', owner ? `${color.name} (lo usa ${owner})` : color.name);
        button.title = owner ? `Lo usa ${owner}` : color.name;
        button.addEventListener('click', () => customize({ color: color.id }));
        return button;
      }),
    );
  };

  // ---------- Sombrero ----------
  const renderHats = () => {
    const me = getMe();
    $('[data-panel="hat"]').replaceChildren(
      ...HATS.map((hat) => {
        const button = document.createElement('button');
        button.className = 'hat-option';
        button.setAttribute('aria-pressed', String(me.hat === hat.id));
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64 * dpr;
        canvas.setAttribute('aria-hidden', 'true');
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        drawHead(ctx, { color: me.color, hat: hat.id, size: 64 });
        const label = document.createElement('span');
        label.textContent = hat.name;
        button.append(canvas, label);
        button.addEventListener('click', () => customize({ hat: hat.id }));
        return button;
      }),
    );
  };

  // ---------- Partida (solo anfitrión) ----------
  const stepSetting = (setting, direction) => {
    const current = session.room.settings[setting.key];
    if (setting.type === 'choice') {
      const index = setting.options.indexOf(current);
      setSetting(setting.key, setting.options[(index + direction + setting.options.length) % setting.options.length]);
    } else {
      setSetting(setting.key, current + direction * setting.step);
    }
  };

  const renderSettings = () => {
    const host = isHost();
    const settingsTab = tabs.find((tab) => tab.dataset.tab === 'settings');
    settingsTab.hidden = !host;
    if (!host && settingsTab.getAttribute('aria-selected') === 'true') selectTab('color');

    $('.settings-rows').replaceChildren(
      ...GAME_SETTINGS.map((setting) => {
        const row = document.createElement('div');
        row.className = 'setting-row';
        const label = document.createElement('span');
        label.textContent = setting.label;
        const value = document.createElement('output');
        value.textContent = formatSetting(setting, session.room.settings[setting.key]);
        const less = Object.assign(document.createElement('button'), { textContent: '−', type: 'button' });
        const more = Object.assign(document.createElement('button'), { textContent: '+', type: 'button' });
        less.setAttribute('aria-label', `Bajar ${setting.label}`);
        more.setAttribute('aria-label', `Subir ${setting.label}`);
        if (setting.type === 'number') {
          less.disabled = session.room.settings[setting.key] <= setting.min;
          more.disabled = session.room.settings[setting.key] >= setting.max;
        }
        less.addEventListener('click', () => stepSetting(setting, -1));
        more.addEventListener('click', () => stepSetting(setting, 1));
        row.append(label, less, value, more);
        return row;
      }),
    );
  };

  const renderAll = () => {
    if (!getMe()) return;
    renderColors();
    renderHats();
    renderSettings();
  };

  // ---------- Vista previa animada ----------
  const animatePreview = (now) => {
    const me = getMe();
    previewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    previewCtx.clearRect(0, 0, PREVIEW.width, PREVIEW.height);
    if (me) {
      previewCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      previewCtx.beginPath();
      previewCtx.ellipse(PREVIEW.width / 2, PREVIEW.height - 14, 38, 10, 0, 0, Math.PI * 2);
      previewCtx.fill();
      const frame = Math.floor((now / 1000) * WALK_FPS * 0.8) % FRAME_COUNT;
      drawAstronaut(previewCtx, { x: PREVIEW.width / 2, y: PREVIEW.height - 14, color: me.color, hat: me.hat, frame, scale: 0.95 });
    }
    frameId = requestAnimationFrame(animatePreview);
  };

  // ---------- Cerrar ----------
  const off = on('room', renderAll);
  const close = () => {
    cancelAnimationFrame(frameId);
    off();
    overlay.remove();
    onClose();
  };
  $('.customize-close').addEventListener('click', close);
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close();
  });

  renderAll();
  selectTab('color');
  frameId = requestAnimationFrame(animatePreview);
  tabs[0].focus();
  return close;
};
