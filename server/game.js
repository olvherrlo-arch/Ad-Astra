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
 *   mission   la mesa de misión: etapas y visto bueno de cada rol
 * En las escenas de lectura todos van en la misma página: el anfitrión la pasa, y cada
 * quien avisa "Ya leí" para que el anfitrión sepa cuándo seguir.
 *
 * El estado tiene tres partes:
 *   version  sube en 1 con cada cambio aceptado
 *   data     lo que ven todos
 *   secret   lo que solo sabe el servidor (nunca se envía): la semilla del azar de la misión y
 *            `vault`, con la verdad de cada oferta y de cada pieza del mercado negro.
 *
 * El dinero y las compras están en server/economy.js y el armado del cohete en server/build.js;
 * este archivo les pasa las acciones y decide cuándo se puede pasar de etapa.
 * El vuelo está en server/flight.js: empieza al salir de Validación y dura las etapas Vuelo,
 * Superficie y Regreso.
 */
import { randomInt } from 'node:crypto';
import { emptyRocket, installedUids, toPhysicsStages } from '../js/assembly.js';
import { freshCampaign, getMission } from '../js/missions.js';
import { number } from '../js/partinfo.js';
import { propellantCost, validateRocket } from '../js/rocket.js';
import { EVENTS, ROLES, canActAs, isRoleId, roleName } from '../js/shared.js';
import { getStory } from '../js/story.js';
import { applyBuildAction, isBuildAction } from './build.js';
import { applyEconomyAction, isEconomyAction, openEconomy } from './economy.js';
import { applyFlightAction, isFlightAction, startFlight } from './flight.js';

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
    confirmed: nobodyConfirmed(), // visto bueno de cada rol en la etapa actual
    log: [], //                      bitácora: lo último que pasó, para que todos se enteren
    economy: null, //                presupuesto, mercado y bodega (se abre al elegir la misión)
    rocket: null, //                 el cohete armado (js/assembly.js)
    flight: null, //                 el vuelo en curso (server/flight.js)
    undoSteps: 0, //                 cuántos cambios del cohete se pueden deshacer
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
    case 'role:confirm':
      return isRoleId(action.role) && typeof action.value === 'boolean';
    default:
      return isEconomyAction(action) || isBuildAction(action) || isFlightAction(action);
  }
};

/**
 * Estado actual + acción → `{ state }` con el nuevo estado, o `{ error }` con el motivo del rechazo.
 * No toques sockets aquí: solo datos.
 * @param {{ id: string, name: string, role: string | null, isHost: boolean, canActAs: (roleId: string) => boolean }} actor
 */
export const applyAction = (state, action, actor) => {
  const { data } = state;
  /** @param {object} next  @param {string | string[] | null} [logText]  @param {object} [secretNext] */
  const commit = (next, logText, secretNext) => {
    const merged = { ...data, ...next };
    const lines = (Array.isArray(logText) ? logText : [logText]).filter(Boolean);
    if (lines.length > 0) merged.log = [...data.log, ...lines].slice(-LOG_LIMIT);
    return { state: { ...state, version: state.version + 1, data: merged, secret: { ...state.secret, ...secretNext } } };
  };
  const hostOnly = (what) => (actor.isHost ? null : { error: `Solo el anfitrión ${what}.` });
  const story = getStory(data.scene, data.missionId);
  const stages = getMission(data.missionId)?.stages ?? [];

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
      return commit({ scene: 'mission', page: 0, read: {} }, `Empieza la misión: ${getMission(data.missionId).title}.`);
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
      return commit({ scene: 'mission', page: 0, read: {} }, `${actor.name} saltó el informe. Empieza la misión: ${getMission(data.missionId).title}.`);
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
      const mission = getMission(action.missionId);
      if (!mission) return { error: 'Esa misión no existe.' };
      const status = data.campaign.missions[mission.id];
      if (status === 'locked') return { error: `${mission.title} sigue bloqueada: primero hay que completar la misión anterior.` };
      if (mission.stages.length === 0) return { error: `${mission.title} todavía no está construida.` };
      const { economy, vault } = openEconomy(mission, state.secret.seed);
      return commit({
        economy,
        rocket: emptyRocket(),
        flight: null,
        undoSteps: 0,
        scene: 'briefing',
        page: 0,
        read: {},
        missionId: mission.id,
        stageIndex: 0,
        confirmed: nobodyConfirmed(),
        campaign: {
          ...data.campaign,
          missions: { ...data.campaign.missions, [mission.id]: status === 'completed' ? status : 'in_progress' },
        },
      }, `${actor.name} eligió la misión ${mission.title}.`, { vault, undo: [], ship: null });
    }

    // ---------- Mesa de misión ----------
    case 'role:confirm': {
      if (data.scene !== 'mission') return { error: 'La misión todavía no empezó.' };
      if (!actor.canActAs(action.role)) return { error: `${roleName(action.role)} le toca a otro tripulante.` };
      if (data.confirmed[action.role] === action.value) return { error: 'Eso ya estaba marcado.' };
      return commit(
        { confirmed: { ...data.confirmed, [action.role]: action.value } },
        `${actor.name} ${action.value ? 'dio' : 'retiró'} el visto bueno de ${roleName(action.role)}.`,
      );
    }
    case 'stage:advance': {
      if (data.scene !== 'mission') return { error: 'La misión todavía no empezó.' };
      const refusal = hostOnly('pasa a la siguiente etapa');
      if (refusal) return refusal;
      const missing = ROLES.filter((role) => !data.confirmed[role.id]).map((role) => role.name);
      if (missing.length > 0) return { error: `Falta el visto bueno de: ${missing.join(', ')}.` };
      if (data.stageIndex >= stages.length - 1) return { error: 'Esta es la última etapa.' };
      const next = stages[data.stageIndex + 1];
      const moveOn = { stageIndex: data.stageIndex + 1, confirmed: nobodyConfirmed() };
      const current = stages[data.stageIndex].id;

      // Durante el viaje, se pasa de etapa cuando terminan sus tramos.
      if (FLIGHT_STAGES.includes(current)) {
        const flight = data.flight;
        if (!flight || !['stageDone', 'over'].includes(flight.phase)) return { error: 'Todavía quedan tramos de esta parte del viaje.' };
        return commit({ ...moveOn, flight: { ...flight, phase: flight.phase === 'over' ? 'over' : 'ready' } }, `Empieza la etapa: ${next.name}.`);
      }

      // Al salir de Validación se despega: el cohete tiene que pasar la revisión y se paga el combustible.
      if (stages[data.stageIndex].id === 'validation') {
        const physical = toPhysicsStages(data.rocket, data.economy.inventory);
        const review = validateRocket(physical, getMission(data.missionId), { credits: data.economy.credits });
        if (review.critical.length > 0) {
          const more = review.critical.length > 1 ? ` Hay ${review.critical.length - 1} problema(s) más.` : '';
          return { error: `No se puede despegar. ${review.critical[0].text}${more}` };
        }
        const fuel = propellantCost(physical);
        const mission = getMission(data.missionId);
        const { flight, ship } = startFlight({
          rocket: data.rocket, inventory: data.economy.inventory, vaultItems: state.secret.vault.items,
          legs: mission.flightPlan, seed: state.secret.seed,
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
      // ---------- Mercado, mercado negro y bodega (server/economy.js) ----------
      if (data.scene !== 'mission') return { error: 'La misión todavía no empezó.' };
      const stageId = stages[data.stageIndex]?.id;

      // ---------- Vuelo (server/flight.js) ----------
      if (isFlightAction(action)) {
        const mission = getMission(data.missionId);
        const flown = applyFlightAction({
          flight: data.flight, ship: state.secret.ship, legs: mission.flightPlan, credits: data.economy.credits, stageId,
        }, action, actor);
        if (flown.error) return { error: flown.error };
        const next = { flight: flown.flight, economy: { ...data.economy, credits: flown.credits } };
        const result = flown.flight.result;
        if (result && !data.flight.result) {
          // Fin del vuelo. Si falló, la misión salta a la Evaluación; si salió bien, se desbloquea la siguiente.
          if (!result.ok) Object.assign(next, { stageIndex: stages.findIndex((s) => s.id === 'debrief'), confirmed: nobodyConfirmed() });
          else next.campaign = completeMission(data.campaign, data.missionId);
        }
        return commit(next, flown.logs, { ship: flown.ship });
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
    });
    if (result.error) return socket.emit(EVENTS.STATE_REJECTED, { message: result.error });

    room.state = result.state;
    io.to(room.code).emit(EVENTS.STATE_SYNC, publicState(room.state));
  });
};
