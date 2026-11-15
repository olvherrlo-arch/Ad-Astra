/**
 * DIBUJO DEL MUNDO
 * Pinta los mapas de js/worldmaps.js con las tintas del juego (js/riso.js): los cuartos y paredes se
 * pintan una sola vez (paintMap); los puestos, las rocas y lo que cargan los tripulantes se dibujan
 * en cada cuadro, ordenados por profundidad junto con los astronautas (js/world.js).
 *
 * Todo lo que cambia se dibuja a partir del estado real de la partida (`state` de cada puesto): el
 * cohete de la plataforma crece con las etapas armadas, la palanca se enciende cuando están las
 * tareas, el estante se llena con las cajas entregadas. Nunca se dibuja algo que no pasó.
 */
import {
  INK, MISREGISTER, UI_FONT, DISPLAY_FONT, condensed, createRng, halftone, halftoneGradient, inkFill, keyLine,
  paperFill, paperGrain, polyPath, starPath, withAlpha,
} from './riso.js';

/** La tinta de cada rol: tiñe su cuarto y sus puestos. */
export const ROLE_INK = { scientist: INK.teal, merchant: INK.gold, engineer: INK.coral, pilot: '#5b74c9' };
const MOON_GROUND = '#d9d2bf';

const rectPath = (ctx, x, y, w, h, r = 0) => () => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};
const circlePath = (ctx, x, y, r) => () => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
};

export const label = (ctx, value, x, y, { size = 12, weight = 700, color = INK.navy, align = 'center', font = UI_FONT, narrow = true } = {}) => {
  ctx.font = `${weight} ${size}px ${font}`;
  condensed(ctx, narrow);
  ctx.textAlign = /** @type {CanvasTextAlign} */ (align);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  condensed(ctx, false);
};

// ============================================================
//  Fondo fijo
// ============================================================

const paintStars = (g, w, h, seed, count) => {
  const rng = createRng(seed);
  g.fillStyle = INK.space;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const size = rng() < 0.9 ? 1 + rng() * 1.4 : 2.6;
    g.fillStyle = withAlpha(INK.paper, 0.35 + rng() * 0.6);
    g.fillRect(rng() * w, rng() * h, size, size);
  }
  for (let i = 0; i < count / 30; i++) {
    starPath(g, rng() * w, rng() * h, 4 + rng() * 5);
    g.fillStyle = INK.gold;
    g.fill();
  }
};

const paintRoom = (g, map, room) => {
  const wall = room.plain ? 0 : map.wall;
  const floor = { x: room.x, y: room.y + wall, w: room.w, h: room.h - wall };
  const ink = ROLE_INK[room.role];
  // Piso de papel, teñido con la tinta del rol, y la trama de puntos del lobby.
  g.fillStyle = INK.paper;
  g.fillRect(floor.x, floor.y, floor.w, floor.h);
  if (ink) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = halftone(g, ink, 0.16, 4);
    g.fillRect(floor.x, floor.y, floor.w, floor.h);
    g.restore();
  }
  g.fillStyle = withAlpha(INK.navy, 0.2);
  for (let y = floor.y + 14; y < floor.y + floor.h; y += 24) {
    for (let x = floor.x + 12; x < floor.x + floor.w; x += 24) {
      g.beginPath();
      g.arc(x, y, 1.1, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (room.name) {
    label(g, room.name.toUpperCase(), floor.x + floor.w / 2, floor.y + floor.h - 34, { size: 40, weight: 400, font: DISPLAY_FONT, color: withAlpha(INK.navy, 0.13), narrow: false });
  }
  if (!wall) return;
  // Pared del fondo: paneles, zócalo con la tinta del rol y filete dorado.
  g.fillStyle = INK.wall;
  g.fillRect(room.x, room.y, room.w, wall);
  g.strokeStyle = withAlpha(INK.navy, 0.14);
  g.lineWidth = 1.4;
  for (let x = room.x + 48; x < room.x + room.w; x += 96) {
    g.beginPath();
    g.moveTo(x, room.y);
    g.lineTo(x, room.y + wall - 18);
    g.stroke();
  }
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = ink ?? INK.teal;
  g.fillRect(room.x, room.y + wall - 18, room.w, 18);
  g.fillStyle = halftone(g, INK.navy, 0.22, 3);
  g.fillRect(room.x, room.y + wall - 18, room.w, 18);
  g.restore();
  g.fillStyle = INK.gold;
  g.fillRect(room.x, room.y + wall - 20, room.w, 3);
  // Sombra de la pared sobre el piso
  halftoneGradient(g, () => { g.beginPath(); g.rect(floor.x, floor.y, floor.w, 26); }, INK.navy,
    (_px, py) => 0.32 * (1 - (py - floor.y) / 26), { x: floor.x, y: floor.y, w: floor.w, h: 26 }, 3.6);
};

const paintDoor = (g, door) => {
  g.fillStyle = INK.paper;
  g.fillRect(door.x, door.y, door.w, door.h);
  // Franjas doradas en el umbral y los marcos de la puerta.
  g.fillStyle = INK.gold;
  const vertical = door.h >= door.w;
  if (vertical) {
    for (let y = door.y + 6; y < door.y + door.h - 6; y += 16) g.fillRect(door.x + 8, y, door.w - 16, 5);
    g.fillStyle = INK.navy;
    g.fillRect(door.x - 4, door.y, 4, door.h);
    g.fillRect(door.x + door.w, door.y, 4, door.h);
  } else {
    for (let x = door.x + 6; x < door.x + door.w - 6; x += 16) g.fillRect(x, door.y + 8, 5, door.h - 16);
    g.fillStyle = INK.navy;
    g.fillRect(door.x, door.y - 4, door.w, 4);
    g.fillRect(door.x, door.y + door.h, door.w, 4);
  }
};

const paintIndoor = (g, map) => {
  paintStars(g, map.width, map.height, 21, 520);
  // El casco: una placa coral en trama detrás de todos los cuartos.
  const minX = Math.min(...map.rooms.map((r) => r.x)) - 18, minY = Math.min(...map.rooms.map((r) => r.y)) - 18;
  const maxX = Math.max(...map.rooms.map((r) => r.x + r.w)) + 18, maxY = Math.max(...map.rooms.map((r) => r.y + r.h)) + 18;
  const hull = rectPath(g, minX, minY, maxX - minX, maxY - minY, 26);
  paperFill(g, hull);
  inkFill(g, hull, halftone(g, INK.coral, 0.7, 3));
  keyLine(g, hull, 3);
  for (const room of map.rooms) paintRoom(g, map, room);
  for (const room of map.rooms) {
    g.lineWidth = 3;
    g.strokeStyle = INK.navy;
    g.strokeRect(room.x, room.y, room.w, room.h);
  }
  for (const door of map.doors) paintDoor(g, door);
  if (map.id === 'ship') {
    // Toberas a la izquierda y la nariz a la derecha: es una nave.
    for (const y of [190, 320, 450]) {
      polyPath(g, [[minX, y - 34], [minX - 46, y - 50], [minX - 46, y + 50], [minX, y + 34]]);
      g.fillStyle = INK.navy;
      g.fill();
    }
    g.beginPath();
    g.moveTo(maxX, minY + 30);
    g.quadraticCurveTo(maxX + 110, map.height / 2, maxX, maxY - 30);
    g.closePath();
    g.fillStyle = INK.paper;
    g.fill();
    inkFill(g, () => { g.beginPath(); g.moveTo(maxX, minY + 30); g.quadraticCurveTo(maxX + 110, map.height / 2, maxX, maxY - 30); g.closePath(); }, INK.coral);
    g.lineWidth = 3;
    g.strokeStyle = INK.navy;
    g.stroke();
  }
  paperGrain(g, createRng(5), minX, minY, maxX - minX, maxY - minY, 6000);
};

const paintMoon = (g, map) => {
  const rng = createRng(77);
  // Cielo negro con la Tierra NO a la vista: es la cara oculta.
  paintStars(g, map.width, map.height, 33, 420);
  const horizon = 130;
  g.fillStyle = MOON_GROUND;
  g.beginPath();
  g.moveTo(0, horizon + 18);
  for (let x = 0; x <= map.width; x += 60) g.lineTo(x, horizon + Math.sin(x * 0.011) * 10 + Math.sin(x * 0.047) * 5);
  g.lineTo(map.width, map.height);
  g.lineTo(0, map.height);
  g.closePath();
  g.fill();
  // Sombra larga en trama: el Sol está bajo.
  halftoneGradient(g, () => { g.beginPath(); g.rect(0, horizon, map.width, map.height - horizon); }, INK.navy,
    (px, py) => 0.1 + 0.22 * (py / map.height) * (0.6 + 0.4 * Math.sin(px * 0.004)), { x: 0, y: horizon, w: map.width, h: map.height - horizon }, 7);
  // Cráteres: una elipse hundida con el borde iluminado.
  for (let i = 0; i < 46; i++) {
    const x = 60 + rng() * (map.width - 120), y = horizon + 60 + rng() * (map.height - horizon - 90), r = 14 + rng() * 46;
    const crater = () => { g.beginPath(); g.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2); };
    inkFill(g, crater, halftone(g, INK.navy, 0.34, 3.2));
    g.beginPath();
    g.ellipse(x, y + 2, r, r * 0.42, 0, Math.PI * 0.05, Math.PI * 0.95);
    g.lineWidth = 2.2;
    g.strokeStyle = withAlpha(INK.paper, 0.9);
    g.stroke();
    g.beginPath();
    g.ellipse(x, y, r, r * 0.42, 0, Math.PI, Math.PI * 2);
    g.lineWidth = 1.6;
    g.strokeStyle = withAlpha(INK.navy, 0.55);
    g.stroke();
  }
  // Piedritas
  g.fillStyle = withAlpha(INK.navy, 0.35);
  for (let i = 0; i < 260; i++) g.fillRect(rng() * map.width, horizon + 30 + rng() * (map.height - horizon - 30), 2 + rng() * 3, 1.5 + rng() * 2);
  paperGrain(g, rng, 0, horizon, map.width, map.height - horizon, 7000);
};

/** Pinta el fondo fijo de un mapa (en unidades de mundo; quien llama ya puso la escala). */
export const paintMap = (g, map) => {
  g.lineJoin = 'round';
  if (map.outdoor) paintMoon(g, map);
  else paintIndoor(g, map);
};

// ============================================================
//  Puestos (se dibujan en cada cuadro)
// ============================================================

/** Sombra en el piso, tapa y frente de un mueble. Devuelve los rectángulos de cada cara. */
const box = (ctx, s, { top = null, front = null, shade = 0.2, radius = 3 } = {}) => {
  const t = { x: s.x, y: s.y - s.height, w: s.w, h: s.h };
  const f = { x: s.x, y: s.y + s.h - s.height, w: s.w, h: s.height };
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.beginPath();
  ctx.ellipse(s.x + s.w / 2 + 6, s.y + s.h - 2, s.w / 2 + 12, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = halftone(ctx, INK.navy, 0.4, 3);
  ctx.fill();
  ctx.restore();
  const topPath = rectPath(ctx, t.x, t.y, t.w, t.h, radius);
  const frontPath = rectPath(ctx, f.x, f.y, f.w, f.h, radius);
  paperFill(ctx, topPath);
  paperFill(ctx, frontPath);
  if (top) inkFill(ctx, topPath, top);
  if (front) inkFill(ctx, frontPath, front);
  if (shade) inkFill(ctx, frontPath, halftone(ctx, INK.navy, shade, 3));
  keyLine(ctx, topPath, 2);
  keyLine(ctx, frontPath, 2);
  return { t, f };
};

const screen = (ctx, x, y, w, h, lines = 3, color = INK.teal) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fillStyle = INK.navy;
  ctx.fill();
  ctx.fillStyle = color;
  for (let i = 0; i < lines; i++) ctx.fillRect(x + 5, y + 6 + i * 7, (w - 10) * (0.9 - i * 0.22), 2.5);
};

const lights = (ctx, x, y, count, time, colors = [INK.gold, INK.teal, INK.coral]) => {
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.arc(x + i * 9, y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = Math.sin(time * 3 + i * 1.7) > -0.2 ? colors[i % colors.length] : INK.navy;
    ctx.fill();
  }
};

const crate = (ctx, x, y, w = 34, h = 24, ink = INK.gold) => {
  const path = rectPath(ctx, x, y, w, h, 2);
  paperFill(ctx, path);
  inkFill(ctx, path, ink);
  inkFill(ctx, path, halftone(ctx, INK.navy, 0.18, 3));
  keyLine(ctx, path, 1.6);
  ctx.fillStyle = INK.navy;
  ctx.fillRect(x + 5, y + h / 2 - 1, w - 10, 2);
};

/** El cohete de la plataforma: una pieza por cada etapa armada de verdad (js/assembly.js). */
const drawPadRocket = (ctx, cx, baseY, rocket, time, launching) => {
  const stages = (rocket?.stages ?? []).map((stage) => stage.engines.length + stage.core.length + stage.mounted.length);
  const built = stages.filter((count) => count > 0);
  // Torre de servicio
  ctx.strokeStyle = INK.navy;
  ctx.lineWidth = 2;
  const towerX = cx + 62, towerTop = baseY - 250;
  ctx.beginPath();
  for (const x of [towerX, towerX + 22]) { ctx.moveTo(x, baseY); ctx.lineTo(x, towerTop); }
  for (let y = baseY; y > towerTop + 6; y -= 22) { ctx.moveTo(towerX, y); ctx.lineTo(towerX + 22, y - 22); }
  ctx.stroke();
  if (built.length === 0) {
    label(ctx, 'Plataforma vacía', cx, baseY - 30, { size: 11, color: withAlpha(INK.navy, 0.7) });
    return;
  }
  let y = baseY;
  built.forEach((count, index) => {
    const isTop = index === built.length - 1;
    const width = Math.max(26, 54 - index * 7);
    const height = Math.min(64, 26 + count * 5);
    const x = cx - width / 2;
    const body = rectPath(ctx, x, y - height, width, height, 3);
    paperFill(ctx, body);
    if (index % 2 === 1) inkFill(ctx, body, halftone(ctx, INK.teal, 0.5, 3));
    inkFill(ctx, rectPath(ctx, x, y - 9, width, 7), INK.coral);
    inkFill(ctx, rectPath(ctx, x + width * 0.55, y - height, width * 0.45, height), halftone(ctx, INK.navy, 0.26, 2.8));
    keyLine(ctx, body, 1.8);
    // Brazo de la torre hasta la etapa
    ctx.fillStyle = INK.navy;
    ctx.fillRect(cx + width / 2, y - height / 2, towerX - cx - width / 2, 3);
    if (index === 0) {
      // Aletas y toberas
      for (const side of [-1, 1]) {
        polyPath(ctx, [[cx + side * width / 2, y - 26], [cx + side * (width / 2 + 16), y], [cx + side * width / 2, y]]);
        ctx.fillStyle = INK.gold;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = INK.navy;
        ctx.stroke();
      }
    }
    if (isTop) {
      const nose = () => { ctx.beginPath(); ctx.moveTo(x, y - height); ctx.quadraticCurveTo(cx, y - height - 46, x + width, y - height); ctx.closePath(); };
      paperFill(ctx, nose);
      inkFill(ctx, nose, INK.coral);
      keyLine(ctx, nose, 1.8);
      ctx.beginPath();
      ctx.arc(cx, y - height + 14, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = INK.teal;
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = INK.navy;
      ctx.stroke();
    }
    y -= height;
  });
  if (launching) {
    const flicker = 0.8 + Math.sin(time * 40) * 0.2;
    for (const { color, scale } of [{ color: INK.gold, scale: 1 }, { color: INK.coral, scale: 0.65 }, { color: INK.paper, scale: 0.35 }]) {
      ctx.beginPath();
      ctx.moveTo(cx - 16 * scale, baseY);
      ctx.quadraticCurveTo(cx, baseY + 70 * scale * flicker, cx + 16 * scale, baseY);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
};

const PAINTERS = {
  console: (ctx, s, { time, ink }) => {
    const { f, t } = box(ctx, s, { top: halftone(ctx, ink, 0.5, 3), front: ink, shade: 0.16 });
    screen(ctx, f.x + 10, f.y + 10, f.w - 20, 30);
    lights(ctx, f.x + 14, f.y + 52, Math.floor((f.w - 20) / 9), time);
    ctx.fillStyle = INK.navy;
    ctx.fillRect(t.x + 12, t.y + t.h - 12, t.w - 24, 5);
  },
  machine: (ctx, s, { time, ink }) => {
    const { f } = box(ctx, s, { top: halftone(ctx, ink, 0.45, 3), front: ink, shade: 0.12 });
    const cx = f.x + f.w * 0.36, cy = f.y + f.h * 0.48;
    paperFill(ctx, circlePath(ctx, cx, cy, 20), INK.navy);
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = INK.teal;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 14, time * 2, time * 2 + 1.3);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK.paper;
    ctx.stroke();
    screen(ctx, f.x + f.w * 0.62, f.y + 14, f.w * 0.3, 26, 3, INK.gold);
    lights(ctx, f.x + f.w * 0.64, f.y + 54, 3, time);
  },
  locker: (ctx, s, { ink }) => {
    const { f } = box(ctx, s, { top: halftone(ctx, ink, 0.5, 3), front: ink, shade: 0 });
    ctx.fillStyle = INK.navy;
    ctx.fillRect(f.x + f.w / 2 - 1, f.y + 4, 2, f.h - 8);
    for (const side of [-1, 1]) {
      ctx.fillRect(f.x + f.w / 2 + side * 9 - 1.5, f.y + f.h / 2 - 7, 3, 14);
      ctx.fillStyle = INK.paper;
      for (let i = 0; i < 3; i++) ctx.fillRect(f.x + (side < 0 ? 8 : f.w / 2 + 8), f.y + 12 + i * 6, f.w / 2 - 22, 2);
      ctx.fillStyle = INK.navy;
    }
  },
  safe: (ctx, s, { ink }) => {
    const { f } = box(ctx, s, { top: halftone(ctx, INK.navy, 0.5, 3), front: halftone(ctx, INK.navy, 0.75, 2.6), shade: 0 });
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    paperFill(ctx, circlePath(ctx, cx, cy, 18), ink);
    keyLine(ctx, circlePath(ctx, cx, cy, 18), 2);
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * 14, cy - Math.sin(a) * 14);
      ctx.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
      ctx.stroke();
    }
  },
  telescope: (ctx, s, { ink }) => {
    const low = { ...s, height: 34 };
    const { t } = box(ctx, low, { top: halftone(ctx, ink, 0.5, 3), front: ink, shade: 0.16 });
    const baseX = t.x + t.w / 2, baseY = t.y + t.h / 2;
    ctx.fillStyle = INK.navy;
    ctx.fillRect(baseX - 3, baseY - 34, 6, 36);
    ctx.save();
    ctx.translate(baseX, baseY - 40);
    ctx.rotate(-0.6);
    const tube = rectPath(ctx, -40, -11, 80, 22, 4);
    paperFill(ctx, tube);
    inkFill(ctx, rectPath(ctx, -40, -11, 22, 22, 4), INK.gold);
    inkFill(ctx, rectPath(ctx, -10, 1, 50, 10), halftone(ctx, INK.navy, 0.3, 2.6));
    keyLine(ctx, tube, 2);
    paperFill(ctx, rectPath(ctx, 36, -14, 10, 28, 3), INK.navy);
    ctx.restore();
  },
  bench: (ctx, s, { time, ink }) => {
    const { t } = box(ctx, s, { top: halftone(ctx, ink, 0.3, 3), front: INK.gold, shade: 0.2 });
    const unit = rectPath(ctx, t.x + 14, t.y - 20, 50, 30, 3);
    paperFill(ctx, unit);
    inkFill(ctx, unit, ink);
    keyLine(ctx, unit, 1.8);
    const cx = t.x + 96, cy = t.y - 4;
    paperFill(ctx, circlePath(ctx, cx, cy, 14));
    keyLine(ctx, circlePath(ctx, cx, cy, 14), 1.8);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(-1.2 + Math.sin(time * 1.4) * 0.6) * 11, cy + Math.sin(-1.2 + Math.sin(time * 1.4) * 0.6) * 11);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK.coral;
    ctx.stroke();
  },
  /** El tablero de misión: una fila por rol con sus tareas de la etapa (puntos llenos = hechas). */
  board: (ctx, s, { state }) => {
    const x = s.x, y = s.y - s.height - 6, w = s.w, h = s.height;
    const path = rectPath(ctx, x, y, w, h, 6);
    paperFill(ctx, path, INK.navy);
    keyLine(ctx, path, 2, INK.gold);
    label(ctx, (state.title ?? 'MISIÓN').toUpperCase(), x + 10, y + 13, { size: 12, color: INK.gold, align: 'left' });
    ctx.fillStyle = INK.gold;
    ctx.fillRect(x + 10, y + 22, w - 20, 1.5);
    (state.rows ?? []).forEach((row, i) => {
      const ry = y + 34 + i * 12.5;
      ctx.fillStyle = row.color;
      ctx.fillRect(x + 10, ry - 3.5, 7, 7);
      label(ctx, row.name, x + 22, ry, { size: 9.5, weight: 600, color: withAlpha(INK.paper, 0.9), align: 'left' });
      for (let k = 0; k < row.total; k++) {
        ctx.beginPath();
        ctx.arc(x + w - 14 - k * 11, ry, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = k < row.total - row.done ? withAlpha(INK.paper, 0.22) : INK.teal;
        ctx.fill();
      }
    });
  },
  lever: (ctx, s, { time, state }) => {
    const { f, t } = box(ctx, s, { top: halftone(ctx, INK.navy, 0.5, 3), front: INK.gold, shade: 0.16 });
    const ready = Boolean(state.ready);
    const angle = ready ? -0.5 + Math.sin(time * 5) * 0.06 : 0.5;
    const px = t.x + t.w / 2, py = t.y + t.h / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = INK.navy;
    ctx.fillRect(-3, -38, 6, 40);
    ctx.beginPath();
    ctx.arc(0, -40, 8, 0, Math.PI * 2);
    ctx.fillStyle = INK.coral;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK.navy;
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(f.x + f.w / 2, f.y + f.h * 0.6, 7, 0, Math.PI * 2);
    ctx.fillStyle = ready ? (Math.floor(time * 3) % 2 ? INK.teal : INK.paper) : INK.coral;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK.navy;
    ctx.stroke();
  },
  holo: (ctx, s, { time }) => {
    const { t } = box(ctx, s, { top: halftone(ctx, INK.teal, 0.3, 3), front: INK.navy, shade: 0 });
    const cx = t.x + t.w / 2, cy = t.y - 34 + Math.sin(time * 1.6) * 3;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fillStyle = INK.paper;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = halftone(ctx, INK.navy, 0.5, 3);
    ctx.fillRect(cx - 4 + Math.sin(time * 0.5) * 8, cy - 30, 40, 60);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK.teal;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 40, 10, -0.3, 0, Math.PI * 2);
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = INK.gold;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = withAlpha(INK.teal, 0.25);
    polyPath(ctx, [[t.x + 20, t.y + 8], [t.x + t.w - 20, t.y + 8], [cx + 28, cy + 22], [cx - 28, cy + 22]]);
    ctx.fill();
  },
  cockpit: (ctx, s, { time, ink }) => {
    const { f, t } = box(ctx, s, { top: halftone(ctx, ink, 0.5, 3), front: ink, shade: 0.14 });
    // Parabrisas con estrellas que pasan, palanca y asiento.
    const glass = rectPath(ctx, f.x + 12, f.y + 8, f.w - 24, 34, 8);
    paperFill(ctx, glass, INK.space);
    ctx.save();
    glass();
    ctx.clip();
    ctx.fillStyle = INK.paper;
    for (let i = 0; i < 9; i++) ctx.fillRect(f.x + 12 + ((i * 37 + time * 30) % (f.w - 24)), f.y + 12 + ((i * 13) % 26), 2, 2);
    ctx.restore();
    keyLine(ctx, glass, 2);
    lights(ctx, f.x + 18, f.y + 56, Math.floor((f.w - 30) / 9), time);
    ctx.fillStyle = INK.navy;
    ctx.fillRect(t.x + t.w / 2 - 2, t.y + 2, 4, 16);
    paperFill(ctx, circlePath(ctx, t.x + t.w / 2, t.y + 2, 6), INK.coral);
  },
  switches: (ctx, s, { time, ink }) => {
    const { f } = box(ctx, s, { top: halftone(ctx, ink, 0.5, 3), front: INK.navy, shade: 0 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 6; c++) {
        const on = Math.sin(time * 1.3 + r * 2.1 + c * 1.3) > 0.2;
        const x = f.x + 12 + c * ((f.w - 24) / 5), y = f.y + 16 + r * 20;
        ctx.fillStyle = on ? INK.teal : withAlpha(INK.paper, 0.3);
        ctx.fillRect(x - 3, y - 6, 6, 4);
        ctx.fillStyle = INK.paper;
        ctx.fillRect(x - 1.5, on ? y - 2 : y + 2, 3, 6);
      }
    }
  },
  table: (ctx, s, { ink }) => {
    const { t } = box(ctx, s, { top: null, front: ink, shade: 0.2 });
    ctx.save();
    ctx.beginPath();
    ctx.rect(t.x + 4, t.y + 4, t.w - 8, t.h - 8);
    ctx.clip();
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(t.x + t.w * 0.3, t.y + t.h / 2, 28, 12, 0, 0, Math.PI * 2);
    ctx.moveTo(t.x + t.w * 0.3 + 28, t.y + t.h / 2);
    ctx.quadraticCurveTo(t.x + t.w * 0.7, t.y - 6, t.x + t.w * 0.84, t.y + t.h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(t.x + t.w * 0.3, t.y + t.h / 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = INK.teal;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(t.x + t.w * 0.84, t.y + t.h / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = INK.gold;
    ctx.fill();
    ctx.restore();
  },
  crates: (ctx, s) => {
    box(ctx, { ...s, height: 6 }, { top: halftone(ctx, INK.navy, 0.3, 3), front: INK.navy, shade: 0 });
    const baseY = s.y + s.h - 8;
    crate(ctx, s.x + 6, baseY - 26, 44, 28);
    crate(ctx, s.x + s.w - 54, baseY - 26, 46, 28, INK.teal);
    crate(ctx, s.x + s.w / 2 - 22, baseY - 30, 44, 30, INK.coral);
    crate(ctx, s.x + 24, baseY - 50, 40, 24, INK.gold);
  },
  scale: (ctx, s, { state }) => {
    const { t } = box(ctx, s, { top: halftone(ctx, INK.navy, 0.2, 3), front: INK.navy, shade: 0 });
    ctx.fillStyle = INK.navy;
    ctx.fillRect(t.x + t.w - 14, t.y - 44, 4, 46);
    paperFill(ctx, circlePath(ctx, t.x + t.w - 12, t.y - 50, 12));
    keyLine(ctx, circlePath(ctx, t.x + t.w - 12, t.y - 50, 12), 1.8);
    const count = state.count ?? 0;
    ctx.beginPath();
    ctx.moveTo(t.x + t.w - 12, t.y - 50);
    ctx.lineTo(t.x + t.w - 12 + Math.cos(-2.4 + count * 0.6) * 9, t.y - 50 + Math.sin(-2.4 + count * 0.6) * 9);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK.coral;
    ctx.stroke();
    for (let i = 0; i < count; i++) crate(ctx, t.x + 8 + (i % 2) * 40, t.y - 12 - Math.floor(i / 2) * 24, 36, 24, i % 2 ? INK.teal : INK.gold);
  },
  rack: (ctx, s, { state, ink }) => {
    const { f } = box(ctx, s, { top: halftone(ctx, ink, 0.4, 3), front: null, shade: 0.1 });
    ctx.fillStyle = INK.navy;
    for (const y of [f.y + f.h / 3, f.y + (f.h * 2) / 3]) ctx.fillRect(f.x + 2, y, f.w - 4, 2.5);
    const count = state.count ?? 0;
    for (let i = 0; i < count; i++) {
      const shelf = Math.floor(i / 3), slot = i % 3;
      crate(ctx, f.x + 8 + slot * ((f.w - 16) / 3), f.y + (f.h / 3) * (2 - shelf) + 4, (f.w - 28) / 3, f.h / 3 - 8, [INK.gold, INK.teal, INK.coral][i % 3]);
    }
  },
  panel: (ctx, s, { time, state }) => {
    const { f } = box(ctx, s, { top: halftone(ctx, INK.navy, 0.5, 3), front: INK.gold, shade: 0.12 });
    const bolt = [[0, -18], [-10, 2], [-2, 2], [-6, 18], [10, -4], [2, -4], [6, -18]];
    polyPath(ctx, bolt.map(([px, py]) => [f.x + f.w / 2 + px, f.y + f.h * 0.42 + py]));
    ctx.fillStyle = state.on === false ? withAlpha(INK.navy, 0.5) : INK.navy;
    ctx.fill();
    lights(ctx, f.x + 14, f.y + f.h - 14, Math.floor((f.w - 20) / 9), time, state.on === false ? [INK.coral] : [INK.teal, INK.gold]);
  },
  crane: (ctx, s, { time }) => {
    const { t } = box(ctx, { ...s, height: 30 }, { top: halftone(ctx, INK.coral, 0.5, 3), front: INK.coral, shade: 0.16 });
    const px = t.x + 20, top = t.y - 96;
    ctx.fillStyle = INK.gold;
    ctx.fillRect(px - 5, top, 10, 100);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK.navy;
    ctx.strokeRect(px - 5, top, 10, 100);
    ctx.fillRect(px - 5, top, 96, 9);
    ctx.strokeRect(px - 5, top, 96, 9);
    const hookX = px + 60 + Math.sin(time * 0.7) * 16;
    ctx.beginPath();
    ctx.moveTo(hookX, top + 9);
    ctx.lineTo(hookX, top + 50);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hookX, top + 57, 7, -0.4, Math.PI);
    ctx.lineWidth = 3;
    ctx.stroke();
  },
  engine: (ctx, s, { time, state }) => {
    const { t } = box(ctx, { ...s, height: 20 }, { top: halftone(ctx, INK.navy, 0.4, 3), front: INK.navy, shade: 0 });
    const cx = t.x + t.w / 2, top = t.y - 62;
    const bell = () => { ctx.beginPath(); ctx.moveTo(cx - 14, top); ctx.lineTo(cx + 14, top); ctx.quadraticCurveTo(cx + 20, top + 34, cx + 34, top + 58); ctx.lineTo(cx - 34, top + 58); ctx.quadraticCurveTo(cx - 20, top + 34, cx - 14, top); ctx.closePath(); };
    paperFill(ctx, bell);
    inkFill(ctx, bell, halftone(ctx, INK.navy, 0.4, 2.6));
    inkFill(ctx, rectPath(ctx, cx - 16, top - 12, 32, 14, 3), INK.coral);
    keyLine(ctx, bell, 2);
    keyLine(ctx, rectPath(ctx, cx - 16, top - 12, 32, 14, 3), 2);
    if (state.firing) {
      const flicker = 0.8 + Math.sin(time * 43) * 0.2;
      for (const { color, scale } of [{ color: INK.gold, scale: 1 }, { color: INK.coral, scale: 0.6 }]) {
        ctx.beginPath();
        ctx.moveTo(cx - 22 * scale, top + 58);
        ctx.quadraticCurveTo(cx, top + 58 + 40 * scale * flicker, cx + 22 * scale, top + 58);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  },
  pump: (ctx, s) => {
    const { f, t } = box(ctx, s, { top: halftone(ctx, INK.coral, 0.5, 3), front: INK.coral, shade: 0.14 });
    paperFill(ctx, circlePath(ctx, f.x + f.w / 2, f.y + 26, 13));
    keyLine(ctx, circlePath(ctx, f.x + f.w / 2, f.y + 26, 13), 1.8);
    ctx.fillStyle = INK.navy;
    ctx.fillRect(f.x + f.w / 2 - 1, f.y + 16, 2, 11);
    ctx.beginPath();
    ctx.moveTo(t.x + t.w, t.y + 8);
    ctx.bezierCurveTo(t.x + t.w + 60, t.y - 10, t.x + t.w + 60, t.y + 60, t.x + t.w + 110, t.y + 30);
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK.navy;
    ctx.stroke();
  },
  hatch: (ctx, s, { state }) => {
    const { t } = box(ctx, s, { top: halftone(ctx, INK.gold, 0.6, 3), front: INK.navy, shade: 0 });
    ctx.fillStyle = INK.navy;
    for (let x = t.x + 10; x < t.x + t.w - 6; x += 14) ctx.fillRect(x, t.y + 4, 5, t.h - 8);
    const count = state.count ?? 0;
    for (let i = 0; i < Math.min(count, 4); i++) crate(ctx, t.x + 4 + (i % 2) * 42, t.y - 20 - Math.floor(i / 2) * 22, 38, 22, [INK.gold, INK.teal][i % 2]);
  },
  pad: (ctx, s, { time, state }) => {
    box(ctx, s, { top: halftone(ctx, INK.navy, 0.35, 3), front: INK.navy, shade: 0, radius: 6 });
    ctx.strokeStyle = INK.gold;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(s.x + 8, s.y - s.height + 8, s.w - 16, s.h - 16);
    ctx.setLineDash([]);
    drawPadRocket(ctx, s.x + s.w / 2 - 20, s.y - s.height + s.h / 2 + 6, state.rocket, time, state.launching);
  },
  antenna: (ctx, s, { time, state }) => {
    const { t } = box(ctx, { ...s, height: 24 }, { top: halftone(ctx, INK.teal, 0.5, 3), front: INK.teal, shade: 0.16 });
    const cx = t.x + t.w / 2, top = t.y - 56;
    ctx.fillStyle = INK.navy;
    ctx.fillRect(cx - 2.5, top + 10, 5, 50);
    ctx.save();
    ctx.translate(cx, top + 10);
    ctx.rotate(-0.5 + (state.broken ? 0.9 : Math.sin(time * 0.6) * 0.12));
    const dish = () => { ctx.beginPath(); ctx.ellipse(0, 0, 30, 12, 0, 0, Math.PI * 2); };
    paperFill(ctx, dish);
    inkFill(ctx, dish, halftone(ctx, INK.navy, 0.2, 2.6));
    keyLine(ctx, dish, 2);
    ctx.fillStyle = INK.coral;
    ctx.fillRect(-1.5, -22, 3, 22);
    ctx.restore();
  },
  lander: (ctx, s, { time, state }) => {
    // Sombra, patas, etapa de descenso dorada y cabina arriba.
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.ellipse(s.x + s.w / 2 + 30, s.y + s.h, s.w / 2 + 50, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = halftone(ctx, INK.navy, 0.5, 3);
    ctx.fill();
    ctx.restore();
    const cx = s.x + s.w / 2, ground = s.y + s.h - 4;
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 44, ground - 44);
      ctx.lineTo(cx + side * 82, ground);
      ctx.stroke();
      ctx.fillStyle = INK.navy;
      ctx.fillRect(cx + side * 82 - 12, ground - 3, 24, 6);
    }
    const base = rectPath(ctx, cx - 58, ground - 70, 116, 46, 4);
    paperFill(ctx, base);
    inkFill(ctx, base, INK.gold);
    inkFill(ctx, base, halftone(ctx, INK.navy, 0.22, 3));
    keyLine(ctx, base, 2);
    const cabin = () => { ctx.beginPath(); ctx.moveTo(cx - 40, ground - 70); ctx.lineTo(cx - 30, ground - 124); ctx.lineTo(cx + 30, ground - 124); ctx.lineTo(cx + 40, ground - 70); ctx.closePath(); };
    paperFill(ctx, cabin);
    inkFill(ctx, () => { ctx.beginPath(); ctx.rect(cx, ground - 124, 40, 54); }, halftone(ctx, INK.navy, 0.24, 2.8));
    keyLine(ctx, cabin, 2);
    paperFill(ctx, rectPath(ctx, cx - 16, ground - 112, 32, 20, 4), INK.navy);
    ctx.fillStyle = INK.teal;
    ctx.fillRect(cx - 12, ground - 108, 10, 6);
    ctx.fillStyle = INK.navy;
    ctx.fillRect(cx - 1.5, ground - 150, 3, 26);
    paperFill(ctx, circlePath(ctx, cx, ground - 152, 5), Math.floor(time * 2) % 2 ? INK.coral : INK.gold);
    // Escalera y bandera
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { ctx.moveTo(cx - 8, ground - 22 + i * 5); ctx.lineTo(cx + 8, ground - 22 + i * 5); }
    ctx.stroke();
    if (state.prism) {
      starPath(ctx, cx + 44, ground - 92, 10);
      ctx.fillStyle = INK.teal;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  },
  solar: (ctx, s, { state }) => {
    if (!state.deployed) {
      crate(ctx, s.x + 6, s.y + s.h - 34, s.w - 12, 30, INK.teal);
      label(ctx, 'PANEL', s.x + s.w / 2, s.y + s.h - 26, { size: 8, color: INK.navy });
      return;
    }
    ctx.fillStyle = INK.navy;
    ctx.fillRect(s.x + s.w / 2 - 2, s.y - 30, 4, 50);
    for (const side of [-1, 1]) {
      const wing = () => polyPath(ctx, [[s.x + s.w / 2 + side * 6, s.y - 42], [s.x + s.w / 2 + side * 74, s.y - 58], [s.x + s.w / 2 + side * 74, s.y - 24], [s.x + s.w / 2 + side * 6, s.y - 12]]);
      paperFill(ctx, wing, INK.navy);
      inkFill(ctx, wing, halftone(ctx, INK.teal, 0.6, 3), 1);
      ctx.strokeStyle = INK.gold;
      ctx.lineWidth = 1.2;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(s.x + s.w / 2 + side * (6 + i * 17), s.y - 42 - i * 4);
        ctx.lineTo(s.x + s.w / 2 + side * (6 + i * 17), s.y - 12 - i * 3);
        ctx.stroke();
      }
      keyLine(ctx, wing, 1.8);
    }
  },
  cart: (ctx, s, { time, state }) => {
    const { t } = box(ctx, { ...s, height: 26 }, { top: halftone(ctx, INK.gold, 0.6, 3), front: INK.gold, shade: 0.16 });
    for (const x of [s.x + 12, s.x + s.w - 12]) paperFill(ctx, circlePath(ctx, x, s.y + s.h + 2, 8), INK.navy);
    const unit = rectPath(ctx, t.x + 10, t.y - 22, 46, 26, 3);
    paperFill(ctx, unit);
    inkFill(ctx, unit, INK.teal);
    keyLine(ctx, unit, 1.8);
    lights(ctx, t.x + 18, t.y - 8, 4, time, state.broken ? [INK.coral] : [INK.teal, INK.gold]);
  },
  /** El sitio del Prisma: una marca; después de perforar, el cristal a la vista. */
  site: (ctx, s, { time, state }) => {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -time * 14;
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK.gold;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 42, 17, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (!state.dug) {
      ctx.strokeStyle = INK.coral;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 6); ctx.lineTo(cx + 12, cy + 6);
      ctx.moveTo(cx + 12, cy - 6); ctx.lineTo(cx - 12, cy + 6);
      ctx.stroke();
      return;
    }
    inkFill(ctx, () => { ctx.beginPath(); ctx.ellipse(cx, cy, 30, 12, 0, 0, Math.PI * 2); }, halftone(ctx, INK.navy, 0.7, 2.6));
    if (!state.taken) drawItem(ctx, 'prism', cx, cy - 4 + Math.sin(time * 2) * 2, time);
  },
};

/**
 * Dibuja un puesto. `opts`: time (segundos), state (lo real de la partida para ese puesto),
 * glow (tiene algo para ti), alert (hay una avería ahí).
 */
export const drawStation = (ctx, station, map, opts) => {
  const room = map.rooms.find((r) => r.id === station.room);
  const ink = ROLE_INK[room?.role] ?? INK.teal;
  const paint = PAINTERS[station.kind] ?? PAINTERS.console;
  paint(ctx, station, { time: opts.time, state: opts.state ?? {}, ink });
  if (opts.glow || opts.alert) {
    const pad = 7;
    const top = station.y - station.height - pad;
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -opts.time * 22;
    ctx.lineWidth = 3;
    ctx.strokeStyle = opts.alert ? INK.coral : INK.gold;
    ctx.beginPath();
    ctx.roundRect(station.x - pad, top, station.w + pad * 2, station.y + station.h - top + pad, 9);
    ctx.stroke();
    ctx.restore();
  }
};

export const drawRock = (ctx, rock) => {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.beginPath();
  ctx.ellipse(rock.x + rock.w / 2 + 26, rock.y + rock.h - 2, rock.w / 2 + 30, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = halftone(ctx, INK.navy, 0.5, 3);
  ctx.fill();
  ctx.restore();
  const top = rock.y + rock.h - rock.height;
  const shape = () => polyPath(ctx, [
    [rock.x, rock.y + rock.h], [rock.x + rock.w * 0.1, top + rock.height * 0.4], [rock.x + rock.w * 0.4, top],
    [rock.x + rock.w * 0.75, top + rock.height * 0.15], [rock.x + rock.w, rock.y + rock.h],
  ]);
  paperFill(ctx, shape, MOON_GROUND);
  inkFill(ctx, () => polyPath(ctx, [[rock.x + rock.w * 0.4, top], [rock.x + rock.w * 0.75, top + rock.height * 0.15], [rock.x + rock.w, rock.y + rock.h], [rock.x + rock.w * 0.45, rock.y + rock.h]]), halftone(ctx, INK.navy, 0.5, 2.8));
  keyLine(ctx, shape, 2);
};

// ============================================================
//  Lo que se lleva en las manos
// ============================================================

/** Dibuja un objeto centrado en (x, y): caja, muestra, ficha, instrumento, contenedor, repuesto o el Prisma. */
export const drawItem = (ctx, item, x, y, time = 0) => {
  switch (item) {
    case 'prism': {
      const shape = () => polyPath(ctx, [[x, y - 20], [x + 13, y - 4], [x + 8, y + 12], [x - 8, y + 12], [x - 13, y - 4]]);
      paperFill(ctx, shape);
      inkFill(ctx, shape, INK.teal);
      inkFill(ctx, () => polyPath(ctx, [[x, y - 20], [x + 13, y - 4], [x + 8, y + 12], [x, y + 2]]), halftone(ctx, INK.coral, 0.6, 2.4));
      keyLine(ctx, shape, 1.8);
      starPath(ctx, x + 16, y - 20, 5 + Math.sin(time * 6) * 1.5);
      ctx.fillStyle = INK.gold;
      ctx.fill();
      break;
    }
    case 'chip': {
      const card = rectPath(ctx, x - 13, y - 9, 26, 18, 3);
      paperFill(ctx, card);
      inkFill(ctx, card, INK.gold);
      keyLine(ctx, card, 1.6);
      ctx.fillStyle = INK.navy;
      ctx.fillRect(x - 8, y - 4, 8, 6);
      ctx.fillRect(x + 3, y - 2, 6, 2);
      break;
    }
    case 'sample': {
      const tube = rectPath(ctx, x - 6, y - 14, 12, 26, 5);
      paperFill(ctx, tube);
      inkFill(ctx, rectPath(ctx, x - 6, y - 2, 12, 14, 5), halftone(ctx, INK.navy, 0.6, 2.2));
      keyLine(ctx, tube, 1.6);
      ctx.fillStyle = INK.coral;
      ctx.fillRect(x - 7, y - 17, 14, 5);
      break;
    }
    case 'instrument': {
      const body = rectPath(ctx, x - 15, y - 11, 30, 22, 3);
      paperFill(ctx, body);
      inkFill(ctx, body, INK.teal);
      keyLine(ctx, body, 1.6);
      paperFill(ctx, circlePath(ctx, x, y, 6), INK.navy);
      paperFill(ctx, circlePath(ctx, x, y, 3), INK.gold);
      break;
    }
    case 'container': {
      const body = rectPath(ctx, x - 14, y - 13, 28, 26, 4);
      paperFill(ctx, body);
      inkFill(ctx, body, halftone(ctx, INK.navy, 0.35, 2.6));
      keyLine(ctx, body, 1.6);
      starPath(ctx, x, y, 8);
      ctx.fillStyle = INK.gold;
      ctx.fill();
      break;
    }
    case 'spare': {
      const body = rectPath(ctx, x - 14, y - 10, 28, 20, 3);
      paperFill(ctx, body);
      inkFill(ctx, body, INK.coral);
      keyLine(ctx, body, 1.6);
      ctx.fillStyle = INK.paper;
      ctx.fillRect(x - 2, y - 7, 4, 14);
      ctx.fillRect(x - 7, y - 2, 14, 4);
      break;
    }
    default:
      crate(ctx, x - 16, y - 12, 32, 24);
  }
};

export { MISREGISTER };
