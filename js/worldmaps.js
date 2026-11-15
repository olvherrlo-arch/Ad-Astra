/**
 * MAPAS DEL MUNDO (datos compartidos navegador/servidor)
 * Durante la misión los tripulantes caminan por un mundo 2D compartido. Hay tres mapas:
 *   station  la estación, antes de despegar: laboratorio, sala de misión, simulador, almacén y hangar
 *   ship     el interior de la nave, en vuelo: motores, bodega, ciencia y cabina
 *   moon     la superficie del lado oculto de la Luna
 *
 * Medidas en "unidades de mundo" (como LOBBY_MAP). Un mapa:
 *   rooms     cuartos (rectángulo completo; el piso empieza `wall` más abajo, salvo `plain`)
 *   doors     pasos entre cuartos (rectángulos caminables que se enciman con los pisos)
 *   stations  puestos de trabajo: x, y, w, h = huella en el piso (bloquea el paso salvo `flat`),
 *             height = alto dibujado, kind = cómo se dibuja (js/worldart.js), room = en qué cuarto está
 *   walk      (calculado) rectángulos caminables      blocks  (calculado) huellas que bloquean
 *
 * Qué se hace en cada puesto lo dicen js/tasks.js (tareas) y js/world.js (interacciones).
 */
import { getMission } from './missions.js';

export const PLAYER_RADIUS = 16;
/** Qué tan cerca hay que estar de la huella de un puesto para usarlo. */
export const REACH = 54;
export const WORLD_SPEED = 190; // unidades por segundo
export const CARRY_SPEED = 0.8; //  cargando algo se camina un poco más lento
export const PRISM_SPEED = 0.55; // el Prisma pesa

const WALL = 64;

const finish = (map) => {
  const floors = map.rooms.map((room) => (room.plain
    ? { x: room.x, y: room.y, w: room.w, h: room.h }
    : { x: room.x, y: room.y + map.wall, w: room.w, h: room.h - map.wall }));
  map.walk = [...floors, ...map.doors];
  map.floors = floors;
  // Qué pisos une cada puerta, y el punto de paso de cada lado (el centro de donde se enciman).
  const overlap = (a, b) => {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
    return w > 0 && h > 0 ? { x: x + w / 2, y: y + h / 2 } : null;
  };
  map.links = map.doors.map((door) => floors
    .map((floor, index) => ({ floor: index, at: overlap(door, floor) }))
    .filter((side) => side.at));
  map.blocks = [...map.stations.filter((station) => !station.flat), ...(map.rocks ?? [])];
  return map;
};

const STATION = finish({
  id: 'station', name: 'Estación Ad Astra', width: 1680, height: 1080, wall: WALL,
  rooms: [
    { id: 'lab', name: 'Laboratorio', role: 'scientist', x: 40, y: 40, w: 500, h: 400 },
    { id: 'bridge', name: 'Sala de misión', role: null, x: 560, y: 40, w: 560, h: 400 },
    { id: 'sim', name: 'Simulador', role: 'pilot', x: 1140, y: 40, w: 500, h: 400 },
    { id: 'hall', name: '', role: null, x: 40, y: 460, w: 1600, h: 130, plain: true },
    { id: 'store', name: 'Almacén', role: 'merchant', x: 40, y: 610, w: 520, h: 430 },
    { id: 'hangar', name: 'Hangar', role: 'engineer', x: 580, y: 610, w: 1060, h: 430 },
  ],
  doors: [
    { x: 250, y: 400, w: 80, h: 100 }, //   laboratorio ↔ pasillo
    { x: 800, y: 400, w: 80, h: 100 }, //   sala de misión ↔ pasillo
    { x: 1350, y: 400, w: 80, h: 100 }, //  simulador ↔ pasillo
    { x: 260, y: 550, w: 80, h: 150 }, //   pasillo ↔ almacén
    { x: 1060, y: 550, w: 100, h: 150 }, // pasillo ↔ hangar
  ],
  spawn: { x: 840, y: 340 },
  stations: [
    // Laboratorio (Ciencia)
    { id: 'telescope', room: 'lab', kind: 'telescope', label: 'Telescopio', x: 70, y: 112, w: 96, h: 30, height: 104 },
    { id: 'sampleLocker', room: 'lab', kind: 'locker', label: 'Muestras', x: 210, y: 112, w: 84, h: 28, height: 96 },
    { id: 'analyzer', room: 'lab', kind: 'machine', label: 'Analizador', x: 350, y: 112, w: 120, h: 32, height: 92 },
    { id: 'bench', room: 'lab', kind: 'bench', label: 'Banco de calibración', x: 90, y: 300, w: 140, h: 34, height: 44 },
    // Sala de misión
    { id: 'board', room: 'bridge', kind: 'board', label: 'Tablero de misión', x: 740, y: 110, w: 200, h: 14, height: 86 },
    { id: 'lever', room: 'bridge', kind: 'lever', label: 'Palanca de etapa', x: 1010, y: 112, w: 56, h: 28, height: 70 },
    { id: 'holo', room: 'bridge', kind: 'holo', label: '', x: 770, y: 250, w: 140, h: 46, height: 34, decor: true },
    // Simulador (Vuelo)
    { id: 'simulator', room: 'sim', kind: 'cockpit', label: 'Simulador', x: 1180, y: 112, w: 150, h: 40, height: 84 },
    { id: 'checklist', room: 'sim', kind: 'switches', label: 'Tablero de cabina', x: 1450, y: 112, w: 110, h: 30, height: 80 },
    { id: 'navtable', room: 'sim', kind: 'table', label: 'Mesa de navegación', x: 1210, y: 300, w: 140, h: 40, height: 40 },
    // Almacén (Comercio)
    { id: 'terminal', room: 'store', kind: 'console', label: 'Terminal de suministros', x: 70, y: 682, w: 120, h: 32, height: 84 },
    { id: 'vault', room: 'store', kind: 'safe', label: 'Caja fuerte', x: 390, y: 682, w: 96, h: 30, height: 92 },
    { id: 'dock', room: 'store', kind: 'crates', label: 'Muelle de carga', x: 70, y: 930, w: 150, h: 44, height: 56 },
    { id: 'scale', room: 'store', kind: 'scale', label: 'Báscula', x: 370, y: 900, w: 130, h: 44, height: 20 },
    // Hangar (Ingeniería)
    { id: 'assembly', room: 'hangar', kind: 'console', label: 'Consola de ensamblaje', x: 620, y: 682, w: 130, h: 32, height: 84 },
    { id: 'powerPanel', room: 'hangar', kind: 'panel', label: 'Tablero eléctrico', x: 800, y: 682, w: 90, h: 26, height: 96 },
    { id: 'crane', room: 'hangar', kind: 'crane', label: 'Grúa', x: 930, y: 682, w: 100, h: 30, height: 110 },
    { id: 'testbench', room: 'hangar', kind: 'engine', label: 'Banco de pruebas', x: 1200, y: 682, w: 120, h: 34, height: 70 },
    { id: 'partsRack', room: 'hangar', kind: 'rack', label: 'Estante de piezas', x: 620, y: 920, w: 150, h: 40, height: 70 },
    { id: 'pump', room: 'hangar', kind: 'pump', label: 'Bomba de combustible', x: 1110, y: 900, w: 70, h: 30, height: 76 },
    { id: 'cargoHatch', room: 'hangar', kind: 'hatch', label: 'Compuerta de carga', x: 1290, y: 850, w: 90, h: 34, height: 36 },
    { id: 'gate', room: 'hangar', kind: 'pad', label: 'Plataforma de lanzamiento', x: 1420, y: 800, w: 180, h: 70, height: 26 },
  ],
});

const SHIP = finish({
  id: 'ship', name: 'A bordo', width: 1400, height: 640, wall: WALL,
  rooms: [
    { id: 'engines', name: 'Motores', role: 'engineer', x: 40, y: 60, w: 330, h: 520 },
    { id: 'cargo', name: 'Bodega', role: 'merchant', x: 390, y: 60, w: 330, h: 520 },
    { id: 'science', name: 'Ciencia', role: 'scientist', x: 740, y: 60, w: 330, h: 520 },
    { id: 'cockpit', name: 'Cabina', role: 'pilot', x: 1090, y: 60, w: 270, h: 520 },
  ],
  doors: [
    { x: 334, y: 320, w: 92, h: 80 },
    { x: 684, y: 320, w: 92, h: 80 },
    { x: 1034, y: 320, w: 92, h: 80 },
  ],
  spawn: { x: 890, y: 350 },
  stations: [
    { id: 'trim', room: 'engines', kind: 'machine', label: 'Ajuste de motores', x: 60, y: 132, w: 110, h: 30, height: 84 },
    { id: 'breaker', room: 'engines', kind: 'panel', label: 'Tablero de energía', x: 220, y: 132, w: 90, h: 26, height: 92 },
    { id: 'engineBay', room: 'engines', kind: 'engine', label: 'Motores y tanques', x: 70, y: 470, w: 150, h: 50, height: 60 },
    { id: 'racks', room: 'cargo', kind: 'rack', label: 'Estantes', x: 410, y: 132, w: 130, h: 34, height: 90 },
    { id: 'spares', room: 'cargo', kind: 'locker', label: 'Pañol de repuestos', x: 590, y: 132, w: 90, h: 28, height: 96 },
    { id: 'loose', room: 'cargo', kind: 'crates', label: 'Carga suelta', x: 420, y: 480, w: 120, h: 44, height: 50 },
    { id: 'startracker', room: 'science', kind: 'telescope', label: 'Rastreador de estrellas', x: 760, y: 132, w: 96, h: 30, height: 104 },
    { id: 'scanner', room: 'science', kind: 'machine', label: 'Espectrómetro', x: 910, y: 132, w: 120, h: 32, height: 92 },
    { id: 'antenna', room: 'science', kind: 'antenna', label: 'Antena', x: 770, y: 480, w: 110, h: 34, height: 80 },
    { id: 'helm', room: 'cockpit', kind: 'cockpit', label: 'Timón', x: 1150, y: 132, w: 160, h: 40, height: 84 },
    { id: 'telemetry', room: 'cockpit', kind: 'console', label: 'Telemetría', x: 1120, y: 480, w: 120, h: 32, height: 80 },
  ],
});

const MOON = finish({
  id: 'moon', name: 'Lado oculto de la Luna', width: 1800, height: 1000, wall: 0, outdoor: true,
  rooms: [{ id: 'surface', name: '', role: null, x: 40, y: 150, w: 1720, h: 810, plain: true }],
  doors: [],
  spawn: { x: 300, y: 580 },
  rocks: [
    { x: 560, y: 300, w: 70, h: 30, height: 40 }, { x: 880, y: 620, w: 90, h: 36, height: 52 },
    { x: 1180, y: 380, w: 60, h: 28, height: 34 }, { x: 1420, y: 760, w: 80, h: 34, height: 46 },
    { x: 1000, y: 220, w: 50, h: 24, height: 28 }, { x: 700, y: 820, w: 70, h: 30, height: 38 },
    { x: 1540, y: 300, w: 70, h: 30, height: 42 },
  ],
  stations: [
    { id: 'hatch', room: 'surface', kind: 'lander', label: 'Módulo lunar', x: 200, y: 440, w: 150, h: 50, height: 150 },
    { id: 'cart', room: 'surface', kind: 'cart', label: 'Carro de instrumentos', x: 430, y: 500, w: 84, h: 30, height: 40 },
    { id: 'solar', room: 'surface', kind: 'solar', label: 'Panel solar de campo', x: 440, y: 700, w: 70, h: 26, height: 30 },
  ],
  /** Zona donde puede estar enterrado el Prisma (lo decide el servidor con la semilla de la partida). */
  prismZone: { x: 660, y: 230, w: 1020, h: 660 },
});

export const MAPS = { station: STATION, ship: SHIP, moon: MOON };

/** En qué mapa está la tripulación según cómo va la partida. */
export const mapIdFor = (data) => {
  const flight = data?.flight;
  if (!flight || flight.phase === 'over') return 'station';
  const leg = getMission(data.missionId)?.flightPlan?.[flight.legIndex];
  return leg?.id === 'surface' ? 'moon' : 'ship';
};

/** ¿Se puede estar parado en este punto? (dentro de un piso y fuera de las huellas que bloquean). */
export const canStand = (map, x, y, extra = []) => {
  const r = PLAYER_RADIUS;
  const inside = map.walk.some((f) => x >= f.x + r && x <= f.x + f.w - r && y >= f.y + 6 && y <= f.y + f.h - 4);
  if (!inside) return false;
  const hit = (b) => x > b.x - r && x < b.x + b.w + r && y > b.y - 4 && y < b.y + b.h + 8;
  return !map.blocks.some(hit) && !extra.some(hit);
};

/**
 * Camino para ir caminando de un punto a otro: una lista de puntos por los que pasar.
 * Dentro de un mismo cuarto es directo; entre cuartos, pasa por las puertas (búsqueda a lo ancho).
 */
export const findPath = (map, from, to) => {
  const floorAt = (p) => {
    const inside = map.floors.findIndex((f) => p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h);
    if (inside >= 0) return inside;
    // En el umbral de una puerta (o fuera de todo): el piso más cercano.
    let best = 0, bestDistance = Infinity;
    map.floors.forEach((f, index) => {
      const dx = Math.max(f.x - p.x, 0, p.x - (f.x + f.w)), dy = Math.max(f.y - p.y, 0, p.y - (f.y + f.h));
      if (Math.hypot(dx, dy) < bestDistance) { bestDistance = Math.hypot(dx, dy); best = index; }
    });
    return best;
  };
  const start = floorAt(from), goal = floorAt(to);
  if (start === goal) return [to];
  const cameFrom = new Map([[start, null]]);
  const queue = [start];
  while (queue.length > 0 && !cameFrom.has(goal)) {
    const floor = queue.shift();
    for (const link of map.links) {
      const here = link.find((side) => side.floor === floor);
      if (!here) continue;
      for (const there of link) {
        if (there.floor === floor || cameFrom.has(there.floor)) continue;
        cameFrom.set(there.floor, { floor, points: [here.at, there.at] });
        queue.push(there.floor);
      }
    }
  }
  if (!cameFrom.has(goal)) return [to];
  const path = [to];
  for (let step = cameFrom.get(goal); step; step = cameFrom.get(step.floor)) path.unshift(...step.points);
  return path;
};

/** Distancia de un punto a la huella de un puesto (0 si está encima). */
export const distanceTo = (station, x, y) => {
  const dx = Math.max(station.x - x, 0, x - (station.x + station.w));
  const dy = Math.max(station.y - y, 0, y - (station.y + station.h));
  return Math.hypot(dx, dy);
};

/** Mantiene un punto dentro del mapa (el servidor lo usa para no aceptar posiciones absurdas). */
export const clampToMap = (map, x, y) => ({
  x: Math.min(map.width - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, x)),
  y: Math.min(map.height - 4, Math.max(6, y)),
});

/** Dónde aparece cada tripulante al entrar a un mapa (en fila, para no encimarse). */
export const spawnFor = (map, index) => ({ x: map.spawn.x + (index - 1.5) * 46, y: map.spawn.y + (index % 2) * 26 });

export const roomOf = (map, stationId) => {
  const station = map.stations.find((s) => s.id === stationId);
  return map.rooms.find((room) => room.id === station?.room);
};
