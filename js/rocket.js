/**
 * EL COHETE (cálculos)
 * Funciones puras que toman un cohete armado y dicen cuánto pesa, cuánto empuja, hasta dónde
 * llega y qué le falta. Las usan el constructor (estadísticas en vivo) y el servidor (validar
 * antes de despegar, y volar la misión).
 *
 * Un cohete es una lista de etapas, de abajo (la primera que se enciende) hacia arriba:
 *   [{ items: [pieza, pieza, ...] }, ...]      cada pieza sale de resolvePart() (js/catalog.js)
 * Dentro de una etapa las piezas también van de abajo hacia arriba. Un tanque puede llevar
 * `fill` de 0 a 1 (qué tan lleno va); si no lo trae, va lleno.
 *
 * SIMPLIFICACIONES (avisadas a propósito)
 * - Las etapas se queman de a una, de abajo hacia arriba; una etapa vacía se suelta.
 * - Un motor solo usa el combustible de los tanques de su misma etapa.
 * - En el despegue desde la Tierra, la primera etapa rinde el promedio entre su eficiencia al
 *   nivel del mar y en el vacío.
 * - La carga sobre cada pieza es el peso de lo que lleva encima por la aceleración, mirada al
 *   encender y al terminar cada etapa: es una estimación, no un análisis estructural.
 */
import { CAPABILITIES, propellantPrice } from './catalog.js';
import { BODIES, G0, centerOfMass, combinedIsp, deltaV, gravityAt, propellantFor, thrustToWeight } from './physics.js';

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);

/** Combustible que lleva un tanque (kg): nunca más de lo que cabe. */
export const loadedPropellant = (item) => (item.kind === 'tank' ? item.capacity * clamp01(item.fill ?? 1) : 0);

/** Masa de una pieza con su combustible. */
const wetMass = (item) => item.mass + loadedPropellant(item);

/** Resumen de una etapa suelta (sin lo que lleva encima). */
export const stageSummary = (items) => {
  const engines = items.filter((item) => item.kind === 'engine');
  const tanks = items.filter((item) => item.kind === 'tank');
  const fuels = [...new Set(engines.map((engine) => engine.propellant))];
  const fuel = fuels.length === 1 ? fuels[0] : null; // con motores de combustibles distintos no se sabe qué quemar
  const usable = sum(tanks.filter((tank) => tank.propellant === fuel), loadedPropellant);
  const loaded = sum(tanks, loadedPropellant);
  const seaEngines = engines.filter((engine) => engine.thrustSea > 0);

  return {
    dryMass: sum(items, (item) => item.mass),
    propellant: usable, //                 lo que los motores de esta etapa pueden quemar
    strandedPropellant: loaded - usable, // combustible que ningún motor de la etapa usa: peso muerto
    capacity: sum(tanks, (tank) => tank.capacity),
    fuel,
    mixedFuels: fuels.length > 1,
    engines: engines.length,
    thrust: sum(engines, (engine) => engine.thrust),
    thrustSea: sum(seaEngines, (engine) => engine.thrustSea),
    isp: combinedIsp(engines.map((engine) => ({ thrust: engine.thrust, isp: engine.isp }))),
    ispSea: combinedIsp(seaEngines.map((engine) => ({ thrust: engine.thrustSea, isp: engine.ispSea }))),
  };
};

/** Lo que cuesta el combustible cargado en todos los tanques (créditos). */
export const propellantCost = (stages) =>
  sum(stages.flatMap((stage) => stage.items).filter((item) => item.kind === 'tank'), (item) => propellantPrice(item.propellant, loadedPropellant(item)));

/** Las capacidades (ids) que suman todas las piezas del cohete. */
export const capabilitiesOf = (stages) => new Set(stages.flatMap((stage) => stage.items.flatMap((item) => item.provides ?? [])));

/**
 * Las estadísticas del cohete completo, parado en la plataforma.
 * `gravity` es la del lugar de despegue (por defecto, la superficie de la Tierra).
 */
export const analyzeRocket = (stages, { gravity = gravityAt(BODIES.earth) } = {}) => {
  const summaries = stages.map((stage) => stageSummary(stage.items));
  const totals = summaries.map((s) => s.dryMass + s.propellant + s.strandedPropellant);

  const perStage = summaries.map((summary, index) => {
    const above = sum(totals.slice(index + 1), (mass) => mass);
    const m0 = totals[index] + above;
    const first = index === 0;
    const isp = first && summary.ispSea > 0 ? (summary.ispSea + summary.isp) / 2 : first ? 0 : summary.isp;
    const thrust = first ? summary.thrustSea : summary.thrust;
    const canBurn = summary.propellant > 0 && isp > 0 && m0 > 0;
    return {
      ...summary,
      mass: totals[index],
      ignitionMass: m0,
      burnoutMass: m0 - summary.propellant,
      deltaV: canBurn ? deltaV(isp, m0, m0 - summary.propellant) : 0,
      twr: m0 > 0 ? thrustToWeight(thrust, m0, gravity) : 0,
      peakAcceleration: summary.thrust > 0 && m0 - summary.propellant > 0 ? summary.thrust / (m0 - summary.propellant) : 0,
    };
  });

  // Posición de cada pieza en la pila, para el centro de masa y la carga que soporta.
  const placed = [];
  let height = 0;
  stages.forEach((stage, stageIndex) => {
    for (const item of stage.items) {
      placed.push({ item, stageIndex, mass: wetMass(item), position: height + item.height / 2 });
      height += item.height;
    }
  });
  const com = centerOfMass(placed);

  // Integridad: la pieza que más cerca está de su límite. 1 = justo en el límite; más es mejor.
  let integrity = Infinity;
  let weakest = null;
  placed.forEach((entry, index) => {
    if (!entry.item.strength) return;
    const above = placed.slice(index + 1);
    const fullAbove = sum(above, (other) => other.mass);
    // Al terminar de quemar su propia etapa, los tanques de esa etapa ya van vacíos.
    const emptyAbove = sum(above, (other) => (other.stageIndex === entry.stageIndex ? other.item.mass : other.mass));
    let load = fullAbove * G0; // parado en la plataforma
    perStage.slice(0, entry.stageIndex + 1).forEach((stage, stageIndex) => {
      const atIgnition = stage.ignitionMass > 0 ? stage.thrust / stage.ignitionMass : 0;
      load = Math.max(load, fullAbove * atIgnition, (stageIndex === entry.stageIndex ? emptyAbove : fullAbove) * stage.peakAcceleration);
    });
    const ratio = load > 0 ? entry.item.strength / load : Infinity;
    if (ratio < integrity) {
      integrity = ratio;
      weakest = entry.item;
    }
  });

  const items = stages.flatMap((stage) => stage.items);
  const top = stages.at(-1)?.items ?? [];
  const mass = sum(totals, (m) => m);
  const powerOutput = sum(items, (item) => item.powerOutput ?? 0);
  const powerDraw = sum(items, (item) => item.powerDraw ?? 0);

  return {
    stages: perStage,
    mass,
    dryMass: sum(summaries, (s) => s.dryMass),
    propellantMass: sum(summaries, (s) => s.propellant + s.strandedPropellant),
    propellantCapacity: sum(summaries, (s) => s.capacity),
    thrust: perStage[0]?.thrustSea ?? 0, // empuje al despegar
    twr: perStage[0]?.twr ?? 0,
    deltaV: sum(perStage, (stage) => stage.deltaV),
    payloadMass: sum(top.filter((item) => item.kind !== 'engine' && item.kind !== 'tank'), (item) => item.mass),
    cost: sum(items, (item) => (item.price ?? 0) + (item.kind === 'tank' ? propellantPrice(item.propellant, loadedPropellant(item)) : 0)),
    powerOutput,
    powerDraw,
    powerBalance: powerOutput - powerDraw,
    energyCapacity: sum(items, (item) => item.energyCapacity ?? 0),
    crew: sum(items, (item) => item.crew ?? 0),
    height,
    centerOfMass: com, //                         m desde la base
    centerOfMassRatio: height > 0 ? com / height : 0, // 0 = en la base, 1 = en la punta
    integrity,
    weakest,
    capabilities: capabilitiesOf(stages),
  };
};

/**
 * Vuela un plan de vuelo "en papel": tramo por tramo, gastando combustible y soltando etapas
 * vacías. No hay pilotaje ni fallas: dice si el cohete, bien volado, alcanza.
 * Devuelve { ok, legs: [{ id, name, ok, dv, twr, reason? }], failedAt, spareDeltaV, finalMass }.
 */
export const simulatePlan = (stages, legs) => {
  // Copia de trabajo: de cada etapa, sus piezas y el combustible que le queda.
  const flying = stages.map((stage) => {
    const summary = stageSummary(stage.items);
    return { ...summary, items: [...stage.items], extraMass: 0 };
  });
  const massOf = (stage) => sum(stage.items, (item) => item.mass) + stage.propellant + stage.strandedPropellant + stage.extraMass;
  const totalMass = () => sum(flying, massOf);
  const canBurn = (stage) => stage.thrust > 0 && stage.propellant > 0.5;
  /** Suelta las etapas de abajo que ya no pueden empujar (mientras quede algo arriba). */
  const dropSpent = () => {
    while (flying.length > 1 && !canBurn(flying[0])) flying.shift();
  };
  const provided = () => new Set(flying.flatMap((stage) => stage.items.flatMap((item) => item.provides ?? [])));

  const results = [];
  let failedAt = null;

  for (const leg of legs) {
    const result = { id: leg.id, name: leg.name, ok: true, dv: leg.dv, twr: null, reason: null };
    results.push(result);
    const fail = (reason) => {
      result.ok = false;
      result.reason = reason;
      failedAt = leg.id;
    };

    const missing = (leg.needs ?? []).filter((capability) => !provided().has(capability));
    if (missing.length > 0) {
      fail(`Falta: ${missing.map((id) => CAPABILITIES[id] ?? id).join(', ')}.`);
      break;
    }

    if (leg.dv > 0) {
      dropSpent();
      let stage = flying[0];
      let atmosphere = Boolean(leg.atmosphere); // solo la etapa que arranca dentro del aire rinde menos
      if (!canBurn(stage)) {
        fail('No queda combustible ni motores para este tramo.');
        break;
      }
      if (leg.body && leg.minTwr) {
        const thrust = atmosphere ? stage.thrustSea : stage.thrust;
        result.twr = thrustToWeight(thrust, totalMass(), gravityAt(BODIES[leg.body]));
        if (result.twr < 1) {
          fail(`El empuje no alcanza para levantar la nave en ${BODIES[leg.body].name} (empuje/peso ${result.twr.toFixed(2)}).`);
          break;
        }
      }

      let remaining = leg.dv;
      while (remaining > 0.01) {
        dropSpent();
        stage = flying[0];
        const isp = atmosphere && stage.ispSea > 0 ? (stage.ispSea + stage.isp) / 2 : atmosphere ? 0 : stage.isp;
        if (!canBurn(stage) || isp <= 0) break;
        const m0 = totalMass();
        const available = deltaV(isp, m0, m0 - stage.propellant);
        if (available >= remaining) {
          stage.propellant -= propellantFor(remaining, isp, m0);
          remaining = 0;
        } else {
          stage.propellant = 0;
          remaining -= available;
          atmosphere = false;
        }
      }
      if (remaining > 0.01) {
        fail(`Se acabó el combustible: faltaron ${Math.round(remaining)} m/s de los ${leg.dv} que pide el tramo.`);
        break;
      }
    }

    // Al terminar el tramo: lo que se suelta y lo que se sube a bordo.
    for (const capability of leg.release ?? []) {
      for (const stage of flying) stage.items = stage.items.filter((item) => !(item.provides ?? []).includes(capability));
    }
    if (leg.addMass) flying.at(-1).extraMass += leg.addMass;
  }

  // Lo que sobró: cuánto Δv más podría dar el cohete con lo que le queda.
  let spareDeltaV = 0;
  if (failedAt === null) {
    const rest = flying.map((stage) => ({ ...stage }));
    while (rest.length > 0) {
      const stage = rest[0];
      const m0 = sum(rest, massOf);
      if (canBurn(stage) && stage.isp > 0) spareDeltaV += deltaV(stage.isp, m0, m0 - stage.propellant);
      rest.shift();
    }
  }

  return { ok: failedAt === null, legs: results, failedAt, spareDeltaV, finalMass: totalMass() };
};

/**
 * Revisión antes de despegar.
 *   critical  no se puede despegar
 *   warnings  se puede, pero hay un riesgo real
 *   tips      mejoras opcionales
 * Cada aviso: { code, text }.  `mission` viene de js/missions.js (usa requirements y flightPlan).
 * `credits` (opcional) = dinero que queda: si no alcanza para llenar los tanques, no se despega.
 */
export const validateRocket = (stages, mission, { credits = Infinity } = {}) => {
  const critical = [], warnings = [], tips = [];
  const add = (list, code, text) => list.push({ code, text });

  const items = stages.flatMap((stage) => stage.items);
  if (items.length === 0) {
    add(critical, 'empty', 'Todavía no hay ninguna pieza.');
    return { critical, warnings, tips, stats: null, plan: null };
  }

  const stats = analyzeRocket(stages);
  const has = (capability) => stats.capabilities.has(capability);
  const requirements = mission?.requirements ?? { capabilities: [], recommended: [] };

  // ----- Piezas obligatorias -----
  for (const capability of requirements.capabilities) {
    if (!has(capability)) add(critical, `missing:${capability}`, `Falta: ${CAPABILITIES[capability] ?? capability}.`);
  }
  for (const capability of requirements.recommended ?? []) {
    if (!has(capability)) add(warnings, `recommended:${capability}`, RECOMMENDED_TEXT[capability] ?? `Conviene llevar: ${CAPABILITIES[capability] ?? capability}.`);
  }
  if (stats.crew > 0 && !has('life-support')) add(critical, 'missing:life-support', 'Hay tripulación a bordo pero no hay soporte vital.');

  // ----- Etapas, motores y combustible -----
  const fuelPrice = propellantCost(stages);
  if (fuelPrice > credits) {
    add(critical, 'fuel-money', `Llenar los tanques cuesta ${Math.round(fuelPrice)} créditos y quedan ${Math.round(credits)}. Hay que devolver algo o cargar menos combustible.`);
  }
  stats.stages.forEach((stage, index) => {
    const label = `Etapa ${index + 1}`;
    if (stages[index].items.length === 0) add(warnings, `emptystage:${index}`, `${label}: está vacía.`);
    if (stage.mixedFuels) add(critical, `mixed:${index}`, `${label}: tiene motores de combustibles distintos. Cada etapa quema un solo tipo.`);
    else if (stage.engines > 0 && stage.propellant <= 0) add(critical, `dry:${index}`, `${label}: tiene motor pero ningún tanque con su combustible.`);
    if (stage.engines === 0 && stage.capacity > 0) add(warnings, `noengine:${index}`, `${label}: lleva tanques pero ningún motor. Es peso muerto.`);
    else if (stage.strandedPropellant > 0) add(warnings, `stranded:${index}`, `${label}: lleva ${Math.round(stage.strandedPropellant)} kg de un combustible que sus motores no usan.`);
    if (index > 0 && stage.engines > 0 && !stages[index - 1].items.some((item) => (item.provides ?? []).includes('separator'))) {
      add(warnings, `noseparator:${index}`, `Entre la etapa ${index} y la ${index + 1} no hay separador: la etapa vacía podría no soltarse limpio.`);
    }
  });
  if (stats.stages[0].thrustSea <= 0) add(critical, 'nothrust', 'La primera etapa no tiene un motor que funcione al nivel del mar.');
  else if (stats.twr < 1) add(critical, 'twr', `El cohete pesa más de lo que empujan sus motores (empuje/peso ${stats.twr.toFixed(2)}). No se levanta del suelo.`);
  else if (stats.twr < 1.2) add(warnings, 'twr-low', `Empuje/peso de ${stats.twr.toFixed(2)}: despega, pero sube tan lento que gasta combustible de más.`);

  // ----- ¿Alcanza para la misión? -----
  const legs = mission?.flightPlan ?? [];
  const plan = legs.length > 0 ? simulatePlan(stages, legs) : null;
  if (plan && !plan.ok) {
    const failed = plan.legs.find((leg) => !leg.ok);
    if (!critical.some((issue) => issue.code === 'twr' || issue.code === 'nothrust')) {
      add(critical, `plan:${failed.id}`, `No llega a "${failed.name}". ${failed.reason}`);
    }
  } else if (plan) {
    const needed = sum(legs, (leg) => leg.dv);
    const margin = needed > 0 ? plan.spareDeltaV / needed : 0;
    if (margin < 0.03) add(warnings, 'margin-low', `Sobra muy poco: ${Math.round(plan.spareDeltaV)} m/s de margen. Cualquier maniobra imprecisa deja a la nave sin combustible.`);
    else if (margin > 0.2) add(tips, 'margin-high', `Sobran ${Math.round(plan.spareDeltaV)} m/s. Con menos combustible o tanques más chicos se ahorraría dinero.`);
    for (const leg of plan.legs) {
      if (leg.twr !== null && leg.twr < legs.find((l) => l.id === leg.id).minTwr) {
        add(warnings, `legtwr:${leg.id}`, `"${leg.name}": empuje/peso de ${leg.twr.toFixed(2)}. Es poco para maniobrar con seguridad.`);
      }
    }
  }

  // ----- Energía -----
  if (stats.powerDraw > 0 && stats.powerOutput === 0 && stats.energyCapacity === 0) {
    add(critical, 'nopower', 'Hay equipos que consumen energía, pero nada que la genere ni la guarde.');
  } else if (stats.powerBalance < 0) {
    const hours = stats.energyCapacity / -stats.powerBalance / 3_600;
    add(warnings, 'power', `Se consume más energía de la que se genera (${Math.round(-stats.powerBalance)} W de diferencia). Con todo encendido, las baterías duran ${hours.toFixed(1)} h.`);
  } else if (stats.energyCapacity === 0 && stats.powerDraw > 0) {
    add(warnings, 'nobattery', 'No hay baterías: en la sombra, los equipos se apagan.');
  }

  // ----- Estructura -----
  if (stats.integrity < 1) add(critical, 'structure', `${stats.weakest.name} no aguanta el peso que lleva encima durante el ascenso.`);
  else if (stats.integrity < 1.25) add(warnings, 'structure-tight', `${stats.weakest.name} va muy cerca de su límite de carga.`);
  if (stats.centerOfMassRatio > 0.6) add(warnings, 'topheavy', 'El peso está muy arriba: el cohete es difícil de mantener derecho.');
  if (!has('aero')) add(tips, 'noaero', 'Sin cofia, el aire frena más durante el ascenso.');

  return { critical, warnings, tips, stats, plan };
};

const RECOMMENDED_TEXT = {
  relay: 'Sin satélite repetidor no habrá comunicación con la Tierra mientras la nave esté detrás de la Luna.',
  attitude: 'Sin propulsores auxiliares es difícil orientar la nave para los encendidos.',
  comms: 'Sin antena no hay comunicación con la Tierra a la distancia de la Luna.',
};
