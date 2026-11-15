/**
 * CATÁLOGO DE PIEZAS (datos)
 * Todas las piezas con las que se arma una nave. Lo usan el navegador y el servidor.
 * Para agregar una pieza, agrega una entrada en PARTS: el mercado, el constructor y la física
 * la toman de aquí, sin tocar nada más.
 *
 * Una pieza del catálogo es el "modelo base". Lo que se compra es una versión concreta de ese
 * modelo: resolvePart({ partId, tier, quality, condition }) devuelve sus números reales.
 *   - tier (rareza): common → legendary. Mejor rareza = más eficiente, más liviana, más confiable y más cara.
 *   - quality (0 a 1): variación dentro de la misma rareza; dos motores "raros" no son idénticos.
 *   - condition (estado): nueva, usada, dañada o reparada. Lo usado es barato y falla más.
 *
 * QUÉ ES REAL Y QUÉ NO
 * - Motores y tanques: valores APROXIMADOS, del orden de motores reales de cada clase (el campo
 *   `like` dice cuál). No son fichas oficiales: sirven para que las proporciones sean creíbles.
 * - Precios, rarezas, probabilidades de falla, resistencia y durabilidad: valores de JUEGO,
 *   inventados para que haya decisiones. No son estadísticas reales de ninguna agencia.
 *
 * Unidades: masa en kg, empuje en N, impulso específico en s, potencia en W, energía en J,
 * altura en m, resistencia en N, precio en créditos.
 */
import { WATT_HOUR } from './physics.js';

// ---------- Categorías ----------
export const CATEGORIES = [
  { id: 'structure', name: 'Estructura' },
  { id: 'propulsion', name: 'Propulsión' },
  { id: 'energy', name: 'Energía' },
  { id: 'comms', name: 'Navegación y comunicaciones' },
  { id: 'exploration', name: 'Exploración' },
  { id: 'survival', name: 'Supervivencia' },
];

/** Combustibles. Un motor solo quema el suyo, y lo toma de los tanques de su misma etapa. */
export const PROPELLANTS = {
  kerolox: { name: 'Queroseno y oxígeno', price: 0.0006 }, //   denso y barato: ideal para despegar
  hydrolox: { name: 'Hidrógeno y oxígeno', price: 0.0011 }, //  muy eficiente, tanques grandes y pesados
  hypergolic: { name: 'Hipergólico', price: 0.004 }, //         se enciende solo y se guarda meses: maniobras y alunizaje
};

/**
 * Lo que una pieza le da a la nave. La misión pide algunas de estas capacidades
 * (js/missions.js → requirements) y la validación revisa que estén.
 */
export const CAPABILITIES = {
  command: 'Cabina de mando',
  crew: 'Lugar para la tripulación',
  heatshield: 'Escudo térmico para la reentrada',
  'life-support': 'Soporte vital',
  guidance: 'Computadora de vuelo',
  attitude: 'Control de orientación',
  comms: 'Comunicación con la Tierra',
  relay: 'Satélite repetidor',
  'landing-gear': 'Tren de aterrizaje',
  'landing-engine': 'Motor regulable para aterrizar',
  'prism-scan': 'Instrumento para ubicar el Prisma',
  'prism-cargo': 'Contenedor para traer el Prisma',
  aero: 'Punta aerodinámica',
  separator: 'Separador de etapas',
};

// ---------- Piezas ----------
/**
 * @typedef {object} Part
 * @property {string} id
 * @property {string} name
 * @property {string} category        id de CATEGORIES
 * @property {string} kind            engine | tank | capsule | structure | power | battery | comms | instrument | cargo | support
 * @property {string} description
 * @property {number} mass            masa en seco (kg)
 * @property {number} height          alto en la pila (m)
 * @property {number} cost            precio base (versión común, nueva)
 * @property {number} failureRate     probabilidad base de falla por uso (0 a 1; valor de juego)
 * @property {string[]} [provides]    capacidades (ids de CAPABILITIES)
 * @property {string} [like]          motor o equipo real al que se parece (referencia aproximada)
 * @property {string} [propellant]    motores y tanques: id de PROPELLANTS
 * @property {number} [thrust]        motores: empuje en el vacío (N)
 * @property {number} [thrustSea]     motores: empuje al nivel del mar (N)
 * @property {number} [isp]           motores: impulso específico en el vacío (s)
 * @property {number} [ispSea]        motores: impulso específico al nivel del mar (s)
 * @property {number} [capacity]      tanques: combustible que cabe (kg)
 * @property {number} [strength]      carga que soporta encima sin romperse (N; valor de juego)
 * @property {number} [powerOutput]   potencia que genera (W)
 * @property {number} [powerDraw]     potencia que consume (W)
 * @property {number} [energyCapacity] energía que guarda (J)
 * @property {number} [crew]          tripulantes que caben
 * @property {string} [slot]          dónde va en una etapa: engines | core | mounted (lo pone FITTING, abajo)
 * @property {number} [width]         ancho (m), para dibujarla
 * @property {number} [mounts]        puntos de montaje que ofrece para colgarle equipo
 * @property {number} [mountCost]     puntos de montaje que ocupa (0 = tiene su propio anclaje)
 */

/** @type {Part[]} */
export const PARTS = [
  // ----- Propulsión: motores -----
  {
    id: 'engine-atm-l', name: 'Motor atmosférico grande', category: 'propulsion', kind: 'engine',
    description: 'Muchísimo empuje para levantar el cohete del suelo. Gasta combustible rápido y rinde poco en el vacío.',
    like: 'clase F-1 (Saturno V)',
    propellant: 'kerolox', thrust: 7_770_000, thrustSea: 6_770_000, isp: 304, ispSea: 263,
    mass: 8_400, height: 5.6, cost: 900, failureRate: 0.02,
  },
  {
    id: 'engine-atm-m', name: 'Motor atmosférico mediano', category: 'propulsion', kind: 'engine',
    description: 'Motor de despegue más chico y más eficiente. Se suelen montar varios juntos.',
    like: 'clase Merlin 1D',
    propellant: 'kerolox', thrust: 914_000, thrustSea: 845_000, isp: 311, ispSea: 282,
    mass: 470, height: 2.9, cost: 150, failureRate: 0.02,
  },
  {
    id: 'engine-vac-l', name: 'Motor de vacío grande', category: 'propulsion', kind: 'engine',
    description: 'Para las etapas altas: mucho más eficiente que un motor de despegue, pero inútil al nivel del mar.',
    like: 'clase J-2',
    propellant: 'hydrolox', thrust: 1_033_000, thrustSea: 480_000, isp: 421, ispSea: 200,
    mass: 1_790, height: 3.4, cost: 520, failureRate: 0.025,
  },
  {
    id: 'engine-vac-s', name: 'Motor de vacío chico', category: 'propulsion', kind: 'engine',
    description: 'El más eficiente del catálogo. Poco empuje: sirve para maniobras largas en el espacio.',
    like: 'clase RL10',
    propellant: 'hydrolox', thrust: 110_000, thrustSea: 0, isp: 462, ispSea: 0,
    mass: 300, height: 2.2, cost: 240, failureRate: 0.02,
  },
  {
    id: 'engine-orbital', name: 'Motor orbital', category: 'propulsion', kind: 'engine',
    description: 'Simple y confiable: se enciende todas las veces que haga falta. Para entrar y salir de órbita.',
    like: 'clase AJ10',
    propellant: 'hypergolic', thrust: 27_000, thrustSea: 0, isp: 316, ispSea: 0,
    mass: 120, height: 1.6, cost: 110, failureRate: 0.01,
  },
  {
    id: 'engine-lander', name: 'Motor de alunizaje', category: 'propulsion', kind: 'engine',
    description: 'Su empuje se regula a mano, que es lo que permite posarse despacio.',
    like: 'clase motor de descenso del módulo lunar Apolo',
    propellant: 'hypergolic', thrust: 45_000, thrustSea: 0, isp: 311, ispSea: 0,
    mass: 180, height: 2.0, cost: 170, failureRate: 0.015, provides: ['landing-engine'],
  },
  {
    id: 'thrusters', name: 'Propulsores auxiliares', category: 'propulsion', kind: 'support',
    description: 'Pequeños chorros para girar y orientar la nave. Sin ellos no se puede apuntar un encendido.',
    mass: 90, height: 0.4, cost: 60, failureRate: 0.01, powerDraw: 20, provides: ['attitude'],
  },

  // ----- Propulsión: tanques (la masa es el tanque vacío, con su estructura) -----
  {
    id: 'tank-kero-l', name: 'Tanque grande de queroseno', category: 'propulsion', kind: 'tank',
    description: 'El tanque de la primera etapa. Lleno pesa unas 20 veces lo que pesa vacío.',
    propellant: 'kerolox', capacity: 600_000, mass: 31_000, height: 16, cost: 380, failureRate: 0.008, strength: 150_000_000,
  },
  {
    id: 'tank-kero-m', name: 'Tanque mediano de queroseno', category: 'propulsion', kind: 'tank',
    description: 'Para etapas intermedias o cohetes chicos.',
    propellant: 'kerolox', capacity: 150_000, mass: 8_200, height: 7, cost: 110, failureRate: 0.008, strength: 60_000_000,
  },
  {
    id: 'tank-hydro-l', name: 'Tanque grande de hidrógeno', category: 'propulsion', kind: 'tank',
    description: 'El hidrógeno es liviano pero ocupa mucho lugar: el tanque pesa más por cada kilo que guarda.',
    propellant: 'hydrolox', capacity: 160_000, mass: 15_000, height: 14, cost: 340, failureRate: 0.012, strength: 30_000_000,
  },
  {
    id: 'tank-hydro-m', name: 'Tanque mediano de hidrógeno', category: 'propulsion', kind: 'tank',
    description: 'Para la etapa que sale de la órbita terrestre.',
    propellant: 'hydrolox', capacity: 40_000, mass: 4_100, height: 7, cost: 130, failureRate: 0.012, strength: 8_000_000,
  },
  {
    id: 'tank-hyper-m', name: 'Tanque hipergólico mediano', category: 'propulsion', kind: 'tank',
    description: 'Combustible que se guarda semanas sin evaporarse: el del viaje de vuelta.',
    propellant: 'hypergolic', capacity: 8_000, mass: 640, height: 2.6, cost: 55, failureRate: 0.008, strength: 2_500_000,
  },
  {
    id: 'tank-hyper-s', name: 'Tanque hipergólico chico', category: 'propulsion', kind: 'tank',
    description: 'Un poco más de combustible para maniobras.',
    propellant: 'hypergolic', capacity: 2_000, mass: 180, height: 1.2, cost: 22, failureRate: 0.008, strength: 1_200_000,
  },

  // ----- Estructura -----
  {
    id: 'capsule', name: 'Cápsula de mando', category: 'structure', kind: 'capsule',
    description: 'Donde viaja la tripulación. Trae computadora básica, una batería chica y el escudo para volver a la Tierra.',
    mass: 2_600, height: 3.3, cost: 700, failureRate: 0.004, strength: 1_500_000, crew: 4,
    powerDraw: 400, energyCapacity: 2_000 * WATT_HOUR, provides: ['command', 'crew', 'heatshield', 'guidance'],
  },
  {
    id: 'nose-cone', name: 'Cofia', category: 'structure', kind: 'structure',
    description: 'Punta aerodinámica: sin ella el aire frena mucho más al cohete durante el ascenso.',
    mass: 900, height: 4, cost: 45, failureRate: 0.003, strength: 600_000, provides: ['aero'],
  },
  {
    id: 'separator', name: 'Separador de etapas', category: 'structure', kind: 'structure',
    description: 'Suelta la etapa vacía para no cargar con su peso. Va entre una etapa y la siguiente.',
    mass: 350, height: 0.6, cost: 30, failureRate: 0.01, strength: 40_000_000, provides: ['separator'],
  },
  {
    id: 'landing-legs', name: 'Tren de aterrizaje', category: 'structure', kind: 'structure',
    description: 'Patas plegables que amortiguan el contacto con el suelo.',
    mass: 480, height: 1.4, cost: 120, failureRate: 0.012, strength: 3_000_000, provides: ['landing-gear'],
  },

  // ----- Energía -----
  {
    id: 'solar-panel', name: 'Panel solar', category: 'energy', kind: 'power',
    description: 'Genera energía mientras le dé el Sol. En la sombra de la Luna no produce nada.',
    mass: 70, height: 0.3, cost: 80, failureRate: 0.008, powerOutput: 1_400,
  },
  {
    id: 'battery', name: 'Batería', category: 'energy', kind: 'battery',
    description: 'Guarda energía para cuando no hay Sol.',
    mass: 55, height: 0.3, cost: 50, failureRate: 0.006, energyCapacity: 5_000 * WATT_HOUR,
  },
  {
    id: 'fuel-cell', name: 'Celda de combustible', category: 'energy', kind: 'power',
    description: 'Genera energía de día y de noche, pero es pesada.',
    mass: 240, height: 0.6, cost: 190, failureRate: 0.01, powerOutput: 1_800,
  },

  // ----- Navegación y comunicaciones -----
  {
    id: 'antenna', name: 'Antena de alta ganancia', category: 'comms', kind: 'comms',
    description: 'Habla con la Tierra desde la distancia de la Luna, siempre que la Tierra esté a la vista.',
    mass: 45, height: 0.5, cost: 90, failureRate: 0.01, powerDraw: 120, provides: ['comms'],
  },
  {
    id: 'relay-sat', name: 'Satélite repetidor', category: 'comms', kind: 'comms',
    description: 'Se deja en órbita lunar y rebota la señal: así hay comunicación también detrás de la Luna.',
    mass: 320, height: 1.2, cost: 260, failureRate: 0.012, provides: ['relay'],
  },
  {
    id: 'flight-computer', name: 'Computadora de vuelo avanzada', category: 'comms', kind: 'comms',
    description: 'Calcula los encendidos con más precisión que la computadora básica de la cápsula.',
    mass: 30, height: 0.3, cost: 140, failureRate: 0.006, powerDraw: 150, provides: ['guidance'],
  },

  // ----- Exploración -----
  {
    id: 'spectrometer', name: 'Espectrómetro', category: 'exploration', kind: 'instrument',
    description: 'Lee de qué está hecho el suelo. Es lo que permite ubicar el mineral del Prisma.',
    mass: 40, height: 0.4, cost: 180, failureRate: 0.012, powerDraw: 300, provides: ['prism-scan'],
  },
  {
    id: 'sample-vault', name: 'Contenedor del Prisma', category: 'exploration', kind: 'cargo',
    description: 'Caja blindada para traer el Prisma sin dañarlo.',
    mass: 130, height: 0.6, cost: 110, failureRate: 0.004, provides: ['prism-cargo'],
  },
  {
    id: 'rover', name: 'Vehículo explorador', category: 'exploration', kind: 'instrument',
    description: 'Recorre más terreno que la tripulación a pie. Opcional, y pesa.',
    mass: 460, height: 1.3, cost: 300, failureRate: 0.02, powerDraw: 250,
  },

  // ----- Supervivencia -----
  {
    id: 'life-support', name: 'Soporte vital', category: 'survival', kind: 'support',
    description: 'Aire, agua y temperatura para la tripulación durante todo el viaje.',
    mass: 320, height: 0.8, cost: 240, failureRate: 0.005, powerDraw: 800, provides: ['life-support'],
  },
];

/**
 * Cómo encaja cada pieza en una etapa (lo usa js/assembly.js):
 *   slot 'engines'  motores, uno al lado del otro en la base de la etapa
 *   slot 'core'     el cuerpo, apilado: tanques, cápsula, separador, cofia
 *   slot 'mounted'  equipo colgado a los costados; cada uno ocupa `mountCost` puntos de montaje
 * `mounts` = puntos de montaje que ofrece una pieza del cuerpo. `width` en metros.
 */
const FITTING = {
  'engine-atm-l': { slot: 'engines', width: 3.7 },
  'engine-atm-m': { slot: 'engines', width: 1.4 },
  'engine-vac-l': { slot: 'engines', width: 2.1 },
  'engine-vac-s': { slot: 'engines', width: 1.3 },
  'engine-orbital': { slot: 'engines', width: 1.1 },
  'engine-lander': { slot: 'engines', width: 1.5 },
  'tank-kero-l': { slot: 'core', width: 10, mounts: 4 },
  'tank-kero-m': { slot: 'core', width: 6.6, mounts: 3 },
  'tank-hydro-l': { slot: 'core', width: 8.4, mounts: 4 },
  'tank-hydro-m': { slot: 'core', width: 5.5, mounts: 3 },
  'tank-hyper-m': { slot: 'core', width: 3.6, mounts: 2 },
  'tank-hyper-s': { slot: 'core', width: 3.6, mounts: 2 },
  capsule: { slot: 'core', width: 3.9, mounts: 8 },
  'nose-cone': { slot: 'core', width: 3.9 },
  separator: { slot: 'core', width: 3.9 },
  'landing-legs': { slot: 'mounted', width: 1, mountCost: 0 },
};
for (const part of PARTS) Object.assign(part, { slot: 'mounted', width: 1, mounts: 0, mountCost: 1 }, FITTING[part.id]);

export const getPart = (id) => PARTS.find((part) => part.id === id);

// ---------- Rareza, calidad y estado (valores de juego) ----------

/** Rarezas, de menor a mayor. `mark` acompaña al color para no depender solo del color. */
export const TIERS = [
  { id: 'common', name: 'Común', mark: '●', color: '#8a8f9c' },
  { id: 'uncommon', name: 'Poco común', mark: '●●', color: '#3fa597' },
  { id: 'rare', name: 'Rara', mark: '●●●', color: '#7ea6ff' },
  { id: 'epic', name: 'Épica', mark: '◆', color: '#b293f2' },
  { id: 'legendary', name: 'Legendaria', mark: '★', color: '#f3b641' },
];

export const tierIndex = (id) => TIERS.findIndex((tier) => tier.id === id);

/**
 * Cuánto mejora cada número de una pieza por cada escalón de rareza ("grado").
 * Las mejoras son chicas a propósito: un motor mejor rinde un poco más, no el doble.
 */
const GRADE = {
  isp: 0.015, //            +1.5 % de eficiencia por grado
  thrust: 0.03, //          +3 % de empuje
  mass: -0.025, //          −2.5 % de masa en seco
  power: 0.055, //          +5.5 % de generación y de capacidad de batería
  powerDraw: -0.04, //      −4 % de consumo
  strength: 0.06, //        +6 % de resistencia
  failure: 0.6, //          la probabilidad de falla se multiplica por 0.6 en cada grado
  price: 1.62, //           el precio se multiplica por 1.62 en cada grado
  qualitySpread: 0.8, //    la calidad mueve el grado ±0.4 dentro de la misma rareza
};

/** Estados. `performance` multiplica empuje y potencia; `failure` y `price` multiplican lo suyo. */
export const CONDITIONS = {
  new: { name: 'Nueva', performance: 1, failure: 1, price: 1 },
  used: { name: 'Usada', performance: 1, failure: 1.8, price: 0.65 },
  repaired: { name: 'Reparada', performance: 0.97, failure: 1.4, price: 0.55 },
  damaged: { name: 'Dañada', performance: 0.9, failure: 4, price: 0.35 },
};

/**
 * Los números reales de una versión concreta de una pieza.
 * @param {{ partId: string, tier?: string, quality?: number, condition?: string }} version
 * @returns {Part & { partId: string, tier: string, quality: number, condition: string, grade: number, price: number }}
 */
export const resolvePart = ({ partId, tier = 'common', quality = 0.5, condition = 'new' }) => {
  const base = getPart(partId);
  if (!base) throw new RangeError(`No existe la pieza "${partId}"`);
  const state = CONDITIONS[condition];
  if (tierIndex(tier) < 0 || !state) throw new RangeError(`Rareza o estado desconocido: ${tier}, ${condition}`);

  const q = Math.min(1, Math.max(0, quality));
  const grade = tierIndex(tier) + (q - 0.5) * GRADE.qualitySpread;
  const scaled = (value, perGrade, extra = 1) => (value === undefined ? undefined : value * (1 + perGrade * grade) * extra);
  const whole = (value) => (value === undefined ? undefined : Math.round(value));

  const resolved = {
    ...base,
    partId,
    tier,
    quality: q,
    condition,
    grade,
    mass: Math.round(scaled(base.mass, GRADE.mass)),
    isp: scaled(base.isp, GRADE.isp),
    ispSea: scaled(base.ispSea, GRADE.isp),
    thrust: whole(scaled(base.thrust, GRADE.thrust, state.performance)),
    thrustSea: whole(scaled(base.thrustSea, GRADE.thrust, state.performance)),
    powerOutput: whole(scaled(base.powerOutput, GRADE.power, state.performance)),
    energyCapacity: whole(scaled(base.energyCapacity, GRADE.power, state.performance)),
    powerDraw: whole(scaled(base.powerDraw, GRADE.powerDraw)),
    strength: whole(scaled(base.strength, GRADE.strength, state.performance)),
    failureRate: Math.min(0.9, base.failureRate * GRADE.failure ** grade * state.failure),
    price: Math.max(1, Math.round(base.cost * GRADE.price ** grade * state.price)),
  };
  // Las piezas que no tienen un dato no lo inventan.
  for (const key of Object.keys(resolved)) if (resolved[key] === undefined) delete resolved[key];
  return resolved;
};

/** Precio (créditos) de llenar un tanque con `kilograms` de su combustible. */
export const propellantPrice = (propellant, kilograms) => Math.ceil((PROPELLANTS[propellant]?.price ?? 0) * Math.max(0, kilograms));
