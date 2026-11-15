/**
 * PRUEBAS DE FÍSICA, CATÁLOGO Y COHETE
 * No levanta servidor ni navegador: solo llama a las funciones puras y revisa los números.
 * Uso: npm test   (corre esto y después tests/simulate.js)
 */
import { EXAMPLE_BLUEPRINTS, buildFromBlueprint } from '../js/blueprints.js';
import { CAPABILITIES, CATEGORIES, CONDITIONS, PARTS, PROPELLANTS, TIERS, propellantPrice, resolvePart } from '../js/catalog.js';
import { moonFlightPlan, totalDeltaV } from '../js/flightplans.js';
import { getMission } from '../js/missions.js';
import {
  AU, BODIES, DAY, G0, airDensity, batteryStep, burnStep, burnTime, centerOfMass, circularVelocity, combinedIsp,
  deltaV, dragForce, escapeBurn, escapeVelocity, gravityAt, hohmann, massFlow, orbitalPeriod, propellantFor,
  thrustToWeight, transferWindow,
} from '../js/physics.js';
import { analyzeRocket, loadedPropellant, simulatePlan, stageSummary, validateRocket } from '../js/rocket.js';

let failures = 0;
let checks = 0;
const check = (label, passed) => {
  checks++;
  console.log(`${passed ? '  ✔' : '  ✘'} ${label}`);
  if (!passed) failures++;
};
const near = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;
const throws = (action) => {
  try {
    action();
    return false;
  } catch {
    return true;
  }
};
const part = (partId, extra = {}) => ({ ...resolvePart({ partId }), ...extra });
const many = (count, partId, extra) => Array.from({ length: count }, () => part(partId, extra));
const codes = (issues) => issues.map((issue) => issue.code);

const { earth, moon, mars, sun } = BODIES;

// ------------------------------------------------------------
console.log('1) Ecuación del cohete');
check('Δv = Isp · g0 · ln(m0/mf): con Isp 300 s y razón de masas e da 300 · g0', near(deltaV(300, Math.E * 1000, 1000), 300 * G0, 1e-6));
check('sin quemar combustible (m0 = mf) el Δv es 0', deltaV(300, 1000, 1000) === 0);
check('más razón de masas → más Δv', deltaV(300, 5000, 1000) > deltaV(300, 3000, 1000));
check('más impulso específico → más Δv', deltaV(450, 3000, 1000) > deltaV(300, 3000, 1000));
check('duplicar el combustible NO duplica el Δv (crece con el logaritmo)', deltaV(300, 3000, 1000) < 2 * deltaV(300, 2000, 1000));
check('masas imposibles (cero, negativas, final mayor que inicial) se rechazan',
  throws(() => deltaV(300, 0, 1000)) && throws(() => deltaV(300, 1000, -5)) && throws(() => deltaV(300, 1000, 2000)));
const needed = propellantFor(3_000, 320, 50_000);
check('propellantFor es Tsiolkovski al revés: quemar ese combustible da justo el Δv pedido', near(deltaV(320, 50_000, 50_000 - needed), 3_000, 1e-6));

console.log('\n2) Motores y combustible');
check('gasto de combustible = empuje / (Isp · g0): un motor de 6.77 MN y 263 s quema unos 2 625 kg/s', near(massFlow(6_770_000, 263), 2_625, 2));
check('motor apagado: sin empuje no hay gasto', massFlow(0, 300) === 0);
const idle = burnStep({ mass: 10_000, propellant: 6_000 }, 500_000, 300, 60, 0);
check('acelerador en 0: no cambia la masa, no gasta combustible, no da Δv', idle.mass === 10_000 && idle.propellant === 6_000 && idle.dv === 0);
const burning = burnStep({ mass: 10_000, propellant: 6_000 }, 500_000, 300, 10);
check('encendido: lo que se quema baja la masa en la misma cantidad', near(10_000 - burning.mass, burning.burned, 1e-9) && burning.burned > 0 && burning.dv > 0);
const emptied = burnStep({ mass: 10_000, propellant: 6_000 }, 500_000, 300, 1e9);
check('nunca se quema más de lo que hay: la masa no baja de la masa en seco', emptied.propellant === 0 && near(emptied.mass, 4_000, 1e-6));
const impossible = burnStep({ mass: 1_000, propellant: 5_000 }, 500_000, 300, 1e9);
check('ni con datos imposibles la masa queda negativa', impossible.mass >= 0 && impossible.propellant >= 0);
check('medio acelerador gasta la mitad', near(burnStep({ mass: 10_000, propellant: 6_000 }, 500_000, 300, 10, 0.5).burned, burning.burned / 2, 1e-9));
check('tiempo de encendido = combustible / gasto', near(burnTime(26_250, 6_770_000, 263), 10, 0.01));
const mixed = combinedIsp([{ thrust: 1000, isp: 300 }, { thrust: 1000, isp: 450 }]);
check('dos motores distintos encendidos: el Isp combinado queda entre los dos', mixed > 300 && mixed < 450);
check('un motor apagado no cuenta en el Isp combinado', combinedIsp([{ thrust: 1000, isp: 300 }, { thrust: 0, isp: 450 }]) === 300);

console.log('\n3) Empuje y peso');
check('más empuje → más empuje/peso', thrustToWeight(2e6, 1e5, G0) > thrustToWeight(1e6, 1e5, G0));
check('más masa → menos empuje/peso', thrustToWeight(1e6, 2e5, G0) < thrustToWeight(1e6, 1e5, G0));
check('el mismo cohete rinde 6 veces más empuje/peso en la Luna que en la Tierra',
  near(thrustToWeight(1e6, 1e5, gravityAt(moon)) / thrustToWeight(1e6, 1e5, gravityAt(earth)), 6.05, 0.1));
check('centro de masa: 3 t en la base y 1 t a 8 m quedan a 2 m', near(centerOfMass([{ mass: 3000, position: 0 }, { mass: 1000, position: 8 }]), 2, 1e-9));

console.log('\n4) Gravedad y órbitas (contra valores conocidos)');
const leo = earth.radius + 200_000;
check(`gravedad en la superficie: Tierra ≈ 9.8, Luna ≈ 1.62, Marte ≈ 3.7 m/s²`,
  near(gravityAt(earth), 9.82, 0.03) && near(gravityAt(moon), 1.62, 0.01) && near(gravityAt(mars), 3.73, 0.03));
check(`velocidad de órbita a 200 km: ${Math.round(circularVelocity(earth.mu, leo))} m/s (≈ 7 780)`, near(circularVelocity(earth.mu, leo), 7_784, 10));
check('una vuelta a 200 km tarda unos 88 minutos', near(orbitalPeriod(earth.mu, leo) / 60, 88.4, 0.5));
check('la velocidad de escape es √2 veces la de órbita', near(escapeVelocity(earth.mu, leo) / circularVelocity(earth.mu, leo), Math.SQRT2, 1e-9));
check('la Luna da una vuelta a la Tierra en unos 27 días', near(orbitalPeriod(earth.mu, moon.orbitRadius) / DAY, 27.4, 0.3));
const toMoon = hohmann(earth.mu, leo, moon.orbitRadius);
check(`transferencia a la Luna desde órbita baja: ${Math.round(toMoon.dv1)} m/s (≈ 3 130) y unos 5 días`, near(toMoon.dv1, 3_131, 20) && near(toMoon.time / DAY, 5, 0.1));
const toMars = transferWindow(sun.mu, AU, mars.orbitRadius);
check(`viaje Tierra → Marte: ${Math.round(toMars.time / DAY)} días (≈ 259)`, near(toMars.time / DAY, 259, 2));
check(`la ventana se repite cada ${Math.round(toMars.synodic / DAY)} días (≈ 780): por eso no se sale cuando uno quiere`, near(toMars.synodic / DAY, 780, 2));
check(`al salir, Marte tiene que ir ${Math.round(toMars.phaseAngle * 180 / Math.PI)}° adelante de la Tierra (≈ 44°)`, near(toMars.phaseAngle * 180 / Math.PI, 44.3, 1));
check('salir de órbita baja rumbo a Marte cuesta unos 3 600 m/s', near(escapeBurn(earth.mu, leo, toMars.dv1), 3_610, 40));

console.log('\n5) Atmósfera');
check('el aire se hace menos denso con la altura', airDensity(earth, 0) > airDensity(earth, 10_000) && airDensity(earth, 10_000) > airDensity(earth, 50_000));
check('la Luna no tiene aire', airDensity(moon, 0) === 0);
check('al doble de velocidad, cuatro veces más arrastre', near(dragForce(1.2, 200, 0.5, 10) / dragForce(1.2, 100, 0.5, 10), 4, 1e-9));
check('arrastre = ½ · densidad · v² · Cd · área', near(dragForce(1.225, 100, 0.5, 10), 30_625, 1e-6));

console.log('\n6) Energía');
const charged = batteryStep({ energy: 900, capacity: 1000 }, 500, 100, 10);
check('la batería no pasa de su capacidad', charged.energy === 1000 && charged.shortfall === 0);
const drained = batteryStep({ energy: 300, capacity: 1000 }, 0, 100, 10);
check('la batería nunca queda negativa, y avisa cuánta energía faltó', drained.energy === 0 && drained.shortfall === 700);
check('generar lo mismo que se consume deja la batería igual', batteryStep({ energy: 400, capacity: 1000 }, 250, 250, 3600).energy === 400);
check('lo que baja es consumo menos generación por el tiempo', batteryStep({ energy: 800, capacity: 1000 }, 100, 150, 4).energy === 600);

// ------------------------------------------------------------
console.log('\n7) Catálogo de piezas');
const categoryIds = CATEGORIES.map((category) => category.id);
check(`las ${PARTS.length} piezas tienen id único, categoría, masa, alto y precio válidos`,
  new Set(PARTS.map((p) => p.id)).size === PARTS.length
  && PARTS.every((p) => categoryIds.includes(p.category) && p.mass > 0 && p.height > 0 && p.cost > 0 && p.failureRate >= 0 && p.failureRate < 1));
check('toda capacidad que da una pieza existe en la lista de capacidades', PARTS.every((p) => (p.provides ?? []).every((id) => id in CAPABILITIES)));
check('motores y tanques usan combustibles que existen', PARTS.filter((p) => p.propellant).every((p) => p.propellant in PROPELLANTS));
check('todo motor tiene empuje e impulso específico; todo tanque, capacidad',
  PARTS.every((p) => (p.kind !== 'engine' || (p.thrust > 0 && p.isp > 0)) && (p.kind !== 'tank' || p.capacity > 0)));
check('hay piezas en las 6 categorías', categoryIds.every((id) => PARTS.some((p) => p.category === id)));
check('cada combustible tiene al menos un motor y un tanque',
  Object.keys(PROPELLANTS).every((fuel) => ['engine', 'tank'].every((kind) => PARTS.some((p) => p.kind === kind && p.propellant === fuel))));

const ladder = TIERS.map((tier) => resolvePart({ partId: 'engine-vac-l', tier: tier.id }));
const rising = (list, pick) => list.every((item, i) => i === 0 || pick(item) > pick(list[i - 1]));
check('mejor rareza = más eficiencia y más empuje', rising(ladder, (e) => e.isp) && rising(ladder, (e) => e.thrust));
check('mejor rareza = más liviana y menos fallas', rising(ladder, (e) => -e.mass) && rising(ladder, (e) => -e.failureRate));
check('mejor rareza = más cara', rising(ladder, (e) => e.price));
check('el precio no es lo único que cambia: una legendaria rinde más que una común',
  ladder.at(-1).isp / ladder[0].isp > 1.04 && ladder.at(-1).isp / ladder[0].isp < 1.1);
const rareLow = resolvePart({ partId: 'engine-vac-l', tier: 'rare', quality: 0 });
const rareHigh = resolvePart({ partId: 'engine-vac-l', tier: 'rare', quality: 1 });
check('dos piezas de la misma rareza pueden rendir distinto (calidad)', rareHigh.isp > rareLow.isp && rareHigh.price > rareLow.price);
check('pero la peor "rara" sigue siendo mejor que una "poco común" normal', rareLow.isp > resolvePart({ partId: 'engine-vac-l', tier: 'uncommon' }).isp);
const fresh = resolvePart({ partId: 'engine-atm-m' });
const used = resolvePart({ partId: 'engine-atm-m', condition: 'used' });
const damaged = resolvePart({ partId: 'engine-atm-m', condition: 'damaged' });
check('una pieza usada es más barata y falla más', used.price < fresh.price && used.failureRate > fresh.failureRate);
check('una pieza dañada empuja menos', damaged.thrust < fresh.thrust && damaged.failureRate > used.failureRate);
check('una pieza no inventa datos que no tiene (la cápsula no tiene empuje ni capacidad de tanque)',
  !('thrust' in resolvePart({ partId: 'capsule' })) && !('capacity' in resolvePart({ partId: 'capsule' })));
check('la rareza no cambia cuánto cabe en un tanque', resolvePart({ partId: 'tank-kero-l', tier: 'legendary' }).capacity === resolvePart({ partId: 'tank-kero-l' }).capacity);
check('una pieza, rareza o estado que no existe se rechaza',
  throws(() => resolvePart({ partId: 'motor-magico' })) && throws(() => resolvePart({ partId: 'capsule', tier: 'mítica' })) && throws(() => resolvePart({ partId: 'capsule', condition: 'rota' })));
check('todos los estados están definidos con sus tres efectos', Object.values(CONDITIONS).every((c) => c.performance > 0 && c.failure > 0 && c.price > 0));

// ------------------------------------------------------------
console.log('\n8) Estadísticas del cohete');
const small = [
  { items: [part('engine-atm-m'), part('tank-kero-m'), part('separator')] },
  { items: [part('engine-orbital'), part('tank-hyper-s'), part('capsule')] },
];
const smallStats = analyzeRocket(small);
check('masa total = masa en seco + combustible', near(smallStats.mass, smallStats.dryMass + smallStats.propellantMass, 1e-6));
check('el combustible no pasa de la capacidad de los tanques', smallStats.propellantMass <= smallStats.propellantCapacity);
check('un tanque "llenado" al 300 % lleva solo lo que le cabe', loadedPropellant(part('tank-kero-m', { fill: 3 })) === part('tank-kero-m').capacity);
check('un tanque con llenado negativo va vacío, no con masa negativa', loadedPropellant(part('tank-kero-m', { fill: -1 })) === 0);
check('medio tanque pesa menos que uno lleno',
  analyzeRocket([{ items: [part('engine-atm-m'), part('tank-kero-m', { fill: 0.5 })] }]).mass < analyzeRocket([{ items: [part('engine-atm-m'), part('tank-kero-m')] }]).mass);
check('el Δv total es la suma del de cada etapa', near(smallStats.deltaV, smallStats.stages[0].deltaV + smallStats.stages[1].deltaV, 1e-6));
check('cada etapa carga con todo lo que lleva encima', near(smallStats.stages[0].ignitionMass, smallStats.mass, 1e-6) && near(smallStats.stages[1].ignitionMass, smallStats.stages[1].mass, 1e-6));

const withoutCapsule = analyzeRocket([small[0], { items: small[1].items.slice(0, 2) }]);
check('quitar una pieza baja la masa y el precio, y sube el Δv', withoutCapsule.mass < smallStats.mass && withoutCapsule.cost < smallStats.cost && withoutCapsule.deltaV > smallStats.deltaV);
const betterEngine = analyzeRocket([{ items: [resolvePart({ partId: 'engine-atm-m', tier: 'epic' }), part('tank-kero-m'), part('separator')] }, small[1]]);
check('cambiar el motor por uno mejor sube el Δv y el empuje/peso', betterEngine.deltaV > smallStats.deltaV && betterEngine.twr > smallStats.twr);
check('agregar carga arriba baja el empuje/peso y el Δv',
  (() => { const heavy = analyzeRocket([small[0], { items: [...small[1].items, part('rover')] }]); return heavy.twr < smallStats.twr && heavy.deltaV < smallStats.deltaV; })());
check('el precio incluye las piezas y el combustible',
  smallStats.cost === small.flatMap((s) => s.items).reduce((total, item) => total + item.price, 0) + propellantPrice('kerolox', 150_000) + propellantPrice('hypergolic', 2_000));
check('la carga útil es lo que no es motor ni tanque en la etapa de arriba', smallStats.payloadMass === part('capsule').mass);
const powered = analyzeRocket([{ items: [part('capsule'), part('solar-panel'), part('battery'), part('antenna')] }]);
check('balance de energía = lo que generan los paneles menos lo que consumen los equipos', powered.powerBalance === part('solar-panel').powerOutput - part('capsule').powerDraw - part('antenna').powerDraw);
check('la capacidad de batería suma la de la cápsula y la de las baterías', powered.energyCapacity === part('capsule').energyCapacity + part('battery').energyCapacity);

console.log('\n9) Etapas y combustible');
const engineOnly = stageSummary([part('engine-atm-m'), part('tank-hydro-m')]);
check('un motor no puede quemar un combustible que no es el suyo', engineOnly.propellant === 0 && engineOnly.strandedPropellant === part('tank-hydro-m').capacity);
const orphanTanks = analyzeRocket([{ items: [part('engine-atm-m'), part('tank-kero-m')] }, { items: [part('tank-kero-m'), part('capsule')] }]);
check('el combustible de una etapa sin motor no se puede usar: no da Δv', orphanTanks.stages[1].deltaV === 0);
const twoStage = [
  { items: [part('engine-atm-m'), part('tank-kero-m'), part('separator')] },
  { items: [part('engine-orbital'), part('tank-hyper-m'), part('capsule')] },
];
const firstStageDv = analyzeRocket(twoStage).stages[0].deltaV;
const justOver = simulatePlan(twoStage, [{ id: 'a', name: 'Tramo', dv: Math.ceil(firstStageDv + 300), atmosphere: true }]);
const upperDry = twoStage[1].items.reduce((total, item) => total + item.mass, 0);
check('al separarse, la etapa vacía deja de contar en la masa',
  justOver.ok && justOver.finalMass < upperDry + part('tank-hyper-m').capacity && justOver.finalMass > upperDry);
const flown = simulatePlan(twoStage, [{ id: 'a', name: 'Tramo', dv: 500 }]);
check('un tramo corto gasta solo de la primera etapa: la masa baja y no se suelta nada', flown.ok && flown.finalMass < analyzeRocket(twoStage).mass && flown.finalMass > analyzeRocket(twoStage).mass - 150_000);
const tooFar = simulatePlan(twoStage, [{ id: 'a', name: 'Tramo imposible', dv: 50_000 }]);
check(`si el combustible no alcanza, el plan falla y dice cuánto faltó ("${tooFar.legs[0].reason}")`, !tooFar.ok && tooFar.failedAt === 'a');
const noEngineUp = simulatePlan([twoStage[0], { items: [part('tank-hyper-m'), part('capsule')] }], [{ id: 'a', name: 'Tramo', dv: 9_000 }]);
check('una etapa soltada no sigue empujando: sin motor arriba, el plan se queda sin propulsión', !noEngineUp.ok);

console.log('\n10) Plan de vuelo lunar');
const legs = moonFlightPlan();
const leg = (id) => legs.find((l) => l.id === id);
check(`el plan pide ${totalDeltaV(legs)} m/s en total (≈ 18 000)`, near(totalDeltaV(legs), 18_000, 400));
check('subir a órbita cuesta la velocidad de órbita más las pérdidas', near(leg('ascent').dv, 9_390, 30));
check('alunizar y despegar de la Luna cuestan lo mismo', leg('descent').dv === leg('liftoff').dv && near(leg('descent').dv, 1_900, 60));
check('entrar y salir de la órbita lunar cuestan lo mismo', leg('loi').dv === leg('tei').dv && near(leg('loi').dv, 820, 40));
check('la reentrada no pide combustible, pide escudo térmico', leg('reentry').dv === 0 && leg('reentry').needs.includes('heatshield'));
check('la misión lunar usa ese plan y declara sus requisitos', getMission('moon').flightPlan.length === legs.length && getMission('moon').requirements.capabilities.includes('prism-cargo'));

console.log('\n11) Revisión antes de despegar');
const mission = getMission('moon');
const reference = buildFromBlueprint(EXAMPLE_BLUEPRINTS.moon).stages;
const review = validateRocket(reference, mission);
check(`el cohete de referencia (${Math.round(review.stats.mass / 1000)} t, piezas comunes) pasa sin errores críticos`, review.critical.length === 0);
check(`y completa los ${legs.length} tramos con ${Math.round(review.plan.spareDeltaV)} m/s de sobra`, review.plan.ok && review.plan.spareDeltaV > 0);
check('despega con empuje/peso mayor que 1.2', review.stats.twr > 1.2);
check('un cohete vacío no despega', codes(validateRocket([{ items: [] }], mission).critical).includes('empty'));

const without = (capability) => reference.map((stage) => ({ items: stage.items.filter((item) => !(item.provides ?? []).includes(capability)) }));
check('sin tren de aterrizaje: error crítico', codes(validateRocket(without('landing-gear'), mission).critical).includes('missing:landing-gear'));
check('sin instrumento para ubicar el Prisma: error crítico', codes(validateRocket(without('prism-scan'), mission).critical).includes('missing:prism-scan'));
check('sin soporte vital con tripulación a bordo: error crítico', codes(validateRocket(without('life-support'), mission).critical).includes('missing:life-support'));
const noRelay = validateRocket(without('relay'), mission);
check('sin satélite repetidor: se puede despegar, pero con advertencia', noRelay.critical.length === 0 && codes(noRelay.warnings).includes('recommended:relay'));

const halfFuel = reference.map((stage, index) => (index < 4 ? stage : { items: stage.items.map((item) => (item.kind === 'tank' ? { ...item, fill: 0.1 } : item)) }));
const short = validateRocket(halfFuel, mission);
check(`con poco combustible para volver: error crítico que nombra el tramo ("${short.critical[0]?.text}")`, codes(short.critical).some((code) => code.startsWith('plan:')));
const weakLift = [{ items: [part('engine-atm-m'), ...reference[0].items.filter((item) => item.kind !== 'engine')] }, ...reference.slice(1)];
check('con poco empuje en la primera etapa: no se levanta del suelo', codes(validateRocket(weakLift, mission).critical).includes('twr'));
const mixedFuel = [{ items: [part('engine-atm-m'), part('engine-vac-l'), part('tank-kero-m')] }, ...reference.slice(1)];
check('motores de combustibles distintos en una etapa: error crítico', codes(validateRocket(mixedFuel, mission).critical).includes('mixed:0'));
const wrongFuel = [{ items: [...many(5, 'engine-atm-l'), ...many(3, 'tank-hydro-l')] }, ...reference.slice(1)];
check('motor sin tanque de su combustible: error crítico', codes(validateRocket(wrongFuel, mission).critical).includes('dry:0'));
const crushed = [reference[0], reference[1], { items: [...reference[2].items.slice(0, 3), ...many(12, 'tank-kero-l'), ...reference[2].items.slice(3)] }, ...reference.slice(3)];
check('demasiado peso sobre un tanque chico: la estructura no aguanta', codes(validateRocket(crushed, mission).critical).includes('structure'));
const noPower = [{ items: [part('antenna'), part('spectrometer')] }];
check('equipos que consumen sin nada que genere ni guarde energía: error crítico', codes(validateRocket(noPower, mission).critical).includes('nopower'));
const hungry = reference.map((stage) => ({ items: stage.items.filter((item) => item.partId !== 'solar-panel') }));
check('consumir más de lo que se genera: advertencia con las horas de batería', codes(validateRocket(hungry, mission).warnings).includes('power'));
check('un detalle cosmético no impide despegar: sin cofia es solo una recomendación',
  (() => { const bare = validateRocket(without('aero'), mission); return bare.critical.length === 0 && codes(bare.tips).includes('noaero'); })());

const upgraded = buildFromBlueprint(EXAMPLE_BLUEPRINTS.moon, (partId) => (partId.startsWith('engine') ? { tier: 'rare' } : {})).stages;
const upgradedReview = validateRocket(upgraded, mission);
check(`con motores raros sobra más combustible (${Math.round(upgradedReview.plan.spareDeltaV)} m/s) y cuesta más`,
  upgradedReview.plan.spareDeltaV > review.plan.spareDeltaV + 300 && upgradedReview.stats.cost > review.stats.cost);
const secondHand = buildFromBlueprint(EXAMPLE_BLUEPRINTS.moon, { condition: 'used' }).stages;
check('el mismo cohete con piezas usadas sale más barato', analyzeRocket(secondHand).cost < review.stats.cost);

console.log(failures === 0 ? `\nTODO OK ✅ (${checks} verificaciones de física)` : `\n${failures} verificación(es) fallaron ❌`);
process.exit(failures === 0 ? 0 : 1);
