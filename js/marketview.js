/**
 * MERCADO EN PANTALLA
 * La herramienta de la etapa Mercado: presupuesto, mercado legal, mercado negro y bodega.
 * - Todos ven el dinero, las ofertas y la bodega. Solo quien maneja Comercio compra, inspecciona
 *   y devuelve; los demás pueden "pedir" una pieza para que Comercio lo vea.
 * - El mercado negro solo lo ve quien maneja Comercio: el resto tiene que preguntarle.
 * Las reglas están en js/market.js y server/economy.js; aquí solo se dibuja y se mandan acciones.
 */
import { CAPABILITIES, CATEGORIES, PARTS, getPart, propellantPrice, resolvePart } from './catalog.js';
import { on, sendAction, session } from './connection.js';
import { INSPECTIONS, REFUND, getSeller, inspectionRank, knownVersion, refundFor } from './market.js';
import { getMission } from './missions.js';
import { GLOSSARY, conditionName, credits, fixedFacts, mass, number, tierOf, versionColumns } from './partinfo.js';
import { canActAs, roleName } from './shared.js';

const MARKET_HTML = `
<section class="market" aria-label="Mercado">
  <header class="market-head">
    <div class="budget">
      <span class="budget-label">Quedan</span>
      <strong class="budget-credits"></strong>
      <div class="budget-bar" role="img"><i></i></div>
      <span class="budget-note"></span>
    </div>
    <p class="market-event"></p>
  </header>
  <div class="market-tabs" role="tablist">
    <button role="tab" data-tab="market">Mercado</button>
    <button role="tab" data-tab="black">Mercado negro</button>
    <button role="tab" data-tab="hold">Bodega</button>
  </div>
  <p class="market-role"></p>
  <div class="market-panel" role="tabpanel"></div>
</section>`;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Copia el nombre de cada columna en sus celdas (`data-label`). En pantallas angostas la tabla se
 * muestra como tarjetas apiladas (css: .versions en @media) y cada dato lleva su nombre al lado: así el
 * botón Comprar o Devolver siempre queda a la vista en un teléfono.
 */
const labelCells = (table) => {
  const labels = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
  for (const row of table.querySelectorAll('tbody tr')) {
    if (row.classList.contains('request-row')) continue;
    [...row.children].forEach((cell, index) => { if (labels[index]) cell.setAttribute('data-label', labels[index]); });
  }
  return table;
};

const tierBadge = (tierId) => {
  const tier = tierOf(tierId);
  const badge = el('span', 'tier-badge', `${tier.mark} ${tier.name}`);
  badge.style.setProperty('--tier', tier.color);
  return badge;
};

export const mountMarket = (container) => {
  container.innerHTML = MARKET_HTML;
  const $ = (selector) => /** @type {HTMLElement} */ (container.querySelector(selector));
  const panel = $('.market-panel');
  const tabs = /** @type {HTMLElement[]} */ ([...container.querySelectorAll('[role="tab"]')]);
  let tab = 'market';
  let category = 'all';
  const openParts = new Set(); // fichas abiertas (se conservan al redibujar)
  const quantities = new Map(); // id de oferta → cuántas quiere comprar

  const economy = () => session.state?.data.economy;
  const isMerchant = () => canActAs(session.room.players, session.myId, 'merchant');

  /** Campo de cantidad + botón Comprar (Comercio), o botón Pedir (los demás). */
  const buyControls = (offer, { type, label }) => {
    const box = el('div', 'buy');
    const eco = economy();
    const soldOut = offer.stock === 0 || offer.gone;
    if (isMerchant()) {
      const input = /** @type {HTMLInputElement} */ (el('input', 'buy-quantity'));
      Object.assign(input, { type: 'number', min: '1', max: String(Math.min(20, offer.stock ?? 20)), value: String(quantities.get(offer.id) ?? 1) });
      input.setAttribute('aria-label', 'Cantidad');
      input.addEventListener('input', () => quantities.set(offer.id, Math.max(1, Math.min(20, Math.round(Number(input.value)) || 1))));
      const button = /** @type {HTMLButtonElement} */ (el('button', 'buy-button', soldOut ? 'Agotado' : label));
      button.type = 'button';
      button.disabled = soldOut || offer.price > eco.credits;
      button.title = offer.price > eco.credits && !soldOut ? 'No alcanza el presupuesto' : '';
      button.addEventListener('click', () => sendAction({ type, offerId: offer.id, quantity: quantities.get(offer.id) ?? 1 }));
      box.append(input, button);
    } else {
      const asked = (eco.requests[offer.id] ?? []).some((request) => request.id === session.myId);
      const button = /** @type {HTMLButtonElement} */ (el('button', 'ask-button', asked ? '✓ Pedida' : 'Pedir'));
      button.type = 'button';
      button.disabled = soldOut;
      button.setAttribute('aria-pressed', String(asked));
      button.title = asked ? 'Clic para retirar el pedido' : 'Avísale a Comercio que la necesitas';
      button.addEventListener('click', () => sendAction({ type: 'market:request', offerId: offer.id }));
      box.append(button);
    }
    return box;
  };

  const requestNote = (offerId) => {
    const requests = economy().requests[offerId] ?? [];
    if (requests.length === 0) return null;
    return el('p', 'offer-requests', `Pedida por ${requests.map((r) => `${r.name}${r.role ? ` (${roleName(r.role)})` : ''}`).join(', ')}`);
  };

  // ---------- Mercado legal: una ficha por pieza, una fila por rareza ----------
  const renderMarket = () => {
    const eco = economy();
    const filters = el('div', 'market-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Categoría');
    for (const option of [{ id: 'all', name: 'Todo' }, ...CATEGORIES]) {
      const chip = el('button', 'chip', option.name);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(option.id === category));
      chip.addEventListener('click', () => { category = option.id; render(); });
      filters.append(chip);
    }

    const cards = PARTS.filter((part) => category === 'all' || part.category === category).map((part) => {
      const offers = eco.offers.filter((offer) => offer.partId === part.id);
      const columns = versionColumns(part);
      // Ficha compacta: nombre, para qué sirve y desde cuánto cuesta. Las versiones, a pedido.
      const requested = offers.some((offer) => (eco.requests[offer.id] ?? []).length > 0);
      const card = /** @type {HTMLDetailsElement} */ (el('details', `part-card${requested ? ' requested' : ''}`));
      card.open = openParts.has(part.id) || requested;
      card.addEventListener('toggle', () => (card.open ? openParts.add(part.id) : openParts.delete(part.id)));
      const cheapest = Math.min(...offers.map((offer) => offer.price));
      const common = resolvePart(offers[0]);
      const headline = versionColumns(part).slice(0, 2).map((column) => `${column.label} ${column.value(common)}`).join(' · ');
      const head = el('summary');
      head.append(
        el('h4', '', part.name),
        el('span', 'part-kind', CATEGORIES.find((c) => c.id === part.category).name),
        el('span', 'part-line', part.description),
        el('span', 'part-from', `desde ${credits(cheapest)} · ${headline}${requested ? ' · pedida' : ''}`),
      );
      card.append(head);
      const facts = fixedFacts(part);
      if (facts.length > 0) card.append(el('p', 'part-facts', facts.join(' · ')));

      const table = el('table', 'versions');
      const headRow = el('tr');
      headRow.append(el('th', '', 'Rareza'), ...columns.map((column) => {
        const th = el('th', '', column.label);
        th.title = GLOSSARY[column.key] ?? '';
        return th;
      }), el('th', '', 'Precio'), el('th', '', ''));
      table.appendChild(el('thead')).append(headRow);
      const body = table.appendChild(el('tbody'));
      for (const offer of offers) {
        const item = resolvePart(offer);
        const row = el('tr', (eco.requests[offer.id] ?? []).length > 0 ? 'requested' : '');
        const tierCell = el('td');
        tierCell.append(tierBadge(offer.tier));
        const price = el('td', 'price', credits(offer.price));
        if (offer.stock !== null) price.append(el('small', '', offer.stock === 0 ? 'agotado' : `quedan ${offer.stock}`));
        const action = el('td');
        action.append(buyControls(offer, { type: 'market:buy', label: 'Comprar' }));
        row.append(tierCell, ...columns.map((column) => el('td', '', column.value(item))), price, action);
        body.append(row);
        const note = requestNote(offer.id);
        if (note) {
          const noteRow = el('tr', 'request-row');
          const cell = el('td');
          cell.colSpan = columns.length + 3;
          cell.append(note);
          noteRow.append(cell);
          body.append(noteRow);
        }
      }
      card.append(labelCells(table));
      return card;
    });

    const glossary = el('p', 'market-glossary', `${GLOSSARY.isp} ${GLOSSARY.reliability}`);
    panel.replaceChildren(filters, ...cards, glossary);
  };

  // ---------- Mercado negro ----------
  const renderBlack = () => {
    const eco = economy();
    if (!isMerchant()) {
      panel.replaceChildren(el('p', 'market-locked',
        'El mercado negro solo trata con Comercio. Pregúntale qué hay, cuánto cuesta y qué tan confiable es el vendedor.'));
      return;
    }
    const intro = el('p', 'black-intro',
      'Aquí todo es más barato porque nadie garantiza nada: lo que dice la ficha es lo que dice el vendedor. '
      + 'Una inspección reduce la duda, no la elimina. Una pieza con un defecto oculto puede fallar en pleno vuelo.');

    const sellers = [...new Set(eco.black.map((offer) => offer.sellerId))].map((sellerId) => {
      const seller = getSeller(sellerId);
      const section = el('section', 'seller');
      const head = el('header');
      const stars = el('span', 'seller-stars', `${'★'.repeat(seller.reputation)}${'☆'.repeat(5 - seller.reputation)}`);
      stars.setAttribute('aria-label', `Confianza ${seller.reputation} de 5`);
      head.append(el('h4', '', seller.name), stars, el('span', 'seller-trust', `Confianza ${seller.reputation} de 5`));
      section.append(head, el('p', 'seller-line', seller.line));

      for (const offer of eco.black.filter((o) => o.sellerId === sellerId)) {
        const part = getPart(offer.partId);
        const claimed = resolvePart(offer);
        const known = resolvePart(knownVersion(offer));
        const legalPrice = resolvePart({ partId: offer.partId, tier: offer.tier, quality: offer.quality, condition: 'new' }).price;
        const card = el('article', `black-offer${offer.gone ? ' gone' : ''}`);
        const title = el('header');
        title.append(el('h5', '', part.name), tierBadge(offer.tier), el('span', 'claimed-condition', `${conditionName(offer.condition)}, según el vendedor`));
        card.append(title);

        const advanced = offer.inspection?.level === 'advanced';
        const facts = el('dl', 'black-facts');
        for (const column of versionColumns(part)) {
          const row = el('div');
          const dd = el('dd', '', column.value(claimed));
          if (advanced && column.value(known) !== column.value(claimed)) {
            dd.textContent = column.value(known);
            dd.append(el('s', '', column.value(claimed)));
            dd.classList.add('corrected');
          }
          row.append(el('dt', '', column.label), dd);
          row.title = GLOSSARY[column.key] ?? '';
          facts.append(row);
        }
        card.append(facts);

        if (offer.inspection) {
          const findings = [`Estado real: ${conditionName(offer.inspection.condition).toLowerCase()}`
            + (offer.inspection.condition === offer.condition ? ' (coincide con lo anunciado)' : ' (NO es lo anunciado)')];
          if (advanced) {
            findings.push('Los números de arriba ya son los medidos');
            findings.push(offer.inspection.defect ? 'Se detectó un defecto oculto: fallará más de lo que dice la ficha' : 'No se detectaron defectos ocultos');
          }
          card.append(el('p', `inspection-result${offer.inspection.defect || offer.inspection.condition !== offer.condition ? ' bad' : ''}`,
            `${INSPECTIONS[offer.inspection.level].name}: ${findings.join('. ')}.`));
        } else {
          card.append(el('p', 'inspection-result none', 'Sin inspección: solo se sabe lo que dice el vendedor.'));
        }
        const note = requestNote(offer.id);
        if (note) card.append(note);

        const foot = el('footer');
        const price = el('div', 'black-price');
        price.append(el('strong', '', credits(offer.price)),
          el('small', '', `nueva y legal: ${credits(legalPrice)} · ${offer.gone ? 'el vendedor desapareció' : offer.stock === 0 ? 'agotado' : `quedan ${offer.stock}`}`));
        foot.append(price);
        if (!offer.gone && offer.stock > 0) {
          for (const [level, info] of Object.entries(INSPECTIONS)) {
            if (inspectionRank(level) <= inspectionRank(offer.inspection?.level)) continue;
            const button = /** @type {HTMLButtonElement} */ (el('button', 'inspect-button', `${info.name} · ${credits(info.cost)}`));
            button.type = 'button';
            button.title = `Revela ${info.reveals}`;
            button.disabled = info.cost > eco.credits;
            button.addEventListener('click', () => sendAction({ type: 'black:inspect', offerId: offer.id, level }));
            foot.append(button);
          }
        }
        foot.append(buyControls(offer, { type: 'black:buy', label: 'Comprar sin garantía' }));
        card.append(foot);
        section.append(card);
      }
      return section;
    });
    panel.replaceChildren(intro, ...sellers);
  };

  // ---------- Bodega: lo comprado y lo que todavía pide la misión ----------
  const renderHold = () => {
    const eco = economy();
    const merchant = isMerchant();
    const mission = getMission(session.state.data.missionId);
    const owned = new Set(eco.inventory.flatMap((item) => getPart(item.partId).provides ?? []));

    const needs = el('section', 'hold-needs');
    needs.append(el('h4', '', 'Lo que pide la misión'));
    const list = el('ul');
    const wanted = [
      { capabilities: mission.requirements.capabilities, optional: false },
      { capabilities: mission.requirements.recommended, optional: true },
    ];
    for (const { capabilities, optional } of wanted) {
      for (const capability of capabilities) {
        const have = owned.has(capability);
        const item = el('li', have ? 'have' : optional ? 'optional' : 'missing',
          `${have ? '✓' : optional ? '○' : '✗'} ${CAPABILITIES[capability]}${have ? '' : optional ? ' (recomendado)' : ' (falta)'}`);
        list.append(item);
      }
    }
    needs.append(list, el('p', 'hold-hint', 'Además hacen falta motores y tanques para cada etapa: eso lo define Ingeniería en la construcción.'));

    if (eco.inventory.length === 0) {
      panel.replaceChildren(needs, el('p', 'market-locked', 'La bodega está vacía. Lo que compre Comercio aparece aquí.'));
      return;
    }

    // Piezas iguales se muestran juntas.
    const groups = new Map();
    for (const item of eco.inventory) {
      const key = [item.partId, item.tier, item.condition, item.source, item.sellerId ?? '', item.quality, item.knownDefect ?? ''].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const table = el('table', 'versions hold-table');
    const headRow = el('tr');
    headRow.append(...['Pieza', 'Rareza', 'Estado', 'Origen', 'Cant.', 'Pagado', ''].map((label) => el('th', '', label)));
    table.appendChild(el('thead')).append(headRow);
    const body = table.appendChild(el('tbody'));
    for (const items of groups.values()) {
      const [first] = items;
      const row = el('tr');
      const tierCell = el('td');
      tierCell.append(tierBadge(first.tier));
      const checked = first.knownDefect === true ? ' · defecto detectado' : first.knownDefect === false ? ' · sin defectos a la vista' : first.inspected ? '' : ' · sin inspección';
      const origin = first.source === 'black' ? `Mercado negro · ${getSeller(first.sellerId)?.name ?? ''}${checked}` : 'Mercado';
      const action = el('td');
      if (merchant) {
        const button = el('button', 'return-button', `Devolver 1 (+${credits(refundFor(first))})`);
        button.type = 'button';
        button.title = `Se recupera el ${Math.round(REFUND[first.source] * 100)} % de lo pagado`;
        button.addEventListener('click', () => sendAction({ type: 'market:sell', uid: items.at(-1).uid }));
        action.append(button);
      }
      row.append(el('td', '', getPart(first.partId).name), tierCell, el('td', '', conditionName(first.condition)), el('td', '', origin),
        el('td', '', `× ${items.length}`), el('td', 'price', credits(items.reduce((total, item) => total + item.paid, 0))), action);
      body.append(row);
    }

    const dry = eco.inventory.reduce((total, item) => total + resolvePart(item).mass, 0);
    const summary = el('p', 'hold-summary', `${eco.inventory.length} piezas · ${mass(dry)} en seco (sin combustible).`);
    panel.replaceChildren(needs, labelCells(table), summary);
  };

  const render = () => {
    const eco = economy();
    if (!eco || !session.room) return;
    const spent = eco.budget - eco.credits;
    const fuel = eco.inventory.reduce((total, item) => {
      const part = getPart(item.partId);
      return total + (part.kind === 'tank' ? propellantPrice(part.propellant, part.capacity) : 0);
    }, 0);

    $('.budget-credits').textContent = credits(eco.credits);
    /** @type {HTMLElement} */ ($('.budget-bar i')).style.width = `${Math.max(0, (eco.credits / eco.budget) * 100)}%`;
    $('.budget-bar').setAttribute('aria-label', `Quedan ${number(eco.credits)} de ${number(eco.budget)} créditos`);
    $('.budget-note').textContent = eco.unlimited ? 'Sandbox: créditos ilimitados. Compra lo que quieras; nada se agota.' : `Gastado ${number(spent)} de ${number(eco.budget)}.`
      + (fuel > 0 ? ` Llenar los tanques que ya compraron costará unos ${number(fuel)} más: guarden esa reserva.` : ' El combustible se paga aparte, al llenar los tanques.');
    if (eco.unlimited) $('.budget-bar').setAttribute('aria-label', 'Créditos ilimitados');
    $('.budget').classList.toggle('low', eco.credits < fuel);
    $('.market-event').textContent = `Novedad: ${eco.event.text}`;
    $('.market-role').textContent = isMerchant()
      ? 'Manejas Comercio: tú compras, inspeccionas y devuelves. Las piezas marcadas son pedidos de la tripulación.'
      : 'Solo Comercio compra. Tú puedes pedir piezas: quedan marcadas para que Comercio las vea.';

    for (const button of tabs) {
      const selected = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(selected));
      if (button.dataset.tab === 'hold') button.textContent = `Bodega (${eco.inventory.length})`;
    }
    if (tab === 'market') renderMarket();
    else if (tab === 'black') renderBlack();
    else renderHold();
  };

  tabs.forEach((button) => button.addEventListener('click', () => {
    tab = button.dataset.tab;
    render();
  }));

  render();
  const offs = [on('state', render), on('room', render)];
  return () => offs.forEach((off) => off());
};

