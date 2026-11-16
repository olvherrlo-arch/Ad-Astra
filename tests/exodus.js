/**
 * PRUEBAS DE LA MISIÓN 3: ACROSS THE UNIVERSE (PROYECTO NOAH)
 * Una partida de escritorio (sin red): repartir los recursos entre las cuatro arcas, construirlas, lanzarlas,
 * el viaje de la flota, la llegada, la colonia y el final de la campaña. Con cuatro personas y con una sola.
 * Uso: npm test
 */
import { ARKS, FLEET_POOL, MIN_ARKS, allot, colonyLevel, freshFleet, leftOf, resolveJourney, shortfalls } from '../js/fleet.js';
import { getMission } from '../js/missions.js';
import { getStory } from '../js/story.js';
import { isTaskDone, stageTasks } from '../js/tasks.js';
import { MAPS, mapIdFor } from '../js/worldmaps.js';
import { applyAction, createInitialState, isGameAction } from '../server/game.js';
import { doStageTasks } from './helpers.js';

let failures = 0;
let checks = 0;
const check = (label, passed) => {
  checks++;
  console.log(`${passed ? '  ✔' : '  ✘'} ${label}`);
  if (!passed) failures++;
};

const exodus = getMission('exodus');
const person = (name, role, isHost = false) => ({ id: name, name, role, isHost, canActAs: (wanted) => wanted === role });
const ana = person('Ana', 'pilot', true);
const meche = person('Meche', 'merchant');
const ines = person('Inés', 'engineer');
const caro = person('Caro', 'scientist');
const crew = [ana, meche, ines, caro];
const SYSTEM_IDS = ['fuel', 'shield', 'cargo'];

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
  game.stage = () => exodus.stages[game.data().stageIndex].id;
  game.tasks = () => doStageTasks(game.send, game.data, game.stage(), who);
  game.next = () => { game.tasks(); return game.send(who('pilot'), { type: 'stage:advance' }); };
  /** Deja el reparto exactamente como se pide: { john: [fuel, shield, cargo], ... } */
  game.allot = (plan) => {
    for (const [ark, levels] of Object.entries(plan)) SYSTEM_IDS.forEach((system, index) => {
      for (let n = game.data().fleet.alloc[ark][system]; n > levels[index]; n--) game.send(who('merchant'), { type: 'fleet:allot', ark, system, delta: -1 });
    });
    for (const [ark, levels] of Object.entries(plan)) SYSTEM_IDS.forEach((system, index) => {
      for (let n = game.data().fleet.alloc[ark][system]; n < levels[index]; n++) game.send(who('merchant'), { type: 'fleet:allot', ark, system, delta: 1 });
    });
  };
  const host = who('pilot');
  while (game.data().scene === 'prologue') game.send(host, { type: 'story:next' });
  game.started = game.send(host, { type: 'mission:start', missionId: 'exodus' });
  while (game.data().scene === 'briefing') game.send(host, { type: 'story:next' });
  return game;
};
/** Juega desde el Reparto hasta el final (o hasta que la misión falle) con ese reparto y esa ruta. */
const playThrough = (game, plan, route) => {
  if (game.stage() === 'briefing') game.next();
  game.allot(plan);
  game.send(game.who('pilot'), { type: 'fleet:route', route });
  for (let step = 0; step < 12 && game.stage() !== 'debrief'; step++) { const result = game.next(); if (result.error) { game.stuck = result.error; break; } }
  return game;
};
// Lo que pide cada arca y tres recursos de margen en casco.
const NEEDS = Object.fromEntries(ARKS.map((ark) => [ark.id, [ark.needs.fuel, ark.needs.shield, ark.needs.cargo]]));
const CAREFUL = { ...NEEDS, john: [2, 2, 2], george: [2, 2, 3], ringo: [2, 3, 3] };

// ------------------------------------------------------------
console.log('1) Las cuatro arcas y la misión');
check('las arcas son John, Ringo, George y Paul, con sus títulos', ARKS.map((ark) => `${ark.name} ${ark.title}`).join(', ') === 'John El Pionero, Ringo El Guardián, George El Jardín, Paul El Legado');
check('cada una lleva lo suyo y pide recursos distintos', new Set(ARKS.map((ark) => ark.carries)).size === 4 && new Set(ARKS.map((ark) => JSON.stringify(ark.needs))).size === 4
  && /Tecnología/.test(ARKS[0].carries) && /Comida/.test(ARKS[1].carries) && /Semillas/.test(ARKS[2].carries) && /Personas/.test(ARKS[3].carries));
const minimum = ARKS.reduce((sum, ark) => sum + ark.needs.fuel + ark.needs.shield + ark.needs.cargo, 0);
check(`los recursos (${FLEET_POOL}) alcanzan para el mínimo de todas (${minimum}) pero no para llenarlas`, FLEET_POOL >= minimum && FLEET_POOL < minimum + 8);
check(`la misión tiene sus etapas: ${exodus.stages.map((stage) => stage.id).join(' → ')}`, exodus.stages.length === 9);
check('el informe presenta el Proyecto NOAH y las cuatro arcas', ['John', 'Ringo', 'George', 'Paul'].every((name) => JSON.stringify(getStory('briefing', 'exodus')).includes(name)));
check('en cada etapa jugable hay trabajo para los cuatro roles',
  ['briefing', 'planning', 'build', 'launch', 'fleet', 'arrival', 'colony', 'finale'].every((stage) => ['scientist', 'merchant', 'engineer', 'pilot'].every((role) => stageTasks(stage, 'exodus').some((task) => task.role === role))));
const stageMap = { briefing: 'yard', planning: 'yard', build: 'yard', launch: 'yard', fleet: 'bridge', arrival: 'bridge', colony: 'colony', finale: 'colony' };
check('todas las tareas usan puestos que existen en el mapa de su etapa, y cada mapa tiene tablero y palanca',
  Object.entries(stageMap).every(([stage, mapId]) => stageTasks(stage, 'exodus').every((task) => [task.at, task.from, task.to].filter(Boolean).every((id) => MAPS[mapId].stations.some((station) => station.id === id))))
  && ['yard', 'bridge', 'colony'].every((mapId) => ['board', 'lever'].every((id) => MAPS[mapId].stations.some((station) => station.id === id))));
check('el astillero tiene una grada por arca', ARKS.every((ark) => MAPS.yard.stations.some((station) => station.id === `${ark.id}.bay` && station.ark === ark.id)));

// ------------------------------------------------------------
console.log('\n2) Repartir los recursos');
const game = newGame(7);
check('la misión se inicia y empieza en el astillero', !game.started.error && game.data().missionId === 'exodus' && mapIdFor(game.data()) === 'yard' && leftOf(game.data().fleet) === FLEET_POOL);
game.next();
check('después del informe viene el Reparto', game.stage() === 'planning');
check('solo Comercio reparte', Boolean(game.send(ana, { type: 'fleet:allot', ark: 'john', system: 'fuel', delta: 1 }).error));
check('no se puede bajar de cero', Boolean(game.send(meche, { type: 'fleet:allot', ark: 'john', system: 'fuel', delta: -1 }).error));
check('un arca o un sistema que no existe se rechaza', Boolean(game.send(meche, { type: 'fleet:allot', ark: 'yoko', system: 'fuel', delta: 1 }).error) && Boolean(game.send(meche, { type: 'fleet:allot', ark: 'john', system: 'magia', delta: 1 }).error));
const blocked = game.send(ana, { type: 'stage:advance' });
check(`sin repartir no se pasa a construir ("${blocked.error}")`, Boolean(blocked.error) && game.stage() === 'planning');
let fleet = freshFleet();
for (let n = 0; n < 40; n++) { const next = allot(fleet, ARKS[n % 4].id, SYSTEM_IDS[n % 3], 1); if (next.fleet) fleet = next.fleet; }
check('no se puede repartir más de lo que hay ni pasarse del máximo por sistema', leftOf(fleet) === 0 && Boolean(allot(fleet, 'paul', 'cargo', 1).error));
game.allot(CAREFUL);
check(`el reparto cuidadoso usa los ${FLEET_POOL} recursos y cubre a las cuatro`, leftOf(game.data().fleet) === 0 && ARKS.every((ark) => shortfalls(game.data().fleet, ark.id).length === 0));
check('solo Vuelo elige la ruta', Boolean(game.send(meche, { type: 'fleet:route', route: 'safe' }).error) && !game.send(ana, { type: 'fleet:route', route: 'safe' }).error && game.data().fleet.routeDecided);

// ------------------------------------------------------------
console.log('\n3) Construir y lanzar las cuatro arcas');
game.next();
check('empieza la Construcción', game.stage() === 'build');
check('Ingeniería no instala la propulsión sin los materiales de Comercio', Boolean(game.send(ines, { type: 'task:done', id: 'exodus.build.john.engines' }).error));
game.tasks();
check('entre los cuatro construyen las cuatro arcas (16 trabajos)', stageTasks('build', 'exodus').length === 16 && stageTasks('build', 'exodus').every((task) => isTaskDone(game.data(), task)));
game.send(meche, { type: 'fleet:allot', ark: 'paul', system: 'cargo', delta: -1 });
game.send(meche, { type: 'fleet:allot', ark: 'paul', system: 'cargo', delta: -1 });
const emptyArk = game.send(ana, { type: 'stage:advance' });
check(`un arca vacía no puede despegar ("${emptyArk.error}")`, Boolean(emptyArk.error) && game.stage() === 'build');
game.allot(CAREFUL);
game.send(ana, { type: 'stage:advance' });
check('empiezan los Lanzamientos', game.stage() === 'launch');
check('ya no se puede cambiar el reparto', Boolean(game.send(meche, { type: 'fleet:allot', ark: 'john', system: 'fuel', delta: -1 }).error));
check('un arca no despega sin combustible cargado', Boolean(game.send(ana, { type: 'task:done', id: 'exodus.launch.ringo.go' }).error));
game.tasks();
check('las cuatro arcas despegan, una por una', ARKS.every((ark) => game.data().tasks[`exodus.launch.${ark.id}.go`]?.done));

// ------------------------------------------------------------
console.log('\n4) El viaje de la flota y la llegada');
game.send(ana, { type: 'stage:advance' });
check('la tripulación pasa al puente de la flota', game.stage() === 'fleet' && mapIdFor(game.data()) === 'bridge');
check('la ruta ya no se cambia en pleno viaje', Boolean(game.send(ana, { type: 'fleet:route', route: 'fast' }).error));
check('sin atender la flota no se llega', Boolean(game.send(ana, { type: 'stage:advance' }).error));
game.next();
const journey = game.data().fleet.journey;
check(`con el reparto cuidadoso llegan las cuatro arcas (${ARKS.map((ark) => `${ark.name} ${journey.arks[ark.id].integrity} %`).join(', ')})`, journey.arrived === 4 && game.stage() === 'arrival');
check('la bitácora explica qué le pasó a cada arca', ARKS.every((ark) => game.data().log.some((line) => line.startsWith(`${ark.name}:`))));
check('el viaje es el mismo si se calcula otra vez (sale de las decisiones, no de la suerte del momento)', JSON.stringify(resolveJourney(game.data().fleet, game.state.secret.seed)) === JSON.stringify({ ...journey }));
const landedAll = game.next();
check(`después de aterrizar, la tripulación está en la colonia${landedAll.error ? ` (${landedAll.error})` : ''}`, game.stage() === 'colony' && mapIdFor(game.data()) === 'colony');

// ------------------------------------------------------------
console.log('\n5) La colonia y el final');
check('sin levantar la colonia no se pasa al final', Boolean(game.send(ana, { type: 'stage:advance' }).error));
game.tasks();
check('cada arca aportó lo suyo a la colonia', ARKS.every((ark) => stageTasks('colony', 'exodus').filter((task) => task.ark === ark.id).length === 2 && stageTasks('colony', 'exodus').filter((task) => task.ark === ark.id).every((task) => game.data().tasks[task.id]?.done)));
game.send(ana, { type: 'stage:advance' });
check('queda el último acto: el Prisma', game.stage() === 'finale' && !game.data().fleet.result);
check('sin llevar el Prisma al monumento no termina', Boolean(game.send(ana, { type: 'stage:advance' }).error));
const end = game.next();
const done = game.data();
check(`la campaña termina: "${done.fleet.result?.text}"`, !end.error && done.fleet.result.ok === true && game.stage() === 'debrief' && mapIdFor(done) === 'colony');
check('Across the Universe queda completada', done.campaign.missions.exodus === 'completed');
check(`hay puntaje para los cuatro y resumen de la flota (${done.score.final.teamPoints} puntos, colonia ${done.score.final.fleet.colony} %)`,
  Boolean(done.score.final) && done.score.final.fleet.arrived === 4 && crew.every((member) => done.score.players[member.id]?.points > 0));

// ------------------------------------------------------------
console.log('\n6) Las decisiones pesan');
const brave = playThrough(newGame(7), { john: [3, 2, 2], ringo: [3, 3, 3], george: [3, 2, 3], paul: [1, 1, 1] }, 'fast');
const lostOne = brave.data().fleet.journey;
check(`ruta corta dejando a Paul casi sin nada: Paul no llega, las otras tres sí`, lostOne.arks.paul.lost && lostOne.arrived === 3 && !brave.stuck);
check('con tres arcas igual se funda la colonia, y los trabajos de Paul ya no se piden', brave.data().fleet.result?.ok === true && !brave.data().tasks['exodus.colony.paul.archive']);
check('pero la colonia queda menos completa que con las cuatro', colonyLevel(lostOne) < colonyLevel(journey) || colonyLevel(lostOne) < 1);
const reckless = playThrough(newGame(7), { john: [1, 1, 1], ringo: [1, 1, 1], george: [1, 1, 1], paul: [1, 1, 1] }, 'fast');
const wreck = reckless.data();
check(`todo al mínimo y por la ruta corta: llegan ${wreck.fleet.journey.arrived} arcas y la misión falla ("${wreck.fleet.result?.text}")`,
  wreck.fleet.journey.arrived < MIN_ARKS && wreck.fleet.result.ok === false && reckless.stage() === 'debrief' && wreck.campaign.missions.exodus !== 'completed');
const tidy = playThrough(newGame(7), { john: [1, 1, 1], ringo: [1, 1, 1], george: [1, 1, 1], paul: [1, 1, 1] }, 'safe');
check('un reparto pobre por la ruta larga no es el fin: las arcas llegan dañadas pero llegan', tidy.data().fleet.journey.arrived >= MIN_ARKS && tidy.data().fleet.result?.ok === true && colonyLevel(tidy.data().fleet.journey) < 0.5);
const retry = reckless.send(ana, { type: 'mission:retry' });
check('después de fallar se vuelve al astillero con las arcas construidas, a repartir de nuevo',
  !retry.error && reckless.stage() === 'planning' && reckless.data().fleet.journey === null && reckless.data().tasks['exodus.build.john.engines']?.done === true && !reckless.data().tasks['exodus.launch.john.go'] && reckless.data().attempt === 2);
playThrough(reckless, CAREFUL, 'safe');
check('y el segundo intento, bien repartido, termina la campaña', reckless.data().fleet.result?.ok === true && reckless.data().campaign.missions.exodus === 'completed');

// ------------------------------------------------------------
console.log('\n7) Una sola persona termina la campaña');
const sol = { id: 'Sol', name: 'Sol', role: 'merchant', isHost: true, canActAs: () => true };
const alone = playThrough(newGame(3, [sol]), CAREFUL, 'safe');
check(`sola, de principio a fin${alone.stuck ? ` (se trabó: ${alone.stuck})` : ''}: "${alone.data().fleet.result?.text}"`, alone.data().fleet.result?.ok === true && alone.data().campaign.missions.exodus === 'completed');

// ------------------------------------------------------------
console.log('\n8) Balance: no hay un reparto perfecto');
let best = 0;
for (const route of ['safe', 'fast']) for (const spare of ARKS) for (const system of SYSTEM_IDS) {
  let trial = freshFleet();
  for (const ark of ARKS) for (const id of SYSTEM_IDS) for (let n = 0; n < ark.needs[id]; n++) trial = allot(trial, ark.id, id, 1).fleet;
  for (let n = 0; n < 3; n++) trial = allot(trial, spare.id, system, 1).fleet ?? trial;
  best = Math.max(best, colonyLevel(resolveJourney({ ...trial, route }, 7)));
}
check(`ni el mejor de los repartos simples llega al 100 % de colonia (el mejor: ${Math.round(best * 100)} %): siempre se elige qué cuidar`, best < 1 && best >= 0.6);

console.log(failures === 0 ? `\nTODO OK ✅ (${checks} verificaciones de las arcas)` : `\n${failures} de ${checks} verificaciones fallaron ❌`);
process.exit(failures === 0 ? 0 : 1);
