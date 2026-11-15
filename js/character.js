/**
 * PERSONAJE
 * Dibuja al astronauta (assets/sprites/astronaut.png, sacado de la hoja de caminata)
 * pintado con el color del jugador, y su sombrero.
 *
 * Para cambiar el arte: reemplaza el PNG con 6 cuadros de 91×170 px mirando a la derecha,
 * con los pies abajo; si cambian las medidas, ajusta SPRITE.
 */
import { colorHex } from './shared.js';

const SPRITE = {
  src: 'assets/sprites/astronaut.png',
  frameWidth: 91,
  frameHeight: 170,
  frames: 6,
  idleFrame: 1, // cuadro que se usa al estar quieto
  anchorX: 55, // centro del cuerpo
  feetY: 168, // línea de los pies
  // Centro y radio del casco en cada cuadro (para poner el sombrero).
  helmets: [
    { x: 54.6, y: 53.2, r: 32.5 },
    { x: 54.6, y: 60.5, r: 30.6 },
    { x: 54.6, y: 35.1, r: 32.7 },
    { x: 54.6, y: 54.3, r: 33.2 },
    { x: 54.6, y: 60.4, r: 32.7 },
    { x: 54.6, y: 50.8, r: 34.1 },
  ],
};

export const WALK_FPS = 10;
export const IDLE_FRAME = SPRITE.idleFrame;
export const FRAME_COUNT = SPRITE.frames;

const sheet = new Image();
sheet.src = SPRITE.src;
const tintCache = new Map();

/** La tira de cuadros pintada de un color (las líneas quedan oscuras). */
const tintedSheet = (hex) => {
  if (tintCache.has(hex)) return tintCache.get(hex);
  const canvas = document.createElement('canvas');
  canvas.width = sheet.naturalWidth;
  canvas.height = sheet.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sheet, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(sheet, 0, 0);
  tintCache.set(hex, canvas);
  return canvas;
};

// ---------- Sombreros (dibujados sobre el casco, en coordenadas del sprite) ----------
const OUTLINE = '#1d1a16';

const drawCrown = (ctx, r) => {
  ctx.rotate(-0.42);
  const w = r * 0.95, h = r * 0.6, base = -r + 6;
  ctx.beginPath();
  ctx.moveTo(-w / 2, base);
  ctx.lineTo(-w / 2, base - h * 0.75);
  ctx.lineTo(-w / 4, base - h * 0.35);
  ctx.lineTo(0, base - h);
  ctx.lineTo(w / 4, base - h * 0.35);
  ctx.lineTo(w / 2, base - h * 0.75);
  ctx.lineTo(w / 2, base);
  ctx.closePath();
  ctx.fillStyle = '#f3b641';
  ctx.fill();
  ctx.stroke();
};

const drawHorns = (ctx, r) => {
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * 0.62);
    ctx.beginPath();
    ctx.moveTo(-r * 0.17, -r + 5);
    ctx.quadraticCurveTo(-r * 0.2, -r * 1.45, side * r * 0.28, -r * 1.68);
    ctx.quadraticCurveTo(r * 0.12, -r * 1.3, r * 0.17, -r + 5);
    ctx.closePath();
    ctx.fillStyle = '#ef6a5e';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
};

const drawSprout = (ctx, r) => {
  ctx.beginPath();
  ctx.moveTo(0, -r + 3);
  ctx.quadraticCurveTo(r * 0.08, -r * 1.25, 0, -r * 1.45);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(0, -r * 1.45);
    ctx.rotate(side * 0.75);
    ctx.beginPath();
    ctx.ellipse(side * r * 0.24, 0, r * 0.26, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#86cf6b';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
};

const HAT_DRAWERS = { crown: drawCrown, horns: drawHorns, sprout: drawSprout };

/**
 * Dibuja un astronauta con los pies en (x, y).
 * facing: 1 = mira a la derecha, -1 = a la izquierda. scale: 0.4 ≈ 68 px de alto.
 */
export const drawAstronaut = (ctx, { x, y, color, hat = 'none', facing = 1, frame = IDLE_FRAME, scale = 0.4, alpha = 1 }) => {
  if (!sheet.complete || !sheet.naturalWidth) return;
  const { frameWidth, frameHeight, anchorX, feetY } = SPRITE;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(facing * scale, scale);
  const hex = typeof color === 'string' && color.startsWith('#') ? color : colorHex(color);
  ctx.drawImage(tintedSheet(hex), frame * frameWidth, 0, frameWidth, frameHeight, -anchorX, -feetY, frameWidth, frameHeight);

  const drawHat = HAT_DRAWERS[hat];
  if (drawHat) {
    const helmet = SPRITE.helmets[frame];
    ctx.translate(helmet.x - anchorX, helmet.y - feetY);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE;
    drawHat(ctx, helmet.r);
  }
  ctx.restore();
};

/** Cabeza del astronauta en un cuadrado de `size` px (para el chat y la personalización). */
export const drawHead = (ctx, { color, hat = 'none', size, x = 0, y = 0 }) => {
  const helmet = SPRITE.helmets[IDLE_FRAME];
  const scale = size / (helmet.r * 3.2);
  drawAstronaut(ctx, {
    x: x + size / 2 - (helmet.x - SPRITE.anchorX) * scale,
    y: y + size * 0.62 - (helmet.y - SPRITE.feetY) * scale,
    color,
    hat,
    scale,
  });
};

/** Promesa que se cumple cuando el sprite está listo. */
export const characterReady = new Promise((resolve) => {
  if (sheet.complete && sheet.naturalWidth) resolve();
  else sheet.addEventListener('load', () => resolve(), { once: true });
});
