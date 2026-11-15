/**
 * PRUEBAS DEL MODO SANDBOX
 * Una partida de escritorio (sin red) en el modo libre: créditos ilimitados, mercado completo,
 * las reglas de encaje de siempre, vuelos de prueba y vuelta al hangar. Y que la campaña no cambie.
 * Uso: npm test
 */
import { installedUids, toPhysicsStages } from '../js/assembly.js';
import { EXAMPLE_BLUEPRINTS } from '../js/blueprints.js';
import { PARTS, TIERS, getPart } from '../js/catalog.js';
import { flightPlanFor, totalDeltaV } from '../js/flightplans.js';
import { MISSIONS, SANDBOX, getMission, missionFor } from '../js/missions.js';
import { UNLIMITED_CREDITS, credits } from '../js/partinfo.js';
import { analyzeRocket } from '../js/rocket.js';
import { applyAction, createInitialState, createSandboxState, isGameAction } from '../server/game.js';
import { RoomStore } from '../server/rooms.js';

let failures = 0;
let checks = 0;
const check = (label, passed) => {
  checks++;
  console.log(`${passed ? '  ✔' : '  ✘'} ${label}`);
  if (!passed) failures++;
};

// Una sola persona: tiene un rol y maneja los otros tres (están sin dueño).
const solo = { id: 'Sol', name: 'Sol', role: 'engineer', isHost: true, canActAs: () => true, heldRoles: ['engineer'], players: [{ id: 'Sol', name: 'Sol', role: 'engineer' }] };
const newSandbox = (seed = 7) => {
  const game = { state: createSandboxState() };
  game.state.secret.seed = seed;
  game.send = (action) => {
    if (!isGameAction(action)) return { error: 'Acción mal formada.' };
    const result = applyAction(game.state, action, solo);
    if (result.state) game.state = result.state;
    return result;
  };
  game.data = () => game.state.data;
  game.stage = () => SANDBOX.stages[game.data().stageIndex].id;
  return game;
};
const slotOrder = { core: 0, engines: 1, mounted: 2 };
const buildReference = (game) => {
  const wanted = new Map();
  for (const partId of EXAMPLE_BLUEPRINTS.moon.stages.flat()) wanted.set(partId, (wanted.get(partId) ?? 0) + 1);
  for (const [partId, quantity] of wanted) game.send({ type: 'market:buy', offerId: `${partId}:common`, quantity });
  const free = (partId) => game.data().economy.inventory.find((i) => i.partId === partId && !installedUids(game.data().rocket).includes(i.uid))?.uid;
  EXAMPLE_BLUEPRINTS.moon.stages.forEach((partIds, stage) => {
    const ordered = [...partIds].sort((a, b) => slotOrder[getPart(a).slot] - slotOrder[getPart(b).slot]);
    for (const partId of ordered) game.send({ type: 'build:place', uid: free(partId), stage });
  });
};
/** Pilotea con cuidado hasta que el vuelo termine; las emergencias se reparan (el dinero no importa). */
const fly = (game) => {
  for (let step = 0; step < 300; step++) {
    const flight = game.data().flight;
    if (!flight || flight.phase === 'over') return flight;
    if (flight.phase === 'emergency') {
      const pick = flight.emergency.options.find((o) => o.id === 'repair') ?? flight.emergency.options[0];
      for (const role of pick.needs) game.send({ type: 'flight:resolve', option: pick.id, role });
      continue;
    }
    const leg = missionFor(game.data()).flightPlan[flight.legIndex];
    if (leg.dv === 0) { game.send({ type: 'flight:proceed' }); continue; }
    const result = game.send({ type: 'flight:burn', dv: Math.round(leg.dv - flight.progress) || 1 });
    if (result.error) throw new Error(`no se pudo encender: ${result.error}`);
  }
  return game.data().flight;
};

// ------------------------------------------------------------
console.log('1) Entrar: directo al hangar, sin lobby ni campaña');
const game = newSandbox();
check('empieza en la misión Sandbox, en el hangar, sin prólogo ni constelación', game.data().scene === 'mission' && game.data().missionId === 'sandbox' && game.stage() === 'validation');
check('el Sandbox no es una misión de la campaña', !MISSIONS.some((mission) => mission.id === 'sandbox') && getMission('sandbox') === SANDBOX);
check('la economía es ilimitada y el saldo se muestra como ∞', game.data().economy.unlimited === true && game.data().economy.credits === UNLIMITED_CREDITS && credits(game.data().economy.credits) === '∞ cr');
const store = new RoomStore({ countdownSeconds: 1, rejoinGraceMs: 1000 });
const made = store.create({ socketId: 's1', clientId: 'c1', name: 'Sol', color: null, hat: null }, 'sandbox');
check('la sala Sandbox se crea ya jugando, con una sola persona y su rol', made.room.phase === 'playing' && made.room.players.size === 1 && Boolean(made.player.role) && made.room.state.data.missionId === 'sandbox');
const normal = store.create({ socketId: 's2', clientId: 'c2', name: 'Ana', color: null, hat: null });
check('una sala normal sigue empezando en el lobby con la campaña', normal.room.phase === 'lobby' && normal.room.state.data.missionId === null && !normal.room.state.data.economy);

// ------------------------------------------------------------
console.log('\n2) Mercado: todo se puede comprar y el saldo no baja');
const offers = game.data().economy.offers;
check(`se venden todas las piezas en todas las rarezas (${offers.length} ofertas)`, offers.length === PARTS.length * TIERS.length && offers.every((offer) => offer.stock === null));
const allBought = offers.map((offer) => game.send({ type: 'market:buy', offerId: offer.id, quantity: 1 }));
check('se compra una de cada oferta sin error', allBought.every((result) => !result.error) && game.data().economy.inventory.length === offers.length);
check('después de comprar todo, el saldo sigue siendo ilimitado', game.data().economy.credits === UNLIMITED_CREDITS);
check('comprar 20 de la pieza más cara tampoco lo baja', !game.send({ type: 'market:buy', offerId: [...offers].sort((a, b) => b.price - a.price)[0].id, quantity: 20 }).error && game.data().economy.credits === UNLIMITED_CREDITS);
const firstUid = game.data().economy.inventory[0].uid;
check('devolver una pieza funciona y el saldo queda igual', !game.send({ type: 'market:sell', uid: firstUid }).error && game.data().economy.credits === UNLIMITED_CREDITS);
const black = game.data().economy.black.find((offer) => offer.stock > 0);
check('el mercado negro sigue funcionando (inspeccionar y comprar)', !game.send({ type: 'black:inspect', offerId: black.id, level: 'basic' }).error && !game.send({ type: 'black:buy', offerId: black.id }).error && game.data().economy.credits === UNLIMITED_CREDITS);

// ------------------------------------------------------------
console.log('\n3) El dinero no compra física: las reglas de encaje y la revisión siguen');
const lab = newSandbox();
lab.send({ type: 'market:buy', offerId: 'tank-kero-l:legendary', quantity: 1 });
lab.send({ type: 'market:buy', offerId: 'engine-orbital:legendary', quantity: 1 });
lab.send({ type: 'market:buy', offerId: 'engine-atm-l:common', quantity: 1 });
const uidOf = (g, partId) => g.data().economy.inventory.find((i) => i.partId === partId && !installedUids(g.data().rocket).includes(i.uid))?.uid;
check('un tanque legendario se coloca', !lab.send({ type: 'build:place', uid: uidOf(lab, 'tank-kero-l'), stage: 0 }).error);
check('un motor de otro combustible se rechaza aunque sea legendario', Boolean(lab.send({ type: 'build:place', uid: uidOf(lab, 'engine-orbital'), stage: 0 }).error));
lab.send({ type: 'build:place', uid: uidOf(lab, 'engine-atm-l'), stage: 0 });
const refused = lab.send({ type: 'stage:advance' });
check(`un cohete incompleto no despega ("${refused.error}")`, Boolean(refused.error) && lab.stage() === 'validation');

// ------------------------------------------------------------
console.log('\n4) Vuelo de prueba: órbita baja y regreso');
const orbit = newSandbox(11);
buildReference(orbit);
const orbitLegs = missionFor(orbit.data()).flightPlan;
check(`el vuelo por defecto es órbita baja: ${orbitLegs.map((leg) => leg.id).join(' → ')} (${totalDeltaV(orbitLegs)} m/s)`, orbitLegs.map((leg) => leg.id).join() === 'ascent,deorbit,reentry' && orbitLegs.every((leg) => leg.stage === 'flight'));
const launch = orbit.send({ type: 'stage:advance' });
check(`el cohete de referencia despega desde el hangar${launch.error ? ` ("${launch.error}")` : ''}`, !launch.error && orbit.stage() === 'flight' && Boolean(orbit.data().flight));
check('llenar los tanques no baja el saldo', orbit.data().economy.credits === UNLIMITED_CREDITS);
check('en vuelo ya no se puede cambiar el viaje', Boolean(orbit.send({ type: 'plan:set', profile: 'landing' }).error));
const massAtStart = orbit.data().flight.telemetry.mass;
orbit.send({ type: 'flight:burn', dv: 3000 });
check('quemar combustible baja la masa de la nave (consumo real)', orbit.data().flight.telemetry.mass < massAtStart);
const flown = fly(orbit);
check(`el vuelo termina bien sin Prisma: "${flown.result?.text}"`, flown.phase === 'over' && flown.result.ok === true && orbit.stage() === 'debrief');
check('hay resultados con puntaje, y el Sandbox no toca ninguna campaña', Boolean(orbit.data().score?.final) && !('sandbox' in orbit.data().campaign.missions));

// ------------------------------------------------------------
console.log('\n5) Volver al hangar y probar otra cosa');
const back = orbit.send({ type: 'mission:retry' });
check('desde el resultado se vuelve al hangar con el cohete y la bodega', !back.error && orbit.stage() === 'validation' && orbit.data().flight === null && installedUids(orbit.data().rocket).length > 10 && orbit.data().attempt === 2);
check('en el hangar se elige otro viaje: alunizaje completo', !orbit.send({ type: 'plan:set', profile: 'landing' }).error && missionFor(orbit.data()).flightPlan.some((leg) => leg.id === 'descent'));
check('un perfil que no existe se rechaza', Boolean(orbit.send({ type: 'plan:set', profile: 'warp' }).error));
check('se puede seguir comprando piezas', !orbit.send({ type: 'market:buy', offerId: 'battery:epic', quantity: 2 }).error);
const relaunch = orbit.send({ type: 'stage:advance' });
const landing = fly(orbit);
check(`el alunizaje completo se vuela de punta a punta: "${landing?.result?.text ?? relaunch.error}"`, !relaunch.error && landing.phase === 'over' && typeof landing.result.ok === 'boolean');
orbit.send({ type: 'mission:retry' });
orbit.send({ type: 'stage:advance' });
orbit.send({ type: 'flight:burn', dv: 2000 });
check('una prueba se puede abortar en pleno vuelo y volver al hangar', Boolean(orbit.data().flight) && !orbit.send({ type: 'mission:retry' }).error && orbit.stage() === 'validation' && orbit.data().flight === null);

// ------------------------------------------------------------
console.log('\n6) El diseño importa: un cohete corto no llega');
const small = newSandbox(5);
for (const partId of ['tank-kero-l', 'engine-atm-l', 'capsule']) small.send({ type: 'market:buy', offerId: `${partId}:common`, quantity: 1 });
for (const partId of ['tank-kero-l', 'capsule', 'engine-atm-l']) small.send({ type: 'build:place', uid: uidOf(small, partId), stage: 0 });
const dvSmall = analyzeRocket(toPhysicsStages(small.data().rocket, small.data().economy.inventory)).deltaV;
const needed = totalDeltaV(flightPlanFor('sandbox', { profile: 'orbit' }));
const tooShort = small.send({ type: 'stage:advance' });
check(`un cohete de una etapa (${Math.round(dvSmall)} m/s) no alcanza los ${needed} m/s de la órbita y la revisión lo frena`,
  installedUids(small.data().rocket).length === 3 && dvSmall < needed && Boolean(tooShort.error));

// ------------------------------------------------------------
console.log('\n7) La campaña no cambió');
const campaign = { state: createInitialState() };
const host = { id: 'Ana', name: 'Ana', role: 'merchant', isHost: true, canActAs: () => true, players: [] };
const act = (action) => { const result = applyAction(campaign.state, action, host); if (result.state) campaign.state = result.state; return result; };
check('el Sandbox no se puede iniciar como misión de campaña', (() => { while (campaign.state.data.scene === 'prologue') act({ type: 'story:next' }); return Boolean(act({ type: 'mission:start', missionId: 'sandbox' }).error); })());
act({ type: 'mission:start', missionId: 'moon' });
const eco = campaign.state.data.economy;
check(`la Luna sigue con su presupuesto (${eco.credits} créditos) y sin créditos ilimitados`, eco.credits === getMission('moon').budget && !eco.unlimited && eco.offers.some((offer) => offer.stock !== null));
while (campaign.state.data.scene === 'briefing') act({ type: 'story:next' });
check('y en la campaña no se puede elegir un vuelo de prueba', Boolean(act({ type: 'plan:set', profile: 'orbit' }).error));

console.log(failures === 0 ? `\nTODO OK ✅ (${checks} verificaciones del Sandbox)` : `\n${failures} de ${checks} verificaciones fallaron ❌`);
process.exit(failures === 0 ? 0 : 1);
