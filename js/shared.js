/**
 * REGLAS Y EVENTOS COMPARTIDOS
 * Lo usan el navegador (js/) y el servidor (server/), así los dos hablan el mismo idioma.
 * Si cambias algo aquí, cambia en ambos lados a la vez.
 */

// ---------- Sala ----------
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS_TO_START = 1; // con menos de 4 es "modo demo": los roles sin dueño los maneja cualquiera
export const COUNTDOWN_SECONDS = 5;
/** Si todos pierden la conexión en plena misión, la sala espera este tiempo antes de borrarse. */
export const REJOIN_GRACE_MS = 5 * 60_000;
export const ROOM_CODE_LENGTH = 4;
export const MAX_NAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 300;
export const CHAT_HISTORY_LIMIT = 50;
export const ACK_TIMEOUT_MS = 5_000;

// ---------- Personalización ----------
/** El servidor le da a cada jugador el primer color libre. Dos jugadores nunca comparten color. */
export const PLAYER_COLORS = [
  { id: 'gold', name: 'Dorado', hex: '#f3b641' },
  { id: 'teal', name: 'Turquesa', hex: '#5cc2b4' },
  { id: 'pink', name: 'Rosa', hex: '#f07fa6' },
  { id: 'blue', name: 'Azul', hex: '#7ea6ff' },
  { id: 'red', name: 'Rojo', hex: '#ef6a5e' },
  { id: 'green', name: 'Verde', hex: '#86cf6b' },
  { id: 'violet', name: 'Violeta', hex: '#b293f2' },
  { id: 'white', name: 'Blanco', hex: '#efe6cf' },
];

/** Sombreros (se dibujan en js/character.js). */
export const HATS = [
  { id: 'none', name: 'Ninguno' },
  { id: 'crown', name: 'Corona' },
  { id: 'horns', name: 'Cuernos' },
  { id: 'sprout', name: 'Brote' },
];

// ---------- Roles de la tripulación ----------
/**
 * Cada rol lo ocupa un solo jugador y se SORTEA al despegar (server/rooms.js → drawRoles): en el lobby
 * nadie tiene rol. Solo cambia lo que cada quien puede hacer en la misión: el color y el sombrero
 * son apariencia y no dan ninguna ventaja.
 */
export const ROLES = [
  { id: 'scientist', name: 'Ciencia', duty: 'Investiga el destino, elige instrumentos e interpreta lo que se descubre.' },
  { id: 'merchant', name: 'Comercio', duty: 'Administra el presupuesto, compra las piezas y decide cuánto riesgo se paga.' },
  { id: 'engineer', name: 'Ingeniería', duty: 'Arma la nave, revisa que las piezas sean compatibles y repara las fallas.' },
  { id: 'pilot', name: 'Vuelo', duty: 'Único astronauta de carrera: traza la trayectoria y pilotea las maniobras.' },
];

export const isRoleId = (value) => ROLES.some((r) => r.id === value);
export const roleName = (id) => ROLES.find((r) => r.id === id)?.name ?? '';

/** Quién maneja un rol ahora mismo (un jugador sin conexión no cuenta). `players` es una lista. */
export const roleHolder = (players, roleId) => players.find((p) => p.role === roleId && p.connected !== false);

/**
 * ¿Este jugador puede actuar con este rol? Sí si es el suyo, o si nadie conectado lo tiene
 * (modo demo con menos de 4 jugadores, o para cubrir a quien perdió la conexión).
 */
export const canActAs = (players, playerId, roleId) => {
  const holder = roleHolder(players, roleId);
  return holder ? holder.id === playerId : players.some((p) => p.id === playerId);
};

/** Por qué todavía no se puede despegar (texto para mostrar), o null si ya se puede. */
export const startBlocker = ({ players, hostId }) => {
  const names = (list) => list.map((p) => p.name).join(', ');
  if (players.length < MIN_PLAYERS_TO_START) return `Se necesitan ${MIN_PLAYERS_TO_START} jugadores`;
  const notReady = players.filter((p) => p.id !== hostId && !p.ready);
  if (notReady.length > 0) return `Falta marcar Listo: ${names(notReady)}`;
  return null;
};

// ---------- Reglas de la partida (solo el anfitrión las cambia) ----------
/** Edita esta lista con las reglas de tu juego. El panel "Opciones" y la laptop se arman solos. */
export const GAME_SETTINGS = [
  { key: 'playerSpeed', label: 'Velocidad del jugador', type: 'number', min: 0.5, max: 2, step: 0.25, default: 1, unit: 'x' },
  { key: 'roundMinutes', label: 'Duración de la ronda', type: 'number', min: 1, max: 10, step: 1, default: 5, unit: ' min' },
  { key: 'rounds', label: 'Rondas', type: 'number', min: 1, max: 5, step: 1, default: 3 },
  { key: 'difficulty', label: 'Dificultad', type: 'choice', options: ['Fácil', 'Normal', 'Difícil'], default: 'Normal' },
];

export const defaultSettings = () => Object.fromEntries(GAME_SETTINGS.map((s) => [s.key, s.default]));

/** Devuelve el valor válido más cercano, o undefined si no se puede usar. */
export const normalizeSetting = (key, value) => {
  const setting = GAME_SETTINGS.find((s) => s.key === key);
  if (!setting) return undefined;
  if (setting.type === 'choice') return setting.options.includes(value) ? value : undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  const stepped = Math.round((number - setting.min) / setting.step) * setting.step + setting.min;
  return Math.min(setting.max, Math.max(setting.min, Number(stepped.toFixed(4))));
};

export const formatSetting = (setting, value) =>
  setting.type === 'number' ? `${value}${setting.unit ?? ''}` : String(value);

// ---------- Mapa del lobby (la nave) ----------
/** Medidas en "unidades de mundo"; la pantalla se escala para que quepa. */
export const LOBBY_MAP = {
  width: 960,
  height: 600,
  floor: { x: 76, y: 200, w: 808, h: 345 }, // zona caminable
  spawn: { x: 480, y: 400 },
  baseSpeed: 170, // unidades por segundo, multiplicado por "Velocidad del jugador"
  playerRadius: 18,
  // Muebles: x, y, w, h = huella en el piso (bloquea el paso; lo de más abajo se dibuja encima).
  // height = alto dibujado. kind = qué mueble es (se dibuja en js/lobby.js → FURNITURE).
  crates: [
    { id: 'customize', kind: 'locker', x: 100, y: 204, w: 116, h: 34, height: 118 },
    { kind: 'vending', x: 84, y: 322, w: 60, h: 30, height: 120 },
    { kind: 'luggage', x: 600, y: 290, w: 72, h: 28, height: 44 },
    { kind: 'plant', x: 822, y: 208, w: 44, h: 26, height: 34 },
    { kind: 'bench', x: 122, y: 470, w: 178, h: 30, height: 40 },
    { kind: 'bench', x: 660, y: 470, w: 178, h: 30, height: 40 },
  ],
  // El vestidor (casillero con los sombreros): si te acercas a este punto, se habilita Personalizar.
  station: { x: 158, y: 272, radius: 64 },
};

// ---------- Mensajes entre navegador y servidor ----------
/**
 * Un jugador:  { id, name, color, hat, x, y, facing, role, ready, connected }
 *              `id` no cambia aunque el jugador se reconecte. `role` es un id de ROLES o null.
 * Una sala:    { code, hostId, isPublic, phase: 'lobby' | 'countdown' | 'playing',
 *                settings, maxPlayers, players: [...] }
 */
export const EVENTS = {
  // Navegador → servidor
  ROOM_CREATE: 'room:create', //         { playerName, clientId, color, hat } → responde { ok, data | message }
  ROOM_JOIN: 'room:join', //             { code, playerName, clientId, color, hat, seatToken? } → igual
  //                                       `seatToken` (lo da el servidor al entrar) recupera tu lugar si te reconectas.
  ROOM_LEAVE: 'room:leave',
  ROOMS_LIST: 'rooms:list', //           → responde [{ code, hostName, players, maxPlayers }] (salas públicas)
  PLAYER_MOVE: 'player:move', //         { x, y, facing, moving, map?, act? }  (map y act solo en la misión)
  PLAYER_CUSTOMIZE: 'player:customize', // { color?, hat? }
  PLAYER_SET_READY: 'player:setReady', // true / false
  ROOM_SET_PRIVACY: 'room:setPrivacy', //  true = pública   (solo anfitrión)
  ROOM_SET_SETTING: 'room:setSetting', //  { key, value }    (solo anfitrión)
  ROOM_KICK: 'room:kick', //             { playerId, ban }  (solo anfitrión)
  GAME_START: 'game:start', //           (solo anfitrión)
  GAME_END: 'game:end', //               vuelve al lobby (solo anfitrión)
  CHAT_SEND: 'chat:send', //             "texto"
  STATE_ACTION: 'state:action', //       acción de la misión, p. ej. { type: 'task:done', id: 'briefing.scope' }

  // Servidor → todos los de la sala
  ROOM_UPDATE: 'room:update', //         sala completa
  PLAYER_JOINED: 'room:playerJoined', // jugador (+ rejoined: true si volvió a su lugar)
  PLAYER_LEFT: 'room:playerLeft', //     { player, reason: 'left' | 'disconnected' | 'away' | 'kicked' | 'banned' }
  //                                       'away' = perdió la conexión en plena misión; su lugar queda guardado.
  PLAYER_MOVED: 'player:moved', //       { id, x, y, facing, moving, map, act }
  COUNTDOWN: 'game:countdown', //        { seconds } o { seconds: null, cancelled: "motivo" }
  KICKED: 'room:kicked', //              { banned }  (solo al expulsado)
  CHAT_MESSAGE: 'chat:message', //       { id, playerId, playerName, color, text, sentAt }
  STATE_SYNC: 'state:sync', //           { version, data }
  STATE_REJECTED: 'state:rejected', //   { message }  (solo a quien mandó una acción que no se aceptó)
};

export const ERROR_MESSAGES = {
  ROOM_FULL: 'Sala llena',
  ROOM_NOT_FOUND: 'Sala no encontrada. Revisa el código.',
  GAME_IN_PROGRESS: 'La partida ya comenzó. Espera a que vuelvan al lobby.',
  BANNED: 'El anfitrión te bloqueó en esta sala.',
  INVALID_NAME: `Escribe un nombre de piloto (1 a ${MAX_NAME_LENGTH} caracteres).`,
  INVALID_CODE: `El código tiene ${ROOM_CODE_LENGTH} letras.`,
  INTERNAL: 'Error interno del servidor',
};

// ---------- Validaciones (devuelven el valor limpio, o null) ----------
export const normalizeName = (value) => {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
};

export const normalizeRoomCode = (value) => {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return new RegExp(`^[A-Z]{${ROOM_CODE_LENGTH}}$`).test(code) ? code : null;
};

export const normalizeChatText = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text.slice(0, MAX_CHAT_LENGTH) : null;
};

export const isColorId = (value) => PLAYER_COLORS.some((c) => c.id === value);
export const isHatId = (value) => HATS.some((h) => h.id === value);
export const colorHex = (id) => PLAYER_COLORS.find((c) => c.id === id)?.hex ?? '#efe6cf';

/** Mantiene un punto dentro del piso caminable. */
export const clampToFloor = (x, y) => {
  const { floor, playerRadius } = LOBBY_MAP;
  return {
    x: Math.min(floor.x + floor.w - playerRadius, Math.max(floor.x + playerRadius, x)),
    y: Math.min(floor.y + floor.h - 4, Math.max(floor.y + 6, y)),
  };
};
