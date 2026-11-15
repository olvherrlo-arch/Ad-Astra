/**
 * ECONOMÍA DE LA MISIÓN (servidor)
 * Presupuesto, compras en el mercado y en el mercado negro, inspecciones, devoluciones y la
 * bodega de piezas compradas. Funciones puras: reciben la economía y devuelven la nueva.
 *
 * Lo que ve el equipo va en `economy` (dentro de state.data). Lo que no puede saber va en
 * `vault` (dentro de state.secret) y nunca sale del servidor:
 *   vault.truth[id de oferta]  la verdad de cada oferta del mercado negro
 *   vault.items[uid]           la verdad de cada pieza comprada (la usará el vuelo)
 *
 * Como el servidor aplica las acciones de a una, dos compras "al mismo tiempo" no pueden gastar
 * el mismo dinero: la segunda se evalúa con lo que dejó la primera.
 */
import { getPart, TIERS } from '../js/catalog.js';
import { number } from '../js/partinfo.js';
import { INSPECTIONS, MARKET_STAGES, generateMarket, inspect, inspectionRank, knownVersion, refundFor } from '../js/market.js';

const MAX_PER_PURCHASE = 20;
const tierName = (id) => TIERS.find((tier) => tier.id === id)?.name.toLowerCase() ?? id;
const credits = (amount) => `${number(amount)} créditos`;

/** Abre la economía al elegir la misión: presupuesto completo, bodega vacía y el mercado de esta partida. */
export const openEconomy = (mission, seed) => {
  const { event, offers, black, truth } = generateMarket(mission, seed);
  return {
    economy: {
      budget: mission.budget,
      credits: mission.budget, //  lo que queda por gastar
      inventory: [], //            piezas compradas: { uid, partId, tier, quality, condition, source, sellerId?, inspected?, knownDefect?, paid }
      nextUid: 1,
      event,
      offers,
      black,
      requests: {}, //             id de oferta → [{ id, name, role }] de quienes la pidieron
    },
    vault: { truth, items: {} },
  };
};

export const isEconomyAction = (action) => {
  const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 40;
  switch (action.type) {
    case 'market:buy':
    case 'black:buy':
      return id(action.offerId) && (action.quantity === undefined || Number.isInteger(action.quantity));
    case 'black:inspect':
      return id(action.offerId) && action.level in INSPECTIONS;
    case 'market:sell':
      return id(action.uid);
    case 'market:request':
      return id(action.offerId);
    default:
      return false;
  }
};

/**
 * Aplica una acción de mercado. Devuelve `{ economy, vault, log }` o `{ error }`.
 * @param {{ id: string, name: string, role: string | null, canActAs: (roleId: string) => boolean }} actor
 */
export const applyEconomyAction = (economy, vault, action, actor, stageId) => {
  if (!economy) return { error: 'Primero hay que elegir la misión.' };
  if (!MARKET_STAGES.includes(stageId)) return { error: 'El mercado abre en la etapa Mercado y cierra al despegar.' };

  // Pedir una pieza: lo puede hacer cualquiera, y es solo un aviso para Comercio.
  if (action.type === 'market:request') {
    const offer = [...economy.offers, ...economy.black].find((o) => o.id === action.offerId);
    if (!offer) return { error: 'Esa oferta ya no existe.' };
    const current = economy.requests[offer.id] ?? [];
    const mine = current.some((request) => request.id === actor.id);
    const next = mine ? current.filter((request) => request.id !== actor.id) : [...current, { id: actor.id, name: actor.name, role: actor.role }];
    const requests = { ...economy.requests, [offer.id]: next };
    if (next.length === 0) delete requests[offer.id];
    return { economy: { ...economy, requests }, vault, log: mine ? null : `${actor.name} pidió: ${getPart(offer.partId).name}.` };
  }

  if (!actor.canActAs('merchant')) return { error: 'El dinero lo maneja Comercio.' };
  const quantity = action.quantity ?? 1;
  const withoutRequest = (offerId) => {
    const requests = { ...economy.requests };
    delete requests[offerId];
    return requests;
  };

  switch (action.type) {
    case 'market:buy': {
      const offer = economy.offers.find((o) => o.id === action.offerId);
      if (!offer) return { error: 'Esa oferta ya no existe.' };
      if (quantity < 1 || quantity > MAX_PER_PURCHASE) return { error: `Se compran de 1 a ${MAX_PER_PURCHASE} por vez.` };
      if (offer.stock !== null && offer.stock < quantity) return { error: offer.stock === 0 ? 'Se agotó.' : `Solo quedan ${offer.stock}.` };
      const total = offer.price * quantity;
      if (total > economy.credits) return { error: `No alcanza: cuesta ${credits(total)} y quedan ${credits(economy.credits)}.` };

      const bought = Array.from({ length: quantity }, (_unused, n) => ({
        uid: `p${economy.nextUid + n}`,
        partId: offer.partId, tier: offer.tier, quality: offer.quality, condition: offer.condition,
        source: 'market', paid: offer.price,
      }));
      const items = { ...vault.items };
      for (const item of bought) items[item.uid] = { quality: item.quality, condition: item.condition, defect: 1 };
      return {
        economy: {
          ...economy,
          credits: economy.credits - total,
          nextUid: economy.nextUid + quantity,
          inventory: [...economy.inventory, ...bought],
          offers: economy.offers.map((o) => (o.id === offer.id && o.stock !== null ? { ...o, stock: o.stock - quantity } : o)),
          requests: withoutRequest(offer.id),
        },
        vault: { ...vault, items },
        log: `${actor.name} compró ${quantity} × ${getPart(offer.partId).name} (${tierName(offer.tier)}) por ${credits(total)}.`,
      };
    }

    case 'black:inspect': {
      const offer = economy.black.find((o) => o.id === action.offerId);
      if (!offer || offer.gone || offer.stock === 0) return { error: 'Esa oferta ya no está.' };
      if (inspectionRank(action.level) <= inspectionRank(offer.inspection?.level)) return { error: 'Esa inspección ya está hecha.' };
      const { cost, name } = INSPECTIONS[action.level];
      if (cost > economy.credits) return { error: `No alcanza para la inspección: cuesta ${credits(cost)}.` };
      return {
        economy: {
          ...economy,
          credits: economy.credits - cost,
          black: economy.black.map((o) => (o.id === offer.id ? { ...o, inspection: inspect(vault.truth[offer.id], action.level) } : o)),
        },
        vault,
        log: `${actor.name} pagó una ${name.toLowerCase()} de ${getPart(offer.partId).name} (${credits(cost)}).`,
      };
    }

    case 'black:buy': {
      const offer = economy.black.find((o) => o.id === action.offerId);
      if (!offer || offer.gone) return { error: 'Esa oferta ya no está.' };
      if (quantity < 1 || quantity > MAX_PER_PURCHASE) return { error: `Se compran de 1 a ${MAX_PER_PURCHASE} por vez.` };
      if (offer.stock < quantity) return { error: offer.stock === 0 ? 'Se agotó.' : `Solo quedan ${offer.stock}.` };
      const total = offer.price * quantity;
      if (total > economy.credits) return { error: `No alcanza: cuesta ${credits(total)} y quedan ${credits(economy.credits)}.` };
      const truth = vault.truth[offer.id];
      const partName = getPart(offer.partId).name;

      // El vendedor cobra y desaparece: se pierde el dinero y no llega nada.
      if (!truth.delivers) {
        return {
          economy: {
            ...economy,
            credits: economy.credits - total,
            black: economy.black.map((o) => (o.id === offer.id ? { ...o, gone: true, stock: 0 } : o)),
            requests: withoutRequest(offer.id),
          },
          vault,
          log: `${actor.name} pagó ${credits(total)} por ${partName} en el mercado negro… y el vendedor desapareció con el dinero.`,
        };
      }

      // Llega la pieza. Un daño grave se nota al abrir la caja; un defecto oculto, no.
      const known = knownVersion(offer);
      const arrivedDamaged = truth.condition === 'damaged' && known.condition !== 'damaged';
      const bought = Array.from({ length: quantity }, (_unused, n) => ({
        uid: `p${economy.nextUid + n}`,
        ...known,
        condition: arrivedDamaged ? 'damaged' : known.condition,
        source: 'black', sellerId: offer.sellerId, inspected: offer.inspection?.level ?? null,
        knownDefect: offer.inspection?.defect ?? null, // true = se detectó, false = no se detectó, null = no se revisó
        paid: offer.price,
      }));
      const items = { ...vault.items };
      for (const item of bought) items[item.uid] = { quality: truth.quality, condition: truth.condition, defect: truth.defect };
      return {
        economy: {
          ...economy,
          credits: economy.credits - total,
          nextUid: economy.nextUid + quantity,
          inventory: [...economy.inventory, ...bought],
          black: economy.black.map((o) => (o.id === offer.id ? { ...o, stock: o.stock - quantity } : o)),
          requests: withoutRequest(offer.id),
        },
        vault: { ...vault, items },
        log: `${actor.name} compró ${quantity} × ${partName} en el mercado negro por ${credits(total)}.`
          + (arrivedDamaged ? ' Al abrir la caja, la pieza llegó dañada.' : ''),
      };
    }

    case 'market:sell': {
      const item = economy.inventory.find((i) => i.uid === action.uid);
      if (!item) return { error: 'Esa pieza ya no está en la bodega.' };
      const refund = refundFor(item);
      const items = { ...vault.items };
      delete items[item.uid];
      return {
        economy: { ...economy, credits: economy.credits + refund, inventory: economy.inventory.filter((i) => i.uid !== item.uid) },
        vault: { ...vault, items },
        log: `${actor.name} devolvió ${getPart(item.partId).name} y recuperó ${credits(refund)}.`,
      };
    }

    default:
      return { error: 'Acción desconocida.' };
  }
};
