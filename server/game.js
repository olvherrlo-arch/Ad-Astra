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
 * quien presiona SIGUIENTE (`story:read`) para que el anfitrión sepa cuándo seguir.
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
import { ARKS, MIN_ARKS, ROUTES, SYSTEMS, allot, canBuild, colonyLevel, freshFleet, getArk, resolveJourney } from '../js/fleet.js';
import { SANDBOX, freshCampaign, getMission, missionFor } from '../js/missions.js';
import { UNLIMITED_CREDITS, number } from '../js/partinfo.js';
import { propellantCost, validateRocket } from '../js/rocket.js';
import { EVENTS, ROLES, canActAs, isRoleId, roleHolder, roleName } from '../js/shared.js';
import { ORBITS, PROFILES, SITES, planOf } from '../js/missionplan.js';
import { getStory } from '../js/story.js';
import { getTask, missingTasks, rolesReady } from '../js/tasks.js';
import { MAPS, mapIdFor, spawnFor } from '../js/worldmaps.js';
import { applyBuildAction, isBuildAction } from './build.js';
import { applyEconomyAction, isEconomyAction, openEconomy } from './economy.js';
import { DIFFICULTY, applyFlightAction, isFlightAction, startFlight } from './flight.js';
import { addRecord, listRecords } from './records.js';
import { scoreAction } from './score.js';
import { applyWorldAction, isWorldAction } from './world.js';
import { toSnapshot } from './rooms.js';

const LOG_LIMIT = 30;
/** Etapas de la misión que son parte del viaje (las maneja server/flight.js). */
const FLIGHT_STAGES = ['flight', 'surface', 'return', 'arrival', 'storm', 'bloom'];

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
    fleet: null, //                  las cuatro arcas de la misión 3 (js/fleet.js)
    undoSteps: 0, //                 cuántos cambios del cohete se pueden deshacer
    ...freshWorld(), //              tareas hechas, lo que lleva cada quien, ventajas (server/world.js)
    score: null, //                  puntaje de cada jugador y resumen final (server/score.js)
    plan: null, //                   lugar de alunizaje y órbita lunar elegidos (js/missionplan.js)
    difficulty: 'Normal', //         dificultad del lobby, fijada al elegir la misión
    campaign,
  },
  secret: { seed: randomInt(2 ** 31), vault: null, undo: [], ship: null },
});

/**
 * Estado con el que empieza el modo Sandbox: directo al hangar, sin historia ni constelación.
 * Tiene su propia economía (créditos ilimitados) y no toca ninguna campaña.
 */
export const createSandboxState = () => {
  const base = createInitialState({ ...freshCampaign(), prologueSeen: true });
  const { economy, vault } = openEconomy(SANDBOX, base.secret.seed);
  return {
    ...base,
    data: {
      ...base.data,
      scene: 'mission',
      missionId: SANDBOX.id,
      economy,
      rocket: emptyRocket(),
      plan: { ...planOf(null), profile: 'orbit' },
      attempt: 1,
      log: ['Sandbox: créditos ilimitados. Compra, arma, despega y vuelve al hangar las veces que quieras.'],
    },
    secret: { ...base.secret, vault },
  };
};

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
    case 'mission:retry':
      return true;
    case 'mission:start':
      return typeof action.missionId === 'string' && action.missionId.length <= 20;
    case 'fleet:allot':
      return typeof action.ark === 'string' && typeof action.system === 'string' && (action.delta === 1 || action.delta === -1);
    case 'fleet:route':
      return typeof action.route === 'string';
    case 'plan:set':
      return ['site', 'orbit', 'profile'].every((key) => action[key] === undefined || typeof action[key] === 'string');
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
  // Sandbox: el saldo no baja nunca, se gaste lo que se gaste.
  if (merged.economy?.unlimited && merged.economy.credits !== UNLIMITED_CREDITS) merged.economy = { ...merged.economy, credits: UNLIMITED_CREDITS };
  const moved = merged.stageIndex !== previous.stageIndex
    || merged.flight?.legIndex !== previous.flight?.legIndex
    || mapIdFor(merged) !== mapIdFor(previous);
  if (moved) {
    merged.parked = {};
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
 * `players` = los tripulantes de la sala (para repartir los bonos del puntaje).
 * `difficulty` = la dificultad elegida en el lobby (Fácil | Normal | Difícil).
 * @param {{ id: string, name: string, role: string | null, isHost: boolean, canActAs: (roleId: string) => boolean, heldRoles?: string[], players?: { id: string, name: string, role: string | null }[], difficulty?: string }} actor
 */
export const applyAction = (state, action, actor) => {
  const result = applyRules(state, action, actor);
  if (result.error) return result;
  // Cada acción aceptada puede sumar puntos (server/score.js compara el antes y el después).
  const score = scoreAction(state.data, result.state.data, action, actor, actor.players ?? []);
  return { state: { ...result.state, data: { ...result.state.data, score } } };
};

/**
 * Las reglas de la partida, sin el puntaje.
 * @param {any} state
 * @param {any} action
 * @param {{ id: string, name: string, role: string | null, isHost: boolean, canActAs: (roleId: string) => boolean, heldRoles?: string[], difficulty?: string }} actor
 */
const applyRules = (state, action, actor) => {
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
  const mission = missionFor(data);
  const stages = mission?.stages ?? [];

  /** Lo que cambia después de una acción de vuelo: el vuelo, el dinero y, si corresponde, la etapa. */
  const afterFlight = (base, flown) => {
    const next = { flight: flown.flight, economy: { ...base.economy, credits: flown.credits } };
    const logs = [...flown.logs];
    const result = flown.flight.result;
    if (result && !base.flight.result) {
      // Fin del vuelo: la misión pasa a la Evaluación. Si salió bien, se desbloquea la siguiente.
      next.stageIndex = stages.findIndex((stage) => stage.id === 'debrief');
      if (result.ok && base.campaign.missions[base.missionId]) next.campaign = completeMission(base.campaign, base.missionId);
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
      if (!chosen || !(chosen.id in data.campaign.missions)) return { error: 'Esa misión no existe.' };
      const status = data.campaign.missions[chosen.id];
      if (status === 'locked') return { error: `${chosen.title} sigue bloqueada: primero hay que completar la misión anterior.` };
      if (chosen.stages.length === 0) return { error: `${chosen.title} todavía no está construida.` };
      const { economy: opened, vault } = openEconomy(chosen, state.secret.seed);
      // La dificultad del lobby cambia el presupuesto (y, en el vuelo, las fallas y el guiado).
      const difficulty = DIFFICULTY[actor.difficulty] ? actor.difficulty : 'Normal';
      const budget = Math.round(opened.budget * DIFFICULTY[difficulty].budget);
      const economy = { ...opened, budget, credits: opened.credits + (budget - opened.budget) };
      return commit({
        economy,
        difficulty,
        plan: { ...planOf(null) },
        rocket: emptyRocket(),
        flight: null,
        fleet: chosen.fleet ? freshFleet() : null,
        undoSteps: 0,
        ...freshWorld(),
        scene: 'briefing',
        page: 0,
        read: {},
        missionId: chosen.id,
        stageIndex: 0,
        attempt: 1,
        confirmed: nobodyConfirmed(),
        campaign: {
          ...data.campaign,
          missions: { ...data.campaign.missions, [chosen.id]: status === 'completed' ? status : 'in_progress' },
        },
      }, `${actor.name} eligió la misión ${chosen.title}.`, { vault, undo: [], ship: null });
    }

    // ---------- Plan de la misión: lugar de alunizaje y órbita lunar (js/missionplan.js) ----------
    // Lo deciden Vuelo o Ciencia (cualquiera de los dos), hasta el despegue.
    case 'plan:set': {
      if (data.scene !== 'mission' || !mission?.flightPlan) return { error: 'El plan se elige durante la misión.' };
      if (data.flight) return { error: 'Ya despegaron: el plan quedó fijo.' };
      if (!actor.canActAs('pilot') && !actor.canActAs('scientist')) return { error: 'El plan lo deciden Vuelo y Ciencia.' };
      if (action.site !== undefined && !SITES[action.site]) return { error: 'Ese lugar no existe.' };
      if (action.orbit !== undefined && !ORBITS[action.orbit]) return { error: 'Esa órbita no existe.' };
      if (action.profile !== undefined && !(mission.sandbox && PROFILES[action.profile])) return { error: 'Ese vuelo de prueba no existe.' };
      const before = planOf(data);
      const plan = { ...before, ...(action.site ? { site: action.site } : {}), ...(action.orbit ? { orbit: action.orbit } : {}), ...(action.profile ? { profile: action.profile } : {}) };
      if (plan.site === before.site && plan.orbit === before.orbit && plan.profile === before.profile) return { error: 'Ese ya es el plan.' };
      if (mission.sandbox) return commit({ plan: { ...plan, decided: true } }, `${actor.name} eligió el vuelo de prueba: ${PROFILES[plan.profile].name}.`);
      return commit({ plan: { ...plan, decided: true } }, `${actor.name} cambió el plan: ${SITES[plan.site].name}, ${ORBITS[plan.orbit].name.toLowerCase()}.`);
    }

    // ---------- Misión 3: repartir los recursos entre las arcas y elegir la ruta (js/fleet.js) ----------
    case 'fleet:allot': {
      if (data.scene !== 'mission' || !mission?.fleet || !data.fleet) return { error: 'Los recursos se reparten en la misión de las arcas.' };
      if (!['planning', 'build'].includes(stages[data.stageIndex]?.id)) return { error: 'Las arcas ya despegaron: el reparto quedó fijo.' };
      if (!actor.canActAs('merchant')) return { error: 'Los recursos los reparte Comercio.' };
      const changed = allot(data.fleet, action.ark, action.system, action.delta);
      if (changed.error) return { error: changed.error };
      const level = changed.fleet.alloc[action.ark][action.system];
      return commit({ fleet: changed.fleet }, `${actor.name} ${action.delta > 0 ? 'sumó' : 'quitó'} ${SYSTEMS[action.system].name.toLowerCase()} a ${getArk(action.ark).name} (nivel ${level}).`);
    }
    case 'fleet:route': {
      if (data.scene !== 'mission' || !mission?.fleet || !data.fleet) return { error: 'La ruta se elige en la misión de las arcas.' };
      if (!['planning', 'build', 'launch'].includes(stages[data.stageIndex]?.id)) return { error: 'La flota ya está en camino: la ruta quedó fija.' };
      if (!actor.canActAs('pilot')) return { error: 'La ruta la elige Vuelo.' };
      if (!ROUTES[action.route]) return { error: 'Esa ruta no existe.' };
      return commit({ fleet: { ...data.fleet, route: action.route, routeDecided: true } }, `${actor.name} eligió la ${ROUTES[action.route].name.toLowerCase()} para la flota.`);
    }

    // ---------- Rediseñar y volver a volar ----------
    // Desde la Evaluación el anfitrión puede volver a Construcción con el mismo cohete, la bodega y el dinero
    // que quedó (el combustible ya quemado no se devuelve). Las tareas de la estación siguen hechas: se
    // cambia el diseño, se revisa y se vuelve a despegar. El puntaje vuelve a como estaba antes del despegue.
    case 'mission:retry': {
      const refusal = hostOnly('decide volver a intentarlo');
      if (refusal) return refusal;
      if (mission?.fleet) {
        // Las arcas: se vuelve al Reparto con lo construido; lo que pasó desde el despegue se borra.
        if (data.scene !== 'mission' || stages[data.stageIndex]?.id !== 'debrief') return { error: 'Se puede volver a intentar desde la Evaluación.' };
        const redo = ['launch', 'fleet', 'arrival', 'colony', 'finale'];
        const tasks = Object.fromEntries(Object.entries(data.tasks ?? {}).filter(([id]) => !redo.includes(getTask(id)?.stage)));
        return commit(
          { stageIndex: stages.findIndex((stage) => stage.id === 'planning'), fleet: { ...data.fleet, journey: null, result: null }, tasks, carrying: {}, jobs: {}, attempt: (data.attempt ?? 1) + 1 },
          `${actor.name} vuelve al astillero: intento ${(data.attempt ?? 1) + 1}. Repartan de nuevo y lancen otra vez.`,
        );
      }
      // En el Sandbox también se puede cortar una prueba en pleno vuelo y volver al hangar.
      const abort = Boolean(mission?.sandbox && data.flight);
      if (data.scene !== 'mission' || (stages[data.stageIndex]?.id !== 'debrief' && !abort)) return { error: 'Se puede volver a intentar desde la Evaluación.' };
      const buildIndex = stages.findIndex((stage) => stage.id === (mission.sandbox ? 'validation' : 'build'));
      if (buildIndex === -1) return { error: 'Esta misión no tiene etapa de construcción.' };
      const attempt = (data.attempt ?? 1) + 1;
      return commit(
        { stageIndex: buildIndex, flight: null, carrying: {}, jobs: {}, attempt },
        mission.sandbox ? `De vuelta en el hangar: prueba ${attempt}. Cambia lo que quieras y despega otra vez.` : `${actor.name} vuelve al hangar: intento ${attempt}. Cambien el diseño, revísenlo y despeguen otra vez.`,
        { ship: null },
      );
    }

    // ---------- La palanca de etapa y el despegue ----------
    case 'stage:advance': {
      if (data.scene !== 'mission') return { error: 'La misión todavía no empezó.' };
      if (data.stageIndex >= stages.length - 1) return { error: 'Esta es la última etapa.' };
      const current = stages[data.stageIndex];
      if (FLIGHT_STAGES.includes(current.id) && !mission.fleet) return { error: 'Durante el viaje la etapa cambia sola, cuando terminan sus tramos.' };
      const missing = missingTasks(data, current.id, actor.heldRoles);
      if (missing.length > 0) {
        const more = missing.length > 1 ? ` (y ${missing.length - 1} más)` : '';
        return { error: `Falta una tarea de ${roleName(missing[0].role)}: ${missing[0].title.toLowerCase()}${more}.` };
      }
      const next = stages[data.stageIndex + 1];
      const moveOn = { stageIndex: data.stageIndex + 1 };

      // ---------- Misión 3: lo que pasa al cerrar cada parte ----------
      if (mission.fleet) {
        const debrief = stages.findIndex((stage) => stage.id === 'debrief');
        if (current.id === 'build') {
          const empty = ARKS.find((ark) => !canBuild(data.fleet, ark.id));
          if (empty) return { error: `${empty.name} no puede despegar vacía: le falta al menos un nivel de cada sistema (mesa de recursos).` };
        }
        if (current.id === 'fleet') {
          // El viaje se resuelve con lo que el equipo repartió y la ruta que eligió.
          const journey = resolveJourney(data.fleet, state.secret.seed);
          const lines = ARKS.map((ark) => `${ark.name}: ${journey.arks[ark.id].events.join(' ')}`);
          if (journey.arrived < MIN_ARKS) {
            const text = `solo ${journey.arrived === 1 ? 'llegó un arca' : `llegaron ${journey.arrived} arcas`} a Marte: no alcanza para fundar la colonia.`;
            return commit({ stageIndex: debrief, fleet: { ...data.fleet, journey, result: { ok: false, text } } }, [...lines, `Misión fallida: ${text}`]);
          }
          return commit({ ...moveOn, fleet: { ...data.fleet, journey } }, [...lines, `Marte a la vista. Empieza la etapa: ${next.name}.`]);
        }
        if (current.id === 'finale') {
          const arrived = data.fleet.journey?.arrived ?? 0;
          const level = Math.round(colonyLevel(data.fleet.journey) * 100);
          const text = `${arrived === ARKS.length ? 'Las cuatro arcas llegaron' : `Llegaron ${arrived} de las cuatro arcas`} y la colonia quedó en pie (${level} %). El Prisma volvió a Marte: la humanidad tiene un nuevo hogar.`;
          return commit({ stageIndex: debrief, fleet: { ...data.fleet, result: { ok: true, text } }, campaign: completeMission(data.campaign, data.missionId) },
            ['El Prisma libera su energía sobre Marte. La leyenda de Aztlán se cumplió.', `Misión cumplida: ${text}`]);
        }
        return commit(moveOn, `Empieza la etapa: ${next.name}.`);
      }

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
          legs: mission.flightPlan, seed: state.secret.seed, perks: data.perks, difficulty: data.difficulty,
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
        // En Marte, cada parte de la superficie se cierra recién con las tareas de la etapa hechas.
        const leg = data.flight ? mission.flightPlan?.[data.flight.legIndex] : null;
        if (action.type === 'flight:proceed' && leg?.gate) {
          const missing = missingTasks(data, stageId, actor.heldRoles);
          if (missing.length > 0) return { error: `Falta una tarea de ${roleName(missing[0].role)}: ${missing[0].title.toLowerCase()}${missing.length > 1 ? ` (y ${missing.length - 1} más)` : ''}.` };
        }
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
  socket.on(EVENTS.RECORDS_LIST, (ack) => {
    if (typeof ack === 'function') ack(listRecords());
  });

  socket.on(EVENTS.STATE_ACTION, (action) => {
    const { roomCode, player } = socket.data;
    const room = roomCode ? store.get(roomCode) : undefined;
    if (!room || !player || room.phase !== 'playing') return;

    // ---------- En solitario: cambiar de personaje ----------
    // Cada personaje conserva dónde quedó parado y lo que llevaba en las manos; las tareas hechas no cambian.
    if (action?.type === 'crew:switch') {
      const refuse = (message) => socket.emit(EVENTS.STATE_REJECTED, { message });
      if (!player.crew) return refuse('Cambiar de personaje es para las partidas en solitario.');
      if (!isRoleId(action.role)) return refuse('Ese rol no existe.');
      if (action.role === player.role) return refuse(`Ya estás manejando a ${roleName(action.role)}.`);
      const data = room.state.data;
      const carrying = { ...(data.carrying ?? {}) };
      const parked = { ...(data.parked ?? {}) };
      if (carrying[player.id]) { parked[player.role] = carrying[player.id]; delete carrying[player.id]; }
      if (parked[action.role]) { carrying[player.id] = parked[action.role]; delete parked[action.role]; }
      room.crewSpots = { ...(room.crewSpots ?? {}), [player.role]: { x: player.x, y: player.y, facing: player.facing, map: player.map } };
      const spot = room.crewSpots[action.role];
      delete room.crewSpots[action.role];
      player.role = action.role;
      // Aparece donde ese personaje había quedado; si todavía no se movió en este mapa, en su lugar de llegada.
      const mapId = mapIdFor(data);
      const arrival = spawnFor(MAPS[mapId], ROLES.findIndex((role) => role.id === action.role));
      const at = spot && spot.map === mapId ? spot : { x: Math.round(arrival.x), y: Math.round(arrival.y), facing: 1 };
      Object.assign(player, { x: at.x, y: at.y, facing: at.facing, map: mapId });
      room.state = { ...room.state, version: room.state.version + 1, data: { ...data, carrying, parked } };
      io.to(room.code).emit(EVENTS.ROOM_UPDATE, toSnapshot(room));
      io.to(room.code).emit(EVENTS.STATE_SYNC, publicState(room.state));
      return;
    }
    if (!isGameAction(action)) return socket.emit(EVENTS.STATE_REJECTED, { message: 'Acción desconocida.' });

    const players = [...room.players.values()];
    const result = applyAction(room.state, action, {
      id: player.id,
      name: player.name,
      role: player.role,
      isHost: room.hostId === player.id,
      canActAs: (roleId) => canActAs(players, player.id, roleId),
      heldRoles: ROLES.filter((role) => roleHolder(players, role.id)).map((role) => role.id),
      players: players.map((p) => ({ id: p.id, name: p.name, role: p.role ?? null })),
      difficulty: room.settings?.difficulty,
    });
    if (result.error) return socket.emit(EVENTS.STATE_REJECTED, { message: result.error });

    const previous = room.state;
    room.state = result.state;
    // Terminó una misión: va a la tabla de récords (una vez por vuelo).
    const final = room.state.data.score?.final;
    if (final && !previous.data.score?.final && !getMission(room.state.data.missionId)?.sandbox) {
      const mission = getMission(room.state.data.missionId);
      const place = addRecord({
        team: players.map((p) => p.name),
        missionId: mission?.id ?? '',
        missionTitle: mission?.title ?? '',
        ok: final.ok,
        points: final.teamPoints,
        science: final.science?.value ?? 0,
        scienceMax: final.science?.max ?? 0,
        site: final.plan?.site ?? null,
        orbit: final.plan?.orbit ?? null,
        difficulty: final.difficulty ?? 'Normal',
        attempt: room.state.data.attempt ?? 1,
        objectives: `${final.objectivesDone}/${final.objectivesTotal}`,
        at: Date.now(),
      });
      room.state = { ...room.state, data: { ...room.state.data, score: { ...room.state.data.score, final: { ...final, place } } } };
    }
    io.to(room.code).emit(EVENTS.STATE_SYNC, publicState(room.state));
  });
};
