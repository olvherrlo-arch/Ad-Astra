/**
 * ARRANQUE
 * Decide qué pantalla mostrar:
 *   menú (sin sala) → lobby (la nave) → partida (cuando el anfitrión da START).
 */
import { leaveRoom, on, session } from './connection.js';
import { mountGame } from './game.js';
import { mountLobby } from './lobby.js';
import { mountMenu } from './menu.js';
import { sounds } from './sound.js';
import { startTutorials } from './tutorial.js';
import { showRoleReveal } from './rolereveal.js';

const SCREENS = { menu: mountMenu, lobby: mountLobby, game: mountGame };
const app = document.getElementById('app');
let currentScreen = null;
let unmountCurrent = null;

/** `force` vuelve a armar la pantalla aunque sea la misma (al recuperar la conexión). */
const show = (name, force = false) => {
  if (name === currentScreen && !force) return;
  unmountCurrent?.();
  app.replaceChildren();
  currentScreen = name;
  unmountCurrent = SCREENS[name](app);
};

const screenForSession = () => {
  if (!session.room) return 'menu';
  return session.room.phase === 'playing' ? 'game' : 'lobby';
};

/** Fundido a negro al despegar, y luego la partida. */
const launch = () => {
  const fade = document.createElement('div');
  fade.className = 'launch-fade';
  fade.innerHTML = '<p>Despegue</p>';
  document.body.append(fade);
  sounds.launch();
  setTimeout(() => show(screenForSession()), 700);
  setTimeout(() => fade.remove(), 1_700);
  // Los roles se sortearon al despegar: cada quien ve el suyo.
  setTimeout(showRoleReveal, 1_400);
};

/** Aviso mientras se intenta volver a la sala tras un corte de conexión. */
const reconnectBanner = document.createElement('div');
reconnectBanner.className = 'net-banner';
reconnectBanner.setAttribute('role', 'status');
reconnectBanner.hidden = true;
reconnectBanner.innerHTML = '<span>Se cortó la conexión. Volviendo a tu sala…</span><button type="button">Salir al menú</button>';
reconnectBanner.querySelector('button').addEventListener('click', leaveRoom);
document.body.append(reconnectBanner);
const showReconnecting = () => {
  reconnectBanner.hidden = !session.reconnecting;
};

on('enter', () => show(screenForSession(), true));
on('leave', () => show('menu'));
on('phase', () => (screenForSession() === 'game' ? launch() : show(screenForSession())));
on('connection', showReconnecting);
on('enter', showReconnecting);
on('leave', showReconnecting);

show('menu');
startTutorials();
