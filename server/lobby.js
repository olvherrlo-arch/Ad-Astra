/**
 * LOBBY (servidor)
 * Lo que pasa mientras esperan en la nave:
 * - Todos: moverse, personalizarse (color y sombrero) y marcar Listo. Los roles se sortean al despegar.
 * - Solo el anfitrión: pública/privada, reglas de la partida, expulsar/bloquear, START y volver al lobby.
 */
import {
  EVENTS,
  clampToFloor,
  isColorId,
  isHatId,
  normalizeSetting,
  startBlocker,
} from '../js/shared.js';
import { broadcastRoom, removeFromRoom, removeSeat, returnToLobby, startCountdown, toSnapshot } from './rooms.js';

export const registerLobbyHandlers = (io, socket, store) => {
  /** La sala y el jugador de este socket, o null si no está en una sala. */
  const current = () => {
    const { roomCode, player } = socket.data;
    const room = roomCode ? store.get(roomCode) : undefined;
    const me = room?.players.get(player?.id);
    return room && me ? { room, me } : null;
  };

  /** Envuelve una acción para que solo la pueda hacer el anfitrión. */
  const hostOnly = (action) => (payload) => {
    const context = current();
    if (context && context.room.hostId === context.me.id) action(context, payload);
  };

  // ---------- Todos ----------

  socket.on(EVENTS.PLAYER_MOVE, (move) => {
    const context = current();
    if (!context || context.room.phase === 'playing' || typeof move !== 'object' || move === null) return;
    const x = Number(move.x), y = Number(move.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const position = clampToFloor(x, y);
    const facing = move.facing === -1 ? -1 : 1;
    Object.assign(context.me, { x: Math.round(position.x), y: Math.round(position.y), facing });
    socket.to(context.room.code).emit(EVENTS.PLAYER_MOVED, {
      id: context.me.id,
      x: context.me.x,
      y: context.me.y,
      facing,
      moving: Boolean(move.moving),
    });
  });

  socket.on(EVENTS.PLAYER_CUSTOMIZE, (changes) => {
    const context = current();
    if (!context || typeof changes !== 'object' || changes === null) return;
    const { room, me } = context;

    if (isColorId(changes.color)) {
      const takenByOther = [...room.players.values()].some((p) => p.id !== me.id && p.color === changes.color);
      if (!takenByOther) me.color = changes.color;
    }
    if (isHatId(changes.hat)) me.hat = changes.hat;
    broadcastRoom(io, room);
  });

  socket.on(EVENTS.PLAYER_SET_READY, (ready) => {
    const context = current();
    if (!context || context.room.phase !== 'lobby') return;
    context.me.ready = Boolean(ready);
    broadcastRoom(io, context.room);
  });

  // ---------- Solo el anfitrión ----------

  socket.on(EVENTS.ROOM_SET_PRIVACY, hostOnly(({ room }, isPublic) => {
    room.isPublic = Boolean(isPublic);
    broadcastRoom(io, room);
  }));

  socket.on(EVENTS.ROOM_SET_SETTING, hostOnly(({ room }, change) => {
    if (room.phase !== 'lobby') return;
    const value = normalizeSetting(change?.key, change?.value);
    if (value === undefined) return;
    room.settings[change.key] = value;
    broadcastRoom(io, room);
  }));

  socket.on(EVENTS.ROOM_KICK, hostOnly(({ room, me }, request) => {
    const target = room.players.get(request?.playerId);
    if (!target || target.id === me.id) return;

    const banned = Boolean(request.ban);
    if (banned) room.banned.add(target.clientId);
    const reason = banned ? 'banned' : 'kicked';
    const targetSocket = target.socketId ? io.sockets.sockets.get(target.socketId) : undefined;
    if (!targetSocket) return removeSeat(io, store, room.code, target, reason); // estaba sin conexión
    targetSocket.emit(EVENTS.KICKED, { banned });
    removeFromRoom(io, targetSocket, store, reason);
  }));

  /** Despegar: todos, salvo el anfitrión, con Listo. Los roles se sortean al terminar la cuenta. */
  socket.on(EVENTS.GAME_START, hostOnly(({ room }) => {
    if (room.phase !== 'lobby' || startBlocker(toSnapshot(room)) !== null) return;
    startCountdown(io, room, store.countdownSeconds, store.pickRoles);
  }));

  socket.on(EVENTS.GAME_END, hostOnly(({ room }) => {
    if (room.phase !== 'playing') return;
    returnToLobby(io, store, room);
  }));
};
