/**
 * CONSTRUCTOR DE COHETES
 * La herramienta de las etapas Construcción y Validación.
 *   Izquierda  la bodega: piezas compradas que todavía no están puestas
 *   Centro     el cohete, dibujado etapa por etapa (vista esquemática, no a escala)
 *   Derecha    estadísticas en vivo, plan de vuelo y revisión antes de despegar
 *
 * Cómo se arma (solo quien maneja Ingeniería; los demás lo ven en vivo):
 * - Arrastra una pieza de la bodega al cohete. Mientras la arrastras, cada etapa se marca en
 *   dorado si encaja o en coral si no, y dice por qué.
 * - O elige una etapa (clic en ella) y usa el botón "Poner" de la pieza.
 * - Clic en una pieza puesta para ver su ficha, moverla de etapa o quitarla. También se puede
 *   arrastrar a otra etapa, o fuera del cohete para quitarla.
 *
 * Las reglas de encaje están en js/assembly.js y los cálculos en js/rocket.js; el servidor
 * (server/build.js) vuelve a revisar todo: aquí solo se dibuja y se mandan acciones.
 */
import {
  BUILD_STAGES, addStageProblem, canPlace, findInRocket, installedUids, mountPoints, mountsUsed, partFinder,
  stageFuel, stageProblem, toPhysicsStages, withoutPart,
} from './assembly.js';
import { PROPELLANTS, getPart, resolvePart } from './catalog.js';
import { on, sendAction, session } from './connection.js';
import { totalDeltaV } from './flightplans.js';
import { getSeller } from './market.js';
import { getMission } from './missions.js';
import { MOUNT_SIZE, drawPart, drawSize, drawThumb } from './partart.js';
import { conditionName, credits, force, mass, number, tierOf, versionColumns } from './partinfo.js';
import { INK, UI_FONT, condensed, halftone, withAlpha } from './riso.js';
import { validateRocket } from './rocket.js';
import { canActAs } from './shared.js';

const EMPTY_STAGE_HEIGHT = 46;
const NEW_STAGE_HEIGHT = 40;
const DRAG_THRESHOLD = 6;
const SLOT_NAMES = { core: 'Cuerpo', engines: 'Motores', mounted: 'Equipo' };

const BUILDER_HTML = `
<section class="builder" aria-label="Constructor de cohetes">
  <header class="builder-head">
    <p class="builder-role"></p>
    <div class="builder-tools">
      <button type="button" data-do="undo">Deshacer</button>
      <button type="button" data-do="zoom-out" aria-label="Alejar">−</button>
      <button type="button" data-do="zoom-fit">Ajustar</button>
      <button type="button" data-do="zoom-in" aria-label="Acercar">+</button>
    </div>
  </header>
  <div class="builder-body">
    <aside class="builder-hold" aria-label="Bodega"></aside>
    <div class="builder-center">
      <canvas class="builder-canvas" aria-label="El cohete armado. Vista esquemática, no a escala."></canvas>
      <div class="builder-picked" hidden></div>
      <div class="builder-stages"></div>
    </div>
    <aside class="builder-stats" aria-label="Estadísticas y revisión"></aside>
  </div>
</section>`;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (label, className, onClick) => {
  const node = /** @type {HTMLButtonElement} */ (el('button', className, label));
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
};

export const mountBuilder = (container) => {
  container.innerHTML = BUILDER_HTML;
  const $ = (selector) => /** @type {HTMLElement} */ (container.querySelector(selector));
  const canvas = /** @type {HTMLCanvasElement} */ ($('.builder-canvas'));
  const ctx = canvas.getContext('2d');
  const hold = $('.builder-hold');
  const picked = $('.builder-picked');
  const stagesBox = $('.builder-stages');
  const statsBox = $('.builder-stats');

  let activeStage = 0;
  /** @type {string | null} */
  let selectedUid = null;
  /** @type {number | null} */
  let userZoom = null; // null = ajustado a la altura
  let panY = 0;
  /** @type {any} */
  let scene = { items: [], stages: [], newStage: null, height: 0, zoom: 1, originX: 0, originY: 0 };
  /** Arrastre en curso: { uid, from: 'hold' | 'rocket', x, y, target: { stage, ok, reason } | null, ghost } */
  let drag = null;
  let pending = null; // clic que todavía no se sabe si es arrastre

  const data = () => session.state?.data;
  const inventory = () => data()?.economy?.inventory ?? [];
  const rocket = () => data()?.rocket;
  const isEngineer = () => canActAs(session.room.players, session.myId, 'engineer');
  const canEdit = () => {
    const state = data();
    const stage = getMission(state.missionId)?.stages[state.stageIndex];
    return isEngineer() && BUILD_STAGES.includes(stage?.id);
  };
  const itemOf = (uid) => inventory().find((item) => item.uid === uid);
  const find = () => partFinder(inventory());

  // ============================================================
  //  Dónde va cada cosa en el dibujo
  // ============================================================
  /** Calcula la posición de cada pieza. Coordenadas "de plano": x desde el eje, y hacia arriba desde el suelo. */
  const layout = () => {
    const lookup = find();
    const items = [];
    const stages = [];
    let floor = 0;
    rocket().stages.forEach((stage, index) => {
      const engines = stage.engines.map((uid) => ({ uid, part: lookup(uid) })).filter((e) => e.part);
      const core = stage.core.map((uid) => ({ uid, part: lookup(uid) })).filter((e) => e.part);
      const engineHeight = Math.max(0, ...engines.map((e) => drawSize(e.part).h));
      const bodyWidth = Math.max(44, ...core.map((e) => drawSize(e.part).w));

      // Motores: lado a lado, apretados si no caben.
      engines.forEach((entry, n) => {
        const size = drawSize(entry.part);
        const spread = engines.length > 1 ? Math.min(size.w * 0.9, (bodyWidth * 1.2 - size.w) / (engines.length - 1)) : 0;
        items.push({ ...entry, stage: index, slot: 'engines', x: (n - (engines.length - 1) / 2) * spread, top: floor + engineHeight, w: size.w, h: size.h });
      });

      // Cuerpo: apilado.
      let y = floor + engineHeight;
      let below = bodyWidth;
      for (const entry of core) {
        const size = drawSize(entry.part);
        const w = size.w || below;
        items.push({ ...entry, stage: index, slot: 'core', x: 0, top: y + size.h, w, h: size.h });
        y += size.h;
        below = w;
      }
      const empty = engines.length + core.length === 0;
      const top = empty ? floor + EMPTY_STAGE_HEIGHT : y;

      // Equipo: colgado a los costados, de arriba hacia abajo, alternando lado.
      const rows = Math.max(1, Math.floor((top - floor - engineHeight) / (MOUNT_SIZE + 4)));
      stage.mounted.map((uid) => ({ uid, part: lookup(uid) })).filter((e) => e.part && e.part.id !== 'landing-legs').forEach((entry, n) => {
        const side = n % 2 === 0 ? -1 : 1;
        const k = Math.floor(n / 2);
        const column = Math.floor(k / rows);
        items.push({
          ...entry, stage: index, slot: 'mounted',
          x: side * (bodyWidth / 2 + MOUNT_SIZE / 2 + 3 + column * (MOUNT_SIZE + 3)),
          top: top - 4 - (k % rows) * (MOUNT_SIZE + 4), w: MOUNT_SIZE, h: MOUNT_SIZE,
        });
      });
      const legs = stage.mounted.find((uid) => lookup(uid)?.id === 'landing-legs');
      if (legs) items.push({ uid: legs, part: lookup(legs), stage: index, slot: 'legs', x: 0, top: floor + engineHeight + 18, w: bodyWidth + 44, h: engineHeight + 18 });

      stages.push({ index, bottom: floor, top, width: bodyWidth, empty });
      floor = top;
    });
    return { items, stages, height: floor };
  };

  const toScreen = (x, yUp) => ({ x: scene.originX + x * scene.zoom, y: scene.originY - yUp * scene.zoom });

  // ============================================================
  //  Dibujo
  // ============================================================
  const label = (text, x, y, { size = 11, color = INK.navy, align = 'left', weight = 700 } = {}) => {
    ctx.font = `${weight} ${size}px ${UI_FONT}`;
    condensed(ctx);
    ctx.textAlign = /** @type {CanvasTextAlign} */ (align);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    condensed(ctx, false);
  };

  const draw = () => {
    if (!rocket() || canvas.clientWidth === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const plan = layout();
    const showNewStage = canEdit() && !addStageProblem(rocket(), find());
    const total = plan.height + (showNewStage ? NEW_STAGE_HEIGHT : 0);
    const fit = Math.min(1.5, (height - 70) / Math.max(120, total));
    const zoom = userZoom ?? fit;
    const overflow = Math.max(0, total * zoom - (height - 70));
    panY = Math.min(overflow, Math.max(0, panY));
    scene = { ...plan, newStage: null, zoom, originX: width / 2, originY: height - 34 + panY };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Papel de plano con puntos
    ctx.fillStyle = INK.paper;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = withAlpha(INK.navy, 0.16);
    for (let gy = 12; gy < height; gy += 22) for (let gx = 12; gx < width; gx += 22) ctx.fillRect(gx, gy, 1.5, 1.5);
    // Suelo y plataforma
    const ground = toScreen(0, 0).y;
    ctx.fillStyle = halftone(ctx, INK.navy, 0.35, 3);
    ctx.fillRect(0, ground, width, height - ground);
    ctx.fillStyle = INK.navy;
    ctx.fillRect(0, ground - 1, width, 2);
    label('VISTA ESQUEMÁTICA · NO A ESCALA', width - 10, 14, { size: 10, align: 'right', color: withAlpha(INK.navy, 0.6), weight: 600 });

    // Bandas de etapa: la activa en dorado; durante un arrastre, dorado si encaja y coral si no.
    for (const stage of scene.stages) {
      const a = toScreen(0, stage.top), b = toScreen(0, stage.bottom);
      const target = drag?.target?.stage === stage.index ? drag.target : null;
      if (target) {
        ctx.fillStyle = withAlpha(target.ok ? INK.gold : INK.coral, 0.35);
        ctx.fillRect(0, a.y, width, b.y - a.y);
      } else if (stage.index === activeStage && canEdit()) {
        ctx.fillStyle = withAlpha(INK.gold, 0.16);
        ctx.fillRect(0, a.y, width, b.y - a.y);
      }
      ctx.strokeStyle = withAlpha(INK.navy, 0.45);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(0, a.y);
      ctx.lineTo(width, a.y);
      ctx.stroke();
      ctx.setLineDash([]);
      label(`ETAPA ${stage.index + 1}`, 10, (a.y + b.y) / 2, { color: stage.index === activeStage ? INK.navy : withAlpha(INK.navy, 0.6) });
      if (stage.empty) label('vacía: arrastra piezas aquí', width / 2, (a.y + b.y) / 2, { align: 'center', size: 12, weight: 500, color: withAlpha(INK.navy, 0.7) });
    }
    if (showNewStage) {
      const a = toScreen(0, scene.height + NEW_STAGE_HEIGHT), b = toScreen(0, scene.height);
      scene.newStage = { index: scene.stages.length, top: a.y, bottom: b.y };
      const target = drag?.target?.stage === scene.stages.length ? drag.target : null;
      ctx.fillStyle = withAlpha(target ? (target.ok ? INK.gold : INK.coral) : INK.teal, target ? 0.35 : 0.12);
      ctx.fillRect(0, a.y, width, b.y - a.y);
      label(`+ ETAPA ${scene.stages.length + 1} (suelta una pieza aquí para crearla)`, width / 2, (a.y + b.y) / 2, { align: 'center', size: 11, weight: 600 });
    }

    // Piezas
    ctx.save();
    for (const item of scene.items) {
      const dragging = drag?.uid === item.uid;
      ctx.globalAlpha = dragging ? 0.3 : 1;
      const tier = itemOf(item.uid)?.tier ?? null;
      if (item.slot === 'legs') {
        // Patas: dos puntales desde el cuerpo hasta el nivel de las toberas.
        const top = toScreen(0, item.top), bottom = toScreen(0, item.top - item.h);
        const half = (item.w / 2) * scene.zoom;
        const inner = half - 22 * scene.zoom;
        ctx.strokeStyle = INK.navy;
        ctx.lineWidth = Math.max(2, 3 * scene.zoom);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const side of [-1, 1]) { ctx.moveTo(top.x + side * inner, top.y); ctx.lineTo(top.x + side * half, bottom.y); }
        ctx.stroke();
        ctx.fillStyle = INK.gold;
        for (const side of [-1, 1]) ctx.fillRect(top.x + side * half - 7 * scene.zoom, bottom.y - 2, 14 * scene.zoom, 3);
        continue;
      }
      const at = toScreen(item.x, item.slot === 'mounted' ? item.top - item.h / 2 : item.top);
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.scale(scene.zoom, scene.zoom);
      drawPart(ctx, item.part, { x: 0, y: 0, w: item.w, h: item.h, tier });
      ctx.restore();
    }
    ctx.restore();

    // Pieza elegida: marco dorado
    const chosen = scene.items.find((item) => item.uid === selectedUid);
    if (chosen) {
      const r = rectOf(chosen);
      ctx.strokeStyle = INK.coral;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
      ctx.setLineDash([]);
    }
  };

  /** Rectángulo en pantalla de una pieza dibujada. */
  const rectOf = (item) => {
    const top = toScreen(item.x, item.top);
    return { x: top.x - (item.w * scene.zoom) / 2, y: top.y, w: item.w * scene.zoom, h: item.h * scene.zoom };
  };
  const itemAt = (x, y) => [...scene.items].reverse().find((item) => {
    const r = rectOf(item);
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  });
  const stageAt = (y) => {
    if (scene.newStage && y >= scene.newStage.top && y <= scene.newStage.bottom) return scene.newStage.index;
    const hit = scene.stages.find((stage) => y >= toScreen(0, stage.top).y && y <= toScreen(0, stage.bottom).y);
    return hit ? hit.index : null;
  };

  // ============================================================
  //  Arrastrar y soltar
  // ============================================================
  /** ¿La pieza puede ir a esa etapa? Para una pieza ya puesta, primero se la "levanta". */
  const checkDrop = (uid, from, stage) => {
    if (from === 'hold') return canPlace(rocket(), find(), uid, stage);
    const where = findInRocket(rocket(), uid);
    if (where?.stage === stage) return { ok: true, same: true };
    const lifted = withoutPart(rocket(), uid);
    const problem = stageProblem(lifted.stages[where.stage], find());
    return problem ? { ok: false, reason: problem } : canPlace(lifted, find(), uid, stage);
  };

  const startDrag = (uid, from, event) => {
    const part = getPart(itemOf(uid).partId);
    const ghost = el('div', 'drag-ghost');
    const thumb = /** @type {HTMLCanvasElement} */ (el('canvas'));
    drawThumb(thumb, part, itemOf(uid).tier, 34);
    ghost.append(thumb, el('strong', '', part.name), el('span', 'drag-hint'));
    container.querySelector('.builder').append(ghost);
    drag = { uid, from, target: null, ghost };
    moveDrag(event);
  };

  const moveDrag = (event) => {
    const box = canvas.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    const stage = inside ? stageAt(event.clientY - box.top) : null;
    drag.target = stage === null ? null : { stage, ...checkDrop(drag.uid, drag.from, stage) };
    drag.ghost.style.left = `${event.clientX + 14}px`;
    drag.ghost.style.top = `${event.clientY + 14}px`;
    const hint = drag.ghost.querySelector('.drag-hint');
    drag.ghost.classList.toggle('bad', Boolean(drag.target && !drag.target.ok));
    if (!drag.target) hint.textContent = drag.from === 'rocket' ? 'Suelta fuera del cohete para quitarla' : 'Llévala a una etapa';
    else if (drag.target.ok) hint.textContent = drag.target.same ? 'Ya está en esta etapa' : `Encaja en la etapa ${drag.target.stage + 1}`;
    else hint.textContent = drag.target.reason;
    draw();
  };

  const endDrag = () => {
    const { uid, from, target, ghost } = drag;
    ghost.remove();
    drag = null;
    if (target?.ok && !target.same) sendAction({ type: from === 'hold' ? 'build:place' : 'build:move', uid, stage: target.stage });
    else if (!target && from === 'rocket') sendAction({ type: 'build:remove', uid });
    if (target?.ok) activeStage = Math.min(target.stage, rocket().stages.length);
    draw();
  };

  const onPointerMove = (event) => {
    if (drag) return moveDrag(event);
    if (!pending) return;
    const moved = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
    if (pending.pan) {
      panY = pending.panStart + (event.clientY - pending.y);
      draw();
    } else if (moved > DRAG_THRESHOLD && canEdit()) {
      const { uid, from } = pending;
      pending = null;
      startDrag(uid, from, event);
    }
  };
  const onPointerUp = () => {
    if (drag) return endDrag();
    if (pending && !pending.pan && pending.from === 'rocket') {
      selectedUid = pending.uid;
      activeStage = findInRocket(rocket(), pending.uid)?.stage ?? activeStage;
      render();
    }
    pending = null;
  };

  canvas.addEventListener('pointerdown', (event) => {
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    const hit = itemAt(x, y);
    if (hit) {
      pending = { uid: hit.uid, from: 'rocket', x: event.clientX, y: event.clientY };
      return;
    }
    const stage = stageAt(y);
    if (stage !== null && stage < rocket().stages.length) activeStage = stage;
    selectedUid = null;
    pending = { pan: true, x: event.clientX, y: event.clientY, panStart: panY };
    render();
  });
  canvas.addEventListener('wheel', (event) => {
    if (userZoom === null) return;
    event.preventDefault();
    panY -= event.deltaY;
    draw();
  }, { passive: false });

  // ============================================================
  //  Bodega (piezas sin poner)
  // ============================================================
  const renderHold = () => {
    const installed = new Set(installedUids(rocket()));
    const loose = inventory().filter((item) => !installed.has(item.uid));
    const edit = canEdit();
    hold.replaceChildren(el('h4', '', `Bodega (${loose.length})`));
    if (loose.length === 0) {
      hold.append(el('p', 'builder-empty', inventory().length === 0 ? 'No hay piezas compradas. Comercio las compra en el Mercado.' : 'Todas las piezas están puestas.'));
      return;
    }
    const groups = new Map();
    for (const item of loose) {
      const key = [item.partId, item.tier, item.condition, item.source].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    for (const slot of Object.keys(SLOT_NAMES)) {
      const rows = [...groups.values()].filter((items) => getPart(items[0].partId).slot === slot);
      if (rows.length === 0) continue;
      hold.append(el('h5', '', SLOT_NAMES[slot]));
      const list = el('ul', 'hold-list');
      for (const items of rows) {
        const [first] = items;
        const part = getPart(first.partId);
        const tier = tierOf(first.tier);
        const row = el('li', 'hold-item');
        const thumb = /** @type {HTMLCanvasElement} */ (el('canvas'));
        drawThumb(thumb, part, first.tier);
        const text = el('div', 'hold-text');
        text.append(el('strong', '', part.name),
          el('span', '', `${tier.mark} ${tier.name}${first.condition !== 'new' ? ` · ${conditionName(first.condition).toLowerCase()}` : ''}${first.source === 'black' ? ' · mercado negro' : ''} · × ${items.length}`));
        row.append(thumb, text);
        if (edit) {
          const check = canPlace(rocket(), find(), first.uid, activeStage);
          const put = button(`Poner en ${activeStage + 1}`, 'hold-put', () => sendAction({ type: 'build:place', uid: first.uid, stage: activeStage }));
          put.disabled = !check.ok;
          put.title = check.ok ? `Poner en la etapa ${activeStage + 1}` : check.reason;
          row.append(put);
          row.classList.add('draggable');
          row.addEventListener('pointerdown', (event) => {
            if (/** @type {HTMLElement} */ (event.target).closest('button')) return;
            event.preventDefault();
            pending = { uid: first.uid, from: 'hold', x: event.clientX, y: event.clientY };
          });
        }
        list.append(row);
      }
      hold.append(list);
    }
  };

  // ============================================================
  //  Etapas (lista con carga de combustible) y ficha de la pieza elegida
  // ============================================================
  const renderStages = () => {
    const lookup = find();
    const edit = canEdit();
    const rows = rocket().stages.map((stage, index) => {
      const row = el('div', `stage-row${index === activeStage ? ' active' : ''}`);
      const fuel = stageFuel(stage, lookup);
      const pickStage = button(`Etapa ${index + 1}`, 'stage-pick', () => { activeStage = index; render(); });
      pickStage.setAttribute('aria-pressed', String(index === activeStage));
      const info = el('span', 'stage-info', `${fuel ? PROPELLANTS[fuel].name.toLowerCase() : 'sin combustible'} · montaje ${mountsUsed(stage, lookup)}/${mountPoints(stage, lookup)}`);
      const fill = /** @type {HTMLInputElement} */ (el('input', 'stage-fill'));
      Object.assign(fill, { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(stage.fill * 100)), disabled: !edit });
      fill.setAttribute('aria-label', `Carga de combustible de la etapa ${index + 1}`);
      const percent = el('span', 'stage-percent', `${Math.round(stage.fill * 100)} %`);
      fill.addEventListener('input', () => { percent.textContent = `${fill.value} %`; });
      fill.addEventListener('change', () => sendAction({ type: 'build:fill', stage: index, fill: Number(fill.value) / 100 }));
      row.append(pickStage, info, fill, percent);
      if (edit) row.append(button('Quitar etapa', 'stage-drop', () => sendAction({ type: 'build:removeStage', stage: index })));
      return row;
    }).reverse();
    stagesBox.replaceChildren(...rows);
    if (edit) {
      const problem = addStageProblem(rocket(), lookup);
      const add = button('+ Agregar etapa arriba', 'stage-add', () => { sendAction({ type: 'build:addStage' }); activeStage = rocket().stages.length; });
      add.disabled = Boolean(problem);
      add.title = problem ?? '';
      stagesBox.prepend(add);
    }
  };

  const renderPicked = () => {
    const item = selectedUid && itemOf(selectedUid);
    const where = item && findInRocket(rocket(), selectedUid);
    picked.hidden = !where;
    if (!where) return;
    const part = getPart(item.partId);
    const real = resolvePart(item);
    const tier = tierOf(item.tier);
    const facts = versionColumns(part).map((column) => `${column.label} ${column.value(real)}`).join(' · ');
    const origin = item.source === 'black' ? `mercado negro (${getSeller(item.sellerId)?.name ?? ''})${item.knownDefect ? ', con defecto detectado' : ''}` : 'mercado';
    const info = el('div', 'picked-info');
    info.append(el('strong', '', part.name), el('span', '', `${tier.mark} ${tier.name} · ${conditionName(item.condition).toLowerCase()} · ${origin} · etapa ${where.stage + 1}`), el('span', '', facts));
    picked.replaceChildren(info);
    if (canEdit()) {
      const actions = el('div', 'picked-actions');
      const up = button('Subir de etapa', '', () => sendAction({ type: 'build:move', uid: item.uid, stage: where.stage + 1 }));
      up.disabled = !checkDrop(item.uid, 'rocket', where.stage + 1).ok;
      const down = button('Bajar de etapa', '', () => sendAction({ type: 'build:move', uid: item.uid, stage: where.stage - 1 }));
      down.disabled = where.stage === 0 || !checkDrop(item.uid, 'rocket', where.stage - 1).ok;
      actions.append(up, down, button('Quitar', 'danger', () => sendAction({ type: 'build:remove', uid: item.uid })));
      picked.append(actions);
    }
  };

  // ============================================================
  //  Estadísticas, plan de vuelo y revisión
  // ============================================================
  const renderStats = () => {
    const state = data();
    const mission = getMission(state.missionId);
    const review = validateRocket(toPhysicsStages(rocket(), inventory()), mission, { credits: state.economy.credits });
    const stats = review.stats;
    const needed = totalDeltaV(mission.flightPlan);
    statsBox.replaceChildren();

    const head = el('h4', '', 'El cohete en números');
    statsBox.append(head);
    if (!stats) {
      statsBox.append(el('p', 'builder-empty', 'Todavía no hay piezas puestas.'));
    } else {
      const twrClass = stats.twr < 1 ? 'bad' : stats.twr < 1.2 ? 'warn' : 'good';
      const dvClass = stats.deltaV < needed ? 'bad' : stats.deltaV < needed * 1.03 ? 'warn' : 'good';
      const rows = [
        ['Masa total', mass(stats.mass), 'Todo lo que hay que levantar: piezas más combustible.'],
        ['Combustible', `${mass(stats.propellantMass)} de ${mass(stats.propellantCapacity)}`, 'Lo cargado y lo que cabe en los tanques.'],
        ['Empuje al despegar', force(stats.thrust), 'La fuerza de los motores de la primera etapa al nivel del mar.'],
        ['Empuje/peso', number(stats.twr, 2), 'Empuje dividido por el peso. Menos de 1: el cohete no se levanta. Conviene 1,2 o más.', twrClass],
        ['Δv total', `${number(stats.deltaV)} m/s`, `Delta-v: cuánto puede cambiar su velocidad con el combustible que lleva. La misión pide ${number(needed)} m/s.`, dvClass],
        ['Carga útil', mass(stats.payloadMass), 'Lo que la última etapa lleva que no es motor ni tanque.'],
        ['Integridad', Number.isFinite(stats.integrity) ? `${number(stats.integrity, 2)} ×` : 'sin carga', 'Cuántas veces aguanta la pieza más exigida la carga que lleva encima. Menos de 1: se rompe.', stats.integrity < 1 ? 'bad' : stats.integrity < 1.25 ? 'warn' : 'good'],
        ['Energía', `${number(stats.powerOutput)} W genera · ${number(stats.powerDraw)} W consume`, 'Si consume más de lo que genera, vive de las baterías.', stats.powerBalance < 0 ? 'warn' : 'good'],
        ['Baterías', `${number(stats.energyCapacity / 3.6e6, 1)} kWh`, 'Energía guardada para cuando no da el Sol.'],
        ['Altura real', `${number(stats.height)} m`, 'La altura de verdad; el dibujo no está a escala.'],
        ['Costo', `${credits(stats.cost)} (quedan ${credits(state.economy.credits)})`, 'Lo pagado por las piezas puestas más el combustible, que se cobra al despegar.'],
      ];
      const list = el('dl', 'stat-list');
      for (const [name, value, help, tone] of rows) {
        const row = el('div', tone ? `tone-${tone}` : '');
        row.title = help;
        row.append(el('dt', '', name), el('dd', '', value));
        list.append(row);
      }
      const meter = el('div', `dv-meter ${dvClass}`);
      meter.append(el('i'));
      /** @type {HTMLElement} */ (meter.firstChild).style.width = `${Math.min(100, (stats.deltaV / needed) * 100)}%`;
      meter.title = `Δv del cohete frente a los ${number(needed)} m/s que pide la misión`;
      statsBox.append(list, meter);

      const table = el('table', 'versions stage-table');
      table.appendChild(el('thead')).appendChild(el('tr')).append(...['Etapa', 'Masa', 'Δv', 'Empuje/peso'].map((text) => el('th', '', text)));
      const body = table.appendChild(el('tbody'));
      stats.stages.forEach((stage, index) => {
        const row = el('tr');
        row.append(el('td', '', `${index + 1}`), el('td', '', mass(stage.mass)), el('td', '', `${number(stage.deltaV)} m/s`), el('td', '', number(stage.twr, 2)));
        body.prepend(row);
      });
      statsBox.append(table, el('p', 'builder-note', 'El empuje/peso de cada etapa está medido con la gravedad de la Tierra y con todo lo que lleva encima.'));
    }

    // Plan de vuelo: qué tramos alcanza
    if (review.plan) {
      statsBox.append(el('h4', '', 'Plan de vuelo'));
      const legs = el('ol', 'leg-list');
      let reached = true;
      for (const leg of review.plan.legs) {
        const item = el('li', leg.ok ? 'ok' : 'fail', `${leg.ok ? '✓' : '✗'} ${leg.name}${leg.dv ? ` · ${number(leg.dv)} m/s` : ''}`);
        if (!leg.ok) { item.append(el('small', '', leg.reason)); reached = false; }
        legs.append(item);
      }
      if (!reached) for (const leg of mission.flightPlan.slice(review.plan.legs.length)) legs.append(el('li', 'pending', `· ${leg.name}`));
      statsBox.append(legs);
      if (review.plan.ok) statsBox.append(el('p', 'builder-note', `Sobran ${number(review.plan.spareDeltaV)} m/s de margen.`));
    }

    // Revisión antes de despegar
    statsBox.append(el('h4', '', 'Revisión antes de despegar'));
    const groups = [
      ['critical', 'No se puede despegar', review.critical],
      ['warning', 'Se puede, con riesgo', review.warnings],
      ['tip', 'Mejoras opcionales', review.tips],
    ];
    if (groups.every(([, , issues]) => issues.length === 0)) statsBox.append(el('p', 'review-clear', '✓ Todo en regla.'));
    for (const [kind, title, issues] of groups) {
      if (issues.length === 0) continue;
      const block = el('div', `review ${kind}`);
      block.append(el('h5', '', `${title} (${issues.length})`));
      const list = el('ul');
      for (const issue of issues) list.append(el('li', '', issue.text));
      block.append(list);
      statsBox.append(block);
    }
  };

  // ============================================================
  const render = () => {
    if (!rocket() || !session.room) return;
    activeStage = Math.min(activeStage, rocket().stages.length - 1);
    if (selectedUid && !findInRocket(rocket(), selectedUid)) selectedUid = null;
    const edit = canEdit();
    $('.builder-role').textContent = edit
      ? 'Manejas Ingeniería: arrastra piezas de la bodega al cohete, o elige una etapa y usa "Poner".'
      : isEngineer() ? 'El cohete ya no se puede cambiar en esta etapa.' : 'Solo Ingeniería arma el cohete. Tú lo ves en vivo, con sus números y su revisión.';
    const undo = /** @type {HTMLButtonElement} */ ($('[data-do="undo"]'));
    undo.hidden = !edit;
    undo.disabled = data().undoSteps === 0;
    renderHold();
    renderStages();
    renderPicked();
    renderStats();
    draw();
  };

  $('.builder-tools').addEventListener('click', (event) => {
    const action = /** @type {HTMLElement} */ (event.target).closest('button')?.dataset.do;
    if (action === 'undo') sendAction({ type: 'build:undo' });
    if (action === 'zoom-in') userZoom = Math.min(3, scene.zoom * 1.25);
    if (action === 'zoom-out') userZoom = Math.max(0.25, scene.zoom / 1.25);
    if (action === 'zoom-fit') { userZoom = null; panY = 0; }
    draw();
  });

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  const resizeObserver = new ResizeObserver(draw);
  resizeObserver.observe(canvas);
  render();
  const offs = [on('state', render), on('room', render)];
  return () => {
    drag?.ghost.remove();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    resizeObserver.disconnect();
    offs.forEach((off) => off());
  };
};
