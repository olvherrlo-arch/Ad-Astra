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
import { flightPlanFor, marsFlightPlan, moonFlightPlan, sandboxFlightPlan } from './flightplans.js';
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

const role4 = (scientist, merchant, engineer, pilot) => ({ scientist, merchant, engineer, pilot });

/** Misión 2. La preparación usa la misma estación; después del viaje, todo pasa en la superficie de Marte. */
/** @type {Stage[]} */
const MARS_STAGES = [
  { id: 'briefing', name: 'Informe', tools: false, summary: 'El objetivo: llevar el Prisma a Marte y despertarlo con el rayo de la leyenda.',
    tasks: role4('Estudia el clima de Marte y sus tormentas.', 'Revisa el presupuesto del viaje.', 'Revisa qué pide una nave interplanetaria.', 'Repasa la ruta: órbita, inyección, corrección, órbita de Marte, entrada y aterrizaje.') },
  { id: 'planning', name: 'Planificación', tools: false, summary: 'Un viaje de meses: energía, masa y combustible se deciden ahora.',
    tasks: role4('Elige la zona de aterrizaje con un meteorito marciano.', 'Pesa la carga del experimento.', 'Calibra la grúa para una nave más grande.', 'Ensaya la ventana de lanzamiento: se abre cada 26 meses.') },
  { id: 'market', name: 'Mercado', tools: true, tool: 'market', summary: 'Se compran las piezas. Marte pide más motor para aterrizar y más batería para la tormenta.',
    tasks: role4('Calibra los instrumentos del experimento.', 'Compra las piezas sin quedarte sin reserva.', 'Prueba los motores en el banco.', 'Practica la inyección hacia Marte.') },
  { id: 'build', name: 'Construcción', tools: true, tool: ['builder', 'market'], summary: 'Se arma la nave interplanetaria y su módulo de aterrizaje.',
    tasks: role4('Carga el módulo experimental.', 'Entrega las piezas en el hangar.', 'Ensambla lanzador, nave y módulo de aterrizaje.', 'Configura la cabina.') },
  { id: 'validation', name: 'Validación', tools: true, tool: ['builder', 'market'], summary: 'Revisión final. Al seguir, se llenan los tanques y se despega.',
    tasks: role4('Carga el Prisma en su contenedor.', 'Carga los repuestos.', 'Corrige los errores críticos y purga las líneas.', 'Haz la lista de despegue.') },
  { id: 'flight', name: 'Viaje', tools: true, tool: 'flight', summary: 'Órbita terrestre, inyección hacia Marte y corrección de rumbo.',
    tasks: role4('Fija la posición con las estrellas y vigila el Prisma.', 'Asegura la carga y cuida los repuestos.', 'Ajusta los motores y la energía.', 'Pilotea cada encendido.') },
  { id: 'arrival', name: 'Llegada a Marte', tools: true, tool: 'flight', summary: 'Frenar para entrar en órbita de Marte, atravesar su atmósfera y aterrizar a mano.',
    tasks: role4('Lee la atmósfera y fija la posición.', 'Asegura la carga para la entrada.', 'Vigila el escudo y el motor de aterrizaje.', 'Mantén el ángulo de entrada y aterriza.') },
  { id: 'surface', name: 'Superficie', tools: true, tool: 'flight', summary: 'Explorar, armar el aparato y dejar el Prisma listo.',
    tasks: role4('Recoge y analiza muestras; coloca el Prisma.', 'Descarga suministros y lleva los materiales.', 'Arma, cablea y calibra el aparato.', 'Enlaza la antena y sigue la tormenta.') },
  { id: 'storm', name: 'Tormenta', tools: true, tool: 'flight', summary: 'Llega la tormenta: hay que sostener el experimento y sincronizarlo con el rayo.',
    tasks: role4('Mantén estable la lectura del Prisma.', 'Lleva los escudos de emergencia.', 'Sujeta el aparato contra el viento.', 'Mantén el enlace y sincroniza con el rayo.') },
  { id: 'bloom', name: 'El despertar', tools: true, tool: 'flight', summary: 'El Prisma respondió. Queda registrar lo que pasó.',
    tasks: role4('Registra los resultados.', 'Guarda una muestra del primer brote.', 'Apaga y asegura el aparato.', 'Transmite la noticia a la Tierra.') },
  { id: 'debrief', name: 'Evaluación', tools: true, tool: 'flight', summary: 'Qué salió bien, qué falló y por qué.',
    tasks: role4('Resume el resultado científico.', 'Resume en qué se gastó.', 'Resume cómo se comportaron las piezas.', 'Resume el vuelo.') },
];

/** Misión 3: no hay un cohete que armar pieza por pieza, sino cuatro arcas que construir, lanzar y llevar juntas. */
/** @type {Stage[]} */
const EXODUS_STAGES = [
  { id: 'briefing', name: 'Proyecto NOAH', tools: false, summary: 'La Tierra ya no alcanza. Cuatro arcas llevarán a la humanidad a Marte.',
    tasks: role4('Revisa el banco de semillas.', 'Lleva el inventario a la mesa de recursos.', 'Da energía al astillero.', 'Ordena el plan de la flota.') },
  { id: 'planning', name: 'Reparto', tools: false, summary: 'Los recursos no alcanzan para todo: hay que repartirlos entre las cuatro arcas y elegir la ruta.',
    tasks: role4('Prepara las muestras biológicas.', 'Reparte los recursos entre las arcas.', 'Calibra la grúa del astillero.', 'Elige la ruta de la flota.') },
  { id: 'build', name: 'Construcción', tools: false, summary: 'Cada arca necesita materiales, propulsión, su carga y su navegación.',
    tasks: role4('Carga lo propio de cada arca.', 'Lleva los materiales a cada arca.', 'Instala la propulsión de cada arca.', 'Configura la navegación de cada arca.') },
  { id: 'launch', name: 'Lanzamientos', tools: false, summary: 'Cuatro despegues, uno tras otro, en la misma ventana.',
    tasks: role4('Sella la carga viva.', 'Cierra el manifiesto de la flota.', 'Carga combustible en cada arca.', 'Da la orden de despegue de cada arca.') },
  { id: 'fleet', name: 'Viaje de la flota', tools: false, summary: 'Cuatro naves viajando juntas: rumbo, formación, víveres, energía y averías.',
    tasks: role4('Vigila los ecosistemas de George.', 'Reparte los víveres entre las arcas.', 'Repara la avería y reparte la energía.', 'Corrige el rumbo y mantén la formación.') },
  { id: 'arrival', name: 'Llegada a Marte', tools: false, summary: 'El Marte que cambió el Prisma. Hay que bajar las arcas, una por una.',
    tasks: role4('Elige los sitios de aterrizaje.', 'Asegura la carga para la entrada.', 'Despliega las patas de las arcas.', 'Guía la entrada y aterriza la primera.') },
  { id: 'colony', name: 'La colonia', tools: false, summary: 'Cada arca aporta lo suyo: energía, hábitat, cultivos y escuela.',
    tasks: role4('Planta las semillas y equilibra el ecosistema.', 'Lleva víveres y archivos.', 'Levanta la torre y pone en marcha el agua.', 'Enciende el faro y recibe a las familias.') },
  { id: 'finale', name: 'El Prisma', tools: false, summary: 'Queda un último acto: devolverle el Prisma a Marte.',
    tasks: role4('Lleva el Prisma al monumento.', 'Lleva la ofrenda de la Tierra.', 'Prepara el pedestal.', 'Transmite a quienes siguen en la Tierra.') },
  { id: 'debrief', name: 'Evaluación', tools: false, summary: 'El final de la campaña.',
    tasks: role4('', '', '', '') },
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
    equipment: ['Nave interplanetaria', 'Módulo de aterrizaje con patas y motor', 'Escudo térmico', 'Contenedor del Prisma e instrumentos', 'Paneles y baterías para la tormenta'],
    star: { x: 53, y: 30 },
    stages: MARS_STAGES,
    budget: 15_000, //  valor de juego: lo mismo que la Luna, para una nave que hay que pensar de nuevo
    maxTier: 'epic',
    requirements: {
      capabilities: ['command', 'life-support', 'guidance', 'comms', 'heatshield', 'landing-gear', 'landing-engine', 'prism-cargo'],
      recommended: ['attitude', 'prism-scan'],
    },
    flightPlan: marsFlightPlan(),
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
    stages: EXODUS_STAGES,
    fleet: true, //  se juega con js/fleet.js (cuatro arcas), sin armar un cohete pieza por pieza
    budget: 0,
    maxTier: 'common',
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
