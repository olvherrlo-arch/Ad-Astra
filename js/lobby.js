/**
 * LOBBY: LA SALA DE EMBARQUE
 * Los tripulantes esperan en la sala de embarque de la estación Ad Astra mientras la nave
 * espera acoplada afuera de la ventana. Se dibuja como un afiche impreso en risografía (js/riso.js).
 * - Moverse: WASD o flechas (8 direcciones), o clic/toque en el piso.
 * - E junto al vestidor: Personalizar.  Enter: chat.
 * - El tablero de salidas muestra la puerta (código), la tripulación y el estado; en la cuenta
 *   regresiva cambia a "DESPEGA 5, 4, 3…" y la nave enciende los motores.
 * La interfaz encima (código, Despegar, chat, ajustes) está en js/hud.js.
 */
import { drawAstronaut, FRAME_COUNT, IDLE_FRAME, WALK_FPS } from './character.js';
import { on, sendMove, session } from './connection.js';
import { mountHud } from './hud.js';
import { COUNTDOWN_SECONDS, LOBBY_MAP, clampToFloor, roleName, startBlocker } from './shared.js';
import { sounds } from './sound.js';
import {
  INK, MISREGISTER, UI_FONT, condensed, createRng, halftone, halftoneGradient, inkFill, keyLine,
  paperFill, paperGrain, polyPath, starPath, withAlpha,
} from './riso.js';

const KEY_DIRECTIONS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

const SEND_INTERVAL_MS = 50;
const BUBBLE_MS = 4_000;
const SPRITE_SCALE = 0.58; // tamaño del astronauta en la sala (~100 unidades de alto)

// ---------- La sala (en unidades de mundo; el mundo mide LOBBY_MAP.width × height) ----------
const ROOM = {
  wall: { x: 76, y: 40, w: 808, h: 156 }, //                 pared del fondo
  floor: { x: 76, y: 196, w: 808, h: 404 },
  wainscot: 176, //                                            donde empieza el zócalo turquesa
  window: { x: 466, y: 52, w: 396, h: 122, radius: 16 }, //   ventanal
  mullions: [598, 730], //                                     columnas del ventanal
  board: { x: 236, y: 52, w: 214, h: 122 }, //                tablero de salidas
  sign: { x: 104, y: 56, w: 108, h: 24 }, //                  placa sobre el vestidor
  rug: { x: 480, y: 404, rx: 170, ry: 84 }, //                alfombra donde aparecen los tripulantes
  rocket: { x: 604, y: 116 }, //                               la nave, acoplada afuera
  planet: { x: 800, y: 128, r: 46 },
};

// Cielo que pasa por el ventanal: una franja que se repite y se mueve despacio.
const SKY = { width: 480, height: 140, speed: 5 };

// Tablero de salidas: letras que puede mostrar cada casilla (gira por estas hasta llegar).
const FLAP_CHARS = ' ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789/·-';
const FLAP_CELLS = 9;
const FLAP_STEP_MS = 45;

// ---------- Utilidades de dibujo ----------

const isTyping = () => {
  const element = document.activeElement;
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
};

const isBlocked = (x, y) => {
  const r = LOBBY_MAP.playerRadius;
  return LOBBY_MAP.crates.some((c) => x > c.x - r && x < c.x + c.w + r && y > c.y - 4 && y < c.y + c.h + 8);
};

const ellipsize = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// ---------- Pantalla ----------

export const mountLobby = (container) => {
  container.innerHTML = `
    <div class="lobby">
      <canvas class="lobby-canvas" aria-label="Sala de embarque: muévete con WASD o las flechas"></canvas>
      <div class="lobby-hud"></div>
    </div>`;
  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  // Lo que no se mueve (espacio, paredes, piso) se dibuja una vez aquí y se copia en cada cuadro.
  const background = document.createElement('canvas');
  const sky = document.createElement('canvas'); // cielo del ventanal, también se pinta una vez
  /** @type {number | null} */
  let countdownSeconds = null; // segundos de la cuenta regresiva, o null si no hay
  const actors = new Map();
  const pressed = new Set();
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };
  let moveTarget = null;
  const steer = { side: 1, time: 0 }; // para rodear cajas al caminar hacia un clic
  let openCustomizeOnArrival = false;
  let nearStation = false;
  let lastSent = { at: 0, x: 0, y: 0, moving: false };
  let frameId = 0;
  let lastTime = performance.now();

  const hud = mountHud(container.querySelector('.lobby-hud'));

  // ---------- Jugadores ----------
  const syncActors = (isFirstSync) => {
    const now = performance.now();
    const ids = new Set(session.room.players.map((p) => p.id));
    for (const id of actors.keys()) if (!ids.has(id)) actors.delete(id);

    for (const player of session.room.players) {
      const actor = actors.get(player.id);
      if (!actor) {
        actors.set(player.id, {
          id: player.id, x: player.x, y: player.y, tx: player.x, ty: player.y,
          facing: player.facing ?? 1, moving: false, walkTime: 0, lastMoveAt: 0,
          spawnedAt: isFirstSync ? -Infinity : now, bubble: null,
        });
        if (!isFirstSync) sounds.pop();
      } else if (player.id !== session.myId) {
        actor.tx = player.x;
        actor.ty = player.y;
      }
    }
  };

  // ---------- Tamaño y cámara ----------
  const resize = () => {
    view.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * view.dpr);
    canvas.height = Math.round(canvas.clientHeight * view.dpr);
    const fit = Math.min(canvas.clientWidth / LOBBY_MAP.width, canvas.clientHeight / LOBBY_MAP.height);
    view.scale = fit;
    view.x = (canvas.clientWidth - LOBBY_MAP.width * fit) / 2;
    view.y = (canvas.clientHeight - LOBBY_MAP.height * fit) / 2;
    paintBackground();
  };

  const toWorld = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
  };

  const worldTransform = (target = ctx) =>
    target.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.x, view.dpr * view.y);

  // ---------- Movimiento propio ----------
  const updateMe = (dt) => {
    const me = actors.get(session.myId);
    if (!me) return;

    let dx = 0, dy = 0;
    if (!hud.isBlocking() && !isTyping()) {
      for (const code of pressed) {
        const dir = KEY_DIRECTIONS[code];
        if (dir) { dx += dir[0]; dy += dir[1]; }
      }
    }
    if (dx || dy) moveTarget = null;
    if (!dx && !dy && moveTarget) {
      const tx = moveTarget.x - me.x, ty = moveTarget.y - me.y;
      const distance = Math.hypot(tx, ty);
      if (distance < 4) moveTarget = null;
      else { dx = tx / distance; dy = ty / distance; }
    }

    const length = Math.hypot(dx, dy);
    me.moving = length > 0;
    if (me.moving) {
      const speed = LOBBY_MAP.baseSpeed * (session.room.settings.playerSpeed ?? 1) * dt;
      const stepX = (dx / length) * speed, stepY = (dy / length) * speed;
      const before = { x: me.x, y: me.y };
      const nextX = clampToFloor(me.x + stepX, me.y).x;
      if (!isBlocked(nextX, me.y)) me.x = nextX;
      const nextY = clampToFloor(me.x, me.y + stepY).y;
      if (!isBlocked(me.x, nextY)) me.y = nextY;
      // Caminando hacia un clic: si una caja tapa el camino, la rodea (prueba girar a un lado y al otro).
      if (moveTarget && me.x === before.x && me.y === before.y) {
        const angle = Math.atan2(dy, dx);
        const turns = [1, 2, 3].flatMap((k) => [steer.side * k, -steer.side * k]);
        const turn = turns.find((t) => {
          const next = clampToFloor(me.x + Math.cos(angle + t * Math.PI / 4) * speed, me.y + Math.sin(angle + t * Math.PI / 4) * speed);
          return !isBlocked(next.x, next.y) && (next.x !== me.x || next.y !== me.y);
        });
        steer.time += dt;
        if (turn === undefined || steer.time > 3) {
          moveTarget = null; // no hay por dónde: se detiene
          me.moving = false;
        } else {
          steer.side = Math.sign(turn);
          const next = clampToFloor(me.x + Math.cos(angle + turn * Math.PI / 4) * speed, me.y + Math.sin(angle + turn * Math.PI / 4) * speed);
          me.x = next.x;
          me.y = next.y;
        }
      } else {
        steer.time = 0;
      }
      const movedX = me.x - before.x;
      if (Math.abs(movedX) > 0.01) me.facing = movedX > 0 ? 1 : -1;
      if (me.moving) me.walkTime += dt;
    }

    const now = performance.now();
    const changed = Math.abs(me.x - lastSent.x) > 0.5 || Math.abs(me.y - lastSent.y) > 0.5 || me.moving !== lastSent.moving;
    if (changed && now - lastSent.at > SEND_INTERVAL_MS) {
      sendMove({ x: me.x, y: me.y, facing: me.facing, moving: me.moving });
      lastSent = { at: now, x: me.x, y: me.y, moving: me.moving };
    }

    const { station } = LOBBY_MAP;
    const isNear = Math.hypot(me.x - station.x, me.y - station.y) < station.radius;
    if (isNear !== nearStation) {
      nearStation = isNear;
      hud.setNearStation(isNear);
    }
    if (isNear && openCustomizeOnArrival) {
      openCustomizeOnArrival = false;
      moveTarget = null;
      hud.openCustomize();
    }
  };

  const updateOthers = (dt) => {
    const now = performance.now();
    const follow = 1 - Math.exp(-dt * 12);
    for (const actor of actors.values()) {
      if (actor.id === session.myId) continue;
      if (Math.hypot(actor.tx - actor.x, actor.ty - actor.y) > 200) { actor.x = actor.tx; actor.y = actor.ty; }
      actor.x += (actor.tx - actor.x) * follow;
      actor.y += (actor.ty - actor.y) * follow;
      if (now - actor.lastMoveAt > 250) actor.moving = false;
      if (actor.moving) actor.walkTime += dt;
    }
  };

  // ---------- Utilidades de dibujo de la sala ----------
  const rect = (x, y, w, h, r = 0) => () => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };
  const ellipse = (cx, cy, rx, ry) => () => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  };
  /** Un mueble visto desde arriba y de frente: la tapa (arriba) y el frente. */
  const faces = ({ x, y, w, h, height }) => ({
    top: { x, y: y - height, w, h },
    front: { x, y: y + h - height, w, h: height },
  });

  const text = (g, value, x, y, { size = 12, weight = 600, color = INK.navy, align = 'left', font = UI_FONT, narrow = true } = {}) => {
    g.font = `${weight} ${size}px ${font}`;
    condensed(g, narrow);
    g.textAlign = /** @type {CanvasTextAlign} */ (align);
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(value, x, y);
    condensed(g, false);
  };

  // ---------- Fondo fijo (se repinta solo al cambiar el tamaño) ----------
  /** El espacio: tinta azul con nubes en trama turquesa y coral, y estrellas. */
  const paintSpace = (g, x, y, w, h, seed, spacing) => {
    const rng = createRng(seed);
    g.fillStyle = INK.space;
    g.fillRect(x, y, w, h);
    const clouds = Array.from({ length: 6 }, () => ({
      x: x + rng() * w, y: y + rng() * h, r: (0.25 + rng() * 0.35) * Math.max(w, h), teal: rng() < 0.6,
    }));
    const cloudAt = (teal) => (px, py) => clouds
      .filter((c) => c.teal === teal)
      .reduce((sum, c) => sum + Math.exp(-(((px - c.x) ** 2 + (py - c.y) ** 2) / (c.r * c.r)) * 2.2), 0) * 0.5;
    const area = () => { g.beginPath(); g.rect(x, y, w, h); };
    g.save();
    g.globalAlpha = 0.5;
    halftoneGradient(g, area, INK.teal, cloudAt(true), { x, y, w, h }, spacing, 'source-over');
    g.globalAlpha = 0.4;
    halftoneGradient(g, area, INK.coral, cloudAt(false), { x, y, w, h }, spacing, 'source-over');
    g.restore();
    const stars = Math.round((w * h) / (spacing * spacing * 9));
    for (let i = 0; i < stars; i++) {
      const size = rng() < 0.9 ? 0.5 + rng() * 0.8 : 1.4;
      g.fillStyle = withAlpha(INK.paper, 0.5 + rng() * 0.5);
      g.fillRect(x + rng() * w, y + rng() * h, size * spacing / 5, size * spacing / 5);
    }
    for (let i = 0; i < stars / 40; i++) {
      starPath(g, x + rng() * w, y + rng() * h, (2 + rng() * 2.5) * spacing / 5);
      g.fillStyle = INK.gold;
      g.fill();
    }
  };

  const paintSky = () => {
    const s = view.scale * view.dpr;
    sky.width = Math.max(1, Math.round(SKY.width * s));
    sky.height = Math.max(1, Math.round(SKY.height * s));
    const g = sky.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    // Tres veces corrido, para que la franja se repita sin costura.
    for (const shift of [-SKY.width, 0, SKY.width]) {
      g.save();
      g.beginPath();
      g.rect(0, 0, SKY.width, SKY.height);
      g.clip();
      g.translate(shift, 0);
      paintSpace(g, 0, 0, SKY.width, SKY.height, 9, 3.2);
      g.restore();
    }
  };

  /** Paredes cortadas (como en un plano): marco coral en trama alrededor de la sala. */
  const paintFrame = (g) => {
    const { wall, floor } = ROOM;
    const sides = [
      [wall.x - 22, wall.y - 14, 22, LOBBY_MAP.height - wall.y + 14],
      [wall.x + wall.w, wall.y - 14, 22, LOBBY_MAP.height - wall.y + 14],
      [wall.x - 22, wall.y - 14, wall.w + 44, 14],
    ];
    for (const [x, y, w, h] of sides) {
      g.fillStyle = INK.paper;
      g.fillRect(x, y, w, h);
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = halftone(g, INK.coral, 0.7, 3);
      g.fillRect(x, y, w, h);
      g.restore();
      g.lineWidth = 2;
      g.strokeStyle = INK.navy;
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
    // Remaches dorados en la viga de arriba
    for (let x = wall.x; x <= wall.x + wall.w; x += 48) {
      g.beginPath();
      g.arc(x, wall.y - 7, 2.2, 0, Math.PI * 2);
      g.fillStyle = INK.gold;
      g.fill();
    }
    // Sombra de la pared sobre el piso
    halftoneGradient(g, () => { g.beginPath(); g.rect(floor.x, floor.y, floor.w, 30); }, INK.navy,
      (px, py) => 0.35 * (1 - (py - floor.y) / 30), { x: floor.x, y: floor.y, w: floor.w, h: 30 }, 3.4);
  };

  const paintWall = (g) => {
    const { wall, wainscot, window: win, board } = ROOM;
    g.fillStyle = INK.wall;
    g.fillRect(wall.x, wall.y, wall.w, wall.h);
    // Juntas de los paneles
    g.strokeStyle = withAlpha(INK.navy, 0.14);
    g.lineWidth = 1.4;
    for (let x = wall.x + 64; x < wall.x + wall.w; x += 96) {
      g.beginPath();
      g.moveTo(x, wall.y);
      g.lineTo(x, wainscot);
      g.stroke();
    }
    // Sombra del techo
    halftoneGradient(g, () => { g.beginPath(); g.rect(wall.x, wall.y, wall.w, 34); }, INK.navy,
      (px, py) => 0.4 * (1 - (py - wall.y) / 34), { x: wall.x, y: wall.y, w: wall.w, h: 34 }, 3.4);
    // Zócalo turquesa con filete dorado
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = INK.teal;
    g.fillRect(wall.x, wainscot, wall.w, wall.y + wall.h - wainscot);
    g.fillStyle = halftone(g, INK.navy, 0.25, 3);
    g.fillRect(wall.x, wainscot, wall.w, wall.y + wall.h - wainscot);
    g.restore();
    g.fillStyle = INK.gold;
    g.fillRect(wall.x, wainscot - 2, wall.w, 3);

    // Marco del ventanal (el cielo se dibuja en cada cuadro)
    g.beginPath();
    g.roundRect(win.x - 8, win.y - 8, win.w + 16, win.h + 16, win.radius + 6);
    g.fillStyle = INK.navy;
    g.fill();
    g.fillStyle = INK.gold;
    g.fillRect(win.x - 12, win.y + win.h + 8, win.w + 24, 5); // repisa

    // Tablero de salidas: marco y rótulos (las casillas se dibujan en cada cuadro)
    g.beginPath();
    g.roundRect(board.x, board.y, board.w, board.h, 6);
    g.fillStyle = INK.navy;
    g.fill();
    g.fillStyle = INK.gold;
    g.fillRect(board.x + 10, board.y + 21, board.w - 20, 1.5);
    text(g, 'Salidas', board.x + 10, board.y + 12, { size: 12, weight: 700, color: INK.gold });
    text(g, 'Estación Ad Astra', board.x + board.w - 10, board.y + 12, { size: 9, weight: 500, color: withAlpha(INK.paper, 0.7), align: 'right' });
    BOARD_ROWS.forEach((row, i) => {
      text(g, row.label, board.x + 10, boardRowY(i) + 11, { size: 10, weight: 600, color: withAlpha(INK.paper, 0.85) });
    });
    // Varillas de la placa del vestidor
    const { sign } = ROOM;
    g.fillStyle = INK.navy;
    g.fillRect(sign.x + 14, wall.y, 2, sign.y - wall.y);
    g.fillRect(sign.x + sign.w - 16, wall.y, 2, sign.y - wall.y);
  };

  const paintFloor = (g, rng) => {
    const { floor, window: win, rug } = ROOM;
    g.fillStyle = INK.paper;
    g.fillRect(floor.x, floor.y, floor.w, floor.h);
    // Luz del ventanal que cae sobre el piso
    const light = [[win.x - 10, floor.y], [win.x + win.w + 10, floor.y], [win.x + win.w + 70, floor.y + 190], [win.x + 40, floor.y + 190]];
    halftoneGradient(g, () => polyPath(g, light), INK.gold,
      (px, py) => 0.42 * (1 - (py - floor.y) / 190), { x: win.x - 10, y: floor.y, w: win.w + 90, h: 190 }, 4);
    // Piso de puntos
    g.fillStyle = withAlpha(INK.navy, 0.22);
    for (let y = floor.y + 14; y < floor.y + floor.h; y += 24) {
      for (let x = floor.x + 12; x < floor.x + floor.w; x += 24) {
        g.beginPath();
        g.arc(x, y, 1.15, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Alfombra redonda con el emblema
    g.save();
    g.beginPath();
    g.ellipse(rug.x, rug.y, rug.rx, rug.ry, 0, 0, Math.PI * 2);
    g.ellipse(rug.x, rug.y, rug.rx - 22, rug.ry - 14, 0, 0, Math.PI * 2);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = halftone(g, INK.coral, 0.62, 3.2);
    g.fill('evenodd');
    g.beginPath();
    g.ellipse(rug.x, rug.y, rug.rx - 22, rug.ry - 14, 0, 0, Math.PI * 2);
    g.fillStyle = halftone(g, INK.teal, 0.14, 3.2);
    g.fill();
    g.restore();
    g.save();
    g.translate(MISREGISTER.x, MISREGISTER.y);
    g.setLineDash([2, 5]);
    g.lineWidth = 1.6;
    g.strokeStyle = INK.navy;
    g.beginPath();
    g.ellipse(rug.x, rug.y, rug.rx + 6, rug.ry + 4, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    // Emblema: la estrella de Ad Astra, aplastada como si estuviera en el piso
    g.save();
    g.translate(rug.x, rug.y);
    g.scale(1, 0.5);
    starPath(g, 0, 0, 44, 11);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = INK.gold;
    g.fill();
    g.restore();
    g.save();
    g.translate(rug.x + MISREGISTER.x, rug.y + MISREGISTER.y);
    g.scale(1, 0.5);
    starPath(g, 0, 0, 44, 11);
    g.lineWidth = 3;
    g.strokeStyle = INK.navy;
    g.stroke();
    g.restore();
    paperGrain(g, rng, floor.x, ROOM.wall.y, floor.w, LOBBY_MAP.height - ROOM.wall.y, 5200);
  };

  const paintBackground = () => {
    background.width = canvas.width;
    background.height = canvas.height;
    const g = background.getContext('2d');
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    paintSpace(g, 0, 0, canvas.clientWidth, canvas.clientHeight, 11, 6);
    worldTransform(g);
    const rng = createRng(5);
    paintFloor(g, rng);
    paintWall(g);
    paintFrame(g);
    paintSky();
  };

  // ---------- El ventanal: cielo que pasa, planeta y la nave acoplada ----------
  const drawPlanet = () => {
    const { planet } = ROOM;
    const ring = (from, to) => {
      ctx.beginPath();
      ctx.ellipse(planet.x, planet.y, planet.r * 1.55, planet.r * 0.24, -0.22, from, to);
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK.gold;
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = INK.navy;
      ctx.stroke();
    };
    ring(Math.PI, Math.PI * 2); // mitad de atrás
    ctx.beginPath();
    ctx.arc(planet.x, planet.y, planet.r, 0, Math.PI * 2);
    ctx.fillStyle = INK.coral;
    ctx.fill();
    // Franjas y sombra en trama
    ctx.save();
    ctx.clip();
    ctx.fillStyle = withAlpha(INK.gold, 0.5);
    for (const [dy, h] of [[-60, 10], [-34, 16], [8, 8]]) ctx.fillRect(planet.x - planet.r, planet.y + dy, planet.r * 2, h);
    ctx.beginPath();
    ctx.arc(planet.x + planet.r * 0.45, planet.y + planet.r * 0.35, planet.r * 1.05, 0, Math.PI * 2);
    ctx.fillStyle = halftone(ctx, INK.navy, 0.55, 3);
    ctx.fill();
    ctx.restore();
    ring(0, Math.PI); // mitad de adelante
  };

  const drawRocket = (time) => {
    const { rocket, window: win } = ROOM;
    const bob = Math.sin(time * 0.8) * 1.5;
    const cx = rocket.x, cy = rocket.y + bob;
    // Brazo de acople desde el techo del ventanal
    ctx.strokeStyle = INK.paper;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const ax of [cx - 18, cx - 2]) { ctx.moveTo(ax, win.y); ctx.lineTo(ax, cy - 16); }
    for (let y = win.y; y < cy - 18; y += 8) { ctx.moveTo(cx - 18, y); ctx.lineTo(cx - 2, y + 8); }
    ctx.stroke();

    // Fuego de los motores: crece durante la cuenta regresiva
    const charge = countdownSeconds ? (COUNTDOWN_SECONDS - countdownSeconds + 1) / COUNTDOWN_SECONDS : 0;
    const flicker = 0.85 + Math.sin(time * 37) * 0.08 + Math.sin(time * 23) * 0.07;
    const flame = (charge > 0 ? 18 + charge * 56 : 0) * flicker;
    const nozzle = cx - 84;
    if (flame > 0) {
      for (const { color, scale } of [{ color: INK.gold, scale: 1 }, { color: INK.coral, scale: 0.7 }, { color: INK.paper, scale: 0.38 }]) {
        ctx.beginPath();
        ctx.moveTo(nozzle, cy - 9 * scale);
        ctx.quadraticCurveTo(nozzle - flame * scale * 0.6, cy - 10 * scale, nozzle - flame * scale, cy);
        ctx.quadraticCurveTo(nozzle - flame * scale * 0.6, cy + 10 * scale, nozzle, cy + 9 * scale);
        ctx.fillStyle = color;
        ctx.fill();
      }
    } else {
      // En espera: soplos de vapor que salen y se deshacen
      for (let i = 0; i < 3; i++) {
        const t = (time * 0.35 + i / 3) % 1;
        ctx.beginPath();
        ctx.arc(nozzle - 6 - t * 34, cy + Math.sin(i * 2.1 + time) * 3, 3 + t * 7, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(INK.paper, 0.45 * (1 - t));
        ctx.fill();
      }
    }

    const body = () => {
      ctx.beginPath();
      ctx.moveTo(cx - 72, cy - 17);
      ctx.lineTo(cx + 40, cy - 17);
      ctx.quadraticCurveTo(cx + 78, cy - 14, cx + 88, cy);
      ctx.quadraticCurveTo(cx + 78, cy + 14, cx + 40, cy + 17);
      ctx.lineTo(cx - 72, cy + 17);
      ctx.closePath();
    };
    const finTop = () => polyPath(ctx, [[cx - 60, cy - 16], [cx - 36, cy - 16], [cx - 70, cy - 40], [cx - 86, cy - 40]]);
    const finBottom = () => polyPath(ctx, [[cx - 60, cy + 16], [cx - 36, cy + 16], [cx - 70, cy + 40], [cx - 86, cy + 40]]);
    const nose = () => {
      ctx.beginPath();
      ctx.moveTo(cx + 46, cy - 16.5);
      ctx.quadraticCurveTo(cx + 78, cy - 14, cx + 88, cy);
      ctx.quadraticCurveTo(cx + 78, cy + 14, cx + 46, cy + 16.5);
      ctx.closePath();
    };
    for (const fin of [finTop, finBottom]) { paperFill(ctx, fin, INK.gold); keyLine(ctx, fin, 1.6); }
    ctx.fillStyle = INK.navy;
    ctx.fillRect(nozzle, cy - 10, 12, 20);
    paperFill(ctx, body);
    ctx.save(); // sombra en trama en la mitad de abajo del casco
    body();
    ctx.clip();
    inkFill(ctx, rect(cx - 80, cy + 3, 180, 20), halftone(ctx, INK.navy, 0.3, 2.6));
    ctx.restore();
    inkFill(ctx, nose, INK.coral);
    inkFill(ctx, rect(cx - 50, cy - 17, 7, 34), INK.coral);
    for (const px of [cx - 26, cx - 2, cx + 22]) {
      ctx.beginPath();
      ctx.arc(px, cy - 2, 6, 0, Math.PI * 2);
      ctx.fillStyle = INK.teal;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK.navy;
      ctx.stroke();
      ctx.fillStyle = withAlpha(INK.paper, 0.8);
      ctx.fillRect(px - 3, cy - 6, 2, 2);
    }
    keyLine(ctx, body, 1.8);
    keyLine(ctx, nose, 1.4);
  };

  const drawWindow = (time) => {
    const { window: win, mullions } = ROOM;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(win.x, win.y, win.w, win.h, win.radius);
    ctx.clip();
    const offset = (time * SKY.speed) % SKY.width;
    for (let x = win.x - offset; x < win.x + win.w; x += SKY.width) ctx.drawImage(sky, x, win.y - 8, SKY.width, SKY.height);
    drawPlanet();
    drawRocket(time);
    // Reflejos del vidrio
    ctx.fillStyle = withAlpha(INK.paper, 0.07);
    for (const [x, w] of [[win.x + 40, 26], [win.x + 76, 8], [win.x + 250, 18]]) {
      polyPath(ctx, [[x, win.y], [x + w, win.y], [x + w - 60, win.y + win.h], [x - 60, win.y + win.h]]);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = INK.navy;
    for (const mx of mullions) ctx.fillRect(mx - 3, win.y, 6, win.h);
  };

  // ---------- Tablero de salidas (casillas que giran como en un aeropuerto) ----------
  const BOARD_ROWS = [{ label: 'Puerta' }, { label: 'Tripulación' }, { label: 'Estado' }];
  const boardRowY = (i) => ROOM.board.y + 30 + i * 30;
  const flaps = BOARD_ROWS.map(() => Array.from({ length: FLAP_CELLS }, () => ({ char: ' ', target: ' ', nextAt: 0 })));

  const boardTexts = () => {
    const { room } = session;
    let status = 'LISTOS';
    if (room.players.some((p) => !p.role)) status = 'ELIGE ROL';
    else if (startBlocker(room)) status = 'ESPERANDO';
    if (countdownSeconds) status = `DESPEGA ${countdownSeconds}`;
    else if (room.phase === 'playing') status = 'EN VUELO';
    return [hud.isCodeHidden() ? '····' : room.code, `${room.players.length} DE ${room.maxPlayers}`, status];
  };

  /** Siguiente letra hacia la buscada; si falta mucho, salta para no tardar. */
  const nextFlapChar = (char, target) => {
    const from = Math.max(0, FLAP_CHARS.indexOf(char)), to = Math.max(0, FLAP_CHARS.indexOf(target));
    const distance = (to - from + FLAP_CHARS.length) % FLAP_CHARS.length;
    const step = distance > 7 ? distance - 6 : 1;
    return FLAP_CHARS[(from + step) % FLAP_CHARS.length];
  };

  const drawBoard = (now) => {
    const { board } = ROOM;
    const texts = boardTexts();
    const cellW = 13.6, cellH = 22, startX = board.x + 76;
    flaps.forEach((row, r) => {
      const value = texts[r].toUpperCase().padEnd(FLAP_CELLS).slice(0, FLAP_CELLS);
      row.forEach((cell, i) => {
        cell.target = FLAP_CHARS.includes(value[i]) ? value[i] : ' ';
        if (cell.char !== cell.target && now >= cell.nextAt) {
          cell.char = nextFlapChar(cell.char, cell.target);
          cell.nextAt = now + FLAP_STEP_MS + i * 4;
        }
        const x = startX + i * (cellW + 1), y = boardRowY(r);
        const turning = cell.char !== cell.target;
        ctx.fillStyle = '#121a3a';
        ctx.fillRect(x, y, cellW, cellH);
        ctx.fillStyle = '#1b2650';
        ctx.fillRect(x, y, cellW, cellH / 2);
        text(ctx, cell.char, x + cellW / 2, y + cellH / 2 + 1, {
          size: 16, weight: 700, color: turning ? withAlpha(INK.paper, 0.6) : INK.paper, align: 'center',
        });
        ctx.fillStyle = turning ? INK.gold : 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(x, y + cellH / 2 - 0.5, cellW, 1);
      });
    });
    // Luz de estado: verde-turquesa esperando, dorada parpadeando en la cuenta regresiva
    const blink = countdownSeconds ? Math.floor(now / 250) % 2 === 0 : true;
    ctx.beginPath();
    ctx.arc(board.x + 60, board.y + 12, 3, 0, Math.PI * 2);
    ctx.fillStyle = countdownSeconds ? (blink ? INK.gold : '#121a3a') : INK.teal;
    ctx.fill();
  };

  const drawSign = () => {
    const { sign } = ROOM;
    ctx.beginPath();
    ctx.roundRect(sign.x, sign.y, sign.w, sign.h, 4);
    ctx.fillStyle = nearStation ? INK.gold : INK.navy;
    ctx.fill();
    text(ctx, 'Personalizar', sign.x + sign.w / 2, sign.y + sign.h / 2 + 1, {
      size: 13, weight: 700, color: nearStation ? INK.navy : INK.paper, align: 'center',
    });
  };

  // ---------- Muebles ----------
  const floorShadow = (x, y, w) => {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.ellipse(x + w / 2 + 6, y, w / 2 + 14, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = halftone(ctx, INK.navy, 0.42, 3);
    ctx.fill();
    ctx.restore();
  };

  /** Pinta tapa y frente de un mueble con sus tintas, más el contorno azul. */
  const block = (c, { top, front, frontShade = 0.22 }) => {
    const f = faces(c);
    const topPath = rect(f.top.x, f.top.y, f.top.w, f.top.h, 3);
    const frontPath = rect(f.front.x, f.front.y, f.front.w, f.front.h, 3);
    paperFill(ctx, topPath);
    paperFill(ctx, frontPath);
    if (top) inkFill(ctx, topPath, top);
    if (front) inkFill(ctx, frontPath, front);
    if (frontShade) inkFill(ctx, frontPath, halftone(ctx, INK.navy, frontShade, 3));
    return { f, topPath, frontPath };
  };

  const outline = (...paths) => paths.forEach((p) => keyLine(ctx, p, 2));

  const FURNITURE = {
    /** El vestidor: un espejo y los sombreros colgados. Junto a él se personaliza. */
    locker: (c, now) => {
      const { f, topPath, frontPath } = block(c, { top: halftone(ctx, INK.teal, 0.55, 3), front: INK.teal, frontShade: 0 });
      const { x, y, w, h } = f.front;
      const half = w / 2;
      // Espejo (puerta izquierda)
      const mirror = rect(x + 8, y + 10, half - 16, h - 34, 3);
      paperFill(ctx, mirror);
      inkFill(ctx, mirror, halftone(ctx, INK.teal, 0.2, 2.6));
      ctx.strokeStyle = INK.paper;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 14, y + 40); ctx.lineTo(x + 30, y + 22);
      ctx.moveTo(x + 14, y + 56); ctx.lineTo(x + 40, y + 28);
      ctx.stroke();
      // Compartimiento abierto con los sombreros (derecha)
      const nook = rect(x + half + 4, y + 6, half - 10, h - 14, 3);
      inkFill(ctx, nook, INK.navy);
      ctx.fillStyle = INK.gold;
      ctx.fillRect(x + half + 6, y + 16, half - 14, 2);
      const hx = x + half + 4, hy = y + 20;
      polyPath(ctx, [[hx + 6, hy + 14], [hx + 6, hy + 4], [hx + 10, hy + 9], [hx + 13, hy + 2], [hx + 16, hy + 9], [hx + 20, hy + 4], [hx + 20, hy + 14]]);
      ctx.fillStyle = INK.gold; ctx.fill();
      polyPath(ctx, [[hx + 26, hy + 14], [hx + 24, hy + 2], [hx + 31, hy + 12]]);
      ctx.fillStyle = INK.coral; ctx.fill();
      polyPath(ctx, [[hx + 42, hy + 14], [hx + 44, hy + 2], [hx + 37, hy + 12]]);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx + 18, hy + 40, 6, 3, -0.6, 0, Math.PI * 2);
      ctx.ellipse(hx + 28, hy + 40, 6, 3, 0.6, 0, Math.PI * 2);
      ctx.fillStyle = INK.teal; ctx.fill();
      ctx.fillStyle = INK.paper;
      ctx.fillRect(hx + 22.5, hy + 40, 1.5, 10);
      // Tirador y bisagras
      ctx.fillStyle = INK.coral;
      ctx.fillRect(x + half - 6, y + h / 2, 3, 12);
      outline(topPath, frontPath, rect(x + half, y, 0.1, h));
      if (nearStation) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -now / 40;
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK.gold;
        ctx.beginPath();
        ctx.roundRect(f.top.x - 6, f.top.y - 6, f.top.w + 12, f.top.h + f.front.h + 12, 8);
        ctx.stroke();
        ctx.restore();
      }
    },

    vending: (c) => {
      const { f, topPath, frontPath } = block(c, { top: halftone(ctx, INK.coral, 0.5, 3), front: INK.coral, frontShade: 0.12 });
      const { x, y, w, h } = f.front;
      text(ctx, 'Café', x + w / 2, y + 9, { size: 11, weight: 700, color: INK.paper, align: 'center' });
      const glass = rect(x + 6, y + 18, w - 22, h - 46, 3);
      paperFill(ctx, glass, INK.navy);
      const goods = [INK.gold, INK.teal, INK.paper, INK.coral];
      for (let r = 0; r < 4; r++) {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = goods[(r + i) % goods.length];
          ctx.fillRect(x + 10 + i * 10, y + 26 + r * 17, 7, 9);
        }
        ctx.fillStyle = withAlpha(INK.paper, 0.4);
        ctx.fillRect(x + 8, y + 36 + r * 17, w - 26, 1);
      }
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + w - 8, y + 26 + i * 9, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = INK.gold;
        ctx.fill();
      }
      ctx.fillStyle = INK.navy;
      ctx.fillRect(x + 10, y + h - 20, w - 26, 10);
      outline(topPath, frontPath, glass);
    },

    luggage: (c) => {
      const { f, topPath, frontPath } = block(c, { top: halftone(ctx, INK.gold, 0.7, 3), front: INK.gold, frontShade: 0.18 });
      const { x, y, w, h } = f.front;
      ctx.fillStyle = INK.navy;
      for (const sx of [x + 16, x + w - 18]) ctx.fillRect(sx, y, 3, h);
      // Calcomanías de viaje
      ctx.beginPath();
      ctx.arc(x + 30, y + 22, 8, 0, Math.PI * 2);
      ctx.fillStyle = INK.teal;
      ctx.fill();
      starPath(ctx, x + 30, y + 22, 6, 1.8);
      ctx.fillStyle = INK.paper;
      ctx.fill();
      ctx.save();
      ctx.translate(x + 48, y + 14);
      ctx.rotate(0.12);
      ctx.fillStyle = INK.coral;
      ctx.fillRect(0, 0, 14, 10);
      ctx.restore();
      outline(topPath, frontPath);
      // Maletín chico encima
      const small = { x: c.x + 10, y: f.top.y + 8, w: 40, h: 14, height: 22 };
      const s = block(small, { top: halftone(ctx, INK.teal, 0.6, 3), front: INK.teal, frontShade: 0.15 });
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK.navy;
      ctx.beginPath();
      ctx.arc(small.x + small.w / 2, s.f.top.y + 4, 6, Math.PI, 0);
      ctx.stroke();
      outline(s.topPath, s.frontPath);
    },

    plant: (c) => {
      const cx = c.x + c.w / 2, rimY = c.y + c.h - c.height;
      const rng = createRng(7);
      for (let i = 0; i < 9; i++) {
        const angle = -Math.PI / 2 + (i / 8 - 0.5) * 2.4 + (rng() - 0.5) * 0.2;
        const length = 44 + rng() * 34;
        const leaf = () => {
          ctx.save();
          ctx.translate(cx, rimY + 2);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(length * 0.5, -11, length, 0);
          ctx.quadraticCurveTo(length * 0.5, 11, 0, 0);
          ctx.restore();
        };
        paperFill(ctx, leaf);
        inkFill(ctx, leaf, INK.teal, 0.9);
        if (i % 2) inkFill(ctx, leaf, halftone(ctx, INK.navy, 0.3, 2.6));
        keyLine(ctx, leaf, 1.5);
      }
      const pot = () => {
        ctx.beginPath();
        ctx.moveTo(c.x + 2, rimY);
        ctx.lineTo(c.x + c.w - 2, rimY);
        ctx.lineTo(c.x + c.w - 7, c.y + c.h);
        ctx.lineTo(c.x + 7, c.y + c.h);
        ctx.closePath();
      };
      paperFill(ctx, pot);
      inkFill(ctx, pot, INK.gold);
      inkFill(ctx, () => { pot(); }, halftone(ctx, INK.navy, 0.25, 3));
      ctx.beginPath();
      ctx.ellipse(cx, rimY, c.w / 2 - 1, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = INK.navy;
      ctx.fill();
      keyLine(ctx, pot, 2);
    },

    /** Fila de asientos mirando al ventanal: se ve el respaldo. */
    bench: (c) => {
      const f = faces(c);
      const seats = 3, gap = 6, seatW = (c.w - gap * (seats - 1)) / seats;
      for (let i = 0; i < seats; i++) {
        const cushion = rect(f.top.x + i * (seatW + gap), f.top.y, seatW, f.top.h, 5);
        paperFill(ctx, cushion);
        inkFill(ctx, cushion, INK.coral);
        inkFill(ctx, cushion, halftone(ctx, INK.gold, 0.35, 3));
        keyLine(ctx, cushion, 1.8);
      }
      const back = rect(f.front.x, f.front.y, f.front.w, f.front.h, 5);
      paperFill(ctx, back);
      inkFill(ctx, back, INK.navy);
      ctx.fillStyle = INK.coral;
      ctx.fillRect(f.front.x + 4, f.front.y + 4, f.front.w - 8, 4);
      ctx.fillStyle = withAlpha(INK.paper, 0.25);
      for (let i = 1; i < seats; i++) ctx.fillRect(f.front.x + i * (seatW + gap) - gap / 2 - 1, f.front.y + 12, 2, f.front.h - 18);
      keyLine(ctx, back, 2);
    },
  };

  const drawFurniture = (c, now) => {
    floorShadow(c.x, c.y + c.h - 2, c.w);
    FURNITURE[c.kind]?.(c, now);
  };

  // ---------- Astronautas ----------
  const drawActor = (actor, now) => {
    const player = session.room.players.find((p) => p.id === actor.id);
    if (!player) return;
    // Aparición: crece con un pequeño rebote (t va de 0 a 1 en 350 ms).
    const t = Math.min(1, Math.max(0, (now - actor.spawnedAt) / 350));
    const pop = Math.max(0.01, 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2));

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.ellipse(actor.x, actor.y, 24 * pop, 7 * pop, 0, 0, Math.PI * 2);
    ctx.fillStyle = halftone(ctx, INK.navy, 0.55, 2.6);
    ctx.fill();
    ctx.restore();

    const frame = actor.moving ? Math.floor(actor.walkTime * WALK_FPS) % FRAME_COUNT : IDLE_FRAME;
    drawAstronaut(ctx, {
      x: actor.x, y: actor.y, color: player.color, hat: player.hat,
      facing: actor.facing, frame, scale: SPRITE_SCALE * pop,
    });
  };

  const drawLabels = (actor, now) => {
    const player = session.room.players.find((p) => p.id === actor.id);
    if (!player) return;
    const isHostPlayer = player.id === session.room.hostId;
    const name = isHostPlayer ? `★ ${player.name}` : player.name;
    // Con rol, el nombre sube un renglón y debajo va el rol (con ✓ si ya marcó Listo).
    const top = actor.y - 170 * SPRITE_SCALE - (player.role ? 31 : 16);

    ctx.font = `700 16px ${UI_FONT}`;
    condensed(ctx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(name).width + 14;
    if (player.id === session.myId) {
      // Tu nombre va en una etiqueta dorada (como la de una maleta).
      ctx.beginPath();
      ctx.roundRect(actor.x - width / 2, top - 10, width, 20, 10);
      ctx.fillStyle = INK.gold;
      ctx.fill();
      keyLine(ctx, () => { ctx.beginPath(); ctx.roundRect(actor.x - width / 2, top - 10, width, 20, 10); }, 1.5);
    } else {
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = withAlpha(INK.paper, 0.9);
      ctx.strokeText(name, actor.x, top + 1);
    }
    ctx.fillStyle = INK.navy;
    ctx.fillText(name, actor.x, top + 1);

    if (player.role) {
      const isReady = player.ready || isHostPlayer;
      const tag = `${roleName(player.role)}${isReady ? ' ✓' : ''}`.toUpperCase();
      ctx.font = `700 11px ${UI_FONT}`;
      const tagWidth = ctx.measureText(tag).width + 12;
      ctx.beginPath();
      ctx.roundRect(actor.x - tagWidth / 2, top + 12, tagWidth, 15, 4);
      ctx.fillStyle = isReady ? INK.teal : INK.paper;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK.navy;
      ctx.stroke();
      ctx.fillStyle = INK.navy;
      ctx.fillText(tag, actor.x, top + 20);
      ctx.font = `700 16px ${UI_FONT}`;
    }

    if (actor.bubble && now < actor.bubble.until) {
      ctx.font = `600 15px ${UI_FONT}`;
      const message = ellipsize(actor.bubble.text, 30);
      const w = ctx.measureText(message).width + 20;
      const bx = actor.x - w / 2, by = top - 44;
      const bubble = () => {
        ctx.beginPath();
        ctx.roundRect(bx, by, w, 26, 8);
        ctx.moveTo(actor.x - 6, by + 26);
        ctx.lineTo(actor.x, by + 33);
        ctx.lineTo(actor.x + 6, by + 26);
      };
      ctx.save();
      ctx.translate(2.5, 2.5);
      inkFill(ctx, bubble, INK.coral);
      ctx.restore();
      paperFill(ctx, bubble);
      keyLine(ctx, bubble, 1.6);
      ctx.fillStyle = INK.navy;
      ctx.fillText(message, actor.x, by + 14);
    }
    condensed(ctx, false);
  };

  const render = (now) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background, 0, 0);

    const time = now / 1000;
    worldTransform();
    ctx.lineJoin = 'round';
    drawWindow(time);
    drawBoard(now);
    drawSign();

    // Muebles y jugadores ordenados por profundidad (lo de más abajo se dibuja encima).
    const drawables = [
      ...LOBBY_MAP.crates.map((c) => ({ depth: c.y + c.h, draw: () => drawFurniture(c, now) })),
      ...[...actors.values()].map((actor) => ({ depth: actor.y, draw: () => drawActor(actor, now) })),
    ].sort((a, b) => a.depth - b.depth);
    drawables.forEach((item) => item.draw());
    for (const actor of actors.values()) drawLabels(actor, now);
  };

  const loop = (now) => {
    // Se programa el siguiente cuadro primero: si algo falla, la nave no se congela.
    frameId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    updateMe(dt);
    updateOthers(dt);
    render(now);
  };

  // ---------- Entrada ----------
  const onKeyDown = (event) => {
    if (isTyping() || hud.isBlocking()) return;
    if (KEY_DIRECTIONS[event.code]) {
      pressed.add(event.code);
      event.preventDefault();
    } else if (event.code === 'KeyE' && nearStation) {
      hud.openCustomize();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      hud.openChat();
    }
  };
  const onKeyUp = (event) => pressed.delete(event.code);
  const onBlur = () => pressed.clear();

  const onPointerDown = (event) => {
    if (hud.isBlocking()) return;
    const point = toWorld(event.clientX, event.clientY);
    // Clic en el vestidor o en su placa: camina hasta ahí.
    const locker = LOBBY_MAP.crates.find((c) => c.id === 'customize');
    const onStation = point.x > locker.x && point.x < locker.x + locker.w && point.y > ROOM.sign.y && point.y < locker.y + locker.h;
    if (onStation) {
      if (nearStation) hud.openCustomize();
      else { moveTarget = { ...LOBBY_MAP.station }; openCustomizeOnArrival = true; }
      return;
    }
    const { floor } = LOBBY_MAP;
    if (point.x >= floor.x && point.x <= floor.x + floor.w && point.y >= floor.y && point.y <= floor.y + floor.h) {
      moveTarget = clampToFloor(point.x, point.y);
      openCustomizeOnArrival = false;
    }
  };

  // ---------- Arranque ----------
  syncActors(true);
  const meActor = actors.get(session.myId);
  if (meActor) {
    meActor.spawnedAt = performance.now();
    lastSent = { at: 0, x: meActor.x, y: meActor.y, moving: false };
    sounds.pop();
  }

  const offs = [
    on('room', () => syncActors(false)),
    on('moved', (move) => {
      const actor = actors.get(move.id);
      if (!actor) return;
      Object.assign(actor, { tx: move.x, ty: move.y, facing: move.facing, moving: move.moving, lastMoveAt: performance.now() });
    }),
    on('countdown', ({ seconds }) => { countdownSeconds = seconds ?? null; }),
    on('chat-line', (line) => {
      const actor = line.playerId && actors.get(line.playerId);
      if (actor) actor.bubble = { text: line.text, until: performance.now() + BUBBLE_MS };
    }),
  ];

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  frameId = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    offs.forEach((off) => off());
    hud.destroy();
  };
};
