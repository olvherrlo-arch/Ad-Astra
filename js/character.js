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


// ---------- Equipo por rol (se dibuja encima del traje, en coordenadas del sprite) ----------
// En el lobby nadie tiene rol: se ve el astronauta de siempre. Cuando el servidor reparte los roles,
// cada uno se viste con lo suyo. El equipo sale del rol REAL del jugador (`player.role`), así que todos
// ven lo mismo y al reconectarse vuelve igual. Para cambiar el dibujo de un rol, edita su función.
export const ROLE_COLORS = { scientist: '#5cc2b4', merchant: '#f3b641', engineer: '#ff6b5b', pilot: '#5b74c9' };

/** Parche redondo en el pecho, con el símbolo del rol. */
const chestPatch = (ctx, h, color, symbol) => {
  const x = h.x + 8, y = h.y + h.r + 24;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  symbol(ctx);
  ctx.restore();
};

const drawScientistGear = (ctx, h) => {
  const color = ROLE_COLORS.scientist;
  // Antena con sensor que sale de la mochila.
  ctx.beginPath();
  ctx.moveTo(h.x - 30, h.y + 14);
  ctx.quadraticCurveTo(h.x - 40, h.y - 6, h.x - 36, h.y - 28);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(h.x - 36, h.y - 32, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  // Visor de laboratorio: franja turquesa sobre el casco.
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r - 3, -2.5, -1.25);
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  // Parche: un átomo.
  chestPatch(ctx, h, color, (g) => {
    for (const turn of [0, 1.05, 2.1]) {
      g.beginPath();
      g.ellipse(0, 0, 7, 2.6, turn, 0, Math.PI * 2);
      g.stroke();
    }
  });
};

const drawMerchantGear = (ctx, h) => {
  const color = ROLE_COLORS.merchant;
  // Correa cruzada y bolso de carga en la cadera.
  ctx.beginPath();
  ctx.moveTo(h.x - 14, h.y + h.r + 6);
  ctx.lineTo(h.x + 20, h.y + h.r + 46);
  ctx.lineWidth = 6;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath();
  ctx.roundRect(h.x + 10, h.y + h.r + 40, 24, 18, 4);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(h.x + 10, h.y + h.r + 47);
  ctx.lineTo(h.x + 34, h.y + h.r + 47);
  ctx.stroke();
  // Parche: una moneda con estrella.
  chestPatch(ctx, h, color, (g) => {
    g.beginPath();
    g.arc(0, 0, 5, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(0, -2.5);
    g.lineTo(0, 2.5);
    g.stroke();
  });
};

const drawEngineerGear = (ctx, h) => {
  const color = ROLE_COLORS.engineer;
  // Cinturón de herramientas con una llave inglesa colgando.
  const beltY = h.y + h.r + 44;
  ctx.beginPath();
  ctx.roundRect(h.x - 22, beltY, 50, 9, 3);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(h.x + 2, beltY + 1, 8, 7);
  ctx.fillStyle = '#efe6cf';
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(h.x + 22, beltY + 9);
  ctx.rotate(0.35);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 18);
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 21, 5, 0.5, Math.PI * 2 - 0.5);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  // Franja de seguridad en el casco.
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r + 1, -2.2, -0.95);
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  // Parche: un engranaje.
  chestPatch(ctx, h, color, (g) => {
    g.beginPath();
    g.arc(0, 0, 3.5, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5);
      g.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
      g.stroke();
    }
  });
};

const drawPilotGear = (ctx, h) => {
  const color = ROLE_COLORS.pilot;
  // Auriculares con micrófono al costado del casco.
  ctx.beginPath();
  ctx.roundRect(h.x - h.r - 5, h.y - 8, 10, 18, 4);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(h.x - h.r, h.y + 8);
  ctx.quadraticCurveTo(h.x - h.r + 6, h.y + h.r - 2, h.x - 6, h.y + h.r - 4);
  ctx.stroke();
  // Dos franjas de vuelo en el casco.
  for (const [from, to] of [[-2.05, -1.35], [-1.2, -0.75]]) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r - 2, from, to);
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  // Parche: alas de piloto.
  chestPatch(ctx, h, color, (g) => {
    g.fillStyle = '#efe6cf';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, 1);
      g.quadraticCurveTo(side * 5, -5, side * 9, -2);
      g.quadraticCurveTo(side * 5, 0, side * 2, 3);
      g.closePath();
      g.fill();
      g.stroke();
    }
  });
};

// ---------- Personajes por rol (dibujos del equipo) ----------
// Cada hoja (assets/sprites/<nombre>.png) tiene 7 cuadros de 150×180 con los pies en y=176:
// 0 de frente, 1 tres cuartos (quieto), 2 de perfil, 3 a 6 caminando hacia la derecha.
// Vuelo es el único astronauta de carrera: conserva el traje (con el color y el sombrero del jugador).
// Para cambiar quién es quién, edita ROLE_SKINS; con dos dibujos por rol, cada jugador recibe uno fijo.
export const ROLE_SKINS = {
  scientist: ['scientist-a', 'scientist-b'],
  merchant: ['merchant-a', 'merchant-b'],
  engineer: ['engineer-a', 'engineer-b'],
  pilot: [],
};
const SKIN = { frameWidth: 150, frameHeight: 180, anchorX: 75, feetY: 176, front: 0, idle: 1, walkFrom: 3, walkFrames: 4, walkFps: 7 };
const skinSheets = new Map();
const skinLoads = [];
for (const name of new Set(Object.values(ROLE_SKINS).flat())) {
  const image = new Image();
  skinLoads.push(new Promise((resolve) => { image.onload = image.onerror = () => resolve(); }));
  image.src = `assets/sprites/${name}.png`;
  skinSheets.set(name, image);
}

/** Número fijo a partir de un texto (el id del jugador): el mismo en todos los navegadores. */
const hashText = (text) => {
  let hash = 0;
  for (const char of String(text ?? '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
};

/** La hoja del personaje de ese rol, o null si el rol usa el traje de astronauta (o aún no cargó). */
const skinSheetFor = (role, seed) => {
  const names = ROLE_SKINS[role];
  if (!names?.length) return null;
  const image = skinSheets.get(names[hashText(seed) % names.length]);
  return image.complete && image.naturalWidth ? image : null;
};

const ROLE_GEAR = { scientist: drawScientistGear, merchant: drawMerchantGear, engineer: drawEngineerGear, pilot: drawPilotGear };

/**
 * Dibuja un personaje con los pies en (x, y).
 * facing: 1 = mira a la derecha, -1 = a la izquierda. scale: 0.4 ≈ 68 px de alto.
 * role: id del rol asignado (o null en el lobby). Ciencia, Comercio e Ingeniería usan su personaje
 * dibujado; Vuelo (y cualquiera sin rol) es el astronauta con su color, su sombrero y el equipo del rol.
 * seed: id del jugador (elige entre los dibujos del rol). pose 'front' = de frente (retratos).
 * walkTime: segundos caminando (si se pasa, anima la caminata del personaje).
 */
export const drawAstronaut = (ctx, { x, y, color, hat = 'none', role = null, seed = '', pose = null, walkTime = null, facing = 1, frame = IDLE_FRAME, scale = 0.4, alpha = 1 }) => {
  const skin = skinSheetFor(role, seed);
  if (skin) {
    const cell = pose === 'front' ? SKIN.front : walkTime === null ? SKIN.idle : SKIN.walkFrom + (Math.floor(walkTime * SKIN.walkFps) % SKIN.walkFrames);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(facing * scale, scale);
    ctx.drawImage(skin, cell * SKIN.frameWidth, 0, SKIN.frameWidth, SKIN.frameHeight, -SKIN.anchorX, -SKIN.feetY, SKIN.frameWidth, SKIN.frameHeight);
    ctx.restore();
    return;
  }
  if (!sheet.complete || !sheet.naturalWidth) return;
  const { frameWidth, frameHeight, anchorX, feetY } = SPRITE;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(facing * scale, scale);
  const hex = typeof color === 'string' && color.startsWith('#') ? color : colorHex(color);
  ctx.drawImage(tintedSheet(hex), frame * frameWidth, 0, frameWidth, frameHeight, -anchorX, -feetY, frameWidth, frameHeight);

  const drawGear = ROLE_GEAR[role];
  if (drawGear) {
    const helmet = SPRITE.helmets[frame];
    ctx.save();
    ctx.translate(-anchorX, -feetY);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    drawGear(ctx, helmet);
    ctx.restore();
  }

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

/** Promesa que se cumple cuando el astronauta y los personajes por rol están listos. */
export const characterReady = Promise.all([
  new Promise((resolve) => {
    if (sheet.complete && sheet.naturalWidth) resolve();
    else sheet.addEventListener('load', () => resolve(), { once: true });
  }),
  ...skinLoads,
]);
