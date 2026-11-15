/**
 * PRUEBAS DEL ARMADO DEL COHETE Y DEL DESPEGUE
 * Juega una partida "de escritorio": aplica las acciones directamente sobre las reglas del
 * servidor (server/game.js), sin red. Compra las piezas, arma el cohete de referencia y despega.
 * Uso: npm test
 */
import { addStageProblem, canPlace, emptyRocket, installedUids, mountPoints, mountsUsed, partFinder, toPhysicsStages, withPart } from '../js/assembly.js';
import { EXAMPLE_BLUEPRINTS, buildFromBlueprint } from '../js/blueprints.js';
import { getPart } from '../js/catalog.js';
import { getMission } from '../js/missions.js';
import { ROLES } from '../js/shared.js';
import { analyzeRocket, propellantCost, validateRocket } from '../js/rocket.js';
import { applyAction, createInitialState, isGameAction, publicState } from '../server/game.js';

let failures = 0;
let checks = 0;
const check = (label, passed) => {
  checks++;
  console.log(`${passed ? '  ✔' : '  ✘'} ${label}`);
  if (!passed) failures++;
};
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

// ---------- Una partida de escritorio ----------
const person = (name, role, isHost = false) => ({ id: name, name, role, isHost, canActAs: (wanted) => wanted === role });
const ana = person('Ana', 'pilot', true);
const meche = person('Meche', 'merchant');
const ines = person('Inés', 'engineer');
const caro = person('Caro', 'scientist');
const crew = [ana, meche, ines, caro];

let state = createInitialState();
const send = (who, action) => {
  if (!isGameAction(action)) return { error: 'Acción mal formada.' };
  const result = applyAction(state, action, who);
  if (result.state) state = result.state;
  return result;
};
const data = () => state.data;
const stageId = () => getMission('moon').stages[data().stageIndex].id;
const nextStage = () => {
  for (const member of crew) send(member, { type: 'role:confirm', role: member.role, value: true });
  return send(ana, { type: 'stage:advance' });
};
const free = (partId) => data().economy.inventory.find((item) => item.partId === partId && !installedUids(data().rocket).includes(item.uid))?.uid;
const place = (partId, stage) => send(ines, { type: 'build:place', uid: free(partId), stage });
const review = () => validateRocket(toPhysicsStages(data().rocket, data().economy.inventory), getMission('moon'), { credits: data().economy.credits });

while (data().scene === 'prologue') send(ana, { type: 'story:next' });
send(ana, { type: 'mission:start', missionId: 'moon' });
while (data().scene === 'briefing') send(ana, { type: 'story:next' });
nextStage(); // Informe → Planificación
nextStage(); // Planificación → Mercado

// ------------------------------------------------------------
console.log('1) Comprar lo necesario');
check('la misión arranca con un cohete vacío de una etapa', data().rocket.stages.length === 1 && installedUids(data().rocket).length === 0);
const blueprint = EXAMPLE_BLUEPRINTS.moon;
const shopping = new Map();
for (const partId of blueprint.stages.flat()) shopping.set(partId, (shopping.get(partId) ?? 0) + 1);
// Unas piezas de más, para probar las reglas de encaje.
for (const [partId, extra] of [['battery', 3], ['engine-orbital', 1], ['capsule', 1], ['nose-cone', 1], ['separator', 1], ['landing-legs', 1]]) {
  shopping.set(partId, (shopping.get(partId) ?? 0) + extra);
}
const purchases = [...shopping].map(([partId, quantity]) => send(meche, { type: 'market:buy', offerId: `${partId}:common`, quantity }));
check(`Comercio compra las ${data().economy.inventory.length} piezas y sobra dinero (${data().economy.credits} créditos)`, purchases.every((p) => !p.error) && data().economy.credits > 0);
check('en la etapa Mercado todavía no se arma', Boolean(send(ines, { type: 'build:place', uid: free('tank-kero-l'), stage: 0 }).error));
nextStage();
check('después del Mercado viene la Construcción', stageId() === 'build');

// ------------------------------------------------------------
console.log('\n2) Quién arma y qué encaja');
check('quien no es Ingeniería no puede armar', Boolean(send(meche, { type: 'build:place', uid: free('tank-kero-l'), stage: 0 }).error));
check('un equipo no se puede colgar de una etapa sin tanque ni cápsula', Boolean(place('battery', 0).error));
check('las patas necesitan un cuerpo donde sujetarse', Boolean(place('landing-legs', 0).error));
check('no se agrega una etapa encima de una etapa vacía', Boolean(send(ines, { type: 'build:addStage' }).error));
check('Ingeniería pone un tanque de queroseno en la etapa 1', !place('tank-kero-l', 0).error && data().rocket.stages[0].core.length === 1);
const clash = place('engine-orbital', 0);
check(`un motor de otro combustible no encaja ("${clash.error}")`, Boolean(clash.error));
check('un motor de queroseno sí', !place('engine-atm-l', 0).error && data().rocket.stages[0].engines.length === 1);
check('una pieza ya puesta no se puede poner otra vez', Boolean(send(ines, { type: 'build:place', uid: data().rocket.stages[0].core[0], stage: 0 }).error));
check('una pieza que no está en la bodega no se puede poner', Boolean(send(ines, { type: 'build:place', uid: 'p9999', stage: 0 }).error));
check('ni en una etapa que no existe', Boolean(place('tank-kero-l', 4).error));

// El resto del cohete de referencia. En cada etapa: primero el cuerpo, luego motores, luego el equipo.
const slotOrder = { core: 0, engines: 1, mounted: 2 };
let placedAll = true;
blueprint.stages.forEach((partIds, stage) => {
  const ordered = [...partIds].sort((a, b) => slotOrder[getPart(a).slot] - slotOrder[getPart(b).slot]);
  for (const partId of ordered) {
    const already = stage === 0 && ((partId === 'tank-kero-l' && data().rocket.stages[0].core.length === 3) || (partId === 'engine-atm-l' && data().rocket.stages[0].engines.length === 5));
    if (already) continue;
    const result = place(partId, stage);
    if (result.error) {
      placedAll = false;
      console.log(`     no entró ${partId} en la etapa ${stage + 1}: ${result.error}`);
    }
  }
});
check('el cohete de referencia completo se puede armar con las reglas de encaje', placedAll && data().rocket.stages.length === 5);
check('el cuerpo se ordena solo: tanques abajo, luego cápsula, y la cofia en la punta',
  data().rocket.stages[4].core.map((uid) => getPart(data().economy.inventory.find((i) => i.uid === uid).partId).id).join(' ')
    === 'tank-hyper-m tank-hyper-s capsule nose-cone');
check('y el separador queda arriba de los tanques de su etapa',
  getPart(data().economy.inventory.find((i) => i.uid === data().rocket.stages[0].core.at(-1)).partId).id === 'separator');

const find = partFinder(data().economy.inventory);
check('una sola cápsula por cohete', Boolean(place('capsule', 4).error));
check('una sola cofia por cohete', Boolean(place('nose-cone', 4).error));
check('un solo separador por etapa', Boolean(place('separator', 0).error));
check('un solo juego de patas por etapa', Boolean(place('landing-legs', 3).error));
check('no se pone otra etapa encima de la cápsula', Boolean(send(ines, { type: 'build:addStage' }).error) && Boolean(addStageProblem(data().rocket, find)));
const top = () => data().rocket.stages[4];
check(`el equipo ocupa puntos de montaje (${mountsUsed(top(), find)} de ${mountPoints(top(), find)} en la etapa de arriba)`, mountsUsed(top(), find) === 10 && mountPoints(top(), find) === 12);
place('battery', 4);
place('battery', 4);
const full = place('battery', 4);
check(`cuando se acaban los puntos de montaje, no entra más equipo ("${full.error}")`, Boolean(full.error) && mountsUsed(top(), find) === 12);
const capsuleUid = top().core.find((uid) => find(uid).id === 'capsule');
check('no se puede quitar la cápsula mientras tenga equipo colgado', Boolean(send(ines, { type: 'build:remove', uid: capsuleUid }).error) && top().core.includes(capsuleUid));

console.log('\n3) Mover, quitar, deshacer');
const spare = top().mounted.at(-1);
check('una pieza se puede pasar a otra etapa', !send(ines, { type: 'build:move', uid: spare, stage: 0 }).error && data().rocket.stages[0].mounted.includes(spare) && !top().mounted.includes(spare));
check('moverla a donde no encaja la deja donde estaba', Boolean(send(ines, { type: 'build:move', uid: capsuleUid, stage: 1 }).error) && top().core.includes(capsuleUid));
check('quitar una pieza la devuelve a la bodega (sigue comprada)', !send(ines, { type: 'build:remove', uid: spare }).error && !installedUids(data().rocket).includes(spare) && data().economy.inventory.some((i) => i.uid === spare));
const beforeUndo = JSON.stringify(data().rocket);
send(ines, { type: 'build:remove', uid: top().mounted.at(-1) });
check('deshacer vuelve al cohete anterior', !send(ines, { type: 'build:undo' }).error && JSON.stringify(data().rocket) === beforeUndo);
check('solo Ingeniería deshace', Boolean(send(ana, { type: 'build:undo' }).error));
send(ines, { type: 'build:remove', uid: top().mounted.at(-1) }); // la batería extra que quedaba
check('una pieza puesta en el cohete no se puede devolver al mercado', Boolean(send(meche, { type: 'market:sell', uid: capsuleUid }).error));
check('lo que solo sabe el servidor (el historial para deshacer) no se envía', !('secret' in publicState(state)) && !JSON.stringify(publicState(state)).includes('"undo"'));

// Reemplazar: el motor orbital de arriba por otro igual que estaba en la bodega.
const engineUid = data().rocket.stages[4].engines[0];
const spareEngine = free('engine-orbital');
const beforeSwap = JSON.stringify(data().rocket);
const swapped = send(ines, { type: 'build:replace', uid: engineUid, with: spareEngine });
check('reemplazar cambia la pieza en el mismo lugar, en un solo paso',
  !swapped.error && data().rocket.stages[4].engines[0] === spareEngine && !installedUids(data().rocket).includes(engineUid));
const badSwap = send(ines, { type: 'build:replace', uid: spareEngine, with: free('battery') ?? 'p0' });
check(`no se cambia un motor por un equipo, y el cohete queda igual ("${badSwap.error}")`, Boolean(badSwap.error) && data().rocket.stages[4].engines[0] === spareEngine);
check('solo Ingeniería reemplaza', Boolean(send(meche, { type: 'build:replace', uid: spareEngine, with: engineUid }).error));
send(ines, { type: 'build:undo' });
check('y se puede deshacer', JSON.stringify(data().rocket) === beforeSwap);

console.log('\n4) El cohete armado es el mismo que calcula la física');
const built = analyzeRocket(toPhysicsStages(data().rocket, data().economy.inventory));
const reference = analyzeRocket(buildFromBlueprint(blueprint).stages);
check(`misma masa que el plano de referencia (${Math.round(built.mass / 1000)} t)`, near(built.mass, reference.mass, 1e-6));
check('mismo Δv y mismo empuje/peso', near(built.deltaV, reference.deltaV, 1e-6) && near(built.twr, reference.twr, 1e-9));
check('los motores van lado a lado y el equipo va colgado: solo el cuerpo suma altura', built.height < reference.height);
check('el precio usa lo que se pagó por cada pieza más el combustible',
  built.cost === data().economy.inventory.filter((i) => installedUids(data().rocket).includes(i.uid)).reduce((t, i) => t + i.paid, 0) + propellantCost(toPhysicsStages(data().rocket, data().economy.inventory)));
check('pasa la revisión sin errores críticos', review().critical.length === 0);

console.log('\n5) Combustible');
check('cargar menos combustible baja la masa y el Δv',
  !send(ines, { type: 'build:fill', stage: 4, fill: 0.1 }).error
  && analyzeRocket(toPhysicsStages(data().rocket, data().economy.inventory)).mass < built.mass && data().rocket.stages[4].fill === 0.1);
check('el llenado se ajusta de a 5 % y nunca pasa de 100 %',
  !send(ines, { type: 'build:fill', stage: 3, fill: 7 }).error === false || data().rocket.stages[3].fill === 1);
send(ines, { type: 'build:fill', stage: 3, fill: 0.52 });
check('0,52 se guarda como 50 %', near(data().rocket.stages[3].fill, 0.5, 1e-9));
send(ines, { type: 'build:fill', stage: 3, fill: 1 });
const shortReview = review();
check(`con la última etapa casi vacía, la revisión avisa que no alcanza ("${shortReview.critical[0]?.text}")`, shortReview.critical.some((issue) => issue.code.startsWith('plan:')));

console.log('\n6) Validación y despegue');
nextStage();
check('después de Construcción viene Validación, y ahí todavía se puede corregir', stageId() === 'validation');
const blocked = nextStage();
check(`con un error crítico no se despega ("${blocked.error}")`, Boolean(blocked.error) && stageId() === 'validation');
send(ines, { type: 'build:fill', stage: 4, fill: 1 });

// Sin dinero para el combustible tampoco.
const fuel = propellantCost(toPhysicsStages(data().rocket, data().economy.inventory));
const pricey = data().economy.offers.find((o) => o.id === 'capsule:uncommon');
const splurge = Math.floor((data().economy.credits - fuel) / pricey.price) + 1;
send(meche, { type: 'market:buy', offerId: pricey.id, quantity: splurge });
const broke = nextStage();
check(`si no alcanza para llenar los tanques, no se despega ("${broke.error}")`, Boolean(broke.error) && review().critical.some((issue) => issue.code === 'fuel-money'));
for (const item of data().economy.inventory.filter((i) => i.tier === 'uncommon')) send(meche, { type: 'market:sell', uid: item.uid });

const creditsBefore = data().economy.credits;
const launched = nextStage();
check('con el cohete en regla y el dinero justo, se despega', !launched.error && stageId() === 'flight');
check(`al despegar se cobra el combustible (${fuel} créditos)`, data().economy.credits === creditsBefore - fuel && data().economy.credits >= 0);
check('la bitácora lo cuenta', data().log.at(-1).includes('combustible'));
check('en vuelo ya no se arma ni se compra',
  Boolean(send(ines, { type: 'build:remove', uid: capsuleUid }).error) && Boolean(send(meche, { type: 'market:buy', offerId: 'battery:common' }).error));
check('los 4 roles siguen teniendo su visto bueno en cada etapa', ROLES.every((role) => role.id in data().confirmed));

// ------------------------------------------------------------
console.log('\n7) Reglas de encaje, sueltas');
const stock = [
  { uid: 'a', partId: 'tank-hydro-m' }, { uid: 'b', partId: 'engine-vac-s' }, { uid: 'c', partId: 'engine-atm-m' },
  { uid: 'd', partId: 'solar-panel' }, { uid: 'e', partId: 'capsule' }, { uid: 'f', partId: 'tank-kero-m' },
];
const lookup = partFinder(stock);
let lab = emptyRocket();
lab = withPart(lab, lookup, 'a', 0, 'core');
check('el combustible de una etapa lo fija su primera pieza', canPlace(lab, lookup, 'b', 0).ok && !canPlace(lab, lookup, 'c', 0).ok && !canPlace(lab, lookup, 'f', 0).ok);
check('una etapa nueva arriba acepta otro combustible', canPlace(lab, lookup, 'f', 1).ok);
check('el panel solar encuentra punto de montaje en el tanque', canPlace(lab, lookup, 'd', 0).slot === 'mounted');
check('la cápsula puede ir en una etapa nueva de arriba, pero no debajo de otra', canPlace(lab, lookup, 'e', 1).ok && canPlace(withPart(lab, lookup, 'f', 1, 'core'), lookup, 'e', 0).ok === false);
check('cada rechazo explica el motivo', [canPlace(lab, lookup, 'c', 0), canPlace(lab, lookup, 'zzz', 0), canPlace(lab, lookup, 'a', 0)].every((r) => !r.ok && r.reason.length > 10));

console.log(failures === 0 ? `\nTODO OK ✅ (${checks} verificaciones del armado)` : `\n${failures} verificación(es) fallaron ❌`);
process.exit(failures === 0 ? 0 : 1);
