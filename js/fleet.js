/**
 * PROYECTO NOAH: LAS CUATRO ARCAS (datos y reglas compartidos navegador/servidor)
 * Misión 3, "Across the Universe". Cuatro naves, cada una con su propósito (no cambiar nombres ni funciones):
 *   John   · El Pionero   tecnología, navegación, comunicaciones, infraestructura
 *   Ringo  · El Guardián  comida, agua, medicina, soporte vital
 *   George · El Jardín    semillas, biodiversidad, agricultura
 *   Paul   · El Legado    personas, cultura, historia, educación
 *
 * El equipo tiene una cantidad fija de recursos (`FLEET_POOL`) para repartir entre las arcas, en tres sistemas:
 * combustible, casco (estructura y soporte vital) y carga. Cada arca pide un mínimo distinto en cada uno
 * (`needs`). No alcanza para darle el máximo a todas: hay que decidir.
 *
 * Todo esto es diseño del juego (valores de juego, no datos reales). Funciones puras: sin red ni pantalla.
 */
import { createRng } from './random.js';

export const SYSTEMS = {
  fuel: { id: 'fuel', name: 'Combustible', text: 'Margen para corregir el rumbo y frenar al llegar.' },
  shield: { id: 'shield', name: 'Casco', text: 'Estructura, blindaje y soporte vital: aguanta tormentas solares e impactos.' },
  cargo: { id: 'cargo', name: 'Carga', text: 'Lo que el arca lleva para la colonia. Menos carga, menos colonia.' },
};

export const ARKS = [
  {
    id: 'john', name: 'John', title: 'El Pionero', color: '#5b74c9', letter: 'J',
    carries: 'Tecnología, navegación, comunicaciones e infraestructura',
    builds: 'la torre de energía y comunicaciones', site: 'tower',
    needs: { fuel: 2, shield: 1, cargo: 2 },
  },
  {
    id: 'ringo', name: 'Ringo', title: 'El Guardián', color: '#ff6b5b', letter: 'R',
    carries: 'Comida, agua, medicinas y soporte vital',
    builds: 'el hábitat con agua y enfermería', site: 'habitat',
    needs: { fuel: 2, shield: 2, cargo: 3 },
  },
  {
    id: 'george', name: 'George', title: 'El Jardín', color: '#3fa597', letter: 'G',
    carries: 'Semillas, biodiversidad y sistemas agrícolas',
    builds: 'el invernadero y los primeros cultivos', site: 'garden',
    needs: { fuel: 2, shield: 1, cargo: 3 },
  },
  {
    id: 'paul', name: 'Paul', title: 'El Legado', color: '#f3b641', letter: 'P',
    carries: 'Personas, cultura, historia y educación',
    builds: 'la escuela y el archivo de la humanidad', site: 'school',
    needs: { fuel: 2, shield: 3, cargo: 2 },
  },
];
export const getArk = (id) => ARKS.find((ark) => ark.id === id);

/** Lo que la ruta larga le cuesta a las arcas con carga que se gasta o puede morir en el camino. */
const CONSUMABLE = {
  ringo: 'El viaje largo consumió parte de los víveres.',
  george: 'En el viaje largo se perdió parte de las plantas.',
};

/** Recursos para repartir. Los mínimos de las cuatro suman 25: sobran 3 para decidir dónde poner margen. */
export const FLEET_POOL = 28;
export const MAX_LEVEL = 5;

export const ROUTES = {
  safe: { id: 'safe', name: 'Ruta larga', text: 'Lejos del Sol: menos radiación, pero el viaje dura más. Ringo gasta víveres y George pierde plantas si llevan la carga justa.' },
  fast: { id: 'fast', name: 'Ruta corta', text: 'Más cerca del Sol: se llega antes y con la carga intacta, pero pide un nivel más de combustible y pega más la tormenta solar.' },
};

/** La flota recién creada: nada repartido, ruta larga, sin viaje. */
export const freshFleet = () => ({
  alloc: Object.fromEntries(ARKS.map((ark) => [ark.id, { fuel: 0, shield: 0, cargo: 0 }])),
  route: 'safe',
  routeDecided: false,
  journey: null, // lo que pasó en el viaje (resolveJourney)
  result: null, //  { ok, text } al terminar la misión
});

export const spentOf = (fleet) => Object.values(fleet.alloc).reduce((sum, levels) => sum + levels.fuel + levels.shield + levels.cargo, 0);
export const leftOf = (fleet) => FLEET_POOL - spentOf(fleet);

/** Lo que le falta a un arca para llegar a su mínimo: [{ system, missing }]. */
export const shortfalls = (fleet, arkId) => {
  const ark = getArk(arkId);
  const levels = fleet.alloc[arkId];
  return Object.keys(SYSTEMS).filter((system) => levels[system] < ark.needs[system]).map((system) => ({ system, missing: ark.needs[system] - levels[system] }));
};

/** Un arca no puede construirse vacía: al menos un nivel de cada sistema. */
export const canBuild = (fleet, arkId) => Object.keys(SYSTEMS).every((system) => fleet.alloc[arkId][system] >= 1);
export const fleetBuildable = (fleet) => ARKS.every((ark) => canBuild(fleet, ark.id));

/**
 * Cambia un nivel. Devuelve `{ fleet }` o `{ error }`.
 * @param {any} fleet @param {string} arkId @param {string} system @param {number} delta  +1 o -1
 */
export const allot = (fleet, arkId, system, delta) => {
  if (!getArk(arkId) || !SYSTEMS[system] || (delta !== 1 && delta !== -1)) return { error: 'Ese reparto no existe.' };
  const level = fleet.alloc[arkId][system] + delta;
  if (level < 0) return { error: 'Ya está en cero.' };
  if (level > MAX_LEVEL) return { error: `El máximo por sistema es ${MAX_LEVEL}.` };
  if (delta > 0 && leftOf(fleet) <= 0) return { error: 'No quedan recursos: hay que sacarle a otra arca.' };
  return { fleet: { ...fleet, alloc: { ...fleet.alloc, [arkId]: { ...fleet.alloc[arkId], [system]: level } } } };
};

/**
 * El viaje de la flota. Con lo repartido y la ruta elegida, dice cómo llega cada arca:
 *   integrity  0 a 100 (0 = se perdió)      delivered  niveles de carga que llegan
 *   events     lo que le pasó, en palabras (para que se entienda por qué)
 * Nada es sorpresa: todo sale de lo que el equipo decidió. La semilla solo elige qué arca recibe el
 * impacto de un micrometeorito (lo aguanta si tiene casco de sobra).
 * @param {any} fleet @param {number} seed
 */
export const resolveJourney = (fleet, seed) => {
  const rng = createRng((seed ?? 1) * 17 + 3);
  const struck = ARKS[Math.floor(rng() * ARKS.length)].id;
  const fast = fleet.route === 'fast';
  const arks = {};
  for (const ark of ARKS) {
    const levels = fleet.alloc[ark.id];
    const events = [];
    let integrity = 100;
    let delivered = levels.cargo;

    const fuelNeed = ark.needs.fuel + (fast ? 1 : 0);
    if (levels.fuel < fuelNeed) {
      const missing = fuelNeed - levels.fuel;
      integrity -= 30 * missing;
      events.push(`Le faltó combustible (${levels.fuel} de ${fuelNeed}): frenó a duras penas al llegar a Marte.`);
    } else if (levels.fuel > fuelNeed) events.push('Tenía combustible de sobra: corrigió el rumbo sin apuro.');

    const stormNeed = ark.needs.shield + (fast ? 1 : 0);
    if (levels.shield < stormNeed) {
      integrity -= 25 * (stormNeed - levels.shield);
      events.push(`La tormenta solar la castigó: casco ${levels.shield} de ${stormNeed}${fast ? ' (la ruta corta pide uno más)' : ''}.`);
    }
    if (ark.id === struck) {
      if (levels.shield > ark.needs.shield) events.push('Un micrometeorito la golpeó, pero el casco reforzado aguantó.');
      else { integrity -= 20; events.push('Un micrometeorito abrió una fuga: sin casco de sobra, perdió aire y quedó dañada.'); }
    }
    if (!fast && delivered > 0 && CONSUMABLE[ark.id] && levels.cargo <= ark.needs.cargo) {
      // La ruta larga gasta lo que se come y lo que está vivo: se nota en las arcas que llevan lo justo.
      delivered -= 1;
      events.push(CONSUMABLE[ark.id]);
    }
    integrity = Math.max(0, integrity);
    const lost = integrity === 0;
    if (lost) { delivered = 0; events.push('No llegó a Marte.'); }
    else if (integrity < 50) { delivered = Math.ceil(delivered / 2); events.push('Llegó muy dañada: solo se salvó la mitad de la carga.'); }
    if (events.length === 0) events.push('Viaje sin novedades.');
    arks[ark.id] = { integrity, lost, delivered, level: lost ? 0 : Math.min(1, delivered / ark.needs.cargo), events };
  }
  const arrived = ARKS.filter((ark) => !arks[ark.id].lost).length;
  return { struck, route: fleet.route, arks, arrived };
};

/** Hacen falta al menos tres arcas para fundar la colonia. */
export const MIN_ARKS = 3;

/** Qué tan completa queda la colonia (0 a 1): el promedio de lo que entregó cada arca. */
export const colonyLevel = (journey) => (journey ? ARKS.reduce((sum, ark) => sum + journey.arks[ark.id].level, 0) / ARKS.length : 0);
