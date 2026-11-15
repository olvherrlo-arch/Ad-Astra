/**
 * DIBUJOS DE LAS PIEZAS
 * Cada pieza del catálogo dibujada con las tintas del juego (js/riso.js), para el constructor.
 * Son dibujos provisorios hechos con código: cada tipo se distingue por su forma y cada
 * combustible por su color (queroseno coral, hidrógeno turquesa, hipergólico dorado).
 *
 * Para usar el dibujo final de una pieza: guarda la imagen en assets/parts/ y agrégala en IMAGES
 * (id de pieza → ruta). Si hay imagen, se usa en lugar del dibujo provisorio.
 *
 * La vista es ESQUEMÁTICA, no a escala: un tanque de 16 m no se dibuja 16 veces más alto que
 * una pieza de 1 m (no entraría en pantalla). El tamaño crece con la raíz de la medida real.
 */
import { tierOf } from './partinfo.js';
import { INK, halftone, inkFill, keyLine, paperFill, polyPath } from './riso.js';

/** Dibujos finales: p. ej. { capsule: 'assets/parts/capsule.png' }. */
const IMAGES = {};
const loaded = new Map();
const imageFor = (partId) => {
  if (!IMAGES[partId]) return null;
  if (!loaded.has(partId)) {
    const image = new Image();
    image.src = IMAGES[partId];
    loaded.set(partId, image);
  }
  const image = loaded.get(partId);
  return image.complete && image.naturalWidth ? image : null;
};

const FUEL_INK = { kerolox: INK.coral, hydrolox: INK.teal, hypergolic: INK.gold };
export const MOUNT_SIZE = 26; // lado del dibujo de un equipo montado
export const SEPARATOR_HEIGHT = 10;

/** Tamaño en pantalla (a zoom 1) de una pieza del cuerpo o un motor. */
export const drawSize = (part) => {
  if (part.id === 'separator') return { w: 0, h: SEPARATOR_HEIGHT }; // toma el ancho de lo que tiene debajo
  if (part.slot === 'mounted') return { w: MOUNT_SIZE, h: MOUNT_SIZE };
  return { w: Math.round(27 * Math.sqrt(part.width) + 12), h: Math.round(12 * Math.sqrt(part.height) + 8) };
};

const box = (ctx, x, y, w, h, r = 0) => () => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};
const disc = (ctx, x, y, r) => () => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
};

// ---------- Motores y cuerpo ----------
const drawEngine = (ctx, part, x, y, w, h) => {
  const vacuum = !(part.thrustSea > 0) || part.id.includes('vac');
  const flare = vacuum ? 0.5 : 0.44;
  const neck = y + h * 0.26;
  const mount = box(ctx, x - w * 0.2, y, w * 0.4, h * 0.3, 2);
  paperFill(ctx, mount, INK.navy);
  const bell = () => {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.14, neck);
    ctx.quadraticCurveTo(x - w * 0.2, y + h * 0.7, x - w * flare, y + h);
    ctx.lineTo(x + w * flare, y + h);
    ctx.quadraticCurveTo(x + w * 0.2, y + h * 0.7, x + w * 0.14, neck);
    ctx.closePath();
  };
  paperFill(ctx, bell);
  inkFill(ctx, bell, halftone(ctx, FUEL_INK[part.propellant] ?? INK.navy, 0.75, 2.6));
  ctx.save();
  bell();
  ctx.clip();
  inkFill(ctx, box(ctx, x, y, w, h), halftone(ctx, INK.navy, 0.3, 2.6));
  ctx.restore();
  keyLine(ctx, bell, 1.6);
  ctx.fillStyle = INK.navy;
  ctx.fillRect(x - w * flare, y + h - 3, w * flare * 2, 3);
};

const drawTank = (ctx, part, x, y, w, h) => {
  const shell = box(ctx, x - w / 2, y, w, h, Math.min(7, h / 3));
  paperFill(ctx, shell);
  ctx.save();
  shell();
  ctx.clip();
  inkFill(ctx, box(ctx, x - w / 2, y + Math.min(h * 0.18, 10), w, Math.min(8, h * 0.22)), FUEL_INK[part.propellant] ?? INK.navy);
  inkFill(ctx, box(ctx, x + w * 0.12, y, w, h), halftone(ctx, INK.navy, 0.22, 3));
  if (part.propellant === 'hydrolox') inkFill(ctx, box(ctx, x - w / 2, y + h * 0.55, w, h), halftone(ctx, INK.teal, 0.25, 3.4)); // escarcha
  ctx.restore();
  keyLine(ctx, shell, 1.8);
};

const drawCapsule = (ctx, x, y, w, h) => {
  const hull = () => polyPath(ctx, [[x - w * 0.26, y], [x + w * 0.26, y], [x + w / 2, y + h * 0.82], [x + w / 2, y + h], [x - w / 2, y + h], [x - w / 2, y + h * 0.82]]);
  paperFill(ctx, hull);
  ctx.save();
  hull();
  ctx.clip();
  inkFill(ctx, box(ctx, x - w / 2, y + h * 0.82, w, h), INK.navy); // escudo térmico
  inkFill(ctx, box(ctx, x + w * 0.08, y, w, h * 0.82), halftone(ctx, INK.navy, 0.22, 3));
  ctx.restore();
  for (const dx of [-0.16, 0.16]) {
    const port = disc(ctx, x + w * dx, y + h * 0.45, Math.max(2.5, w * 0.08));
    paperFill(ctx, port, INK.teal);
    keyLine(ctx, port, 1.2);
  }
  keyLine(ctx, hull, 1.8);
};

const drawNose = (ctx, x, y, w, h) => {
  const cone = () => {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y + h);
    ctx.quadraticCurveTo(x - w * 0.42, y + h * 0.2, x, y);
    ctx.quadraticCurveTo(x + w * 0.42, y + h * 0.2, x + w / 2, y + h);
    ctx.closePath();
  };
  paperFill(ctx, cone);
  inkFill(ctx, cone, INK.coral);
  ctx.save();
  cone();
  ctx.clip();
  inkFill(ctx, box(ctx, x + w * 0.08, y, w, h), halftone(ctx, INK.navy, 0.25, 3));
  ctx.restore();
  keyLine(ctx, cone, 1.8);
};

const drawSeparator = (ctx, x, y, w, h) => {
  const band = box(ctx, x - w / 2, y, w, h, 2);
  paperFill(ctx, band, INK.navy);
  ctx.fillStyle = INK.gold;
  for (let px = x - w / 2 + 6; px < x + w / 2 - 2; px += 10) ctx.fillRect(px, y + h / 2 - 1.5, 3, 3);
};

// ---------- Equipo montado: un ícono por pieza, dentro de un cuadro de lado s ----------
const ICONS = {
  'solar-panel': (ctx, x, y, s) => {
    const wing = box(ctx, x - s * 0.48, y - s * 0.24, s * 0.96, s * 0.48, 2);
    paperFill(ctx, wing, INK.navy);
    ctx.strokeStyle = INK.teal;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(x - s * 0.48 + (i * s * 0.96) / 4, y - s * 0.24); ctx.lineTo(x - s * 0.48 + (i * s * 0.96) / 4, y + s * 0.24); }
    ctx.moveTo(x - s * 0.48, y); ctx.lineTo(x + s * 0.48, y);
    ctx.stroke();
    keyLine(ctx, wing, 1.2, INK.gold);
  },
  battery: (ctx, x, y, s) => {
    const cell = box(ctx, x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.66, 3);
    paperFill(ctx, cell);
    inkFill(ctx, box(ctx, x - s * 0.3, y + s * 0.02, s * 0.6, s * 0.34), INK.gold);
    paperFill(ctx, box(ctx, x - s * 0.12, y - s * 0.42, s * 0.24, s * 0.12), INK.navy);
    keyLine(ctx, cell, 1.4);
    ctx.fillStyle = INK.navy;
    ctx.fillRect(x - 4, y - s * 0.16, 8, 2);
    ctx.fillRect(x - 1, y - s * 0.16 - 3, 2, 8);
  },
  'fuel-cell': (ctx, x, y, s) => {
    const cell = box(ctx, x - s * 0.4, y - s * 0.3, s * 0.8, s * 0.6, 3);
    paperFill(ctx, cell);
    inkFill(ctx, cell, INK.teal);
    keyLine(ctx, cell, 1.4);
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.26, y); ctx.quadraticCurveTo(x - s * 0.13, y - s * 0.2, x, y); ctx.quadraticCurveTo(x + s * 0.13, y + s * 0.2, x + s * 0.26, y);
    ctx.stroke();
  },
  antenna: (ctx, x, y, s) => {
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.4); ctx.lineTo(x, y);
    ctx.stroke();
    const dish = () => { ctx.beginPath(); ctx.arc(x, y - s * 0.05, s * 0.36, Math.PI * 0.1, Math.PI * 0.9); ctx.closePath(); };
    paperFill(ctx, dish);
    inkFill(ctx, dish, halftone(ctx, INK.coral, 0.5, 2.4));
    keyLine(ctx, dish, 1.4);
    paperFill(ctx, disc(ctx, x, y - s * 0.24, 2.4), INK.gold);
  },
  'relay-sat': (ctx, x, y, s) => {
    for (const side of [-1, 1]) paperFill(ctx, box(ctx, x + side * s * 0.16 - (side < 0 ? s * 0.3 : 0), y - s * 0.12, s * 0.3, s * 0.24, 1), INK.navy);
    const body = box(ctx, x - s * 0.16, y - s * 0.22, s * 0.32, s * 0.44, 2);
    paperFill(ctx, body);
    inkFill(ctx, body, INK.gold);
    keyLine(ctx, body, 1.4);
    paperFill(ctx, disc(ctx, x, y, 2.6), INK.coral);
  },
  'flight-computer': (ctx, x, y, s) => {
    const chip = box(ctx, x - s * 0.32, y - s * 0.32, s * 0.64, s * 0.64, 3);
    paperFill(ctx, chip, INK.navy);
    ctx.fillStyle = INK.gold;
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) ctx.fillRect(x + dx * s * 0.17 - 1.5, y + dy * s * 0.17 - 1.5, 3, 3);
  },
  spectrometer: (ctx, x, y, s) => {
    const tube = box(ctx, x - s * 0.4, y - s * 0.2, s * 0.62, s * 0.4, 3);
    paperFill(ctx, tube);
    inkFill(ctx, tube, INK.coral);
    keyLine(ctx, tube, 1.4);
    const lens = disc(ctx, x + s * 0.28, y, s * 0.2);
    paperFill(ctx, lens, INK.teal);
    keyLine(ctx, lens, 1.4);
  },
  camera: (ctx, x, y, s) => {
    const body = box(ctx, x - s * 0.38, y - s * 0.24, s * 0.62, s * 0.48, 3);
    paperFill(ctx, body);
    inkFill(ctx, body, INK.gold);
    keyLine(ctx, body, 1.4);
    const lens = disc(ctx, x - s * 0.07, y, s * 0.17);
    paperFill(ctx, lens, INK.navy);
    keyLine(ctx, lens, 1.4);
    const hood = box(ctx, x + s * 0.24, y - s * 0.12, s * 0.16, s * 0.24, 1);
    paperFill(ctx, hood, INK.navy);
  },
  seismometer: (ctx, x, y, s) => {
    const dome = () => { ctx.beginPath(); ctx.arc(x, y + s * 0.2, s * 0.34, Math.PI, 0); ctx.closePath(); };
    paperFill(ctx, dome);
    inkFill(ctx, dome, halftone(ctx, INK.teal, 0.55, 2.4));
    keyLine(ctx, dome, 1.4);
    ctx.strokeStyle = INK.coral;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.3, y - s * 0.3);
    for (let i = 0; i <= 6; i++) ctx.lineTo(x - s * 0.3 + i * s * 0.1, y - s * 0.3 + (i % 2 ? -s * 0.1 : s * 0.1));
    ctx.stroke();
  },
  'antenna-ka': (ctx, x, y, s) => {
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.4); ctx.lineTo(x, y + s * 0.02);
    ctx.stroke();
    const dish = () => { ctx.beginPath(); ctx.arc(x, y - s * 0.08, s * 0.42, Math.PI * 0.05, Math.PI * 0.95); ctx.closePath(); };
    paperFill(ctx, dish);
    inkFill(ctx, dish, halftone(ctx, INK.teal, 0.55, 2.4));
    keyLine(ctx, dish, 1.4);
    paperFill(ctx, disc(ctx, x, y - s * 0.3, 2.8), INK.coral);
  },
  'sample-vault': (ctx, x, y, s) => {
    const crate = box(ctx, x - s * 0.36, y - s * 0.3, s * 0.72, s * 0.6, 2);
    paperFill(ctx, crate);
    inkFill(ctx, crate, INK.gold);
    keyLine(ctx, crate, 1.4);
    ctx.fillStyle = INK.navy;
    ctx.fillRect(x - 1.5, y - s * 0.3, 3, s * 0.6);
    ctx.fillRect(x - s * 0.36, y - 1.5, s * 0.72, 3);
  },
  rover: (ctx, x, y, s) => {
    const cab = box(ctx, x - s * 0.36, y - s * 0.26, s * 0.72, s * 0.34, 3);
    paperFill(ctx, cab);
    inkFill(ctx, cab, INK.teal);
    keyLine(ctx, cab, 1.4);
    for (const dx of [-0.24, 0.24]) paperFill(ctx, disc(ctx, x + s * dx, y + s * 0.22, s * 0.15), INK.navy);
  },
  'life-support': (ctx, x, y, s) => {
    const bottle = box(ctx, x - s * 0.26, y - s * 0.4, s * 0.52, s * 0.8, s * 0.2);
    paperFill(ctx, bottle);
    inkFill(ctx, bottle, INK.teal);
    keyLine(ctx, bottle, 1.4);
    ctx.fillStyle = INK.paper;
    ctx.fillRect(x - 1.5, y - 6, 3, 12);
    ctx.fillRect(x - 6, y - 1.5, 12, 3);
  },
  thrusters: (ctx, x, y, s) => {
    for (const side of [-1, 1]) {
      const jet = () => polyPath(ctx, [[x + side * s * 0.06, y - s * 0.22], [x + side * s * 0.42, y - s * 0.36], [x + side * s * 0.42, y - s * 0.02]]);
      paperFill(ctx, jet, INK.coral);
      keyLine(ctx, jet, 1.2);
    }
    const hub = box(ctx, x - s * 0.14, y - s * 0.34, s * 0.28, s * 0.68, 2);
    paperFill(ctx, hub, INK.navy);
  },
  'landing-legs': (ctx, x, y, s) => {
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.1, y - s * 0.34); ctx.lineTo(x - s * 0.38, y + s * 0.3);
    ctx.moveTo(x + s * 0.1, y - s * 0.34); ctx.lineTo(x + s * 0.38, y + s * 0.3);
    ctx.stroke();
    ctx.fillStyle = INK.gold;
    ctx.fillRect(x - s * 0.48, y + s * 0.3, s * 0.2, 3);
    ctx.fillRect(x + s * 0.28, y + s * 0.3, s * 0.2, 3);
  },
};

const drawMounted = (ctx, part, x, y, s) => {
  const icon = ICONS[part.id];
  if (icon) return icon(ctx, x, y, s);
  const crate = box(ctx, x - s * 0.34, y - s * 0.34, s * 0.68, s * 0.68, 3);
  paperFill(ctx, crate);
  keyLine(ctx, crate, 1.4);
};

/** Marca de rareza: un punto del color de la rareza con borde, en la esquina de la pieza. */
const drawTierMark = (ctx, tierId, x, y) => {
  const tier = tierOf(tierId);
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = tier.color;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK.navy;
  ctx.stroke();
};

/**
 * Dibuja una pieza. (x, y) es el centro de arriba para motores y cuerpo, y el centro para el
 * equipo montado. `w` y `h` vienen de drawSize(). `tier` (opcional) agrega la marca de rareza.
 */
export const drawPart = (ctx, part, { x, y, w, h, tier = null }) => {
  ctx.save();
  ctx.lineJoin = 'round';
  const image = imageFor(part.id);
  if (image) ctx.drawImage(image, x - w / 2, part.slot === 'mounted' ? y - h / 2 : y, w, h);
  else if (part.slot === 'mounted') drawMounted(ctx, part, x, y, w);
  else if (part.kind === 'engine') drawEngine(ctx, part, x, y, w, h);
  else if (part.kind === 'tank') drawTank(ctx, part, x, y, w, h);
  else if (part.id === 'capsule') drawCapsule(ctx, x, y, w, h);
  else if (part.id === 'nose-cone') drawNose(ctx, x, y, w, h);
  else drawSeparator(ctx, x, y, w, h);

  // La común es lo normal y no lleva marca: así resaltan las mejores.
  if (tier && tier !== 'common' && part.id !== 'separator') {
    if (part.slot === 'mounted') drawTierMark(ctx, tier, x + w / 2 - 3, y - h / 2 + 3);
    else if (part.kind === 'engine') drawTierMark(ctx, tier, x, y + h * 0.14);
    else drawTierMark(ctx, tier, x - w / 2 + 9, y + Math.min(h / 2, 9 + (part.id === 'capsule' || part.id === 'nose-cone' ? h * 0.5 : 0)));
  }
  ctx.restore();
};

/** Miniatura de una pieza en un canvas cuadrado (para la lista de la bodega). */
export const drawThumb = (canvas, part, tier, size = 40) => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.height = size * dpr;
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  const dims = drawSize(part);
  const w = dims.w || 40;
  const scale = Math.min((size - 6) / w, (size - 6) / dims.h, 1.3);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, (size * dpr) / 2, (size * dpr) / 2);
  drawPart(ctx, part, { x: 0, y: part.slot === 'mounted' ? 0 : -dims.h / 2, w, h: dims.h, tier });
};
