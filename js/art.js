/**
 * ILUSTRACIONES DE LA HISTORIA
 * Dibujos provisorios para el prólogo y los informes, impresos con las mismas tintas y tramas
 * que la sala de embarque (js/riso.js). Cada página de js/story.js pide una por su nombre (`art`).
 *
 * Para usar un dibujo final del equipo: guarda la imagen en assets/story/ y agrégala en IMAGES
 * (nombre → ruta). Si hay imagen, se muestra en vez del dibujo provisorio; no hay que tocar nada más.
 */
import {
  INK, createRng, halftone, halftoneGradient, inkFill, keyLine, paperFill, paperGrain, polyPath, starPath, withAlpha,
} from './riso.js';

/** Dibujos finales: p. ej. { earth: 'assets/story/earth.png' }. Vacío = se usan los provisorios. */
const IMAGES = {};

/** Todas las ilustraciones se dibujan en un lienzo de 480 × 320 unidades y se escalan al tamaño real. */
const W = 480, H = 320;
const FLASH_BLUE = '#7ea6ff'; // el destello azul del rayo de Marte

// ---------- Piezas comunes ----------
const circle = (ctx, x, y, r) => () => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
};
const box = (ctx, x, y, w, h, r = 0) => () => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/** El espacio: tinta azul, nubes en trama y estrellas. */
const space = (ctx, seed) => {
  const rng = createRng(seed);
  ctx.fillStyle = INK.space;
  ctx.fillRect(0, 0, W, H);
  const clouds = Array.from({ length: 5 }, () => ({ x: rng() * W, y: rng() * H, r: 90 + rng() * 120, teal: rng() < 0.55 }));
  const cloudAt = (teal) => (px, py) => clouds
    .filter((c) => c.teal === teal)
    .reduce((sum, c) => sum + Math.exp(-(((px - c.x) ** 2 + (py - c.y) ** 2) / (c.r * c.r)) * 2.4), 0) * 0.5;
  const all = box(ctx, 0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.5;
  halftoneGradient(ctx, all, INK.teal, cloudAt(true), { x: 0, y: 0, w: W, h: H }, 5, 'source-over');
  ctx.globalAlpha = 0.38;
  halftoneGradient(ctx, all, INK.coral, cloudAt(false), { x: 0, y: 0, w: W, h: H }, 5, 'source-over');
  ctx.restore();
  for (let i = 0; i < 90; i++) {
    const size = rng() < 0.88 ? 0.8 + rng() * 1.2 : 2.2;
    ctx.fillStyle = withAlpha(INK.paper, 0.45 + rng() * 0.55);
    ctx.fillRect(rng() * W, rng() * H, size, size);
  }
  for (let i = 0; i < 5; i++) {
    starPath(ctx, rng() * W, rng() * H, 4 + rng() * 4);
    ctx.fillStyle = INK.gold;
    ctx.fill();
  }
};

/** Sombra en trama sobre el lado derecho de un planeta. */
const shade = (ctx, x, y, r, density = 0.5) => {
  ctx.save();
  circle(ctx, x, y, r)();
  ctx.clip();
  inkFill(ctx, circle(ctx, x + r * 0.5, y + r * 0.3, r * 1.05), halftone(ctx, INK.navy, density, 3.4));
  ctx.restore();
};

const prism = (ctx, x, y, size, color = INK.gold) => {
  const shape = () => polyPath(ctx, [[x, y - size], [x + size * 0.82, y + size * 0.55], [x - size * 0.82, y + size * 0.55]]);
  paperFill(ctx, shape);
  inkFill(ctx, shape, color);
  inkFill(ctx, () => polyPath(ctx, [[x, y - size], [x + size * 0.82, y + size * 0.55], [x, y + size * 0.18]]), halftone(ctx, INK.navy, 0.3, 2.6));
  keyLine(ctx, shape, 2.2);
  keyLine(ctx, () => { ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x, y + size * 0.18); ctx.lineTo(x - size * 0.82, y + size * 0.55); ctx.moveTo(x, y + size * 0.18); ctx.lineTo(x + size * 0.82, y + size * 0.55); }, 1.3);
};

// ---------- Las ilustraciones ----------
const ART = {
  /** La Tierra agotada: mares que retroceden, tierra seca y grietas. */
  earth: (ctx) => {
    space(ctx, 21);
    const x = 240, y = 168, r = 112;
    const globe = circle(ctx, x, y, r);
    paperFill(ctx, globe);
    inkFill(ctx, globe, INK.teal, 0.85);
    ctx.save();
    globe();
    ctx.clip();
    const lands = [
      [[150, 110], [205, 82], [250, 100], [262, 150], [226, 196], [178, 184], [146, 150]],
      [[272, 176], [322, 150], [352, 186], [334, 246], [286, 262], [262, 222]],
      [[196, 226], [232, 232], [238, 270], [204, 280]],
    ];
    for (const land of lands) {
      const shape = () => polyPath(ctx, land);
      paperFill(ctx, shape);
      inkFill(ctx, shape, INK.gold);
      keyLine(ctx, shape, 1.6);
    }
    // Calor que sube desde abajo
    halftoneGradient(ctx, globe, INK.coral, (px, py) => 0.6 * Math.max(0, (py - y + 20) / r), { x: x - r, y: y - r, w: r * 2, h: r * 2 }, 4.5);
    // Grietas
    keyLine(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(190, 60); ctx.lineTo(214, 112); ctx.lineTo(198, 150); ctx.lineTo(232, 196); ctx.lineTo(220, 236); ctx.lineTo(250, 284);
      ctx.moveTo(214, 112); ctx.lineTo(252, 126); ctx.lineTo(276, 110);
      ctx.moveTo(232, 196); ctx.lineTo(280, 204); ctx.lineTo(300, 236);
      ctx.moveTo(198, 150); ctx.lineTo(162, 166);
    }, 2.4);
    ctx.restore();
    shade(ctx, x, y, r, 0.22);
    keyLine(ctx, globe, 2.6);
  },

  /** Aztlán: una pirámide escalonada que aparece bajo las capas de roca. */
  ruins: (ctx) => {
    ctx.fillStyle = INK.wall;
    ctx.fillRect(0, 0, W, H);
    // Capas de roca de la excavación
    const layers = [
      { top: 0, ink: INK.coral, density: 0.35 },
      { top: 54, ink: INK.gold, density: 0.5 },
      { top: 104, ink: INK.teal, density: 0.3 },
      { top: 150, ink: INK.navy, density: 0.28 },
    ];
    for (const { top, ink, density } of layers) {
      const band = () => polyPath(ctx, [[0, top], [120, top + 14], [240, top + 4], [360, top + 18], [W, top + 6], [W, top + 60], [0, top + 60]]);
      inkFill(ctx, band, halftone(ctx, ink, density, 4));
    }
    // El hueco excavado
    const pit = () => polyPath(ctx, [[60, 40], [420, 40], [452, H], [28, H]]);
    paperFill(ctx, pit, INK.space);
    halftoneGradient(ctx, pit, INK.gold, (px, py) => 0.55 * Math.max(0, 1 - Math.hypot(px - 240, py - 96) / 190), { x: 28, y: 40, w: 424, h: 280 }, 5, 'source-over');
    // La pirámide
    const steps = [[92, 268, 296, 40], [122, 228, 236, 40], [152, 188, 176, 40], [182, 148, 116, 40]];
    for (const [x, y, w, h] of steps) {
      const step = box(ctx, x, y, w, h, 2);
      paperFill(ctx, step);
      inkFill(ctx, step, INK.gold);
      inkFill(ctx, box(ctx, x + w / 2, y, w / 2, h), halftone(ctx, INK.navy, 0.3, 3));
      keyLine(ctx, step, 2);
    }
    const temple = box(ctx, 206, 104, 68, 44, 2);
    paperFill(ctx, temple);
    inkFill(ctx, temple, INK.coral);
    keyLine(ctx, temple, 2);
    ctx.fillStyle = INK.navy;
    ctx.fillRect(230, 118, 20, 30);
    // Escalinata
    const stairs = () => polyPath(ctx, [[222, 148], [258, 148], [272, 308], [208, 308]]);
    paperFill(ctx, stairs);
    inkFill(ctx, stairs, halftone(ctx, INK.coral, 0.5, 3));
    keyLine(ctx, stairs, 1.8);
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 1.2;
    for (let y = 160; y < 308; y += 12) {
      const spread = ((y - 148) / 160) * 14;
      ctx.beginPath();
      ctx.moveTo(222 - spread, y);
      ctx.lineTo(258 + spread, y);
      ctx.stroke();
    }
    paperGrain(ctx, createRng(3), 0, 0, W, H, 1400);
  },

  /** El grabado: la Luna, el Prisma y sus rayos tallados en piedra. */
  carving: (ctx) => {
    ctx.fillStyle = INK.space;
    ctx.fillRect(0, 0, W, H);
    const slab = () => polyPath(ctx, [[70, 34], [396, 22], [424, 150], [404, 296], [92, 302], [52, 170]]);
    paperFill(ctx, slab, INK.wall);
    halftoneGradient(ctx, slab, INK.navy, (px, py) => 0.34 * Math.min(1, Math.hypot(px - 190, py - 120) / 260), { x: 52, y: 22, w: 372, h: 280 }, 4.4);
    keyLine(ctx, slab, 3);
    // Greca escalonada arriba y abajo
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 2.2;
    for (const y of [58, 262]) {
      ctx.beginPath();
      for (let x = 96; x < 380; x += 32) {
        ctx.moveTo(x, y + 12); ctx.lineTo(x, y); ctx.lineTo(x + 20, y); ctx.lineTo(x + 20, y + 8); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x + 8, y + 16); ctx.lineTo(x + 28, y + 16);
      }
      ctx.stroke();
    }
    // Luna menguante
    const moon = circle(ctx, 150, 136, 34);
    inkFill(ctx, moon, halftone(ctx, INK.navy, 0.5, 3));
    paperFill(ctx, circle(ctx, 164, 128, 30), INK.wall);
    keyLine(ctx, moon, 2.2);
    // El Prisma y sus rayos
    ctx.strokeStyle = INK.coral;
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.34;
      ctx.beginPath();
      ctx.moveTo(276 + Math.cos(a) * 62, 170 + Math.sin(a) * 62);
      ctx.lineTo(276 + Math.cos(a) * (84 + (i % 2) * 14), 170 + Math.sin(a) * (84 + (i % 2) * 14));
      ctx.stroke();
    }
    prism(ctx, 276, 176, 46);
    // Figuras mirando hacia arriba
    ctx.fillStyle = INK.navy;
    for (const x of [118, 150, 182]) {
      ctx.beginPath();
      ctx.arc(x, 214, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 5, 222, 10, 22);
    }
    paperGrain(ctx, createRng(8), 52, 22, 372, 280, 1100);
  },

  /** El rayo rojo de Marte, con su destello azul, cae sobre el Prisma. */
  bolt: (ctx) => {
    space(ctx, 34);
    const mars = circle(ctx, 240, 400, 250);
    paperFill(ctx, mars);
    inkFill(ctx, mars, INK.coral);
    inkFill(ctx, mars, halftone(ctx, INK.gold, 0.4, 4));
    ctx.save();
    mars();
    ctx.clip();
    for (const [x, y, r] of [[150, 250, 26], [330, 268, 34], [250, 296, 16]]) {
      inkFill(ctx, circle(ctx, x, y, r), halftone(ctx, INK.navy, 0.4, 3));
    }
    ctx.restore();
    keyLine(ctx, mars, 2.6);
    // Destello azul
    const flash = circle(ctx, 250, 150, 120);
    halftoneGradient(ctx, flash, FLASH_BLUE, (px, py) => 0.9 * Math.max(0, 1 - Math.hypot(px - 250, py - 150) / 120), { x: 130, y: 30, w: 240, h: 240 }, 4.6, 'source-over');
    // El rayo
    const bolt = () => polyPath(ctx, [[282, 0], [228, 92], [262, 96], [214, 168], [246, 172], [226, 222], [298, 132], [262, 128], [308, 58], [276, 54], [300, 0]]);
    paperFill(ctx, bolt);
    inkFill(ctx, bolt, INK.coral);
    keyLine(ctx, bolt, 2.4);
    prism(ctx, 228, 236, 30);
    starPath(ctx, 228, 214, 20, 4);
    ctx.fillStyle = INK.paper;
    ctx.fill();
  },

  /** Marte desde la nave que llega. */
  mars: (ctx) => {
    space(ctx, 61);
    const disc = circle(ctx, 300, 190, 150);
    paperFill(ctx, disc);
    inkFill(ctx, disc, INK.coral);
    inkFill(ctx, disc, halftone(ctx, INK.gold, 0.35, 4));
    ctx.save();
    disc();
    ctx.clip();
    for (const [x, y, r] of [[240, 140, 30], [350, 220, 44], [290, 270, 20], [380, 120, 16]]) inkFill(ctx, circle(ctx, x, y, r), halftone(ctx, INK.navy, 0.35, 3));
    // Casquete polar
    paperFill(ctx, () => { ctx.beginPath(); ctx.ellipse(300, 46, 70, 16, 0, 0, Math.PI * 2); });
    ctx.restore();
    shade(ctx, 300, 190, 150, 0.22);
    keyLine(ctx, disc, 2.6);
    // La nave, chica, llegando
    const ship = () => polyPath(ctx, [[60, 250], [96, 236], [104, 246], [70, 262]]);
    paperFill(ctx, ship);
    inkFill(ctx, ship, INK.teal);
    keyLine(ctx, ship, 1.8);
    starPath(ctx, 52, 262, 8, 2);
    ctx.fillStyle = INK.gold;
    ctx.fill();
  },

  /** La tormenta de polvo que tapa el Sol. */
  storm: (ctx) => {
    ctx.fillStyle = '#b5553d';
    ctx.fillRect(0, 0, W, H);
    const all = () => { ctx.beginPath(); ctx.rect(0, 0, W, H); };
    halftoneGradient(ctx, all, INK.navy, (px, py) => 0.25 + 0.5 * Math.abs(Math.sin(px * 0.012 + py * 0.03)) * (1 - py / H), { x: 0, y: 0, w: W, h: H }, 5);
    // Suelo y el aparato a contraluz
    const ground = () => polyPath(ctx, [[0, 250], [140, 238], [300, 246], [W, 232], [W, H], [0, H]]);
    paperFill(ctx, ground, '#7a2f24');
    inkFill(ctx, ground, halftone(ctx, INK.navy, 0.6, 3));
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 4;
    for (const dx of [-30, 0, 30]) { ctx.beginPath(); ctx.moveTo(240 + dx, 246); ctx.lineTo(240, 176); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(240, 176); ctx.lineTo(240, 140); ctx.stroke();
    prism(ctx, 240, 190, 16);
    // Ráfagas
    ctx.strokeStyle = withAlpha(INK.paper, 0.55);
    ctx.lineWidth = 2;
    for (const [x, y, w] of [[20, 60, 180], [220, 96, 220], [60, 150, 150], [300, 200, 160], [10, 214, 120]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y - 12, x + w, y + 4); ctx.stroke(); }
    // Un relámpago lejano
    const far = () => polyPath(ctx, [[400, 0], [384, 50], [396, 52], [376, 104], [410, 44], [398, 42], [414, 0]]);
    paperFill(ctx, far);
    inkFill(ctx, far, INK.coral, 0.6);
  },

  /** Marte después del rayo: el primer verde. */
  bloom: (ctx) => {
    ctx.fillStyle = '#cfe0e6';
    ctx.fillRect(0, 0, W, H);
    const all = () => { ctx.beginPath(); ctx.rect(0, 0, W, 200); };
    halftoneGradient(ctx, all, FLASH_BLUE, (px, py) => 0.5 * (1 - py / 200), { x: 0, y: 0, w: W, h: 200 }, 5);
    const hills = () => polyPath(ctx, [[0, 190], [90, 150], [180, 178], [290, 136], [400, 172], [W, 150], [W, H], [0, H]]);
    paperFill(ctx, hills, '#d98a63');
    inkFill(ctx, hills, halftone(ctx, '#7a2f24', 0.3, 4));
    keyLine(ctx, hills, 2);
    // Manchas verdes que se abren desde el Prisma
    for (const [x, y, r] of [[240, 262, 120], [120, 286, 70], [380, 280, 80], [250, 220, 60]]) {
      const patch = () => { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.32, 0, 0, Math.PI * 2); };
      paperFill(ctx, patch, '#bfe3b4');
      inkFill(ctx, patch, halftone(ctx, INK.teal, 0.5, 3.6));
    }
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 2;
    for (const [x, y, s] of [[120, 280, 16], [170, 262, 22], [300, 268, 20], [352, 284, 15], [410, 270, 18], [60, 296, 12]]) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s); ctx.stroke();
      for (const side of [-1, 1]) {
        const leaf = () => { ctx.beginPath(); ctx.ellipse(x + side * s * 0.45, y - s, s * 0.45, s * 0.22, side * -0.5, 0, Math.PI * 2); };
        paperFill(ctx, leaf, '#5fae5a');
        keyLine(ctx, leaf, 1.4);
      }
    }
    // El Prisma, encendido
    const glow = circle(ctx, 240, 196, 60);
    halftoneGradient(ctx, glow, FLASH_BLUE, (px, py) => 0.9 * Math.max(0, 1 - Math.hypot(px - 240, py - 196) / 60), { x: 180, y: 136, w: 120, h: 120 }, 4.4, 'source-over');
    prism(ctx, 240, 200, 26, INK.teal);
    starPath(ctx, 240, 180, 16, 4);
    ctx.fillStyle = INK.paper;
    ctx.fill();
  },

  /** La cara oculta de la Luna: la mitad que nunca se ve desde la Tierra. */
  moon: (ctx) => {
    space(ctx, 55);
    const x = 250, y = 164, r = 118;
    const disc = circle(ctx, x, y, r);
    paperFill(ctx, disc);
    inkFill(ctx, disc, halftone(ctx, INK.navy, 0.1, 3.4));
    ctx.save();
    disc();
    ctx.clip();
    for (const [cx, cy, cr] of [[196, 120, 22], [232, 210, 30], [176, 190, 12], [258, 96, 14], [214, 158, 8]]) {
      inkFill(ctx, circle(ctx, cx, cy, cr), halftone(ctx, INK.navy, 0.3, 3));
      keyLine(ctx, circle(ctx, cx, cy, cr), 1.3);
    }
    // La cara oculta, en sombra
    const dark = () => { ctx.beginPath(); ctx.rect(x + 18, y - r, r, r * 2); };
    inkFill(ctx, dark, halftone(ctx, INK.navy, 0.82, 3));
    inkFill(ctx, () => { ctx.beginPath(); ctx.rect(x - 6, y - r, 26, r * 2); }, halftone(ctx, INK.navy, 0.5, 3));
    ctx.restore();
    keyLine(ctx, disc, 2.6, INK.paper);
    // Algo brilla ahí
    starPath(ctx, x + 66, y + 22, 13, 3);
    ctx.fillStyle = INK.gold;
    ctx.fill();
    // La Tierra, lejos
    const home = circle(ctx, 70, 250, 22);
    paperFill(ctx, home);
    inkFill(ctx, home, INK.teal);
    shade(ctx, 70, 250, 22, 0.5);
    keyLine(ctx, home, 1.8);
  },

  /** El repetidor: la Luna tapa la señal; el satélite en órbita la rebota hacia la Tierra. */
  relay: (ctx) => {
    space(ctx, 77);
    // La Tierra, a la izquierda
    const home = circle(ctx, 62, 160, 40);
    paperFill(ctx, home);
    inkFill(ctx, home, INK.teal);
    shade(ctx, 62, 160, 40, 0.4);
    keyLine(ctx, home, 2.2);
    // La Luna, con su cara oculta (derecha) en sombra
    const mx = 330, my = 170, mr = 74;
    const moonDisc = circle(ctx, mx, my, mr);
    paperFill(ctx, moonDisc);
    inkFill(ctx, moonDisc, halftone(ctx, INK.navy, 0.12, 3.4));
    ctx.save();
    moonDisc();
    ctx.clip();
    inkFill(ctx, () => { ctx.beginPath(); ctx.rect(mx + 6, my - mr, mr, mr * 2); }, halftone(ctx, INK.navy, 0.75, 3));
    ctx.restore();
    keyLine(ctx, moonDisc, 2.4, INK.paper);
    // La nave en el lado oculto y la señal bloqueada (línea coral cortada)
    paperFill(ctx, circle(ctx, mx + mr + 26, my + 6, 6), INK.coral);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK.coral;
    ctx.beginPath();
    ctx.moveTo(mx + mr + 20, my + 6);
    ctx.lineTo(mx + mr - 4, my + 4);
    ctx.stroke();
    // La señal que sí llega: nave → satélite → Tierra (dorada)
    const sx = 360, sy = 58;
    ctx.strokeStyle = INK.gold;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(mx + mr + 26, my);
    ctx.lineTo(sx + 8, sy + 8);
    ctx.lineTo(96, 140);
    ctx.stroke();
    ctx.restore();
    // La órbita del satélite
    ctx.strokeStyle = withAlpha(INK.paper, 0.35);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(mx, my, mr + 46, mr + 60, 0, 0, Math.PI * 2);
    ctx.stroke();
    // El satélite repetidor
    for (const side of [-1, 1]) {
      const wing = box(ctx, sx + side * 12 - (side < 0 ? 18 : 0), sy - 5, 18, 10, 1);
      paperFill(ctx, wing, INK.teal);
      keyLine(ctx, wing, 1.4);
    }
    const body = box(ctx, sx - 8, sy - 9, 16, 18, 2);
    paperFill(ctx, body);
    inkFill(ctx, body, INK.gold);
    keyLine(ctx, body, 1.6);
    starPath(ctx, sx, sy - 22, 7, 2);
    ctx.fillStyle = INK.gold;
    ctx.fill();
  },

  /** Despegue. */
  rocket: (ctx) => {
    space(ctx, 13);
    ctx.save();
    ctx.translate(250, 150);
    ctx.rotate(0.3);
    // Estela
    const trail = () => polyPath(ctx, [[-16, 86], [16, 86], [44, 260], [-44, 260]]);
    halftoneGradient(ctx, trail, INK.paper, (px, py) => 0.75 * (1 - (py - 86) / 180), { x: -44, y: 86, w: 88, h: 180 }, 5, 'source-over');
    for (const { color, scale } of [{ color: INK.gold, scale: 1 }, { color: INK.coral, scale: 0.68 }, { color: INK.paper, scale: 0.36 }]) {
      ctx.beginPath();
      ctx.moveTo(-15 * scale, 78);
      ctx.quadraticCurveTo(-18 * scale, 78 + 50 * scale, 0, 78 + 92 * scale);
      ctx.quadraticCurveTo(18 * scale, 78 + 50 * scale, 15 * scale, 78);
      ctx.fillStyle = color;
      ctx.fill();
    }
    for (const side of [-1, 1]) {
      const fin = () => polyPath(ctx, [[side * 24, 30], [side * 56, 84], [side * 56, 100], [side * 24, 74]]);
      paperFill(ctx, fin, INK.gold);
      keyLine(ctx, fin, 2);
    }
    ctx.fillStyle = INK.navy;
    ctx.fillRect(-16, 72, 32, 10);
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(-26, 76);
      ctx.lineTo(-26, -50);
      ctx.quadraticCurveTo(-22, -104, 0, -124);
      ctx.quadraticCurveTo(22, -104, 26, -50);
      ctx.lineTo(26, 76);
      ctx.closePath();
    };
    const nose = () => {
      ctx.beginPath();
      ctx.moveTo(-25.5, -58);
      ctx.quadraticCurveTo(-22, -104, 0, -124);
      ctx.quadraticCurveTo(22, -104, 25.5, -58);
      ctx.closePath();
    };
    paperFill(ctx, body);
    ctx.save();
    body();
    ctx.clip();
    inkFill(ctx, box(ctx, 4, -130, 30, 220), halftone(ctx, INK.navy, 0.3, 3));
    ctx.restore();
    inkFill(ctx, nose, INK.coral);
    inkFill(ctx, box(ctx, -26, 44, 52, 9), INK.coral);
    for (const wy of [-30, 6]) {
      const port = circle(ctx, 0, wy, 10);
      paperFill(ctx, port, INK.teal);
      keyLine(ctx, port, 2);
    }
    keyLine(ctx, body, 2.4);
    keyLine(ctx, nose, 1.6);
    ctx.restore();
  },
};

/** Nombres de ilustración que existen (para avisar si una página pide una que no está). */
export const hasArt = (name) => name in ART || name in IMAGES;

/**
 * Pinta la ilustración `name` en el canvas, al tamaño que tenga en pantalla.
 * @param {HTMLCanvasElement} canvas
 */
export const drawArt = (canvas, name) => {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round((canvas.clientWidth * H / W) * dpr));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(width / W, 0, 0, height / H, 0, 0);
  ctx.lineJoin = 'round';

  const source = IMAGES[name];
  if (source) {
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, W, H);
    image.src = source;
    return;
  }
  (ART[name] ?? ART.rocket)(ctx);
};
