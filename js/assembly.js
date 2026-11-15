/**
 * ARMADO DEL COHETE (reglas)
 * Qué pieza puede ir dónde. Funciones puras que usan el constructor (para mostrar si una pieza
 * encaja antes de soltarla) y el servidor (que es quien decide).
 *
 * El cohete armado:  { stages: [etapa, ...] }  de abajo (la primera que se enciende) hacia arriba.
 * Cada etapa:        { engines: [uid], core: [uid], mounted: [uid], fill }
 *   engines  motores, uno al lado del otro en la base
 *   core     el cuerpo, apilado: tanques, cápsula, separador, cofia (el orden lo pone solo)
 *   mounted  equipo colgado a los costados: paneles, antenas, instrumentos, patas…
 *   fill     qué tan llenos van los tanques de la etapa (0 a 1)
 * Los `uid` son piezas de la bodega (state.data.economy.inventory).
 *
 * Reglas de encaje:
 * - Una etapa quema un solo combustible: motores y tanques tienen que coincidir.
 * - El equipo se cuelga de puntos de montaje, que traen los tanques y la cápsula.
 * - Las patas necesitan un tanque o una cápsula donde sujetarse.
 * - La cápsula y la cofia van en la etapa de más arriba; el separador, una por etapa.
 */
import { PROPELLANTS, getPart, resolvePart } from './catalog.js';

/** Etapas de la misión en las que se puede armar. */
export const BUILD_STAGES = ['build', 'validation'];
export const MAX_STAGES = 6;
export const MAX_ENGINES = 9;
const FILL_STEP = 0.05;

export const emptyStage = () => ({ engines: [], core: [], mounted: [], fill: 1 });
export const emptyRocket = () => ({ stages: [emptyStage()] });

const SLOTS = ['engines', 'core', 'mounted'];
/** Orden del cuerpo, de abajo hacia arriba. */
const CORE_ORDER = { tank: 0, capsule: 1, separator: 2, 'nose-cone': 3 };
const coreRank = (part) => CORE_ORDER[part.id] ?? CORE_ORDER[part.kind] ?? 0;

export const installedUids = (rocket) => rocket.stages.flatMap((stage) => SLOTS.flatMap((slot) => stage[slot]));

/** Dónde está una pieza en el cohete: { stage, slot }, o null si no está puesta. */
export const findInRocket = (rocket, uid) => {
  for (const [stage, content] of rocket.stages.entries()) {
    for (const slot of SLOTS) if (content[slot].includes(uid)) return { stage, slot };
  }
  return null;
};

/** Arma el buscador uid → pieza base del catálogo a partir de la bodega. */
export const partFinder = (inventory) => {
  const byUid = new Map(inventory.map((item) => [item.uid, getPart(item.partId)]));
  return (uid) => byUid.get(uid);
};

const partsIn = (stage, find) => [...stage.engines, ...stage.core, ...stage.mounted].map(find).filter(Boolean);

/** El combustible que usa una etapa (el de su primer motor o tanque), o null si aún no tiene. */
export const stageFuel = (stage, find) => partsIn(stage, find).find((part) => part.propellant)?.propellant ?? null;

export const mountPoints = (stage, find) => stage.core.reduce((total, uid) => total + (find(uid)?.mounts ?? 0), 0);
export const mountsUsed = (stage, find) => stage.mounted.reduce((total, uid) => total + (find(uid)?.mountCost ?? 0), 0);
const hasBody = (stage, find) => stage.core.some((uid) => ['tank', 'capsule'].includes(find(uid)?.kind));

/** Si una etapa quedó mal armada (por ejemplo, al sacarle una pieza), dice por qué. Si está bien, null. */
export const stageProblem = (stage, find) => {
  if (mountsUsed(stage, find) > mountPoints(stage, find)) return 'Hay equipo montado que se quedaría sin dónde sujetarse. Quita primero ese equipo.';
  if (stage.mounted.some((uid) => find(uid)?.id === 'landing-legs') && !hasBody(stage, find)) return 'Las patas se quedarían sin dónde sujetarse. Quítalas primero.';
  return null;
};

/** ¿Se puede agregar una etapa arriba? Devuelve el motivo si no, o null si sí. */
export const addStageProblem = (rocket, find) => {
  const top = rocket.stages.at(-1);
  if (rocket.stages.length >= MAX_STAGES) return `El cohete puede tener hasta ${MAX_STAGES} etapas.`;
  if (partsIn(top, find).length === 0) return 'La etapa de arriba todavía está vacía.';
  if (top.core.some((uid) => ['capsule', 'nose-cone'].includes(find(uid)?.id))) return 'La cápsula y la cofia van en la etapa de más arriba: no se puede poner otra etapa encima.';
  return null;
};

/**
 * ¿Esta pieza puede ir en esta etapa? `stageIndex` puede ser el número de etapas: una etapa nueva arriba.
 * Devuelve { ok: true, slot } o { ok: false, reason }.
 */
export const canPlace = (rocket, find, uid, stageIndex) => {
  const part = find(uid);
  const no = (reason) => ({ ok: false, reason });
  if (!part) return no('Esa pieza no está en la bodega.');
  if (findInRocket(rocket, uid)) return no('Esa pieza ya está puesta.');
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex > rocket.stages.length) return no('Esa etapa no existe.');

  const isNew = stageIndex === rocket.stages.length;
  if (isNew) {
    const problem = addStageProblem(rocket, find);
    if (problem) return no(problem);
  }
  const stage = isNew ? emptyStage() : rocket.stages[stageIndex];
  const isTop = isNew || stageIndex === rocket.stages.length - 1;
  const all = installedUids(rocket).map(find);
  const fuel = stageFuel(stage, find);
  const fuelClash = part.propellant && fuel && part.propellant !== fuel
    ? `Usa ${PROPELLANTS[part.propellant].name.toLowerCase()}, y esta etapa ya usa ${PROPELLANTS[fuel].name.toLowerCase()}. Cada etapa quema un solo combustible.`
    : null;

  if (part.slot === 'engines') {
    if (fuelClash) return no(fuelClash);
    if (stage.engines.length >= MAX_ENGINES) return no(`Una etapa lleva hasta ${MAX_ENGINES} motores.`);
    return { ok: true, slot: 'engines' };
  }

  if (part.slot === 'core') {
    if (fuelClash) return no(fuelClash);
    if (part.id === 'capsule') {
      if (!isTop) return no('La cápsula va en la etapa de más arriba.');
      if (all.some((other) => other?.id === 'capsule')) return no('El cohete lleva una sola cápsula.');
    }
    if (part.id === 'nose-cone') {
      if (!isTop) return no('La cofia va en la punta: en la etapa de más arriba.');
      if (all.some((other) => other?.id === 'nose-cone')) return no('El cohete lleva una sola cofia.');
    }
    if (part.id === 'separator' && stage.core.some((other) => find(other)?.id === 'separator')) return no('Esta etapa ya tiene separador.');
    return { ok: true, slot: 'core' };
  }

  // Equipo montado
  if (part.id === 'landing-legs') {
    if (stage.mounted.some((other) => find(other)?.id === 'landing-legs')) return no('Esta etapa ya tiene patas.');
    if (!hasBody(stage, find)) return no('Las patas se sujetan a un tanque o a la cápsula: pon primero uno en esta etapa.');
    return { ok: true, slot: 'mounted' };
  }
  const points = mountPoints(stage, find);
  if (points === 0) return no('Esta etapa no tiene puntos de montaje: los traen los tanques y la cápsula.');
  if (mountsUsed(stage, find) + part.mountCost > points) return no(`No quedan puntos de montaje en esta etapa (${mountsUsed(stage, find)} de ${points} ocupados).`);
  return { ok: true, slot: 'mounted' };
};

const sortCore = (core, find) => [...core].sort((a, b) => coreRank(find(a)) - coreRank(find(b)));

/** El cohete con la pieza puesta (ya revisada con canPlace). */
export const withPart = (rocket, find, uid, stageIndex, slot) => {
  const stages = rocket.stages.map((stage) => ({ ...stage }));
  if (stageIndex === stages.length) stages.push(emptyStage());
  const stage = stages[stageIndex];
  stage[slot] = slot === 'core' ? sortCore([...stage.core, uid], find) : [...stage[slot], uid];
  return { ...rocket, stages };
};

/** El cohete sin esa pieza. */
export const withoutPart = (rocket, uid) => ({
  ...rocket,
  stages: rocket.stages.map((stage) => ({
    ...stage,
    engines: stage.engines.filter((other) => other !== uid),
    core: stage.core.filter((other) => other !== uid),
    mounted: stage.mounted.filter((other) => other !== uid),
  })),
});

/**
 * ¿Se puede cambiar la pieza `uid` (puesta) por `replacement` (de la bodega), en el mismo lugar?
 * Devuelve { ok: true, rocket } con el cohete ya cambiado, o { ok: false, reason }.
 * Es todo o nada: si el cambio no cierra, el cohete queda como estaba.
 */
export const replaceCheck = (rocket, find, uid, replacement) => {
  const where = findInRocket(rocket, uid);
  if (!where) return { ok: false, reason: 'Esa pieza no está en el cohete.' };
  if (findInRocket(rocket, replacement)) return { ok: false, reason: 'La pieza nueva ya está puesta.' };
  const oldPart = find(uid), newPart = find(replacement);
  if (!newPart) return { ok: false, reason: 'La pieza nueva no está en la bodega.' };
  if (oldPart.slot !== newPart.slot) return { ok: false, reason: 'Solo se cambia por una pieza que va en el mismo lugar (motor por motor, cuerpo por cuerpo, equipo por equipo).' };
  const lifted = withoutPart(rocket, uid);
  const check = canPlace(lifted, find, replacement, where.stage);
  if (!check.ok) return { ok: false, reason: check.reason };
  let next = withPart(lifted, find, replacement, where.stage, check.slot);
  // En el mismo lugar: si era un motor o un equipo, la nueva ocupa su posición en la lista.
  if (check.slot !== 'core') {
    const stage = { ...next.stages[where.stage] };
    const list = rocket.stages[where.stage][check.slot];
    stage[check.slot] = list.map((other) => (other === uid ? replacement : other));
    next = { ...next, stages: next.stages.map((s, i) => (i === where.stage ? stage : s)) };
  }
  const problem = stageProblem(next.stages[where.stage], find);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, rocket: next, stage: where.stage };
};

/** Llenado válido: entre 0 y 1, de a 5 %. */
export const normalizeFill = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(1, Math.max(0, Math.round(number / FILL_STEP) * FILL_STEP));
};

/**
 * Convierte el cohete armado en lo que entiende la física (js/rocket.js): etapas con piezas reales.
 * Usa lo que el equipo sabe de cada pieza (lo anunciado o lo inspeccionado), no su verdad oculta.
 * Los motores van lado a lado y el equipo va colgado: solo el cuerpo suma altura.
 */
export const toPhysicsStages = (rocket, inventory) => {
  const items = new Map(inventory.map((item) => [item.uid, item]));
  const real = (uid, extra = {}) => {
    const item = items.get(uid);
    return item ? { ...resolvePart(item), uid, price: item.paid, source: item.source, ...extra } : null;
  };
  return rocket.stages.map((stage) => ({
    items: [
      ...stage.engines.map((uid, index) => real(uid, index === 0 ? {} : { height: 0 })),
      ...stage.core.map((uid) => real(uid, { fill: stage.fill })),
      ...stage.mounted.map((uid) => real(uid, { height: 0 })),
    ].filter(Boolean),
  }));
};
