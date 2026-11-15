/**
 * REGLAS DE LA PARTIDA (servidor)
 * El servidor es la única fuente de verdad: los navegadores mandan acciones,
 * aquí se validan (¿existe?, ¿le toca a ese rol?, ¿se puede ahora?) y se aplican,
 * y el nuevo estado se envía a toda la sala.
 *
 * La partida pasa por escenas (`data.scene`):
 *   prologue  la historia inicial, página por página (solo la primera vez en cada sala)
 *   select    la constelación: se elige la misión
 *   briefing  el informe de la misión elegida, página por página
 *   mission   la misión: los tripulantes caminan por la estación, la nave y la Luna (js/world.js)
 * En las escenas de lectura todos van en la misma página: el anfitrión la pasa, y cada
 * quien avisa "Ya leí" para que el anfitrión sepa cuándo seguir.
 *
 * En la misión no hay "visto bueno": cada rol tiene tareas que se hacen con las manos (js/tasks.js,
 * server/world.js). `data.confirmed[rol]` se calcula solo: un rol está listo cuando terminó sus tareas
 * de la etapa. Con las tareas de los roles que tienen tripulante hechas, cualquiera baja la palanca de
 * etapa (`stage:advance`); el despegue lo da Vuelo. Durante el viaje la etapa cambia sola al terminar
 * sus tramos.
 *
 * El estado tiene tres partes:
 *   version  sube en 1 con cada cambio aceptado
 *   data     lo que ven todos
 *   secret   lo que solo sabe el servidor (nunca se envía): la semilla del azar de la misión,
 *            `vault` (la verdad de cada oferta y de cada pieza del mercado negro) y `ship` (la nave
 *            con sus números verdaderos y el lugar donde está enterrado el Prisma).
 *
 * El dinero y las compras están en server/economy.js, el armado del cohete en server/build.js, las
 * tareas en server/world.js y el vuelo en server/flight.js: este archivo les pasa las acciones y
 * decide cuándo se pasa de etapa.
 */
import { randomInt } from 'node:crypto';
import { emptyRocket, installedUids, toPhysicsStages } from '../js/assembly.js';
import { freshCampaign, getMission } from '../js/missions.js';
import { number } from '../js/partinfo.js';
import { propellantCost, validateRocket } from '../js/rocket.js';
import { EVENTS, ROLES, canActAs, roleHolder, roleName } from '../js/shared.js';
import { getStory } from '../js/story.js';
import { missingTasks, rolesReady } from '../js/tasks.js';
import { mapIdFor } from '../js/worldmaps.js';
import { applyBuildAction, isBuildAction } from './build.js';
import { applyEconomyAction, isEconomyAction, openEconomy } from './economy.js';
import { applyFlightAction, isFlightAction, startFlight } from './flight.js';
import { applyWorldAction, isWorldAction } from './world.js';

const LOG_LIMIT = 30;
/** Etapas de la misión que son parte del viaje (las maneja server/flight.js). */
const FLIGHT_STAGES = ['flight', 'surface', 'return'];

/** Marca la misión como completada y abre la siguiente de la campaña. */
const completeMission = (campaign, missionId) => {
  const missions = { ...campaign.missions, [missionId]: 'completed' };
  const order = Object.keys(missions);
  const nextId = order[order.indexOf(missionId) + 1];
  if (nextId && missions[nextId] === 'locked') missions[nextId] = 'available';
  return { ...campaign, missions };
};
const UNDO_LIMIT = 40;

const nobodyConfirmed = () => Object.fromEntries(ROLES.map((role) => [role.id, false]));
/** Tareas, manos y ventajas en cero: así empieza cada misión. */
const freshWorld = () => ({ tasks: {}, carrying: {}, perks: {}, jobs: {} });

/**
 * Estado con el que empieza cada partida (cada vez que el anfitrión presiona Despegar).
 * `campaign` es lo que la sala ya avanzó (prólogo visto, estado de cada misión): se conserva
 * entre partidas mientras la sala exista.
 */
export const createInitialState = (campaign = freshCampaign()) => ({
  version: 0,
  data: {
    scene: campaign.prologueSeen ? 'select' : 'prologue',
    page: 0, //                      página de la historia que todos están leyendo
    read: {}, //                     id de jugador → true si ya avisó que leyó esta página
    missionId: null, //              misión en curso (null hasta elegirla en la constelación)
    stageIndex: 0,
    confirmed: nobodyConfirmed(), // rol → true cuando terminó sus tareas de la etapa (se calcula solo)
    log: [], //                      bitácora: lo último que pasó, para que todos se enteren
    economy: null, //                presupuesto, mercado y bodega (se abre al elegir la misión)
    rocket: null, //                 el cohete armado (js/assembly.js)
    flight: null, //                 el vuelo en curso (server/flight.js)
    undoSteps: 0, //                 cuántos cambios del cohete se pueden deshacer
    ...freshWorld(), //              tareas hechas, lo que lleva cada quien, ventajas (server/world.js)
    campaign,
  },
  secret: { seed: randomInt(2 ** 31), vault: null, undo: [], ship: null },
});

/** Lo único que sale del servidor. */
export const publicState = ({ version, data }) => ({ version, data });

/** ¿Es una acción que conocemos y bien formada? Nunca confíes en lo que manda el navegador. */
export const isGameAction = (action) => {
  if (typeof action !== 'object' || action === null) return false;
  switch (action.type) {
    case 'story:read':
    case 'story:next':
    case 'story:back':
    case 'story:replay':
    case 'story:skip':
    case 'stage:advance':
      return true;
    case 'mission:start':
      return typeof action.missionId === 'string' && action.missionId.length <= 20;
    default:
      return isEconomyAction(action) || isBuildAction(action) || isFlightAction(action) || isWorldAction(action);
  }
};

/**
 * Deja el estado coherente después de cualquier cambio: quién está listo, y qué pasa con lo que
 * los tripulantes llevaban en las manos cuando cambia la etapa, el tramo o el mapa.
 */
const settle = (previous, merged) => {
  const stageId = getMission(merged.missionId)?.stages[merged.stageIndex]?.id;
  if (merged.scene === 'mission' && stageId) merged.confirmed = rolesReady(merged, stageId);
  const moved = merged.stageIndex !== previous.stageIndex
    || merged.flight?.legIndex !== previous.flight?.legIndex
    || mapIdFor(merged) !== mapIdFor(previous);
  if (moved) {
    merged.carrying = {};
    merged.jobs = {};
  } else if (merged.flight?.phase !== 'emergency' && Object.values(merged.carrying ?? {}).some((held) => held.id === 'spare')) {
    // Se terminó la emergencia: el repuesto que alguien llevaba ya no hace falta.
    merged.carrying = Object.fromEntries(Object.entries(merged.carrying).filter(([, held]) => held.id !== 'spare'));
  }
  return merged;
};

/**
 * Estado actual + acción → `{ state }` con el nuevo estado, o `{ error }` con el motivo del rechazo.
 * No toques sockets aquí: solo datos.
 * `heldRoles` = roles que tienen un tripulante conectado (si falta, se asume que están los cuatro).
 * @param {{ id: string, name: string, role: string | null, isHost: boolean, canActAs: (roleId: string) => boolean, heldRoles?: string[] }} actor
 */
export const applyAction = (state, action, actor) => {
  const { data } = state;
  /** @param {object} next  @param {string | (string | null)[] | null} [logText]  @param {object} [secretNext] */
  const commit = (next, logText, secretNext) => {
    const merged = { ...data, ...next };
    const lines = (Array.isArray(logText) ? logText : [logText]).filter(Boolean);
    if (lines.length > 0) merged.log = [...data.log, ...lines].slice(-LOG_LIMIT);
    return { state: { ...state, version: state.version + 1, data: settle(data, merged), secret: { ...state.secret, ...secretNext } } };
  };
  const hostOnly = (what) => (actor.isHost ? null : { error: `Solo el anfitrión ${what}.` });
  const story = getStory(data.scene, data.missionId);
  const mission = getMission(data.missionId);
  const stages = mission?.stages ?? [];

  /** Lo que cambia después de una acción de vuelo: el vuelo, el dinero y, si corresponde, la etapa. */
  const afterFlight = (base, flown) => {
    const next = { flight: flown.flight, economy: { ...base.economy, credits: flown.credits } };
    const logs = [...flown.logs];
    const result = flown.flight.result;
    if (result && !base.flight.result) {
      // Fin del vuelo: la misión pasa a la Evaluación. Si salió bien, se desbloquea la siguiente.
      next.stageIndex = stages.findIndex((stage) => stage.id === 'debrief');
      if (result.ok) next.campaign = completeMission(base.campaign, base.missionId);
    } else if (flown.flight.phase === 'stageDone') {
      // Terminaron los tramos de esta parte del viaje: la etapa cambia sola.
      next.stageIndex = base.stageIndex + 1;
      next.flight = { ...flown.flight, phase: 'ready' };
      logs.push(`Empieza la etapa: ${stages[next.stageIndex].name}.`);
    }
    return { next, logs };
  };

  switch (action.type) {
    // ---------- Historia: prólogo e informes ----------
    case 'story:read': {
      if (!story) return { error: 'Ahora no hay nada que leer.' };
      if (data.read[actor.id]) return { error: 'Ya habías avisado que leíste esta página.' };
      return commit({ read: { ...data.read, [actor.id]: true } });
    }
    case 'story:next': {
      if (!story) return { error: 'Ahora no hay nada que leer.' };
      const refusal = hostOnly('pasa la página');
      if (refusal) return refusal;
      if (data.page < story.pages.length - 1) return commit({ page: data.page + 1, read: {} });
      if (data.scene === 'prologue') {
        return commit(
          { scene: 'select', page: 0, read: {}, campaign: { ...data.campaign, prologueSeen: true } },
          'La tripulación conoce la leyenda del Prisma.',
        );
      }
      return commit({ scene: 'mission', page: 0, read: {} }, `Empieza la misión: ${mission.title}.`);
    }
    case 'story:back': {
      if (!story) return { error: 'Ahora no hay nada que leer.' };
      const refusal = hostOnly('pasa la página');
      if (refusal) return refusal;
      if (data.page === 0) return { error: 'Esta es la primera página.' };
      return commit({ page: data.page - 1, read: {} });
    }
    case 'story:skip': {
      // El anfitrión salta lo que queda de la historia (por ejemplo, si el equipo ya la vio).
      if (!story) return { error: 'Ahora no hay nada que saltar.' };
      const refusal = hostOnly('puede saltar la historia');
      if (refusal) return refusal;
      if (data.scene === 'prologue') {
        return commit({ scene: 'select', page: 0, read: {}, campaign: { ...data.campaign, prologueSeen: true } }, `${actor.name} saltó el prólogo.`);
      }
      return commit({ scene: 'mission', page: 0, read: {} }, `${actor.name} saltó el informe. Empieza la misión: ${mission.title}.`);
    }
    case 'story:replay': {
      const refusal = hostOnly('puede volver a mostrar el prólogo');
      if (refusal) return refusal;
      if (data.scene !== 'select') return { error: 'El prólogo se vuelve a ver desde la constelación.' };
      return commit({ scene: 'prologue', page: 0, read: {} });
    }

    // ---------- Constelación: elegir misión ----------
    case 'mission:start': {
      const refusal = hostOnly('inicia la misión');
      if (refusal) return refusal;
      if (data.scene !== 'select') return { error: 'La misión se elige desde la constelación.' };
      const chosen = getMission(action.missionId);
      if (!chosen) return { error: 'Esa misión no existe.' };
      const status = data.campaign.missions[chosen.id];
      if (status === 'locked') return { error: `${chosen.title} sigue bloqueada: primero hay que completar la misión anterior.` };
      if (chosen.stages.length === 0) return { error: `${chosen.title} todavía no está construida.` };
      const { economy, vault } = openEconomy(chosen, state.secret.seed);
      return commit({
        economy,
        rocket: emptyRocket(),
        flight: null,
        undoSteps: 0,
        ...freshWorld(),
        scene: 'briefing',
        page: 0,
        read: {},
        missionId: chosen.id,
        stageIndex: 0,
        confirmed: nobodyConfirmed(),
        campaign: {
          ...data.campaign,
          missions: { ...data.campaign.missions, [chosen.id]: status === 'completed' ? status : 'in_progress' },
        },
      }, `${actor.name} eligió la misión ${chosen.title}.`, { vault, undo: [], ship: null });
    }

    // ---------- La palanca de etapa y el despegue ----------
    case 'stage:advance': {
      if (data.scene !== 'mission') return { error: 'La misión todavía no empezó.' };
      if (data.stageIndex >= stages.length - 1) return { error: 'Esta es la última etapa.' };
      const current = stages[data.stageIndex];
      if (FLIGHT_STAGES.includes(current.id)) return { error: 'Durante el viaje la etapa cambia sola, cuando terminan sus tramos.' };
      const missing = missingTasks(data, current.id, actor.heldRoles);
      if (missing.length > 0) {
        const more = missing.length > 1 ? ` (y ${missing.length - 1} más)` : '';
        return { error: `Falta una tarea de ${roleName(missing[0].role)}: ${missing[0].title.toLowerCase()}${more}.` };
      }
      const next = stages[data.stageIndex + 1];
      const moveOn = { stageIndex: data.stageIndex + 1 };

      // Al salir de Validación se despega: lo da Vuelo, el cohete tiene que pasar la revisión y se paga el combustible.
      if (current.id === 'validation') {
        if (!actor.canActAs('pilot')) return { error: 'El despegue lo da Vuelo, desde la plataforma de lanzamiento.' };
        const physical = toPhysicsStages(data.rocket, data.economy.inventory);
        const review = validateRocket(physical, mission, { credits: data.economy.credits });
        if (review.critical.length > 0) {
          const more = review.critical.length > 1 ? ` Hay ${review.critical.length - 1} problema(s) más.` : '';
          return { error: `No se puede despegar. ${review.critical[0].text}${more}` };
        }
        const fuel = propellantCost(physical);
        const { flight, ship } = startFlight({
          rocket: data.rocket, inventory: data.economy.inventory, vaultItems: state.secret.vault.items,
          legs: mission.flightPlan, seed: state.secret.seed, perks: data.perks,
        });
        return commit(
          { ...moveOn, flight, economy: { ...data.economy, credits: data.economy.credits - fuel } },
          `Tanques llenos: ${number(fuel)} créditos de combustible. ¡Despegue! Empieza la etapa: ${next.name}.`,
          { ship },
        );
      }
      return commit(moveOn, `Empieza la etapa: ${next.name}.`);
    }
    default: {
      if (data.scene !== 'mission') return { error: 'La misión todavía no empezó.' };
      const stageId = stages[data.stageIndex]?.id;
      const flightContext = (base) => ({
        flight: base.flight, ship: state.secret.ship, legs: mission.flightPlan, credits: base.economy.credits, stageId,
      });

      // ---------- Vuelo (server/flight.js) ----------
      if (isFlightAction(action)) {
        const flown = applyFlightAction(flightContext(data), action, actor);
        if (flown.error) return { error: flown.error };
        const { next, logs } = afterFlight(data, flown);
        // Comercio entregó el repuesto en la avería: ya no lo lleva en las manos.
        if (action.type === 'flight:resolve' && data.carrying?.[actor.id]?.id === 'spare') {
          next.carrying = Object.fromEntries(Object.entries(data.carrying).filter(([id]) => id !== actor.id));
        }
        return commit(next, logs, { ship: flown.ship });
      }

      // ---------- Tareas y lo que se lleva en las manos (server/world.js) ----------
      if (isWorldAction(action)) {
        const done = applyWorldAction({ data, stageId }, action, actor);
        if (done.error) return { error: done.error };
        if (!done.then) return commit(done.patch, done.log);
        // La tarea dispara algo en el vuelo: el Prisma llegó a la nave, o la carga quedó asegurada.
        const base = { ...data, ...done.patch };
        const flown = applyFlightAction(flightContext(base), done.then, { ...actor, canActAs: () => true });
        if (flown.error) return { error: flown.error };
        const { next, logs } = afterFlight(base, flown);
        return commit({ ...done.patch, ...next }, [done.log, ...logs], { ship: flown.ship });
      }

      // ---------- Constructor (server/build.js) ----------
      if (isBuildAction(action)) {
        if (action.type === 'build:undo') {
          if (!actor.canActAs('engineer')) return { error: 'El cohete lo arma Ingeniería.' };
          const history = state.secret.undo ?? [];
          if (history.length === 0) return { error: 'No hay nada que deshacer.' };
          return commit({ rocket: history.at(-1), undoSteps: history.length - 1 }, null, { undo: history.slice(0, -1) });
        }
        const built = applyBuildAction(data.rocket, data.economy?.inventory ?? [], action, actor, stageId);
        if (built.error) return { error: built.error };
        const history = [...(state.secret.undo ?? []), data.rocket].slice(-UNDO_LIMIT);
        return commit({ rocket: built.rocket, undoSteps: history.length }, built.log, { undo: history });
      }

      // ---------- Mercado, mercado negro y bodega (server/economy.js) ----------
      if (!isEconomyAction(action)) return { error: 'Acción desconocida.' };
      if (action.type === 'market:sell' && data.rocket && installedUids(data.rocket).includes(action.uid)) {
        return { error: 'Esa pieza está puesta en el cohete: primero hay que quitarla.' };
      }
      const result = applyEconomyAction(data.economy, state.secret.vault, action, actor, stageId);
      if (result.error) return { error: result.error };
      return commit({ economy: result.economy }, result.log, { vault: result.vault });
    }
  }
};

// ============================================================
//  Conexión (normalmente no necesitas tocar esto)
// ============================================================

export const registerGameHandlers = (io, socket, store) => {
  socket.on(EVENTS.STATE_ACTION, (action) => {
    const { roomCode, player } = socket.data;
    const room = roomCode ? store.get(roomCode) : undefined;
    if (!room || !player || room.phase !== 'playing') return;
    if (!isGameAction(action)) return socket.emit(EVENTS.STATE_REJECTED, { message: 'Acción desconocida.' });

    const players = [...room.players.values()];
    const result = applyAction(room.state, action, {
      id: player.id,
      name: player.name,
      role: player.role,
      isHost: room.hostId === player.id,
      canActAs: (roleId) => canActAs(players, player.id, roleId),
      heldRoles: ROLES.filter((role) => roleHolder(players, role.id)).map((role) => role.id),
    });
    if (result.error) return socket.emit(EVENTS.STATE_REJECTED, { message: result.error });

    room.state = result.state;
    io.to(room.code).emit(EVENTS.STATE_SYNC, publicState(room.state));
  });
};
