/**
 * MINIJUEGOS
 * Las tareas del mundo se hacen con las manos: al usar un puesto se abre uno de estos juegos cortos
 * (10 a 20 segundos) y la tarea queda hecha recién cuando el jugador lo termina. No hay botón de
 * "confirmar": si se cierra antes, no pasó nada.
 *
 *   dial      mantener una aguja dentro de una zona que se mueve (calibrar, perforar, reentrada)
 *   tune      igualar una onda en frecuencia y altura (telescopio, analizador, rastreador de estrellas)
 *   wires     unir cada cable con su enchufe (tablero eléctrico, reparaciones)
 *   timing    acertar cuando la marca pasa por la zona verde (válvulas, ventana de despegue)
 *   switches  activar interruptores en el orden de una lista (cabina)
 *   order     ordenar las maniobras del viaje (mesa de navegación)
 *
 * Los de pilotaje (encendido y alunizaje) están en js/pilotgames.js y usan el mismo marco (runGame).
 *
 * playMinigame(kind, { title, how, game }) devuelve una promesa: { ok: true } si lo terminó,
 * { ok: false } si lo cerró.
 */
import { frameLoop } from './frame.js';
import { INK, UI_FONT, DISPLAY_FONT, condensed, halftone, starPath, withAlpha } from './riso.js';
import { sounds } from './sound.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const text = (ctx, value, x, y, { size = 14, weight = 700, color = INK.navy, align = 'center', font = UI_FONT, narrow = true } = {}) => {
  ctx.font = `${weight} ${size}px ${font}`;
  condensed(ctx, narrow);
  ctx.textAlign = /** @type {CanvasTextAlign} */ (align);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  condensed(ctx, false);
};

/** Fondo de papel con la trama de puntos. */
export const paper = (ctx, W, H, color = INK.paper) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = withAlpha(INK.navy, 0.1);
  for (let y = 12; y < H; y += 24) for (let x = 12; x < W; x += 24) ctx.fillRect(x, y, 2, 2);
};

/** Barra de avance con borde de tinta. */
export const meter = (ctx, x, y, w, h, value, color = INK.teal) => {
  ctx.fillStyle = INK.paper;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(value, 0, 1), h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK.navy;
  ctx.strokeRect(x, y, w, h);
};

/**
 * Abre la ventana de un minijuego y lo corre. `create(api)` devuelve `{ update(dt), draw(time), key?, pointer? }`.
 * api: ctx, width, height, keys (teclas apretadas), pointer { x, y, down }, win(resultado), lose(resultado), setHow(texto)
 * @returns {Promise<any>}
 */
export const runGame = ({ title, how = '', keysHint = '', width = 640, height = 360, closable = true }, create) =>
  new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'minigame';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', title);
    root.innerHTML = `
      <div class="minigame-card">
        <header><h2></h2><button type="button" class="minigame-close" aria-label="Cerrar">✕ Salir</button></header>
        <p class="minigame-how"></p>
        <canvas class="minigame-canvas"></canvas>
        <p class="minigame-keys"></p>
      </div>`;
    root.querySelector('h2').textContent = title;
    const howBox = root.querySelector('.minigame-how');
    howBox.textContent = how;
    root.querySelector('.minigame-keys').textContent = keysHint;
    const closeButton = /** @type {HTMLButtonElement} */ (root.querySelector('.minigame-close'));
    closeButton.hidden = !closable;
    document.body.append(root);

    const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('canvas'));
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.aspectRatio = `${width} / ${height}`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round';

    const keys = new Set();
    const pointer = { x: width / 2, y: height / 2, down: false };
    let ending = null; // { text, tone, until, result }
    let finished = false;
    let stop = () => {};

    const finish = (result) => {
      if (finished) return;
      finished = true;
      stop();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      root.remove();
      resolve(result);
    };
    const end = (label, tone, result) => {
      if (ending) return;
      ending = { text: label, tone, until: performance.now() + 750, result };
      if (tone === 'good') sounds.good?.();
      else sounds.bad?.();
    };
    const api = {
      ctx, width, height, keys, pointer,
      win: (extra = {}, label = '¡Hecho!') => end(label, 'good', { ok: true, ...extra }),
      lose: (extra = {}, label = 'No salió') => end(label, 'bad', { ok: false, ...extra }),
      setHow: (value) => { howBox.textContent = value; },
      get over() { return Boolean(ending); },
    };
    const game = create(api);

    const onKeyDown = (event) => {
      if (event.code === 'Escape' && closable) return finish({ ok: false });
      // Las teclas son del minijuego mientras está abierto: el astronauta no camina.
      event.stopPropagation();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      if (event.repeat || ending) return;
      keys.add(event.code);
      game.key?.(event.code, true);
    };
    const onKeyUp = (event) => {
      event.stopPropagation();
      keys.delete(event.code);
      if (!ending) game.key?.(event.code, false);
    };
    const toLocal = (event) => {
      const box = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - box.left) / box.width) * width;
      pointer.y = ((event.clientY - box.top) / box.height) * height;
    };
    canvas.addEventListener('pointerdown', (event) => {
      toLocal(event);
      pointer.down = true;
      canvas.setPointerCapture?.(event.pointerId);
      if (!ending) game.pointer?.('down', pointer.x, pointer.y);
    });
    canvas.addEventListener('pointermove', (event) => {
      toLocal(event);
      if (!ending) game.pointer?.('move', pointer.x, pointer.y);
    });
    const release = (event) => {
      toLocal(event);
      pointer.down = false;
      if (!ending) game.pointer?.('up', pointer.x, pointer.y);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    closeButton.addEventListener('click', () => finish({ ok: false }));

    stop = frameLoop((dt, now) => {
      if (!ending) game.update(dt);
      game.draw(now / 1000);
      if (ending) {
        ctx.fillStyle = withAlpha(INK.navy, 0.35);
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = ending.tone === 'good' ? INK.gold : INK.coral;
        ctx.fillRect(0, height / 2 - 34, width, 68);
        ctx.fillStyle = INK.navy;
        ctx.fillRect(0, height / 2 - 34, width, 3);
        ctx.fillRect(0, height / 2 + 31, width, 3);
        text(ctx, ending.text, width / 2, height / 2 + 2, { size: 34, weight: 400, font: DISPLAY_FONT, narrow: false });
        if (now >= ending.until) finish(ending.result);
      }
    });
  });

// ============================================================
//  Los juegos
// ============================================================

/** Mantener la aguja en la zona verde hasta llenar la barra. */
const dialGame = (api, { speed = 1, arc = 0.36, seconds = 3.2 } = {}) => {
  const { ctx, width: W, height: H, keys, pointer } = api;
  const cx = W / 2, cy = 232, R = 150;
  let needle = -1.25, velocity = 0, progress = 0;
  let t = Math.random() * 20;
  const targetAt = (time) => 0.8 * Math.sin(time * 0.85 * speed) + 0.36 * Math.sin(time * 2.2 * speed + 1);
  const point = (angle, radius) => [cx + Math.sin(angle) * radius, cy - Math.cos(angle) * radius];
  return {
    update(dt) {
      t += dt;
      const steer = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      if (pointer.down) {
        const wanted = clamp(Math.atan2(pointer.x - cx, cy - pointer.y), -1.5, 1.5);
        needle += clamp(wanted - needle, -4 * dt, 4 * dt);
        velocity = 0;
      } else {
        velocity = (velocity + steer * 11 * dt) * Math.exp(-4.5 * dt);
        needle += velocity * dt;
      }
      needle = clamp(needle, -1.5, 1.5);
      const inside = Math.abs(needle - targetAt(t)) < arc / 2;
      progress = clamp(progress + (inside ? dt / seconds : -dt / 6), 0, 1);
      if (progress >= 1) api.win();
    },
    draw() {
      paper(ctx, W, H);
      const target = targetAt(t);
      const inside = Math.abs(needle - target) < arc / 2;
      // Cuadrante
      ctx.beginPath();
      ctx.arc(cx, cy, R, Math.PI + 0.07, -0.07);
      ctx.lineWidth = 26;
      ctx.strokeStyle = withAlpha(INK.navy, 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2 + target - arc / 2, -Math.PI / 2 + target + arc / 2);
      ctx.strokeStyle = inside ? INK.teal : withAlpha(INK.teal, 0.55);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK.navy;
      for (let i = -6; i <= 6; i++) {
        const [x1, y1] = point(i * 0.25, R + 16), [x2, y2] = point(i * 0.25, R + 24);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      // Aguja
      const [nx, ny] = point(needle, R + 6);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK.coral;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fillStyle = INK.navy;
      ctx.fill();
      text(ctx, inside ? 'EN ZONA' : 'FUERA DE ZONA', cx, cy + 46, { size: 15, color: inside ? INK.teal : INK.coral });
      meter(ctx, 120, H - 46, W - 240, 20, progress, INK.gold);
    },
  };
};

/** Igualar la onda propia (coral) con la buscada (turquesa punteada). */
const tuneGame = (api) => {
  const { ctx, width: W, height: H, keys, pointer } = api;
  const goal = { f: 1.6 + Math.random() * 3.6, a: 0.3 + Math.random() * 0.6 };
  const mine = { f: goal.f > 3.4 ? 1.3 : 5.6, a: goal.a > 0.6 ? 0.2 : 0.95 };
  const top = 46, bottom = H - 86, mid = (top + bottom) / 2, reach = (bottom - top) / 2 - 6;
  let hold = 0, t = 0;
  const error = () => Math.abs(mine.f - goal.f) / 1.6 + Math.abs(mine.a - goal.a) / 0.5;
  const locked = () => Math.abs(mine.f - goal.f) < 0.16 && Math.abs(mine.a - goal.a) < 0.07;
  const wave = (wavy, color, dash) => {
    ctx.beginPath();
    for (let x = 30; x <= W - 30; x += 4) {
      const y = mid - Math.sin(((x - 30) / (W - 60)) * Math.PI * 2 * wavy.f + t * 2) * wavy.a * reach;
      if (x === 30) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.setLineDash(dash);
    ctx.lineWidth = dash.length ? 3 : 4;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  return {
    update(dt) {
      t += dt;
      const df = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      const da = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
      mine.f = clamp(mine.f + df * 1.5 * dt, 1, 6);
      mine.a = clamp(mine.a + da * 0.45 * dt, 0.12, 1);
      if (pointer.down && pointer.y < bottom + 10) {
        mine.f = clamp(1 + ((pointer.x - 30) / (W - 60)) * 5, 1, 6);
        mine.a = clamp(Math.abs(mid - pointer.y) / reach, 0.12, 1);
      }
      hold = locked() ? hold + dt : 0;
      if (hold >= 1) api.win();
    },
    draw() {
      paper(ctx, W, H);
      ctx.fillStyle = INK.navy;
      ctx.fillRect(20, top - 8, W - 40, bottom - top + 16);
      ctx.strokeStyle = withAlpha(INK.paper, 0.18);
      ctx.lineWidth = 1;
      for (let x = 60; x < W - 20; x += 40) { ctx.beginPath(); ctx.moveTo(x, top - 8); ctx.lineTo(x, bottom + 8); ctx.stroke(); }
      ctx.beginPath();
      ctx.moveTo(20, mid);
      ctx.lineTo(W - 20, mid);
      ctx.stroke();
      wave(goal, INK.teal, [8, 7]);
      wave(mine, locked() ? INK.gold : INK.coral, []);
      const match = clamp(1 - error(), 0, 1);
      text(ctx, `Coincidencia ${Math.round(match * 100)} %`, 30, H - 54, { size: 15, align: 'left' });
      meter(ctx, 200, H - 64, W - 230, 20, locked() ? hold : match * 0.6, locked() ? INK.gold : INK.teal);
      text(ctx, '◀ ▶ frecuencia', 30, H - 22, { size: 13, weight: 600, align: 'left', color: withAlpha(INK.navy, 0.8) });
      text(ctx, '▲ ▼ altura', 190, H - 22, { size: 13, weight: 600, align: 'left', color: withAlpha(INK.navy, 0.8) });
      text(ctx, 'o arrastra sobre la pantalla', W - 30, H - 22, { size: 13, weight: 600, align: 'right', color: withAlpha(INK.navy, 0.8) });
    },
  };
};

/** Unir cada cable con el enchufe de su color y símbolo. */
const wiresGame = (api, { count = 4 } = {}) => {
  const { ctx, width: W, height: H, pointer } = api;
  const kinds = [
    { color: INK.coral, symbol: '▲' }, { color: INK.gold, symbol: '●' }, { color: INK.teal, symbol: '■' },
    { color: '#5b74c9', symbol: '★' }, { color: INK.navy, symbol: '◆' },
  ].slice(0, count);
  const order = kinds.map((_k, i) => i);
  const left = shuffle(order);
  let right = shuffle(order);
  if (right.every((id, i) => id === left[i])) right = [...right.slice(1), right[0]];
  const yAt = (i) => 62 + i * ((H - 124) / (count - 1));
  const LX = 96, RX = W - 96;
  const joined = new Set();
  let held = null; // id del cable que se está llevando
  let spark = 0;
  const nearest = (list, x, px, py) => list.findIndex((_id, i) => Math.hypot(px - x, py - yAt(i)) < 34);
  const tryPlug = (px, py) => {
    const slot = nearest(right, RX, px, py);
    if (slot < 0 || held === null) return false;
    if (right[slot] === held) {
      joined.add(held);
      sounds.pick?.();
      held = null;
      if (joined.size === count) api.win();
    } else {
      spark = 0.35;
      sounds.bad?.();
      held = null;
    }
    return true;
  };
  return {
    update(dt) { spark = Math.max(0, spark - dt); },
    pointer(type, px, py) {
      if (type === 'down') {
        if (held !== null && tryPlug(px, py)) return;
        const slot = nearest(left, LX, px, py);
        if (slot >= 0 && !joined.has(left[slot])) held = left[slot];
      } else if (type === 'up' && held !== null) {
        tryPlug(px, py);
      }
    },
    draw() {
      paper(ctx, W, H, spark > 0 ? '#ffd9d3' : INK.paper);
      ctx.fillStyle = withAlpha(INK.navy, 0.08);
      ctx.fillRect(40, 24, 112, H - 48);
      ctx.fillRect(W - 152, 24, 112, H - 48);
      const cable = (id, x2, y2) => {
        const y1 = yAt(left.indexOf(id));
        ctx.beginPath();
        ctx.moveTo(LX, y1);
        ctx.bezierCurveTo(LX + 130, y1, x2 - 130, y2, x2, y2);
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK.navy;
        ctx.stroke();
        ctx.lineWidth = 5;
        ctx.strokeStyle = kinds[id].color;
        ctx.stroke();
      };
      for (const id of joined) cable(id, RX, yAt(right.indexOf(id)));
      if (held !== null) cable(held, pointer.x, pointer.y);
      const plug = (id, x, y, done) => {
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.fillStyle = INK.paper;
        ctx.fill();
        ctx.fillStyle = kinds[id].color;
        ctx.globalAlpha = done ? 1 : 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = held === id ? 5 : 3;
        ctx.strokeStyle = INK.navy;
        ctx.stroke();
        text(ctx, kinds[id].symbol, x, y + 1, { size: 20, color: INK.paper, narrow: false });
      };
      left.forEach((id, i) => plug(id, LX, yAt(i), joined.has(id)));
      right.forEach((id, i) => plug(id, RX, yAt(i), joined.has(id)));
      text(ctx, `${joined.size} de ${count} cables`, W / 2, H - 20, { size: 14 });
    },
  };
};

/** Acertar cuando la marca pasa por la zona verde. Tres aciertos. */
const timingGame = (api, { hitsNeeded = 3 } = {}) => {
  const { ctx, width: W, height: H } = api;
  const X0 = 60, X1 = W - 60, Y = 170;
  const widths = [0.22, 0.17, 0.13, 0.11];
  let p = 0.05, direction = 1, speed = 0.62, hits = 0, zone = 0.55, cooldown = 0, flash = 0;
  const strike = () => {
    if (cooldown > 0) return;
    const w = widths[Math.min(hits, widths.length - 1)];
    if (p >= zone && p <= zone + w) {
      hits++;
      flash = 0.25;
      sounds.pick?.();
      if (hits >= hitsNeeded) return api.win();
      speed *= 1.22;
      zone = 0.08 + Math.random() * (0.84 - widths[Math.min(hits, widths.length - 1)]);
    } else {
      cooldown = 0.45;
      sounds.bad?.();
    }
  };
  return {
    update(dt) {
      cooldown = Math.max(0, cooldown - dt);
      flash = Math.max(0, flash - dt);
      p += direction * speed * dt;
      if (p > 1) { p = 1; direction = -1; }
      if (p < 0) { p = 0; direction = 1; }
    },
    key(code, down) { if (down && ['Space', 'Enter', 'KeyE'].includes(code)) strike(); },
    pointer(type) { if (type === 'down') strike(); },
    draw() {
      paper(ctx, W, H, cooldown > 0 ? '#ffd9d3' : INK.paper);
      const w = widths[Math.min(hits, widths.length - 1)];
      ctx.fillStyle = withAlpha(INK.navy, 0.14);
      ctx.fillRect(X0, Y - 22, X1 - X0, 44);
      ctx.fillStyle = flash > 0 ? INK.gold : INK.teal;
      ctx.fillRect(X0 + zone * (X1 - X0), Y - 22, w * (X1 - X0), 44);
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK.navy;
      ctx.strokeRect(X0, Y - 22, X1 - X0, 44);
      const mx = X0 + p * (X1 - X0);
      ctx.fillStyle = INK.coral;
      ctx.fillRect(mx - 3, Y - 34, 6, 68);
      ctx.beginPath();
      ctx.moveTo(mx - 12, Y - 48); ctx.lineTo(mx + 12, Y - 48); ctx.lineTo(mx, Y - 32);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < hitsNeeded; i++) {
        ctx.beginPath();
        ctx.arc(W / 2 + (i - (hitsNeeded - 1) / 2) * 44, 70, 13, 0, Math.PI * 2);
        ctx.fillStyle = i < hits ? INK.gold : INK.paper;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK.navy;
        ctx.stroke();
      }
      text(ctx, cooldown > 0 ? 'Fuera de la zona…' : 'ESPACIO o clic cuando la marca esté en verde', W / 2, H - 70, { size: 16 });
    },
  };
};

/** Activar los interruptores en el orden de la lista. */
const switchesGame = (api, { labels = [], count = 5 } = {}) => {
  const { ctx, width: W, height: H } = api;
  const steps = shuffle(labels).slice(0, count);
  const layout = shuffle(labels);
  const on = new Set();
  let wrong = { index: -1, time: 0 };
  const cols = 4, cellW = 104, cellH = 132, gridX = 214, gridY = 44;
  const cell = (i) => ({ x: gridX + (i % cols) * cellW, y: gridY + Math.floor(i / cols) * cellH });
  const flip = (index) => {
    if (index < 0 || index >= layout.length || on.has(layout[index])) return;
    if (layout[index] === steps[on.size]) {
      on.add(layout[index]);
      sounds.pick?.();
      if (on.size === steps.length) api.win();
    } else {
      wrong = { index, time: 0.4 };
      sounds.bad?.();
    }
  };
  return {
    update(dt) { wrong.time = Math.max(0, wrong.time - dt); },
    key(code, down) {
      const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      if (down && match) flip(Number(match[1]) - 1);
    },
    pointer(type, px, py) {
      if (type !== 'down') return;
      flip(layout.findIndex((_l, i) => { const c = cell(i); return px >= c.x && px <= c.x + cellW - 8 && py >= c.y && py <= c.y + cellH - 10; }));
    },
    draw() {
      paper(ctx, W, H);
      // La lista
      ctx.fillStyle = INK.navy;
      ctx.fillRect(20, 24, 176, H - 48);
      text(ctx, 'LISTA', 34, 46, { size: 16, color: INK.gold, align: 'left' });
      steps.forEach((step, i) => {
        const done = i < on.size, current = i === on.size;
        const y = 78 + i * 38;
        if (current) {
          ctx.fillStyle = INK.gold;
          ctx.fillRect(28, y - 15, 160, 30);
        }
        text(ctx, `${done ? '✓' : current ? '▶' : `${i + 1}.`} ${step}`, 38, y + 1, { size: 16, align: 'left', color: current ? INK.navy : done ? INK.teal : withAlpha(INK.paper, 0.75) });
      });
      // El tablero
      layout.forEach((name, i) => {
        const c = cell(i);
        const active = on.has(name);
        const shake = wrong.index === i && wrong.time > 0 ? Math.sin(wrong.time * 60) * 4 : 0;
        ctx.fillStyle = wrong.index === i && wrong.time > 0 ? '#ffd9d3' : withAlpha(INK.navy, 0.08);
        ctx.fillRect(c.x + shake, c.y, cellW - 8, cellH - 10);
        ctx.lineWidth = 2;
        ctx.strokeStyle = INK.navy;
        ctx.strokeRect(c.x + shake, c.y, cellW - 8, cellH - 10);
        const sx = c.x + (cellW - 8) / 2 + shake, sy = c.y + 50;
        ctx.fillStyle = INK.navy;
        ctx.beginPath();
        ctx.roundRect(sx - 13, sy - 28, 26, 56, 8);
        ctx.fill();
        ctx.fillStyle = active ? INK.teal : INK.paper;
        ctx.beginPath();
        ctx.roundRect(sx - 9, active ? sy - 24 : sy, 18, 24, 5);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx + 30, sy - 22, 5, 0, Math.PI * 2);
        ctx.fillStyle = active ? INK.gold : withAlpha(INK.navy, 0.25);
        ctx.fill();
        text(ctx, name, sx, c.y + cellH - 36, { size: 15 });
        text(ctx, String(i + 1), c.x + 12 + shake, c.y + 13, { size: 12, color: withAlpha(INK.navy, 0.55) });
      });
    },
  };
};

/** Tocar las tarjetas en el orden correcto. */
const orderGame = (api, { items = [] } = {}) => {
  const { ctx, width: W, height: H } = api;
  const cards = shuffle(items.map((_item, i) => i));
  let next = 0;
  let wrong = { index: -1, time: 0 };
  const cols = 2, rows = Math.ceil(items.length / cols);
  const cellW = (W - 60) / cols, cellH = (H - 70) / rows;
  const cell = (i) => ({ x: 30 + (i % cols) * cellW, y: 20 + Math.floor(i / cols) * cellH });
  const choose = (slot) => {
    if (slot < 0 || slot >= cards.length || cards[slot] < next) return;
    if (cards[slot] === next) {
      next++;
      sounds.pick?.();
      if (next === items.length) api.win();
    } else {
      wrong = { index: slot, time: 0.4 };
      sounds.bad?.();
    }
  };
  return {
    update(dt) { wrong.time = Math.max(0, wrong.time - dt); },
    key(code, down) {
      const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      if (down && match) choose(Number(match[1]) - 1);
    },
    pointer(type, px, py) {
      if (type !== 'down') return;
      choose(cards.findIndex((_c, i) => { const c = cell(i); return px >= c.x && px <= c.x + cellW - 10 && py >= c.y && py <= c.y + cellH - 10; }));
    },
    draw() {
      paper(ctx, W, H);
      cards.forEach((item, slot) => {
        const c = cell(slot);
        const placed = item < next;
        const shake = wrong.index === slot && wrong.time > 0 ? Math.sin(wrong.time * 60) * 5 : 0;
        ctx.beginPath();
        ctx.roundRect(c.x + shake, c.y, cellW - 10, cellH - 10, 8);
        ctx.fillStyle = placed ? INK.teal : wrong.index === slot && wrong.time > 0 ? '#ffd9d3' : INK.paper;
        ctx.fill();
        if (placed) {
          ctx.save();
          ctx.clip();
          ctx.fillStyle = halftone(ctx, INK.navy, 0.2, 3);
          ctx.fillRect(c.x, c.y, cellW, cellH);
          ctx.restore();
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK.navy;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c.x + 28 + shake, c.y + (cellH - 10) / 2, 15, 0, Math.PI * 2);
        ctx.fillStyle = placed ? INK.gold : withAlpha(INK.navy, 0.1);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();
        text(ctx, placed ? String(item + 1) : '?', c.x + 28 + shake, c.y + (cellH - 10) / 2 + 1, { size: 16 });
        text(ctx, items[item], c.x + 54 + shake, c.y + (cellH - 10) / 2 + 1, { size: 16, align: 'left', color: placed ? INK.paper : INK.navy });
      });
      text(ctx, next === 0 ? '¿Cuál se vuela primero?' : `Van ${next} de ${items.length}`, W / 2, H - 26, { size: 15 });
    },
  };
};

const GAMES = {
  dial: { create: dialGame, keys: '◀ ▶ (o A / D) mueven la aguja · también puedes arrastrarla con el mouse' },
  tune: { create: tuneGame, keys: 'Flechas o arrastrar · mantén la coincidencia un segundo' },
  wires: { create: wiresGame, keys: 'Arrastra cada cable hasta su enchufe (o toca el cable y después el enchufe)' },
  timing: { create: timingGame, keys: 'ESPACIO, E o clic' },
  switches: { create: switchesGame, keys: 'Clic en el interruptor, o las teclas 1 a 8' },
  order: { create: orderGame, keys: 'Clic en la tarjeta, o las teclas 1 a 7' },
};

/**
 * Abre un minijuego. Devuelve `{ ok }`.
 * @param {string} kind
 * @param {{ title: string, how?: string, game?: any }} options
 */
export const playMinigame = (kind, { title, how = '', game = {} }) => {
  const entry = GAMES[kind] ?? GAMES.timing;
  return runGame({ title, how, keysHint: entry.keys }, (api) => entry.create(api, game));
};

export { clamp, starPath };
