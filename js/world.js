/**
 * EL MUNDO: LA MISIÓN SE JUEGA CAMINANDO
 * Durante la misión cada tripulante maneja a su astronauta por un mundo 2D compartido
 * (js/worldmaps.js): la estación antes de despegar, el interior de la nave en vuelo y la superficie
 * de la Luna. Todo se hace yendo hasta un puesto y usándolo:
 *
 *   Moverse     WASD o flechas, o clic en el piso (clic en un puesto = ir y usarlo)
 *   Usar        E junto a un puesto (algunas acciones piden mantener E)
 *   Cambiar     Q cuando un puesto ofrece más de una acción
 *   Soltar      X deja lo que llevas en las manos
 *   Chat        Enter
 *
 * No hay "visto bueno" ni "siguiente": las tareas (js/tasks.js) se hacen con minijuegos
 * (js/minigames.js), cargando cosas de un puesto a otro o piloteando (js/pilotgames.js), y la etapa
 * avanza con la palanca de la sala de misión. Las únicas pantallas de menú son el mercado y el
 * constructor, que se abren desde su terminal.
 *
 * El estado viene siempre del servidor (session.state); aquí se dibuja y se mandan acciones.
 * Lo que hace cada puesto está en `actionsAt`; lo que le toca a cada rol, en `objectives`.
 */
import { BUILD_STAGES } from './assembly.js';
import { mountBuilder } from './builder.js';
import { drawAstronaut, FRAME_COUNT, IDLE_FRAME, WALK_FPS } from './character.js';
import { mountChat } from './chat.js';
import { playCinematic } from './cinematic.js';
import { endGame, isHost, on, sendAction, sendMove, session } from './connection.js';
import { mountFlight } from './flightview.js';
import { mountPlan } from './planview.js';
import { mountScore } from './scoreview.js';
import { frameLoop } from './frame.js';
import { MARKET_STAGES } from './market.js';
import { mountMarket } from './marketview.js';
import { playMinigame } from './minigames.js';
import { getMission, missionFor } from './missions.js';
import { credits, number } from './partinfo.js';
import { playBurn, playLander } from './pilotgames.js';
import { INK, UI_FONT, condensed, halftone, inkFill, keyLine, paperFill, withAlpha } from './riso.js';
import { ROLES, canActAs, colorHex, roleHolder, roleName } from './shared.js';
import { canvasDpr, getSettings, onSettings, reducedEffects } from './settings.js';
import { sounds } from './sound.js';
import { FAULT_STATION, JOBS, PERKS, PREP, SPARE_STATION, getTask, isTaskDone, missingTasks, stageTasks, taskProgress } from './tasks.js';
import { ROLE_INK, drawItem, drawRock, drawStation, label, paintMap } from './worldart.js';
import { CARRY_SPEED, MAPS, PRISM_SPEED, REACH, WORLD_SPEED, canStand, distanceTo, findPath, mapIdFor, spawnFor } from './worldmaps.js';

const KEY_DIRECTIONS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const SEND_INTERVAL_MS = 60;
const BUBBLE_MS = 4_000;
const SPRITE_SCALE = 0.5;
const HOLD_MS = 1_000; // cuánto hay que mantener E en las acciones que no se deshacen
const BOARDING_REACH = 300; // qué tan cerca de la plataforma (o del módulo) cuenta como "a bordo"
const ITEM_NAMES = { chip: 'la ficha de presupuesto', sample: 'la muestra', crate: 'una caja', instrument: 'los instrumentos', container: 'el contenedor', prism: 'el Prisma', spare: 'el repuesto' };

/** Tomas de cine al cambiar de etapa (js/cinematic.js). Solo se muestran; no cambian nada del juego. */
const STAGE_SHOTS = {
  flight: () => ({ art: 'rocket', camera: 'up', kicker: 'Etapa Vuelo', title: '¡Despegue!', text: 'Todos a sus puestos. Rumbo a la Luna.' }),
  surface: () => ({ art: 'moon', camera: 'in', kicker: 'Etapa Superficie', title: 'El lado oculto', text: 'Hora de bajar y encontrar el Prisma.' }),
  return: () => ({ art: 'earth', camera: 'out', kicker: 'Etapa Regreso', title: 'Rumbo a casa', text: 'Queda volver con la nave entera.' }),
  debrief: (data) => (data.flight?.result?.ok
    ? { art: 'bolt', camera: 'in', kicker: 'Resultado', title: 'Misión cumplida', text: 'El Prisma está en la Tierra. La leyenda era cierta.', tone: 'good' }
    : { art: 'moon', camera: 'out', kicker: 'Resultado', title: 'Misión fallida', text: data.flight?.result?.text ?? 'La nave no pudo completar el viaje.', tone: 'bad' }),
};

const WORLD_HTML = `
<div class="world">
  <canvas class="world-canvas" aria-label="El mundo de la misión: muévete con WASD o las flechas y usa los puestos con E"></canvas>
  <section class="world-objectives" aria-label="Tareas"></section>
  <section class="world-team" aria-label="Tripulación"></section>
  <section class="world-flight" aria-label="Vuelo" hidden></section>
  <p class="world-carry" hidden></p>
  <button type="button" class="world-prompt" hidden></button>
  <nav class="world-buttons" aria-label="Paneles">
    <button type="button" data-open="chat">Chat <kbd>Enter</kbd></button>
    <button type="button" data-open="log">Bitácora</button>
  </nav>
  <aside class="world-side world-chat" aria-label="Chat" hidden></aside>
  <aside class="world-side world-log" aria-label="Bitácora" hidden>
    <header class="chat-header"><h2>Bitácora</h2><button type="button" class="chat-close" aria-label="Cerrar bitácora">✕</button></header>
    <ol></ol>
  </aside>
  <div class="world-panel" role="dialog" aria-modal="true" hidden>
    <header class="world-panel-bar">
      <h2></h2>
      <div class="world-panel-tabs" role="tablist"></div>
      <button type="button" class="world-panel-close">✕ Cerrar <kbd>Esc</kbd></button>
    </header>
    <div class="world-panel-body"></div>
  </div>
  <p class="world-toast" role="status" hidden></p>
  <div class="world-fade" hidden><p></p></div>
</div>`;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const isTyping = () => {
  const element = document.activeElement;
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
};
const ellipsize = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const mountWorld = (container) => {
  container.innerHTML = WORLD_HTML;
  const $ = (selector) => /** @type {HTMLElement} */ (container.querySelector(selector));
  const canvas = /** @type {HTMLCanvasElement} */ ($('.world-canvas'));
  const ctx = canvas.getContext('2d');
  const background = document.createElement('canvas');
  const promptButton = /** @type {HTMLButtonElement} */ ($('.world-prompt'));
  const panel = $('.world-panel');
  const panelBody = $('.world-panel-body');
  const toast = $('.world-toast');

  let mapId = mapIdFor(session.state?.data);
  let map = MAPS[mapId];
  const actors = new Map();
  const pressed = new Set();
  const view = { scale: 1, dpr: 1, w: 1, h: 1, x: map.spawn.x, y: map.spawn.y, res: 1 };
  let moveTarget = null; //    punto hacia el que camina ahora (clic en el piso o en un puesto)
  let route = []; //           puntos que siguen después: el camino pasa por las puertas
  let useOnArrival = null; //  id del puesto que se quiere usar al llegar (clic en un puesto)
  let panelOpenedAt = 0; //    cuándo se abrió el panel (para ignorar el clic fantasma de un toque)
  let stuck = 0;
  let lastSent = { at: 0, x: 0, y: 0, moving: false, act: '' };
  let busy = false; //         hay un minijuego abierto
  let liveAct = ''; //         lo que estoy haciendo, para que los demás lo vean ("busy", "burn:0.42:1")
  let near = null; //          { station, actions } del puesto que tengo al alcance
  let choice = 0; //           cuál de las acciones del puesto está elegida
  let holding = null; //       { key, since } mientras se mantiene E en una acción "de mantener"
  let scanAt = 0;
  let pulses = []; //          anillos que se abren al escanear
  let lastStage = null;
  let toastTimer = 0;
  let unmountTool = null;
  let openTools = [];
  let seenResult = false;
  let hudKey = '';

  // ============================================================
  //  Lo que se sabe de la partida ahora mismo
  // ============================================================
  const game = () => {
    const data = session.state?.data;
    const room = session.room;
    if (!data || !room) return null;
    const mission = missionFor(data);
    const stage = mission?.stages[data.stageIndex];
    if (!mission || !stage) return null;
    const flight = data.flight;
    const legs = mission.flightPlan ?? [];
    const players = room.players;
    return {
      data, mission, stage, stageId: stage.id, flight, legs, players,
      leg: flight ? legs[flight.legIndex] : null,
      next: mission.stages[data.stageIndex + 1] ?? null,
      held: ROLES.filter((role) => roleHolder(players, role.id)).map((role) => role.id),
      may: (role) => canActAs(players, session.myId, role),
      me: players.find((p) => p.id === session.myId),
      mine: data.carrying?.[session.myId] ?? null, // lo que llevo en las manos
    };
  };

  /** Los puestos del mapa, más el sitio del Prisma cuando ya se lo ubicó. */
  const stationsNow = (g) => {
    const located = g?.flight?.located;
    if (mapId !== 'moon' || !located || g.flight.prism) return map.stations;
    return [...map.stations, { id: 'site', room: 'surface', kind: 'site', label: 'Sitio del Prisma', x: located.x - 30, y: located.y - 12, w: 60, h: 24, height: 0, flat: true }];
  };
  const stationById = (g, id) => stationsNow(g).find((station) => station.id === id);

  const say = (message) => {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3_200);
  };

  /** Corre un minijuego: mientras dura, el astronauta no camina y los demás ven que está ocupado. */
  const whileBusy = async (run) => {
    busy = true;
    liveAct = 'busy';
    pressed.clear();
    moveTarget = null;
    try {
      return await run();
    } finally {
      busy = false;
      liveAct = '';
    }
  };

  /** Tripulantes conectados que todavía no llegaron junto a un puesto (para abordar). */
  const notAboard = (g, station) => g.players
    .filter((p) => p.connected !== false)
    .filter((p) => { const a = actors.get(p.id); return !a || distanceTo(station, a.x, a.y) > BOARDING_REACH; })
    .map((p) => (p.id === session.myId ? 'tú' : p.name));

  // ============================================================
  //  Qué se puede hacer en cada puesto
  // ============================================================
  const runTask = async (task) => {
    const result = task.kind === 'burnSim'
      ? await whileBusy(() => playBurn({ title: 'Simulador: transferencia a la Luna', how: task.how, target: 3_130, sim: true }))
      : await whileBusy(() => playMinigame(task.kind, { title: task.title, how: task.how, game: task.game }));
    // `quality`: la precisión que midió el minijuego (0 a 1); el servidor la usa para el puntaje.
    const quality = Number.isFinite(result.quality) ? result.quality : Number.isFinite(result.aim) ? result.aim : undefined;
    if (result.ok) sendAction({ ...(task.send ?? { type: 'task:done', id: task.id }), quality });
  };

  const pilotBurn = async (g) => {
    const remaining = Math.max(1, Math.round(g.leg.dv - g.flight.progress));
    const report = (fraction, thrust) => { liveAct = `burn:${Math.min(1.2, fraction).toFixed(2)}:${thrust ? 1 : 0}`; };
    if (g.leg.id === 'descent') {
      const result = await whileBusy(() => playLander({ title: 'Alunizaje en el lado oculto', budget: remaining, onProgress: report }));
      if (result.dv) sendAction({ type: 'flight:burn', dv: result.dv, aim: result.aim, touchdown: result.touchdown });
      return;
    }
    const result = await whileBusy(() => playBurn({ title: `Encendido: ${g.leg.name}`, target: remaining, sigma: g.flight.precision?.sigma ?? 0.015, onProgress: report }));
    if (result.ok) sendAction({ type: 'flight:burn', dv: result.dv, aim: result.aim });
  };

  const scanHere = (g) => {
    const me = actors.get(session.myId);
    if (!me || performance.now() < scanAt) return;
    scanAt = performance.now() + 1_200;
    pulses.push({ x: me.x, y: me.y, born: performance.now() });
    sounds.pick();
    sendAction({ type: 'flight:scan', x: Math.round(me.x), y: Math.round(me.y) });
    if (g.flight.mode === 'saving') say('En modo ahorro el espectrómetro está apagado: Ingeniería lo enciende en el módulo lunar.');
  };

  /**
   * Acciones disponibles en un puesto para este jugador: `{ label, run, blocked?, hold? }`.
   * `blocked` es el motivo por el que todavía no se puede; `hold` pide mantener E.
   */
  const actionsAt = (station, g) => {
    const list = [];
    const add = (text, run, extra = {}) => list.push({ label: text, run, blocked: null, hold: false, ...extra });
    const { data, flight, leg, stageId, mine } = g;
    const stageOrder = g.mission.stages.map((stage) => stage.id);
    const inFlightStage = Boolean(flight) && flight.phase !== 'over' && leg && leg.stage === stageId;

    // ---------- Tareas de la etapa ----------
    for (const task of stageTasks(stageId)) {
      if (isTaskDone(data, task) || !(task.shared || g.may(task.role))) continue;
      const pending = (task.needs ?? []).map(getTask).find((needed) => !isTaskDone(data, needed));
      const blocked = pending ? `Primero: ${pending.title.toLowerCase()}.` : null;
      if (task.kind === 'carry') {
        if (mine?.id === task.id && station.id === task.to) {
          add(task.dropVerb, () => { sounds.good(); sendAction({ type: 'carry:drop', id: task.id }); });
        } else if (station.id === task.from && mine?.id !== task.id) {
          const inHands = Object.values(data.carrying ?? {}).filter((item) => item.id === task.id).length;
          if (taskProgress(data, task) + inHands >= task.count) continue;
          const reason = blocked ?? (mine ? `Ya llevas ${ITEM_NAMES[mine.item] ?? 'algo'} en las manos (X para soltar).` : null)
            ?? (task.id === 'surface.haul' && !flight?.dug ? 'El Prisma sigue enterrado: Ingeniería tiene que perforar.' : null);
          add(task.verb, () => { sounds.pick(); sendAction({ type: 'carry:pick', id: task.id }); }, { blocked: reason });
        }
      } else if (task.at === station.id && task.kind !== 'menu' && task.kind !== 'auto') {
        add(task.verb, () => runTask(task), { blocked });
      }
    }

    switch (station.id) {
      // ---------- Estación ----------
      case 'terminal':
        add('Abrir el mercado', () => openPanel(['market']), { blocked: MARKET_STAGES.includes(stageId) ? null : 'El mercado abre en la etapa Mercado y cierra al despegar.' });
        break;
      case 'assembly':
        add('Abrir el constructor', () => openPanel(MARKET_STAGES.includes(stageId) ? ['builder', 'market'] : ['builder']),
          { blocked: BUILD_STAGES.includes(stageId) ? null : 'El cohete se arma en las etapas Construcción y Validación.' });
        break;
      case 'board':
        add(stageId === 'debrief' ? 'Ver la evaluación de la misión' : 'Ver el tablero de misión', () => openPanel(stageId === 'debrief' ? ['score', 'flight', 'board'] : ['board', 'plan']));
        if (stageId !== 'debrief' && !flight) add('Elegir lugar de alunizaje y órbita', () => openPanel(['plan', 'board']));
        break;
      case 'lever': {
        if (stageId === 'debrief') {
          const hostReason = isHost() ? null : 'Lo decide el anfitrión.';
          add('Rediseñar el cohete y volver a volar', () => { sounds.good(); sendAction({ type: 'mission:retry' }); }, { hold: true, blocked: hostReason });
          add('Volver a la sala de embarque', () => endGame(), { hold: true, blocked: hostReason });
        } else if (stageId === 'validation') {
          add('Pasar de etapa', () => {}, { blocked: 'El despegue se da desde la plataforma de lanzamiento, en el hangar.' });
        } else if (g.next && !flight) {
          const missing = missingTasks(data, stageId, g.held);
          const reason = missing.length ? `Falta: ${roleName(missing[0].role)} · ${missing[0].title.toLowerCase()}${missing.length > 1 ? ` (y ${missing.length - 1} más)` : ''}.` : null;
          add(`Bajar la palanca: empieza ${g.next.name}`, () => { sounds.good(); sendAction({ type: 'stage:advance' }); }, { hold: true, blocked: reason });
        }
        break;
      }
      case 'gate': {
        if (stageId !== 'validation') {
          if (stageOrder.indexOf(stageId) < stageOrder.indexOf('validation')) add('Subir a la nave', () => {}, { blocked: 'La nave todavía no está lista: se despega en la etapa Validación.' });
          break;
        }
        const missing = missingTasks(data, stageId, g.held);
        const absent = notAboard(g, station);
        const reason = !g.may('pilot') ? 'El despegue lo da Vuelo. Quédate junto a la plataforma para abordar.'
          : missing.length ? `Falta: ${roleName(missing[0].role)} · ${missing[0].title.toLowerCase()}${missing.length > 1 ? ` (y ${missing.length - 1} más)` : ''}.`
            : absent.length ? `Faltan a bordo: ${absent.join(', ')}. Tienen que acercarse a la plataforma.` : null;
        add('¡Despegar!', () => { sounds.launch(); sendAction({ type: 'stage:advance' }); }, { hold: true, blocked: reason });
        break;
      }

      // ---------- A bordo ----------
      case 'helm': {
        if (!inFlightStage) break;
        const reason = !g.may('pilot') ? 'El timón es de Vuelo.' : flight.phase === 'emergency' ? 'Primero hay que resolver la emergencia.' : null;
        if (leg.dv > 0) add(leg.id === 'descent' ? 'Tomar los mandos: alunizar' : `Tomar los mandos: ${leg.name.toLowerCase()}`, () => pilotBurn(g), { blocked: reason });
        else {
          add('Tomar los mandos: reentrada', async () => {
            const result = await whileBusy(() => playMinigame('dial', { title: 'Reentrada', how: 'Mantén el ángulo de entrada en la zona verde: muy empinado quema la cápsula, muy plano la hace rebotar.', game: { speed: 1.2, arc: 0.32 } }));
            if (result.ok) sendAction({ type: 'flight:proceed', quality: result.quality });
          }, { blocked: reason });
        }
        break;
      }
      case 'startracker':
      case 'trim': {
        const kind = station.id === 'trim' ? 'trim' : 'nav';
        const prep = PREP[kind];
        if (!inFlightStage || !g.may(prep.role) || leg.dv === 0) break;
        const reason = flight.phase !== 'ready' ? 'Primero hay que resolver la emergencia.' : flight.prep?.[kind] ? 'Eso ya está listo para el próximo encendido.' : null;
        add(prep.verb, async () => {
          const result = await whileBusy(() => playMinigame(prep.kind, { title: prep.title, how: prep.how }));
          if (result.ok) sendAction({ type: 'flight:prep', kind, quality: result.quality });
        }, { blocked: reason });
        break;
      }
      case 'loose':
      case 'racks': {
        const job = JOBS.cargo;
        if (!inFlightStage || leg.dv === 0) break;
        if (station.id === 'racks' && mine?.id === 'cargo') add(job.dropVerb, () => { sounds.good(); sendAction({ type: 'carry:drop', id: 'cargo' }); });
        if (station.id === 'loose' && mine?.id !== 'cargo') {
          const reason = flight.phase !== 'ready' ? 'Ahora no se puede mover la carga.' : flight.prep?.cargo ? 'La carga ya está asegurada para este encendido.' : mine ? 'Ya llevas algo en las manos (X para soltar).' : null;
          add(job.verb, () => { sounds.pick(); sendAction({ type: 'carry:pick', id: 'cargo' }); }, { blocked: reason });
        }
        break;
      }
      case 'telemetry':
        add('Ver la telemetría', () => openPanel(['flight']));
        break;
      case 'solar':
        break;
      default:
    }

    if (flight && flight.phase !== 'over') {
      // ---------- Energía: el tablero de la nave o, en la Luna, el módulo ----------
      if ((station.id === 'breaker' || (mapId === 'moon' && station.id === 'hatch')) && g.may('engineer')) {
        const saving = flight.mode === 'saving';
        add(saving ? 'Volver a energía normal' : 'Pasar a modo ahorro (apaga los instrumentos)', () => { sounds.pick(); sendAction({ type: 'flight:power', mode: saving ? 'normal' : 'saving' }); });
      }
      // ---------- En la Luna: abordar y despegar ----------
      if (mapId === 'moon' && station.id === 'hatch' && leg?.id === 'surface' && flight.phase === 'ready' && g.may('pilot')) {
        const absent = notAboard(g, station);
        const reason = !flight.prism ? 'Todavía falta el Prisma: sin él la misión no se cumple.' : absent.length ? `Faltan a bordo: ${absent.join(', ')}.` : null;
        add('Todos a bordo: despegar de la Luna', () => sendAction({ type: 'flight:proceed' }), { hold: true, blocked: reason });
      }
      // ---------- Emergencias: el repuesto, la reparación y la salida alternativa ----------
      const emergency = flight.emergency;
      if (emergency) {
        const voted = (id, role) => (emergency.votes[id] ?? []).includes(role);
        const repair = emergency.options.find((option) => option.id === 'repair');
        const other = emergency.options.find((option) => option.id !== 'repair');
        if (repair) {
          if (station.id === SPARE_STATION[mapId]?.(emergency.kind) && g.may('merchant') && !voted('repair', 'merchant') && mine?.id !== 'spare') {
            const reason = repair.cost > data.economy.credits ? `El repuesto cuesta ${credits(repair.cost)} y quedan ${credits(data.economy.credits)}.` : mine ? 'Ya llevas algo en las manos (X para soltar).' : null;
            add(`Sacar el repuesto (${credits(repair.cost)})`, () => { sounds.pick(); sendAction({ type: 'carry:pick', id: 'spare' }); }, { blocked: reason });
          }
          if (station.id === FAULT_STATION[mapId]?.[emergency.kind]) {
            if (mine?.id === 'spare') add('Entregar el repuesto', () => { sounds.good(); sendAction({ type: 'flight:resolve', option: 'repair', role: 'merchant' }); });
            if (g.may('engineer') && !voted('repair', 'engineer')) {
              add(`Reparar: ${emergency.title.toLowerCase()}`, async () => {
                const result = await whileBusy(() => playMinigame('wires', { title: `Reparar: ${emergency.title}`, how: 'Vuelve a conectar cada cable con su enchufe.', game: { count: 5 } }));
                if (result.ok) sendAction({ type: 'flight:resolve', option: 'repair', role: 'engineer', quality: result.quality });
              }, { blocked: voted('repair', 'merchant') ? null : 'Falta el repuesto: Comercio lo trae y lo entrega aquí.' });
            }
          }
        }
        if (other && station.id === (mapId === 'moon' ? 'hatch' : 'helm')) {
          for (const role of other.needs) {
            if (g.may(role) && !voted(other.id, role)) add(`${other.label} (sin reparar)`, () => sendAction({ type: 'flight:resolve', option: other.id, role }), { hold: true });
          }
        }
      }
    }
    // Lo que se puede hacer va primero; lo bloqueado queda como aviso.
    return [...list.filter((action) => !action.blocked), ...list.filter((action) => action.blocked)];
  };

  /** En la Luna, Ciencia escanea donde esté parada (sin puesto). */
  const freeAction = (g) => {
    const { flight, leg } = g;
    if (mapId !== 'moon' || !flight || leg?.id !== 'surface' || flight.located || flight.prism || !g.may('scientist')) return null;
    const blocked = flight.phase !== 'ready' ? 'Primero hay que resolver la emergencia.' : null;
    return { label: 'Escanear aquí (gasta batería)', run: () => scanHere(g), blocked, hold: false };
  };

  // ============================================================
  //  Qué le toca a cada rol (la lista de tareas y los marcadores)
  // ============================================================
  const objectives = (g) => {
    const list = [];
    const push = (role, text, where, extra = {}) => list.push({ role, text, where, done: false, tag: '', ...extra });
    const { data, flight, leg, stageId, mine } = g;
    const whereOf = (task) => (task.kind === 'carry' ? (mine?.id === task.id ? task.to : task.from) : task.at ?? null);
    const taskLines = () => {
      for (const task of stageTasks(stageId)) {
        const progress = task.kind === 'carry' && task.count > 1 ? ` (${taskProgress(data, task)}/${task.count})` : '';
        push(task.role, task.title + progress, whereOf(task), { done: isTaskDone(data, task), tag: g.held.includes(task.role) ? '' : 'opcional', shared: Boolean(task.shared) });
      }
    };

    if (stageId === 'debrief') {
      push(null, 'Ver la evaluación en el tablero de misión', 'board');
      push(null, isHost() ? 'Cuando quieran: palanca para volver a la sala de embarque' : 'El anfitrión los lleva de vuelta con la palanca', 'lever');
      return list;
    }
    if (mapId === 'station') {
      taskLines();
      // La decisión del plan (lugar y órbita): no frena la etapa, pero conviene tomarla antes de armar.
      if (['planning', 'market', 'build'].includes(stageId)) {
        const decided = Boolean(data.plan?.decided);
        const role = g.held.includes('pilot') || !g.held.includes('scientist') ? 'pilot' : 'scientist';
        push(role, 'Decidir el lugar de alunizaje y la órbita (tablero de misión)', 'board', { done: decided, tag: 'decisión' });
      }
      if (missingTasks(data, stageId, g.held).length === 0) {
        if (stageId === 'validation') push('pilot', 'Todos a la plataforma: Vuelo da el despegue', 'gate', { step: true });
        else push(null, 'Listo: bajen la palanca de etapa en la sala de misión', 'lever', { step: true });
      }
      return list;
    }
    if (!flight) return list;
    const emergency = flight.emergency;
    if (emergency) {
      const repair = emergency.options.find((option) => option.id === 'repair');
      const other = emergency.options.find((option) => option.id !== 'repair');
      const voted = (role) => (emergency.votes.repair ?? []).includes(role);
      if (repair) {
        const fault = FAULT_STATION[mapId]?.[emergency.kind];
        push('merchant', `Emergencia: llevar el repuesto a la avería (${credits(repair.cost)})`, voted('merchant') ? null : Object.values(data.carrying ?? {}).some((item) => item.id === 'spare') ? fault : SPARE_STATION[mapId]?.(emergency.kind), { done: voted('merchant'), alert: true });
        push('engineer', `Emergencia: reparar · ${emergency.title.toLowerCase()}`, fault, { done: voted('engineer'), alert: true });
      }
      if (other) for (const role of other.needs) push(role, `O bien: ${other.label.toLowerCase()}`, mapId === 'moon' ? 'hatch' : 'helm', { tag: 'alternativa' });
      return list;
    }
    if (mapId === 'moon') {
      taskLines();
      if (flight.prism) push('pilot', 'Todos al módulo lunar: despegar', 'hatch', { step: true });
      return list;
    }
    // A bordo
    if (leg && leg.stage === stageId) {
      if (leg.dv > 0) {
        push('pilot', leg.id === 'descent' ? 'Alunizar a mano en el lado oculto' : `Pilotear el encendido: ${leg.name.toLowerCase()}`, 'helm');
        push('scientist', `${PREP.nav.title} (${PREP.nav.gain})`, 'startracker', { done: Boolean(flight.prep?.nav), tag: 'mejora' });
        push('engineer', `${PREP.trim.title} (${PREP.trim.gain})`, 'trim', { done: Boolean(flight.prep?.trim), tag: 'mejora' });
        push('merchant', `${PREP.cargo.title} (${data.jobs?.cargo ?? 0}/${JOBS.cargo.count}; ${PREP.cargo.gain})`, mine?.id === 'cargo' ? 'racks' : 'loose', { done: Boolean(flight.prep?.cargo), tag: 'mejora', shared: true });
      } else {
        push('pilot', 'Reentrada: mantener el ángulo de entrada', 'helm');
      }
    }
    return list;
  };

  /** Las tareas que me tocan a mí: las de mi rol, los pasos de todos y las de los puestos sin tripulante. */
  const myObjectives = (g, list = objectives(g)) => {
    const myRole = g.me?.role;
    const own = list.filter((entry) => entry.role === null || entry.role === myRole);
    const free = list.filter((entry) => entry.role !== null && entry.role !== myRole && !g.held.includes(entry.role));
    const shared = list.filter((entry) => entry.shared && entry.role !== myRole && g.held.includes(entry.role));
    return { own, free, shared };
  };

  /** A dónde conviene ir ahora: el puesto de mi primera tarea pendiente. */
  const guideStation = (g) => {
    const { own, free } = myObjectives(g);
    const pick = (entries) => entries.find((entry) => !entry.done && entry.where && entry.tag !== 'alternativa' && entry.tag !== 'mejora')
      ?? entries.find((entry) => !entry.done && entry.where && entry.tag !== 'alternativa');
    const entry = pick(own) ?? pick(free);
    return entry ? stationById(g, entry.where) ?? null : null;
  };

  // ============================================================
  //  Paneles: mercado, constructor, telemetría y tablero de misión
  // ============================================================
  const mountBoard = (box) => {
    const render = () => {
      const g = game();
      if (!g) return;
      const track = el('ol', 'stage-track');
      g.mission.stages.forEach((stage, index) => {
        const item = el('li', index < g.data.stageIndex ? 'done' : index === g.data.stageIndex ? 'current' : '');
        item.append(el('span', 'stage-dot', index < g.data.stageIndex ? '✓' : String(index + 1)), el('span', 'stage-label', stage.name));
        track.append(item);
      });
      const head = el('div', 'board-head');
      head.append(el('h3', '', g.stage.name), el('p', '', g.stage.summary));
      const roles = el('div', 'board-roles');
      const list = objectives(g);
      for (const role of ROLES) {
        const holder = roleHolder(g.players, role.id);
        const card = el('article', 'board-role');
        const title = el('h4');
        const dot = el('i');
        dot.style.background = holder ? colorHex(holder.color) : 'transparent';
        title.append(dot, `${role.name} · ${holder ? (holder.id === session.myId ? 'tú' : holder.name) : 'puesto libre: lo cubre cualquiera'}`);
        const items = el('ul');
        const mine = list.filter((entry) => entry.role === role.id);
        for (const entry of mine) items.append(el('li', entry.done ? 'done' : '', `${entry.done ? '✓' : '○'} ${entry.text}${entry.tag ? ` · ${entry.tag}` : ''}`));
        if (mine.length === 0) items.append(el('li', 'done', 'Sin tareas en este momento.'));
        card.append(title, items);
        roles.append(card);
      }
      const perks = Object.keys(g.data.perks ?? {});
      const earned = el('div', 'board-perks');
      earned.append(el('h4', '', 'Ventajas ganadas para el vuelo'));
      const perkList = el('ul');
      if (perks.length === 0) perkList.append(el('li', '', 'Todavía ninguna. Algunas tareas de la estación dejan ventajas reales para el viaje.'));
      for (const perk of perks) perkList.append(el('li', 'done', `★ ${PERKS[perk] ?? perk}`));
      earned.append(perkList);
      box.replaceChildren(track, head, roles, earned);
    };
    box.classList.add('board');
    render();
    const offs = [on('state', render), on('room', render)];
    return () => { box.classList.remove('board'); offs.forEach((off) => off()); };
  };

  const TOOLS = {
    market: { name: 'Mercado', mount: mountMarket },
    builder: { name: 'Constructor', mount: mountBuilder },
    score: { name: 'Resultados', mount: mountScore },
    flight: { name: 'Informe del vuelo', mount: (box) => mountFlight(box, { readOnly: true }) },
    board: { name: 'Tablero de misión', mount: mountBoard },
    plan: { name: 'Plan de la misión', mount: mountPlan },
  };

  const showTool = (name) => {
    unmountTool?.();
    panelBody.replaceChildren();
    panelBody.scrollTop = 0;
    $('.world-panel-bar h2').textContent = TOOLS[name].name;
    unmountTool = TOOLS[name].mount(panelBody);
    for (const tab of $('.world-panel-tabs').children) tab.setAttribute('aria-selected', String(/** @type {HTMLElement} */ (tab).dataset.tool === name));
  };
  const closePanel = () => {
    if (panel.hidden) return;
    unmountTool?.();
    unmountTool = null;
    openTools = [];
    panelBody.replaceChildren();
    panel.hidden = true;
    canvas.focus?.();
  };
  const openPanel = (names) => {
    panelOpenedAt = performance.now();
    openTools = names;
    pressed.clear();
    moveTarget = null;
    const tabs = $('.world-panel-tabs');
    tabs.hidden = names.length < 2;
    tabs.replaceChildren(...names.map((name) => {
      const tab = el('button', '', TOOLS[name].name);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.dataset.tool = name;
      tab.addEventListener('click', () => showTool(name));
      return tab;
    }));
    panel.hidden = false;
    showTool(names[0]);
  };
  const blocking = () => busy || !panel.hidden || Boolean(document.querySelector('.minigame, .cine-shot, .role-reveal, .tut-library, .settings-screen, .credits-screen'));

  // ============================================================
  //  Tripulantes
  // ============================================================
  const startAt = (player, index) => (player.map === mapId ? { x: player.x, y: player.y } : spawnFor(map, index));
  const syncActors = (fresh) => {
    const players = session.room.players;
    const ids = new Set(players.map((p) => p.id));
    for (const id of actors.keys()) if (!ids.has(id)) actors.delete(id);
    players.forEach((player, index) => {
      if (actors.has(player.id) && !fresh) return;
      const at = startAt(player, index);
      actors.set(player.id, { id: player.id, x: at.x, y: at.y, tx: at.x, ty: at.y, facing: player.facing ?? 1, moving: false, walkTime: 0, lastMoveAt: 0, act: '', bubble: null });
    });
  };

  const sendMine = (force = false) => {
    const me = actors.get(session.myId);
    if (!me) return;
    const now = performance.now();
    const changed = Math.abs(me.x - lastSent.x) > 0.5 || Math.abs(me.y - lastSent.y) > 0.5 || me.moving !== lastSent.moving || liveAct !== lastSent.act;
    if (!force && (!changed || now - lastSent.at < SEND_INTERVAL_MS)) return;
    sendMove({ x: me.x, y: me.y, facing: me.facing, moving: me.moving, map: mapId, act: liveAct });
    lastSent = { at: now, x: me.x, y: me.y, moving: me.moving, act: liveAct };
  };

  /** Entra a un mapa nuevo: fondo, cámara y todos a su lugar de aparición. */
  const enterMap = (id, announce) => {
    mapId = id;
    map = MAPS[id];
    closePanel();
    moveTarget = null;
    route = [];
    useOnArrival = null;
    pulses = [];
    syncActors(true);
    const me = actors.get(session.myId);
    if (me) { view.x = me.x; view.y = me.y; }
    paintBackground();
    sendMine(true);
    if (announce) {
      const fade = $('.world-fade');
      fade.querySelector('p').textContent = map.name;
      fade.hidden = false;
      fade.classList.remove('playing');
      void fade.offsetWidth;
      fade.classList.add('playing');
      window.setTimeout(() => { fade.hidden = true; }, 1_300);
    }
  };

  // ============================================================
  //  Tamaño, cámara y fondo
  // ============================================================
  const paintBackground = () => {
    view.res = Math.min(1.5, Math.max(0.75, view.scale * view.dpr));
    background.width = Math.round(map.width * view.res);
    background.height = Math.round(map.height * view.res);
    const g = background.getContext('2d');
    g.setTransform(view.res, 0, 0, view.res, 0, 0);
    paintMap(g, map);
  };
  const resize = () => {
    view.dpr = canvasDpr(2);
    view.w = Math.max(1, canvas.clientWidth);
    view.h = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    // Se ven unas 1000 × 620 unidades de mundo, como en el lobby.
    // El acercamiento de Opciones multiplica la escala (más grande = se ve menos mundo).
    view.scale = Math.min(1.9, Math.max(0.5, Math.max(view.w / 1260, view.h / 770))) * getSettings().cameraZoom;
    paintBackground();
  };
  const cameraTarget = (me) => {
    const halfW = view.w / view.scale / 2, halfH = view.h / view.scale / 2;
    const fit = (value, half, size) => (size <= half * 2 ? size / 2 : Math.min(size - half, Math.max(half, value)));
    return { x: fit(me.x, halfW, map.width), y: fit(me.y - 40, halfH, map.height) };
  };
  const toWorld = (clientX, clientY) => {
    const box = canvas.getBoundingClientRect();
    return { x: (clientX - box.left - view.w / 2) / view.scale + view.x, y: (clientY - box.top - view.h / 2) / view.scale + view.y };
  };
  const toScreen = (x, y) => ({ x: (x - view.x) * view.scale + view.w / 2, y: (y - view.y) * view.scale + view.h / 2 });

  // ============================================================
  //  Movimiento
  // ============================================================
  const speedNow = (g) => {
    const carried = g?.mine;
    return WORLD_SPEED * (session.room.settings.playerSpeed ?? 1) * getSettings().walkSpeed * (carried?.item === 'prism' ? PRISM_SPEED : carried ? CARRY_SPEED : 1);
  };

  const updateMe = (dt, g) => {
    const me = actors.get(session.myId);
    if (!me) return;
    let dx = 0, dy = 0;
    if (!blocking() && !isTyping()) {
      for (const code of pressed) {
        const dir = KEY_DIRECTIONS[code];
        if (dir) { dx += dir[0]; dy += dir[1]; }
      }
    }
    if (dx || dy) { moveTarget = null; route = []; useOnArrival = null; }
    if (!dx && !dy && moveTarget && !blocking()) {
      const tx = moveTarget.x - me.x, ty = moveTarget.y - me.y;
      const distance = Math.hypot(tx, ty);
      if (distance < (route.length > 0 ? 14 : 5)) moveTarget = route.shift() ?? null;
      else { dx = tx / distance; dy = ty / distance; }
    }
    const length = Math.hypot(dx, dy);
    me.moving = length > 0;
    if (me.moving) {
      const step = speedNow(g) * dt;
      const before = { x: me.x, y: me.y };
      const nextX = me.x + (dx / length) * step;
      if (canStand(map, nextX, me.y)) me.x = nextX;
      const nextY = me.y + (dy / length) * step;
      if (canStand(map, me.x, nextY)) me.y = nextY;
      if (me.x === before.x && me.y === before.y) {
        // Trabado contra algo: caminando hacia un clic, prueba rodearlo; si no hay caso, se detiene.
        stuck += dt;
        if (moveTarget && stuck < 1.2) {
          const angle = Math.atan2(dy, dx);
          for (const turn of [1, -1, 2, -2, 3, -3]) {
            const x = me.x + Math.cos(angle + turn * Math.PI / 4) * step, y = me.y + Math.sin(angle + turn * Math.PI / 4) * step;
            if (canStand(map, x, y)) { me.x = x; me.y = y; break; }
          }
        } else if (moveTarget) {
          moveTarget = null;
          route = [];
        }
      } else {
        stuck = 0;
      }
      const movedX = me.x - before.x;
      if (Math.abs(movedX) > 0.01) me.facing = movedX > 0 ? 1 : -1;
      me.walkTime += dt;
    }
    me.act = liveAct;
    sendMine();
  };

  const updateOthers = (dt) => {
    const now = performance.now();
    const follow = 1 - Math.exp(-dt * 12);
    for (const actor of actors.values()) {
      if (actor.id === session.myId) continue;
      if (Math.hypot(actor.tx - actor.x, actor.ty - actor.y) > 260) { actor.x = actor.tx; actor.y = actor.ty; }
      actor.x += (actor.tx - actor.x) * follow;
      actor.y += (actor.ty - actor.y) * follow;
      if (now - actor.lastMoveAt > 250) actor.moving = false;
      if (actor.moving) actor.walkTime += dt;
    }
  };

  /** Camina hasta un punto, pasando por las puertas que haga falta. */
  const walkTo = (point) => {
    const me = actors.get(session.myId);
    if (!me) return;
    route = findPath(map, me, point);
    moveTarget = route.shift() ?? null;
    stuck = 0;
  };

  /** El puesto al alcance (el más cercano) y lo que ofrece. */
  const updateNear = (g) => {
    const me = actors.get(session.myId);
    if (!me || !g) { near = null; return; }
    let best = null;
    for (const station of stationsNow(g)) {
      if (station.decor) continue;
      const distance = distanceTo(station, me.x, me.y);
      if (distance <= REACH && (!best || distance < best.distance)) best = { station, distance };
    }
    const actions = best ? actionsAt(best.station, g) : [];
    const free = freeAction(g);
    const key = best?.station.id ?? (free ? 'free' : null);
    if (key !== (near?.key ?? null)) { choice = 0; holding = null; }
    if (best && actions.length > 0) near = { key, station: best.station, actions };
    else if (free) near = { key: 'free', station: null, actions: [free] };
    else near = best ? { key, station: best.station, actions: [] } : null;
    if (near && choice >= near.actions.length) choice = 0;

    // Llegó al puesto que había elegido con un clic: lo usa.
    if (useOnArrival && near?.station?.id === useOnArrival && !blocking()) {
      useOnArrival = null;
      moveTarget = null;
      route = [];
      const action = near.actions[choice];
      if (action && !action.hold) use(action);
    }
  };

  const use = (action) => {
    if (!action || blocking()) return;
    if (action.blocked) return say(action.blocked);
    action.run();
  };

  const updateHold = () => {
    const action = near?.actions[choice];
    if (!holding) return;
    if (!action || !action.hold || action.blocked || blocking()) { holding = null; return; }
    if (performance.now() - holding.since >= HOLD_MS) {
      holding = null;
      action.run();
    }
  };

  // ============================================================
  //  HUD (DOM encima del lienzo)
  // ============================================================
  // El panel de tareas se pliega con su botón; el estado se recuerda en esta pestaña (sessionStorage).
  const OBJECTIVES_KEY = 'adastra.objectivesCollapsed';
  let objectivesCollapsed = (() => {
    try { return sessionStorage.getItem(OBJECTIVES_KEY) === '1'; } catch { return false; }
  })();
  const setObjectivesCollapsed = (collapsed) => {
    objectivesCollapsed = collapsed;
    try { sessionStorage.setItem(OBJECTIVES_KEY, collapsed ? '1' : '0'); } catch { /* sin almacenamiento */ }
    const g = game();
    if (g) renderObjectives(g);
  };

  const renderObjectives = (g) => {
    const box = $('.world-objectives');
    const { own, free, shared } = myObjectives(g);
    const myRole = g.me?.role;
    const pending = own.filter((entry) => !entry.done);
    const alerts = [...own, ...free].filter((entry) => entry.alert && !entry.done);
    // Encabezado: etapa, resumen (se ve también plegado) y el botón de plegar.
    const head = el('header');
    const titles = el('div', 'objectives-titles');
    titles.append(el('span', 'kicker', `Etapa ${g.data.stageIndex + 1} de ${g.mission.stages.length}`), el('strong', '', g.stage.name));
    const summary = el('p', `objectives-summary${alerts.length ? ' alert' : ''}`,
      alerts.length ? `! ${alerts[0].text}` : pending.length ? `${pending.length} ${pending.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}: ${pending[0].text}` : '✓ Tus tareas de esta etapa están hechas');
    const toggle = el('button', 'objectives-toggle', objectivesCollapsed ? '▸' : '▾');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(!objectivesCollapsed));
    toggle.setAttribute('aria-label', objectivesCollapsed ? 'Mostrar las tareas' : 'Plegar las tareas');
    toggle.title = objectivesCollapsed ? 'Mostrar las tareas' : 'Plegar las tareas';
    head.append(titles, toggle, summary);
    const line = (entry) => {
      const item = el('li', `${entry.done ? 'done' : ''}${entry.alert ? ' alert' : ''}${entry.step ? ' step' : ''}${entry.tag === 'opcional' ? ' extra' : ''}`);
      item.append(el('i', '', entry.done ? '✓' : entry.alert ? '!' : '○'), el('span', '', entry.text));
      if (entry.tag) item.append(el('em', '', entry.tag));
      if (entry.role && entry.role !== myRole) item.prepend(el('b', '', roleName(entry.role)));
      return item;
    };
    // `extra`: lo opcional, que en pantallas angostas se esconde para no tapar el mundo.
    const block = (title, entries, extra = entries.every((entry) => entry.tag === 'opcional')) => {
      if (entries.length === 0) return [];
      const list = el('ul', extra ? 'extra' : '');
      list.append(...entries.map(line));
      return [el('h3', extra ? 'extra' : '', title), list];
    };
    const role = ROLES.find((r) => r.id === myRole);
    // El cuerpo se abre y se cierra con una transición de altura (grid de 0fr a 1fr, ver css).
    const body = el('div', 'objectives-body');
    const inner = el('div', 'objectives-inner');
    inner.append(
      ...block(role ? `Tu rol: ${role.name}` : 'Tu tarea', own),
      ...(own.length === 0 ? [el('p', 'empty', 'Por ahora no tienes tareas: ayuda a tu equipo.')] : []),
      ...block('Puestos libres (los cubre cualquiera)', free),
      ...block('Puedes ayudar', shared.filter((entry) => !entry.done), true),
    );
    body.append(inner);
    box.classList.toggle('collapsed', objectivesCollapsed);
    box.replaceChildren(head, body);
    box.style.setProperty('--role-ink', ROLE_INK[myRole] ?? INK.gold);
  };

  const ACT_TEXT = { busy: 'trabajando…', burn: 'pilotando…' };
  const renderTeam = (g) => {
    const list = objectives(g);
    $('.world-team').replaceChildren(...ROLES.map((role) => {
      const holder = roleHolder(g.players, role.id);
      const away = g.players.find((p) => p.role === role.id && p.connected === false);
      const entries = list.filter((entry) => entry.role === role.id && entry.tag !== 'alternativa');
      const done = entries.filter((entry) => entry.done).length;
      const act = holder ? (actors.get(holder.id)?.act ?? '').split(':')[0] : '';
      const chip = el('div', `crew-chip${entries.length > 0 && done === entries.length ? ' done' : ''}`);
      const dot = el('i');
      dot.style.background = holder ? colorHex(holder.color) : 'transparent';
      const who = holder ? (holder.id === session.myId ? 'Tú' : holder.name) : away ? `${away.name} · sin conexión` : 'libre';
      const status = ACT_TEXT[act] ?? (entries.length ? `${done}/${entries.length}` : '—');
      chip.append(dot, el('strong', '', role.name), el('span', '', `${who} · ${status}`));
      return chip;
    }));
  };

  const renderFlight = (g) => {
    const box = $('.world-flight');
    const { flight, leg, legs, data } = g;
    box.hidden = !flight || flight.phase === 'over' || mapId === 'station';
    if (box.hidden) return;
    const t = flight.telemetry;
    const left = legs.slice(flight.legIndex).reduce((total, each, i) => total + (i === 0 ? Math.max(0, each.dv - flight.progress) : each.dv), 0);
    const tone = t.deltaVLeft < left ? 'bad' : t.deltaVLeft < left * 1.03 ? 'warn' : 'good';
    const parts = [];
    const head = el('header');
    head.append(el('span', 'kicker', `Tramo ${Math.min(flight.legIndex + 1, legs.length)} de ${legs.length}`), el('strong', '', leg?.name ?? ''));
    parts.push(head);
    if (leg?.dv > 0) {
      const bar = el('div', 'flight-bar gold');
      const fill = el('i');
      fill.style.width = `${Math.min(100, (flight.progress / leg.dv) * 100)}%`;
      const live = el('u');
      live.className = 'live-burn';
      bar.append(fill, live);
      parts.push(el('p', 'line', `Δv del tramo: ${number(flight.progress)} de ${number(leg.dv)} m/s`), bar);
      const prep = el('p', 'prep');
      for (const [kind, name] of [['nav', 'Posición'], ['trim', 'Motores'], ['cargo', 'Carga']]) prep.append(el('span', flight.prep?.[kind] ? 'on' : '', `${flight.prep?.[kind] ? '✓' : '○'} ${name}`));
      parts.push(prep);
    }
    if (leg?.id === 'surface') {
      parts.push(el('p', 'line', flight.prism ? 'El Prisma está a bordo.' : flight.dug ? 'Prisma a la vista: hay que cargarlo.' : flight.located ? 'Prisma ubicado: falta perforar.' : `Escaneos: ${flight.scans}. Cada círculo dice a qué distancia está.`));
    }
    const stats = el('dl');
    const stat = (name, value, className = '') => { const row = el('div', className); row.append(el('dt', '', name), el('dd', '', value)); stats.append(row); };
    stat('Δv en tanques', `${number(t.deltaVLeft)} m/s`, `tone-${tone}`);
    stat('Δv que falta', `${number(left)} m/s`);
    stat('Batería', `${Math.round((t.energy / Math.max(1, t.energyCapacity)) * 100)} %${flight.mode === 'saving' ? ' · ahorro' : ''}`, t.energy < t.energyCapacity * 0.25 ? 'tone-warn' : '');
    stat('Señal', flight.signal ? 'Sí' : 'No', flight.signal ? '' : 'tone-warn');
    stat('Créditos', credits(data.economy.credits));
    parts.push(stats);
    if (flight.emergency) {
      const alert = el('div', 'emergency');
      alert.append(el('strong', '', `⚠ ${flight.emergency.title}`), el('p', '', flight.emergency.text));
      parts.push(alert);
    } else if (flight.events.length) {
      const last = flight.events.at(-1);
      parts.push(el('p', `event tone-${last.tone}`, last.text));
    }
    box.replaceChildren(...parts);
  };

  const renderLog = (g) => {
    const lines = [...g.data.log].reverse();
    $('.world-log ol').replaceChildren(...lines.map((text) => el('li', '', text)));
  };

  const renderHud = () => {
    const g = game();
    if (!g) return;
    renderObjectives(g);
    renderTeam(g);
    renderFlight(g);
    renderLog(g);
  };

  const renderPrompt = (g) => {
    const action = near?.actions[choice];
    const carry = $('.world-carry');
    const mine = g?.mine;
    carry.hidden = !mine;
    if (mine) {
      const job = JOBS[mine.id] ?? getTask(mine.id);
      const to = mine.id === 'spare' ? FAULT_STATION[mapId]?.[g.flight?.emergency?.kind] : job?.to;
      const target = to ? stationById(g, to) : null;
      carry.textContent = `Llevas ${ITEM_NAMES[mine.item] ?? 'algo'}${target ? ` → ${target.label}` : ''} · X para soltar`;
    }
    promptButton.hidden = !action || blocking();
    if (promptButton.hidden) return;
    const more = near.actions.length > 1 ? ` · Q cambia (${choice + 1}/${near.actions.length})` : '';
    const text = action.blocked ? action.blocked : `${action.hold ? 'Mantén E' : 'E'} · ${action.label}${more}`;
    if (promptButton.dataset.text !== text) {
      promptButton.dataset.text = text;
      promptButton.textContent = text;
    }
    promptButton.classList.toggle('blocked', Boolean(action.blocked));
    promptButton.style.setProperty('--hold', holding ? String(Math.min(1, (performance.now() - holding.since) / HOLD_MS)) : '0');
  };

  // ============================================================
  //  Dibujo
  // ============================================================
  const stationState = (station, g) => {
    const { data, flight, stageId } = g;
    const progress = (id) => taskProgress(data, getTask(id));
    switch (station.id) {
      case 'board': {
        const list = objectives(g);
        return {
          title: g.stage.name,
          rows: ROLES.map((role) => {
            const entries = list.filter((entry) => entry.role === role.id && entry.tag !== 'alternativa');
            const holder = roleHolder(g.players, role.id);
            return { name: role.name, color: holder ? colorHex(holder.color) : withAlpha(INK.paper, 0.4), done: entries.filter((e) => e.done).length, total: Math.min(4, entries.length) };
          }),
        };
      }
      case 'lever': return { ready: stageId === 'debrief' ? isHost() : Boolean(g.next) && !flight && stageId !== 'validation' && missingTasks(data, stageId, g.held).length === 0 };
      case 'gate': return { rocket: data.rocket, launching: false };
      case 'scale': return { count: Math.max(0, progress('planning.stock') - progress('validation.cargo')) };
      case 'partsRack': return { count: progress('build.deliver') };
      case 'cargoHatch': return { count: progress('validation.cargo') + progress('build.instruments') + progress('validation.container') };
      case 'breaker': return { on: flight?.mode !== 'saving' };
      case 'engineBay': return { firing: burning() > 0 };
      case 'antenna': return { broken: flight?.emergency?.kind === 'antenna' || flight?.signal === false };
      case 'cart': return { broken: flight?.emergency?.kind === 'scanner' };
      case 'hatch': return { prism: Boolean(flight?.prism) };
      case 'solar': return { deployed: Boolean(flight?.solar) };
      case 'site': return { dug: Boolean(flight?.dug), taken: Object.values(data.carrying ?? {}).some((item) => item.item === 'prism') };
      default: return {};
    }
  };

  /** Empuje del piloto en este momento (0 si nadie está encendiendo motores), para sacudir la nave. */
  const burning = () => {
    for (const actor of actors.values()) {
      const [kind, , thrust] = (actor.act ?? '').split(':');
      if (kind === 'burn' && thrust === '1') return 1;
    }
    return 0;
  };
  const liveBurn = () => {
    for (const actor of actors.values()) {
      const [kind, fraction] = (actor.act ?? '').split(':');
      if (kind === 'burn') return Number(fraction) || 0;
    }
    return null;
  };

  const drawActor = (actor, g, time) => {
    const player = g.players.find((p) => p.id === actor.id);
    if (!player) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.ellipse(actor.x, actor.y, 21, 6.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = halftone(ctx, INK.navy, 0.55, 2.6);
    ctx.fill();
    ctx.restore();
    const frame = actor.moving ? Math.floor(actor.walkTime * WALK_FPS) % FRAME_COUNT : IDLE_FRAME;
    drawAstronaut(ctx, { x: actor.x, y: actor.y, color: player.color, hat: player.hat, role: player.role, seed: player.id, walkTime: actor.moving ? actor.walkTime : null, facing: actor.facing, frame, scale: SPRITE_SCALE, alpha: player.connected === false ? 0.45 : 1 });
    const held = g.data.carrying?.[actor.id];
    if (held) drawItem(ctx, held.item, actor.x + actor.facing * 22, actor.y - 40 + (actor.moving ? Math.sin(actor.walkTime * 12) * 2 : 0), time);
  };

  const drawActorLabels = (actor, g, now) => {
    const player = g.players.find((p) => p.id === actor.id);
    if (!player) return;
    const top = actor.y - 170 * SPRITE_SCALE - (player.role ? 30 : 15);
    const name = player.id === session.room.hostId ? `★ ${player.name}` : player.name;
    ctx.font = `700 15px ${UI_FONT}`;
    condensed(ctx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(name).width + 14;
    if (player.id === session.myId) {
      const tag = () => { ctx.beginPath(); ctx.roundRect(actor.x - width / 2, top - 10, width, 20, 10); };
      paperFill(ctx, tag, INK.gold);
      keyLine(ctx, tag, 1.5);
    } else {
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = withAlpha(INK.paper, 0.92);
      ctx.strokeText(name, actor.x, top + 1);
    }
    ctx.fillStyle = INK.navy;
    ctx.fillText(name, actor.x, top + 1);
    if (player.role) {
      const [kind] = (actor.act ?? '').split(':');
      const tag = `${roleName(player.role)}${kind ? ' ⚙' : ''}`.toUpperCase();
      ctx.font = `700 10.5px ${UI_FONT}`;
      const tagWidth = ctx.measureText(tag).width + 12;
      ctx.beginPath();
      ctx.roundRect(actor.x - tagWidth / 2, top + 12, tagWidth, 15, 4);
      ctx.fillStyle = ROLE_INK[player.role] ?? INK.paper;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK.navy;
      ctx.stroke();
      ctx.fillStyle = player.role === 'pilot' ? INK.paper : INK.navy;
      ctx.fillText(tag, actor.x, top + 20);
    }
    if (actor.bubble && now < actor.bubble.until) {
      ctx.font = `600 14px ${UI_FONT}`;
      const message = ellipsize(actor.bubble.text, 30);
      const w = ctx.measureText(message).width + 20;
      const bx = actor.x - w / 2, by = top - 42;
      const bubble = () => {
        ctx.beginPath();
        ctx.roundRect(bx, by, w, 26, 8);
        ctx.moveTo(actor.x - 6, by + 26);
        ctx.lineTo(actor.x, by + 33);
        ctx.lineTo(actor.x + 6, by + 26);
      };
      ctx.save();
      ctx.translate(2.5, 2.5);
      inkFill(ctx, bubble, INK.coral);
      ctx.restore();
      paperFill(ctx, bubble);
      keyLine(ctx, bubble, 1.6);
      ctx.fillStyle = INK.navy;
      ctx.fillText(message, actor.x, by + 14);
    }
    condensed(ctx, false);
  };

  /** En la Luna: la zona que marcó el telescopio y los círculos de cada escaneo. */
  const drawSurfaceMarks = (g, now) => {
    const flight = g.flight;
    if (mapId !== 'moon' || !flight) return;
    if (flight.zone && !flight.located && !flight.prism) {
      ctx.save();
      ctx.setLineDash([14, 10]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = withAlpha(INK.teal, 0.85);
      ctx.beginPath();
      ctx.ellipse(flight.zone.x, flight.zone.y, flight.zone.r, flight.zone.r, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      label(ctx, 'ZONA DEL TELESCOPIO', flight.zone.x, flight.zone.y - flight.zone.r - 12, { size: 13, color: INK.teal });
    }
    if (!flight.located && !flight.prism) {
      for (const ping of flight.pings) {
        ctx.save();
        ctx.setLineDash([8, 7]);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = withAlpha(INK.coral, 0.9);
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, ping.d, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = INK.coral;
        ctx.fill();
        label(ctx, `${number(ping.d)} m`, ping.x, ping.y - 14, { size: 12, color: INK.coral });
      }
    }
    pulses = pulses.filter((pulse) => now - pulse.born < 900);
    for (const pulse of pulses) {
      const k = (now - pulse.born) / 900;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, 20 + k * 220, 0, Math.PI * 2);
      ctx.lineWidth = 4 * (1 - k);
      ctx.strokeStyle = withAlpha(INK.gold, 1 - k);
      ctx.stroke();
    }
  };

  /** Marcador dorado sobre el puesto al que conviene ir; si queda fuera de la pantalla, una flecha en el borde. */
  const drawGuide = (g, time) => {
    const station = guideStation(g);
    if (!station || near?.station?.id === station.id) return;
    const cx = station.x + station.w / 2, top = station.y - station.height - 30 + Math.sin(time * 5) * 5;
    const at = toScreen(cx, top);
    const margin = 46;
    const inside = at.x > margin && at.x < view.w - margin && at.y > margin + 40 && at.y < view.h - margin;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const arrow = (x, y, angle, size) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, size);
      ctx.lineTo(-size * 0.8, -size * 0.4);
      ctx.lineTo(0, -size * 0.05);
      ctx.lineTo(size * 0.8, -size * 0.4);
      ctx.closePath();
      ctx.fillStyle = INK.gold;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK.navy;
      ctx.stroke();
      ctx.restore();
    };
    if (inside) {
      arrow(at.x, at.y, 0, 13);
      return;
    }
    const me = actors.get(session.myId);
    const from = me ? toScreen(me.x, me.y - 40) : { x: view.w / 2, y: view.h / 2 };
    const angle = Math.atan2(at.y - from.y, at.x - from.x);
    const x = Math.min(view.w - margin, Math.max(margin, at.x)), y = Math.min(view.h - margin, Math.max(margin + 50, at.y));
    arrow(x, y, angle - Math.PI / 2, 16);
    ctx.font = `700 13px ${UI_FONT}`;
    ctx.textAlign = x > view.w / 2 ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    const text = station.label;
    const tx = x + (x > view.w / 2 ? -24 : 24);
    ctx.lineWidth = 4;
    ctx.strokeStyle = withAlpha(INK.paper, 0.95);
    ctx.strokeText(text, tx, y);
    ctx.fillStyle = INK.navy;
    ctx.fillText(text, tx, y);
  };

  const render = (now, g) => {
    const time = now / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = INK.space;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!g) return;
    const shake = mapId === 'ship' && burning() && getSettings().cameraShake && !reducedEffects() ? 3 : 0;
    const ox = (Math.random() - 0.5) * shake, oy = (Math.random() - 0.5) * shake;
    const scale = view.dpr * view.scale;
    ctx.setTransform(scale, 0, 0, scale, view.dpr * (view.w / 2 - (view.x + ox) * view.scale), view.dpr * (view.h / 2 - (view.y + oy) * view.scale));
    ctx.lineJoin = 'round';
    ctx.drawImage(background, 0, 0, map.width, map.height);
    drawSurfaceMarks(g, now);

    const wanted = new Set();
    const { own, free } = myObjectives(g);
    for (const entry of [...own, ...free]) if (!entry.done && entry.where) wanted.add(entry.where);
    const fault = g.flight?.emergency ? FAULT_STATION[mapId]?.[g.flight.emergency.kind] : null;

    const stations = stationsNow(g);
    const drawables = [
      ...stations.map((station) => ({
        depth: station.flat ? -Infinity : station.y + station.h,
        draw: () => drawStation(ctx, station, map, { time, state: stationState(station, g), glow: wanted.has(station.id), alert: station.id === fault }),
      })),
      ...(map.rocks ?? []).map((rock) => ({ depth: rock.y + rock.h, draw: () => drawRock(ctx, rock) })),
      ...[...actors.values()].map((actor) => ({ depth: actor.y, draw: () => drawActor(actor, g, time) })),
    ].sort((a, b) => a.depth - b.depth);
    drawables.forEach((item) => item.draw());

    // Carteles de los puestos: el que está al alcance, los que me esperan y la avería.
    const me = actors.get(session.myId);
    for (const station of stations) {
      if (!station.label) continue;
      const close = me && distanceTo(station, me.x, me.y) < 150;
      if (!close && !wanted.has(station.id) && station.id !== fault) continue;
      const cx = station.x + station.w / 2, y = station.y - station.height - 12;
      ctx.font = `700 12px ${UI_FONT}`;
      condensed(ctx);
      const width = ctx.measureText(station.label.toUpperCase()).width + 14;
      condensed(ctx, false);
      ctx.beginPath();
      ctx.roundRect(cx - width / 2, y - 9, width, 18, 4);
      ctx.fillStyle = station.id === fault ? INK.coral : near?.station?.id === station.id ? INK.gold : INK.navy;
      ctx.fill();
      label(ctx, station.label.toUpperCase(), cx, y + 0.5, { size: 12, color: near?.station?.id === station.id && station.id !== fault ? INK.navy : INK.paper });
    }
    for (const actor of actors.values()) drawActorLabels(actor, g, now);
    drawGuide(g, time);
  };

  // ============================================================
  //  El bucle
  // ============================================================
  const step = (dt, now) => {
    const g = game();
    if (g) {
      updateMe(dt, g);
      updateOthers(dt);
      updateNear(g);
      updateHold();
      const me = actors.get(session.myId);
      if (me) {
        const target = cameraTarget(me);
        const ease = 1 - Math.exp(-dt * getSettings().cameraFollow);
        view.x += (target.x - view.x) * ease;
        view.y += (target.y - view.y) * ease;
      }
      renderPrompt(g);
      // La barra del tramo se mueve en vivo mientras Vuelo pilotea, y el equipo ve quién está ocupado.
      const live = liveBurn();
      const bar = /** @type {HTMLElement | null} */ (container.querySelector('.live-burn'));
      if (bar && g.leg?.dv > 0) {
        const remaining = Math.max(1, g.leg.dv - g.flight.progress);
        bar.style.width = live === null ? '0%' : `${Math.min(100, ((g.flight.progress + live * remaining) / g.leg.dv) * 100)}%`;
      }
      const key = [...actors.values()].map((actor) => (actor.act ?? '').split(':')[0]).join('|');
      if (key !== hudKey) { hudKey = key; renderTeam(g); }
    }
    render(now, g);
  };

  // ============================================================
  //  Estado nuevo del servidor
  // ============================================================
  const onState = () => {
    const g = game();
    if (!g) return;
    const wantedMap = mapIdFor(g.data);
    if (wantedMap !== mapId) enterMap(wantedMap, true);
    if (lastStage !== null && lastStage !== g.stageId && STAGE_SHOTS[g.stageId]) playCinematic(STAGE_SHOTS[g.stageId](g.data));
    // Al llegar a la Evaluación, el informe del vuelo se abre solo una vez.
    if (g.stageId !== 'debrief') seenResult = false; // al volver a intentar, el resultado nuevo se abre otra vez
    if (g.stageId === 'debrief' && !seenResult) {
      seenResult = true;
      window.setTimeout(() => { if (game()?.stageId === 'debrief' && panel.hidden) openPanel(['score', 'flight', 'board']); }, lastStage === null ? 300 : 3_000);
    }
    // Si la herramienta abierta ya no corresponde a la etapa, se cierra.
    if (openTools.includes('market') && !MARKET_STAGES.includes(g.stageId)) closePanel();
    lastStage = g.stageId;
    renderHud();
  };

  // ============================================================
  //  Entrada
  // ============================================================
  const onKeyDown = (event) => {
    if (event.code === 'Escape' && !panel.hidden && !document.querySelector('.minigame')) return closePanel();
    if (isTyping() || blocking()) return;
    if (KEY_DIRECTIONS[event.code]) {
      pressed.add(event.code);
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    const action = near?.actions[choice];
    if (event.code === 'KeyE' || event.code === 'Space') {
      event.preventDefault();
      if (!action) return;
      if (action.hold && !action.blocked) holding = { since: performance.now() };
      else use(action);
    } else if (event.code === 'KeyQ' && near && near.actions.length > 1) {
      choice = (choice + 1) % near.actions.length;
      holding = null;
    } else if (event.code === 'KeyX' && game()?.mine) {
      sendAction({ type: 'carry:cancel' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      toggleSide('chat', true);
    }
  };
  const onKeyUp = (event) => {
    pressed.delete(event.code);
    if (event.code === 'KeyE' || event.code === 'Space') holding = null;
  };
  const onBlur = () => { pressed.clear(); holding = null; };

  const onPointerDown = (event) => {
    if (blocking()) return;
    const g = game();
    if (!g) return;
    const point = toWorld(event.clientX, event.clientY);
    // Clic sobre un puesto (su dibujo completo): camina hasta él y lo usa al llegar.
    const station = stationsNow(g).find((s) => !s.decor && point.x >= s.x - 6 && point.x <= s.x + s.w + 6 && point.y >= s.y - s.height - 6 && point.y <= s.y + s.h + 10);
    if (station) {
      if (near?.station?.id === station.id) {
        const action = near.actions[choice];
        if (action && !action.hold) use(action);
        else if (action) say(action.blocked ?? 'Mantén apretada la tecla E para hacerlo.');
        return;
      }
      const spots = [[station.x + station.w / 2, station.y + station.h + 24], [station.x - 24, station.y + station.h / 2], [station.x + station.w + 24, station.y + station.h / 2], [station.x + station.w / 2, station.y - 20]];
      const spot = spots.find(([x, y]) => canStand(map, x, y)) ?? spots[0];
      walkTo({ x: spot[0], y: spot[1] });
      useOnArrival = station.id;
      return;
    }
    walkTo(point);
    useOnArrival = null;
  };

  const toggleSide = (name, open) => {
    const side = $(`.world-${name}`);
    const show = open ?? side.hidden;
    for (const other of container.querySelectorAll('.world-side')) /** @type {HTMLElement} */ (other).hidden = true;
    side.hidden = !show;
    if (show && name === 'chat') /** @type {HTMLInputElement | null} */ (side.querySelector('input'))?.focus();
  };

  // ============================================================
  //  Arranque
  // ============================================================
  const chat = mountChat($('.world-chat'), { onClose: () => toggleSide('chat', false) });
  for (const button of container.querySelectorAll('.world-buttons button')) {
    button.addEventListener('click', () => toggleSide(/** @type {HTMLElement} */ (button).dataset.open));
  }
  $('.world-log .chat-close').addEventListener('click', () => toggleSide('log', false));
  $('.world-panel-close').addEventListener('click', closePanel);
  $('.world-objectives').addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    // El botón pliega o despliega; plegado, un clic en cualquier parte del encabezado lo abre.
    if (target.closest('.objectives-toggle') || (objectivesCollapsed && target.closest('header'))) setObjectivesCollapsed(!objectivesCollapsed);
  });
  promptButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const action = near?.actions[choice];
    if (!action) return;
    if (action.hold && !action.blocked) holding = { since: performance.now() };
    else use(action);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) promptButton.addEventListener(type, () => { holding = null; });
  // En un teléfono, después de un toque el navegador manda un "clic" de compatibilidad en el mismo
  // lugar. Si ese toque abrió el panel (mercado, constructor…), el clic caía sobre lo que quedó debajo
  // del dedo: abría o cerraba una ficha, o tocaba un botón. Se ignoran los clics del primer instante.
  panel.addEventListener('click', (event) => {
    if (performance.now() - panelOpenedAt < 450) {
      event.stopPropagation();
      event.preventDefault();
    }
  }, true);

  syncActors(true);
  const offs = [
    on('state', onState),
    on('room', () => { syncActors(false); renderHud(); }),
    on('moved', (move) => {
      const actor = actors.get(move.id);
      if (!actor || move.id === session.myId || move.map !== mapId) return;
      Object.assign(actor, { tx: move.x, ty: move.y, facing: move.facing, moving: move.moving, act: move.act ?? '', lastMoveAt: performance.now() });
    }),
    on('chat-line', (line) => {
      const actor = line.playerId && actors.get(line.playerId);
      if (actor) actor.bubble = { text: line.text, until: performance.now() + BUBBLE_MS };
    }),
  ];
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  offs.push(onSettings(resize)); // acercamiento y resolución
  resize();
  enterMap(mapId, false);
  lastStage = game()?.stageId ?? null;
  onState();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  const stopLoop = frameLoop(step);

  return () => {
    stopLoop();
    clearTimeout(toastTimer);
    resizeObserver.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    unmountTool?.();
    chat.destroy();
    offs.forEach((off) => off());
    document.querySelector('.minigame')?.remove();
  };
};
