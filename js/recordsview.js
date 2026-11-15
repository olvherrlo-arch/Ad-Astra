/**
 * TABLA DE RÉCORDS (pantalla del menú principal)
 * Las mejores misiones de este servidor (server/records.js): primero las cumplidas, después por
 * puntos del equipo. Muestra tripulación, plan, ciencia, dificultad e intentos.
 */
import { listRecords } from './connection.js';
import { ORBITS, SITES } from './missionplan.js';

/** @param {string} tag @param {string} [className] @param {string} [text] */
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/**
 * Abre la tabla. `onClose` se llama al volver.
 * @param {{ onClose?: () => void }} [options]
 */
export const openRecords = ({ onClose } = {}) => {
  const root = el('div', 'settings-screen records-screen');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'records-title');
  root.innerHTML = `
    <div class="settings-card">
      <header class="settings-head">
        <p class="settings-kicker">Ad Astra</p>
        <h2 id="records-title">Récords</h2>
        <p class="settings-note">Las mejores misiones jugadas en este servidor: primero las cumplidas, después por puntos del equipo.</p>
      </header>
      <div class="settings-body records-body"><p class="records-empty">Buscando récords…</p></div>
      <footer class="settings-foot"><span></span><button type="button" class="settings-back">← Volver</button></footer>
    </div>`;
  const body = root.querySelector('.records-body');

  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  root.querySelector('.settings-back').addEventListener('click', close);
  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });
  window.addEventListener('keydown', onKey, true);
  document.body.append(root);
  /** @type {HTMLElement} */ (root.querySelector('.settings-back')).focus();

  listRecords().then((records) => {
    if (!records) return body.replaceChildren(el('p', 'records-empty', 'El servidor no respondió. Intenta de nuevo.'));
    if (records.length === 0) return body.replaceChildren(el('p', 'records-empty', 'Todavía no hay misiones terminadas. ¡La primera tripulación queda en la historia!'));
    const list = el('ol', 'records-list');
    records.forEach((record, index) => {
      const item = el('li', `records-row${record.ok ? ' ok' : ''}`);
      item.append(el('span', 'records-place', `${index + 1}`));
      const main = el('div', 'records-main');
      main.append(
        el('strong', '', record.team.join(', ')),
        el('span', '', [
          record.missionTitle,
          SITES[record.site]?.name,
          ORBITS[record.orbit]?.name.split(' · ')[0],
          `Dificultad ${record.difficulty}`,
          record.attempt > 1 ? `intento ${record.attempt}` : null,
        ].filter(Boolean).join(' · ')),
      );
      const numbers = el('div', 'records-numbers');
      numbers.append(
        el('b', '', `${record.points.toLocaleString('es')} pts`),
        el('span', '', `${record.ok ? '✓ cumplida' : '✗ fallida'} · ciencia ${record.science}/${record.scienceMax} · ${record.objectives} objetivos`),
      );
      item.append(main, numbers);
      list.append(item);
    });
    body.replaceChildren(list);
  });
  return { close };
};
