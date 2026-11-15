/**
 * EL MUNDO (servidor)
 * Las tareas físicas de cada etapa (js/tasks.js) y lo que los tripulantes llevan en las manos.
 * Funciones puras: reciben el estado y devuelven lo que cambia.
 *
 *   task:done   { id }   terminó el minijuego de una tarea (telescopio, cables, calibrar, lista de cabina…)
 *   carry:pick  { id }   levanta el objeto de una tarea de cargar, o de un trabajo de a bordo (JOBS)
 *   carry:drop  { id }   lo deja en su destino (suma 1; al llegar a la cuenta, la tarea queda hecha)
 *   carry:cancel         suelta lo que lleva (el objeto vuelve a su lugar)
 *
 * Lo público: `data.tasks` (id → { done, progress, by }), `data.carrying` (id de jugador → { id, item }),
 * `data.perks` (ventajas ganadas para el vuelo) y `data.jobs` (cajas aseguradas antes del próximo encendido).
 *
 * El servidor valida quién puede (rol, o cualquiera si la tarea es compartida), el orden (`needs`) y la
 * etapa. Que el jugador esté parado junto al puesto lo cuida el navegador: es un juego cooperativo.
 */
import { number } from '../js/partinfo.js';
import { JOBS, MINIGAMES, getTask, isTaskDone } from '../js/tasks.js';
import { roleName } from '../js/shared.js';

export const isWorldAction = (action) => {
  switch (action.type) {
    case 'task:done':
    case 'carry:pick':
    case 'carry:drop':
      return typeof action.id === 'string' && action.id.length > 0 && action.id.length <= 40;
    case 'carry:cancel':
      return true;
    default:
      return false;
  }
};

/** Lo que una tarea terminada le deja a la partida: créditos, una ventaja y su línea en la bitácora. */
const reward = (data, task, actor) => {
  const patch = {};
  if (task.credits && data.economy) {
    patch.economy = { ...data.economy, credits: data.economy.credits + task.credits, budget: data.economy.budget + task.credits };
  }
  if (task.perk) patch.perks = { ...data.perks, [task.perk]: true };
  return { patch, log: task.result ? `${actor.name} ${task.result}.` : null };
};

/**
 * Devuelve `{ patch, log, then }` o `{ error }`.
 * `then` es una acción de vuelo que hay que aplicar después (cargar el Prisma, carga asegurada).
 * @param {{ data: any, stageId: string }} context
 * @param {any} action
 * @param {{ id: string, name: string, canActAs: (roleId: string) => boolean }} actor
 */
export const applyWorldAction = ({ data, stageId }, action, actor) => {
  const carrying = data.carrying ?? {};
  const mine = carrying[actor.id];
  const without = () => Object.fromEntries(Object.entries(carrying).filter(([id]) => id !== actor.id));

  if (action.type === 'carry:cancel') {
    if (!mine) return { error: 'No llevas nada en las manos.' };
    return { patch: { carrying: without() }, log: null };
  }

  const job = JOBS[action.id];
  const task = job ? null : getTask(action.id);
  if (!job && !task) return { error: 'Esa tarea no existe.' };
  const subject = job ?? task;
  const allowed = subject.shared || actor.canActAs(subject.role);

  // ---------- Trabajos de a bordo ----------
  if (job) {
    const flight = data.flight;
    if (!flight || flight.phase === 'over') return { error: 'Eso se hace en vuelo.' };
    if (!allowed) return { error: `Eso lo hace ${roleName(job.role)}.` };
    if (job.id === 'spare') {
      if (action.type !== 'carry:pick') return { error: 'El repuesto se entrega en la avería.' };
      const repair = flight.emergency?.options.find((option) => option.id === 'repair');
      if (!repair) return { error: 'No hay ninguna avería que pida un repuesto.' };
      if ((flight.emergency.votes.repair ?? []).includes('merchant')) return { error: 'El repuesto ya se entregó.' };
      if (repair.cost > (data.economy?.credits ?? 0)) return { error: `El repuesto cuesta ${number(repair.cost)} créditos y quedan ${number(data.economy.credits)}.` };
      if (mine) return { error: 'Ya llevas algo en las manos.' };
      return { patch: { carrying: { ...carrying, [actor.id]: { id: 'spare', item: 'spare' } } }, log: null };
    }
    // Carga suelta: se asegura antes de cada encendido.
    if (flight.phase !== 'ready') return { error: 'Ahora no se puede mover la carga.' };
    if (flight.prep?.cargo) return { error: 'La carga ya está asegurada para este encendido.' };
    if (action.type === 'carry:pick') {
      if (mine) return { error: 'Ya llevas algo en las manos.' };
      return { patch: { carrying: { ...carrying, [actor.id]: { id: job.id, item: job.item } } }, log: null };
    }
    if (mine?.id !== job.id) return { error: 'No llevas una caja.' };
    const count = (data.jobs?.[job.id] ?? 0) + 1;
    if (count < job.count) return { patch: { carrying: without(), jobs: { ...data.jobs, [job.id]: count } }, log: null };
    return { patch: { carrying: without(), jobs: { ...data.jobs, [job.id]: 0 } }, log: null, then: { type: 'flight:prep', kind: 'cargo' } };
  }

  // ---------- Tareas de etapa ----------
  if (task.stage !== stageId) return { error: 'Esa tarea es de otra etapa.' };
  if (!allowed) return { error: `Esa tarea es de ${roleName(task.role)}.` };
  if (isTaskDone(data, task)) return { error: 'Esa tarea ya está hecha.' };
  const pending = (task.needs ?? []).map(getTask).find((needed) => !isTaskDone(data, needed));
  if (pending) return { error: `Primero: ${pending.title.toLowerCase()}.` };
  const state = data.tasks?.[task.id] ?? { done: false, progress: 0, by: null };

  if (action.type === 'task:done') {
    if (!MINIGAMES.includes(task.kind) || task.send) return { error: 'Esa tarea no se termina así.' };
    const { patch, log } = reward(data, task, actor);
    return { patch: { ...patch, tasks: { ...data.tasks, [task.id]: { done: true, progress: 1, by: actor.name } } }, log };
  }

  if (task.kind !== 'carry') return { error: 'Esa tarea no es de cargar.' };
  if (task.id === 'surface.haul' && !data.flight?.dug) return { error: 'El Prisma sigue enterrado: primero hay que perforar.' };
  if (action.type === 'carry:pick') {
    if (mine) return { error: 'Ya llevas algo en las manos.' };
    const inHands = Object.values(carrying).filter((held) => held.id === task.id).length;
    if (state.progress + inHands >= task.count) return { error: 'Ya no queda nada por llevar.' };
    return { patch: { carrying: { ...carrying, [actor.id]: { id: task.id, item: task.item } } }, log: null };
  }

  // carry:drop
  if (mine?.id !== task.id) return { error: 'No llevas eso en las manos.' };
  const progress = state.progress + 1;
  if (progress < task.count) {
    return { patch: { carrying: without(), tasks: { ...data.tasks, [task.id]: { done: false, progress, by: actor.name } } }, log: null };
  }
  const { patch, log } = reward(data, task, actor);
  return {
    patch: { ...patch, carrying: without(), tasks: { ...data.tasks, [task.id]: { done: true, progress, by: actor.name } } },
    log,
    then: task.id === 'surface.haul' ? { type: 'flight:load' } : null,
  };
};
