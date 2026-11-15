/**
 * PILOTAJE
 * Vuelo pilotea de verdad. Dos juegos, con el mismo marco que js/minigames.js:
 *
 *   playBurn    un encendido: mantener la nariz sobre la marca (que se mueve) mientras el motor empuja,
 *               y cortar justo al llegar al Δv pedido. Devuelve cuánto Δv se quemó (`dv`) y qué tan bien
 *               se apuntó (`aim`, 0 a 1). Pasarse gasta combustible; quedarse corto pide otro encendido.
 *   playLander  el alunizaje: girar y empujar para frenar la caída y posarse despacio sobre la marca.
 *               Devuelve el Δv gastado (`dv`, más si se malgasta), la puntería y cómo tocó (`touchdown`).
 *
 * El servidor (server/flight.js) aplica el resultado a la nave verdadera: la física de la nave (masa,
 * combustible, Δv) es la real del juego; el movimiento en pantalla es una representación jugable.
 */
import { clamp, meter, paper, runGame, text } from './minigames.js';
import { number } from './partinfo.js';
import { INK, createRng, halftone, polyPath, starPath, withAlpha } from './riso.js';
import { sounds } from './sound.js';

const DEG = Math.PI / 180;
const held = (keys, ...codes) => codes.some((code) => keys.has(code));

/** Botones dibujados en el lienzo, para jugar con mouse o pantalla táctil. */
const touchButtons = (ctx, pointer, buttons) => ({
  // Un botón está apretado si CUALQUIER dedo (o el mouse) está sobre él: se puede empujar y girar a la vez.
  pressed: (id) => {
    const b = buttons.find((button) => button.id === id);
    if (!b || !pointer.down) return false;
    const inside = (p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    return pointer.points?.size ? [...pointer.points.values()].some(inside) : inside(pointer);
  },
  draw: (active) => {
    for (const b of buttons) {
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 7);
      ctx.fillStyle = active(b.id) ? INK.gold : INK.paper;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK.navy;
      ctx.stroke();
      text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, { size: b.size ?? 14 });
    }
  },
});

const drawShip = (ctx, x, y, angle, flame, scale = 1) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  if (flame > 0) {
    const flicker = 0.8 + Math.random() * 0.3;
    for (const { color, k } of [{ color: INK.gold, k: 1 }, { color: INK.coral, k: 0.66 }, { color: INK.paper, k: 0.34 }]) {
      ctx.beginPath();
      ctx.moveTo(-12 * k, 34);
      ctx.quadraticCurveTo(0, 34 + (30 + 90 * flame) * k * flicker, 12 * k, 34);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
  for (const side of [-1, 1]) {
    polyPath(ctx, [[side * 14, 10], [side * 30, 36], [side * 14, 34]]);
    ctx.fillStyle = INK.gold;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK.navy;
    ctx.stroke();
  }
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-14, 34);
    ctx.lineTo(-14, -18);
    ctx.quadraticCurveTo(-12, -44, 0, -54);
    ctx.quadraticCurveTo(12, -44, 14, -18);
    ctx.lineTo(14, 34);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = INK.paper;
  ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = INK.coral;
  ctx.fillRect(-14, -54, 28, 24);
  ctx.fillRect(-14, 22, 28, 6);
  ctx.fillStyle = halftone(ctx, INK.navy, 0.28, 2.6);
  ctx.fillRect(2, -54, 14, 90);
  ctx.restore();
  body();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK.navy;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -8, 6, 0, Math.PI * 2);
  ctx.fillStyle = INK.teal;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

/**
 * Un encendido pilotado a mano.
 * @param {{ title: string, how?: string, target: number, sigma?: number, sim?: boolean, onProgress?: (fraction: number, thrust: number) => void }} options
 * @returns {Promise<{ ok: boolean, dv?: number, aim?: number }>}
 */
export const playBurn = ({ title, how = '', target, sigma = 0.015, sim = false, onProgress = () => {} }) =>
  runGame({
    title,
    how: how || 'Mantén la nariz (coral) sobre la marca dorada mientras empujas, y corta justo al llegar al Δv pedido.',
    keysHint: 'A / D o ◀ ▶ giran · ESPACIO empuja · MAYÚS empuje fino · ENTER termina el encendido',
    width: 720, height: 400,
  }, (api) => {
    const { ctx, width: W, height: H, keys, pointer } = api;
    const SCENE = 470; // ancho de la escena; a la derecha van los instrumentos
    const cx = SCENE / 2, cy = 196, RING = 132;
    const duration = clamp(4 + 6 * (target / 3000), 4, 10); // segundos de empuje pleno para todo el encendido
    const rate = target / duration;
    const wobble = clamp(sigma / 0.015, 0.7, 2.4); // con peor guiado, la marca se mueve más
    const phases = [Math.random() * 7, Math.random() * 7, Math.random() * 7];
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * SCENE, y: Math.random() * H, s: 0.5 + Math.random() * 1.6 }));
    const buttons = touchButtons(ctx, pointer, [
      { id: 'left', label: '◀', x: 14, y: H - 54, w: 54, h: 42, size: 20 },
      { id: 'right', label: '▶', x: 74, y: H - 54, w: 54, h: 42, size: 20 },
      { id: 'fine', label: 'FINO', x: SCENE - 230, y: H - 54, w: 74, h: 42 },
      { id: 'thrust', label: 'EMPUJE', x: SCENE - 150, y: H - 54, w: 136, h: 42, size: 16 },
      { id: 'end', label: 'TERMINAR', x: SCENE + 20, y: H - 54, w: W - SCENE - 40, h: 42 },
    ]);
    let t = 0, ship = -40 * DEG, spin = 0, dv = 0, thrust = 0, aimSum = 0, thrustTime = 0, idle = 0, soundAt = 0;
    const markAt = (time) => (26 * Math.sin(time * 0.62 + phases[0]) + 15 * Math.sin(time * 1.7 + phases[1])) * wobble * DEG;
    const finish = () => {
      if (dv < 1) return api.lose({}, 'Sin encendido');
      const aim = thrustTime > 0 ? aimSum / thrustTime : 0;
      api.win({ dv: Math.round(dv), aim: Number(aim.toFixed(3)) }, 'Motor apagado');
    };
    return {
      key(code, down) { if (down && code === 'Enter') finish(); },
      pointer(type) { if (type === 'down' && buttons.pressed('end')) finish(); },
      update(dt) {
        t += dt;
        const turn = (held(keys, 'ArrowRight', 'KeyD') || buttons.pressed('right') ? 1 : 0) - (held(keys, 'ArrowLeft', 'KeyA') || buttons.pressed('left') ? 1 : 0);
        const full = held(keys, 'Space', 'ArrowUp', 'KeyW') || buttons.pressed('thrust');
        const fine = held(keys, 'ShiftLeft', 'ShiftRight', 'KeyF') || buttons.pressed('fine');
        thrust = full && !fine ? 1 : fine ? 0.18 : 0;
        // El motor empujando sacude la nave: hay que corregir mientras se quema.
        const shake = thrust * Math.sin(t * 4.3 + phases[2]) * 46 * DEG * wobble;
        spin = (spin + (turn * 300 * DEG + shake) * dt) * Math.exp(-3.2 * dt);
        ship += spin * dt;
        const error = Math.abs(ship - markAt(t));
        const quality = clamp(1 - error / (28 * DEG), 0, 1);
        if (thrust > 0) {
          dv += rate * thrust * dt * Math.max(0.3, Math.cos(Math.min(error, Math.PI / 2)));
          aimSum += quality * thrust * dt;
          thrustTime += thrust * dt;
          idle = 0;
          if (t > soundAt) { sounds.thrust?.(thrust); soundAt = t + 0.16; }
          for (const star of stars) {
            star.x -= Math.sin(ship) * 190 * thrust * dt * star.s;
            star.y += Math.cos(ship) * 190 * thrust * dt * star.s;
            if (star.y > H) star.y -= H; if (star.y < 0) star.y += H;
            if (star.x > SCENE) star.x -= SCENE; if (star.x < 0) star.x += SCENE;
          }
        } else {
          idle += dt;
        }
        onProgress(dv / target, thrust);
        if (dv >= target * 1.2) return finish(); // tope de seguridad del motor
        if (dv >= target * 0.995 && idle > 1.1) finish();
      },
      draw() {
        // Escena
        ctx.fillStyle = INK.space;
        ctx.fillRect(0, 0, SCENE, H);
        for (const star of stars) {
          ctx.fillStyle = withAlpha(INK.paper, 0.4 + star.s * 0.3);
          ctx.fillRect(star.x, star.y, star.s * 1.5, star.s * 1.5);
        }
        const mark = markAt(t);
        const error = Math.abs(ship - mark);
        const good = error < 9 * DEG;
        ctx.beginPath();
        ctx.arc(cx, cy, RING, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = withAlpha(INK.paper, 0.25);
        ctx.stroke();
        // Zona buena alrededor de la marca
        ctx.beginPath();
        ctx.arc(cx, cy, RING, mark - Math.PI / 2 - 9 * DEG, mark - Math.PI / 2 + 9 * DEG);
        ctx.lineWidth = 12;
        ctx.strokeStyle = good ? INK.teal : withAlpha(INK.gold, 0.8);
        ctx.stroke();
        const mx = cx + Math.sin(mark) * RING, my = cy - Math.cos(mark) * RING;
        starPath(ctx, mx, my, 15);
        ctx.fillStyle = INK.gold;
        ctx.fill();
        // Nariz de la nave sobre el anillo
        const nx = cx + Math.sin(ship) * RING, ny = cy - Math.cos(ship) * RING;
        ctx.beginPath();
        ctx.arc(nx, ny, 8, 0, Math.PI * 2);
        ctx.fillStyle = INK.coral;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = INK.paper;
        ctx.stroke();
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = withAlpha(INK.coral, 0.6);
        ctx.stroke();
        ctx.setLineDash([]);
        drawShip(ctx, cx, cy, ship, thrust);
        text(ctx, good ? 'NARIZ EN LA MARCA' : 'CORRIGE EL RUMBO', cx, 24, { size: 15, color: good ? INK.teal : INK.gold });
        // Instrumentos
        ctx.fillStyle = INK.paper;
        ctx.fillRect(SCENE, 0, W - SCENE, H);
        ctx.fillStyle = INK.navy;
        ctx.fillRect(SCENE, 0, 3, H);
        const px = SCENE + 20, pw = W - SCENE - 40;
        text(ctx, sim ? 'SIMULADOR' : 'Δv DEL ENCENDIDO', px, 26, { size: 13, align: 'left', color: withAlpha(INK.navy, 0.75) });
        text(ctx, `${number(dv)} m/s`, px, 54, { size: 30, align: 'left', narrow: false });
        text(ctx, `pedido ${number(target)} m/s`, px, 80, { size: 14, weight: 600, align: 'left' });
        // Barra vertical: 0 abajo, 120 % arriba; la raya dorada es lo pedido.
        const barX = px + 8, barY = 100, barH = 190, barW = 54;
        ctx.fillStyle = withAlpha(INK.navy, 0.1);
        ctx.fillRect(barX, barY, barW, barH);
        const fraction = clamp(dv / (target * 1.2), 0, 1);
        const over = dv > target * 1.005;
        ctx.fillStyle = over ? INK.coral : dv >= target * 0.995 ? INK.teal : INK.gold;
        ctx.fillRect(barX, barY + barH * (1 - fraction), barW, barH * fraction);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = INK.navy;
        ctx.strokeRect(barX, barY, barW, barH);
        const targetY = barY + barH * (1 - 1 / 1.2);
        ctx.fillStyle = INK.navy;
        ctx.fillRect(barX - 8, targetY - 1.5, barW + 16, 3);
        text(ctx, '100 %', barX + barW + 14, targetY, { size: 12, align: 'left' });
        const missing = target - dv;
        text(ctx, over ? `+${number(-missing)} de más` : `faltan ${number(Math.max(0, missing))}`, barX + barW + 14, targetY + 20, { size: 13, weight: 600, align: 'left', color: over ? INK.coral : INK.navy });
        const aim = thrustTime > 0 ? aimSum / thrustTime : 0;
        text(ctx, `Puntería ${Math.round(aim * 100)} %`, px, 312, { size: 14, align: 'left' });
        meter(ctx, px, 322, pw, 12, aim, aim > 0.75 ? INK.teal : aim > 0.45 ? INK.gold : INK.coral);
        buttons.draw((id) => (id === 'thrust' && thrust === 1) || (id === 'fine' && thrust > 0 && thrust < 1) || buttons.pressed(id));
      },
    };
  });

/**
 * El alunizaje, a mano.
 * @param {{ title: string, budget: number, onProgress?: (fraction: number, thrust: number) => void }} options  budget = Δv que pide el tramo (m/s)
 * @returns {Promise<{ ok: boolean, dv?: number, aim?: number, touchdown?: 'soft' | 'hard' | 'crash' }>}
 */
export const playLander = ({ title, budget, onProgress = () => {} }) =>
  runGame({
    title,
    how: 'Gira y empuja para frenar. Pósate despacio y derecho sobre la marca dorada: sin aire, todo el frenado es del motor.',
    keysHint: 'A / D o ◀ ▶ giran · ESPACIO o ▲ empuja',
    width: 720, height: 400, closable: false,
  }, (api) => {
    const { ctx, width: W, height: H, keys, pointer } = api;
    // Unidades del juego (no son metros reales): gravedad lunar "acelerada" para que dure unos 15 s.
    // PAR ≈ 1,6 veces el mínimo (unas 88 unidades frenando justo a tiempo): deja margen a quien recién aprende.
    const GRAVITY = 6, ACCEL = 15, PAR = 140, FUEL = PAR * 1.6, SOFT_DOWN = 10, SOFT_SIDE = 7;
    const GROUND = H - 46, SCALE = 1.05, PAD = 44;
    const toScreen = (x, y) => [W / 2 + x * SCALE, GROUND - y * SCALE];
    const terrain = createRng(Math.floor(Math.random() * 1e6));
    const bumps = Array.from({ length: 40 }, (_v, i) => ({ x: -360 + i * 19, h: Math.abs(-360 + i * 19) < 70 ? 0 : terrain() * 16 }));
    const buttons = touchButtons(ctx, pointer, [
      { id: 'left', label: '◀', x: 14, y: H - 40, w: 54, h: 32, size: 18 },
      { id: 'right', label: '▶', x: 74, y: H - 40, w: 54, h: 32, size: 18 },
      { id: 'thrust', label: 'EMPUJE', x: W - 150, y: H - 40, w: 136, h: 32, size: 15 },
    ]);
    const lander = { x: -175, y: 255, vx: 27, vy: -4, angle: 0 };
    let used = 0, thrust = 0, t = 0, soundAt = 0;
    const land = () => {
      const tilt = Math.abs(lander.angle) / DEG;
      const onPad = Math.abs(lander.x) <= PAD + 6;
      const down = -lander.vy, side = Math.abs(lander.vx);
      const touchdown = down < SOFT_DOWN && side < SOFT_SIDE && tilt < 20 && onPad ? 'soft' : down < 18 && side < 12 && tilt < 40 ? 'hard' : 'crash';
      // Lo quemado de más cuesta combustible de verdad (hasta 20 % más que lo que pide el tramo).
      const factor = clamp(0.96 + 0.5 * Math.max(0, used / PAR - 1), 0.96, 1.2);
      const aim = clamp(1 - Math.abs(lander.x) / 170, 0, 1);
      const result = { dv: Math.round(budget * factor), aim: Number(aim.toFixed(3)), touchdown };
      const label = touchdown === 'soft' ? '¡Alunizaje suave!' : touchdown === 'hard' ? 'Alunizaje duro' : '¡Golpe contra el suelo!';
      if (touchdown === 'crash') api.lose({ ...result, ok: true }, label);
      else api.win(result, label);
    };
    return {
      update(dt) {
        t += dt;
        const turn = (held(keys, 'ArrowRight', 'KeyD') || buttons.pressed('right') ? 1 : 0) - (held(keys, 'ArrowLeft', 'KeyA') || buttons.pressed('left') ? 1 : 0);
        lander.angle = clamp(lander.angle + turn * 130 * DEG * dt, -80 * DEG, 80 * DEG);
        thrust = (held(keys, 'Space', 'ArrowUp', 'KeyW') || buttons.pressed('thrust')) && used < FUEL ? 1 : 0;
        if (thrust) {
          lander.vx += Math.sin(lander.angle) * ACCEL * dt;
          lander.vy += Math.cos(lander.angle) * ACCEL * dt;
          used += ACCEL * dt;
          if (t > soundAt) { sounds.thrust?.(1); soundAt = t + 0.16; }
        }
        lander.vy -= GRAVITY * dt;
        lander.x = clamp(lander.x + lander.vx * dt, -330, 330);
        lander.y += lander.vy * dt;
        if (Math.abs(lander.x) >= 330) lander.vx = 0;
        if (lander.y > 300) { lander.y = 300; lander.vy = Math.min(0, lander.vy); }
        onProgress(used / PAR, thrust);
        if (lander.y <= 0) {
          lander.y = 0;
          land();
        }
      },
      draw() {
        ctx.fillStyle = INK.space;
        ctx.fillRect(0, 0, W, H);
        const rng = createRng(9);
        for (let i = 0; i < 90; i++) {
          ctx.fillStyle = withAlpha(INK.paper, 0.3 + rng() * 0.6);
          ctx.fillRect(rng() * W, rng() * (GROUND - 30), 1.6, 1.6);
        }
        // Suelo lunar con la marca
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(0, GROUND);
        for (const bump of bumps) ctx.lineTo(W / 2 + bump.x * SCALE, GROUND - bump.h);
        ctx.lineTo(W, GROUND);
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = '#d9d2bf';
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = halftone(ctx, INK.navy, 0.3, 3.4);
        ctx.fillRect(0, GROUND + 8, W, H);
        ctx.restore();
        ctx.fillStyle = INK.gold;
        ctx.fillRect(W / 2 - PAD * SCALE, GROUND - 3, PAD * 2 * SCALE, 6);
        text(ctx, 'ZONA DE ALUNIZAJE', W / 2, GROUND + 18, { size: 11, color: INK.navy });
        // Sombra y nave
        const [sx, sy] = toScreen(lander.x, lander.y);
        ctx.beginPath();
        ctx.ellipse(sx, GROUND + 2, 26 * clamp(1 - lander.y / 300, 0.3, 1), 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(INK.navy, 0.35);
        ctx.fill();
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(lander.angle);
        if (thrust) {
          const flicker = 0.8 + Math.random() * 0.3;
          for (const { color, k } of [{ color: INK.gold, k: 1 }, { color: INK.coral, k: 0.6 }]) {
            ctx.beginPath();
            ctx.moveTo(-8 * k, -6);
            ctx.quadraticCurveTo(0, -6 + 54 * k * flicker, 8 * k, -6);
            ctx.fillStyle = color;
            ctx.fill();
          }
        }
        ctx.strokeStyle = INK.paper;
        ctx.lineWidth = 2.5;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * 12, -14);
          ctx.lineTo(side * 24, 0);
          ctx.moveTo(side * 18, 0);
          ctx.lineTo(side * 30, 0);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.roundRect(-18, -28, 36, 18, 3);
        ctx.fillStyle = INK.gold;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = INK.navy;
        ctx.stroke();
        polyPath(ctx, [[-13, -28], [-9, -48], [9, -48], [13, -28]]);
        ctx.fillStyle = INK.paper;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK.teal;
        ctx.fillRect(-5, -43, 10, 7);
        ctx.restore();

        // Instrumentos
        const down = -lander.vy, side = Math.abs(lander.vx);
        const tone = (value, soft, hard) => (value < soft ? INK.teal : value < hard ? INK.gold : INK.coral);
        ctx.fillStyle = withAlpha(INK.paper, 0.94);
        ctx.fillRect(10, 10, 232, 104);
        ctx.lineWidth = 2;
        ctx.strokeStyle = INK.navy;
        ctx.strokeRect(10, 10, 232, 104);
        const row = (name, value, color, y) => {
          text(ctx, name, 22, y, { size: 13, weight: 600, align: 'left' });
          ctx.fillStyle = color;
          ctx.fillRect(150, y - 9, 10, 18);
          text(ctx, value, 232, y, { size: 15, align: 'right' });
        };
        row('Altura', `${Math.max(0, Math.round(lander.y))}`, INK.navy, 28);
        row('Caída', `${down.toFixed(1)}`, down < 0 ? INK.teal : tone(down, 9, 18), 52);
        row('De costado', `${side.toFixed(1)}`, tone(side, 6, 12), 76);
        row('Inclinación', `${Math.round(Math.abs(lander.angle) / DEG)}°`, tone(Math.abs(lander.angle) / DEG, 20, 40), 100);
        text(ctx, 'COMBUSTIBLE DE DESCENSO', W - 20, 22, { size: 12, align: 'right', color: INK.paper });
        meter(ctx, W - 230, 32, 210, 16, 1 - used / FUEL, used > PAR ? INK.coral : INK.gold);
        const parX = W - 230 + 210 * (1 - PAR / FUEL);
        ctx.fillStyle = INK.paper;
        ctx.fillRect(parX - 1, 28, 2, 24);
        const empty = used >= FUEL;
        text(ctx, empty ? 'SIN COMBUSTIBLE PARA FRENAR: el motor ya no empuja' : used > PAR ? 'gastando de más: ese combustible es del regreso' : `verde = toca suave (caída < ${SOFT_DOWN}, costado < ${SOFT_SIDE})`, W - 20, 64, { size: 12, weight: 700, align: 'right', color: used > PAR ? INK.coral : withAlpha(INK.paper, 0.85) });
        if (empty) text(ctx, 'SIN COMBUSTIBLE', W / 2, 40, { size: 22, color: INK.coral });
        buttons.draw((id) => buttons.pressed(id) || (id === 'thrust' && thrust === 1));
      },
    };
  });
