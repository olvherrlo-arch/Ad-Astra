/**
 * CHAT DE LA SALA
 * Mensajes con la cabeza del astronauta de cada jugador, chat rápido y,
 * para el anfitrión, la lista de tripulantes con Expulsar / Bloquear.
 */
import { drawHead } from './character.js';
import { getPlayer, isHost, kickPlayer, on, sendChat, session } from './connection.js';
import { MAX_CHAT_LENGTH, colorHex } from './shared.js';

// Frases de chat rápido: edítalas libremente.
const QUICK_CHAT = ['¡Hola!', '¿Empezamos?', 'Un momento', 'Listo', '¿Falta alguien?'];

const AVATAR_SIZE = 28;

const avatar = (player) => {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.className = 'chat-avatar';
  canvas.width = canvas.height = AVATAR_SIZE * dpr;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  drawHead(ctx, { color: player.color, hat: player.hat, size: AVATAR_SIZE });
  return canvas;
};

const renderLine = (line) => {
  const paragraph = document.createElement('p');
  if (!line.author) {
    paragraph.className = 'chat-line system';
    paragraph.style.setProperty('--line-color', line.color ?? 'var(--rule)');
    paragraph.textContent = line.text;
    return paragraph;
  }
  paragraph.className = 'chat-line';
  const player = getPlayer(line.playerId) ?? { color: line.color, hat: 'none' };
  const body = document.createElement('span');
  const author = document.createElement('span');
  author.className = 'chat-author';
  author.style.color = line.color;
  author.textContent = line.mine ? 'Tú' : line.author;
  body.append(author, line.text);
  paragraph.append(avatar(player), body);
  return paragraph;
};

/**
 * `onClose` agrega un botón ✕ (en el lobby el chat es un panel que se cierra).
 * @param {HTMLElement} container
 * @param {{ onClose?: () => void }} [options]
 */
export const mountChat = (container, { onClose } = {}) => {
  container.innerHTML = `
    <header class="chat-header">
      <h2>Chat</h2>
      <button class="chat-crew-toggle" aria-expanded="false" hidden>Tripulación</button>
      ${onClose ? '<button class="chat-close" aria-label="Cerrar chat">✕</button>' : ''}
    </header>
    <ul class="chat-crew" hidden></ul>
    <div class="chat-log" role="log" aria-live="polite">
      <p class="chat-empty">Canal abierto. Saluda a la tripulación.</p>
    </div>
    <div class="chat-quick" role="group" aria-label="Chat rápido"></div>
    <form class="chat-form">
      <input maxlength="${MAX_CHAT_LENGTH}" placeholder="Mensaje a la tripulación" aria-label="Mensaje" />
      <button disabled>Enviar</button>
    </form>`;
  const $ = (selector) => /** @type {HTMLElement} */ (container.querySelector(selector));
  const log = $('.chat-log');
  const form = $('.chat-form');
  const input = /** @type {HTMLInputElement} */ ($('.chat-form input'));
  const sendButton = /** @type {HTMLButtonElement} */ ($('.chat-form button'));
  const crewToggle = $('.chat-crew-toggle');
  const crewList = $('.chat-crew');
  const pendingConfirm = new Map(); // botón → timeout del "¿Seguro?"

  container.querySelector('.chat-close')?.addEventListener('click', onClose);

  const addLine = (line) => {
    log.querySelector('.chat-empty')?.remove();
    log.append(renderLine(line));
    log.scrollTop = log.scrollHeight;
  };

  // ---------- Chat rápido ----------
  container.querySelector('.chat-quick').append(
    ...QUICK_CHAT.map((phrase) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = phrase;
      chip.addEventListener('click', () => sendChat(phrase));
      return chip;
    }),
  );

  input.addEventListener('input', () => {
    sendButton.disabled = !input.value.trim();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value.trim()) return;
    sendChat(input.value);
    input.value = '';
    sendButton.disabled = true;
  });

  // ---------- Moderación (solo anfitrión) ----------
  /** Primer clic pide confirmación; el segundo (en 3 s) ejecuta. */
  const confirmButton = (label, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      if (pendingConfirm.has(button)) {
        clearTimeout(pendingConfirm.get(button));
        pendingConfirm.delete(button);
        action();
        return;
      }
      button.textContent = '¿Seguro?';
      button.classList.add('confirm');
      pendingConfirm.set(button, setTimeout(() => {
        pendingConfirm.delete(button);
        button.textContent = label;
        button.classList.remove('confirm');
      }, 3_000));
    });
    return button;
  };

  const renderCrew = () => {
    if (!session.room) return;
    const host = isHost();
    crewToggle.hidden = !host;
    if (!host) {
      crewList.hidden = true;
      crewToggle.setAttribute('aria-expanded', 'false');
      return;
    }
    const others = session.room.players.filter((p) => p.id !== session.myId);
    crewList.replaceChildren(
      ...(others.length === 0
        ? [Object.assign(document.createElement('li'), { className: 'chat-crew-empty', textContent: 'Todavía estás solo en la nave.' })]
        : others.map((player) => {
            const item = document.createElement('li');
            const name = document.createElement('span');
            name.textContent = player.name;
            name.style.color = colorHex(player.color);
            item.append(
              avatar(player),
              name,
              confirmButton('Expulsar', () => kickPlayer(player.id, false)),
              confirmButton('Bloquear', () => kickPlayer(player.id, true)),
            );
            return item;
          })),
    );
  };

  crewToggle.addEventListener('click', () => {
    const open = crewList.hidden;
    crewList.hidden = !open;
    crewToggle.setAttribute('aria-expanded', String(open));
  });

  session.chat.forEach(addLine);
  renderCrew();
  const offs = [on('chat-line', addLine), on('room', renderCrew)];

  return {
    focusInput: () => input.focus(),
    destroy: () => {
      pendingConfirm.forEach((timer) => clearTimeout(timer));
      offs.forEach((off) => off());
    },
  };
};
