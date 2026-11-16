/**
 * PRUEBA CON JUGADORES SIMULADOS
 * Levanta un servidor de prueba (cuenta regresiva de 1 s) y conecta varios clientes.
 * Uso: npm test   (no necesitas tener "npm run dev" abierto)
 */
import { io as connect } from 'socket.io-client';
import { getMission } from '../js/missions.js';
import { EVENTS, LOBBY_MAP, MAX_PLAYERS, ROLES } from '../js/shared.js';
import { BRIEFINGS, PROLOGUE } from '../js/story.js';
import { MINIGAMES, isTaskDone, stageTasks, taskProgress } from '../js/tasks.js';
import { drawRoles } from '../server/rooms.js';
import { createGameServer } from '../server/server.js';

const TIMEOUT_MS = 3_000;
let failures = 0;

const check = (label, passed) => {
  console.log(`${passed ? '  ✔' : '  ✘'} ${label}`);
  if (!passed) failures++;
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera a que un cliente reciba un evento (que cumpla `matches`). */
const waitFor = (client, event, matches = (_payload) => true) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no llegó "${event}"`)), TIMEOUT_MS);
    const listener = (payload) => {
      if (!matches(payload)) return;
      clearTimeout(timer);
      client.off(event, listener);
      resolve(payload);
    };
    client.on(event, listener);
  });

/**
 * Manda una acción de la partida y espera la respuesta: `{ state }` si se aceptó, `{ error }` si no.
 * `accept` descarta estados viejos que todavía venían en camino (de la acción de otro jugador).
 */
const act = (client, action, accept = (_state) => true) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`sin respuesta a "${action.type}"`)), TIMEOUT_MS);
    const finish = (result) => {
      clearTimeout(timer);
      client.off(EVENTS.STATE_SYNC, onState);
      client.off(EVENTS.STATE_REJECTED, onRejected);
      resolve(result);
    };
    const onState = (state) => accept(state) && finish({ state });
    const onRejected = ({ message }) => finish({ error: message });
    client.on(EVENTS.STATE_SYNC, onState);
    client.on(EVENTS.STATE_REJECTED, onRejected);
    client.emit(EVENTS.STATE_ACTION, action);
  });

/** El anfitrión pasa todas las páginas que quedan de la historia actual; devuelve el estado final. */
const readToEnd = async (hostClient, scene) => {
  let result;
  do result = await act(hostClient, { type: 'story:next' });
  while (result.state?.data.scene === scene);
  return result.state;
};

const run = async () => {
  // En la partida real los roles se sortean; aquí van en orden de llegada para saber quién es quién:
  // el primero Vuelo, luego Comercio, Ingeniería y Ciencia.
  const fixedOrder = ['pilot', 'merchant', 'engineer', 'scientist'];
  const server = createGameServer({ countdownSeconds: 1, rejoinGraceMs: 400, lobbyGraceMs: 300, pickRoles: (crew) => crew.map((_p, i) => fixedOrder[i] ?? null) });
  const port = await server.listen(0);
  const url = `http://localhost:${port}`;
  console.log(`Servidor de prueba en ${url}\n`);

  const clientIds = new Map(); // cliente → identificador de su "navegador" (para bloquear)
  const seats = new Map(); //     cliente → { id, seatToken } que le dio el servidor al entrar
  const connectClient = (clientId) =>
    new Promise((resolve, reject) => {
      const client = connect(url, { transports: ['websocket'], forceNew: true });
      clientIds.set(client, clientId);
      client.once('connect', () => resolve(client));
      client.once('connect_error', reject);
    });
  const remember = (client, result) => {
    if (result.ok) seats.set(client, { id: result.data.me.id, seatToken: result.data.seatToken });
    return result;
  };
  const join = async (client, code, name, extra = {}) =>
    remember(client, await client.emitWithAck(EVENTS.ROOM_JOIN, { code, playerName: name, clientId: clientIds.get(client), ...extra }));
  const idOf = (client) => seats.get(client).id;

  let [host, p2, p3, p4, p5] = await Promise.all(['c1', 'c2', 'c3', 'c4', 'c5'].map(connectClient));
  const room = () => server.store.get(code);
  const players = () => [...(room()?.players.values() ?? [])];
  const seatOf = (client) => room()?.players.get(idOf(client));

  console.log('1) Crear sala y unir jugadores');
  const created = remember(host, await host.emitWithAck(EVENTS.ROOM_CREATE, { playerName: 'Jugador 1', clientId: 'c1', color: 'blue' }));
  if (!created.ok) throw new Error(`no se pudo crear la sala: ${created.message}`);
  const code = created.data.room.code;
  check(`sala creada con código de 4 letras (${code})`, /^[A-Z]{4}$/.test(code));
  check('el anfitrión recibe el color que prefería', created.data.me.color === 'blue');

  for (const [index, client] of [p2, p3, p4].entries()) {
    check(`Jugador ${index + 2} entra`, (await join(client, code, `Jugador ${index + 2}`)).ok);
  }
  const fifth = await join(p5, code.toLowerCase(), 'Jugador 5');
  check(`Jugador 5 rechazado con "sala llena" (${fifth.ok ? 'aceptado' : fifth.message})`, !fifth.ok && fifth.error === 'ROOM_FULL');
  check(`la sala tiene ${MAX_PLAYERS} jugadores`, players().length === MAX_PLAYERS);
  check('cada jugador tiene un color distinto', new Set(players().map((p) => p.color)).size === MAX_PLAYERS);
  check('todos aparecen dentro de la nave', players().every((p) => p.x > LOBBY_MAP.floor.x && p.y > LOBBY_MAP.floor.y));
  check('nadie ve datos privados de otro (navegador, conexión, llave del lugar)',
    created.data.room.players.every((p) => !('clientId' in p) && !('seatToken' in p) && !('socketId' in p)));

  console.log('\n2) Chat');
  const arrivals = [host, p3, p4].map((c) => waitFor(c, EVENTS.CHAT_MESSAGE, (m) => m.text === 'hola'));
  p2.emit(EVENTS.CHAT_SEND, 'hola');
  const received = await Promise.all(arrivals);
  check('todos reciben el mensaje con el color del autor', received.every((m) => m.color === players()[1].color));

  console.log('\n3) Moverse y personalizarse');
  const moved = waitFor(host, EVENTS.PLAYER_MOVED, (m) => m.id === idOf(p2));
  p2.emit(EVENTS.PLAYER_MOVE, { x: 9999, y: 300, facing: -1, moving: true });
  const move = await moved;
  check('los demás ven el movimiento', move.facing === -1 && move.moving);
  check('el servidor no deja salir de la nave', move.x <= LOBBY_MAP.floor.x + LOBBY_MAP.floor.w);

  p2.emit(EVENTS.PLAYER_CUSTOMIZE, { color: 'blue', hat: 'crown' });
  const afterTaken = await waitFor(host, EVENTS.ROOM_UPDATE);
  const p2Now = afterTaken.players.find((p) => p.id === idOf(p2));
  check('no puede tomar un color ocupado, pero sí cambiar de sombrero', p2Now.color !== 'blue' && p2Now.hat === 'crown');
  p2.emit(EVENTS.PLAYER_CUSTOMIZE, { color: 'white' });
  const afterFree = await waitFor(host, EVENTS.ROOM_UPDATE);
  check('sí puede tomar un color libre', afterFree.players.find((p) => p.id === idOf(p2)).color === 'white');

  console.log('\n4) Permisos del anfitrión');
  p2.emit(EVENTS.ROOM_SET_SETTING, { key: 'playerSpeed', value: 2 });
  p2.emit(EVENTS.ROOM_SET_PRIVACY, true);
  await pause(100);
  check('un invitado no puede cambiar reglas ni privacidad', room().settings.playerSpeed === 1 && !room().isPublic);
  host.emit(EVENTS.ROOM_SET_SETTING, { key: 'playerSpeed', value: 1.6 });
  host.emit(EVENTS.ROOM_SET_PRIVACY, true);
  await pause(100);
  check('el anfitrión sí (y el valor se ajusta al paso: 1.6 → 1.5)', room().settings.playerSpeed === 1.5 && room().isPublic);
  check('la sala no aparece en la lista pública cuando está llena', (await p5.emitWithAck(EVENTS.ROOMS_LIST)).length === 0);

  console.log('\n5) Roles al azar y Listo');
  check('en el lobby nadie tiene rol: se sortean al despegar', players().every((p) => p.role === null));
  p2.emit(EVENTS.PLAYER_SET_READY, true);
  await pause(100);
  check('se marca Listo sin elegir rol', seatOf(p2).ready === true);
  p2.emit(EVENTS.PLAYER_SET_READY, false);
  await pause(100);
  check('y se puede desmarcar', seatOf(p2).ready === false);
  p2.emit('player:setRole', 'pilot');
  await pause(100);
  check('ya no se puede elegir rol a mano', seatOf(p2).role === null);
  const draws = Array.from({ length: 300 }, () => drawRoles([{}, {}, {}, {}]));
  check('el sorteo da a cada uno un rol distinto, siempre', draws.every((d) => new Set(d).size === ROLES.length && d.every((r) => ROLES.some((x) => x.id === r))));
  check('y es al azar: a cada rol le toca ser el primero alguna vez',
    ROLES.every((role) => draws.filter((d) => d[0] === role.id).length > 30));
  const pair = drawRoles([{}, {}]);
  check('con dos jugadores se sortean dos roles y los otros quedan libres', pair.length === 2 && new Set(pair).size === 2);
  p2.emit(EVENTS.PLAYER_SET_READY, true);
  await pause(100);
  // Un corte breve en el lobby (el túnel o el WiFi) no le quita el lugar ni el Listo.
  const p2Seat = seats.get(p2);
  const p2Away = waitFor(host, EVENTS.PLAYER_LEFT, (n) => n.reason === 'away');
  p2.disconnect();
  await p2Away;
  check('si se corta la conexión en el lobby, el lugar y el Listo quedan guardados un rato', seatOf(p2)?.connected === false && seatOf(p2)?.ready === true);
  p2 = await connectClient('c2');
  const p2Back = await join(p2, code, 'Jugador 2', { seatToken: p2Seat.seatToken });
  check('al volver, recupera su lugar y sigue Listo', p2Back.ok && p2Back.data.me.id === p2Seat.id && p2Back.data.me.ready === true && players().length === MAX_PLAYERS);

  console.log('\n6) Cuenta regresiva');
  host.emit(EVENTS.GAME_START);
  await pause(100);
  check('no se despega si falta alguien por marcar Listo', room().phase === 'lobby');
  [p2, p3, p4].forEach((c) => c.emit(EVENTS.PLAYER_SET_READY, true));
  await pause(100);
  p2.emit(EVENTS.GAME_START);
  await pause(100);
  check('un invitado no puede iniciar', room().phase === 'lobby');
  const tick = waitFor(p3, EVENTS.COUNTDOWN, (c) => c.seconds === 1);
  host.emit(EVENTS.GAME_START);
  await tick;
  const cancelled = waitFor(host, EVENTS.COUNTDOWN, (c) => c.cancelled);
  p4.disconnect();
  check(`si alguien pierde la conexión, se cancela ("${(await cancelled).cancelled}")`, room().phase === 'lobby');
  await pause(450);
  check('si no vuelve a tiempo, su lugar queda libre', players().length === 3);
  check('la sala con lugar libre aparece en la lista pública', (await p5.emitWithAck(EVENTS.ROOMS_LIST)).some((r) => r.code === code));

  check('el Jugador 5 entra al lugar libre', (await join(p5, code, 'Jugador 5')).ok);
  host.emit(EVENTS.GAME_START);
  await pause(100);
  check('no se despega si el que acaba de entrar no marcó Listo', room().phase === 'lobby');
  p5.emit(EVENTS.PLAYER_SET_READY, true);
  await pause(100);
  const playing = waitFor(p3, EVENTS.ROOM_UPDATE, (r) => r.phase === 'playing');
  const firstState = waitFor(p3, EVENTS.STATE_SYNC, (s) => s.version === 0);
  host.emit(EVENTS.GAME_START);
  await playing;
  check('con todos listos, la misión comienza', room().phase === 'playing');
  check('al despegar, a cada tripulante le toca un rol distinto', new Set(players().map((p) => p.role)).size === ROLES.length && players().every((p) => p.role));
  const initial = await firstState;
  check('la partida arranca en el prólogo, sin misión elegida',
    initial.data.scene === 'prologue' && initial.data.page === 0 && initial.data.missionId === null);
  check('lo que solo sabe el servidor no se envía', !('secret' in initial) && Number.isInteger(room().state.secret.seed));

  console.log('\n7) Historia y constelación');
  // Se ignora el estado inicial que puede llegar tarde a la conexión nueva de p2.
  const skip = await act(p2, { type: 'story:next' }, (st) => st.version > 0);
  check(`un invitado no puede pasar la página ("${skip.error}")`, Boolean(skip.error) && room().state.data.page === 0);
  const read = await act(p2, { type: 'story:read' }, (st) => Boolean(st.data.read[idOf(p2)]));
  check('cada quien avisa "Ya leí" y lo ven todos', read.state?.data.read[idOf(p2)] === true);
  check('avisar dos veces no cuenta doble', Boolean((await act(p2, { type: 'story:read' })).error));
  const pageTwo = await act(host, { type: 'story:next' });
  check('el anfitrión pasa la página y los "Ya leí" se reinician',
    pageTwo.state?.data.page === 1 && Object.keys(pageTwo.state.data.read).length === 0);
  check('también puede volver a la página anterior', (await act(host, { type: 'story:back' })).state?.data.page === 0);
  check('en el prólogo todavía no se puede tocar la misión', Boolean((await act(host, { type: 'role:confirm', role: 'pilot', value: true })).error));
  const afterPrologue = await readToEnd(host, 'prologue');
  check(`al terminar las ${PROLOGUE.pages.length} páginas del prólogo se abre la constelación`,
    afterPrologue.data.scene === 'select' && afterPrologue.data.campaign.prologueSeen === true);
  check('por ahora las tres misiones están desbloqueadas',
    ['moon', 'mars', 'exodus'].every((id) => afterPrologue.data.campaign.missions[id] === 'available'));
  const noSuch = await act(host, { type: 'mission:start', missionId: 'venus' });
  check(`una misión que no existe no se puede iniciar ("${noSuch.error}")`, Boolean(noSuch.error) && room().state.data.scene === 'select');
  check('un invitado no puede iniciar la misión', Boolean((await act(p2, { type: 'mission:start', missionId: 'moon' })).error));
  const briefing = await act(host, { type: 'mission:start', missionId: 'moon' });
  check('el anfitrión inicia Dark Side of the Moon: empieza el informe y la misión queda "en curso"',
    briefing.state?.data.scene === 'briefing' && briefing.state.data.campaign.missions.moon === 'in_progress');
  const atDesk = await readToEnd(host, 'briefing');
  check(`después de las ${BRIEFINGS.moon.pages.length} páginas del informe empieza la mesa de misión en la etapa 1`,
    atDesk.data.scene === 'mission' && atDesk.data.missionId === 'moon' && atDesk.data.stageIndex === 0);

  console.log('\n7b) Durante la misión: cada rol hace lo suyo, con las manos');
  const base = room().state.version;
  const crew = [[host, 'pilot'], [p2, 'merchant'], [p3, 'engineer'], [p5, 'scientist']];
  const refused = waitFor(p2, EVENTS.STATE_REJECTED);
  p2.emit(EVENTS.STATE_ACTION, { type: 'task:done', id: 'briefing.window' });
  check(`nadie puede hacer la tarea de otro rol ("${(await refused).message}")`, room().state.version === base);
  const early = waitFor(host, EVENTS.STATE_REJECTED);
  host.emit(EVENTS.STATE_ACTION, { type: 'stage:advance' });
  check(`la palanca de etapa no baja con tareas pendientes ("${(await early).message}")`, room().state.data.stageIndex === 0);
  const unknown = waitFor(p2, EVENTS.STATE_REJECTED);
  p2.emit(EVENTS.STATE_ACTION, { type: 'set', key: 'stageIndex', value: 8 });
  await unknown;
  check('una acción inventada se rechaza', room().state.version === base);
  check('el "visto bueno" con un clic ya no existe', Boolean((await act(p2, { type: 'role:confirm', role: 'merchant', value: true })).error) && room().state.version === base);

  // Cuatro tripulantes trabajando a la vez: tres terminan su minijuego y Comercio levanta la ficha.
  const states = crew.map(([c]) => waitFor(c, EVENTS.STATE_SYNC, (s) => s.version === base + 4));
  host.emit(EVENTS.STATE_ACTION, { type: 'task:done', id: 'briefing.window' });
  p3.emit(EVENTS.STATE_ACTION, { type: 'task:done', id: 'briefing.power' });
  p5.emit(EVENTS.STATE_ACTION, { type: 'task:done', id: 'briefing.scope' });
  p2.emit(EVENTS.STATE_ACTION, { type: 'carry:pick', id: 'briefing.budget' });
  check('4 tripulantes trabajando al mismo tiempo → todos ven las 3 tareas hechas y a Comercio con la ficha en las manos',
    (await Promise.all(states)).every((s) => ['briefing.window', 'briefing.power', 'briefing.scope'].every((id) => s.data.tasks[id]?.done)
      && s.data.carrying[idOf(p2)]?.item === 'chip' && s.data.confirmed.pilot && !s.data.confirmed.merchant));
  check('el telescopio deja una ventaja real para el vuelo', room().state.data.perks.zone === true);
  check('con las manos ocupadas no se levanta otra cosa', Boolean((await act(p2, { type: 'carry:pick', id: 'briefing.budget' })).error));
  const fundsBefore = room().state.data.economy.credits;
  const delivered = await act(p2, { type: 'carry:drop', id: 'briefing.budget' }, (s) => Boolean(s.data.tasks['briefing.budget']?.done));
  check('al entregar la ficha la tarea queda hecha, suma el adelanto y los 4 roles quedan listos',
    delivered.state?.data.economy.credits === fundsBefore + 300 && ROLES.every((r) => delivered.state.data.confirmed[r.id]) && !delivered.state.data.carrying[idOf(p2)]);

  const walked = waitFor(host, EVENTS.PLAYER_MOVED, (m) => m.id === idOf(p2));
  p2.emit(EVENTS.PLAYER_MOVE, { x: 300, y: 800, facing: 1, moving: true, map: 'station', act: 'busy' });
  const step = await walked;
  check('en la misión todos ven caminar a los demás por la estación, y qué están haciendo', step.map === 'station' && step.x === 300 && step.y === 800 && step.act === 'busy');
  p2.emit(EVENTS.PLAYER_MOVE, { x: 900, y: 500, facing: 1, moving: true, map: 'moon' });
  await pause(80);
  check('un paso que venía de otro mapa se ignora', seatOf(p2).x === 300 && seatOf(p2).map === 'station');

  const advanced = waitFor(p5, EVENTS.STATE_SYNC, (s) => s.data.stageIndex === 1);
  p3.emit(EVENTS.STATE_ACTION, { type: 'stage:advance' });
  const stageTwo = await advanced;
  check(`con las tareas hechas, cualquiera baja la palanca: empieza "${getMission('moon').stages[1].name}" con tareas nuevas`,
    ROLES.every((r) => stageTwo.data.confirmed[r.id] === false));

  console.log('\n8) Reconexión en plena misión');
  const away = waitFor(host, EVENTS.PLAYER_LEFT, (n) => n.reason === 'away');
  p3.disconnect();
  await away;
  check('si alguien pierde la conexión, su lugar y su rol quedan guardados',
    players().length === 4 && seatOf(p3).connected === false && seatOf(p3).role === 'engineer');
  const covered = waitFor(host, EVENTS.STATE_SYNC, (s) => s.data.confirmed.engineer);
  p2.emit(EVENTS.STATE_ACTION, { type: 'task:done', id: 'planning.crane' });
  await covered;
  check('mientras tanto, otro tripulante puede cubrir ese rol (hace su tarea)', room().state.data.tasks['planning.crane']?.by === 'Jugador 2');

  const late = await connectClient('c6');
  const lateJoin = await join(late, code, 'Tarde');
  check('nadie nuevo entra con la misión en curso', !lateJoin.ok && lateJoin.error === 'GAME_IN_PROGRESS');

  const p3Seat = seats.get(p3);
  const p3Back = await connectClient('otro-navegador');
  const back = waitFor(host, EVENTS.PLAYER_JOINED, (p) => p.rejoined);
  const rejoin = await join(p3Back, code, 'Jugador 3', { seatToken: p3Seat.seatToken });
  await back;
  check('quien vuelve con su llave recupera su lugar, su rol y el estado de la misión',
    rejoin.ok && rejoin.data.me.id === p3Seat.id && rejoin.data.me.role === 'engineer' && rejoin.data.state.data.stageIndex === 1);
  const stolen = waitFor(p2, EVENTS.STATE_REJECTED);
  p2.emit(EVENTS.STATE_ACTION, { type: 'build:addStage' });
  await stolen;
  check('y su rol vuelve a ser solo suyo', room().state.data.rocket.stages.length === 1);

  const p5Away = waitFor(host, EVENTS.PLAYER_LEFT, (n) => n.reason === 'away');
  p5.disconnect();
  await p5Away;
  const p5Back = await connectClient('c5');
  const sameBrowser = await join(p5Back, code, 'Jugador 5');
  check('también se recupera el lugar entrando desde el mismo navegador', sameBrowser.ok && sameBrowser.data.me.id === idOf(p5));

  const hostSeat = seats.get(host);
  const standIn = waitFor(p2, EVENTS.ROOM_UPDATE, (r) => r.hostId !== hostSeat.id);
  host.disconnect();
  check('si el anfitrión pierde la conexión, otro tripulante conectado lo reemplaza', (await standIn).hostId === idOf(p2));
  host = await connectClient('c1');
  const hostRejoin = await join(host, code, 'Jugador 1', { seatToken: hostSeat.seatToken });
  check('y al volver recupera el puesto de anfitrión', hostRejoin.ok && hostRejoin.data.room.hostId === hostSeat.id);

  console.log('\n8b) Mercado: el dinero es de todos y lo maneja Comercio');
  const economy = () => room().state.data.economy;
  check('la misión abre con su presupuesto (más el adelanto que negoció Comercio)', economy().credits === getMission('moon').budget + 300 && economy().inventory.length === 0);
  /** Cada tripulante hace las tareas de su rol en la etapa (lo mismo que manda el navegador al terminarlas). */
  const doTasks = async (stageId) => {
    const byRole = { pilot: host, merchant: p2, engineer: p3Back, scientist: p5Back };
    for (const task of stageTasks(stageId)) {
      if (isTaskDone(room().state.data, task)) continue;
      const client = byRole[task.role];
      if (task.kind === 'carry') {
        for (let done = taskProgress(room().state.data, task); done < task.count; done++) {
          await act(client, { type: 'carry:pick', id: task.id }, (s) => Boolean(s.data.carrying[idOf(client)]));
          await act(client, { type: 'carry:drop', id: task.id }, (s) => !s.data.carrying[idOf(client)]);
        }
      } else if (MINIGAMES.includes(task.kind) && !task.send) {
        await act(client, { type: 'task:done', id: task.id }, (s) => Boolean(s.data.tasks[task.id]?.done));
      }
    }
  };
  const closed = await act(p2, { type: 'market:buy', offerId: 'capsule:common' });
  check(`antes de la etapa Mercado no se compra ("${closed.error}")`, Boolean(closed.error));
  await doTasks('planning');
  check('cargar entre varios cuenta de a una: las 3 cajas quedaron en la báscula', room().state.data.tasks['planning.stock']?.progress === 3);
  const atMarket = await act(host, { type: 'stage:advance' }, (s) => s.data.stageIndex === 2);
  check('con las tareas de los 4 roles hechas, la palanca abre la etapa Mercado', getMission('moon').stages[atMarket.state?.data.stageIndex]?.id === 'market');
  const notHis = await act(p2, { type: 'task:done', id: 'market.bench' });
  check(`cada tarea es de su rol ("${notHis.error}")`, Boolean(notHis.error));
  const notMerchant = await act(p3Back, { type: 'market:buy', offerId: 'capsule:common' });
  check(`Ingeniería no puede comprar ("${notMerchant.error}")`, Boolean(notMerchant.error) && economy().inventory.length === 0);
  const request = await act(p3Back, { type: 'market:request', offerId: 'capsule:common' }, (s) => 'capsule:common' in s.data.economy.requests);
  check('pero sí puede pedirle una pieza a Comercio', request.state?.data.economy.requests['capsule:common']?.[0].role === 'engineer');
  const capsulePrice = economy().offers.find((o) => o.id === 'capsule:common').price;
  const funds = economy().credits;
  const seenByAll = [host, p3Back, p5Back].map((c) => waitFor(c, EVENTS.STATE_SYNC, (s) => s.data.economy.inventory.length === 2));
  p2.emit(EVENTS.STATE_ACTION, { type: 'market:buy', offerId: 'capsule:common', quantity: 2 });
  const afterBuy = await Promise.all(seenByAll);
  check('Comercio compra y todos ven el mismo dinero y la misma bodega',
    afterBuy.every((s) => s.data.economy.credits === funds - 2 * capsulePrice && s.data.economy.inventory.length === 2));
  check('comprar cumple la tarea de Comercio en el Mercado (se hace en su terminal)', room().state.data.confirmed.merchant === true);
  check('lo que solo sabe el servidor (la verdad del mercado negro) no viaja',
    afterBuy.every((s) => !('secret' in s) && !JSON.stringify(s).includes('delivers') && !JSON.stringify(s).includes('"truth"'))
    && Object.keys(room().state.secret.vault.truth).length === economy().black.length);

  // Dos compras a la vez que no caben las dos en el presupuesto: solo una entra.
  const big = economy().offers.find((o) => o.id === 'engine-atm-l:uncommon');
  const quantity = Math.floor(economy().credits / big.price / 2) + 1;
  const creditsBefore = economy().credits;
  const settled = waitFor(p2, EVENTS.STATE_REJECTED);
  p2.emit(EVENTS.STATE_ACTION, { type: 'market:buy', offerId: big.id, quantity });
  p2.emit(EVENTS.STATE_ACTION, { type: 'market:buy', offerId: big.id, quantity });
  await settled;
  check(`dos compras simultáneas de ${quantity} motores: entra una, la otra se rechaza, y el dinero no queda negativo`,
    economy().credits === creditsBefore - quantity * big.price && economy().credits >= 0 && economy().inventory.length === 2 + quantity);
  const shady = economy().black[0];
  const inspected = await act(p2, { type: 'black:inspect', offerId: shady.id, level: 'basic' }, (s) => Boolean(s.data.economy.black[0].inspection));
  check('una inspección del mercado negro la ve todo el equipo', inspected.state?.data.economy.black[0].inspection?.level === 'basic');
  const toReturn = economy().inventory[0];
  const creditsBeforeReturn = economy().credits;
  await act(p2, { type: 'market:sell', uid: toReturn.uid }, (s) => !s.data.economy.inventory.some((i) => i.uid === toReturn.uid));
  check('devolver una pieza recupera parte del dinero', economy().credits === creditsBeforeReturn + Math.round(toReturn.paid * 0.6));

  console.log('\n9) Expulsar, bloquear y sucesión');
  const backToLobby = waitFor(p2, EVENTS.ROOM_UPDATE, (r) => r.phase === 'lobby');
  host.emit(EVENTS.GAME_END);
  const lobbyAgain = await backToLobby;
  check('al volver al lobby los roles se borran (se sortean otra vez) y todos vuelven a marcar Listo',
    lobbyAgain.players.length === 4 && lobbyAgain.players.every((p) => !p.role && !p.ready));
  const kicked = waitFor(p2, EVENTS.KICKED);
  const kickNotice = waitFor(host, EVENTS.PLAYER_LEFT, (n) => n.reason === 'kicked');
  host.emit(EVENTS.ROOM_KICK, { playerId: idOf(p2), ban: false });
  check('expulsar: el jugador recibe el aviso', (await kicked).banned === false);
  await kickNotice;
  check('y puede volver a entrar con el código', (await join(p2, code, 'Jugador 2')).ok);
  host.emit(EVENTS.ROOM_KICK, { playerId: idOf(p2), ban: true });
  await waitFor(p2, EVENTS.KICKED);
  const bannedJoin = await join(p2, code, 'Jugador 2');
  check('bloquear: ya no puede volver', !bannedJoin.ok && bannedJoin.error === 'BANNED');

  const newHost = waitFor(p3Back, EVENTS.ROOM_UPDATE, (r) => r.hostId === p3Seat.id);
  host.disconnect();
  await newHost;
  check('si el anfitrión se va, el rol pasa al que lleva más tiempo', room().hostId === p3Seat.id);

  console.log('\n10) Modo demo: una sola persona');
  const solo = await connectClient('c7');
  const soloRoom = remember(solo, await solo.emitWithAck(EVENTS.ROOM_CREATE, { playerName: 'Sola', clientId: 'c7' }));
  const soloCode = soloRoom.data.room.code;
  const soloPlaying = waitFor(solo, EVENTS.STATE_SYNC, (s) => s.version === 0);
  solo.emit(EVENTS.GAME_START);
  await soloPlaying;
  check('una persona puede despegar sola, y le toca un rol', server.store.get(soloCode).phase === 'playing' && [...server.store.get(soloCode).players.values()][0].role === 'pilot');
  await readToEnd(solo, 'prologue');
  await act(solo, { type: 'mission:start', missionId: 'moon' });
  await readToEnd(solo, 'briefing');
  check('sola, tampoco baja la palanca sin hacer la tarea de su rol', Boolean((await act(solo, { type: 'stage:advance' })).error));
  const freeRole = await act(solo, { type: 'task:done', id: 'briefing.power' }, (s) => Boolean(s.data.tasks['briefing.power']?.done));
  check('las tareas de los roles sin dueño las puede hacer quien esté', freeRole.state?.data.confirmed.engineer === true);
  await act(solo, { type: 'task:done', id: 'briefing.window' }, (s) => Boolean(s.data.tasks['briefing.window']?.done));
  const soloDone = await act(solo, { type: 'stage:advance' }, (s) => s.data.stageIndex === 1);
  check('y los puestos libres no la frenan: con su tarea hecha, pasa de etapa', soloDone.state?.data.stageIndex === 1 && server.store.get(soloCode).state.data.stageIndex === 1);

  const soloLobby = waitFor(solo, EVENTS.ROOM_UPDATE, (r) => r.phase === 'lobby');
  solo.emit(EVENTS.GAME_END);
  await soloLobby;
  const relaunch = waitFor(solo, EVENTS.STATE_SYNC, (s) => s.version === 0);
  solo.emit(EVENTS.GAME_START);
  const second = await relaunch;
  check('al despegar otra vez en la misma sala, el prólogo no se repite y la misión sigue "en curso"',
    second.data.scene === 'select' && second.data.campaign.missions.moon === 'in_progress');
  const replay = await act(solo, { type: 'story:replay' });
  check('el anfitrión puede volver a mostrar el prólogo desde la constelación', replay.state?.data.scene === 'prologue');
  const skipped = await act(solo, { type: 'story:skip' });
  check('y saltarlo: vuelve a la constelación', skipped.state?.data.scene === 'select');
  await act(solo, { type: 'story:replay' });

  solo.disconnect();
  await pause(100);
  check('si se queda sin nadie conectado, la sala espera', server.store.get(soloCode)?.players.size === 1);
  const soloBack = await connectClient('c7');
  const soloRejoin = await join(soloBack, soloCode, 'Sola', { seatToken: seats.get(solo).seatToken });
  check('al volver sigue siendo anfitriona y la partida está donde la dejó',
    soloRejoin.ok && soloRejoin.data.room.hostId === soloRejoin.data.me.id && soloRejoin.data.state.data.scene === 'prologue');
  soloBack.disconnect();
  await pause(700);
  check('si nadie vuelve a tiempo, la sala se borra', server.store.get(soloCode) === undefined);

  console.log('\n11) La página se entrega y lo privado no');
  const page = await fetch(`${url}/`);
  const sprite = await fetch(`${url}/assets/sprites/astronaut.png`);
  const serverCode = await fetch(`${url}/server/rooms.js`);
  const sneaky = await fetch(`${url}/js/..%2fpackage.json`);
  check('index.html y assets/ se entregan', page.ok && sprite.ok);
  check('server/ y package.json no se entregan', serverCode.status === 404 && sneaky.status === 404);

  [p2, p3Back, p5Back, late].forEach((c) => c.disconnect());
  await server.close();
};

run()
  .catch((error) => {
    console.error('\n  ✘ la prueba falló:', error.message);
    failures++;
  })
  .finally(() => {
    console.log(failures === 0 ? '\nTODO OK ✅' : `\n${failures} verificación(es) fallaron ❌`);
    process.exit(failures === 0 ? 0 : 1);
  });
