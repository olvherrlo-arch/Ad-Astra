/**
 * EL VUELO (servidor)
 * Vuela la nave tramo por tramo (js/flightplans.js). Funciones puras: reciben el vuelo y devuelven el nuevo.
 *
 * Aquí la nave vuela con sus números VERDADEROS: un motor del mercado negro con un defecto oculto
 * falla más de lo que decía su ficha, y eso se descubre recién ahora.
 *
 * Quién hace qué (cada quien con las manos, en el mundo: js/world.js):
 *   Vuelo       pilotea cada encendido en el timón: manda cuánto Δv quemó de verdad (`dv`) y qué tan
 *               bien mantuvo la nariz en la marca (`aim`, 0 a 1). Quedarse corto pide otro encendido
 *               (y cada encendido puede fallar); pasarse gasta combustible que después puede faltar.
 *               El alunizaje lo vuela a mano y manda cómo tocó el suelo (`touchdown`).
 *   Ingeniería  ajusta los motores antes de cada encendido, maneja la energía (normal / ahorro),
 *               repara lo que se rompe y perfora donde está el Prisma.
 *   Ciencia     fija la posición con las estrellas antes de cada encendido y, en la Luna, escanea:
 *               cada lectura da la distancia al Prisma desde donde está parada (gasta energía).
 *   Comercio    asegura la carga antes de cada encendido, lleva el repuesto hasta la avería (y lo paga)
 *               y carga el Prisma hasta la nave.
 * Los preparativos (`flight.prep`) son ventajas para el próximo encendido y se gastan al encender.
 * Las emergencias se resuelven entre varios: cada salida dice qué roles tienen que participar.
 *
 * Lo que ve el equipo va en `flight` (state.data.flight). La nave con sus números verdaderos va en
 * `ship` (state.secret.ship) y nunca se envía.
 *
 * Probabilidades de falla, precisión del guiado y costos de reparación son valores de juego.
 */
import { CAPABILITIES } from '../js/catalog.js';
import { PRISM_MASS } from '../js/flightplans.js';
import { trueItem } from '../js/market.js';
import { number } from '../js/partinfo.js';
import { BODIES, batteryStep, combinedIsp, deltaV, gravityAt, propellantFor, thrustToWeight, WATT_HOUR } from '../js/physics.js';
import { createRng } from '../js/random.js';
import { scienceReport } from '../js/science.js';
import { roleName } from '../js/shared.js';
import { MAPS } from '../js/worldmaps.js';

const EVENT_LIMIT = 40;
/** Precisión del guiado: error típico de un encendido, como fracción del Δv pedido (valores de juego). */
export const GUIDANCE = {
  basic: 0.015, //       la computadora que trae la cápsula
  advanced: 0.005, //    con la computadora de vuelo avanzada
  noAttitude: 1.5, //    sin propulsores auxiliares para apuntar
  noSignal: 2, //        sin señal con la Tierra: sin ayuda de las estaciones de seguimiento
};
const DONE_TOLERANCE = 0.995; // un tramo se da por hecho al llegar al 99,5 % de su Δv
const SCAN_HOURS = 2; //         cada búsqueda del Prisma deja el espectrómetro encendido 2 h
const SCAN_FAILURE_FACTOR = 3; // el espectrómetro se exige más que en la ficha (polvo, frío)
const LEAK_FRACTION = 0.2; //    combustible que se pierde por una fuga tras un aterrizaje duro
const REPAIR_SHARE = 0.4; //     un repuesto cuesta el 40 % de lo que se pagó por la pieza
const MIN_REPAIR = 25;
/** Lo que mejora cada preparativo y cada ventaja ganada en la estación (valores de juego). */
export const BONUS = {
  nav: 0.65, //       posición fijada con las estrellas: el error del encendido baja a 65 %
  cargo: 0.85, //     carga asegurada
  sim: 0.85, //       piloto entrenado (solo al subir a órbita)
  trim: 0.5, //       motores ajustados: la mitad de riesgo de falla en ese encendido
  engines: 0.75, //   motores probados en el banco
  regolith: 0.5, //   suelo firme elegido: las patas fallan la mitad
  scanner: 1.4, //    espectrómetro calibrado: alcance del escaneo
  solar: 0.3, //      el panel de campo recarga 30 % de la batería
};
const NO_PREP = { nav: false, trim: false, cargo: false };
const PING_LIMIT = 8;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

// ============================================================
//  La nave (números verdaderos, solo en el servidor)
// ============================================================

const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);
const working = (item) => !item.failed;
const enginesOf = (stage) => stage.items.filter((item) => item.kind === 'engine' && working(item));
const massOf = (stage) => sum(stage.items, (item) => item.mass) + stage.propellant + stage.dead;
const shipMass = (ship) => sum(ship.stages, massOf) + ship.extraMass;
const canFire = (stage) => enginesOf(stage).length > 0 && stage.propellant > 0.5;
const allItems = (ship) => ship.stages.flatMap((stage) => stage.items);
const findItem = (ship, uid) => allItems(ship).find((item) => item.uid === uid);
const hasWorking = (ship, capability) => allItems(ship).some((item) => working(item) && (item.provides ?? []).includes(capability));
const hasWorkingPart = (ship, partId) => allItems(ship).some((item) => working(item) && item.partId === partId);

const stageEngines = (stage) => {
  const engines = enginesOf(stage);
  const sea = engines.filter((engine) => engine.thrustSea > 0);
  return {
    thrust: sum(engines, (engine) => engine.thrust),
    thrustSea: sum(sea, (engine) => engine.thrustSea),
    isp: combinedIsp(engines.map((engine) => ({ thrust: engine.thrust, isp: engine.isp }))),
    ispSea: combinedIsp(sea.map((engine) => ({ thrust: engine.thrustSea, isp: engine.ispSea }))),
  };
};

/** Suelta las etapas de abajo que ya no pueden empujar (mientras quede algo arriba). Devuelve cuántas soltó. */
const dropSpent = (ship) => {
  let dropped = 0;
  while (ship.stages.length > 1 && !canFire(ship.stages[0])) {
    ship.stages.shift();
    dropped++;
  }
  ship.dropped += dropped;
  return dropped;
};

/** Δv que le queda a la nave si se quemara todo, de abajo hacia arriba (sin errores ni fallas). */
const deltaVLeft = (ship) => {
  let total = 0;
  let mass = shipMass(ship);
  for (const stage of ship.stages) {
    const { isp } = stageEngines(stage);
    if (canFire(stage) && isp > 0) total += deltaV(isp, mass, mass - stage.propellant);
    mass -= massOf(stage);
  }
  return total;
};

/**
 * Arma la nave que despega: las piezas del cohete con sus números verdaderos y los tanques cargados.
 * @param {{ rocket: any, inventory: any[], vaultItems: Record<string, any> }} input
 */
export const buildShip = ({ rocket, inventory, vaultItems }) => {
  const byUid = new Map(inventory.map((item) => [item.uid, item]));
  const make = (uid) => {
    const item = byUid.get(uid);
    const truth = vaultItems[uid] ?? { quality: item.quality, condition: item.condition, defect: 1 };
    return {
      ...trueItem(item, truth), uid, source: item.source, sellerId: item.sellerId ?? null,
      inspected: item.inspected ?? null, paid: item.paid, failed: false, repaired: false,
    };
  };
  const stages = rocket.stages.map((stage, index) => {
    const items = [...stage.engines, ...stage.core, ...stage.mounted].map(make);
    const fuel = items.find((item) => item.kind === 'engine')?.propellant ?? null;
    let propellant = 0;
    let dead = 0;
    for (const tank of items.filter((item) => item.kind === 'tank')) {
      const load = tank.capacity * Math.min(1, Math.max(0, stage.fill));
      if (tank.propellant === fuel) propellant += load;
      else dead += load;
    }
    return { number: index + 1, items, propellant, dead, capacity: sum(items.filter((i) => i.kind === 'tank' && i.propellant === fuel), (i) => i.capacity) };
  });
  const ship = { stages, extraMass: 0, dropped: 0, rolls: 0 };
  const capacity = sum(allItems(ship), (item) => item.energyCapacity ?? 0);
  return { ...ship, energy: capacity, energyCapacity: capacity };
};

// ============================================================
//  Lo que ve el equipo
// ============================================================

/** Datos de la nave que se muestran (el estado de cada etapa y de cada pieza que importa). */
const telemetry = (ship, legs, legIndex) => {
  const leg = legs[legIndex];
  const body = leg?.body ? BODIES[leg.body] : null;
  const active = ship.stages[0];
  const engines = stageEngines(active);
  return {
    mass: shipMass(ship),
    deltaVLeft: deltaVLeft(ship),
    twr: body ? thrustToWeight(leg.atmosphere ? engines.thrustSea : engines.thrust, shipMass(ship), gravityAt(body)) : null,
    dropped: ship.dropped,
    energy: ship.energy,
    energyCapacity: ship.energyCapacity,
    stages: ship.stages.map((stage) => ({
      number: stage.number,
      propellant: stage.propellant,
      capacity: stage.capacity,
      engines: stage.items.filter((item) => item.kind === 'engine').length,
      enginesWorking: enginesOf(stage).length,
    })),
    parts: allItems(ship)
      .filter((item) => item.kind !== 'tank' && item.partId !== 'separator' && item.partId !== 'nose-cone')
      .map((item) => ({ uid: item.uid, partId: item.partId, name: item.name, failed: item.failed, repaired: item.repaired })),
  };
};

/** Precisión del próximo encendido y por qué es así. */
export const guidanceFor = (ship, flight, leg) => {
  const reasons = [];
  const advanced = hasWorkingPart(ship, 'flight-computer');
  let sigma = (advanced ? GUIDANCE.advanced : GUIDANCE.basic) * (ship.guidanceFactor ?? 1);
  reasons.push(advanced ? 'computadora de vuelo avanzada' : 'computadora básica de la cápsula');
  if (!hasWorking(ship, 'attitude')) {
    sigma *= GUIDANCE.noAttitude;
    reasons.push('sin propulsores auxiliares para apuntar');
  }
  if (!signalFor(ship, flight, leg)) {
    sigma *= GUIDANCE.noSignal;
    reasons.push(leg?.farSide && hasWorking(ship, 'comms') ? 'detrás de la Luna, sin señal' : 'sin antena que funcione, sin señal');
  }
  if (flight.prep?.nav) {
    sigma *= BONUS.nav;
    reasons.push('posición fijada con las estrellas');
  }
  if (flight.prep?.cargo) {
    sigma *= BONUS.cargo;
    reasons.push('carga asegurada');
  }
  if (ship.perks?.sim && leg?.id === 'ascent') {
    sigma *= BONUS.sim;
    reasons.push('piloto entrenado en el simulador');
  }
  return { sigma, reasons };
};

/** ¿Hay comunicación con la Tierra en este tramo? Hace falta una antena y, detrás de la Luna, el repetidor. */
const signalFor = (ship, flight, leg) => hasWorking(ship, 'comms') && (!leg?.farSide || flight.relay);

// ============================================================
//  Empezar el vuelo
// ============================================================

/** Dificultad elegida en el lobby (valores de juego): cuánto fallan las piezas y cuánto se desvía el guiado. */
export const DIFFICULTY = {
  'Fácil': { failure: 0.6, guidance: 0.75, budget: 1.25 },
  Normal: { failure: 1, guidance: 1, budget: 1 },
  'Difícil': { failure: 1.5, guidance: 1.3, budget: 0.85 },
};

/**
 * El vuelo recién despegado: devuelve `{ flight, ship }`.
 * @param {{ rocket: any, inventory: any, vaultItems: any, legs: any, seed: number, perks?: { zone?: boolean, [k: string]: any }, difficulty?: string }} args */
export const startFlight = ({ rocket, inventory, vaultItems, legs, seed, perks = {}, difficulty = 'Normal' }) => {
  const level = DIFFICULTY[difficulty] ?? DIFFICULTY.Normal;
  const ship = { ...buildShip({ rocket, inventory, vaultItems }), seed, perks, prismSpot: pickPrismSpot(seed), guidanceFactor: level.guidance };
  // Con más dificultad las piezas fallan más seguido (y con menos, menos).
  for (const item of ship.stages.flatMap((stage) => stage.items)) item.failureRate = Math.min(0.9, item.failureRate * level.failure);
  const flight = {
    legIndex: 0,
    progress: 0, //      Δv ya hecho en el tramo actual
    phase: 'ready', //   ready | emergency | stageDone | over
    mode: 'normal', //   energía: normal | saving (sin instrumentos)
    relay: false, //     el repetidor quedó en órbita lunar
    prep: { ...NO_PREP }, // preparativos hechos para el próximo encendido
    zone: perks.zone ? hintZone(ship.prismSpot, seed) : null, // zona que marcó el telescopio
    pings: [], //        lecturas del escáner: { x, y, d } = "desde aquí, el Prisma está a d metros"
    located: null, //    { x, y } cuando un escaneo lo encuentra
    dug: false, //       ya se perforó: se puede levantar
    solar: false, //     panel de campo desplegado
    touchdown: null, //  cómo tocó el suelo el alunizaje: soft | hard | crash
    kitUsed: false, //   ya se usó el kit de repuestos
    prism: false,
    scans: 0,
    burns: 0,
    wasted: 0, //        Δv quemado de más (m/s)
    dvUsed: 0,
    repairsPaid: 0,
    blackout: false, //  hubo tramos sin señal
    savedPower: false, // tuvo que pasar a ahorro por falta de energía
    emergency: null,
    history: [], //      emergencias resueltas (para la evaluación)
    events: [],
    science: null, //    lo que midieron los instrumentos en la superficie (js/science.js)
    result: null, //     { ok, text } cuando termina
    precision: null,
    telemetry: null,
  };
  return refresh({ flight, ship, legs });
};

/** Dónde está enterrado el Prisma en el mapa lunar (fuera de las rocas). Solo lo sabe el servidor. */
const pickPrismSpot = (seed) => {
  const { prismZone: zone, rocks } = MAPS.moon;
  const rng = createRng((seed ?? 1) * 31 + 17);
  for (let attempt = 0; attempt < 30; attempt++) {
    const spot = { x: Math.round(zone.x + rng() * zone.w), y: Math.round(zone.y + rng() * zone.h) };
    const blocked = rocks.some((rock) => spot.x > rock.x - 60 && spot.x < rock.x + rock.w + 60 && spot.y > rock.y - 60 && spot.y < rock.y + rock.h + 60);
    if (!blocked) return spot;
  }
  return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
};

/** La zona que marca el telescopio: un círculo grande que contiene al Prisma, corrido para no delatar el centro. */
const hintZone = (spot, seed) => {
  const rng = createRng((seed ?? 1) * 53 + 5);
  const angle = rng() * Math.PI * 2, offset = rng() * 170;
  return { x: Math.round(spot.x + Math.cos(angle) * offset), y: Math.round(spot.y + Math.sin(angle) * offset), r: 300 };
};

/** Recalcula lo que ve el equipo después de cualquier cambio. */
const refresh = ({ flight, ship, legs }) => {
  const leg = legs[flight.legIndex];
  return {
    flight: {
      ...flight,
      signal: leg ? signalFor(ship, flight, leg) : true,
      precision: leg ? guidanceFor(ship, flight, leg) : null,
      telemetry: telemetry(ship, legs, flight.legIndex),
    },
    ship,
  };
};

// ============================================================
//  Acciones
// ============================================================

export const isFlightAction = (action) => {
  switch (action.type) {
    case 'flight:burn':
      return Number.isFinite(action.dv) && action.dv > 0 && action.dv < 100_000
        && (action.aim === undefined || Number.isFinite(action.aim))
        && (action.touchdown === undefined || ['soft', 'hard', 'crash'].includes(action.touchdown));
    case 'flight:scan':
      return Number.isFinite(action.x) && Number.isFinite(action.y);
    case 'flight:prep':
      return typeof action.kind === 'string' && action.kind in NO_PREP;
    case 'flight:proceed':
    case 'flight:dig':
    case 'flight:load':
    case 'flight:solar':
      return true;
    case 'flight:power':
      return action.mode === 'normal' || action.mode === 'saving';
    case 'flight:resolve':
      return typeof action.option === 'string' && action.option.length <= 20 && typeof action.role === 'string';
    default:
      return false;
  }
};

/**
 * Aplica una acción del vuelo.
 * Devuelve `{ flight, ship, credits, logs }` o `{ error }`. `credits` es lo que queda del presupuesto.
 * @param {{ flight: any, ship: any, legs: any[], credits: number, stageId: string }} context
 * @param {any} action
 * @param {{ name: string, canActAs: (roleId: string) => boolean }} actor
 */
export const applyFlightAction = ({ flight, ship, legs, credits, stageId }, action, actor) => {
  if (!flight) return { error: 'La nave todavía no despegó.' };
  if (flight.phase === 'over') return { error: 'El vuelo ya terminó.' };
  // Trabajamos sobre copias: si algo sale mal a mitad, el estado anterior queda intacto.
  const work = {
    flight: { ...flight, events: [...flight.events], history: [...flight.history] },
    ship: structuredClone(ship),
    legs,
    credits,
    logs: [],
  };
  const leg = legs[work.flight.legIndex];
  const need = (role) => (actor.canActAs(role) ? null : { error: `Eso lo hace ${roleName(role)}.` });

  if (action.type === 'flight:resolve') return finish(resolveEmergency(work, action, actor));
  if (action.type === 'flight:power') {
    const refused = need('engineer');
    if (refused) return refused;
    if (work.flight.mode === action.mode) return { error: 'La energía ya estaba en ese modo.' };
    work.flight.mode = action.mode;
    note(work, action.mode === 'saving'
      ? `${actor.name} pasó la nave a modo ahorro: los instrumentos se apagan y la batería dura más.`
      : `${actor.name} volvió la energía a modo normal.`);
    return finish(work);
  }

  if (work.flight.phase === 'emergency') return { error: 'Primero hay que resolver la emergencia.' };
  if (work.flight.phase === 'stageDone') return { error: 'Esta parte del viaje terminó: el anfitrión pasa a la siguiente etapa de la misión.' };
  if (leg.stage !== stageId) return { error: 'Ese tramo es de otra etapa de la misión.' };

  switch (action.type) {
    case 'flight:burn': {
      const refused = need('pilot');
      if (refused) return refused;
      if (leg.dv === 0) return { error: 'En este tramo no hace falta encender los motores.' };
      burn(work, leg, action, actor);
      return finish(work);
    }
    case 'flight:prep': {
      const role = { nav: 'scientist', trim: 'engineer', cargo: 'merchant' }[action.kind];
      const refused = need(role);
      if (refused) return refused;
      if (leg.dv === 0) return { error: 'En este tramo no hay ningún encendido que preparar.' };
      if (work.flight.prep[action.kind]) return { error: 'Eso ya está listo para el próximo encendido.' };
      work.flight.prep = { ...work.flight.prep, [action.kind]: true };
      note(work, {
        nav: `${actor.name} fijó la posición con las estrellas: el próximo encendido será más preciso.`,
        trim: `${actor.name} ajustó la mezcla de los motores: menos riesgo de falla en el próximo encendido.`,
        cargo: 'La carga quedó asegurada: la nave apunta mejor en el próximo encendido.',
      }[action.kind], 'good');
      return finish(work);
    }
    case 'flight:dig': {
      const refused = need('engineer');
      if (refused) return refused;
      if (leg.id !== 'surface') return { error: 'Se perfora en la superficie de la Luna.' };
      if (!work.flight.located) return { error: 'Todavía no se sabe dónde perforar: Ciencia tiene que ubicar el Prisma.' };
      if (work.flight.dug || work.flight.prism) return { error: 'Ya se perforó.' };
      work.flight.dug = true;
      note(work, `${actor.name} perforó el suelo: el Prisma quedó a la vista. Hay que cargarlo hasta la nave.`, 'good', true);
      return finish(work);
    }
    case 'flight:load': {
      const refused = need('merchant');
      if (refused) return refused;
      if (leg.id !== 'surface') return { error: 'El Prisma se carga en la superficie de la Luna.' };
      if (work.flight.prism) return { error: 'El Prisma ya está a bordo.' };
      if (!work.flight.dug) return { error: 'El Prisma sigue enterrado.' };
      work.flight.prism = true;
      work.ship.extraMass += PRISM_MASS;
      note(work, `${actor.name} guardó el Prisma en el contenedor. Suma ${PRISM_MASS} kg para el regreso.`, 'good', true);
      return finish(work);
    }
    case 'flight:solar': {
      const refused = need('pilot');
      if (refused) return refused;
      if (leg.id !== 'surface') return { error: 'El panel de campo se despliega en la superficie.' };
      if (work.flight.solar) return { error: 'El panel ya está desplegado.' };
      work.flight.solar = true;
      work.ship.energy = Math.min(work.ship.energyCapacity, work.ship.energy + work.ship.energyCapacity * BONUS.solar);
      note(work, `${actor.name} desplegó el panel solar de campo: la batería se recargó.`, 'good', true);
      return finish(work);
    }
    case 'flight:scan': {
      const refused = need('scientist');
      if (refused) return refused;
      if (leg.id !== 'surface') return { error: 'El Prisma se busca en la superficie de la Luna.' };
      return finish(scan(work, action, actor));
    }
    case 'flight:proceed': {
      const refused = need('pilot');
      if (refused) return refused;
      if (leg.dv > 0) return { error: 'Este tramo se hace encendiendo los motores.' };
      if (leg.id === 'surface' && !work.flight.prism) return { error: 'Todavía no encontraron el Prisma. Si se van sin él, la misión fracasa: para rendirse, primero tiene que fallar la búsqueda.' };
      completeLeg(work, leg);
      return finish(work);
    }
    default:
      return { error: 'Acción desconocida.' };
  }
};

/** Cierra una acción: recalcula la telemetría y devuelve lo que necesita server/game.js. */
const finish = (work) => {
  if (work.error) return { error: work.error };
  const { flight, ship } = refresh(work);
  return { flight, ship, credits: work.credits, logs: work.logs };
};

/** Anota un suceso del vuelo (lo ve todo el equipo). `tone`: info | good | warn | bad */
const note = (work, text, tone = 'info', toLog = false) => {
  work.flight.events = [...work.flight.events, { text, tone, leg: work.flight.legIndex }].slice(-EVENT_LIMIT);
  if (toLog) work.logs.push(text);
};

/** Un número al azar repetible para esta partida (la semilla solo la conoce el servidor). */
const roll = (work) => createRng((work.ship.seed ?? 1) * 7919 + ++work.ship.rolls * 104729)();

const failMission = (work, text) => {
  work.flight.phase = 'over';
  work.flight.emergency = null;
  work.flight.result = { ok: false, text, leg: work.legs[work.flight.legIndex]?.name ?? null };
  note(work, `Misión fallida: ${text}`, 'bad', true);
};

// ---------- Encender los motores ----------

const burn = (work, leg, action, actor) => {
  const { flight, ship } = work;
  const command = action.dv;
  const dropped = dropSpent(ship);
  if (dropped) note(work, `Se soltó ${dropped === 1 ? 'una etapa vacía' : `${dropped} etapas vacías`}.`);
  const firstIsBottom = () => ship.stages[0].number === 1;

  // ¿Puede siquiera levantarse? (despegues y alunizaje). Se mira al empezar el tramo: una vez en
  // marcha, las etapas altas siguen empujando aunque solas no levantarían la nave desde el suelo.
  if (leg.body && leg.minTwr && flight.progress === 0) {
    const engines = stageEngines(ship.stages[0]);
    const thrust = leg.atmosphere && firstIsBottom() ? engines.thrustSea : engines.thrust;
    const twr = thrustToWeight(thrust, shipMass(ship), gravityAt(BODIES[leg.body]));
    if (twr < 1) {
      return failMission(work, leg.id === 'descent'
        ? `al bajar, los motores no alcanzaron a frenar la caída (empuje/peso ${number(twr, 2)} en la Luna). La nave se estrelló.`
        : `los motores no pueden levantar la nave (empuje/peso ${number(twr, 2)}).`);
    }
  }
  if (!canFire(ship.stages[0])) return failMission(work, 'no queda combustible ni motores que funcionen.');

  // El guiado no es perfecto: el Δv real se desvía un poco de lo pedido.
  // Con el piloto al timón, apuntar bien (aim cerca de 1) achica el error; apuntar mal lo agranda.
  const { sigma } = guidanceFor(ship, flight, leg);
  const aimFactor = Number.isFinite(action.aim) ? 1.5 - clamp01(action.aim) : 1;
  const landed = leg.id === 'descent' && Boolean(action.touchdown);
  const error = (roll(work) * 2 - 1) * sigma * 1.7 * aimFactor; // error repartido parejo, con desvío típico ≈ sigma
  // El alunizaje se vuela a mano hasta tocar el suelo: quema lo que haga falta, y lo que sobre es gasto.
  let target = landed ? Math.max(command, leg.dv - flight.progress) : command * (1 + error);
  if (landed) flight.touchdown = action.touchdown;

  // Cada encendido puede romper un motor. Con un defecto oculto, más seguido.
  const risk = (flight.prep?.trim ? BONUS.trim : 1) * (ship.perks?.engines ? BONUS.engines : 1);
  // Alunizando, frena la etapa que tenga combustible y motores (la misma que usa el bucle de abajo).
  const burning = landed ? (ship.stages.find(canFire) ?? ship.stages[0]) : ship.stages[0];
  const failing = enginesOf(burning).find((engine) => roll(work) < engine.failureRate * risk);
  flight.prep = { ...NO_PREP }; // los preparativos se gastan en este encendido
  // En un encendido normal, el motor que falla corta el empuje a mitad de camino (queda Δv por hacer).
  // En el alunizaje no: el piloto ya voló la bajada hasta tocar el suelo, así que el descenso termina
  // igual, pero el motor que falla en los últimos metros hace que la nave toque el suelo más fuerte.
  if (failing && !landed) target *= 0.25 + roll(work) * 0.5;
  if (failing && landed) {
    failing.failed = true;
    flight.touchdown = { soft: 'hard', hard: 'crash', crash: 'crash' }[flight.touchdown] ?? 'hard';
    note(work, `El ${failing.name.toLowerCase()} falló en los últimos metros del descenso: la nave tocó el suelo más fuerte de lo que se pilotó.`, 'warn', true);
  }

  // Quemar, soltando etapas a medida que se vacían.
  let done = 0;
  let atmosphere = Boolean(leg.atmosphere);
  while (target - done > 0.01) {
    // Alunizando no se suelta la etapa de descenso aunque se vacíe (lleva las patas): si hace falta,
    // el frenado sigue con el combustible de la etapa de arriba, y la vacía se suelta recién al despegar.
    const stageDropped = landed ? 0 : dropSpent(ship);
    if (stageDropped) atmosphere = false;
    const stage = landed ? ship.stages.find(canFire) : ship.stages[0];
    if (!stage || !canFire(stage)) break;
    const engines = stageEngines(stage);
    const isp = atmosphere && firstIsBottom() && engines.ispSea > 0 ? (engines.ispSea + engines.isp) / 2 : engines.isp;
    const m0 = shipMass(ship);
    const available = deltaV(isp, m0, m0 - stage.propellant);
    if (available >= target - done) {
      stage.propellant -= propellantFor(target - done, isp, m0);
      done = target;
    } else {
      stage.propellant = 0;
      done += available;
      atmosphere = false;
    }
  }

  flight.burns++;
  flight.dvUsed += done;
  const before = flight.progress;
  flight.progress += done;
  const overshoot = Math.max(0, flight.progress - leg.dv);
  if (overshoot > 0) {
    flight.wasted += overshoot - Math.max(0, before - leg.dv);
    flight.progress = leg.dv;
  }
  const missing = leg.dv - flight.progress;
  note(work, `${actor.name} encendió los motores: ${number(done)} m/s (pidió ${number(command)}).`
    + (overshoot > 1 ? ` Se pasó por ${number(overshoot)} m/s: combustible gastado de más.` : ''), 'info');

  if (failing && !landed) {
    failing.failed = true;
    raiseEmergency(work, {
      kind: 'engine', uid: failing.uid,
      title: `Falla de motor: ${failing.name}`,
      text: `El motor se apagó a mitad del encendido. ${originOf(failing)}`,
      options: [
        repairOption(work, failing, 'Reparar el motor', 'Vuelve a funcionar, aunque reparado falla un poco más.'),
        { id: 'abandon', label: 'Seguir sin ese motor', detail: 'La etapa empuja menos. Si era su único motor, la etapa se suelta con lo que le quedaba.', needs: ['pilot'] },
      ],
    });
    return;
  }
  if (target - done > 0.5 && !ship.stages.some(canFire)) {
    return failMission(work, `se acabó el combustible: faltaron ${number(leg.dv - flight.progress)} m/s para "${leg.name}".`);
  }
  if (missing <= leg.dv * (1 - DONE_TOLERANCE)) completeLeg(work, leg);
  else note(work, `Faltan ${number(missing)} m/s para terminar "${leg.name}": hace falta otro encendido de corrección.`, 'warn');
};

// ---------- Buscar el Prisma ----------

const scan = (work, action, actor) => {
  const { flight, ship } = work;
  if (flight.prism) return { ...work, error: 'El Prisma ya está a bordo.' };
  if (flight.located) return { ...work, error: 'El Prisma ya está ubicado: falta perforar y cargarlo.' };
  if (flight.mode === 'saving') return { ...work, error: 'En modo ahorro el espectrómetro está apagado: Ingeniería tiene que volver a modo normal.' };
  const scanner = allItems(ship).find((item) => item.partId === 'spectrometer' && working(item))
    ?? allItems(ship).find((item) => (item.provides ?? []).includes('prism-scan') && working(item));
  if (!scanner) return { ...work, error: 'No hay un espectrómetro que funcione.' };
  const cost = (scanner.powerDraw ?? 0) * SCAN_HOURS * WATT_HOUR;
  if (ship.energy < cost) return { ...work, error: `No hay energía para otra búsqueda: hacen falta ${number(cost / 3.6e6, 1)} kWh y quedan ${number(ship.energy / 3.6e6, 1)}.` };

  ship.energy -= cost;
  flight.scans++;
  if (roll(work) < scanner.failureRate * SCAN_FAILURE_FACTOR) {
    scanner.failed = true;
    raiseEmergency(work, {
      kind: 'scanner', uid: scanner.uid,
      title: `Falla del ${scanner.name.toLowerCase()}`,
      text: `Dejó de leer en plena búsqueda. ${originOf(scanner)}`,
      options: [
        repairOption(work, scanner, 'Repararlo', 'Se puede volver a buscar.'),
        { id: 'abandon', label: 'Irse sin el Prisma', detail: 'La nave puede volver, pero la misión no se cumple.', needs: ['scientist'] },
      ],
    });
    return work;
  }
  // Cada lectura dice a qué distancia está el Prisma de donde se escaneó. Un instrumento mejor lo
  // detecta desde más lejos y mide con menos error; cruzando dos o tres lecturas se lo ubica.
  const quality = scanner.quality ?? 0.5;
  const spot = ship.prismSpot;
  const distance = Math.hypot(action.x - spot.x, action.y - spot.y);
  const reach = (90 + 110 * quality) * (ship.perks?.scanner ? BONUS.scanner : 1);
  if (distance <= reach) {
    flight.located = { x: spot.x, y: spot.y };
    note(work, `${actor.name} ubicó el Prisma: está enterrado ahí mismo. Ingeniería tiene que perforar.`, 'good', true);
  } else {
    const reading = Math.round(distance * (1 + (roll(work) * 2 - 1) * (1 - quality) * 0.16));
    flight.pings = [...flight.pings, { x: Math.round(action.x), y: Math.round(action.y), d: reading }].slice(-PING_LIMIT);
    note(work, `${actor.name} escaneó: el Prisma está a unos ${number(reading)} m de ese punto. Cada lectura gasta batería.`, 'info');
  }
  return work;
};

// ---------- Terminar un tramo ----------

const completeLeg = (work, leg) => {
  const { flight, ship } = work;
  note(work, `Tramo cumplido: ${leg.name}.`, 'good', true);

  // Lo que se suelta: el satélite repetidor queda en órbita lunar.
  if ((leg.release ?? []).includes('relay')) {
    const relay = allItems(ship).find((item) => (item.provides ?? []).includes('relay'));
    if (relay) {
      flight.relay = working(relay);
      for (const stage of ship.stages) stage.items = stage.items.filter((item) => item !== relay);
      note(work, flight.relay ? 'El satélite repetidor quedó en órbita: habrá señal también detrás de la Luna.' : 'El repetidor no funciona: detrás de la Luna no habrá señal.', flight.relay ? 'good' : 'warn');
    }
  }
  if (!signalFor(ship, flight, leg)) flight.blackout = true;

  // En la superficie trabajan los instrumentos: la ciencia que llega a la Tierra (js/science.js).
  if (leg.id === 'surface') {
    flight.science = scienceReport({ items: allItems(ship), leg, relay: flight.relay, saving: flight.mode === 'saving' });
    const { value, max, generated, sent } = flight.science;
    if (max > 0) {
      note(work, generated > sent
        ? `Ciencia: llegaron a la Tierra ${number(sent)} de ${number(generated)} MB de datos (${value} de ${max} puntos). El resto no cupo en el enlace.`
        : `Ciencia: llegaron a la Tierra todos los datos (${number(sent)} MB): ${value} de ${max} puntos.`, generated > sent ? 'warn' : 'good', true);
    }
  }

  // La energía durante el tramo y la espera que sigue.
  if (!spendLegEnergy(work, leg)) return;

  // Al posarse, las patas pueden ceder.
  if (leg.id === 'descent') {
    const legs = allItems(ship).find((item) => item.partId === 'landing-legs' && working(item));
    // Tocar fuerte castiga a las patas; estrellarse las rompe seguro. El suelo firme elegido por Ciencia ayuda.
    const impact = flight.touchdown === 'hard' ? 2.5 : 1;
    const firm = ship.perks?.regolith ? BONUS.regolith : 1;
    // El lugar elegido también cuenta: un suelo quebrado castiga más a las patas (js/missionplan.js).
    const ground = leg.legsRisk ?? 1;
    if (legs && (flight.touchdown === 'crash' || roll(work) < legs.failureRate * 3 * impact * firm * ground)) {
      legs.failed = true;
      raiseEmergency(work, {
        kind: 'leak', uid: legs.uid,
        title: 'Aterrizaje duro',
        text: flight.touchdown === 'crash'
          ? 'La nave golpeó el suelo demasiado rápido: una pata cedió y se abrió una fuga en los tanques.'
          : `Una pata cedió al tocar el suelo y se abrió una fuga en los tanques. ${originOf(legs)}`,
        options: [
          repairOption(work, legs, 'Sellar la fuga', 'No se pierde combustible.'),
          { id: 'abandon', label: 'Despegar con la fuga', detail: `Se pierde el ${LEAK_FRACTION * 100} % del combustible que queda.`, needs: ['pilot'] },
        ],
      });
      return advanceLeg(work, leg, true);
    }
  }
  // En el viaje largo, la antena puede fallar.
  if (leg.id === 'tli') {
    const antenna = allItems(ship).find((item) => (item.provides ?? []).includes('comms') && working(item));
    if (antenna && roll(work) < antenna.failureRate) {
      antenna.failed = true;
      raiseEmergency(work, {
        kind: 'antenna', uid: antenna.uid,
        title: 'Se perdió la señal',
        text: `La antena dejó de transmitir durante el viaje. ${originOf(antenna)}`,
        options: [
          repairOption(work, antenna, 'Reparar la antena', 'Vuelve la señal.'),
          { id: 'abandon', label: 'Seguir sin señal', detail: 'Los encendidos pierden precisión el resto del viaje.', needs: ['pilot'] },
        ],
      });
      return advanceLeg(work, leg, true);
    }
  }
  advanceLeg(work, leg, false);
};

/** Pasa al tramo siguiente (o termina el vuelo). Con `held`, deja la fase en emergencia. */
const advanceLeg = (work, leg, held) => {
  const { flight, ship, legs } = work;
  const next = legs[flight.legIndex + 1];
  flight.legIndex++;
  flight.progress = 0;
  if (!next) {
    flight.phase = 'over';
    // Un vuelo de prueba (Sandbox) no busca nada: basta con volver.
    flight.result = !legs.some((item) => item.id === 'surface')
      ? { ok: true, text: 'Vuelo de prueba completo: la nave volvió entera a la Tierra.' }
      : flight.prism
      ? { ok: true, text: 'La nave volvió a la Tierra con el Prisma a bordo.' }
      : { ok: false, text: 'La nave volvió a la Tierra, pero sin el Prisma.' };
    note(work, flight.result.text, flight.result.ok ? 'good' : 'bad', true);
    return;
  }
  const missing = (next.needs ?? []).filter((capability) => !hasWorking(ship, capability));
  if (missing.length > 0) {
    // Sin escudo no hay reentrada; sin patas o motor de alunizaje no hay alunizaje.
    return failMission(work, `para "${next.name}" faltaba: ${missing.map((id) => CAPABILITIES[id]).join(', ')}.`);
  }
  const phase = next.stage === leg.stage ? 'ready' : 'stageDone';
  // Con una emergencia abierta, la fase vuelve a esta cuando se resuelva.
  if (held) flight.emergency = { ...flight.emergency, resume: phase };
  else flight.phase = phase;
};

/** Gasta la energía del tramo: primero la parte en sombra (lo más exigente) y después la de sol. */
const spendLegEnergy = (work, leg) => {
  const { flight, ship } = work;
  const parts = allItems(ship).filter(working);
  const solar = sum(parts.filter((item) => item.partId === 'solar-panel'), (item) => item.powerOutput ?? 0);
  const steady = sum(parts.filter((item) => item.partId !== 'solar-panel'), (item) => item.powerOutput ?? 0);
  const drawFor = (mode) => sum(parts.filter((item) => mode === 'normal' || item.kind !== 'instrument'), (item) => item.powerDraw ?? 0);
  const hours = leg.hours ?? 0;
  const run = (mode) => {
    const dark = batteryStep({ energy: ship.energy, capacity: ship.energyCapacity }, steady, drawFor(mode), hours * (1 - (leg.sun ?? 1)) * 3600);
    const light = batteryStep({ energy: dark.energy, capacity: ship.energyCapacity }, steady + solar, drawFor(mode), hours * (leg.sun ?? 1) * 3600);
    return { energy: light.energy, shortfall: dark.shortfall + light.shortfall };
  };
  let result = run(flight.mode);
  if (result.shortfall > 0 && flight.mode === 'normal') {
    const saving = run('saving');
    if (saving.shortfall === 0) {
      flight.mode = 'saving';
      flight.savedPower = true;
      note(work, 'La energía no alcanzaba: la nave pasó sola a modo ahorro y apagó los instrumentos.', 'warn', true);
      result = saving;
    }
  }
  ship.energy = result.energy;
  if (result.shortfall > 0) {
    failMission(work, 'la energía se agotó y el soporte vital se apagó. Faltaban paneles o baterías para la sombra.');
    return false;
  }
  return true;
};

// ---------- Emergencias ----------

/** De dónde vino la pieza, para entender por qué falló. */
const originOf = (item) => {
  if (item.source !== 'black') return item.repaired ? 'Ya había sido reparada antes.' : 'Vino del mercado legal: fue mala suerte.';
  const checked = item.inspected ? `con ${item.inspected === 'advanced' ? 'inspección avanzada' : 'inspección básica'}` : 'sin inspección';
  return `Venía del mercado negro, ${checked}.`;
};

const repairCost = (item) => Math.max(MIN_REPAIR, Math.round((item.paid ?? 0) * REPAIR_SHARE));

const repairOption = (work, item, label, detail) => {
  const kit = Boolean(work.ship.perks?.spares) && !work.flight.kitUsed;
  return {
    id: 'repair', label, kit,
    detail: `${detail} Comercio lleva el repuesto (y lo paga) e Ingeniería la arregla.${kit ? ' Con el kit de repuestos cuesta la mitad.' : ''}`,
    needs: ['engineer', 'merchant'], cost: Math.max(MIN_REPAIR, Math.round(repairCost(item) * (kit ? 0.5 : 1))),
  };
};

const raiseEmergency = (work, emergency) => {
  work.flight.phase = 'emergency';
  work.flight.emergency = { ...emergency, legIndex: work.flight.legIndex, votes: {} };
  note(work, `Emergencia: ${emergency.title}. ${emergency.text}`, 'bad', true);
};

const resolveEmergency = (work, action, actor) => {
  const { flight, ship } = work;
  const emergency = flight.emergency;
  if (!emergency) return { ...work, error: 'No hay ninguna emergencia.' };
  const option = emergency.options.find((o) => o.id === action.option);
  if (!option) return { ...work, error: 'Esa salida no existe.' };
  if (!option.needs.includes(action.role)) return { ...work, error: `${roleName(action.role)} no participa en esa salida.` };
  if (!actor.canActAs(action.role)) return { ...work, error: `${roleName(action.role)} le toca a otro tripulante.` };
  if (option.cost && option.cost > work.credits) return { ...work, error: `El repuesto cuesta ${number(option.cost)} créditos y quedan ${number(work.credits)}.` };

  const votes = { ...emergency.votes, [option.id]: [...new Set([...(emergency.votes[option.id] ?? []), action.role])] };
  flight.emergency = { ...emergency, votes };
  if (!option.needs.every((role) => votes[option.id].includes(role))) {
    note(work, `${actor.name} (${roleName(action.role)}) acepta: ${option.label}. Falta: ${option.needs.filter((role) => !votes[option.id].includes(role)).map(roleName).join(', ')}.`);
    return work;
  }

  // Todos los que hacían falta aceptaron: se aplica.
  const item = findItem(ship, emergency.uid);
  if (option.id === 'repair') {
    work.credits -= option.cost;
    flight.repairsPaid += option.cost;
    if (option.kit) flight.kitUsed = true;
    if (item) Object.assign(item, { failed: false, repaired: true, failureRate: Math.min(0.9, item.failureRate * 1.4) });
    note(work, `${option.label}: hecho. Costó ${number(option.cost)} créditos.`, 'good', true);
  } else {
    note(work, `Se eligió: ${option.label}.`, 'warn', true);
    if (emergency.kind === 'leak') {
      for (const stage of ship.stages) stage.propellant *= 1 - LEAK_FRACTION;
      if (item) item.failed = false; // las patas ya no importan después de posarse
    }
    if (emergency.kind === 'scanner') {
      // Se rinden con el Prisma: el tramo de superficie se da por terminado sin él.
      flight.history.push({ kind: emergency.kind, title: emergency.title, option: option.id, partId: item?.partId, source: item?.source, inspected: item?.inspected });
      flight.emergency = null;
      flight.phase = 'ready';
      completeLeg(work, work.legs[flight.legIndex]);
      return work;
    }
  }
  flight.history.push({ kind: emergency.kind, title: emergency.title, option: option.id, partId: item?.partId, source: item?.source, inspected: item?.inspected });
  flight.emergency = null;

  // Volver a la fase que corresponde (si saltó al terminar un tramo, puede que esa parte del viaje ya haya terminado).
  flight.phase = emergency.resume ?? 'ready';
  return work;
};
