/**
 * PRUEBAS DEL MERCADO Y DE LA ECONOMÍA
 * Sin servidor ni navegador: arma mercados con semillas fijas y aplica compras a mano.
 * Uso: npm test   (corre después de tests/physics.js)
 */
import { EXAMPLE_BLUEPRINTS, buildFromBlueprint } from '../js/blueprints.js';
import { PARTS, resolvePart } from '../js/catalog.js';
import { INSPECTIONS, SELLERS, generateMarket, inspect, knownVersion, refundFor, trueItem } from '../js/market.js';
import { getMission } from '../js/missions.js';
import { analyzeRocket } from '../js/rocket.js';
import { applyEconomyAction, openEconomy } from '../server/economy.js';

let failures = 0;
let checks = 0;
const check = (label, passed) => {
  checks++;
  console.log(`${passed ? '  ✔' : '  ✘'} ${label}`);
  if (!passed) failures++;
};

const mission = getMission('moon');
const merchant = { id: 'm', name: 'Meche', role: 'merchant', canActAs: (role) => role === 'merchant' };
const engineer = { id: 'e', name: 'Inés', role: 'engineer', canActAs: (role) => role === 'engineer' };
/** Aplica una acción y devuelve el resultado; `shop` guarda la economía y la caja fuerte que van quedando. */
const makeShop = (seed = 7) => {
  const shop = openEconomy(mission, seed);
  shop.do = (action, actor = merchant, stage = 'market') => {
    const result = applyEconomyAction(shop.economy, shop.vault, action, actor, stage);
    if (!result.error) Object.assign(shop, { economy: result.economy, vault: result.vault });
    return result;
  };
  return shop;
};

// ------------------------------------------------------------
console.log('1) El mercado de cada misión');
const market = generateMarket(mission, 7);
check('la misma semilla arma siempre el mismo mercado', JSON.stringify(generateMarket(mission, 7)) === JSON.stringify(market));
check('otra semilla arma otro mercado negro', JSON.stringify(generateMarket(mission, 8).black) !== JSON.stringify(market.black));
check(`el mercado legal vende las ${PARTS.length} piezas en 3 rarezas`, market.offers.length === PARTS.length * 3);
check('el mercado legal no vende épicas ni legendarias en la primera misión', market.offers.every((o) => ['common', 'uncommon', 'rare'].includes(o.tier)));
check('todo lo legal es nuevo', market.offers.every((o) => o.condition === 'new'));
const tiersOf = (partId) => ['common', 'uncommon', 'rare'].map((tier) => market.offers.find((o) => o.partId === partId && o.tier === tier));
check('de cada pieza, la rareza mejor cuesta más', PARTS.every((p) => { const [c, u, r] = tiersOf(p.id); return c.price < u.price && u.price < r.price; }));
check('y rinde más: el motor raro es más eficiente que el común',
  resolvePart(tiersOf('engine-vac-l')[2]).isp > resolvePart(tiersOf('engine-vac-l')[0]).isp);
check('las comunes no se agotan; las raras vienen contadas', market.offers.every((o) => (o.tier === 'rare' ? o.stock >= 3 && o.stock <= 6 : o.stock === null)));

let saleSeed = 0;
while (generateMarket(mission, saleSeed).event.id !== 'engine-sale') saleSeed++;
const sale = generateMarket(mission, saleSeed);
const listed = (offer) => resolvePart(offer).price;
check(`una novedad del mercado cambia precios de verdad ("${sale.event.text}")`,
  sale.offers.filter((o) => o.partId.startsWith('engine')).every((o) => o.price === Math.round(listed(o) * 0.88))
  && sale.offers.filter((o) => o.partId.startsWith('tank')).every((o) => o.price === listed(o)));

console.log('\n2) El mercado negro');
check(`hay ${SELLERS.length} vendedores con 4 ofertas cada uno`, SELLERS.every((s) => market.black.filter((o) => o.sellerId === s.id).length === 4));
check('todas las ofertas cuestan menos que el precio de lista de lo que anuncian', market.black.every((o) => o.price < listed(o)));
check('lo que ve el equipo no trae la verdad escondida',
  market.black.every((o) => !('defect' in o) && !('delivers' in o)) && !JSON.stringify(market.black).includes('delivers'));
check('cada oferta tiene su verdad guardada aparte', market.black.every((o) => o.id in market.truth));

// Con muchos mercados se ve el carácter de cada vendedor.
const tally = Object.fromEntries(SELLERS.map((s) => [s.id, { offers: 0, asAdvertised: 0, bargains: 0, noShows: 0, defects: 0 }]));
for (let seed = 0; seed < 300; seed++) {
  const sample = generateMarket(mission, seed);
  for (const offer of sample.black) {
    const truth = sample.truth[offer.id];
    const t = tally[offer.sellerId];
    t.offers++;
    if (truth.quality >= offer.quality - 0.1 && truth.condition === offer.condition && truth.defect === 1) t.asAdvertised++;
    if (truth.quality > offer.quality && truth.defect === 1) t.bargains++;
    if (!truth.delivers) t.noShows++;
    if (truth.defect > 1) t.defects++;
  }
}
const rate = (id, key) => tally[id][key] / tally[id].offers;
check(`Doña Rita cumple mucho más seguido (${Math.round(rate('rita', 'asAdvertised') * 100)} %) que Muelle 9 (${Math.round(rate('muelle9', 'asAdvertised') * 100)} %)`,
  rate('rita', 'asAdvertised') > 0.75 && rate('muelle9', 'asAdvertised') < 0.4);
check('no todo es malo: todos los vendedores tienen gangas de verdad', SELLERS.every((s) => rate(s.id, 'bargains') > 0.05));
check('y ninguno es siempre malo ni siempre bueno', SELLERS.every((s) => rate(s.id, 'asAdvertised') > 0.15 && rate(s.id, 'asAdvertised') < 0.95));
check('solo Muelle 9 cobra y desaparece, y no siempre', rate('muelle9', 'noShows') > 0.05 && rate('muelle9', 'noShows') < 0.3 && rate('rita', 'noShows') === 0 && rate('zurdo', 'noShows') === 0);

console.log('\n3) Inspecciones y lo que se sabe de una pieza');
const liar = { quality: 0.2, condition: 'damaged', defect: 2.5, delivers: true };
const advertised = { id: 'bx', sellerId: 'muelle9', partId: 'engine-vac-l', tier: 'rare', quality: 0.8, condition: 'new', price: 500, stock: 2, inspection: null };
const basic = inspect(liar, 'basic');
const advanced = inspect(liar, 'advanced');
check('la inspección básica muestra el estado real y nada más', basic.condition === 'damaged' && !('quality' in basic) && !('defect' in basic));
check('la avanzada muestra también el rendimiento real y si hay un defecto', advanced.quality === 0.2 && advanced.defect === true);
check('ninguna dice qué tan grave es el defecto ni si el vendedor entrega', !JSON.stringify(advanced).includes('2.5') && !('delivers' in advanced));
check('sin inspección, el equipo cree lo anunciado', knownVersion(advertised).quality === 0.8 && knownVersion(advertised).condition === 'new');
check('con inspección, lo que se sabe se corrige', knownVersion({ ...advertised, inspection: advanced }).quality === 0.2 && knownVersion({ ...advertised, inspection: basic }).condition === 'damaged');
const believed = resolvePart(knownVersion(advertised));
const real = trueItem(advertised, liar);
check('el riesgo cae sobre los números de ESA pieza: empuja menos y falla más de lo anunciado', real.thrust < believed.thrust && real.failureRate > believed.failureRate * 2);
const honest = trueItem(advertised, { quality: 0.8, condition: 'new', defect: 1 });
check('una pieza honesta rinde exactamente lo anunciado', honest.thrust === believed.thrust && honest.failureRate === believed.failureRate);

console.log('\n4) Presupuesto y compras');
const shop = makeShop();
check(`la misión abre con ${mission.budget.toLocaleString('es')} créditos y la bodega vacía`, shop.economy.credits === mission.budget && shop.economy.inventory.length === 0);
const capsulePrice = shop.economy.offers.find((o) => o.id === 'capsule:common').price;
const bought = shop.do({ type: 'market:buy', offerId: 'capsule:common', quantity: 2 });
check('comprar descuenta el precio exacto y suma las piezas a la bodega', !bought.error && shop.economy.credits === mission.budget - 2 * capsulePrice && shop.economy.inventory.length === 2);
check('cada pieza comprada tiene su propio identificador', new Set(shop.economy.inventory.map((i) => i.uid)).size === 2);
check('lo legal queda guardado como lo que es: sin defectos', Object.values(shop.vault.items).every((t) => t.defect === 1));
const before = shop.economy.credits;
const tooMuch = shop.do({ type: 'market:buy', offerId: 'engine-atm-l:uncommon', quantity: 20 });
check(`no se puede gastar más de lo que hay ("${tooMuch.error}")`, Boolean(tooMuch.error) && shop.economy.credits === before && shop.economy.inventory.length === 2);
check('ni comprar cero, ni cantidades negativas, ni de a cientos',
  [0, -3, 500].every((quantity) => Boolean(shop.do({ type: 'market:buy', offerId: 'battery:common', quantity }).error)));
const rare = shop.economy.offers.find((o) => o.id === 'battery:rare');
check('no se puede comprar más de lo que hay en existencia', Boolean(shop.do({ type: 'market:buy', offerId: 'battery:rare', quantity: rare.stock + 1 }).error));
shop.do({ type: 'market:buy', offerId: 'battery:rare', quantity: rare.stock });
check('al comprar todo, la oferta queda agotada', shop.economy.offers.find((o) => o.id === 'battery:rare').stock === 0 && Boolean(shop.do({ type: 'market:buy', offerId: 'battery:rare' }).error));
check('quien no es Comercio no puede comprar', Boolean(shop.do({ type: 'market:buy', offerId: 'battery:common' }, engineer).error));
check('fuera de las etapas de mercado no se compra', Boolean(shop.do({ type: 'market:buy', offerId: 'battery:common' }, merchant, 'flight').error));
check('pero sí durante la construcción y la validación',
  !shop.do({ type: 'market:buy', offerId: 'battery:common' }, merchant, 'build').error && !shop.do({ type: 'market:buy', offerId: 'battery:common' }, merchant, 'validation').error);
check('el dinero nunca queda negativo', shop.economy.credits >= 0);

const asked = shop.do({ type: 'market:request', offerId: 'spectrometer:common' }, engineer);
check('cualquier rol puede pedir una pieza: queda anotado para Comercio', !asked.error && shop.economy.requests['spectrometer:common'][0].role === 'engineer');
shop.do({ type: 'market:request', offerId: 'spectrometer:common' }, engineer);
check('pedirla otra vez retira el pedido', !('spectrometer:common' in shop.economy.requests));
shop.do({ type: 'market:request', offerId: 'spectrometer:common' }, engineer);
shop.do({ type: 'market:buy', offerId: 'spectrometer:common' });
check('al comprarla, el pedido se da por cumplido', !('spectrometer:common' in shop.economy.requests));

const capsule = shop.economy.inventory.find((i) => i.partId === 'capsule');
const creditsBeforeSale = shop.economy.credits;
shop.do({ type: 'market:sell', uid: capsule.uid });
check('devolver una pieza legal recupera el 60 % de lo pagado', shop.economy.credits === creditsBeforeSale + Math.round(capsulePrice * 0.6) && refundFor(capsule) === Math.round(capsulePrice * 0.6));
check('y la pieza sale de la bodega y de la caja fuerte', !shop.economy.inventory.some((i) => i.uid === capsule.uid) && !(capsule.uid in shop.vault.items));
check('no se puede devolver dos veces la misma pieza', Boolean(shop.do({ type: 'market:sell', uid: capsule.uid }).error));

console.log('\n5) Comprar en el mercado negro');
const dark = makeShop(11);
const target = dark.economy.black[0];
const start = dark.economy.credits;
check('una inspección cuesta lo que dice y su resultado lo ve todo el equipo',
  !dark.do({ type: 'black:inspect', offerId: target.id, level: 'basic' }).error
  && dark.economy.credits === start - INSPECTIONS.basic.cost && dark.economy.black[0].inspection.level === 'basic');
check('no se paga dos veces la misma inspección', Boolean(dark.do({ type: 'black:inspect', offerId: target.id, level: 'basic' }).error));
check('se puede subir a la avanzada', !dark.do({ type: 'black:inspect', offerId: target.id, level: 'advanced' }).error && 'quality' in dark.economy.black[0].inspection);
check('y después ya no tiene sentido bajar a la básica', Boolean(dark.do({ type: 'black:inspect', offerId: target.id, level: 'basic' }).error));
check('quien no es Comercio no puede inspeccionar ni comprar ahí',
  Boolean(dark.do({ type: 'black:inspect', offerId: dark.economy.black[1].id, level: 'basic' }, engineer).error)
  && Boolean(dark.do({ type: 'black:buy', offerId: target.id }, engineer).error));

// Una oferta honesta: llega lo que se sabía.
dark.vault.truth[target.id] = { quality: dark.economy.black[0].inspection.quality, condition: dark.economy.black[0].inspection.condition, defect: 1, delivers: true };
const beforeBuy = dark.economy.credits;
dark.do({ type: 'black:buy', offerId: target.id });
const arrived = dark.economy.inventory.at(-1);
check('la compra descuenta el precio y la pieza llega a la bodega marcada como de mercado negro',
  dark.economy.credits === beforeBuy - target.price && arrived.source === 'black' && arrived.sellerId === target.sellerId && arrived.inspected === 'advanced');
check('la bodega muestra lo que se sabe; la verdad queda en la caja fuerte', dark.vault.items[arrived.uid].delivers === undefined && 'defect' in dark.vault.items[arrived.uid] && !('defect' in arrived));
check('devolver algo del mercado negro recupera solo el 40 %', refundFor(arrived) === Math.round(target.price * 0.4));

// Una pieza que se anuncia nueva y llega dañada: se nota al abrir la caja.
const second = dark.economy.black[1];
dark.vault.truth[second.id] = { quality: 0.1, condition: 'damaged', defect: 2, delivers: true };
const damagedBuy = dark.do({ type: 'black:buy', offerId: second.id });
check(`un daño grave se descubre al llegar ("${damagedBuy.log}")`, dark.economy.inventory.at(-1).condition === 'damaged' && damagedBuy.log.includes('dañada'));
check('pero el defecto oculto sigue oculto', !('defect' in dark.economy.inventory.at(-1)) && dark.vault.items[dark.economy.inventory.at(-1).uid].defect === 2);

// Un vendedor que cobra y desaparece.
const third = dark.economy.black[2];
dark.vault.truth[third.id] = { ...dark.vault.truth[third.id], delivers: false };
const count = dark.economy.inventory.length;
const beforeScam = dark.economy.credits;
const scam = dark.do({ type: 'black:buy', offerId: third.id });
check(`si el vendedor desaparece, se pierde el dinero y no llega nada ("${scam.log}")`,
  dark.economy.credits === beforeScam - third.price && dark.economy.inventory.length === count && dark.economy.black[2].gone === true);
check('y ya no se le puede comprar más', Boolean(dark.do({ type: 'black:buy', offerId: third.id }).error));

console.log('\n6) El presupuesto obliga a elegir');
const calm = (() => { let seed = 0; while (generateMarket(mission, seed).event.id !== 'calm') seed++; return generateMarket(mission, seed); })();
const priceOf = (partId, tier) => calm.offers.find((o) => o.partId === partId && o.tier === tier).price;
const partIds = EXAMPLE_BLUEPRINTS.moon.stages.flat();
const fuel = (() => { const stats = analyzeRocket(buildFromBlueprint(EXAMPLE_BLUEPRINTS.moon).stages); return stats.cost - buildFromBlueprint(EXAMPLE_BLUEPRINTS.moon).stages.flatMap((s) => s.items).reduce((t, i) => t + i.price, 0); })();
const allCommon = partIds.reduce((total, id) => total + priceOf(id, 'common'), 0) + fuel;
const allRare = partIds.reduce((total, id) => total + priceOf(id, 'rare'), 0) + fuel;
check(`el cohete de referencia con piezas comunes y su combustible cuesta ${allCommon.toLocaleString('es')}: entra en el presupuesto`, allCommon <= mission.budget && allCommon > mission.budget * 0.7);
check(`todo en rareza rara costaría ${allRare.toLocaleString('es')}: no alcanza, hay que elegir dónde mejorar`, allRare > mission.budget);

console.log(failures === 0 ? `\nTODO OK ✅ (${checks} verificaciones del mercado)` : `\n${failures} verificación(es) fallaron ❌`);
process.exit(failures === 0 ? 0 : 1);
