/**
 * PUNTAJE INDIVIDUAL Y RESUMEN FINAL (servidor)
 * Cada acción ACEPTADA de la misión puede sumar puntos a quien la hizo. El servidor compara el estado
 * antes y después de la acción (`scoreAction`), así que solo cuenta lo que de verdad pasó en el juego:
 * una tarea terminada, una caja entregada, un encendido, el alunizaje, una reparación…
 *
 * Reglas:
 *   - Cada suceso tiene una clave (`seen`): si llega dos veces, cuenta una sola vez.
 *   - La precisión (0 a 1) sale de datos medibles: lo que reporta el minijuego (tiempo en la zona,
 *     errores, tiempo para fijar la señal), la puntería y el Δv de más de cada encendido, cómo tocó el
 *     suelo el alunizaje, cuántas lecturas hizo falta para ubicar el Prisma, cuánto sobró del presupuesto.
 *     Lo que no tiene una medida real (cargar una caja, perforar) suma puntos sin nota de precisión.
 *   - Los puntos van al jugador que actuó (en el modo demo una persona puede cubrir varios roles: se
 *     anota en `roles`). Ayudar con una tarea de otro rol cuenta como cooperación.
 *   - Las cuatro tareas de cada rol valen parecido y el piloto, que enciende muchas veces, gana menos por
 *     encendido: así ningún rol queda en desventaja por tener menos oportunidades.
 *
 * Todo vive en `data.score` (lo ven todos, viaja con el estado y sobrevive a reconexiones):
 *   players: id → { id, name, role, points, actions, measured: { sum, count }, roles, helps, notes }
 *   seen:    clave de suceso → true
 *   crew:    contadores internos (quién armó el cohete, quién compró)
 *   final:   el resumen del equipo al terminar el vuelo (null mientras tanto)
 *   beforeLaunch: copia del puntaje justo antes de despegar (para "Rediseñar y volver a volar")
 */
import { installedUids, toPhysicsStages } from '../js/assembly.js';
import { getMission, missionFor } from '../js/missions.js';
import { validateRocket } from '../js/rocket.js';
import { ROLES, roleName } from '../js/shared.js';
import { getTask, stageTasks } from '../js/tasks.js';

/** Cuánto vale cada cosa. */
export const POINTS = {
  task: 100, //        terminar una tarea de etapa
  precision: 60, //    extra por precisión (multiplicado por la nota 0..1)
  carry: 35, //        cada objeto entregado
  carryDone: 50, //    quien entrega el último completa la tarea
  help: 25, //         extra por hacer algo de otro rol
  launchBuild: 220, // Ingeniería: el cohete pasó la revisión (por la calidad del armado)
  launchBuy: 220, //   Comercio: compras justas y presupuesto con reserva
  launch: 60, //       Vuelo: dar el despegue
  burn: 20, //         cada encendido (más media nota de precisión: hay muchos)
  landing: 100, //     alunizaje (más precisión: suave, duro o choque)
  prep: 45, //         preparativos antes de un encendido
  located: 160, //     ubicar el Prisma (más precisión: pocas lecturas)
  dig: 120,
  solar: 80,
  reentry: 100,
  repair: 130, //      reparar en una emergencia
  spare: 90, //        llevar el repuesto
  decision: 50, //     aceptar otra salida en una emergencia
  success: 150, //     misión cumplida (a todo el equipo)
  roleBonus: 120, //   bono final por rol (ver `finalize`)
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const quality = (value) => (Number.isFinite(value) ? clamp01(Number(value)) : null);

export const freshScore = () => ({ players: {}, seen: {}, crew: { builders: {}, buyers: {} }, final: null, beforeLaunch: null });

/**
 * Suma un suceso. `q` = nota de precisión (o null si no se puede medir).
 * @param {any} score  (se modifica: es una copia hecha por scoreAction)
 */
const award = (score, actor, { key, points, q = null, label, role = actor.role, weight = 1 }) => {
  if (key && score.seen[key]) return;
  if (key) score.seen[key] = true;
  const player = score.players[actor.id] ?? { id: actor.id, name: actor.name, role: actor.role, points: 0, actions: 0, measured: { sum: 0, count: 0 }, roles: {}, helps: 0, notes: [] };
  const helped = Boolean(role && actor.role && role !== actor.role);
  const gained = Math.round(points + (q === null ? 0 : POINTS.precision * weight * q) + (helped ? POINTS.help : 0));
  const next = {
    ...player,
    name: actor.name,
    role: actor.role ?? player.role,
    points: player.points + gained,
    actions: player.actions + 1,
    measured: q === null ? player.measured : { sum: player.measured.sum + q, count: player.measured.count + 1 },
    roles: role ? { ...player.roles, [role]: (player.roles[role] ?? 0) + gained } : player.roles,
    helps: player.helps + (helped ? 1 : 0),
    notes: [...player.notes, { label, points: gained, q }].slice(-40),
  };
  score.players = { ...score.players, [actor.id]: next };
};

const count = (record, id) => ({ ...record, [id]: (record[id] ?? 0) + 1 });

/** Reparte puntos entre quienes hicieron algo, según cuántas veces lo hizo cada uno. */
const share = (score, record, actorsById, { key, points, q, label, role }) => {
  const entries = Object.entries(record);
  const total = entries.reduce((sum, [, times]) => sum + times, 0);
  if (total === 0 || score.seen[key]) return;
  for (const [id, times] of entries) {
    const who = actorsById[id];
    if (who) award(score, who, { key: `${key}:${id}`, points: points * (times / total), q, label, role });
  }
  score.seen[key] = true;
};

/**
 * Compara el estado antes y después de una acción aceptada y devuelve el puntaje nuevo.
 * `players` = los jugadores de la sala (nombre y rol para repartir bonos).
 * @param {any} before  data anterior
 * @param {any} after   data nueva (ya con la acción aplicada)
 * @param {any} action
 * @param {{ id: string, name: string, role: string | null }} actor
 * @param {{ id: string, name: string, role: string | null }[]} [players]
 */
export const scoreAction = (before, after, action, actor, players = []) => {
  if (action.type === 'mission:start') return freshScore();
  // Volver a intentar: el puntaje vuelve a como estaba justo antes del despegue (cuenta el último vuelo).
  if (action.type === 'mission:retry') return { ...(before.score?.beforeLaunch ?? freshScore()), beforeLaunch: null, final: null };
  if (after.scene !== 'mission') return after.score ?? null;
  const base = after.score ?? freshScore();
  const score = { ...base, players: { ...base.players }, seen: { ...base.seen }, crew: { builders: { ...base.crew.builders }, buyers: { ...base.crew.buyers } } };
  const who = { id: actor.id, name: actor.name, role: actor.role ?? null };
  const q = quality(action.quality);
  const mission = missionFor(after);

  // ---------- Tareas de etapa (minijuegos y cargar) ----------
  for (const [id, now] of Object.entries(after.tasks ?? {})) {
    const was = before.tasks?.[id];
    const task = getTask(id);
    if (!task) continue;
    if ((now.progress ?? 0) > (was?.progress ?? 0) && task.kind === 'carry') {
      award(score, who, { key: `carry:${id}:${now.progress}`, points: POINTS.carry + (now.done ? POINTS.carryDone : 0), label: now.done ? `Completó: ${task.title}` : `Entregó: ${task.title}`, role: task.role });
    } else if (now.done && !was?.done) {
      award(score, who, { key: `task:${id}`, points: POINTS.task, q, label: task.title, role: task.role });
    }
  }

  // ---------- Quién armó y quién compró (se premia al despegar) ----------
  if (action.type?.startsWith('build:') && action.type !== 'build:undo') score.crew.builders = count(score.crew.builders, actor.id);
  if (action.type === 'market:buy' || action.type === 'black:buy') score.crew.buyers = count(score.crew.buyers, actor.id);

  // ---------- Despegue: se evalúa el armado y las compras ----------
  if (action.type === 'stage:advance' && after.flight && !before.flight) {
    // Foto del puntaje antes del despegue, por si después vuelven a intentarlo.
    score.beforeLaunch = structuredClone({ ...score, beforeLaunch: null, final: null });
    const byId = Object.fromEntries(players.map((p) => [p.id, { id: p.id, name: p.name, role: p.role ?? null }]));
    byId[actor.id] = who;
    // La misma revisión que decidió el despegue: menos advertencias = mejor armado.
    const review = validateRocket(toPhysicsStages(before.rocket, before.economy.inventory), mission, { credits: before.economy.credits });
    share(score, score.crew.builders, byId, {
      key: 'launch:build', points: POINTS.launchBuild, q: clamp01(1 - 0.12 * review.warnings.length), label: 'Cohete aprobado para despegar', role: 'engineer',
    });
    const economy = after.economy;
    const inventory = economy?.inventory ?? [];
    const installed = new Set(installedUids(after.rocket));
    const used = inventory.length ? inventory.filter((item) => installed.has(item.uid)).length / inventory.length : 0;
    const reserve = economy?.budget ? clamp01((economy.credits / economy.budget) / 0.25) : 0;
    share(score, score.crew.buyers, byId, {
      key: 'launch:buy', points: POINTS.launchBuy, q: clamp01(0.6 * used + 0.4 * reserve), label: 'Compras para la misión', role: 'merchant',
    });
    award(score, who, { key: 'launch', points: POINTS.launch, label: '¡Despegue!', role: 'pilot' });
  }

  // ---------- Vuelo ----------
  const flightBefore = before.flight, flightAfter = after.flight;
  if (flightBefore && flightAfter) {
    const leg = mission?.flightPlan?.[flightBefore.legIndex];
    if (action.type === 'flight:burn' && flightAfter.burns > flightBefore.burns) {
      if (leg?.id === 'descent' && action.touchdown) {
        const landing = { soft: 1, hard: 0.45, crash: 0 }[action.touchdown] ?? 0;
        award(score, who, { key: 'landing', points: POINTS.landing, q: landing, label: { soft: 'Alunizaje suave', hard: 'Alunizaje duro', crash: 'Golpe al alunizar' }[action.touchdown], role: 'pilot' });
      } else {
        const wasted = Math.max(0, flightAfter.wasted - flightBefore.wasted);
        const aim = Number.isFinite(action.aim) ? clamp01(action.aim) : 0.5;
        const tidy = leg?.dv ? 1 - clamp01(wasted / (0.05 * leg.dv)) : 1;
        award(score, who, { key: `burn:${flightAfter.burns}`, points: POINTS.burn, q: 0.6 * aim + 0.4 * tidy, weight: 0.5, label: `Encendido: ${leg?.name ?? 'maniobra'}`, role: 'pilot' });
      }
    }
    if (action.type === 'flight:prep') {
      award(score, who, { key: `prep:${flightAfter.burns}:${action.kind}`, points: POINTS.prep, q, label: 'Preparativos antes del encendido', role: { nav: 'scientist', trim: 'engineer', cargo: 'merchant' }[action.kind] });
    }
    if (action.type === 'carry:drop' && action.id === 'cargo' && JSON.stringify(after.jobs) !== JSON.stringify(before.jobs)) {
      award(score, who, { key: `cargo:${flightAfter.burns}:${after.jobs?.cargo ?? 0}:${flightAfter.prep?.cargo ? 'ok' : ''}`, points: POINTS.carry, label: 'Aseguró carga suelta', role: 'merchant' });
    }
    if (flightAfter.located && !flightBefore.located) {
      const scans = flightAfter.scans ?? 1;
      award(score, who, { key: 'located', points: POINTS.located, q: clamp01(1 - (scans - 2) / 6), label: `Ubicó el Prisma (${scans} ${scans === 1 ? 'lectura' : 'lecturas'})`, role: 'scientist' });
    }
    // Perforar y desplegar el panel se hacen con un minijuego: su precisión viene en la acción.
    if (flightAfter.dug && !flightBefore.dug) award(score, who, { key: 'dig', points: POINTS.dig, q: action.type === 'flight:dig' ? q : null, label: 'Perforó hasta el Prisma', role: 'engineer' });
    if (flightAfter.solar && !flightBefore.solar) award(score, who, { key: 'solar', points: POINTS.solar, q: action.type === 'flight:solar' ? q : null, label: 'Desplegó el panel solar', role: 'pilot' });
    if (action.type === 'flight:proceed' && leg?.id === 'reentry') award(score, who, { key: 'reentry', points: POINTS.reentry, q, label: 'Reentrada', role: 'pilot' });
    if (action.type === 'flight:resolve' && flightBefore.emergency) {
      const emergencyKey = `${flightBefore.legIndex}:${flightBefore.burns}:${flightBefore.emergency.title}`;
      const label = action.option === 'repair'
        ? (action.role === 'merchant' ? `Llevó el repuesto: ${flightBefore.emergency.title}` : `Reparó: ${flightBefore.emergency.title}`)
        : `Decidió en la emergencia: ${flightBefore.emergency.title}`;
      const points = action.option === 'repair' ? (action.role === 'merchant' ? POINTS.spare : POINTS.repair) : POINTS.decision;
      award(score, who, { key: `resolve:${emergencyKey}:${action.role}`, points, q: action.option === 'repair' && action.role === 'engineer' ? q : null, label, role: action.role });
    }
  }

  // ---------- Fin del vuelo: resumen del equipo ----------
  if (flightAfter?.result && !flightBefore?.result) score.final = finalize(score, after, players);
  return score;
};

/** Nota de 0 a 5 estrellas a partir de la precisión media (o null si no hubo nada medible). */
export const starsFor = (measured) => (measured.count > 0 ? Math.round((measured.sum / measured.count) * 10) / 2 : null);

/**
 * El resumen al terminar: resultado, objetivos, puntos, logros, errores y bonos por rol.
 * @param {any} score
 * @param {any} data
 * @param {{ id: string, name: string, role: string | null }[]} players
 */
const finalize = (score, data, players) => {
  const flight = data.flight;
  const ok = Boolean(flight.result.ok);
  const mission = getMission(data.missionId);
  const tasks = (mission?.stages ?? []).flatMap((stage) => stageTasks(stage.id, mission?.id));
  const done = tasks.filter((task) => (task.auto ? task.auto(data) : data.tasks?.[task.id]?.done)).length;

  // Bonos finales por rol (a quien tiene ese rol): cosas que solo se pueden medir al terminar.
  const holders = (roleId) => players.filter((p) => p.role === roleId);
  const bonus = (roleId, key, q, label) => {
    for (const p of holders(roleId)) award(score, { id: p.id, name: p.name, role: p.role }, { key: `final:${key}:${p.id}`, points: POINTS.roleBonus * 0.4, q, label, role: roleId });
  };
  const fuelQ = flight.dvUsed > 0 ? 1 - clamp01(flight.wasted / (0.08 * flight.dvUsed)) : 0;
  bonus('pilot', 'fuel', fuelQ, 'Uso del combustible en todo el viaje');
  bonus('engineer', 'power', flight.savedPower ? 0.3 : 1, flight.savedPower ? 'Energía: hubo que pasar a ahorro' : 'Energía bien administrada');
  bonus('merchant', 'budget', clamp01((data.economy?.credits ?? 0) / Math.max(1, data.economy?.budget ?? 1) / 0.15), 'Presupuesto al final del viaje');
  const onMars = mission?.id === 'mars';
  if (onMars) bonus('scientist', 'prism', flight.activated ? 0.5 + 0.5 * (flight.sync ?? 0) : 0, flight.activated ? 'El Prisma despertó con el rayo' : 'El Prisma no llegó a despertar');
  else bonus('scientist', 'prism', flight.prism ? 1 : 0, flight.prism ? 'El Prisma volvió a bordo' : 'El Prisma no se recuperó');
  // Ciencia: lo que de verdad llegó a la Tierra frente a lo que podían dar los instrumentos a bordo.
  const science = flight.science ?? { value: 0, max: 0, generated: 0, sent: 0 };
  if (science.max > 0) {
    for (const p of holders('scientist')) {
      award(score, { id: p.id, name: p.name, role: p.role }, { key: `final:science:${p.id}`, points: POINTS.roleBonus * 0.6, q: science.value / science.max, label: `Ciencia enviada a la Tierra (${science.value} de ${science.max} puntos)`, role: 'scientist' });
    }
  }
  if (ok) for (const p of players) award(score, { id: p.id, name: p.name, role: p.role }, { key: `final:success:${p.id}`, points: POINTS.success, label: 'Misión cumplida', role: null });

  const highlights = [];
  const mistakes = [];
  if (ok) highlights.push(mission?.sandbox ? 'El cohete hizo el viaje completo y volvió entero.' : onMars ? 'Rayo rojo, destello azul: el Prisma despertó y Marte empezó a cambiar.' : 'El Prisma llegó a la Tierra: misión cumplida.');
  if (onMars && flight.activated && (flight.sync ?? 0) >= 0.85) highlights.push('El experimento se sincronizó con el rayo casi al instante.');
  if (flight.touchdown === 'soft') highlights.push(onMars ? 'Aterrizaje suave en Marte.' : 'Alunizaje suave en el lado oculto.');
  if (flight.located && flight.scans <= 3) highlights.push(`El Prisma se ubicó con solo ${flight.scans === 1 ? 'una lectura' : `${flight.scans} lecturas`}.`);
  if (flight.dvUsed > 0 && flight.wasted / flight.dvUsed < 0.02) highlights.push('Encendidos muy precisos: casi nada de combustible de más.');
  if (!flight.savedPower) highlights.push('La batería alcanzó sin pasar a modo ahorro.');
  if (science.max > 0 && science.value >= science.max * 0.95) highlights.push(`Llegó toda la ciencia a la Tierra: ${science.value} puntos.`);
  if (!ok) mistakes.push(`${mission?.sandbox ? 'La prueba falló' : 'Misión fallida'}: ${flight.result.text}`);
  if (flight.touchdown === 'crash') mistakes.push('La nave golpeó el suelo al alunizar.');
  if (flight.touchdown === 'hard') mistakes.push(onMars ? 'El aterrizaje en Marte fue duro: las patas sufrieron.' : 'El alunizaje fue duro: las patas sufrieron.');
  if (flight.dvUsed > 0 && flight.wasted / flight.dvUsed >= 0.05) mistakes.push(`Se quemaron ${Math.round(flight.wasted)} m/s de más.`);
  if (flight.repairsPaid > 0) mistakes.push(`Las reparaciones costaron ${Math.round(flight.repairsPaid)} créditos.`);
  if (flight.savedPower) mistakes.push('Faltó energía y hubo que pasar a modo ahorro.');
  if (flight.blackout) mistakes.push('Hubo tramos sin señal con la Tierra.');
  if (science.generated > science.sent) mistakes.push(`Se perdieron ${Math.round(science.generated - science.sent)} MB de datos: el enlace no alcanzó (más antena, un repetidor o una órbita más alta).`);
  if (science.max === 0 && !mission?.sandbox) mistakes.push('No viajó ningún instrumento científico: la misión no trajo ciencia.');

  // Logros de cada jugador (a partir de lo que de verdad hizo).
  const badges = {};
  for (const player of Object.values(score.players)) {
    const list = [];
    const notes = player.notes;
    const avg = player.measured.count ? player.measured.sum / player.measured.count : 0;
    const burnNotes = notes.filter((n) => n.label.startsWith('Encendido') && n.q !== null);
    if (burnNotes.length >= 2 && burnNotes.reduce((s, n) => s + n.q, 0) / burnNotes.length >= 0.8) list.push({ id: 'steady', name: 'Mano firme', text: 'Encendidos precisos' });
    if (notes.some((n) => n.label === 'Alunizaje suave')) list.push({ id: 'soft', name: 'Pluma lunar', text: 'Alunizaje suave' });
    if (notes.some((n) => n.label.startsWith('Ubicó el Prisma') && n.q >= 0.8)) list.push({ id: 'eagle', name: 'Ojo de águila', text: 'Ubicó el Prisma con pocas lecturas' });
    if (notes.some((n) => n.label.startsWith('Reparó'))) list.push({ id: 'fixer', name: 'Manos de oro', text: 'Reparó una avería en vuelo' });
    if (notes.some((n) => n.label.startsWith('Llevó el repuesto'))) list.push({ id: 'supply', name: 'Siempre a tiempo', text: 'Llevó el repuesto a la avería' });
    if (notes.some((n) => n.label === 'Compras para la misión' && n.q >= 0.75)) list.push({ id: 'trader', name: 'Buen negocio', text: 'Compras justas y reserva de dinero' });
    if (notes.some((n) => n.label === 'Cohete aprobado para despegar' && n.q >= 0.85)) list.push({ id: 'builder', name: 'Ingeniería fina', text: 'Cohete sin advertencias' });
    if (player.helps >= 2) list.push({ id: 'team', name: 'Espíritu de equipo', text: `Ayudó ${player.helps} veces a otros roles` });
    if (player.measured.count >= 3 && avg >= 0.85) list.push({ id: 'precise', name: 'Precisión', text: 'Trabajo muy preciso' });
    if (Object.keys(player.roles).filter((r) => ROLES.some((role) => role.id === r)).length >= 3) list.push({ id: 'allround', name: 'Todo terreno', text: 'Cubrió varios roles' });
    badges[player.id] = list;
  }
  const teamPoints = Object.values(score.players).reduce((sum, p) => sum + p.points, 0);
  return {
    ok,
    text: flight.result.text,
    teamPoints,
    objectivesDone: done,
    objectivesTotal: tasks.length,
    science,
    plan: data.plan ?? null,
    difficulty: data.difficulty ?? 'Normal',
    sandbox: Boolean(mission?.sandbox),
    missionId: mission?.id ?? null,
    highlights,
    mistakes,
    badges,
    roleNames: Object.fromEntries(ROLES.map((role) => [role.id, roleName(role.id)])),
  };
};
