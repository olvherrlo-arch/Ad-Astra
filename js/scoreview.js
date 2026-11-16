/**
 * RESULTADOS DE LA MISIÓN (pantalla)
 * Se abre en la Evaluación. Muestra el resumen del equipo y una tarjeta por tripulante con su puntaje,
 * lo que hizo, su precisión (solo si hubo algo medible), sus mejores aportes y sus logros.
 * Todo sale de `state.data.score`, que calcula el servidor (server/score.js): todos ven lo mismo.
 *
 * Celebra a cada quien sin volverlo una competencia: las tarjetas van en el orden de los roles,
 * no por puntaje, y no hay "ganador".
 */
import { drawAstronaut } from './character.js';
import { isHost, on, sendAction, session } from './connection.js';
import { ORBITS, PROFILES, SITES } from './missionplan.js';
import { number } from './partinfo.js';
import { reducedMotion } from './settings.js';
import { ROLES, roleName } from './shared.js';

const ICONS = { scientist: '🔬', merchant: '💰', engineer: '🔧', pilot: '🚀' };
const INKS = { scientist: '#5cc2b4', merchant: '#f3b641', engineer: '#ff6b5b', pilot: '#7ea6ff' };

/** @param {string} tag @param {string} [className] @param {string} [text] */
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** Número que sube de 0 a su valor (una vez por tarjeta). */
const countUp = (node, value) => {
  if (reducedMotion()) { node.textContent = value.toLocaleString('es'); return; }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 1100);
    node.textContent = Math.round(value * (1 - (1 - t) ** 3)).toLocaleString('es');
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** Estrellas de 0 a 5 (de media en media). */
const stars = (value) => {
  const box = el('span', 'score-stars');
  box.setAttribute('aria-label', `${value} de 5 estrellas`);
  for (let i = 1; i <= 5; i++) box.append(el('i', value >= i ? 'full' : value >= i - 0.5 ? 'half' : '', '★'));
  return box;
};

const bar = (fraction, color) => {
  const track = el('span', 'score-bar');
  const fill = el('i');
  fill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  if (color) fill.style.background = color;
  track.append(fill);
  return track;
};

const portrait = (player) => {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 70 * dpr;
  canvas.height = 96 * dpr;
  canvas.className = 'score-portrait';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  drawAstronaut(ctx, { x: 32, y: 92, color: player.color, hat: player.hat, role: player.role, seed: player.id, pose: 'front', scale: 0.5 });
  return canvas;
};

/** Monta la pantalla de resultados en `box`. Devuelve la función para desmontarla. */
export const mountScore = (box) => {
  let shownKey = '';
  const render = () => {
    const score = session.state?.data.score;
    const final = score?.final;
    if (!final) {
      box.replaceChildren(el('p', 'score-waiting', 'Los resultados aparecen cuando termina el vuelo.'));
      shownKey = '';
      return;
    }
    // Solo se redibuja si cambió algo (así los números no vuelven a contar desde cero).
    const key = JSON.stringify([final.teamPoints, final.place, session.state.data.attempt, session.room?.hostId, session.room?.players.map((p) => [p.id, p.connected, p.name])]);
    if (key === shownKey) return;
    const firstTime = shownKey === '';
    shownKey = key;

    // ---------- El equipo ----------
    const team = el('section', `score-team ${final.ok ? 'ok' : 'bad'}`);
    const head = el('header', 'score-team-head');
    const attempt = session.state.data.attempt ?? 1;
    head.append(el('p', 'score-kicker', attempt > 1 ? `Resultado del equipo · intento ${attempt}` : 'Resultado del equipo'), el('h3', 'score-result', final.sandbox ? (final.ok ? 'Prueba superada' : 'La prueba falló') : final.ok ? 'Misión cumplida' : 'Misión fallida'));
    const total = el('strong', 'score-team-points');
    const totalBox = el('div', 'score-team-total');
    totalBox.append(total, el('span', '', 'puntos del equipo'));
    const objectives = el('div', 'score-objectives');
    objectives.append(el('span', '', `Objetivos: ${final.objectivesDone} de ${final.objectivesTotal}`), bar(final.objectivesDone / Math.max(1, final.objectivesTotal), '#5cc2b4'));
    const lists = el('div', 'score-team-lists');
    const list = (title, items, className) => {
      if (items.length === 0) return;
      const section = el('div', className);
      section.append(el('h4', '', title));
      const ul = el('ul');
      for (const text of items) ul.append(el('li', '', text));
      section.append(ul);
      lists.append(section);
    };
    list('Lo mejor', final.highlights, 'score-good');
    list('Complicaciones', final.mistakes, 'score-bad');
    // La ciencia que llegó a la Tierra y el plan elegido (lugar, órbita, dificultad).
    const science = final.science;
    const facts = el('div', 'score-objectives score-science');
    if (science && science.max > 0) {
      facts.append(el('span', '', `Ciencia: ${science.value} de ${science.max} pts · ${number(science.sent)} de ${number(science.generated)} MB enviados`), bar(science.value / science.max, '#f3b641'));
    } else {
      facts.append(el('span', '', final.sandbox ? 'Sandbox: créditos ilimitados, física de verdad' : 'Ciencia: no viajó ningún instrumento científico'));
    }
    const planLine = el('p', 'score-plan', [final.plan ? `${SITES[final.plan.site]?.name ?? ''} · ${ORBITS[final.plan.orbit]?.name ?? ''}` : '', `Dificultad: ${final.difficulty ?? 'Normal'}`].filter(Boolean).join(' · '));
    if (final.fleet) {
      facts.replaceChildren(el('span', '', `Flota: ${final.fleet.arrived} de 4 arcas · colonia al ${final.fleet.colony} %`), bar(final.fleet.colony / 100, '#f3b641'));
      planLine.textContent = `Proyecto NOAH · ${final.fleet.route === 'fast' ? 'ruta corta' : 'ruta larga'} · Dificultad: ${final.difficulty ?? 'Normal'}`;
    }
    if (final.missionId === 'mars') planLine.textContent = `Viaje a Marte · Dificultad: ${final.difficulty ?? 'Normal'}`;
    if (final.sandbox) planLine.textContent = `Vuelo de prueba: ${PROFILES[final.plan?.profile ?? 'orbit']?.name ?? ''}`;
    if (final.place) planLine.textContent += ` · Puesto ${final.place} en la tabla de récords`;
    team.append(head, totalBox, objectives, facts, planLine, lists);
    countUp(total, final.teamPoints);

    // ---------- Cada tripulante (en el orden de los roles, sin ranking) ----------
    const roomPlayers = session.room?.players ?? [];
    const ids = new Set([...roomPlayers.map((p) => p.id), ...Object.keys(score.players)]);
    const roleOrder = (id) => {
      const role = roomPlayers.find((p) => p.id === id)?.role ?? score.players[id]?.role;
      const index = ROLES.findIndex((r) => r.id === role);
      return index === -1 ? 99 : index;
    };
    const cards = el('div', 'score-cards');
    [...ids].sort((a, b) => roleOrder(a) - roleOrder(b)).forEach((id, index) => {
      const entry = score.players[id] ?? { name: '', role: null, points: 0, actions: 0, measured: { sum: 0, count: 0 }, roles: {}, helps: 0, notes: [] };
      const live = roomPlayers.find((p) => p.id === id);
      const player = { ...entry, name: live?.name ?? entry.name, role: live?.role ?? entry.role, color: live?.color ?? 'gold', hat: live?.hat ?? 'none' };
      const card = el('article', `score-card${id === session.myId ? ' me' : ''}`);
      card.style.setProperty('--ink', INKS[player.role] ?? '#efe6cf');
      card.style.setProperty('--i', String(index));

      const top = el('header', 'score-card-head');
      const who = el('div', 'score-who');
      who.append(
        el('span', 'score-role', `${ICONS[player.role] ?? '★'} ${player.role ? roleName(player.role) : 'Sin rol'}`),
        el('strong', 'score-name', `${player.name}${id === session.myId ? ' (tú)' : ''}`),
      );
      const points = el('strong', 'score-points');
      const pointsBox = el('div', 'score-points-box');
      pointsBox.append(points, el('span', '', 'puntos'));
      top.append(portrait(player), who, pointsBox);
      countUp(points, player.points);

      const stats = el('dl', 'score-stats');
      const stat = (label, value) => {
        const row = el('div');
        row.append(el('dt', '', label));
        const dd = el('dd');
        if (value instanceof Node) dd.append(value); else dd.textContent = value;
        row.append(dd);
        stats.append(row);
      };
      stat('Acciones', String(player.actions));
      const measured = player.measured.count;
      stat('Precisión', measured > 0 ? (() => {
        const wrap = el('span', 'score-precision');
        const value = Math.round((player.measured.sum / measured) * 10) / 2;
        wrap.append(stars(value), el('small', '', `${Math.round((player.measured.sum / measured) * 100)} % · ${measured} medida${measured === 1 ? '' : 's'}`));
        return wrap;
      })() : 'sin datos medibles');
      if (player.helps > 0) stat('Ayudó a otros roles', `${player.helps} ${player.helps === 1 ? 'vez' : 'veces'}`);

      // Puntos por rol (en el modo demo una persona puede cubrir varios).
      const byRole = Object.entries(player.roles).filter(([roleId]) => ROLES.some((r) => r.id === roleId)).sort((a, b) => b[1] - a[1]);
      const roles = el('div', 'score-roles');
      if (byRole.length > 0) {
        roles.append(el('h4', '', 'Aporte por área'));
        const max = Math.max(...byRole.map(([, value]) => value));
        for (const [roleId, value] of byRole) {
          const row = el('div', 'score-role-row');
          row.append(el('span', '', `${ICONS[roleId]} ${roleName(roleId)}`), bar(value / max, INKS[roleId]), el('b', '', String(Math.round(value))));
          roles.append(row);
        }
      }

      // Sus mejores aportes (lo que más sumó).
      const best = [...player.notes].sort((a, b) => b.points - a.points).slice(0, 3);
      const highlights = el('ul', 'score-notes');
      for (const note of best) {
        const item = el('li');
        item.append(el('span', '', note.label), el('b', '', `+${note.points}`));
        highlights.append(item);
      }

      const badges = el('ul', 'score-badges');
      for (const badge of final.badges[id] ?? []) {
        const item = el('li', '', `🏅 ${badge.name}`);
        item.title = badge.text;
        badges.append(item);
      }

      card.append(top, stats);
      if (byRole.length > 0) card.append(roles);
      if (best.length > 0) {
        card.append(el('h4', 'score-sub', 'Aportes destacados'), highlights);
      } else {
        card.append(el('p', 'score-empty', 'No llegó a registrar acciones en esta misión.'));
      }
      if (badges.childElementCount > 0) card.append(el('h4', 'score-sub', 'Logros'), badges);
      cards.append(card);
    });

    const note = el('p', 'score-note', 'Cada rol suma por lo suyo y con su propia precisión: los puntajes no compiten entre sí, muestran cómo aportó cada quien.');
    // Volver a intentar: mismo cohete, misma bodega y el dinero que quedó. Lo decide el anfitrión.
    const retry = el('div', 'score-retry');
    const retryText = el('p', '', final.fleet ? 'Se puede volver al astillero: las arcas construidas siguen ahí. Repartan de otra forma, elijan otra ruta y lancen de nuevo.' : final.sandbox ? 'Vuelve al hangar cuando quieras: cambia piezas, elige otro viaje y despega de nuevo.' : final.ok
      ? '¿Se puede hacer mejor? Vuelvan al hangar, cambien el diseño y vuelen otra vez: cuenta el último vuelo.'
      : 'Vuelvan al hangar con lo aprendido: cambien el diseño, revísenlo y despeguen otra vez. El combustible quemado no se devuelve.');
    retry.append(retryText);
    if (isHost()) {
      const button = /** @type {HTMLButtonElement} */ (el('button', 'score-retry-button', final.fleet ? 'Volver al astillero' : final.sandbox ? 'Volver al hangar' : 'Rediseñar y volver a volar'));
      button.type = 'button';
      button.addEventListener('click', () => sendAction({ type: 'mission:retry' }));
      retry.append(button);
    } else {
      retry.append(el('small', '', 'Lo decide el anfitrión (también desde la palanca de la sala de misión).'));
    }
    box.replaceChildren(team, retry, cards, note);
    box.classList.toggle('score-animate', firstTime && !reducedMotion());
  };
  box.classList.add('score-screen');
  render();
  const offs = [on('state', render), on('room', render)];
  return () => {
    box.classList.remove('score-screen', 'score-animate');
    offs.forEach((off) => off());
  };
};
