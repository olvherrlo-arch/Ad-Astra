/**
 * SALAS (servidor)
 * Crear, unirse, salir, desconexión, salas públicas y la cuenta regresiva de inicio.
 * - Máximo 4 jugadores; cada uno recibe el primer color libre y un `id` que no cambia.
 * - Si el anfitrión se va, el rol de anfitrión pasa al jugador conectado que lleva más tiempo en la sala.
 * - Si alguien entra o sale durante la cuenta regresiva, se cancela.
 * - En el lobby, perder la conexión es salir. En plena misión, el lugar (y el rol) queda guardado:
 *   el jugador vuelve con su `seatToken` (recarga, corte de red) o desde el mismo navegador.
 */
import { randomInt, randomUUID } from 'node:crypto';
import {
  ERROR_MESSAGES,
  EVENTS,
  LOBBY_MAP,
  MAX_PLAYERS,
  PLAYER_COLORS,
  ROLES,
  ROOM_CODE_LENGTH,
  defaultSettings,
  isColorId,
  isHatId,
  normalizeName,
  normalizeRoomCode,
} from '../js/shared.js';
import { createInitialState, publicState } from './game.js';

// Sin I ni O para que no se confundan con 1 y 0.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Error esperado que se le devuelve al jugador, p. ej. "Sala llena". */
export class GameError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
  }
}

const toAckError = (error) => {
  if (error instanceof GameError) return { ok: false, error: error.code, message: error.message };
  console.error('[server] error inesperado', error);
  return { ok: false, error: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL };
};

/** Las salas viven en memoria: si reinicias el servidor, se borran. */
export class RoomStore {
  #rooms = new Map();

  constructor({ countdownSeconds, rejoinGraceMs, pickRoles = drawRoles }) {
    this.countdownSeconds = countdownSeconds;
    this.rejoinGraceMs = rejoinGraceMs;
    this.pickRoles = pickRoles; // las pruebas lo reemplazan para saber quién queda con qué rol
  }

  get(code) {
    return this.#rooms.get(code);
  }

  publicRooms() {
    return [...this.#rooms.values()]
      .filter((room) => room.isPublic && room.phase === 'lobby' && room.players.size < MAX_PLAYERS)
      .map((room) => ({
        code: room.code,
        hostName: room.players.get(room.hostId)?.name ?? '',
        players: room.players.size,
        maxPlayers: MAX_PLAYERS,
      }));
  }

  create(identity) {
    const room = {
      code: this.#generateCode(),
      hostId: '',
      players: new Map(), // en orden de llegada: el primero es quien lleva más tiempo
      isPublic: false,
      phase: 'lobby',
      settings: defaultSettings(),
      banned: new Set(), // clientId de los bloqueados
      countdown: null,
      emptyTimer: null, // corre mientras no queda nadie conectado en plena misión
      awayHostId: null, // anfitrión que perdió la conexión: recupera el puesto si vuelve
      state: createInitialState(),
      messages: [],
    };
    this.#rooms.set(room.code, room);
    const player = seat(room, identity);
    room.hostId = player.id;
    return { room, player, rejoined: false, previousSocketId: null };
  }

  /**
   * Entra a una sala. Si el jugador ya tenía un lugar, lo recupera:
   * - con su `seatToken` (aunque el servidor aún no haya notado que se cayó la conexión anterior), o
   * - en plena misión, desde el mismo navegador (`clientId`) si su lugar quedó sin conexión.
   */
  join(code, identity) {
    const room = this.#rooms.get(code);
    if (!room) throw new GameError('ROOM_NOT_FOUND');
    if (room.banned.has(identity.clientId)) throw new GameError('BANNED');

    const seats = [...room.players.values()];
    const mine =
      (identity.seatToken && seats.find((p) => p.seatToken === identity.seatToken)) ||
      (room.phase === 'playing' && seats.find((p) => !p.connected && p.clientId === identity.clientId));
    if (mine) {
      const previousSocketId = mine.socketId;
      Object.assign(mine, { socketId: identity.socketId, connected: true });
      this.settle(room);
      return { room, player: mine, rejoined: true, previousSocketId };
    }

    if (room.phase === 'playing') throw new GameError('GAME_IN_PROGRESS');
    if (room.players.size >= MAX_PLAYERS) throw new GameError('ROOM_FULL');
    return { room, player: seat(room, identity), rejoined: false, previousSocketId: null };
  }

  /** Saca al jugador; borra la sala si queda vacía y pasa el rol de anfitrión si hace falta. */
  leave(code, playerId) {
    const room = this.#rooms.get(code);
    if (!room) return undefined;

    room.players.delete(playerId);
    if (room.players.size === 0) {
      this.remove(code);
      return undefined;
    }
    this.settle(room);
    return room;
  }

  /**
   * Después de que alguien entra, sale o pierde la conexión: el anfitrión siempre es alguien
   * conectado, y si no queda nadie conectado la sala espera un rato antes de borrarse.
   * Si el anfitrión solo perdió la conexión, otro lo reemplaza mientras tanto y al volver lo recupera.
   */
  settle(room) {
    const connected = [...room.players.values()].filter((p) => p.connected);
    if (connected.length === 0) {
      if (!room.emptyTimer) {
        room.emptyTimer = setTimeout(() => this.remove(room.code), this.rejoinGraceMs);
        room.emptyTimer.unref?.();
      }
      return;
    }
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;

    const awayHost = room.players.get(room.awayHostId);
    if (!awayHost) room.awayHostId = null;
    else if (awayHost.connected) Object.assign(room, { hostId: awayHost.id, awayHostId: null });

    const host = room.players.get(room.hostId);
    if (host?.connected) return;
    if (host) room.awayHostId ??= host.id;
    room.hostId = connected[0].id;
  }

  remove(code) {
    const room = this.#rooms.get(code);
    if (!room) return;
    clearInterval(room.countdown?.timer);
    clearTimeout(room.emptyTimer);
    this.#rooms.delete(code);
  }

  #generateCode() {
    let code;
    do {
      code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
      ).join('');
    } while (this.#rooms.has(code));
    return code;
  }
}

/** Sienta a un jugador nuevo: primer color libre (o el que prefiere, si está libre) y punto de aparición. */
const seat = (room, { socketId, clientId, name, color, hat }) => {
  const usedColors = new Set([...room.players.values()].map((p) => p.color));
  const colorId = isColorId(color) && !usedColors.has(color) ? color : PLAYER_COLORS.find((c) => !usedColors.has(c.id)).id;
  const angle = (room.players.size / MAX_PLAYERS) * Math.PI * 2;
  const player = {
    id: randomUUID().slice(0, 8), //  lo ven todos; no cambia al reconectarse
    socketId, //                       conexión actual (null si está sin conexión)
    clientId, //                       navegador (para bloquear y para recuperar el lugar)
    seatToken: randomUUID(), //        secreto: solo lo conoce este jugador
    name,
    color: colorId,
    hat: isHatId(hat) ? hat : 'none',
    x: Math.round(LOBBY_MAP.spawn.x + Math.cos(angle) * 40),
    y: Math.round(LOBBY_MAP.spawn.y + Math.sin(angle) * 24),
    facing: 1,
    role: null,
    ready: false,
    connected: true,
  };
  room.players.set(player.id, player);
  return player;
};

/** Lo que ven los demás de un jugador (sin su clientId, su conexión ni su seatToken). */
export const publicPlayer = ({ id, name, color, hat, x, y, facing, role, ready, connected }) =>
  ({ id, name, color, hat, x, y, facing, role, ready, connected });

/** Versión de la sala que se envía a los navegadores. */
export const toSnapshot = (room) => ({
  code: room.code,
  hostId: room.hostId,
  isPublic: room.isPublic,
  phase: room.phase,
  settings: room.settings,
  maxPlayers: MAX_PLAYERS,
  players: [...room.players.values()].map(publicPlayer),
});

export const broadcastRoom = (io, room) => io.to(room.code).emit(EVENTS.ROOM_UPDATE, toSnapshot(room));

// ---------- Roles al azar ----------

/**
 * Sortea los roles: devuelve un id de ROLES por jugador, sin repetir (mezcla de Fisher-Yates).
 * Con menos de 4 jugadores, los roles que sobran quedan libres (modo demo).
 */
export const drawRoles = (players) => {
  const ids = ROLES.map((role) => role.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return players.map((_player, index) => ids[index] ?? null);
};

const assignRoles = (room, pickRoles) => {
  const crew = [...room.players.values()];
  const picked = pickRoles(crew);
  crew.forEach((player, index) => { player.role = picked[index] ?? null; });
};

// ---------- Cuenta regresiva ----------

export const startCountdown = (io, room, seconds, pickRoles = drawRoles) => {
  room.phase = 'countdown';
  let remaining = seconds;
  io.to(room.code).emit(EVENTS.COUNTDOWN, { seconds: remaining });
  broadcastRoom(io, room);

  const timer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      io.to(room.code).emit(EVENTS.COUNTDOWN, { seconds: remaining });
      return;
    }
    clearInterval(timer);
    room.countdown = null;
    room.phase = 'playing';
    assignRoles(room, pickRoles); // los roles se sortean al despegar
    room.state = createInitialState(room.state.data.campaign); // la campaña de la sala se conserva
    broadcastRoom(io, room);
    io.to(room.code).emit(EVENTS.STATE_SYNC, publicState(room.state));
  }, 1_000);
  room.countdown = { timer };
};

/** Cancela la cuenta regresiva (no envía la sala: quien llama lo hace). */
export const cancelCountdown = (io, room, reason) => {
  if (!room.countdown) return;
  clearInterval(room.countdown.timer);
  room.countdown = null;
  room.phase = 'lobby';
  io.to(room.code).emit(EVENTS.COUNTDOWN, { seconds: null, cancelled: reason });
};

// ---------- Entrar y salir ----------

/** Desliga una conexión de su sala (el lugar del jugador no se toca). */
const detach = (socket) => {
  const { roomCode } = socket.data;
  socket.data.roomCode = undefined;
  socket.data.player = undefined;
  if (roomCode) socket.leave(roomCode);
};

/** Quita el lugar de un jugador y avisa al resto. `reason`: left | disconnected | kicked | banned */
export const removeSeat = (io, store, roomCode, player, reason) => {
  const room = store.leave(roomCode, player.id);
  if (!room) return;
  io.to(roomCode).emit(EVENTS.PLAYER_LEFT, { player: publicPlayer(player), reason });
  cancelCountdown(io, room, `${player.name} salió de la sala`);
  broadcastRoom(io, room);
};

/** Saca a un socket de su sala y avisa al resto. */
export const removeFromRoom = (io, socket, store, reason) => {
  const { roomCode, player } = socket.data;
  if (!roomCode || !player) return;
  detach(socket);
  removeSeat(io, store, roomCode, player, reason);
};

/** Se cayó la conexión en plena misión: el lugar y el rol quedan guardados hasta que vuelva. */
const holdSeat = (io, socket, store, room, player) => {
  detach(socket);
  Object.assign(player, { socketId: null, connected: false });
  store.settle(room);
  io.to(room.code).emit(EVENTS.PLAYER_LEFT, { player: publicPlayer(player), reason: 'away' });
  broadcastRoom(io, room);
};

/** Al volver al lobby se van los lugares sin conexión, los roles se borran (se sortean de nuevo) y todos vuelven a marcar Listo. */
export const returnToLobby = (io, store, room) => {
  room.phase = 'lobby';
  for (const player of [...room.players.values()]) {
    player.ready = false;
    player.role = null;
    if (player.connected) continue;
    room.players.delete(player.id);
    io.to(room.code).emit(EVENTS.PLAYER_LEFT, { player: publicPlayer(player), reason: 'disconnected' });
  }
  store.settle(room);
  broadcastRoom(io, room);
};

export const registerRoomHandlers = (io, socket, store) => {
  const identityFrom = (payload) => {
    const name = normalizeName(payload?.playerName);
    if (!name) throw new GameError('INVALID_NAME');
    const clientId = typeof payload?.clientId === 'string' ? payload.clientId.slice(0, 64) : socket.id;
    const seatToken = typeof payload?.seatToken === 'string' ? payload.seatToken.slice(0, 64) : null;
    return { socketId: socket.id, clientId, seatToken, name, color: payload?.color, hat: payload?.hat };
  };

  const enterRoom = ({ room, player, rejoined, previousSocketId }, ack) => {
    // Si este lugar seguía ligado a una conexión vieja (corte de red), esa conexión se cierra.
    const previous = previousSocketId && previousSocketId !== socket.id ? io.sockets.sockets.get(previousSocketId) : null;
    if (previous) {
      detach(previous);
      previous.disconnect(true);
    }

    socket.data.roomCode = room.code;
    socket.data.player = player;
    if (!rejoined) cancelCountdown(io, room, `${player.name} entró a la sala`);
    socket.join(room.code);

    ack({
      ok: true,
      data: {
        me: publicPlayer(player),
        seatToken: player.seatToken,
        room: toSnapshot(room),
        state: publicState(room.state),
        messages: room.messages,
      },
    });
    socket.to(room.code).emit(EVENTS.PLAYER_JOINED, { ...publicPlayer(player), rejoined });
    socket.to(room.code).emit(EVENTS.ROOM_UPDATE, toSnapshot(room));
  };

  socket.on(EVENTS.ROOM_CREATE, (payload, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const identity = identityFrom(payload);
      removeFromRoom(io, socket, store, 'left');
      enterRoom(store.create(identity), ack);
    } catch (error) {
      ack(toAckError(error));
    }
  });

  socket.on(EVENTS.ROOM_JOIN, (payload, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const identity = identityFrom(payload);
      const code = normalizeRoomCode(payload?.code);
      if (!code) throw new GameError('INVALID_CODE');
      removeFromRoom(io, socket, store, 'left');
      enterRoom(store.join(code, identity), ack);
    } catch (error) {
      ack(toAckError(error));
    }
  });

  socket.on(EVENTS.ROOMS_LIST, (ack) => {
    if (typeof ack === 'function') ack(store.publicRooms());
  });

  socket.on(EVENTS.ROOM_LEAVE, () => removeFromRoom(io, socket, store, 'left'));

  socket.on('disconnect', () => {
    const { roomCode, player } = socket.data;
    const room = roomCode ? store.get(roomCode) : undefined;
    if (room && player && room.phase === 'playing') holdSeat(io, socket, store, room, player);
    else removeFromRoom(io, socket, store, 'disconnected');
  });
};
