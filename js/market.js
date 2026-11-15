/**
 * MERCADO Y MERCADO NEGRO (reglas)
 * Qué se vende en cada misión, a qué precio, y cómo funciona lo que no se ve.
 * Funciones puras: el servidor las usa para armar el mercado y resolver compras; el navegador,
 * para mostrar lo que el equipo sabe de cada pieza.
 *
 * MERCADO LEGAL: piezas nuevas, con los números verificados. Lo que dice la ficha es lo que llega.
 *
 * MERCADO NEGRO: más barato porque nadie garantiza nada. Cada oferta tiene dos versiones:
 *   - lo ANUNCIADO (rareza, calidad, estado): lo que dice el vendedor y lo que ve todo el equipo;
 *   - la VERDAD (calidad real, estado real, defecto oculto, si entrega o no): solo la conoce el
 *     servidor. Sale a la luz de a poco: con inspecciones, al llegar la pieza, o en pleno vuelo.
 * No todo lo del mercado negro es malo: un vendedor honesto puede dar una ganga de verdad.
 *
 * Todo lo de este archivo (precios, descuentos, honestidad, probabilidades) son valores de juego.
 */
import { PARTS, TIERS, getPart, resolvePart, tierIndex } from './catalog.js';
import { between, createRng, pick } from './random.js';

/** Etapas de la misión en las que se puede comprar y vender. */
export const MARKET_STAGES = ['market', 'build', 'validation'];

/** Cuánto se recupera al devolver una pieza, según dónde se compró. */
export const REFUND = { market: 0.6, black: 0.4 };

/** Inspecciones del mercado negro: reducen la incertidumbre, no la eliminan. */
export const INSPECTIONS = {
  basic: { name: 'Inspección básica', cost: 40, reveals: 'el estado real de la pieza' },
  advanced: { name: 'Inspección avanzada', cost: 130, reveals: 'el estado, el rendimiento real y si tiene un defecto oculto' },
};
const INSPECTION_ORDER = [null, 'basic', 'advanced'];
export const inspectionRank = (level) => INSPECTION_ORDER.indexOf(level ?? null);

/** Novedades del mercado legal: en cada misión toca una. `factor` multiplica el precio de lo que alcanza. */
export const MARKET_EVENTS = [
  { id: 'calm', text: 'Mercado estable: precios de lista.', factor: 1 },
  { id: 'engine-sale', text: 'Un proveedor liquida motores: 12 % menos en todos los motores.', kind: 'engine', factor: 0.88 },
  { id: 'tank-surplus', text: 'Sobran tanques en el puerto: 10 % menos en todos los tanques.', kind: 'tank', factor: 0.9 },
  { id: 'energy-shortage', text: 'Escasez de paneles y baterías: 20 % más caros.', category: 'energy', factor: 1.2 },
  { id: 'science-demand', text: 'Todos buscan instrumentos: 15 % más caros los de exploración.', category: 'exploration', factor: 1.15 },
];

/**
 * Vendedores del mercado negro.
 *   reputation  de 1 a 5: qué tanto se puede confiar en lo que anuncia
 *   honesty     probabilidad de que la pieza sea lo que dice (valor de juego, no se muestra)
 *   discount    rango del precio frente al de lista de lo anunciado
 *   noShow      probabilidad de que cobre y no entregue
 */
export const SELLERS = [
  {
    id: 'rita', name: 'Doña Rita', reputation: 4,
    line: 'Desguace orbital. Piezas usadas que casi siempre son lo que ella dice.',
    honesty: 0.85, discount: [0.62, 0.78], noShow: 0, tiers: ['common', 'uncommon', 'rare'], conditions: ['used', 'repaired'],
  },
  {
    id: 'zurdo', name: 'El Zurdo', reputation: 3,
    line: 'Tecnología rara que no se consigue en ningún otro lado. No pregunta, no explica.',
    honesty: 0.6, discount: [0.5, 0.66], noShow: 0, tiers: ['rare', 'epic'], conditions: ['new', 'used'],
  },
  {
    id: 'muelle9', name: 'Muelle 9', reputation: 1,
    line: 'Lo más barato del puerto. Sin nombre, sin garantía, y a veces sin entrega.',
    honesty: 0.3, discount: [0.3, 0.46], noShow: 0.15, tiers: ['common', 'uncommon', 'rare', 'epic'], conditions: ['new', 'used'],
  },
];
export const getSeller = (id) => SELLERS.find((seller) => seller.id === id);

/** Lo que suele aparecer en el mercado negro: piezas caras o de las que se llevan varias. */
const BLACK_POOL = [
  'engine-atm-l', 'engine-atm-m', 'engine-vac-l', 'engine-vac-s', 'engine-lander', 'engine-orbital',
  'tank-kero-l', 'tank-hydro-l', 'tank-hydro-m', 'tank-hyper-m',
  'solar-panel', 'battery', 'antenna', 'antenna-ka', 'relay-sat', 'spectrometer', 'camera', 'life-support', 'landing-legs',
];
const OFFERS_PER_SELLER = 4;
const WORSE = { new: 'used', used: 'damaged', repaired: 'damaged', damaged: 'damaged' };
const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Arma el mercado de una misión a partir de una semilla.
 * Devuelve `{ event, offers, black }` (lo que ve el equipo) y `truth` (lo que solo sabe el servidor).
 */
export const generateMarket = (mission, seed) => {
  const rng = createRng(seed);
  const event = pick(rng, MARKET_EVENTS);
  const reaches = (part) => (event.kind ? part.kind === event.kind : event.category ? part.category === event.category : false);
  const topTier = tierIndex(mission?.maxTier ?? 'rare');

  // Mercado legal: cada pieza en cada rareza permitida. Las raras vienen de a pocas.
  const offers = PARTS.flatMap((part) => TIERS.slice(0, topTier + 1).map((tier, index) => {
    const quality = index === 0 ? 0.5 : round2(between(rng, 0.35, 0.7));
    const listed = resolvePart({ partId: part.id, tier: tier.id, quality });
    return {
      id: `${part.id}:${tier.id}`,
      partId: part.id,
      tier: tier.id,
      quality,
      condition: 'new',
      price: Math.max(1, Math.round(listed.price * (reaches(part) ? event.factor : 1))),
      stock: index < 2 ? null : 3 + Math.floor(rng() * 4), // null = sin límite
    };
  }));

  // Mercado negro: lotes sueltos de cada vendedor, con su verdad escondida.
  const black = [];
  const truth = {};
  for (const seller of SELLERS) {
    const taken = new Set();
    for (let n = 0; n < OFFERS_PER_SELLER; n++) {
      let partId = pick(rng, BLACK_POOL);
      for (let tries = 0; taken.has(partId) && tries < 20; tries++) partId = pick(rng, BLACK_POOL);
      taken.add(partId);
      const part = getPart(partId);
      const offer = {
        id: `b${black.length + 1}`,
        sellerId: seller.id,
        partId,
        tier: pick(rng, seller.tiers),
        quality: round2(between(rng, 0.35, 0.9)),
        condition: pick(rng, seller.conditions),
        price: 0,
        stock: part.kind === 'engine' || part.kind === 'tank' ? 2 + Math.floor(rng() * 4) : 1 + Math.floor(rng() * 2),
        inspection: null, // lo que revelaron las inspecciones pagadas (lo ve todo el equipo)
        gone: false, //      el vendedor desapareció
      };
      offer.price = Math.max(1, Math.round(resolvePart(offer).price * between(rng, seller.discount[0], seller.discount[1])));

      const honest = rng() < seller.honesty;
      truth[offer.id] = honest
        ? { quality: round2(Math.min(1, Math.max(0, offer.quality + between(rng, -0.08, 0.15)))), condition: offer.condition, defect: 1 }
        : {
            quality: round2(Math.max(0, offer.quality - between(rng, 0.2, 0.6))),
            condition: rng() < 0.5 ? WORSE[offer.condition] : offer.condition,
            defect: rng() < 0.6 ? round2(between(rng, 1.5, 3)) : 1, // multiplica la probabilidad de falla
          };
      truth[offer.id].delivers = rng() >= seller.noShow;
      black.push(offer);
    }
  }

  return { event: { id: event.id, text: event.text }, offers, black, truth };
};

/** Lo que revela una inspección de un nivel dado. */
export const inspect = (truth, level) => (level === 'advanced'
  ? { level, condition: truth.condition, quality: truth.quality, defect: truth.defect > 1 }
  : { level: 'basic', condition: truth.condition });

/**
 * La mejor versión que el equipo conoce de una oferta del mercado negro o de una pieza comprada ahí:
 * lo anunciado, corregido por lo que mostró la inspección.
 */
export const knownVersion = (offer) => ({
  partId: offer.partId,
  tier: offer.tier,
  quality: offer.inspection?.quality ?? offer.quality,
  condition: offer.inspection?.condition ?? offer.condition,
});

/** Los números verdaderos de una pieza (solo el servidor tiene `truth`). */
export const trueItem = (item, truth) => {
  const real = resolvePart({ partId: item.partId, tier: item.tier, quality: truth.quality, condition: truth.condition });
  return { ...real, failureRate: Math.min(0.95, real.failureRate * (truth.defect ?? 1)) };
};

/** Cuánto devuelven por una pieza de la bodega. */
export const refundFor = (item) => Math.round(item.paid * (REFUND[item.source] ?? 0));
