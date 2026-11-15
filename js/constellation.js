/**
 * CONSTELACIÓN: el selector de misiones
 * Las tres misiones de la campaña son tres estrellas unidas por una línea. Cada una está
 * bloqueada, disponible, en curso o completada (lo decide el servidor: state.data.campaign).
 * Cualquiera puede tocar una estrella para leer su ficha; solo el anfitrión inicia la misión.
 * Los datos de cada misión están en js/missions.js.
 */
import { isHost, on, sendAction, session } from './connection.js';
import { DIFFICULTY_NAMES, MISSIONS, MISSION_STATUS } from './missions.js';

const STAR_SVG = '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0-11 2.6-2.6 11 0 2.6 2.6 0 11-2.6 2.6-11 0-2.6-2.6Z"/></svg>';

const CONSTELLATION_HTML = `
<section class="constellation" aria-labelledby="constellation-title">
  <div class="sky">
    <h2 id="constellation-title">Elige la misión</h2>
    <svg class="sky-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
    <div class="sky-stars"></div>
    <button type="button" class="sky-replay" hidden>Ver el prólogo otra vez</button>
  </div>

  <article class="mission-card" aria-live="polite">
    <p class="mission-card-number"></p>
    <h3 class="mission-card-title"></h3>
    <p class="mission-card-status"></p>
    <p class="mission-card-story"></p>
    <dl class="mission-card-facts">
      <div><dt>Objetivo</dt><dd data-fact="goal"></dd></div>
      <div><dt>Duración</dt><dd data-fact="duration"></dd></div>
      <div><dt>Dificultad</dt><dd data-fact="difficulty"></dd></div>
      <div><dt>Equipo necesario</dt><dd><ul data-fact="equipment"></ul></dd></div>
    </dl>
    <p class="mission-card-note"></p>
    <button type="button" class="mission-card-start" hidden></button>
  </article>
</section>`;

export const mountConstellation = (container) => {
  container.innerHTML = CONSTELLATION_HTML;
  const $ = (selector) => /** @type {HTMLElement} */ (container.querySelector(selector));
  const stars = $('.sky-stars');
  const startButton = /** @type {HTMLButtonElement} */ ($('.mission-card-start'));
  const replayButton = $('.sky-replay');
  /** @type {string | null} */
  let selectedId = null;

  // La línea que une las estrellas, en el orden de la campaña.
  $('.sky-lines').innerHTML = `<polyline points="${MISSIONS.map((m) => `${m.star.x},${m.star.y}`).join(' ')}" />`;

  const statusOf = (mission) => session.state?.data.campaign.missions[mission.id] ?? 'locked';

  const renderStars = () => {
    stars.replaceChildren(
      ...MISSIONS.map((mission) => {
        const built = mission.stages.length > 0;
        const status = built ? statusOf(mission) : 'locked';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `mission-star ${status}`;
        button.style.left = `${mission.star.x}%`;
        button.style.top = `${mission.star.y}%`;
        button.setAttribute('aria-pressed', String(mission.id === selectedId));
        button.innerHTML = STAR_SVG;
        const name = document.createElement('span');
        name.className = 'star-name';
        name.textContent = `${mission.number} · ${mission.title}`;
        const state = document.createElement('span');
        state.className = 'star-status';
        state.textContent = built ? MISSION_STATUS[status] : 'Próximamente';
        button.append(name, state);
        button.addEventListener('click', () => {
          selectedId = mission.id;
          render();
          /** @type {HTMLElement | null} */ (stars.querySelector('[aria-pressed="true"]'))?.focus();
        });
        return button;
      }),
    );
  };

  const renderCard = (mission) => {
    const status = statusOf(mission);
    const host = isHost();
    const previous = MISSIONS[MISSIONS.indexOf(mission) - 1];
    const built = mission.stages.length > 0;

    $('.mission-card-number').textContent = `Misión ${mission.number}`;
    $('.mission-card-title').textContent = mission.title;
    const pill = $('.mission-card-status');
    // Una misión sin etapas todavía no se puede jugar: se muestra como "Próximamente".
    pill.textContent = built ? MISSION_STATUS[status] : 'Próximamente';
    pill.className = `mission-card-status ${built ? status : 'locked'}`;
    $('.mission-card-story').textContent = mission.story;
    $('[data-fact="goal"]').textContent = mission.goal;
    $('[data-fact="duration"]').textContent = mission.duration;
    $('[data-fact="difficulty"]').textContent = `${DIFFICULTY_NAMES[mission.difficulty]} (${mission.difficulty} de 3)`;
    $('[data-fact="equipment"]').replaceChildren(
      ...mission.equipment.map((item) => Object.assign(document.createElement('li'), { textContent: item })),
    );

    let note = '';
    if (status === 'locked') note = `Bloqueada: se abre al completar la Misión ${previous.number}, ${previous.title}.`;
    else if (!built) note = 'Próximamente: esta misión todavía está en construcción.';
    else if (!host) note = 'El anfitrión inicia la misión cuando la tripulación esté de acuerdo.';
    else if (status === 'in_progress') note = 'Ya la habían empezado: al iniciarla de nuevo, vuelve a la primera etapa.';
    $('.mission-card-note').textContent = note;

    startButton.hidden = !host || status === 'locked' || !built;
    startButton.textContent = status === 'in_progress' ? 'Volver a empezar la misión' : 'Iniciar misión';
    startButton.dataset.mission = mission.id;
  };

  const render = () => {
    if (!session.state || !session.room) return;
    // Al entrar se muestra la misión que toca: la que está en curso o la primera disponible.
    selectedId ??= (MISSIONS.find((m) => statusOf(m) === 'in_progress') ?? MISSIONS.find((m) => statusOf(m) === 'available') ?? MISSIONS[0]).id;
    renderStars();
    renderCard(MISSIONS.find((m) => m.id === selectedId));
    replayButton.hidden = !isHost();
  };

  startButton.addEventListener('click', () => sendAction({ type: 'mission:start', missionId: startButton.dataset.mission }));
  replayButton.addEventListener('click', () => sendAction({ type: 'story:replay' }));

  render();
  const offs = [on('state', render), on('room', render)];
  return () => offs.forEach((off) => off());
};
