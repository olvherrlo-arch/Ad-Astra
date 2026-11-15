/**
 * PRUEBAS DEL VUELO
 * Partidas "de escritorio" (sin red) contra las reglas del servidor: compran el cohete de referencia,
 * lo arman, despegan y vuelan a la Luna y de vuelta. Con semillas fijas, para que se repitan.
 * Uso: npm test
 */
import { installedUids } from '../js/assembly.js';
import { EXAMPLE_BLUEPRINTS } from '../js/blueprints.js';
import { getPart } from '../js/catalog.js';
import { getMission, missionFor } from '../js/missions.js';
import { ONBOARD_STORAGE, scienceReport } from '../js/science.js';
import { applyAction, createInitialState, isGameAction, publicState } from '../server/game.js';
import { BONUS, GUIDANCE, startFlight } from '../server/flight.js';
import { addRecord, listRecords, resetRecords } from '../server/records.js';
import { doStageTasks } from './helpers.js';

let failures = 0;
let checks = 0;
const check = (label, passed) => {
  checks++;
  console.log(`${passed ? '  ✔' : '  ✘'} ${label}`);
  if (!passed) failures++;
};

const person = (name, role, isHost = false) => ({ id: name, name, role, isHost, canActAs: (wanted) => wanted === role });
const ana = person('Ana', 'pilot', true);
const meche = person('Meche', 'merchant');
const ines = person('Inés', 'engineer');
const caro = person('Caro', 'scientist');
const crew = [ana, meche, ines, caro];
const legs = getMission('moon').flightPlan;
const slotOrder = { core: 0, engines: 1, mounted: 2 };

/** Una partida nueva lista para despegar con el cohete de referencia. `extra` = piezas de más para comprar. */
const newGame = (seed, { extra = [], tweak = null } = {}) => {
  const game = { state: createInitialState() };
  game.state.secret.seed = seed;
  game.send = (who, action) => {
    if (!isGameAction(action)) return { error: 'Acción mal formada.' };
    const result = applyAction(game.state, action, { ...who, players: crew });
    if (result.state) game.state = result.state;
    return result;
  };
  game.data = () => game.state.data;
  game.ship = () => game.state.secret.ship;
  game.stage = () => getMission('moon').stages[game.data().stageIndex].id;
  game.next = () => {
    doStageTasks(game.send, game.data, game.stage(), (role) => crew.find((member) => member.role === role));
    return game.send(ana, { type: 'stage:advance' });
  };
  while (game.data().scene === 'prologue') game.send(ana, { type: 'story:next' });
  game.send(ana, { type: 'mission:start', missionId: 'moon' });
  while (game.data().scene === 'briefing') game.send(ana, { type: 'story:next' });
  game.next();
  game.next();
  const wanted = new Map();
  for (const partId of [...EXAMPLE_BLUEPRINTS.moon.stages.flat(), ...extra]) wanted.set(partId, (wanted.get(partId) ?? 0) + 1);
  for (const [partId, quantity] of wanted) game.send(meche, { type: 'market:buy', offerId: `${partId}:common`, quantity });
  game.next();
  const free = (partId) => game.data().economy.inventory.find((i) => i.partId === partId && !installedUids(game.data().rocket).includes(i.uid))?.uid;
  EXAMPLE_BLUEPRINTS.moon.stages.forEach((partIds, stage) => {
    const ordered = [...partIds].sort((a, b) => slotOrder[getPart(a).slot] - slotOrder[getPart(b).slot]);
    for (const partId of ordered) game.send(ines, { type: 'build:place', uid: free(partId), stage });
  });
  for (const partId of extra) game.send(ines, { type: 'build:place', uid: free(partId), stage: 4 });
  tweak?.(game);
  game.next(); // Construcción → Validación
  game.launch = game.next(); // Validación → Vuelo
  return game;
};

/**
 * Pilotea con cuidado: apunta justo a lo que falta y corrige; resuelve emergencias reparando si alcanza.
 * En la Luna, Ciencia escanea justo donde está el Prisma (la prueba conoce el secreto del servidor),
 * Ingeniería perfora y Comercio lo carga.
 */
const fly = (game, { overshoot = 0, maxSteps = 200, onEmergency = null } = {}) => {
  for (let step = 0; step < maxSteps; step++) {
    const flight = game.data().flight;
    if (flight.phase === 'over') return flight;
    if (flight.phase === 'emergency') {
      if (onEmergency) { onEmergency(game, flight.emergency); continue; }
      const repair = flight.emergency.options.find((o) => o.id === 'repair');
      const pick = repair && repair.cost <= game.data().economy.credits ? repair : flight.emergency.options.find((o) => o.id === 'abandon');
      for (const role of pick.needs) game.send(crew.find((c) => c.role === role), { type: 'flight:resolve', option: pick.id, role });
      continue;
    }
    const leg = legs[flight.legIndex];
    if (leg.id === 'surface') {
      if (flight.prism) game.send(ana, { type: 'flight:proceed' });
      else if (flight.dug) game.send(meche, { type: 'flight:load' });
      else if (flight.located) game.send(ines, { type: 'flight:dig' });
      else game.send(caro, { type: 'flight:scan', ...game.ship().prismSpot });
      continue;
    }
    if (leg.dv === 0) { game.send(ana, { type: 'flight:proceed' }); continue; }
    const remaining = leg.dv - flight.progress;
    const result = game.send(ana, { type: 'flight:burn', dv: Math.round(remaining * (1 + overshoot)) || 1 });
    if (result.error) throw new Error(`no se pudo encender: ${result.error}`);
  }
  return game.data().flight;
};

// ------------------------------------------------------------
console.log('1) Despegue');
const game = newGame(42);
check('al salir de Validación la nave despega y empieza el vuelo', !game.launch.error && game.stage() === 'flight' && game.data().flight.legIndex === 0);
check('la nave con sus números verdaderos no viaja a los navegadores',
  !('secret' in publicState(game.state)) && !JSON.stringify(publicState(game.state)).includes('failureRate') && Boolean(game.ship()));
const start = game.data().flight.telemetry;
check(`la telemetría muestra masa, Δv y batería (${Math.round(start.mass / 1000)} t, ${Math.round(start.deltaVLeft)} m/s)`,
  start.mass > 2e6 && start.deltaVLeft > 17_000 && start.energy === start.energyCapacity && start.stages.length === 5);
check(`la precisión depende del equipo y del entrenamiento: computadora básica y piloto entrenado, error típico ±${(game.data().flight.precision.sigma * 100).toFixed(1)} %`,
  game.data().flight.precision.sigma === GUIDANCE.basic * BONUS.sim && game.data().flight.precision.reasons.length >= 2);
check('solo Vuelo enciende los motores', Boolean(game.send(ines, { type: 'flight:burn', dv: 100 }).error));
check('solo Ciencia busca el Prisma, y solo en la Luna', Boolean(game.send(ana, { type: 'flight:scan', x: 900, y: 500 }).error) && Boolean(game.send(caro, { type: 'flight:scan', x: 900, y: 500 }).error));
check('durante el viaje nadie pasa de etapa a mano', Boolean(game.next().error) && game.stage() === 'flight');
check('el lugar del Prisma solo lo sabe el servidor', Boolean(game.ship().prismSpot) && !JSON.stringify(publicState(game.state)).includes('prismSpot'));

console.log('\n2) Encendidos');
const before = game.data().flight.telemetry;
game.send(ana, { type: 'flight:burn', dv: 4_000 });
const half = game.data().flight;
check('quemar menos de lo que pide el tramo lo deja a medias', half.legIndex === 0 && half.progress > 3_500 && half.progress < 4_500);
check('el encendido gasta combustible y baja la masa', half.telemetry.mass < before.mass && half.telemetry.deltaVLeft < before.deltaVLeft);
check('la etapa que se vacía se suelta', game.ship().stages.length <= 5);
fly(game, { maxSteps: 3 });
check('con encendidos de corrección se termina el tramo', game.data().flight.legIndex >= 1);

console.log('\n3) El viaje completo');
const final = fly(game);
check(`la nave vuelve con el Prisma ("${final.result?.text}")`, final.result?.ok === true && final.prism === true);
check('al terminar el viaje la misión pasa sola a la Evaluación', game.stage() === 'debrief');
check('la misión queda completada y se abre Life on Mars',
  game.data().campaign.missions.moon === 'completed' && game.data().campaign.missions.mars === 'available');
check(`quedan registros para la evaluación (${final.burns} encendidos, ${Math.round(final.wasted)} m/s de más)`, final.burns >= 7 && final.dvUsed > 17_000);
check('ya no se puede encender nada', Boolean(game.send(ana, { type: 'flight:burn', dv: 10 }).error));

console.log('\n4) Repetible');
const [one, two] = [fly(newGame(42)), fly(newGame(42))];
check('con la misma semilla, el mismo vuelo da lo mismo', one.burns === two.burns && Math.round(one.dvUsed) === Math.round(two.dvUsed) && one.burns > 0);
let wins = 0;
for (let seed = 1; seed <= 30; seed++) if (fly(newGame(seed)).result?.ok) wins++;
check(`volando con cuidado, el cohete de referencia vuelve casi siempre (${wins} de 30)`, wins >= 22);
let sloppy = 0;
for (let seed = 1; seed <= 30; seed++) if (fly(newGame(seed), { overshoot: 0.05 }).result?.ok) sloppy++;
check(`pasándose un 5 % en cada encendido, el combustible no alcanza (${sloppy} de 30 vuelven)`, sloppy < wins && sloppy <= 3);

console.log('\n5) Emergencias');
const broken = newGame(7);
for (const stage of broken.ship().stages) for (const item of stage.items) if (item.kind === 'engine') item.failureRate = 5;
broken.send(ana, { type: 'flight:burn', dv: 1_500 });
const emergency = broken.data().flight.emergency;
check(`un motor que falla abre una emergencia ("${emergency?.title}")`, broken.data().flight.phase === 'emergency' && emergency.kind === 'engine');
check('el encendido se cortó a mitad', broken.data().flight.progress < 1_500 * 0.8);
check('dice de dónde venía la pieza', emergency.text.includes('mercado legal'));
check('con la emergencia abierta no se puede seguir encendiendo', Boolean(broken.send(ana, { type: 'flight:burn', dv: 100 }).error));
const repair = emergency.options.find((o) => o.id === 'repair');
check(`reparar pide a Ingeniería y a Comercio, y cuesta ${repair.cost} créditos`, repair.needs.join() === 'engineer,merchant' && repair.cost > 0);
check('quien no participa en una salida no puede sumarse', Boolean(broken.send(caro, { type: 'flight:resolve', option: 'repair', role: 'scientist' }).error));
const credits = broken.data().economy.credits;
broken.send(ines, { type: 'flight:resolve', option: 'repair', role: 'engineer' });
check('con una sola parte hecha la emergencia sigue abierta', broken.data().flight.phase === 'emergency');
broken.send(meche, { type: 'flight:resolve', option: 'repair', role: 'merchant' });
const fixed = broken.ship().stages.flatMap((s) => s.items).find((i) => i.uid === emergency.uid);
check('con los dos, se repara: el motor vuelve y se paga el repuesto',
  broken.data().flight.phase === 'ready' && !fixed.failed && fixed.repaired && broken.data().economy.credits === credits - repair.cost);
const secondBurn = broken.send(ana, { type: 'flight:burn', dv: 100 });
const second = broken.data().flight.emergency;
broken.send(ana, { type: 'flight:resolve', option: 'abandon', role: 'pilot' });
check('seguir sin el motor lo deja apagado: la etapa empuja menos',
  broken.ship().stages.flatMap((s) => s.items).find((i) => i.uid === second?.uid)?.failed === true && broken.data().flight.telemetry.stages[0].enginesWorking < broken.data().flight.telemetry.stages[0].engines);

console.log('\n6) Mercado negro: el defecto oculto aparece en vuelo');
const shady = newGame(10, {
  tweak: (g) => {
    const engine = g.data().economy.inventory.find((i) => i.partId === 'engine-atm-l');
    Object.assign(engine, { source: 'black', sellerId: 'muelle9', inspected: null });
    g.state.secret.vault.items[engine.uid] = { quality: 0.2, condition: 'used', defect: 50 };
  },
});
shady.ship().perks = {}; // sin motores probados en el banco: se ve el defecto tal cual
const defective = shady.ship().stages[0].items.find((i) => i.source === 'black');
check('en la nave, la pieza vuela con su verdad: falla mucho más que lo anunciado', defective.failureRate > 0.5);
shady.send(ana, { type: 'flight:burn', dv: 9_390 });
check(`y cuando falla, la emergencia lo cuenta ("${shady.data().flight.emergency?.text}")`,
  shady.data().flight.emergency?.text.includes('mercado negro') && shady.data().flight.emergency?.text.includes('sin inspección'));

console.log('\n7) Combustible y energía');
const dry = newGame(5);
for (const stage of dry.ship().stages) stage.propellant *= 0.5;
const stranded = fly(dry);
check(`sin combustible suficiente, la misión falla ("${stranded.result?.text}")`, stranded.result?.ok === false);
check('y salta a la Evaluación', dry.stage() === 'debrief');
check('la misión no queda completada', dry.data().campaign.missions.moon === 'in_progress');

const dark = newGame(6);
for (const stage of dark.ship().stages) stage.items = stage.items.filter((i) => i.partId !== 'solar-panel');
const blackout = fly(dark);
check(`sin paneles, las baterías no alcanzan el viaje: falla por energía ("${blackout.result?.text}")`, blackout.result?.ok === false && blackout.result.text.includes('energía'));

check('el modo ahorro existe y solo lo cambia Ingeniería',
  Boolean(newGame(8).send(ana, { type: 'flight:power', mode: 'saving' }).error));
const surface = newGame(11);
const reachSurface = () => {
  for (let i = 0; i < 100 && legs[surface.data().flight.legIndex]?.id !== 'surface' && surface.data().flight.phase !== 'over'; i++) fly(surface, { maxSteps: 1 });
};
reachSurface();
surface.send(ines, { type: 'flight:power', mode: 'saving' });
const spot = surface.ship().prismSpot;
check('en modo ahorro el espectrómetro está apagado: no se puede buscar', Boolean(surface.send(caro, { type: 'flight:scan', x: 300, y: 560 }).error));
surface.send(ines, { type: 'flight:power', mode: 'normal' });
check('antes de ubicar el Prisma no se puede perforar', Boolean(surface.send(ines, { type: 'flight:dig' }).error));
const energy = surface.data().flight.telemetry.energy;
surface.send(caro, { type: 'flight:scan', x: 300, y: 560 });
const ping = surface.data().flight.pings.at(-1);
check('cada búsqueda gasta energía de la batería', surface.data().flight.telemetry.energy < energy || surface.data().flight.phase === 'emergency');
if (surface.data().flight.phase !== 'emergency') {
  const real = Math.hypot(300 - spot.x, 560 - spot.y);
  check(`un escaneo lejos del Prisma da la distancia desde ese punto (midió ${ping?.d} m, eran ${Math.round(real)})`,
    Boolean(ping) && Math.abs(ping.d - real) < real * 0.2 && surface.data().flight.located === null);
  surface.send(caro, { type: 'flight:scan', x: spot.x + 30, y: spot.y - 20 });
  if (surface.data().flight.phase !== 'emergency') {
    check('escanear cerca lo ubica: aparece el punto donde perforar', surface.data().flight.located?.x === spot.x);
    check('cargarlo sin perforar no se puede', Boolean(surface.send(meche, { type: 'flight:load' }).error));
    check('solo Ingeniería perfora', Boolean(surface.send(caro, { type: 'flight:dig' }).error) && !surface.send(ines, { type: 'flight:dig' }).error);
    const massBefore = surface.data().flight.telemetry.mass;
    check('con el Prisma a la vista, se carga y suma masa', !surface.send(meche, { type: 'flight:load' }).error
      && surface.data().flight.prism === true && surface.data().flight.telemetry.mass > massBefore);
  }
}
check('irse sin el Prisma no se puede mientras no falle la búsqueda',
  surface.data().flight.prism || Boolean(surface.send(ana, { type: 'flight:proceed' }).error));

console.log('\n8) Señal y precisión');
const relayless = newGame(12, {
  tweak: (g) => {
    const uid = g.data().rocket.stages[4].mounted.find((u) => g.data().economy.inventory.find((i) => i.uid === u).partId === 'relay-sat');
    g.send(ines, { type: 'build:remove', uid });
  },
});
for (let i = 0; i < 100 && legs[relayless.data().flight.legIndex]?.id !== 'descent' && relayless.data().flight.phase !== 'over'; i++) fly(relayless, { maxSteps: 1 });
check('sin repetidor, detrás de la Luna no hay señal y los encendidos pierden precisión',
  relayless.data().flight.signal === false && relayless.data().flight.precision.sigma === GUIDANCE.basic * GUIDANCE.noSignal);
const smart = newGame(13, { extra: ['flight-computer'] });
check('con la computadora de vuelo avanzada, los encendidos son más precisos', smart.data().flight.precision.sigma === GUIDANCE.advanced * BONUS.sim);

console.log('\n9) Pilotear con las manos y preparar cada encendido');
const hands = newGame(21);
const sigma0 = hands.data().flight.precision.sigma;
check('solo Ciencia fija la posición con las estrellas', Boolean(hands.send(ana, { type: 'flight:prep', kind: 'nav' }).error) && !hands.send(caro, { type: 'flight:prep', kind: 'nav' }).error);
check('con la posición fijada, el próximo encendido es más preciso', hands.data().flight.precision.sigma < sigma0 && hands.data().flight.prep.nav === true);
check('no se prepara dos veces lo mismo', Boolean(hands.send(caro, { type: 'flight:prep', kind: 'nav' }).error));
check('Ingeniería ajusta los motores', !hands.send(ines, { type: 'flight:prep', kind: 'trim' }).error && hands.data().flight.prep.trim === true);
hands.send(meche, { type: 'carry:pick', id: 'cargo' });
check('Comercio levanta una caja suelta y todos lo ven', Object.values(hands.data().carrying).some((held) => held.id === 'cargo'));
hands.send(meche, { type: 'carry:drop', id: 'cargo' });
check('con una caja sola la carga todavía no está asegurada', hands.data().flight.prep.cargo === false && hands.data().jobs.cargo === 1);
hands.send(meche, { type: 'carry:pick', id: 'cargo' });
hands.send(meche, { type: 'carry:drop', id: 'cargo' });
check('con las dos cajas en los estantes, la carga queda asegurada', hands.data().flight.prep.cargo === true && Object.keys(hands.data().carrying).length === 0);
hands.send(ana, { type: 'flight:burn', dv: 500, aim: 1 });
check('los preparativos se gastan en el encendido', Object.values(hands.data().flight.prep).every((done) => done === false));
const spread = (aim) => {
  let worst = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const trial = newGame(seed);
    trial.ship().perks = {};
    trial.send(ana, { type: 'flight:burn', dv: 1_000, ...(aim === null ? {} : { aim }) });
    if (trial.data().flight.phase !== 'emergency') worst = Math.max(worst, Math.abs(trial.data().flight.progress - 1_000));
  }
  return worst;
};
const [steady, shaky] = [spread(1), spread(0)];
check(`apuntar bien achica el error del encendido (peor caso ${steady.toFixed(1)} m/s contra ${shaky.toFixed(1)} apuntando mal)`, steady < shaky);

const lander = newGame(22);
for (let i = 0; i < 100 && legs[lander.data().flight.legIndex]?.id !== 'descent' && lander.data().flight.phase !== 'over'; i++) fly(lander, { maxSteps: 1 });
const descent = legs.find((leg) => leg.id === 'descent');
const wastedBefore = lander.data().flight.wasted;
lander.send(ana, { type: 'flight:burn', dv: Math.round(descent.dv * 1.04), aim: 0.8, touchdown: 'crash' });
check('alunizar a mano termina el tramo; lo quemado de más es gasto', lander.data().flight.legIndex > legs.indexOf(descent) && lander.data().flight.wasted > wastedBefore + descent.dv * 0.03);
check(`estrellarse al alunizar abre una emergencia ("${lander.data().flight.emergency?.title}")`, lander.data().flight.emergency?.kind === 'leak');
const kitCost = lander.data().flight.emergency.options.find((o) => o.id === 'repair');
check('con el kit de repuestos a bordo, la primera reparación cuesta la mitad', kitCost.kit === true && kitCost.detail.includes('la mitad'));
lander.send(meche, { type: 'carry:pick', id: 'spare' });
check('Comercio saca el repuesto del pañol', lander.data().carrying[meche.id]?.item === 'spare');
lander.send(meche, { type: 'flight:resolve', option: 'repair', role: 'merchant' });
check('al entregarlo en la avería ya no lo lleva', !lander.data().carrying[meche.id] && lander.data().flight.phase === 'emergency');
lander.send(ines, { type: 'flight:resolve', option: 'repair', role: 'engineer' });
check('e Ingeniería termina la reparación: la misión sigue en la Luna', lander.data().flight.phase === 'ready' && lander.stage() === 'surface');
check('Vuelo despliega el panel de campo y recarga la batería',
  Boolean(lander.send(caro, { type: 'flight:solar' }).error) && !lander.send(ana, { type: 'flight:solar' }).error && lander.data().flight.solar === true);

console.log('\n6) Puntaje individual y resumen final');
{
  const scored = newGame(42);
  const atLaunch = scored.data().score;
  check('al despegar ya hay puntos por tareas, armado y compras',
    atLaunch.players[ines.id]?.notes.some((n) => n.label === 'Cohete aprobado para despegar')
    && atLaunch.players[meche.id]?.notes.some((n) => n.label === 'Compras para la misión')
    && atLaunch.players[ana.id]?.notes.some((n) => n.label === '¡Despegue!'));
  check('cada rol suma puntos con sus tareas', crew.every((member) => (atLaunch.players[member.id]?.points ?? 0) > 0));
  // Una tarea ya hecha no vuelve a sumar: el servidor la rechaza y el puntaje no cambia.
  const pointsBefore = atLaunch.players[caro.id].points;
  const repeat = scored.send(caro, { type: 'task:done', id: 'briefing.scope', quality: 1 });
  check('repetir una acción no suma dos veces', Boolean(repeat.error) && scored.data().score.players[caro.id].points === pointsBefore);
  // Precisión: un encendido apuntando bien vale más que uno apuntando mal (mismo Δv).
  const burnPoints = (aim) => {
    const trial = newGame(7);
    trial.ship().perks = {};
    const before = trial.data().score.players[ana.id].points;
    trial.send(ana, { type: 'flight:burn', dv: 1_000, aim });
    return trial.data().score.players[ana.id].points - before;
  };
  const [good, bad] = [burnPoints(1), burnPoints(0)];
  check(`la precisión cuenta: buen encendido ${good} pts contra ${bad} apuntando mal`, good > bad && bad > 0);
  // La precisión que mide un minijuego se guarda; una inventada fuera de rango se recorta a 0..1.
  let early = { state: createInitialState() };
  const sendEarly = (who, action) => {
    const result = applyAction(early.state, action, { ...who, players: crew });
    if (result.state) early.state = result.state;
    return result;
  };
  while (early.state.data.scene === 'prologue') sendEarly(ana, { type: 'story:next' });
  sendEarly(ana, { type: 'mission:start', missionId: 'moon' });
  while (early.state.data.scene === 'briefing') sendEarly(ana, { type: 'story:next' });
  sendEarly(caro, { type: 'task:done', id: 'briefing.scope', quality: 0.5 });
  sendEarly(ana, { type: 'task:done', id: 'briefing.window', quality: 7 });
  const notesOf = (who) => early.state.data.score.players[who.id].notes;
  check('la precisión que mide el minijuego queda registrada', notesOf(caro)[0].q === 0.5 && early.state.data.score.players[caro.id].measured.count === 1);
  check('una precisión fuera de rango se recorta (nunca más que perfecto)', notesOf(ana)[0].q === 1);
  fly(scored);
  const final = scored.data().score.final;
  check(`al terminar hay resumen del equipo (${final?.teamPoints} pts, ${final?.objectivesDone}/${final?.objectivesTotal} objetivos)`,
    Boolean(final) && final.ok === true && final.teamPoints > 0 && final.objectivesDone > 0 && final.objectivesDone <= final.objectivesTotal);
  check('el resumen trae lo mejor del equipo', final.highlights.length > 0);
  check('los puntos del equipo son la suma de los de cada uno',
    final.teamPoints === Object.values(scored.data().score.players).reduce((sum, p) => sum + p.points, 0));
  check('todos reciben el bono de misión cumplida', crew.every((member) => scored.data().score.players[member.id].notes.some((n) => n.label === 'Misión cumplida')));
  check('el puntaje viaja en el estado público (todos ven lo mismo)', JSON.stringify(publicState(scored.state)).includes('"teamPoints"'));
  const frozen = JSON.stringify(scored.data().score);
  scored.send(ana, { type: 'stage:advance' });
  check('después del resumen el puntaje no cambia solo', JSON.stringify(scored.data().score) === frozen);
  check('elegir otra misión empieza un puntaje nuevo', (() => {
    const again = newGame(5);
    return Object.keys(again.data().score.players).length > 0 && again.data().score.final === null;
  })());
}

console.log('\n7) Rediseñar y volver a volar');
{
  // Pasarse 5 % en cada encendido hace fallar el vuelo (ver el balance de arriba).
  const retry = newGame(3);
  fly(retry, { overshoot: 0.05 });
  const failed = retry.data();
  check('el vuelo descuidado termina en la Evaluación sin el Prisma', retry.stage() === 'debrief' && failed.flight.result && !failed.flight.result.ok);
  check('solo el anfitrión decide volver a intentar', Boolean(retry.send(meche, { type: 'mission:retry' }).error));
  const pointsAtLaunch = failed.score.beforeLaunch?.players[ana.id]?.points;
  const creditsLeft = failed.economy.credits;
  const rocketBefore = JSON.stringify(failed.rocket);
  const result = retry.send(ana, { type: 'mission:retry' });
  const again = retry.data();
  check('"Rediseñar y volver a volar" vuelve a Construcción', !result.error && retry.stage() === 'build' && again.flight === null && again.attempt === 2);
  check('se conservan el cohete, la bodega y el dinero que quedó', JSON.stringify(again.rocket) === rocketBefore && again.economy.credits === creditsLeft);
  check('el puntaje vuelve a como estaba antes del despegue', again.score.final === null && again.score.players[ana.id].points === pointsAtLaunch);
  check('fuera de la Evaluación no se puede volver a intentar', Boolean(retry.send(ana, { type: 'mission:retry' }).error));
  retry.next(); // Construcción → Validación
  const relaunch = retry.next(); // Validación → Vuelo
  check('se puede volver a despegar', !relaunch.error && retry.stage() === 'flight');
  const second = fly(retry);
  check(`el segundo vuelo, con cuidado, termina ("${second.result?.text}")`, Boolean(second.result) && retry.stage() === 'debrief');
  check('el resumen nuevo es del último vuelo', Boolean(retry.data().score.final) && retry.data().attempt === 2);
}

console.log('\n8) Plan de la misión: lugar y órbita');
{
  const fresh = { state: createInitialState() };
  const sendFresh = (who, action, extra = {}) => {
    const result = applyAction(fresh.state, action, { ...who, players: crew, ...extra });
    if (result.state) fresh.state = result.state;
    return result;
  };
  while (fresh.state.data.scene === 'prologue') sendFresh(ana, { type: 'story:next' });
  sendFresh(ana, { type: 'mission:start', missionId: 'moon' });
  while (fresh.state.data.scene === 'briefing') sendFresh(ana, { type: 'story:next' });
  const legsNow = () => missionFor(fresh.state.data).flightPlan;
  const dv = (id) => legsNow().find((leg) => leg.id === id).dv;
  const low = { loi: dv('loi'), descent: dv('descent') };
  check('Comercio no decide el plan', Boolean(sendFresh(meche, { type: 'plan:set', orbit: 'high' }).error));
  check('Vuelo o Ciencia sí', !sendFresh(caro, { type: 'plan:set', orbit: 'high' }).error && fresh.state.data.plan.orbit === 'high');
  check(`órbita alta: entrar cuesta menos (${dv('loi')} contra ${low.loi} m/s) y bajar cuesta más (${dv('descent')} contra ${low.descent})`,
    dv('loi') < low.loi && dv('descent') > low.descent);
  check('la órbita alta da más señal del repetidor', legsNow().find((leg) => leg.id === 'surface').relayCoverage > 0.6);
  sendFresh(ana, { type: 'plan:set', site: 'pole' });
  const surface = legsNow().find((leg) => leg.id === 'surface');
  check('el polo sur da más ciencia y menos Sol', surface.science > 1 && surface.sun < 0.5);
  check('un lugar que no existe se rechaza', Boolean(sendFresh(ana, { type: 'plan:set', site: 'marte' }).error));
  check('la decisión queda marcada para la lista de tareas', fresh.state.data.plan.decided === true);
  const launched = newGame(42);
  check('después del despegue el plan queda fijo', Boolean(launched.send(ana, { type: 'plan:set', orbit: 'high' }).error));

  console.log('\n9) Ciencia y datos');
  const item = (partId, extra = {}) => ({ ...getPart(partId), ...extra });
  const site = legs.find((leg) => leg.id === 'surface');
  const base = scienceReport({ items: [item('spectrometer'), item('antenna')], leg: site, relay: true });
  check(`un espectrómetro con antena y repetidor manda todo (${base.value}/${base.max})`, base.value === base.max && base.sent === base.generated);
  const greedy = scienceReport({ items: [item('spectrometer'), item('camera'), item('rover'), item('antenna')], leg: site, relay: true });
  check(`más instrumentos: más ciencia posible (${greedy.max}) pero no caben todos los datos (${greedy.sent} de ${greedy.generated} MB)`, greedy.max > base.max && greedy.sent < greedy.generated);
  const ka = scienceReport({ items: [item('spectrometer'), item('camera'), item('rover'), item('antenna-ka')], leg: site, relay: true });
  check(`con antena de banda Ka llega más ciencia (${ka.value} contra ${greedy.value})`, ka.value > greedy.value);
  const noRelay = scienceReport({ items: [item('spectrometer'), item('camera'), item('antenna')], leg: site, relay: false });
  check('sin repetidor, en la cara oculta solo llega lo que cabe en la memoria', noRelay.sent === Math.min(noRelay.generated, ONBOARD_STORAGE));
  const broken = scienceReport({ items: [item('spectrometer', { failed: true }), item('antenna')], leg: site, relay: true });
  check('un instrumento roto no da ciencia', broken.value === 0 && broken.max > 0);
  const saving = scienceReport({ items: [item('spectrometer'), item('antenna')], leg: site, relay: true, saving: true });
  check('en modo ahorro los instrumentos no miden', saving.value === 0);
  const flown = newGame(42);
  fly(flown);
  const final = flown.data().score.final;
  check(`el vuelo real calcula la ciencia en la superficie (${final.science?.value} de ${final.science?.max})`, flown.data().flight.science?.max > 0 && final.science.max > 0);
  check('Ciencia suma puntos por la ciencia enviada', flown.data().score.players[caro.id].notes.some((n) => n.label.startsWith('Ciencia enviada')));

  console.log('\n10) Dificultad');
  const budgetWith = (difficulty) => {
    const game = { state: createInitialState() };
    const send = (action) => { const r = applyAction(game.state, action, { ...ana, players: crew, difficulty }); if (r.state) game.state = r.state; };
    while (game.state.data.scene === 'prologue') send({ type: 'story:next' });
    send({ type: 'mission:start', missionId: 'moon' });
    return game.state.data;
  };
  const [easy, normal, hard] = ['Fácil', 'Normal', 'Difícil'].map(budgetWith);
  check(`el presupuesto depende de la dificultad (${easy.economy.budget} / ${normal.economy.budget} / ${hard.economy.budget})`,
    easy.economy.budget > normal.economy.budget && normal.economy.budget > hard.economy.budget && hard.difficulty === 'Difícil');
  check('una dificultad desconocida queda en Normal', budgetWith('Imposible').difficulty === 'Normal');
  const hardFlight = startFlight({ rocket: flown.data().rocket, inventory: flown.data().economy.inventory, vaultItems: {}, legs, seed: 1, difficulty: 'Difícil' });
  const normalFlight = startFlight({ rocket: flown.data().rocket, inventory: flown.data().economy.inventory, vaultItems: {}, legs, seed: 1 });
  const rate = (f) => f.ship.stages[0].items.find((i) => i.kind === 'engine').failureRate;
  check('en Difícil las piezas fallan más y el guiado se desvía más', rate(hardFlight) > rate(normalFlight) && hardFlight.flight.precision.sigma > normalFlight.flight.precision.sigma);

  console.log('\n11) Tabla de récords');
  resetRecords();
  const row = (ok, points) => ({ team: ['A'], missionId: 'moon', missionTitle: 'Luna', ok, points, science: 0, scienceMax: 0, site: null, orbit: null, difficulty: 'Normal', attempt: 1, objectives: '1/1', at: Date.now() });
  addRecord(row(false, 9_000), { persist: false });
  const second = addRecord(row(true, 3_000), { persist: false });
  addRecord(row(true, 5_000), { persist: false });
  check('las misiones cumplidas van antes que las fallidas, y entre ellas, más puntos primero',
    listRecords().map((r) => r.points).join(',') === '5000,3000,9000' && second === 1);
  resetRecords();
}

console.log('\n12) Un motor que falla al alunizar');
{
  const game = newGame(22);
  for (let i = 0; i < 100 && legs[game.data().flight.legIndex]?.id !== 'descent' && game.data().flight.phase !== 'over'; i++) fly(game, { maxSteps: 1 });
  const descentIndex = legs.findIndex((leg) => leg.id === 'descent');
  check('la prueba llega al alunizaje', game.data().flight.legIndex === descentIndex && game.data().flight.phase === 'ready');
  // Todos los motores que pueden frenar fallan seguro en este encendido.
  for (const stage of game.ship().stages) for (const item of stage.items) if (item.kind === 'engine') item.failureRate = 1;
  game.ship().perks = {};
  const result = game.send(ana, { type: 'flight:burn', dv: legs[descentIndex].dv, aim: 0.9, touchdown: 'soft' });
  const flight = game.data().flight;
  check('el alunizaje pilotado hasta el suelo termina el descenso aunque falle un motor', !result.error && flight.legIndex > descentIndex);
  check('la falla no se pierde: la nave toca el suelo más fuerte y se cuenta en la bitácora',
    flight.touchdown === 'hard' && flight.events.some((event) => event.text.includes('falló en los últimos metros del descenso')));
  check('no queda una emergencia de motor a mitad de un descenso ya hecho', flight.emergency?.kind !== 'engine');
  check('el motor que falló queda roto', game.ship().stages.some((stage) => stage.items.some((item) => item.kind === 'engine' && item.failed)));
}

console.log(failures === 0 ? `\nTODO OK ✅ (${checks} verificaciones del vuelo)` : `\n${failures} verificación(es) fallaron ❌`);
process.exit(failures === 0 ? 0 : 1);
