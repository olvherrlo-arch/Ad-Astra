/**
 * CHAT (servidor)
 * Recibe mensajes, guarda los últimos 50 por sala y los reparte a todos.
 */
import { randomUUID } from 'node:crypto';
import { CHAT_HISTORY_LIMIT, EVENTS, normalizeChatText } from '../js/shared.js';

export const registerChatHandlers = (io, socket, store) => {
  socket.on(EVENTS.CHAT_SEND, (rawText) => {
    const { roomCode, player } = socket.data;
    const text = normalizeChatText(rawText);
    const room = roomCode ? store.get(roomCode) : undefined;
    if (!room || !player || !text) return;

    const message = {
      id: randomUUID(),
      playerId: player.id,
      playerName: player.name,
      color: room.players.get(player.id)?.color,
      text,
      sentAt: Date.now(),
    };
    room.messages.push(message);
    if (room.messages.length > CHAT_HISTORY_LIMIT) room.messages.shift();

    io.to(room.code).emit(EVENTS.CHAT_MESSAGE, message);
  });
};
