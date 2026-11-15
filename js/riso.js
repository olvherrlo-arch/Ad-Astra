/**
 * IMPRESIÓN RISO: la sala de embarque se dibuja como un afiche impreso en risografía.
 * - Tintas planas (INK) que se mezclan al superponerse (modo "multiply"), como tinta de verdad.
 * - Tramas de puntos (halftone) para sombras y degradados.
 * - Grano de papel y un leve "corrimiento" entre tintas (registro).
 * Lo usa js/lobby.js.
 */

/** Las cuatro tintas del juego (las mismas del menú) y el papel. */
export const INK = {
  paper: '#f4ecd9',
  wall: '#ebe0c6',
  navy: '#1f2d5c',
  coral: '#ff6b5b',
  gold: '#f3b641',
  teal: '#3fa597',
  space: '#16224a',
};

export const UI_FONT = "'Saira', 'Bahnschrift', sans-serif";
export const DISPLAY_FONT = "'Saira Stencil One', 'Saira', sans-serif";

/** Cuánto se corre la tinta azul respecto de las demás (en unidades de mundo). */
export const MISREGISTER = { x: 1.1, y: 0.7 };

/** Números al azar repetibles: la misma semilla da siempre el mismo dibujo (vive en js/random.js). */
export { createRng } from './random.js';

/** '#rrggbb' → 'rgba(r, g, b, a)' */
export const withAlpha = (hex, alpha) => {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

/** Arma un camino con una lista de puntos [[x, y], ...]. */
export const polyPath = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

/**
 * Pinta con una tinta: se mezcla con lo de abajo (multiply), así dos tintas encimadas
 * dan un tercer color, como en la risografía.
 * @param {CanvasRenderingContext2D} ctx
 * @param {() => void} path  arma el camino a rellenar
 * @param {string | CanvasPattern} ink
 */
export const inkFill = (ctx, path, ink, alpha = 1) => {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  path();
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.restore();
};

/** Base de papel opaca: tapa lo que queda detrás antes de entintar encima. */
export const paperFill = (ctx, path, color = INK.paper) => {
  path();
  ctx.fillStyle = color;
  ctx.fill();
};

/** Contorno en tinta azul, corrido un poquito (registro imperfecto). */
export const keyLine = (ctx, path, width = 2, color = INK.navy) => {
  ctx.save();
  ctx.translate(MISREGISTER.x, MISREGISTER.y);
  path();
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
};

// ---------- Tramas de puntos ----------
const patternCache = new Map();
const PATTERN_RES = 6; // píxeles del patrón por unidad de mundo (puntos nítidos al escalar)

/**
 * Trama de puntos de una tinta. density de 0 a 1 = tamaño del punto.
 * spacing = distancia entre puntos en unidades de mundo. Ángulo de trama de 15°, como en imprenta.
 * @param {CanvasRenderingContext2D} ctx
 * @returns {CanvasPattern | string}
 */
export const halftone = (ctx, color, density, spacing = 4) => {
  const key = `${color}|${density}|${spacing}`;
  if (!patternCache.has(key)) {
    const size = Math.max(2, Math.round(spacing * PATTERN_RES));
    const tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    const g = tile.getContext('2d');
    const radius = (size / 2) * Math.sqrt(Math.min(1, Math.max(0, density))) * 1.12;
    g.fillStyle = color;
    for (const [cx, cy] of [[size / 2, size / 2], [0, 0], [size, 0], [0, size], [size, size]]) {
      g.beginPath();
      g.arc(cx, cy, radius, 0, Math.PI * 2);
      g.fill();
    }
    patternCache.set(key, tile);
  }
  const pattern = ctx.createPattern(patternCache.get(key), 'repeat');
  if (!pattern) return color;
  pattern.setTransform(new DOMMatrix().rotate(15).scale(1 / PATTERN_RES));
  return pattern;
};

/**
 * Degradado en trama: puntos que crecen según densityAt(x, y) (de 0 a 1).
 * Más lento que halftone(): úsalo solo en lo que se pinta una vez (el fondo).
 */
export const halftoneGradient = (ctx, path, color, densityAt, { x, y, w, h }, spacing = 5, blend = 'multiply') => {
  ctx.save();
  path();
  ctx.clip();
  ctx.globalCompositeOperation = /** @type {GlobalCompositeOperation} */ (blend);
  ctx.fillStyle = color;
  ctx.beginPath();
  const cos = Math.cos(0.26), sin = Math.sin(0.26);
  const reach = Math.hypot(w, h);
  const cx = x + w / 2, cy = y + h / 2;
  for (let u = -reach / 2; u <= reach / 2; u += spacing) {
    for (let v = -reach / 2; v <= reach / 2; v += spacing) {
      const px = cx + u * cos - v * sin, py = cy + u * sin + v * cos;
      if (px < x - spacing || px > x + w + spacing || py < y - spacing || py > y + h + spacing) continue;
      const density = densityAt(px, py);
      if (density <= 0.02) continue;
      const r = (spacing / 2) * Math.sqrt(Math.min(1, density)) * 1.12;
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
};

/** Grano de papel: motas claras y oscuras repartidas al azar. */
export const paperGrain = (ctx, rng, x, y, w, h, count) => {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const dark = rng() < 0.6;
    ctx.fillStyle = dark ? `rgba(31, 45, 92, ${0.03 + rng() * 0.06})` : `rgba(255, 255, 255, ${0.1 + rng() * 0.2})`;
    const size = 0.6 + rng() * 1.4;
    ctx.fillRect(x + rng() * w, y + rng() * h, size, size);
  }
  ctx.restore();
};

/** Estrella de cuatro puntas (el emblema de Ad Astra). */
export const starPath = (ctx, cx, cy, outer, inner = outer * 0.28) => {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
};

/** Ancho angosto de la letra (Saira tiene ancho variable); en navegadores sin soporte no hace nada. */
export const condensed = (ctx, on = true) => {
  const target = /** @type {any} */ (ctx);
  if ('fontStretch' in target) target.fontStretch = on ? 'condensed' : 'normal';
};
