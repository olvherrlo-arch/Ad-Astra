/**
 * VUELO DE PRUEBA (pantalla del modo Sandbox)
 * Elegir qué viaje se va a probar con el cohete armado: cada perfil muestra sus tramos y el Δv real
 * que pide (js/flightplans.js), comparado con el Δv que tiene el cohete ahora mismo.
 * Se cambia en el hangar, antes de despegar; en vuelo queda fijo.
 */
import { toPhysicsStages } from './assembly.js';
import { on, sendAction, session } from './connection.js';
import { flightPlanFor, totalDeltaV } from './flightplans.js';
import { PROFILES, planOf } from './missionplan.js';
import { number } from './partinfo.js';
import { analyzeRocket } from './rocket.js';

/** @param {string} tag @param {string} [className] @param {string} [text] */
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** Monta la pantalla en `box`. Devuelve la función para desmontarla. */
export const mountTestFlight = (box) => {
  const render = () => {
    const data = session.state?.data;
    if (!data?.missionId) return;
    const plan = planOf(data);
    const locked = Boolean(data.flight);
    let rocketDv = 0;
    try {
      rocketDv = data.rocket && data.economy ? analyzeRocket(toPhysicsStages(data.rocket, data.economy.inventory)).deltaV ?? 0 : 0;
    } catch {
      rocketDv = 0;
    }

    const head = el('header', 'plan-head');
    head.append(
      el('p', 'plan-kicker', 'Sandbox · créditos ilimitados'),
      el('h3', 'plan-title', 'Vuelo de prueba'),
      el('p', 'plan-intro', 'El dinero no es problema aquí; la física sí. Un cohete pesado, con poco empuje, poco combustible o poca batería falla igual que en la campaña. Elige qué viaje quieres probar.'),
    );
    const status = el('p', 'plan-status', locked ? 'La prueba está en marcha: el viaje quedó fijo. Para cambiarlo, vuelve al hangar.' : 'Elige un viaje. El constructor compara al instante el Δv que pide con el que tiene tu cohete.');
    const total = el('p', 'plan-total', rocketDv > 0 ? `Tu cohete tiene ahora ${number(rocketDv)} m/s de Δv.` : 'Todavía no hay cohete armado: ve a la consola de ensamblaje.');

    const section = el('section', 'plan-group');
    section.append(el('h4', '', 'Viajes'));
    const list = el('div', 'plan-options');
    for (const profile of Object.values(PROFILES)) {
      const chosen = (plan.profile ?? 'orbit') === profile.id;
      const legs = flightPlanFor(data.missionId, { ...plan, profile: profile.id }) ?? [];
      const needed = totalDeltaV(legs);
      const card = /** @type {HTMLButtonElement} */ (el('button', `plan-option${chosen ? ' chosen' : ''}`));
      card.type = 'button';
      card.disabled = locked || chosen;
      card.setAttribute('aria-pressed', String(chosen));
      card.append(el('strong', '', profile.name), el('span', 'plan-text', profile.text));
      const facts = el('ul', 'plan-facts');
      facts.append(el('li', rocketDv >= needed ? 'up' : 'down', `Pide ${number(needed)} m/s de Δv${rocketDv > 0 ? (rocketDv >= needed ? ' · tu cohete alcanza' : ` · faltan ${number(needed - rocketDv)}`) : ''}`));
      for (const leg of legs) facts.append(el('li', '', `${leg.name}${leg.dv ? `: ${number(leg.dv)} m/s` : ''}`));
      const needs = [...new Set(legs.flatMap((leg) => leg.needs ?? []))];
      if (needs.includes('heatshield')) facts.append(el('li', '', 'Necesita escudo térmico para reentrar'));
      if (needs.includes('landing-gear')) facts.append(el('li', '', 'Necesita patas y motor de alunizaje'));
      card.append(facts);
      if (chosen) card.append(el('em', 'plan-chosen', '✓ Elegido'));
      card.addEventListener('click', () => sendAction({ type: 'plan:set', profile: profile.id }));
      list.append(card);
    }
    section.append(list);
    const learn = el('p', 'plan-learn', 'Los Δv salen de las fórmulas reales de órbitas (con pérdidas estimadas al subir). Las fallas de piezas y la precisión del guiado son valores del juego: un vuelo de prueba puede salir mal, y de eso se aprende.');
    box.replaceChildren(head, status, total, section, learn);
  };
  box.classList.add('plan-screen');
  render();
  const offs = [on('state', render), on('room', render)];
  return () => {
    box.classList.remove('plan-screen');
    offs.forEach((off) => off());
  };
};
