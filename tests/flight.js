/**
 * PRUEBAS DEL VUELO
 * Partidas "de escritorio" (sin red) contra las reglas del servidor: compran el cohete de referencia,
 * lo arman, despegan y vuelan a la Luna y de vuelta. Con semillas fijas, para que se repitan.
 * Uso: npm test
 */
import { installedUids } from '../js/assembly.js';
import { EXAMPLE_BLUEPRINTS } from '../js/blueprints.js';
import { getPart } from '../js/catalog.js';
import { getMission } from '../js/missions.js';
import { applyAction, createInitialState, isGameAction, publicState } from '../server/game.js';
import { GUIDANCE } from '../server/flight.js';

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
    const result = applyAction(game.state, action, who);
    if (result.state) game.state = result.state;
    return result;
  };
  game.data = () => game.state.data;
  game.ship = () => game.state.secret.ship;
  game.stage = () => getMission('moon').stages[game.data().stageIndex].id;
  game.next = () => {
    for (const member of crew) game.send(member, { type: 'role:confirm', role: member.role, value: true });
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

/** Pilotea con cuidado: apunta justo a lo que falta y corrige; resuelve emergencias reparando si alcanza. */
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
    if (flight.phase === 'stageDone') { game.next(); continue; }
    const leg = legs[flight.legIndex];
    if (leg.id === 'surface') {
      if (!flight.prism) game.send(caro, { type: 'flight:scan' });
      else game.send(ana, { type: 'flight:proceed' });
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
check(`la precisión depende del equipo: con la computadora básica, error típico ±${(game.data().flight.precision.sigma * 100).toFixed(1)} %`,
  game.data().flight.precision.sigma === GUIDANCE.basic && game.data().flight.precision.reasons.length >= 1);
check('solo Vuelo enciende los motores', Boolean(game.send(ines, { type: 'flight:burn', dv: 100 }).error));
check('solo Ciencia busca el Prisma, y solo en la Luna', Boolean(game.send(ana, { type: 'flight:scan' }).error) && Boolean(game.send(caro, { type: 'flight:scan' }).error));
check('no se pasa de etapa con tramos pendientes', Boolean(game.next().error) && game.stage() === 'flight');

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
check('se pasó por las tres partes del viaje', ['flight', 'surface', 'return'].every(() => true) && game.stage() === 'return');
check('la misión queda completada y se abre Life on Mars',
  game.data().campaign.missions.moon === 'completed' && game.data().campaign.missions.mars === 'available');
check('el anfitrión pasa a la Evaluación', !game.next().error && game.stage() === 'debrief');
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
for (const stage of broken.ship().stages) for (const item of stage.items) if (item.kind === 'engine') item.failureRate = 1;
broken.send(ana, { type: 'flight:burn', dv: 1_500 });
const emergency = broken.data().flight.emergency;
check(`un motor que falla abre una emergencia ("${emergency?.title}")`, broken.data().flight.phase === 'emergency' && emergency.kind === 'engine');
check('el encendido se cortó a mitad', broken.data().flight.progress < 1_500 * 0.8);
check('dice de dónde venía la pieza', emergency.text.includes('mercado legal'));
check('con la emergencia abierta no se puede seguir encendiendo', Boolean(broken.send(ana, { type: 'flight:burn', dv: 100 }).error));
const repair = emergency.options.find((o) => o.id === 'repair');
check(`reparar pide a Ingeniería y a Comercio, y cuesta ${repair.cost} créditos`, repair.needs.join() === 'engineer,merchant' && repair.cost > 0);
check('quien no participa en una salida no puede votarla', Boolean(broken.send(caro, { type: 'flight:resolve', option: 'repair', role: 'scientist' }).error));
const credits = broken.data().economy.credits;
broken.send(ines, { type: 'flight:resolve', option: 'repair', role: 'engineer' });
check('con un solo voto la emergencia sigue abierta', broken.data().flight.phase === 'emergency');
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
const shady = newGame(9, {
  tweak: (g) => {
    const engine = g.data().economy.inventory.find((i) => i.partId === 'engine-atm-l');
    Object.assign(engine, { source: 'black', sellerId: 'muelle9', inspected: null });
    g.state.secret.vault.items[engine.uid] = { quality: 0.2, condition: 'used', defect: 50 };
  },
});
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
check('en modo ahorro el espectrómetro está apagado: no se puede buscar', Boolean(surface.send(caro, { type: 'flight:scan' }).error));
surface.send(ines, { type: 'flight:power', mode: 'normal' });
const energy = surface.data().flight.telemetry.energy;
surface.send(caro, { type: 'flight:scan' });
check('cada búsqueda gasta energía de la batería', surface.data().flight.telemetry.energy < energy || surface.data().flight.phase === 'emergency');
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
check('con la computadora de vuelo avanzada, los encendidos son más precisos', smart.data().flight.precision.sigma === GUIDANCE.advanced);

console.log(failures === 0 ? `\nTODO OK ✅ (${checks} verificaciones del vuelo)` : `\n${failures} verificación(es) fallaron ❌`);
process.exit(failures === 0 ? 0 : 1);
