/**
 * MESA DE MISIÓN
 * La misión avanza por etapas (js/missions.js); en cada una, cada rol tiene su tarea y da su
 * visto bueno, y cuando están los cuatro el anfitrión pasa a la siguiente.
 *
 * - Cada quien maneja su rol. Un rol sin dueño conectado (modo demo, o alguien que perdió
 *   la conexión) lo puede manejar cualquiera: canActAs() en js/shared.js.
 * - Las reglas (quién puede qué) están en server/game.js.
 *
 * Las etapas que ya tienen herramienta (`tool` en js/missions.js) la muestran debajo de su
 * tarjeta: se registran en TOOLS. Las demás, por ahora, solo piden el visto bueno.
 */
import { mountChat } from './chat.js';
import { mountBuilder } from './builder.js';
import { isHost, on, sendAction, session } from './connection.js';
import { mountMarket } from './marketview.js';
import { getMission } from './missions.js';
import { MAX_PLAYERS, ROLES, canActAs, colorHex } from './shared.js';

/**
 * Herramientas de etapa: nombre (`tool` de la etapa en js/missions.js) → cómo se llama y quién la arma.
 * `wide` = necesita todo el ancho (la bitácora y el chat pasan abajo).
 */
const TOOLS = {
  market: { name: 'Mercado', mount: mountMarket },
  builder: { name: 'Constructor', mount: mountBuilder, wide: true },
};

const DESK_HTML = `
<ol class="stage-track" aria-label="Etapas de la misión"></ol>

<div class="mission-body">
  <section class="mission-main" aria-labelledby="stage-name">
    <div class="stage-card">
      <p class="stage-step"></p>
      <h2 class="stage-name" id="stage-name"></h2>
      <p class="stage-summary"></p>
      <p class="stage-wip" hidden>
        Las herramientas de esta etapa todavía no están construidas: por ahora cada rol lee su tarea y da el visto bueno.
      </p>
    </div>
    <div class="tool-tabs" role="tablist" hidden></div>
    <div class="stage-tool" hidden></div>
    <div class="role-desks"></div>
    <footer class="stage-footer">
      <p class="stage-status" aria-live="polite"></p>
      <button class="stage-next" hidden>Siguiente etapa</button>
    </footer>
  </section>

  <aside class="mission-side">
    <section class="mission-log" aria-labelledby="log-title">
      <h2 id="log-title">Bitácora</h2>
      <ol></ol>
    </section>
    <section class="mission-chat" aria-label="Chat"></section>
  </aside>
</div>`;

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const mountDesk = (container) => {
  container.innerHTML = DESK_HTML;
  const $ = (selector) => /** @type {HTMLElement} */ (container.querySelector(selector));
  const track = $('.stage-track');
  const desks = $('.role-desks');
  const status = $('.stage-status');
  const nextButton = /** @type {HTMLButtonElement} */ ($('.stage-next'));
  const logList = $('.mission-log ol');
  const toolBox = $('.stage-tool');
  const toolTabs = $('.tool-tabs');
  let offered = ''; //       herramientas de la etapa actual, como texto ("builder,market")
  let mountedTool = null; // nombre de la que está armada
  let unmountTool = null;

  /** Arma una herramienta (o ninguna) y marca su pestaña. */
  const openTool = (name) => {
    if (name !== mountedTool) {
      unmountTool?.();
      toolBox.replaceChildren();
      mountedTool = name;
      unmountTool = name ? TOOLS[name].mount(toolBox) : null;
      toolBox.hidden = !name;
      $('.mission-body').classList.toggle('wide', Boolean(name && TOOLS[name].wide));
    }
    for (const tab of toolTabs.children) tab.setAttribute('aria-selected', String(/** @type {HTMLElement} */ (tab).dataset.tool === name));
  };

  /** Las herramientas de la etapa actual: una sola, o varias en pestañas. */
  const showTools = (tool) => {
    const names = (Array.isArray(tool) ? tool : tool ? [tool] : []).filter((name) => name in TOOLS);
    if (names.join() === offered) return;
    offered = names.join();
    toolTabs.hidden = names.length < 2;
    toolTabs.replaceChildren(...names.map((name) => {
      const tab = element('button', '', TOOLS[name].name);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.dataset.tool = name;
      tab.addEventListener('click', () => openTool(name));
      return tab;
    }));
    openTool(names[0] ?? null);
  };

  // ---------- Etapas (la fila de arriba) ----------
  const renderTrack = (stages, stageIndex) => {
    track.replaceChildren(
      ...stages.map((stage, index) => {
        const item = element('li', index < stageIndex ? 'done' : index === stageIndex ? 'current' : '');
        if (index === stageIndex) item.setAttribute('aria-current', 'step');
        item.append(element('span', 'stage-dot', index < stageIndex ? '✓' : String(index + 1)), element('span', 'stage-label', stage.name));
        return item;
      }),
    );
  };

  // ---------- Un escritorio por rol ----------
  const whoText = (holder, absent) => {
    if (holder) return holder.id === session.myId ? 'Tú' : holder.name;
    if (absent) return `${absent.name} · sin conexión: cualquiera puede cubrirlo`;
    return 'Libre · modo demo: lo maneja cualquiera';
  };

  const renderDesks = (stage, confirmed) => {
    const { players } = session.room;
    const focused = /** @type {HTMLElement | null} */ (document.activeElement)?.dataset?.role;
    desks.replaceChildren(
      ...ROLES.map((role) => {
        const holder = players.find((p) => p.role === role.id && p.connected !== false);
        const absent = players.find((p) => p.role === role.id && p.connected === false);
        const mine = holder?.id === session.myId;
        const mayAct = canActAs(players, session.myId, role.id);
        const done = Boolean(confirmed[role.id]);

        const desk = element('article', `role-desk${mine ? ' mine' : ''}${done ? ' done' : ''}`);
        const head = element('header');
        const who = element('span', 'role-who');
        if (holder ?? absent) {
          const dot = element('i');
          dot.style.background = colorHex((holder ?? absent).color);
          who.append(dot);
        }
        who.append(whoText(holder, absent));
        head.append(element('strong', '', role.name), ...(mine ? [element('span', 'desk-mine', 'Tu rol')] : []), who);

        const task = element('p', 'desk-task', stage.tasks[role.id] ?? '');

        const foot = element('div', 'desk-foot');
        if (mayAct) {
          const button = element('button', 'desk-confirm', done ? '✓ Visto bueno dado' : 'Dar visto bueno');
          button.type = 'button';
          button.dataset.role = role.id;
          button.setAttribute('aria-pressed', String(done));
          button.title = done ? 'Clic para retirarlo' : '';
          button.addEventListener('click', () => sendAction({ type: 'role:confirm', role: role.id, value: !done }));
          foot.append(button);
        } else {
          foot.append(element('span', `desk-state${done ? ' done' : ''}`, done ? '✓ Visto bueno dado' : 'Pendiente'));
        }
        desk.append(head, task, foot);
        return desk;
      }),
    );
    if (focused) /** @type {HTMLElement | null} */ (desks.querySelector(`[data-role="${focused}"]`))?.focus();
  };

  // ---------- Pie: quién falta y botón del anfitrión ----------
  const renderFooter = (stages, stageIndex, confirmed) => {
    const host = isHost();
    const isLast = stageIndex >= stages.length - 1;
    const missing = ROLES.filter((role) => !confirmed[role.id]).map((role) => role.name);

    nextButton.hidden = !host || isLast;
    nextButton.disabled = missing.length > 0;

    if (missing.length > 0) status.textContent = `Falta el visto bueno de: ${missing.join(', ')}.`;
    else if (isLast) status.textContent = 'Fin del recorrido: la evaluación real de la misión todavía no está construida.';
    else status.textContent = host ? 'Los cuatro roles dieron el visto bueno.' : 'Los cuatro roles dieron el visto bueno. El anfitrión pasa a la siguiente etapa.';
  };

  const renderLog = (log) => {
    logList.replaceChildren(...[...log].reverse().map((line) => element('li', '', line)));
  };

  const render = () => {
    const state = session.state;
    if (!state || !session.room) return;
    const mission = getMission(state.data.missionId);
    const stage = mission?.stages[state.data.stageIndex];
    if (!mission || !stage) return;

    $('.stage-step').textContent = `Etapa ${state.data.stageIndex + 1} de ${mission.stages.length}`
      + (session.room.players.length < MAX_PLAYERS ? ' · modo demo' : '');
    $('.stage-name').textContent = stage.name;
    $('.stage-summary').textContent = stage.summary;
    $('.stage-wip').hidden = stage.tools;
    showTools(stage.tool);

    renderTrack(mission.stages, state.data.stageIndex);
    renderDesks(stage, state.data.confirmed);
    renderFooter(mission.stages, state.data.stageIndex, state.data.confirmed);
    renderLog(state.data.log);
  };

  nextButton.addEventListener('click', () => sendAction({ type: 'stage:advance' }));

  render();
  const chat = mountChat($('.mission-chat'));
  const offs = [on('state', render), on('room', render)];
  return () => {
    unmountTool?.();
    chat.destroy();
    offs.forEach((off) => off());
  };
};
