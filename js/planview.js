/**
 * PLAN DE LA MISIÓN (pantalla)
 * Elegir el lugar de alunizaje y la altura de la órbita lunar. Cada opción muestra sus números
 * reales del viaje (Δv calculado con js/flightplans.js) y lo que cambia: ciencia, Sol, riesgo y
 * cobertura del repetidor. Lo deciden Vuelo o Ciencia hasta el despegue; los demás lo ven en vivo.
 */
import { on, sendAction, session } from './connection.js';
import { flightPlanFor, totalDeltaV } from './flightplans.js';
import { ORBITS, SITES, planOf } from './missionplan.js';
import { number } from './partinfo.js';
import { canActAs } from './shared.js';

/** @param {string} tag @param {string} [className] @param {string} [text] */
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const percent = (value) => `${Math.round(value * 100)} %`;

/** Monta la pantalla en `box`. Devuelve la función para desmontarla. */
export const mountPlan = (box) => {
  const render = () => {
    const data = session.state?.data;
    if (!data?.missionId) return;
    const plan = planOf(data);
    const players = session.room?.players ?? [];
    const may = canActAs(players, session.myId, 'pilot') || canActAs(players, session.myId, 'scientist');
    const locked = Boolean(data.flight);
    const legsOf = (option) => flightPlanFor(data.missionId, { ...plan, ...option }) ?? [];
    const current = legsOf({});
    const dvOf = (legs, id) => legs.find((leg) => leg.id === id)?.dv ?? 0;

    const head = el('header', 'plan-head');
    head.append(
      el('p', 'plan-kicker', 'Decisión del equipo'),
      el('h3', 'plan-title', 'Plan de la misión'),
      el('p', 'plan-intro', 'No hay un plan perfecto: más ciencia pide más energía, más datos, más riesgo o más combustible. Hablen con Ingeniería (¿alcanza el Δv?) y Comercio (¿alcanza el dinero para más antena o un repetidor?).'),
    );
    const status = el('p', 'plan-status', locked
      ? 'Ya despegaron: el plan quedó fijo.'
      : may ? 'Tú puedes cambiarlo (Vuelo o Ciencia). El constructor recalcula todo al instante.' : 'Lo deciden Vuelo y Ciencia. Tú lo ves en vivo.');
    const total = el('p', 'plan-total', `Δv total del viaje con este plan: ${number(totalDeltaV(current))} m/s`);

    const group = (title, entries, key, describe) => {
      const section = el('section', 'plan-group');
      section.append(el('h4', '', title));
      const list = el('div', 'plan-options');
      for (const option of Object.values(entries)) {
        const chosen = plan[key] === option.id;
        const card = el('button', `plan-option${chosen ? ' chosen' : ''}`);
        /** @type {HTMLButtonElement} */ (card).type = 'button';
        /** @type {HTMLButtonElement} */ (card).disabled = locked || !may || chosen;
        card.setAttribute('aria-pressed', String(chosen));
        card.append(el('strong', '', option.name), el('span', 'plan-text', option.text));
        const facts = el('ul', 'plan-facts');
        for (const fact of describe(option)) facts.append(el('li', fact.tone ?? '', fact.text));
        card.append(facts);
        if (chosen) card.append(el('em', 'plan-chosen', '✓ Elegido'));
        card.addEventListener('click', () => sendAction({ type: 'plan:set', [key]: option.id }));
        list.append(card);
      }
      section.append(list);
      return section;
    };

    const sites = group('Lugar de alunizaje', SITES, 'site', (site) => {
      const legs = legsOf({ site: site.id });
      return [
        { text: `Ciencia ×${site.science.toLocaleString('es')}`, tone: site.science > 1 ? 'up' : '' },
        { text: `Sol en la superficie: ${percent(site.sun)}`, tone: site.sun < 0.5 ? 'down' : '' },
        { text: `Riesgo para las patas ×${site.legsRisk.toLocaleString('es')}`, tone: site.legsRisk > 1 ? 'down' : '' },
        { text: `Alunizar: ${number(dvOf(legs, 'descent'))} m/s` },
      ];
    });
    const orbits = group('Órbita lunar', ORBITS, 'orbit', (orbit) => {
      const legs = legsOf({ orbit: orbit.id });
      return [
        { text: `Entrar en órbita: ${number(dvOf(legs, 'loi'))} m/s` },
        { text: `Bajar y subir: ${number(dvOf(legs, 'descent') + dvOf(legs, 'liftoff'))} m/s` },
        { text: `Señal del repetidor: ${percent(orbit.relayCoverage)} del tiempo`, tone: orbit.relayCoverage > 0.6 ? 'up' : 'down' },
      ];
    });
    const learn = el('p', 'plan-learn', 'Por qué cambia el Δv: desde una órbita más alta la nave va más lento, así que frenar al llegar cuesta menos, pero para bajar al suelo hay que perder más velocidad. Los números salen de las fórmulas reales; la ciencia, el Sol y el riesgo de cada lugar son valores del juego.');
    box.replaceChildren(head, status, total, sites, orbits, learn);
  };
  box.classList.add('plan-screen');
  render();
  const offs = [on('state', render), on('room', render)];
  return () => {
    box.classList.remove('plan-screen');
    offs.forEach((off) => off());
  };
};
