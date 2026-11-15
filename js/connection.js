/**
 * CONEXIÓN CON EL SERVIDOR
 * Única conexión de la página. Guarda la sesión (sala, jugadores, chat, estado)
 * y avisa a las pantallas cuando algo cambia.
 *
 * Para enterarte de cambios:   on('room', (room) => { ... })
 * Avisos: 'connection', 'error', 'enter', 'leave', 'phase', 'room', 'moved',
 *         'countdown', 'chat-line', 'state', 'rejected'
 *
 * Si se corta la conexión o recargas la página, vuelve sola a tu sala: el servidor te da una
 * llave (seatToken) que se guarda en esta pestaña y sirve para recuperar tu lugar.
 */
import { ACK_TIMEOUT_MS, EVENTS, colorHex } from './shared.js';

// `io` lo carga index.html desde el servidor (<script src="/socket.io/socket.io.js">).
const socket = /** @type {any} */ (window).io();

// ---------- Guardado en el navegador ----------
export const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Modo privado sin almacenamiento: solo dura esta visita.
    }
  },
};

/** Identificador de este navegador (lo usa el anfitrión para bloquear). */
const clientId =
  storage.get('adastra.clientId', null) ??
  (() => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    storage.set('adastra.clientId', id);
    return id;
  })();

/** Tu lugar en la sala actual, guardado en esta pestaña: { code, name, token }. Sobrevive a recargar. */
const SEAT_KEY = 'adastra.seat';
const savedSeat = {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? 'null');
    } catch {
      return null;
    }
  },
  set(seat) {
    try {
      if (seat) sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
      else sessionStorage.removeItem(SEAT_KEY);
    } catch {
      // Sin almacenamiento: al recargar entrarás como jugador nuevo.
    }
  },
};

/** Color y sombrero que prefieres; se usan al entrar si están libres. */
const cosmetics = () => storage.get('adastra.cosmetics', { color: null, hat: 'none' });

// ---------- Sesión ----------
/** Léela desde cualquier archivo, pero solo este archivo la cambia. */
export const session = {
  connected: false,
  reconnecting: false, // se cortó la conexión estando en una sala y estamos intentando volver
  error: null,
  myId: null,
  room: null, //  { code, hostId, isPublic, phase, settings, maxPlayers, players }
  state: null, // { version, data } del juego
  chat: [], //    [{ id, text, author?, color?, playerId?, mine? }] (sin author = aviso del sistema)
  solo: false, // se entró con SOLO: la sala despega sola apenas se abre (js/hud.js)
};

export const getPlayer = (id) => session.room?.players.find((p) => p.id === id);
export const getMe = () => getPlayer(session.myId);
export const isHost = () => Boolean(session.room && session.room.hostId === session.myId);

// ---------- Avisos para las pantallas ----------
const listeners = new Map();

/** Suscríbete a un aviso. Devuelve una función para dejar de escuchar. */
export const on = (event, listener) => {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(listener);
  return () => listeners.get(event).delete(listener);
};

const notify = (event, payload) => listeners.get(event)?.forEach((listener) => listener(payload));

// ---------- Chat ----------
let nextLineId = 0;

const LEAVE_TEXT = {
  left: 'salió de la sala',
  disconnected: 'se desconectó',
  away: 'perdió la conexión (su lugar queda guardado)',
  kicked: 'fue expulsado por el anfitrión',
  banned: 'fue bloqueado por el anfitrión',
};

const toLine = (message) => ({
  id: message.id,
  text: message.text,
  author: message.playerName,
  playerId: message.playerId,
  color: colorHex(getPlayer(message.playerId)?.color ?? message.color),
  mine: message.playerId === session.myId,
});

const systemLine = (text, color) => ({ id: `system-${nextLineId++}`, text, color });

const addLine = (line) => {
  session.chat.push(line);
  notify('chat-line', line);
};

// ---------- Lo que manda el servidor ----------
const setError = (message) => {
  session.error = message;
  notify('error', message);
};

const clearSession = () => Object.assign(session, { myId: null, room: null, state: null, chat: [], reconnecting: false });

const leaveWithMessage = (message) => {
  clearSession();
  savedSeat.set(null);
  if (message) setError(message);
  notify('leave');
};

socket.on('connect', async () => {
  session.connected = true;
  setError(null);
  // ¿Teníamos un lugar (se cortó la conexión o se recargó la página)? Intentamos recuperarlo.
  const seat = savedSeat.get();
  if (seat) {
    const wasInRoom = Boolean(session.room);
    const error = await enter(EVENTS.ROOM_JOIN, { code: seat.code, playerName: seat.name });
    if (error && wasInRoom) leaveWithMessage(`No se pudo volver a la sala ${seat.code}: ${error}`);
    else if (error) savedSeat.set(null);
  }
  notify('connection', true);
});

socket.on('disconnect', (reason) => {
  session.connected = false;
  if (!session.room) {
    setError('Se perdió la conexión con el servidor');
  } else if (reason === 'io server disconnect') {
    // El servidor cerró esta conexión porque tu lugar se abrió en otra pestaña (no se reintenta solo).
    leaveWithMessage('Tu lugar en la sala se abrió desde otra pestaña.');
    socket.connect();
  } else {
    // Nos quedamos en la pantalla: al reconectar, 'connect' recupera el lugar.
    session.reconnecting = true;
  }
  notify('connection', false);
});

socket.on(EVENTS.ROOM_UPDATE, (room) => {
  if (!session.room) return;
  const previousPhase = session.room.phase;
  session.room = room;
  // Partida nueva: el servidor manda el estado inicial justo después.
  if (room.phase === 'playing' && previousPhase !== 'playing') session.state = null;
  notify('room', room);
  if (room.phase !== previousPhase) notify('phase', room.phase);
});

socket.on(EVENTS.PLAYER_MOVED, (move) => {
  const player = getPlayer(move.id);
  if (!player) return;
  Object.assign(player, { x: move.x, y: move.y, facing: move.facing });
  notify('moved', move);
});

socket.on(EVENTS.PLAYER_JOINED, (player) => {
  if (!session.room) return;
  const text = player.rejoined ? 'recuperó la conexión' : 'se ha unido a la sala';
  addLine(systemLine(`${player.name} ${text}`, colorHex(player.color)));
});

socket.on(EVENTS.PLAYER_LEFT, ({ player, reason }) => {
  if (session.room) addLine(systemLine(`${player.name} ${LEAVE_TEXT[reason] ?? LEAVE_TEXT.left}`, colorHex(player.color)));
});

socket.on(EVENTS.COUNTDOWN, (countdown) => {
  if (!session.room) return;
  if (countdown.cancelled) addLine(systemLine(`Cuenta regresiva cancelada: ${countdown.cancelled}`));
  notify('countdown', countdown);
});

socket.on(EVENTS.KICKED, ({ banned }) => {
  leaveWithMessage(banned ? 'El anfitrión te bloqueó en esa sala.' : 'El anfitrión te expulsó de la sala.');
});

socket.on(EVENTS.CHAT_MESSAGE, (message) => {
  if (session.room) addLine(toLine(message));
});

socket.on(EVENTS.STATE_SYNC, (state) => {
  // Solo aceptamos estados más nuevos que el que tenemos.
  if (!session.room || (session.state && state.version <= session.state.version)) return;
  session.state = state;
  notify('state', state);
});

/** El servidor no aceptó una acción nuestra: las pantallas muestran el motivo. */
socket.on(EVENTS.STATE_REJECTED, ({ message }) => {
  if (session.room) notify('rejected', message);
});

// ---------- Acciones (las usan las pantallas) ----------

/** Devuelve null si entraste, o el mensaje de error para mostrar. */
const enter = async (event, payload) => {
  try {
    const { color, hat } = cosmetics();
    const seatToken = savedSeat.get()?.token;
    const result = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, { ...payload, clientId, color, hat, seatToken });
    if (!result.ok) return result.message;

    const { me, room, state, messages, seatToken: token } = result.data;
    Object.assign(session, { myId: me.id, room, state, error: null, reconnecting: false });
    session.chat = messages.map(toLine);
    savedSeat.set({ code: room.code, name: me.name, token });
    notify('enter');
    return null;
  } catch {
    return 'El servidor no respondió. Intenta de nuevo.';
  }
};

export const createRoom = (playerName) => enter(EVENTS.ROOM_CREATE, { playerName });

export const joinRoom = (code, playerName) => enter(EVENTS.ROOM_JOIN, { code, playerName });

/** Salas públicas con lugar: [{ code, hostName, players, maxPlayers }] */
/** La tabla de récords (las mejores misiones de este servidor), o null si no respondió. */
export const listRecords = async () => {
  try {
    return await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(EVENTS.RECORDS_LIST);
  } catch {
    return null;
  }
};

export const listPublicRooms = async () => {
  try {
    return await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(EVENTS.ROOMS_LIST);
  } catch {
    return null;
  }
};

export const leaveRoom = () => {
  socket.emit(EVENTS.ROOM_LEAVE);
  leaveWithMessage(null);
};

export const sendChat = (text) => socket.emit(EVENTS.CHAT_SEND, text);

export const sendMove = (move) => socket.emit(EVENTS.PLAYER_MOVE, move);

/** Cambia tu color o sombrero, y lo recuerda para la próxima vez. */
export const customize = (changes) => {
  storage.set('adastra.cosmetics', { ...cosmetics(), ...changes });
  socket.emit(EVENTS.PLAYER_CUSTOMIZE, changes);
};

export const setReady = (ready) => socket.emit(EVENTS.PLAYER_SET_READY, ready);

// Solo el anfitrión (el servidor ignora estos pedidos si no lo eres).
export const setPrivacy = (isPublic) => socket.emit(EVENTS.ROOM_SET_PRIVACY, isPublic);
export const setSetting = (key, value) => socket.emit(EVENTS.ROOM_SET_SETTING, { key, value });
export const kickPlayer = (playerId, ban) => socket.emit(EVENTS.ROOM_KICK, { playerId, ban });
export const startGame = () => socket.emit(EVENTS.GAME_START);
export const endGame = () => socket.emit(EVENTS.GAME_END);

/** Manda una acción del juego. Las reglas que la aplican están en server/game.js. */
export const sendAction = (action) => socket.emit(EVENTS.STATE_ACTION, action);
