/**
 * PRUEBAS DE LA MISIÓN 2: LIFE ON MARS
 * Una partida de escritorio (sin red) de punta a punta: preparación en la estación, viaje interplanetario,
 * llegada y aterrizaje, experimento, tormenta, el rayo y el cierre. Con cuatro personas y con una sola.
 * Uso: npm test
 */
import { installedUids } from '../js/assembly.js';
import { EXAMPLE_BLUEPRINTS } from '../js/blueprints.js';
import { getPart } from '../js/catalog.js';
import { totalDeltaV } from '../js/flightplans.js';
import { getMission, missionFor } from '../js/missions.js';
import { getStory } from '../js/story.js';
import { isTaskDone, stageTasks } from '../js/tasks.js';
import { MAPS, canStand, mapIdFor } from '../js/worldmaps.js';
import { applyAction, createInitialState, isGameAction, publicState } from '../server/game.js';
import { doStageTasks } from './helpers.js';

let failures = 0;
let checks = 0;
const check = (label, passed) => {
  checks++;
  console.log(`${passed ? '  ✔' : '  ✘'} ${label}`);
  if (!passed) failures++;
};

const mars = getMission('mars');
const legs = mars.flightPlan;
const person = (name, role, isHost = false) => ({ id: name, name, role, isHost, canActAs: (wanted) => wanted === role });
const ana = person('Ana', 'pilot', true);
const meche = person('Meche', 'merchant');
const ines = person('Inés', 'engineer');
const caro = person('Caro', 'scientist');
const crew = [ana, meche, ines, caro];
const slotOrder = { core: 0, engines: 1, mounted: 2 };

/** Una partida de Marte. `team` = quiénes juegan; con una persona, maneja los cuatro roles. */
const newGame = (seed, team = crew) => {
  const alone = team.length === 1;
  const who = (role) => (alone ? team[0] : team.find((member) => member.role === role));
  const game = { state: createInitialState(), who };
  game.state.secret.seed = seed;
  game.send = (actor, action) => {
    if (!isGameAction(action)) return { error: 'Acción mal formada.' };
    const result = applyAction(game.state, action, { ...actor, players: team, heldRoles: team.map((member) => member.role) });
    if (result.state) game.state = result.state;
    return result;
  };
  game.data = () => game.state.data;
  game.stage = () => mars.stages[game.data().stageIndex].id;
  game.leg = () => legs[game.data().flight?.legIndex];
  game.tasks = () => doStageTasks(game.send, game.data, game.stage(), who);
  game.next = () => { game.tasks(); return game.send(who('pilot'), { type: 'stage:advance' }); };
  return game;
};
const prepare = (game) => {
  const host = game.who('pilot');
  while (game.data().scene === 'prologue') game.send(host, { type: 'story:next' });
  game.started = game.send(host, { type: 'mission:start', missionId: 'mars' });
  while (game.data().scene === 'briefing') game.send(host, { type: 'story:next' });
  game.next(); // Informe → Planificación
  game.next(); // Planificación → Mercado
  const wanted = new Map();
  for (const partId of EXAMPLE_BLUEPRINTS.mars.stages.flat()) wanted.set(partId, (wanted.get(partId) ?? 0) + 1);
  game.bought = [...wanted].map(([partId, quantity]) => game.send(game.who('merchant'), { type: 'market:buy', offerId: `${partId}:common`, quantity }));
  game.next(); // Mercado → Construcción
  const free = (partId) => game.data().economy.inventory.find((i) => i.partId === partId && !installedUids(game.data().rocket).includes(i.uid))?.uid;
  EXAMPLE_BLUEPRINTS.mars.stages.forEach((partIds, stage) => {
    const ordered = [...partIds].sort((a, b) => slotOrder[getPart(a).slot] - slotOrder[getPart(b).slot]);
    for (const partId of ordered) game.send(game.who('engineer'), { type: 'build:place', uid: free(partId), stage });
  });
  game.next(); // Construcción → Validación
  game.launch = game.next(); // Validación → Viaje
  return game;
};
/** Vuela con cuidado hasta que se termina el tramo con motores (o el vuelo). Repara las averías. */
const flyUntil = (game, stop) => {
  for (let step = 0; step < 200; step++) {
    const flight = game.data().flight;
    if (flight.phase === 'over' || stop(game)) return;
    if (flight.phase === 'emergency') {
      const pick = flight.emergency.options.find((o) => o.id === 'repair' && o.cost <= game.data().economy.credits) ?? flight.emergency.options.find((o) => o.id !== 'repair');
      for (const role of pick.needs) game.send(game.who(role), { type: 'flight:resolve', option: pick.id, role });
      continue;
    }
    const leg = game.leg();
    if (leg.dv === 0) game.send(game.who('pilot'), { type: 'flight:proceed', quality: 0.9 });
    else game.send(game.who('pilot'), { type: 'flight:burn', dv: Math.round(leg.dv - flight.progress) || 1, touchdown: leg.id === 'descent' ? 'soft' : undefined, aim: 0.9 });
  }
};

// ------------------------------------------------------------
console.log('1) La misión y su plan de vuelo');
check(`Marte tiene sus etapas: ${mars.stages.map((stage) => stage.id).join(' → ')}`, mars.stages.length === 11 && mars.stages.at(-1).id === 'debrief');
check(`el viaje pide ${totalDeltaV(legs)} m/s: ${legs.filter((leg) => leg.dv).map((leg) => `${leg.id} ${leg.dv}`).join(', ')}`,
  legs.find((leg) => leg.id === 'tmi').dv > 3_400 && legs.find((leg) => leg.id === 'tmi').dv < 3_800 && legs.find((leg) => leg.id === 'moi').dv > 1_900 && legs.find((leg) => leg.id === 'moi').dv < 2_300);
check('el informe de Marte existe y cuenta la leyenda (rayo rojo, destello azul)', getStory('briefing', 'mars')?.pages.length >= 5 && getStory('briefing', 'mars').pages[0].text.includes('rayo rojo') && getStory('briefing', 'mars').pages[0].text.includes('destello azul'));
check('cada etapa de preparación y de superficie tiene trabajo para los cuatro roles',
  ['briefing', 'planning', 'market', 'build', 'validation', 'surface', 'storm', 'bloom'].every((stage) => ['scientist', 'merchant', 'engineer', 'pilot'].every((role) => stageTasks(stage, 'mars').some((task) => task.role === role))));
check('las tareas de Marte no se mezclan con las de la Luna', stageTasks('surface', 'mars').every((task) => task.id.startsWith('mars.')) && stageTasks('surface', 'moon').every((task) => !task.id.startsWith('mars.')) && stageTasks('storm', 'moon').length === 0);
const map = MAPS.mars;
check('el mapa de Marte tiene todos los puestos que piden las tareas, y se puede llegar a ellos',
  ['surface', 'storm', 'bloom'].flatMap((stage) => stageTasks(stage, 'mars')).every((task) => [task.at, task.from, task.to].filter(Boolean).every((id) => map.stations.some((station) => station.id === id)))
  && canStand(map, map.spawn.x, map.spawn.y));

// ------------------------------------------------------------
console.log('\n2) Preparación en la estación (cuatro tripulantes)');
const game = prepare(newGame(42));
check('la misión de Marte se puede iniciar desde la constelación', !game.started.error && game.data().missionId === 'mars');
check(`Comercio compra la nave con el presupuesto de Marte (quedan ${game.data().economy.credits} créditos)`, game.bought.every((result) => !result.error) && game.data().economy.credits >= 0);
check(`la nave despega${game.launch.error ? `: ${game.launch.error}` : ''}`, !game.launch.error && game.stage() === 'flight' && game.leg().id === 'ascent');
check('el estado público no lleva la nave verdadera', !JSON.stringify(publicState(game.state)).includes('failureRate'));

// ------------------------------------------------------------
console.log('\n3) Viaje interplanetario y llegada');
check('solo Vuelo enciende los motores', Boolean(game.send(ines, { type: 'flight:burn', dv: 100 }).error));
flyUntil(game, (g) => g.stage() !== 'flight');
check('después de la inyección y la corrección de rumbo empieza la Llegada a Marte', game.stage() === 'arrival' && game.leg().id === 'moi' && mapIdFor(game.data()) === 'ship');
flyUntil(game, (g) => g.leg()?.id === 'entry');
check('la nave frena y entra en órbita de Marte', game.leg().id === 'entry' && game.data().flight.phase !== 'over');
check('la entrada en la atmósfera la hace Vuelo, no otro rol', Boolean(game.send(caro, { type: 'flight:proceed' }).error));
flyUntil(game, (g) => g.stage() === 'surface' && g.data().flight.phase === 'ready');
check(`aterrizó en Marte y la tripulación baja a la superficie${game.data().flight.result ? `: ${game.data().flight.result.text}` : ''}`, game.stage() === 'surface' && game.leg().id === 'experiment' && mapIdFor(game.data()) === 'mars');

// ------------------------------------------------------------
console.log('\n4) El experimento');
const pilotStep = () => game.send(ana, { type: 'flight:proceed', quality: 0.8 });
const early = pilotStep();
check(`sin el experimento armado no se puede dar la alerta ("${early.error}")`, Boolean(early.error) && game.leg().id === 'experiment');
check('el Prisma no se coloca antes de armar y cablear el aparato', Boolean(game.send(caro, { type: 'carry:pick', id: 'mars.surface.prism' }).error));
check('Ingeniería no arma el aparato sin los materiales de Comercio', Boolean(game.send(ines, { type: 'task:done', id: 'mars.surface.rig' }).error));
check('una tarea de Ciencia no la hace Comercio', Boolean(game.send(meche, { type: 'task:done', id: 'mars.surface.signal' }).error));
game.tasks();
check('entre los cuatro arman el experimento y colocan el Prisma', stageTasks('surface', 'mars').every((task) => isTaskDone(game.data(), task)));
check('nada cambió todavía en Marte: el Prisma sigue dormido', !game.data().flight.activated);
check('Vuelo da la alerta y empieza la tormenta', !pilotStep().error && game.stage() === 'storm' && game.leg().id === 'storm');

// ------------------------------------------------------------
console.log('\n5) La tormenta y el rayo');
check('con la tormenta encima, sincronizar sin sostener el experimento se rechaza', Boolean(pilotStep().error) && !game.data().flight.activated);
game.tasks();
check('los cuatro sostienen el experimento durante la tormenta', stageTasks('storm', 'mars').every((task) => isTaskDone(game.data(), task)) && game.data().flight.phase === 'ready');
const strike = game.send(ana, { type: 'flight:proceed', quality: 0.93 });
const flight = game.data().flight;
check('Vuelo sincroniza el experimento con el rayo: el Prisma despierta', !strike.error && flight.activated === true && Math.abs(flight.sync - 0.93) < 1e-9);
check('la bitácora cuenta el rayo rojo y el destello azul, en ese orden', game.data().log.some((line) => line.includes('rayo rojo') && line.includes('destello azul') && line.indexOf('rayo rojo') < line.indexOf('destello azul')));
check('empieza la etapa El despertar, todavía en Marte', game.stage() === 'bloom' && mapIdFor(game.data()) === 'mars' && !flight.result);

// ------------------------------------------------------------
console.log('\n6) Cierre de la misión');
check('no se cierra la misión sin registrar los resultados', Boolean(pilotStep().error));
game.tasks();
const end = pilotStep();
const done = game.data();
check(`la misión termina bien: "${done.flight.result?.text}"`, !end.error && done.flight.phase === 'over' && done.flight.result.ok === true && game.stage() === 'debrief');
check('Marte queda completada y Across the Universe disponible', done.campaign.missions.mars === 'completed' && done.campaign.missions.exodus !== 'locked');
check(`hay puntaje para los cuatro (${done.score.final.teamPoints} puntos del equipo)`, Boolean(done.score.final) && crew.every((member) => done.score.players[member.id]?.points > 0));
check('después de terminar ya no se aceptan pasos del vuelo', Boolean(pilotStep().error));

// ------------------------------------------------------------
console.log('\n7) Una sola persona completa toda la misión');
const sol = { id: 'Sol', name: 'Sol', role: 'engineer', isHost: true, canActAs: () => true };
const alone = prepare(newGame(42, [sol]));
check(`sola, prepara la nave y despega${alone.launch.error ? `: ${alone.launch.error}` : ''}`, !alone.launch.error && alone.stage() === 'flight');
flyUntil(alone, (g) => g.stage() === 'surface' && g.data().flight.phase === 'ready');
// Con una sola persona solo son obligatorias las tareas de su rol; las demás puede hacerlas igual.
const soloEarly = alone.send(sol, { type: 'flight:proceed' });
check('ni sola puede saltarse el aparato (su propio rol lo exige)', Boolean(soloEarly.error));
for (const stage of ['surface', 'storm', 'bloom']) {
  alone.tasks();
  alone.send(sol, { type: 'flight:proceed', quality: 0.7 });
  if (stage === 'storm') alone.activated = alone.data().flight.activated;
}
check(`termina la misión sin otros jugadores: "${alone.data().flight.result?.text}"`, alone.activated === true && alone.data().flight.result?.ok === true && alone.data().campaign.missions.mars === 'completed');

// ------------------------------------------------------------
console.log('\n8) El viaje se puede perder, y se entiende por qué');
const careless = prepare(newGame(9));
for (let step = 0; step < 40 && careless.data().flight.phase !== 'over'; step++) {
  const f = careless.data().flight;
  if (f.phase === 'emergency') { const out = f.emergency.options.find((o) => o.id !== 'repair') ?? f.emergency.options[0]; for (const role of out.needs) careless.send(careless.who(role), { type: 'flight:resolve', option: out.id, role }); continue; }
  const leg = careless.leg();
  if (leg.dv === 0) { if (careless.send(ana, { type: 'flight:proceed' }).error) break; continue; }
  careless.send(ana, { type: 'flight:burn', dv: Math.round((leg.dv - f.progress) * 1.3) || 1, touchdown: leg.id === 'descent' ? 'crash' : undefined });
}
const lost = careless.data().flight;
check(`pasándose 30 % en cada encendido, la nave no llega: "${lost.result?.text ?? 'sigue en vuelo'}"`, lost.phase === 'over' && lost.result.ok === false && careless.data().campaign.missions.mars !== 'completed');
check('desde la Evaluación se puede rediseñar y volver a volar', !careless.send(ana, { type: 'mission:retry' }).error && careless.stage() === 'build' && careless.data().flight === null);

// ------------------------------------------------------------
console.log('\n9) Balance: el cohete de referencia, volado con cuidado');
let wins = 0;
const RUNS = 20;
for (let seed = 1; seed <= RUNS; seed++) {
  const run = prepare(newGame(seed * 13));
  if (run.launch.error) continue;
  flyUntil(run, (g) => g.stage() === 'surface' && g.data().flight.phase === 'ready');
  for (let n = 0; n < 3 && run.data().flight.phase !== 'over'; n++) { run.tasks(); run.send(ana, { type: 'flight:proceed', quality: 0.8 }); }
  if (run.data().flight.result?.ok) wins++;
}
check(`completa la misión ${wins} de ${RUNS} veces (difícil, pero no imposible ni regalada)`, wins >= 14);

console.log(failures === 0 ? `\nTODO OK ✅ (${checks} verificaciones de Marte)` : `\n${failures} de ${checks} verificaciones fallaron ❌`);
process.exit(failures === 0 ? 0 : 1);
