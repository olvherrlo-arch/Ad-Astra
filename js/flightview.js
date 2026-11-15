/**
 * EL VUELO EN PANTALLA
 * La herramienta de las etapas Vuelo, Superficie, Regreso y Evaluación.
 *   Arriba     el mapa del viaje (Tierra → Luna → Tierra) con el tramo actual
 *   Centro     el tramo: cuánto Δv pide y cuánto se hizo; y un panel por rol con lo que puede hacer
 *   Costado    la telemetría de la nave y la bitácora del vuelo
 *   Al final   el resultado y lo que se aprende de él
 * Las reglas están en server/flight.js; aquí solo se dibuja y se mandan acciones.
 */
import { on, sendAction, session } from './connection.js';
import { getMission, missionFor } from './missions.js';
import { credits, mass, number } from './partinfo.js';
import { ROLES, canActAs, roleName } from './shared.js';

const FLIGHT_HTML = `
<section class="flight" aria-label="Vuelo">
  <svg class="flight-map" viewBox="0 0 640 170" role="img" aria-label="Mapa del viaje"></svg>
  <div class="flight-body">
    <div class="flight-main">
      <div class="flight-banner" hidden></div>
      <article class="flight-leg"></article>
      <div class="flight-emergency" hidden></div>
      <div class="flight-roles"></div>
      <div class="flight-result" hidden></div>
    </div>
    <aside class="flight-side">
      <section class="flight-telemetry" aria-label="Telemetría"></section>
      <section class="flight-events" aria-label="Bitácora del vuelo"><h4>Bitácora del vuelo</h4><ol></ol></section>
    </aside>
  </div>
</section>`;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (label, className, onClick, disabled = false) => {
  const node = /** @type {HTMLButtonElement} */ (el('button', className, label));
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', onClick);
  return node;
};
const bar = (value, max, tone = '') => {
  const track = el('div', `flight-bar ${tone}`);
  const fill = el('i');
  fill.style.width = `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`;
  track.append(fill);
  return track;
};
const kwh = (joules) => `${number(joules / 3.6e6, 1)} kWh`;

/** Puntos del mapa para cada tramo: sube, viaja, rodea la Luna, vuelve. */
const MAP_POINTS = {
  ascent: [90, 92], tli: [300, 52], loi: [520, 60], descent: [548, 104], surface: [560, 120],
  liftoff: [548, 104], tei: [520, 140], reentry: [92, 112], deorbit: [150, 60],
  tmi: [220, 50], mcc: [360, 46], moi: [505, 62], entry: [528, 84], experiment: [540, 100], storm: [540, 100], bloom: [540, 100],
};

/**
 * Con `readOnly` es un informe: mapa, tramo, telemetría, bitácora y resultado, sin controles.
 * Así se usa dentro del mundo (js/world.js), donde cada acción se hace caminando hasta su puesto.
 */
export const mountFlight = (container, { readOnly = false } = {}) => {
  container.innerHTML = FLIGHT_HTML;
  const $ = (selector) => /** @type {HTMLElement} */ (container.querySelector(selector));
  const map = $('.flight-map');
  const dvInputs = { value: '' }; // lo que el Piloto escribió (se conserva entre redibujos)
  let lastLeg = -1;

  const state = () => session.state?.data;
  const may = (role) => canActAs(session.room.players, session.myId, role);

  // ---------- Mapa ----------
  const renderMap = (flight, legs) => {
    const ns = 'http://www.w3.org/2000/svg';
    const node = (tag, attrs, text) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      if (text) n.textContent = text;
      return n;
    };
    map.replaceChildren();
    const toMars = state()?.missionId === 'mars';
    const far = node('path', { d: 'M560 10 A 70 70 0 0 1 560 160 L 640 160 L 640 10 Z', class: `map-far${flight.signal ? '' : ' dark'}` });
    if (!toMars) map.append(far, node('text', { x: 632, y: 24, class: 'map-label', 'text-anchor': 'end' }, flight.relay ? 'cara oculta · repetidor' : 'cara oculta · sin señal directa'));
    // A Marte se va y no se vuelve: solo el arco de ida.
    map.append(node('path', { d: toMars ? 'M90 92 C 200 10, 420 10, 528 84' : 'M90 92 C 200 10, 420 10, 520 60 C 600 95, 600 135, 520 140 C 420 160, 200 160, 92 112', class: 'map-path' }));
    map.append(node('circle', { cx: 60, cy: 100, r: 36, class: 'map-earth' }), node('text', { x: 60, y: 152, class: 'map-label', 'text-anchor': 'middle' }, 'Tierra'));
    map.append(node('circle', { cx: 540, cy: 100, r: 22, class: toMars ? 'map-moon map-mars' : 'map-moon' }), node('text', { x: 540, y: 140, class: 'map-label', 'text-anchor': 'middle' }, toMars ? 'Marte' : 'Luna'));
    legs.forEach((leg, index) => {
      const [x, y] = MAP_POINTS[leg.id] ?? [0, 0];
      const status = index < flight.legIndex || (flight.phase === 'over' && flight.result?.ok) ? 'done' : index === flight.legIndex ? 'now' : 'next';
      map.append(node('circle', { cx: x, cy: y, r: status === 'now' ? 7 : 4.5, class: `map-dot ${status}` }));
    });
    const current = legs[Math.min(flight.legIndex, legs.length - 1)];
    const [sx, sy] = MAP_POINTS[current.id] ?? [0, 0];
    if (flight.phase !== 'over') map.append(node('path', { d: `M${sx - 6} ${sy - 18} l6 -10 l6 10 z`, class: 'map-ship' }));
  };

  // ---------- El tramo actual ----------
  const renderLeg = (flight, legs, mission) => {
    const box = $('.flight-leg');
    const leg = legs[flight.legIndex];
    box.replaceChildren();
    if (!leg) return;
    box.append(el('p', 'flight-kicker', `Tramo ${flight.legIndex + 1} de ${legs.length} · ${mission.stages.find((s) => s.id === leg.stage)?.name ?? ''}`), el('h3', '', leg.name));
    if (leg.dv > 0) {
      const line = el('div', 'flight-progress');
      line.append(el('span', '', `${number(flight.progress)} de ${number(leg.dv)} m/s`), bar(flight.progress, leg.dv, 'gold'));
      box.append(line);
    }
    box.append(el('p', 'flight-note', leg.note));
    const tips = [];
    if (leg.body && leg.minTwr && flight.telemetry.twr !== null) tips.push(`Empuje/peso ahora: ${number(flight.telemetry.twr, 2)} (hace falta más de 1 para ${leg.id === 'descent' ? 'frenar la caída' : 'levantarse'}).`);
    if (leg.farSide && !flight.signal) tips.push('Sin señal con la Tierra: los encendidos son menos precisos.');
    if (leg.id === 'surface') tips.push(flight.prism ? 'El Prisma está a bordo.' : 'Ciencia tiene que encontrar el Prisma con el espectrómetro.');
    for (const tip of tips) box.append(el('p', 'flight-tip', tip));
  };

  // ---------- Emergencia ----------
  const renderEmergency = (flight) => {
    const box = $('.flight-emergency');
    const emergency = flight.emergency;
    box.hidden = !emergency;
    if (!emergency) return;
    box.replaceChildren(el('h3', '', `⚠ ${emergency.title}`), el('p', '', emergency.text));
    const options = el('div', 'emergency-options');
    for (const option of emergency.options) {
      const card = el('div', 'emergency-option');
      const votes = emergency.votes[option.id] ?? [];
      card.append(el('strong', '', option.label + (option.cost ? ` · ${credits(option.cost)}` : '')), el('p', '', option.detail));
      const needs = el('div', 'emergency-needs');
      for (const role of option.needs) {
        const voted = votes.includes(role);
        if (!voted && may(role)) {
          const tooPoor = option.cost && option.cost > state().economy.credits;
          needs.append(button(`Aceptar como ${roleName(role)}`, 'vote-button', () => sendAction({ type: 'flight:resolve', option: option.id, role }), Boolean(tooPoor)));
        } else {
          needs.append(el('span', `vote-chip${voted ? ' done' : ''}`, `${voted ? '✓' : '…'} ${roleName(role)}`));
        }
      }
      card.append(needs);
      options.append(card);
    }
    box.append(options);
  };

  // ---------- Un panel por rol ----------
  const renderRoles = (flight, legs) => {
    const leg = legs[flight.legIndex];
    const active = flight.phase === 'ready' && leg && leg.stage === getMission(state().missionId).stages[state().stageIndex].id;
    const panels = ROLES.map((role) => {
      const mine = may(role.id);
      const card = el('article', `flight-role${mine ? ' mine' : ''}`);
      card.append(el('h4', '', role.name + (mine ? ' · tú' : '')));

      if (role.id === 'pilot') {
        if (leg && leg.dv > 0) {
          const remaining = Math.max(1, Math.round(leg.dv - flight.progress));
          if (flight.legIndex !== lastLeg) { dvInputs.value = String(remaining); lastLeg = flight.legIndex; }
          card.append(el('p', 'role-line', `Faltan ${number(remaining)} m/s. Precisión: ±${number(flight.precision.sigma * 100, 1)} % (${flight.precision.reasons.join(', ')}).`));
          if (mine) {
            const row = el('div', 'burn-row');
            const input = /** @type {HTMLInputElement} */ (el('input', 'burn-input'));
            Object.assign(input, { type: 'number', min: '1', step: '10', value: dvInputs.value });
            input.setAttribute('aria-label', 'Δv a quemar (m/s)');
            input.addEventListener('input', () => { dvInputs.value = input.value; });
            row.append(input, el('span', '', 'm/s'));
            const presets = el('div', 'burn-presets');
            for (const { label, factor } of [{ label: 'Lo que falta', factor: 1 }, { label: '+1 %', factor: 1.01 }, { label: '+3 %', factor: 1.03 }]) {
              presets.append(button(label, 'chip', () => { dvInputs.value = String(Math.round(remaining * factor)); render(); }));
            }
            card.append(row, presets, button('Encender motores', 'fire-button', () => sendAction({ type: 'flight:burn', dv: Number(dvInputs.value) }), !active || !(Number(dvInputs.value) > 0)));
            card.append(el('p', 'role-hint', 'Si te quedas corto, harás otro encendido (y cada encendido puede fallar). Si te pasas, ese combustible ya no vuelve.'));
          }
        } else if (leg) {
          card.append(el('p', 'role-line', leg.id === 'surface' ? 'En la superficie no se encienden los motores.' : 'Este tramo no gasta combustible.'));
          if (mine) card.append(button(leg.id === 'surface' ? 'Despegar con el Prisma' : 'Continuar', 'fire-button', () => sendAction({ type: 'flight:proceed' }), !active || (leg.id === 'surface' && !flight.prism)));
        }
      }

      if (role.id === 'engineer') {
        card.append(el('p', 'role-line', flight.mode === 'saving' ? 'Energía en modo ahorro: instrumentos apagados.' : 'Energía normal: todo encendido.'));
        if (mine) {
          const toggle = el('div', 'mode-toggle');
          toggle.append(
            button('Normal', flight.mode === 'normal' ? 'chip on' : 'chip', () => sendAction({ type: 'flight:power', mode: 'normal' }), flight.mode === 'normal' || flight.phase === 'over'),
            button('Ahorro', flight.mode === 'saving' ? 'chip on' : 'chip', () => sendAction({ type: 'flight:power', mode: 'saving' }), flight.mode === 'saving' || flight.phase === 'over'),
          );
          card.append(toggle);
        }
        const broken = flight.telemetry.parts.filter((part) => part.failed);
        const fixed = flight.telemetry.parts.filter((part) => part.repaired && !part.failed);
        card.append(el('p', 'role-hint', broken.length ? `Averiado: ${broken.map((p) => p.name).join(', ')}.` : 'Ninguna pieza averiada.'));
        if (fixed.length) card.append(el('p', 'role-hint', `Reparado: ${fixed.map((p) => p.name).join(', ')}.`));
      }

      if (role.id === 'scientist') {
        if (leg?.id === 'surface' && !flight.prism) {
          card.append(el('p', 'role-line', `Búsquedas: ${flight.scans}. Cada una deja el espectrómetro 2 h encendido y gasta batería.`));
          if (mine) card.append(button('Buscar el Prisma', 'fire-button', () => sendAction({ type: 'flight:scan' }), !active || flight.mode === 'saving'));
          if (flight.mode === 'saving') card.append(el('p', 'role-hint', 'En modo ahorro el espectrómetro está apagado: pídele a Ingeniería el modo normal.'));
        } else {
          card.append(el('p', 'role-line', flight.prism ? 'El Prisma está a bordo.' : 'El Prisma se busca al llegar a la superficie lunar.'));
        }
      }

      if (role.id === 'merchant') {
        card.append(el('p', 'role-line', `Quedan ${credits(state().economy.credits)} para repuestos.`));
        if (flight.repairsPaid) card.append(el('p', 'role-hint', `Gastado en reparaciones: ${credits(flight.repairsPaid)}.`));
        card.append(el('p', 'role-hint', 'Cada reparación necesita que Comercio pague el repuesto.'));
      }
      return card;
    });
    $('.flight-roles').replaceChildren(...panels);
  };

  // ---------- Telemetría y bitácora ----------
  const renderTelemetry = (flight, legs) => {
    const t = flight.telemetry;
    const left = legs.slice(flight.legIndex).reduce((total, leg, i) => total + (i === 0 ? Math.max(0, leg.dv - flight.progress) : leg.dv), 0);
    const tone = t.deltaVLeft < left ? 'bad' : t.deltaVLeft < left * 1.03 ? 'warn' : 'good';
    const box = $('.flight-telemetry');
    box.replaceChildren(el('h4', '', 'Telemetría'));
    const list = el('dl', 'stat-list');
    const rows = [
      ['Δv en los tanques', `${number(t.deltaVLeft)} m/s`, tone],
      ['Δv que falta del viaje', `${number(left)} m/s`, ''],
      ['Masa', mass(t.mass), ''],
      ['Señal con la Tierra', flight.signal ? 'Sí' : 'No', flight.signal ? 'good' : 'warn'],
      ['Etapas soltadas', `${t.dropped}`, ''],
    ];
    for (const [name, value, rowTone] of rows) {
      const row = el('div', rowTone ? `tone-${rowTone}` : '');
      row.append(el('dt', '', name), el('dd', '', value));
      list.append(row);
    }
    box.append(list);
    const battery = el('div', 'flight-meter');
    battery.append(el('span', '', `Batería ${kwh(t.energy)} de ${kwh(t.energyCapacity)}`), bar(t.energy, t.energyCapacity, t.energy < t.energyCapacity * 0.25 ? 'coral' : 'teal'));
    box.append(battery);
    for (const stage of t.stages) {
      const meter = el('div', 'flight-meter');
      meter.append(el('span', '', `Etapa ${stage.number}: ${mass(stage.propellant)} · motores ${stage.enginesWorking}/${stage.engines}`), bar(stage.propellant, stage.capacity, stage.enginesWorking < stage.engines ? 'coral' : 'gold'));
      box.append(meter);
    }
    $('.flight-events ol').replaceChildren(...[...flight.events].reverse().map((event) => el('li', `tone-${event.tone}`, event.text)));
  };

  // ---------- Resultado ----------
  const lessons = (flight) => {
    const list = [];
    if (flight.wasted > 150) list.push(`Se quemaron ${number(flight.wasted)} m/s de más pasándose en los encendidos. Ese combustible pesa desde el despegue: apuntar justo y corregir rinde más.`);
    else list.push(`Los encendidos fueron precisos: solo ${number(flight.wasted)} m/s de más.`);
    for (const event of flight.history) {
      if (event.source === 'black' && !event.inspected) list.push(`${event.title}: la pieza venía del mercado negro sin inspección. Una inspección podía mostrar el defecto antes de comprarla.`);
      else if (event.source === 'black') list.push(`${event.title}: la pieza venía del mercado negro; la inspección reduce el riesgo, pero no lo borra.`);
      else list.push(`${event.title}: hasta una pieza legal puede fallar. Una rareza mejor falla menos.`);
    }
    if (flight.blackout) list.push('Hubo tramos sin señal con la Tierra: un satélite repetidor mantiene la comunicación detrás de la Luna.');
    if (flight.savedPower) list.push('La energía no alcanzó en la sombra: más baterías o paneles dan margen.');
    if (!flight.result.ok && flight.result.text.includes('combustible')) list.push('Faltó combustible: más Δv viene de motores más eficientes (más Isp), de menos masa o de más tanques.');
    return list;
  };

  const renderResult = (flight) => {
    const box = $('.flight-result');
    box.hidden = flight.phase !== 'over';
    if (box.hidden) return;
    box.className = `flight-result ${flight.result.ok ? 'ok' : 'bad'}`;
    const facts = el('dl', 'stat-list');
    for (const [name, value] of [
      ['Encendidos', `${flight.burns}`],
      ['Δv usado', `${number(flight.dvUsed)} m/s`],
      ['Δv quemado de más', `${number(flight.wasted)} m/s`],
      ['Búsquedas del Prisma', `${flight.scans}`],
      ['Gastado en reparaciones', credits(flight.repairsPaid)],
      ['Presupuesto que quedó', credits(state().economy.credits)],
    ]) {
      const row = el('div');
      row.append(el('dt', '', name), el('dd', '', value));
      facts.append(row);
    }
    const learned = el('ul', 'flight-lessons');
    for (const text of lessons(flight)) learned.append(el('li', '', text));
    box.replaceChildren(
      el('h3', '', flight.result.ok ? '✓ Misión cumplida' : '✗ Misión fallida'),
      el('p', '', flight.result.text + (flight.result.ok ? ' Life on Mars quedó desbloqueada en la constelación.' : ' Pueden volver al lobby e intentarlo de nuevo con otro cohete.')),
      facts, el('h4', '', 'Lo que se aprende'), learned,
    );
  };

  // ---------- Todo junto ----------
  const render = () => {
    const data = state();
    const flight = data?.flight;
    if (!flight || !session.room) return;
    const mission = missionFor(data);
    const legs = mission.flightPlan;
    const stageId = mission.stages[data.stageIndex].id;
    renderMap(flight, legs);
    renderLeg(flight, legs, mission);
    renderEmergency(flight);
    renderRoles(flight, legs);
    renderTelemetry(flight, legs);
    renderResult(flight);
    $('.flight-roles').hidden = readOnly || flight.phase === 'over';
    if (readOnly) $('.flight-emergency').hidden = true;
    $('.flight-leg').hidden = flight.phase === 'over';
    const banner = $('.flight-banner');
    const leg = legs[flight.legIndex];
    const waiting = flight.phase === 'stageDone' || (flight.phase === 'ready' && leg && leg.stage !== stageId);
    banner.hidden = readOnly || !(waiting || (flight.phase === 'over' && stageId !== 'debrief'));
    banner.textContent = flight.phase === 'over'
      ? 'El vuelo terminó. Den el visto bueno y el anfitrión pasa a la Evaluación.'
      : `Esta parte del viaje terminó. Den el visto bueno: el anfitrión pasa a "${mission.stages.find((s) => s.id === leg?.stage)?.name ?? 'la siguiente etapa'}".`;
  };

  render();
  const offs = [on('state', render), on('room', render)];
  return () => offs.forEach((off) => off());
};
