/**
 * CONSTRUCCIÓN DEL COHETE (servidor)
 * Aplica lo que hace Ingeniería en el constructor: poner, mover y quitar piezas, agregar o quitar
 * etapas y elegir cuánto combustible carga cada una. Funciones puras; las reglas de qué encaja
 * dónde están en js/assembly.js (las mismas que usa la pantalla para avisar antes de soltar).
 */
import {
  BUILD_STAGES, addStageProblem, canPlace, emptyStage, findInRocket, normalizeFill, partFinder, replaceCheck, stageProblem,
  withPart, withoutPart,
} from '../js/assembly.js';

export const isBuildAction = (action) => {
  const uid = (value) => typeof value === 'string' && value.length > 0 && value.length <= 20;
  switch (action.type) {
    case 'build:place':
    case 'build:move':
      return uid(action.uid) && Number.isInteger(action.stage);
    case 'build:remove':
      return uid(action.uid);
    case 'build:replace':
      return uid(action.uid) && uid(action.with);
    case 'build:addStage':
    case 'build:undo':
      return true;
    case 'build:removeStage':
      return Number.isInteger(action.stage);
    case 'build:fill':
      return Number.isInteger(action.stage) && typeof action.fill === 'number';
    default:
      return false;
  }
};

/**
 * Devuelve `{ rocket, log }` con el cohete nuevo, o `{ error }`.
 * (`build:undo` lo resuelve server/game.js, que es quien guarda el historial.)
 * @param {{ name: string, canActAs: (roleId: string) => boolean }} actor
 */
export const applyBuildAction = (rocket, inventory, action, actor, stageId) => {
  if (!rocket) return { error: 'Primero hay que elegir la misión.' };
  if (!BUILD_STAGES.includes(stageId)) return { error: 'El cohete se arma en las etapas Construcción y Validación.' };
  if (!actor.canActAs('engineer')) return { error: 'El cohete lo arma Ingeniería.' };

  const find = partFinder(inventory);

  switch (action.type) {
    case 'build:place': {
      const check = canPlace(rocket, find, action.uid, action.stage);
      if (!check.ok) return { error: check.reason };
      return { rocket: withPart(rocket, find, action.uid, action.stage, check.slot), log: null }; // sin bitácora: se ve en el cohete
    }

    case 'build:remove': {
      const where = findInRocket(rocket, action.uid);
      if (!where) return { error: 'Esa pieza no está en el cohete.' };
      const next = withoutPart(rocket, action.uid);
      const problem = stageProblem(next.stages[where.stage], find);
      if (problem) return { error: problem };
      return { rocket: next, log: null };
    }

    case 'build:move': {
      const where = findInRocket(rocket, action.uid);
      if (!where) return { error: 'Esa pieza no está en el cohete.' };
      if (where.stage === action.stage) return { error: 'Ya está en esa etapa.' };
      const lifted = withoutPart(rocket, action.uid);
      const problem = stageProblem(lifted.stages[where.stage], find);
      if (problem) return { error: problem };
      const check = canPlace(lifted, find, action.uid, action.stage);
      if (!check.ok) return { error: check.reason };
      return { rocket: withPart(lifted, find, action.uid, action.stage, check.slot), log: null };
    }

    case 'build:replace': {
      // Cambiar una pieza por otra en el mismo lugar, en un solo paso: o se hace entero, o nada.
      const swap = replaceCheck(rocket, find, action.uid, action.with);
      if (!swap.ok) return { error: swap.reason };
      return { rocket: swap.rocket, log: `${actor.name} cambió ${find(action.uid).name} por ${find(action.with).name} en la etapa ${swap.stage + 1}.` };
    }

    case 'build:addStage': {
      const problem = addStageProblem(rocket, find);
      if (problem) return { error: problem };
      return { rocket: { ...rocket, stages: [...rocket.stages, emptyStage()] }, log: `${actor.name} agregó la etapa ${rocket.stages.length + 1}.` };
    }

    case 'build:removeStage': {
      const stage = rocket.stages[action.stage];
      if (!stage) return { error: 'Esa etapa no existe.' };
      if (rocket.stages.length === 1) return { rocket: { ...rocket, stages: [emptyStage()] }, log: `${actor.name} vació el cohete.` };
      // Sus piezas vuelven a la bodega; las etapas de arriba bajan un lugar.
      return { rocket: { ...rocket, stages: rocket.stages.filter((_stage, index) => index !== action.stage) }, log: `${actor.name} quitó la etapa ${action.stage + 1}.` };
    }

    case 'build:fill': {
      const stage = rocket.stages[action.stage];
      const fill = normalizeFill(action.fill);
      if (!stage || fill === null) return { error: 'Esa etapa no existe.' };
      if (fill === stage.fill) return { error: 'Ya estaba cargada así.' };
      return {
        rocket: { ...rocket, stages: rocket.stages.map((other, index) => (index === action.stage ? { ...other, fill } : other)) },
        log: `${actor.name} cargó la etapa ${action.stage + 1} al ${Math.round(fill * 100)} %.`,
      };
    }

    default:
      return { error: 'Acción desconocida.' };
  }
};
