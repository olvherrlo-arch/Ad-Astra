/**
 * SERVIDOR
 * Un solo proceso hace dos cosas en el mismo puerto:
 *   1. Entrega la página (index.html, css/, js/, assets/).
 *   2. Mantiene la conexión en tiempo real con Socket.IO (salas, chat, juego).
 * Uso: npm run dev  →  http://localhost:3000
 */
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gzip as gzipCallback } from 'node:zlib';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { COUNTDOWN_SECONDS, LOBBY_GRACE_MS, REJOIN_GRACE_MS } from '../js/shared.js';
import { registerChatHandlers } from './chat.js';
import { registerGameHandlers } from './game.js';
import { registerLobbyHandlers } from './lobby.js';
import { RoomStore, registerRoomHandlers } from './rooms.js';

const gzip = promisify(gzipCallback);
const PROJECT_ROOT =fileURLToPath(new URL('..', import.meta.url));

// Solo estas carpetas son públicas. server/, tests/ y package.json nunca se entregan.
const PUBLIC_ENTRIES = ['index.html', 'css', 'js', 'assets'];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
};

const notFound = (res) => res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');

const serveFile = async (req, res) => {
  let relativePath;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    relativePath = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^[\\/]+/, '');
  } catch {
    return notFound(res);
  }

  const topLevel = relativePath.split(/[\\/]/)[0];
  if (!PUBLIC_ENTRIES.includes(topLevel)) return notFound(res);

  try {
    const filePath = join(PROJECT_ROOT, relativePath);
    const info = await stat(filePath);
    if (!info.isFile()) return notFound(res);
    const type = CONTENT_TYPES[extname(relativePath).toLowerCase()] ?? 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      // "no-cache" = el navegador pregunta siempre si el archivo cambió: editas, recargas y ves el cambio.
      // Si no cambió (misma etiqueta), se responde 304 sin volver a mandarlo: carga mucho más rápido por internet.
      'Cache-Control': 'no-cache',
      ETag: `"${info.size}-${Math.round(info.mtimeMs)}"`,
    };
    if (req.headers['if-none-match'] === headers.ETag) return res.writeHead(304, headers).end();

    const body = await readFile(filePath);
    // Texto (html, css, js, svg): se manda comprimido si el navegador lo acepta.
    const isText = /^(text\/|application\/json|image\/svg)/.test(type);
    if (isText && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
      const packed = await gzip(body);
      return res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }).end(packed);
    }
    res.writeHead(200, headers).end(body);
  } catch {
    notFound(res);
  }
};

/** `countdownSeconds` y `rejoinGraceMs` se pueden acortar en las pruebas. */
export const createGameServer = ({
  countdownSeconds = COUNTDOWN_SECONDS, rejoinGraceMs = REJOIN_GRACE_MS, lobbyGraceMs = LOBBY_GRACE_MS, pickRoles = undefined,
} = {}) => {
  const httpServer = createServer(serveFile);
  const io = new Server(httpServer);
  const store = new RoomStore({ countdownSeconds, rejoinGraceMs, lobbyGraceMs, pickRoles });

  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket, store);
    registerLobbyHandlers(io, socket, store);
    registerChatHandlers(io, socket, store);
    registerGameHandlers(io, socket, store);
  });

  const listen = (port) =>
    new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, () => {
        const address = httpServer.address();
        resolve(typeof address === 'object' && address ? address.port : port);
      });
    });

  const close = () => new Promise((resolve) => io.close(() => resolve()));

  return { io, store, listen, close };
};

const localNetworkUrls = (port) =>
  Object.values(networkInterfaces())
    .flat()
    .filter((net) => net?.family === 'IPv4' && !net.internal)
    .map((net) => `http://${net.address}:${port}`);

const start = async () => {
  const port = Number(process.env.PORT ?? 3000);
  try {
    await createGameServer().listen(port);
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n  El puerto ${port} ya está en uso: ¿tienes otro "npm run dev" abierto? Ciérralo con Ctrl+C.\n`);
      process.exit(1);
    }
    throw error;
  }

  console.log('\n  Ad Astra listo');
  console.log(`  En esta computadora:  http://localhost:${port}`);
  for (const url of localNetworkUrls(port)) console.log(`  En tu red (WiFi):     ${url}`);
  console.log('');
};

// Arranca solo si ejecutas este archivo (la prueba lo importa sin arrancarlo).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
