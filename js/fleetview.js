/**
 * MESA DE RECURSOS (pantalla de la misión 3)
 * Las cuatro arcas con su propósito, lo que pide cada una y lo que el equipo le dio. Comercio reparte
 * (+ y −), Vuelo elige la ruta, y todos lo ven en vivo. Después del viaje muestra cómo llegó cada arca y
 * por qué. Las reglas están en js/fleet.js; el servidor valida cada cambio.
 */
import { on, sendAction, session } from './connection.js';
import { ARKS, FLEET_POOL, MAX_LEVEL, MIN_ARKS, ROUTES, SYSTEMS, leftOf, shortfalls } from './fleet.js';
import { getMission } from './missions.js';
import { canActAs } from './shared.js';

/** @param {string} tag @param {string} [className] @param {string} [text] */
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** Monta la pantalla en `box`. Devuelve la función para desmontarla. */
export const mountFleet = (box) => {
  const render = () => {
    const data = session.state?.data;
    const fleet = data?.fleet;
    if (!fleet) return;
    const players = session.room?.players ?? [];
    const stageId = getMission(data.missionId)?.stages[data.stageIndex]?.id;
    const mayAllot = canActAs(players, session.myId, 'merchant') && ['planning', 'build'].includes(stageId);
    const mayRoute = canActAs(players, session.myId, 'pilot') && ['planning', 'build', 'launch'].includes(stageId);
    const left = leftOf(fleet);
    const journey = fleet.journey;

    const head = el('header', 'plan-head');
    head.append(
      el('p', 'plan-kicker', 'Proyecto NOAH'),
      el('h3', 'plan-title', journey ? 'Cómo llegó la flota' : 'Mesa de recursos'),
      el('p', 'plan-intro', journey
        ? `Hacen falta al menos ${MIN_ARKS} arcas para fundar la colonia. Lo que cada una entrega decide cuánto crece su parte.`
        : `Hay ${FLEET_POOL} recursos para las cuatro arcas y no alcanzan para llenarlas todas. Cada arca pide un mínimo distinto: por debajo, el viaje la castiga. Ninguna puede despegar con un sistema en cero.`),
    );
    const status = el('p', 'plan-status', journey
      ? `Llegaron ${journey.arrived} de ${ARKS.length} arcas por la ${ROUTES[journey.route].name.toLowerCase()}.`
      : mayAllot ? 'Tú repartes (Comercio). Habla con el equipo: cada arca le importa a un rol distinto.' : 'Reparte Comercio. Tú lo ves en vivo y puedes opinar.');
    const total = el('p', `plan-total${left === 0 ? '' : ' fleet-left'}`, journey ? '' : `Recursos sin repartir: ${left} de ${FLEET_POOL}`);

    const grid = el('div', 'fleet-arks');
    for (const ark of ARKS) {
      const levels = fleet.alloc[ark.id];
      const state = journey?.arks[ark.id];
      const card = el('section', `fleet-ark${state?.lost ? ' lost' : ''}`);
      card.style.setProperty('--ark', ark.color);
      const title = el('header', 'fleet-ark-head');
      title.append(el('span', 'fleet-ark-letter', ark.letter), el('strong', '', `${ark.name} · ${ark.title}`));
      card.append(title, el('p', 'fleet-ark-carries', ark.carries), el('p', 'fleet-ark-builds', `En Marte levanta ${ark.builds}.`));
      for (const system of Object.values(SYSTEMS)) {
        const row = el('div', 'fleet-row');
        const level = levels[system.id], need = ark.needs[system.id];
        const name = el('span', 'fleet-system', system.name);
        name.title = system.text;
        const pips = el('span', 'fleet-pips');
        pips.setAttribute('aria-label', `${system.name}: ${level} de ${MAX_LEVEL}; pide ${need}`);
        for (let i = 1; i <= MAX_LEVEL; i++) pips.append(el('i', `${i <= level ? 'on' : ''}${i === need ? ' need' : ''}`));
        const note = el('small', level < need ? 'down' : level > need ? 'up' : '', level < need ? `faltan ${need - level}` : level > need ? `+${level - need} de margen` : 'justo');
        row.append(name, pips, note);
        if (!journey) {
          for (const delta of [-1, 1]) {
            const button = /** @type {HTMLButtonElement} */ (el('button', 'fleet-step', delta > 0 ? '+' : '−'));
            button.type = 'button';
            button.disabled = !mayAllot || (delta > 0 ? left <= 0 || level >= MAX_LEVEL : level <= 0);
            button.setAttribute('aria-label', `${delta > 0 ? 'Sumar' : 'Quitar'} ${system.name.toLowerCase()} a ${ark.name}`);
            button.addEventListener('click', () => sendAction({ type: 'fleet:allot', ark: ark.id, system: system.id, delta }));
            row.append(button);
          }
        }
        card.append(row);
      }
      if (state) {
        card.append(el('p', `fleet-outcome ${state.lost ? 'down' : state.level >= 1 ? 'up' : ''}`, state.lost ? 'No llegó a Marte' : `Llegó al ${state.integrity} % · entregó ${state.delivered} de ${ark.needs.cargo} de carga`));
        const list = el('ul', 'plan-facts');
        for (const event of state.events) list.append(el('li', '', event));
        card.append(list);
      } else {
        const missing = shortfalls(fleet, ark.id);
        card.append(el('p', `fleet-outcome ${missing.length ? 'down' : 'up'}`, missing.length ? `Por debajo de lo que pide en: ${missing.map((m) => SYSTEMS[m.system].name.toLowerCase()).join(', ')}` : 'Tiene lo que pide'));
      }
      grid.append(card);
    }

    const parts = [head, status, total, grid];
    if (!journey) {
      const routes = el('section', 'plan-group');
      routes.append(el('h4', '', mayRoute ? 'Ruta de la flota (la eliges tú: Vuelo)' : 'Ruta de la flota (la elige Vuelo)'));
      const list = el('div', 'plan-options');
      for (const route of Object.values(ROUTES)) {
        const chosen = fleet.route === route.id && fleet.routeDecided;
        const card = /** @type {HTMLButtonElement} */ (el('button', `plan-option${chosen ? ' chosen' : ''}`));
        card.type = 'button';
        card.disabled = !mayRoute || chosen;
        card.setAttribute('aria-pressed', String(chosen));
        card.append(el('strong', '', route.name), el('span', 'plan-text', route.text));
        if (chosen) card.append(el('em', 'plan-chosen', '✓ Elegida'));
        card.addEventListener('click', () => sendAction({ type: 'fleet:route', route: route.id }));
        list.append(card);
      }
      routes.append(list);
      parts.push(routes, el('p', 'plan-learn', 'Nada de esto es azar: el viaje se resuelve con lo que repartieron y la ruta elegida. Lo único imprevisible es a qué arca le toca un micrometeorito, y un nivel de casco de sobra lo aguanta.'));
    }
    box.replaceChildren(...parts);
  };
  box.classList.add('plan-screen');
  render();
  const offs = [on('state', render), on('room', render)];
  return () => {
    box.classList.remove('plan-screen');
    offs.forEach((off) => off());
  };
};
