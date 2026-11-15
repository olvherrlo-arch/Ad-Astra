/**
 * TAREAS (datos compartidos navegador/servidor)
 * Lo que cada rol HACE con las manos en cada etapa: caminar hasta un puesto y operarlo, cargar cosas
 * de un lado a otro, armar, calibrar, pilotear. Ya no existe "dar el visto bueno": un rol queda listo
 * cuando terminó sus tareas de la etapa, y la etapa avanza con la palanca de la sala de misión.
 *
 * Una tarea:
 *   id, stage, role      etapa de js/missions.js y rol que la hace
 *   kind                 cómo se hace:
 *                          minijuego   'tune' | 'dial' | 'wires' | 'timing' | 'switches' | 'order' | 'burnSim'
 *                          'carry'     llevar `count` objetos `item` del puesto `from` al puesto `to`
 *                          'menu'      se hace en una pantalla (mercado, constructor) y se cumple sola (`auto`)
 *                          'auto'      se cumple sola según el estado de la partida (`auto`)
 *   at / from, to        puestos de js/worldmaps.js
 *   title                el objetivo, como se lee en la lista de tareas
 *   verb                 lo que dice el cartel al acercarse ("E · …")
 *   how                  la instrucción del minijuego
 *   result               lo que queda anotado en la bitácora al terminar
 *   needs                tareas que tienen que estar hechas antes
 *   shared               cualquiera puede ayudar a hacerla (cargar cajas, por ejemplo)
 *   perk                 ventaja real que deja para el vuelo (js/tasks.js → PERKS; la aplica server/flight.js)
 *   send                 acción que se manda al terminar el minijuego, si no es la común `task:done`
 *
 * Las ventajas (`perk`) son valores de juego, no ciencia.
 */
import { installedUids, toPhysicsStages } from './assembly.js';
import { getMission, missionFor } from './missions.js';
import { validateRocket } from './rocket.js';
import { ROLES } from './shared.js';

export const MINIGAMES = ['tune', 'dial', 'wires', 'timing', 'switches', 'order', 'burnSim'];

/** Ventajas que dejan las tareas de la estación para el vuelo. */
export const PERKS = {
  zone: 'El telescopio marcó la zona del Prisma en el mapa lunar.',
  regolith: 'Se eligió suelo firme para alunizar: las patas fallan la mitad.',
  scanner: 'Espectrómetro calibrado: detecta el Prisma desde más lejos.',
  sim: 'Piloto entrenado en el simulador: el despegue sale más preciso.',
  engines: 'Motores probados en el banco: fallan menos.',
  spares: 'Kit de repuestos a bordo: la primera reparación cuesta la mitad.',
};

/** Tramos del viaje a la Luna en orden, para el rompecabezas de la mesa de navegación. */
const ROUTE = ['Subir a órbita terrestre', 'Transferencia a la Luna', 'Entrar en órbita lunar', 'Alunizar', 'Despegar de la Luna', 'Volver hacia la Tierra', 'Reentrada'];
const CABIN_SWITCHES = ['Batería', 'Bombas', 'Guiado', 'Radio', 'Oxígeno', 'Luces', 'Giróscopos', 'Válvulas'];

const installed = (data) => (data.rocket ? installedUids(data.rocket).length : 0);
const noCritical = (data) => {
  const mission = missionFor(data);
  if (!data.rocket || !data.economy || !mission || installed(data) === 0) return false;
  const physical = toPhysicsStages(data.rocket, data.economy.inventory);
  return validateRocket(physical, mission, { credits: data.economy.credits }).critical.length === 0;
};

/** @type {any[]} */
export const TASKS = [
  // ---------- Informe: cada quien pone en marcha su puesto ----------
  {
    id: 'briefing.scope', stage: 'briefing', role: 'scientist', kind: 'tune', at: 'telescope', perk: 'zone',
    title: 'Enfocar el telescopio en la cara oculta de la Luna', verb: 'Usar el telescopio',
    how: 'Ajusta enfoque y ganancia hasta que tu señal coincida con la de la Luna.',
    result: 'encontró una anomalía en la cara oculta y marcó la zona de búsqueda',
  },
  {
    id: 'briefing.budget', stage: 'briefing', role: 'merchant', kind: 'carry', from: 'vault', to: 'terminal', count: 1, item: 'chip',
    title: 'Llevar la ficha de presupuesto de la caja fuerte a la terminal', verb: 'Sacar la ficha de presupuesto', dropVerb: 'Cargar la ficha en la terminal',
    result: 'activó el presupuesto y negoció 300 créditos de adelanto', credits: 300,
  },
  {
    id: 'briefing.power', stage: 'briefing', role: 'engineer', kind: 'wires', at: 'powerPanel',
    title: 'Conectar la energía de la torre de ensamblaje', verb: 'Abrir el tablero eléctrico',
    how: 'Une cada cable con el enchufe de su mismo color y símbolo.',
    result: 'conectó la energía de la torre de ensamblaje',
  },
  {
    id: 'briefing.window', stage: 'briefing', role: 'pilot', kind: 'timing', at: 'simulator',
    title: 'Ensayar la ventana de despegue en el simulador', verb: 'Entrar al simulador',
    how: 'Presiona cuando la marca pase por la ventana verde. Tres aciertos.',
    result: 'ensayó la ventana de despegue',
  },

  // ---------- Planificación ----------
  {
    id: 'planning.sample', stage: 'planning', role: 'scientist', kind: 'carry', from: 'sampleLocker', to: 'analyzer', count: 1, item: 'sample',
    title: 'Llevar la muestra de suelo lunar al analizador', verb: 'Tomar la muestra de regolito', dropVerb: 'Poner la muestra en el analizador',
    result: 'puso la muestra de regolito en el analizador',
  },
  {
    id: 'planning.analyze', stage: 'planning', role: 'scientist', kind: 'tune', at: 'analyzer', needs: ['planning.sample'], perk: 'regolith',
    title: 'Analizar la muestra para elegir el suelo de alunizaje', verb: 'Analizar la muestra',
    how: 'Sintoniza el espectro: iguala la frecuencia y la altura de la onda.',
    result: 'analizó el regolito y eligió suelo firme para alunizar',
  },
  {
    id: 'planning.stock', stage: 'planning', role: 'merchant', kind: 'carry', from: 'dock', to: 'scale', count: 3, item: 'crate', shared: true,
    title: 'Pesar la carga: llevar 3 cajas del muelle a la báscula', verb: 'Levantar una caja', dropVerb: 'Dejar la caja en la báscula',
    result: 'pesó la carga y recuperó 300 créditos de envases', credits: 300,
  },
  {
    id: 'planning.crane', stage: 'planning', role: 'engineer', kind: 'dial', at: 'crane',
    title: 'Calibrar la grúa del hangar', verb: 'Calibrar la grúa',
    how: 'Mantén la aguja dentro de la zona verde hasta llenar la barra.',
    result: 'calibró la grúa del hangar',
  },
  {
    id: 'planning.route', stage: 'planning', role: 'pilot', kind: 'order', at: 'navtable', game: { items: ROUTE },
    title: 'Ordenar las maniobras del viaje en la mesa de navegación', verb: 'Trazar la ruta',
    how: 'Toca las maniobras en el orden en que se vuelan, de la Tierra a la Luna y de vuelta.',
    result: 'trazó la ruta del viaje',
  },

  // ---------- Mercado ----------
  {
    id: 'market.calibrate', stage: 'market', role: 'scientist', kind: 'dial', at: 'bench', perk: 'scanner',
    title: 'Calibrar el espectrómetro en el banco', verb: 'Calibrar el espectrómetro',
    how: 'Mantén la aguja dentro de la zona verde hasta llenar la barra.',
    result: 'calibró el espectrómetro: detectará el Prisma desde más lejos',
  },
  {
    id: 'market.buy', stage: 'market', role: 'merchant', kind: 'menu', at: 'terminal', tool: 'market',
    title: 'Comprar las piezas en la terminal de suministros', verb: 'Abrir el mercado',
    auto: (data) => (data.economy?.inventory.length ?? 0) > 0,
  },
  {
    id: 'market.bench', stage: 'market', role: 'engineer', kind: 'timing', at: 'testbench', perk: 'engines',
    title: 'Probar un motor en el banco de pruebas', verb: 'Encender el banco de pruebas',
    how: 'Abre la válvula cuando la presión pase por la zona verde. Tres aciertos.',
    result: 'probó los motores en el banco: fallarán menos',
  },
  {
    id: 'market.sim', stage: 'market', role: 'pilot', kind: 'burnSim', at: 'simulator', perk: 'sim',
    title: 'Practicar un encendido en el simulador', verb: 'Practicar un encendido',
    how: 'Mantén la nariz sobre la marca y corta el motor justo al llegar al Δv pedido.',
    result: 'practicó un encendido en el simulador',
  },

  // ---------- Construcción ----------
  {
    id: 'build.instruments', stage: 'build', role: 'scientist', kind: 'carry', from: 'bench', to: 'cargoHatch', count: 1, item: 'instrument',
    title: 'Llevar los instrumentos del laboratorio a la compuerta de carga', verb: 'Tomar los instrumentos', dropVerb: 'Cargar los instrumentos',
    result: 'cargó los instrumentos en la nave',
  },
  {
    id: 'build.deliver', stage: 'build', role: 'merchant', kind: 'carry', from: 'dock', to: 'partsRack', count: 3, item: 'crate', shared: true,
    title: 'Llevar 3 cajas de piezas del muelle al estante del hangar', verb: 'Levantar una caja de piezas', dropVerb: 'Dejar la caja en el estante',
    result: 'entregó las piezas en el hangar',
  },
  {
    id: 'build.rocket', stage: 'build', role: 'engineer', kind: 'menu', at: 'assembly', tool: 'builder',
    title: 'Armar el cohete en la consola de ensamblaje', verb: 'Abrir el constructor',
    auto: (data) => installed(data) >= 3,
  },
  {
    id: 'build.cabin', stage: 'build', role: 'pilot', kind: 'switches', at: 'checklist', game: { labels: CABIN_SWITCHES, count: 5 },
    title: 'Configurar los interruptores de la cabina', verb: 'Configurar la cabina',
    how: 'Sigue la lista: activa cada interruptor en el orden que se pide.',
    result: 'dejó la cabina configurada',
  },

  // ---------- Validación ----------
  {
    id: 'validation.container', stage: 'validation', role: 'scientist', kind: 'carry', from: 'sampleLocker', to: 'cargoHatch', count: 1, item: 'container',
    title: 'Llevar el contenedor del Prisma a la compuerta de carga', verb: 'Tomar el contenedor del Prisma', dropVerb: 'Cargar el contenedor',
    result: 'cargó el contenedor del Prisma',
  },
  {
    id: 'validation.cargo', stage: 'validation', role: 'merchant', kind: 'carry', from: 'scale', to: 'cargoHatch', count: 2, item: 'crate', shared: true, perk: 'spares',
    title: 'Cargar 2 cajas de repuestos de la báscula a la nave', verb: 'Levantar una caja de repuestos', dropVerb: 'Cargar la caja en la nave',
    result: 'cargó el kit de repuestos: la primera reparación costará la mitad',
  },
  {
    id: 'validation.review', stage: 'validation', role: 'engineer', kind: 'menu', at: 'assembly', tool: 'builder',
    title: 'Dejar el cohete sin errores críticos', verb: 'Abrir el constructor',
    auto: noCritical,
  },
  {
    id: 'validation.fuel', stage: 'validation', role: 'engineer', kind: 'timing', at: 'pump',
    title: 'Purgar las líneas de combustible', verb: 'Operar la bomba',
    how: 'Abre la válvula cuando la presión pase por la zona verde. Tres aciertos.',
    result: 'purgó las líneas de combustible',
  },
  {
    id: 'validation.checklist', stage: 'validation', role: 'pilot', kind: 'switches', at: 'checklist', game: { labels: CABIN_SWITCHES, count: 6 },
    title: 'Hacer la lista de despegue en el tablero de cabina', verb: 'Hacer la lista de despegue',
    how: 'Sigue la lista: activa cada interruptor en el orden que se pide.',
    result: 'completó la lista de despegue',
  },

  // ---------- Superficie (el estado lo lleva server/flight.js; aquí solo se listan) ----------
  {
    id: 'surface.scan', stage: 'surface', role: 'scientist', kind: 'auto',
    title: 'Ubicar el Prisma: escanea y cruza las distancias', auto: (data) => Boolean(data.flight?.located || data.flight?.prism),
  },
  {
    id: 'surface.dig', stage: 'surface', role: 'engineer', kind: 'dial', at: 'site', send: { type: 'flight:dig' },
    title: 'Perforar donde está enterrado el Prisma', verb: 'Perforar', how: 'Mantén la presión del taladro en la zona verde.',
    auto: (data) => Boolean(data.flight?.dug || data.flight?.prism),
  },
  {
    id: 'surface.haul', stage: 'surface', role: 'merchant', kind: 'carry', from: 'site', to: 'hatch', count: 1, item: 'prism', shared: true,
    title: 'Cargar el Prisma hasta el módulo lunar', verb: 'Levantar el Prisma', dropVerb: 'Guardar el Prisma en el contenedor',
    auto: (data) => Boolean(data.flight?.prism),
  },
  {
    id: 'surface.solar', stage: 'surface', role: 'pilot', kind: 'timing', at: 'solar', send: { type: 'flight:solar' },
    title: 'Desplegar el panel solar de campo', verb: 'Desplegar el panel', how: 'Suelta cada traba cuando la marca pase por la zona verde.',
    auto: (data) => Boolean(data.flight?.solar),
  },
];

const BY_ID = new Map(TASKS.map((task) => [task.id, task]));
export const getTask = (id) => BY_ID.get(id);
export const stageTasks = (stageId) => TASKS.filter((task) => task.stage === stageId);

/** ¿Está hecha esta tarea? Las `auto` se miran en el estado; las demás, en `data.tasks`. */
export const isTaskDone = (data, task) => (task.auto ? Boolean(task.auto(data)) : Boolean(data.tasks?.[task.id]?.done));

/** Cuántos objetos lleva entregados una tarea de cargar. */
export const taskProgress = (data, task) => data.tasks?.[task.id]?.progress ?? 0;

/**
 * Tareas que faltan para pasar de etapa. Solo cuentan las de los roles que tienen tripulante
 * conectado (`heldRoles`): un puesto libre no frena al resto (sus tareas quedan opcionales).
 */
export const missingTasks = (data, stageId, heldRoles = ROLES.map((role) => role.id)) =>
  stageTasks(stageId).filter((task) => heldRoles.includes(task.role) && !isTaskDone(data, task));

/** Un rol está listo cuando no le quedan tareas en la etapa. */
export const rolesReady = (data, stageId) =>
  Object.fromEntries(ROLES.map((role) => [role.id, stageTasks(stageId).every((task) => task.role !== role.id || isTaskDone(data, task))]));

// ---------- Trabajos de a bordo (en vuelo) ----------
/** Preparativos antes de cada encendido: cada uno mejora las chances (los aplica server/flight.js). */
export const PREP = {
  nav: { role: 'scientist', at: 'startracker', kind: 'tune', title: 'Fijar la posición con el rastreador de estrellas', verb: 'Fijar la posición', how: 'Alinea tu señal con la de la estrella guía.', gain: 'encendido más preciso' },
  trim: { role: 'engineer', at: 'trim', kind: 'dial', title: 'Ajustar la mezcla de los motores', verb: 'Ajustar los motores', how: 'Mantén la aguja de la mezcla en la zona verde.', gain: 'menos riesgo de falla' },
  cargo: { role: 'merchant', at: 'loose', kind: 'carry', title: 'Asegurar la carga suelta en los estantes', gain: 'la nave apunta mejor' },
};

/** Cosas que se cargan a bordo sin ser tareas de etapa. */
export const JOBS = {
  cargo: { id: 'cargo', role: 'merchant', shared: true, from: 'loose', to: 'racks', count: 2, item: 'crate', verb: 'Levantar una caja suelta', dropVerb: 'Asegurar la caja' },
  spare: { id: 'spare', role: 'merchant', shared: false, item: 'spare', verb: 'Sacar el repuesto' },
};

/** Dónde aparece cada avería, y de dónde sale el repuesto, según el mapa. */
export const FAULT_STATION = {
  ship: { engine: 'engineBay', leak: 'engineBay', antenna: 'antenna', scanner: 'scanner' },
  moon: { engine: 'hatch', leak: 'hatch', antenna: 'hatch', scanner: 'cart' },
};
export const SPARE_STATION = {
  ship: () => 'spares',
  moon: (kind) => (kind === 'scanner' ? 'hatch' : 'cart'),
};
