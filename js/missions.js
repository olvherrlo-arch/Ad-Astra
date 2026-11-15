/**
 * MISIONES (datos)
 * Lo usan el navegador y el servidor. Aquí no hay lógica: solo qué misiones existen,
 * por qué etapas pasan y qué le toca a cada rol en cada una.
 *
 * Para agregar una etapa o cambiar una tarea, edita esta lista: la mesa de misión se arma sola.
 * `tools: false` = etapa de conversación, sin herramienta (Informe y Planificación); en ella
 * cada rol lee su tarea y da el visto bueno. Con `tools: true`, `tool` dice cuál se muestra
 * (una, o varias en pestañas; se abren desde su puesto en el mundo: js/world.js).
 * `tasks` es el resumen en palabras de lo que hace cada rol; las tareas que se juegan están en js/tasks.js.
 *
 * La historia del Prisma y de Aztlán es ficción del juego, no ciencia.
 */
import { flightPlanFor, moonFlightPlan, sandboxFlightPlan } from './flightplans.js';
import { UNLIMITED_CREDITS } from './partinfo.js';
import { planOf } from './missionplan.js';

/** @typedef {{ id: string, name: string, summary: string, tools: boolean, tool?: string | string[], tasks: Record<string, string> }} Stage */

/** @type {Stage[]} */
const MOON_STAGES = [
  {
    id: 'briefing',
    name: 'Informe',
    summary: 'La tripulación conoce el objetivo: ir al lado oculto de la Luna, encontrar el Prisma y volver.',
    tools: false,
    tasks: {
      scientist: 'Repasa lo que se sabe del lado oculto de la Luna y de la leyenda del Prisma.',
      merchant: 'Revisa cuánto presupuesto tiene la misión.',
      engineer: 'Revisa qué hay que construir: lanzador, nave y módulo lunar.',
      pilot: 'Repasa el plan de vuelo: órbita terrestre, transferencia, órbita lunar, alunizaje y regreso.',
    },
  },
  {
    id: 'planning',
    name: 'Planificación',
    summary: 'El equipo decide cómo repartir masa, combustible y dinero antes de comprar nada.',
    tools: false,
    tasks: {
      scientist: 'Identifica las condiciones del terreno lunar y qué instrumentos hacen falta.',
      merchant: 'Reparte el presupuesto entre propulsión, ciencia, comunicaciones y reserva.',
      engineer: 'Define las etapas del cohete y cuánta masa puede llevar.',
      pilot: 'Calcula cuánto cambio de velocidad (Δv) pide cada tramo del viaje.',
    },
  },
  {
    id: 'market',
    name: 'Mercado',
    summary: 'Se compran las piezas. Lo barato ahorra dinero, pero puede fallar en vuelo.',
    tools: true,
    tool: 'market',
    tasks: {
      scientist: 'Dile a Comercio qué instrumentos son indispensables y cuáles opcionales.',
      merchant: 'Compara y compra las piezas. Decide si vale la pena el mercado negro.',
      engineer: 'Confirma que lo que se compra sea compatible entre sí.',
      pilot: 'Avisa si los motores elegidos alcanzan para las maniobras.',
    },
  },
  {
    id: 'build',
    name: 'Construcción',
    summary: 'Se arma la nave pieza por pieza, cuidando la masa, el empuje y la energía.',
    tools: true,
    tool: ['builder', 'market'],
    tasks: {
      scientist: 'Verifica que los instrumentos tengan dónde montarse y energía suficiente.',
      merchant: 'Vigila que la construcción no se pase del presupuesto.',
      engineer: 'Ensambla el lanzador, la nave y el módulo lunar.',
      pilot: 'Revisa la relación empuje/peso y el Δv total de la nave.',
    },
  },
  {
    id: 'validation',
    name: 'Validación',
    summary: 'Revisión final: lo crítico impide el despegue; las advertencias son un riesgo aceptado. Al seguir, se llenan los tanques y se despega.',
    tools: true,
    tool: ['builder', 'market'],
    tasks: {
      scientist: 'Confirma que el equipo científico necesario va a bordo.',
      merchant: 'Confirma la reserva de emergencia.',
      engineer: 'Corrige los errores críticos y decide qué advertencias se aceptan.',
      pilot: 'Confirma que hay combustible para ir y volver.',
    },
  },
  {
    id: 'flight',
    name: 'Vuelo',
    summary: 'Despegue, órbita terrestre, transferencia lunar y entrada en órbita de la Luna.',
    tools: true,
    tool: 'flight',
    tasks: {
      scientist: 'Elige la zona de alunizaje en el lado oculto.',
      merchant: 'Lleva la cuenta de lo que queda: combustible, energía y reserva.',
      engineer: 'Vigila motores y estructura; separa las etapas a tiempo.',
      pilot: 'Ejecuta las maniobras. Detrás de la Luna no hay señal con la Tierra sin un repetidor.',
    },
  },
  {
    id: 'surface',
    name: 'Superficie',
    summary: 'Alunizaje y búsqueda del Prisma en el lado oculto.',
    tools: true,
    tool: 'flight',
    tasks: {
      scientist: 'Analiza las muestras y ubica el Prisma.',
      merchant: 'Decide si alcanza para usar equipo extra.',
      engineer: 'Despliega el equipo de exploración.',
      pilot: 'Controla el descenso y las operaciones en la superficie.',
    },
  },
  {
    id: 'return',
    name: 'Regreso',
    summary: 'La nave vuelve a la Tierra con el Prisma a bordo.',
    tools: true,
    tool: 'flight',
    tasks: {
      scientist: 'Protege el Prisma durante el viaje.',
      merchant: 'Administra lo último que queda de combustible y energía.',
      engineer: 'Mantén la nave íntegra para la reentrada.',
      pilot: 'Traza y ejecuta la trayectoria de regreso.',
    },
  },
  {
    id: 'debrief',
    name: 'Evaluación',
    summary: 'Qué salió bien, qué falló y por qué.',
    tools: true,
    tool: 'flight',
    tasks: {
      scientist: 'Resume el resultado científico.',
      merchant: 'Resume en qué se gastó y qué sobró.',
      engineer: 'Resume cómo se comportaron las piezas.',
      pilot: 'Resume el vuelo y el combustible usado.',
    },
  },
];

/**
 * Las tres misiones de la campaña, en orden. Cada una se desbloquea al completar la anterior.
 * Por ahora solo la primera tiene etapas.
 * `star` = dónde va su estrella en la constelación (0 a 100, de izquierda a derecha y de arriba abajo).
 * `duration` y `difficulty` son metas de diseño del juego, no datos reales.
 */
export const MISSIONS = [
  {
    id: 'moon',
    number: 1,
    title: 'Dark Side of the Moon',
    story: 'Un grabado en las ruinas de Aztlán habla de un Prisma escondido en la cara oculta de la Luna.',
    goal: 'Recuperar el Prisma en el lado oculto de la Luna y volver a la Tierra.',
    duration: '5 a 8 minutos',
    difficulty: 1,
    equipment: ['Lanzador de dos etapas', 'Nave con cápsula', 'Módulo lunar', 'Antena o satélite repetidor', 'Instrumentos de búsqueda'],
    star: { x: 20, y: 66 },
    stages: MOON_STAGES,
    budget: 15_000, //   créditos para piezas, inspecciones y combustible (valor de juego)
    maxTier: 'rare', //  la mejor rareza que vende el mercado legal en esta misión
    // Lo que la nave tiene que poder hacer (ids de CAPABILITIES en js/catalog.js).
    // Sin lo obligatorio no se despega; sin lo recomendado se despega con un riesgo.
    requirements: {
      capabilities: ['command', 'life-support', 'guidance', 'comms', 'heatshield', 'landing-gear', 'landing-engine', 'prism-scan', 'prism-cargo'],
      recommended: ['relay', 'attitude'],
    },
    flightPlan: moonFlightPlan(), // tramos del viaje y Δv de cada uno (js/flightplans.js)
  },
  {
    id: 'mars',
    number: 2,
    title: 'Life on Mars',
    story: 'La leyenda dice que el Prisma despierta con un rayo del planeta rojo.',
    goal: 'Llevar el Prisma a Marte y activarlo con un rayo.',
    duration: '5 a 8 minutos',
    difficulty: 2,
    equipment: ['Nave interplanetaria', 'Módulo experimental', 'Sistema de aterrizaje', 'Paneles y baterías'],
    star: { x: 53, y: 30 },
    stages: [],
  },
  {
    id: 'exodus',
    number: 3,
    title: 'Across the Universe',
    story: 'La Tierra ya no puede sostener a la humanidad. El Proyecto NOAH prepara cuatro arcas.',
    goal: 'Construir cuatro arcas y llevar a la humanidad a Marte.',
    duration: '5 a 8 minutos',
    difficulty: 3,
    equipment: ['Cuatro arcas: John, Ringo, George y Paul', 'Soporte vital', 'Semillas y ecosistemas', 'Sistemas de colonia'],
    star: { x: 82, y: 54 },
    stages: [],
  },
];

/**
 * SANDBOX: modo libre para una persona. No es parte de la campaña (no está en MISSIONS ni en la
 * constelación): un hangar con créditos ilimitados para armar lo que sea y probarlo en vuelo.
 * El hangar usa el id de etapa `validation` para heredar sus reglas: mercado y constructor abiertos,
 * revisión del cohete y despegue desde la plataforma.
 */
export const SANDBOX = {
  id: 'sandbox',
  number: 0,
  sandbox: true,
  unlimited: true, //  créditos que no bajan (solo aquí: la campaña sigue con su presupuesto)
  title: 'Sandbox',
  story: 'Un hangar para experimentar sin presupuesto.',
  goal: 'Arma lo que quieras, despega y mira cómo se comporta.',
  duration: 'Libre',
  difficulty: 0,
  equipment: [],
  stages: [
    {
      id: 'validation', name: 'Hangar', tools: true, tool: ['builder', 'market'],
      summary: 'Compra cualquier pieza, arma el cohete y elige el vuelo de prueba. Lo crítico impide el despegue.',
      tasks: { scientist: 'Prueba instrumentos.', merchant: 'Compra lo que haga falta: los créditos no se acaban.', engineer: 'Arma y cambia el cohete.', pilot: 'Elige el vuelo de prueba y despega.' },
    },
    {
      id: 'flight', name: 'Vuelo de prueba', tools: true, tool: 'flight',
      summary: 'El cohete vuela con sus números de verdad: masa, empuje, combustible y energía.',
      tasks: { scientist: 'Fija la posición antes de cada encendido.', merchant: 'Asegura la carga.', engineer: 'Ajusta los motores y la energía.', pilot: 'Pilotea cada maniobra.' },
    },
    {
      id: 'debrief', name: 'Resultado', tools: true, tool: 'flight',
      summary: 'Qué pasó y por qué. Vuelve al hangar y prueba otra cosa.',
      tasks: { scientist: '', merchant: '', engineer: '', pilot: '' },
    },
  ],
  budget: UNLIMITED_CREDITS,
  maxTier: 'legendary', // se vende todo
  requirements: { capabilities: ['command', 'guidance'], recommended: ['attitude', 'comms'] },
  flightPlan: sandboxFlightPlan({ profile: 'orbit' }),
};

export const DIFFICULTY_NAMES = ['', 'Inicial', 'Intermedia', 'Avanzada'];

/** Cómo se le dice a cada estado de misión en pantalla. */
export const MISSION_STATUS = {
  locked: 'Bloqueada',
  available: 'Disponible',
  in_progress: 'En curso',
  completed: 'Completada',
};

/** @returns {any} la misión con ese id (las de la campaña o el Sandbox) */
export const getMission = (id) => (id === SANDBOX.id ? SANDBOX : MISSIONS.find((m) => m.id === id));

/**
 * Por ahora (pedido del equipo) las tres misiones empiezan desbloqueadas. Con false, cada una se abre
 * al completar la anterior.
 */
export const UNLOCK_ALL_MISSIONS = true;

/** Campaña recién empezada: sin prólogo visto y las misiones disponibles según UNLOCK_ALL_MISSIONS. */
export const freshCampaign = () => ({
  prologueSeen: false,
  missions: Object.fromEntries(MISSIONS.map((mission, index) => [mission.id, index === 0 || UNLOCK_ALL_MISSIONS ? 'available' : 'locked'])),
});

/**
 * La misión de una partida con su plan de vuelo según el plan elegido (lugar y órbita, js/missionplan.js).
 * Úsala en lugar de getMission cuando haga falta `flightPlan`.
 * @param {any} data  estado público de la partida
 */
export const missionFor = (data) => {
  const mission = getMission(data?.missionId);
  if (!mission || !mission.flightPlan) return mission;
  return { ...mission, flightPlan: flightPlanFor(mission.id, planOf(data)) ?? mission.flightPlan };
};
