/**
 * TUTORIALES (los textos)
 * Cada módulo aparece la primera vez que el jugador llega a su pantalla (`when`). Lo muestra js/tutorial.js.
 *
 * Un módulo: { id, title, icon, when(ctx), roles?, steps: [paso, ...], whereText? }
 * Un paso:   { title, text, target?, roles?, todo?, waitFor?(ctx, baseline), baseline?(ctx) }
 *   target    selector CSS de lo que se resalta (si no está en pantalla, el panel va abajo al centro)
 *   roles     si está, solo lo ve quien maneja alguno de esos roles
 *   todo      lo que el jugador tiene que HACER; el paso espera hasta que `waitFor` dé verdadero
 *   baseline  se guarda al empezar el paso (por ejemplo, cuántas piezas había) para comparar después
 * `ctx` sale de tutorialContext() en js/tutorial.js: { screen, data, me, stageId, roles, $ }.
 *
 * Textos cortos: una o dos oraciones por paso. Lo largo va en el juego, a pedido.
 */

const atStage = (...ids) => (ctx) => ctx.screen === 'game' && ids.includes(ctx.stageId);
const tasksDone = (ctx) => Object.values(ctx.data?.tasks ?? {}).filter((task) => task.done).length;
const inventoryCount = (ctx) => ctx.data?.economy?.inventory.length ?? 0;
const placedCount = (ctx) => (ctx.data?.rocket?.stages ?? []).reduce((t, s) => t + s.engines.length + s.core.length + s.mounted.length, 0);

/** @type {{ id: string, title: string, icon: string, when: (ctx: any) => boolean, roles?: string[], whereText?: string, steps: any[] }[]} */
export const TUTORIALS = [
  // ---------------------------------------------------------- Lo básico
  {
    id: 'basics',
    title: 'Primeros pasos',
    icon: '🚀',
    whereText: 'En la sala de embarque',
    when: (ctx) => ctx.screen === 'lobby',
    steps: [
      {
        title: 'Bienvenida a bordo',
        text: 'Ad Astra se juega en equipo, hasta cuatro. Cada quien tiene un rol distinto y la misión solo sale si cooperan.',
      },
      {
        title: 'Los roles se sortean',
        text: 'Ciencia investiga, Comercio maneja el dinero, Ingeniería arma la nave y Vuelo la pilotea. Al despegar, a cada quien le toca uno al azar.',
      },
      {
        title: 'Avisa que estás listo',
        text: 'Cuando todos marcaron Listo, el anfitrión (★) presiona Despegar. Con menos de cuatro, los roles que sobran los maneja cualquiera.',
        target: '.hud-bottom',
      },
      {
        title: 'Hablen entre ustedes',
        text: 'El chat es la radio de la tripulación. También pueden hablar en voz alta: lo importante es decidir juntos.',
        target: '[data-panel="chat"]',
      },
      {
        title: 'Moverse y personalizar',
        text: 'Muévete con WASD, las flechas o un clic en el piso. En el vestidor turquesa cambias color y sombrero (solo apariencia).',
        target: '.hud-customize',
      },
    ],
  },

  // ---------------------------------------------------------- Cómo se juega una misión
  {
    id: 'mission',
    title: 'La misión se juega caminando',
    icon: '🗺',
    whereText: 'Al empezar una misión',
    when: (ctx) => atStage('briefing')(ctx) && Boolean(ctx.$('.world')),
    steps: [
      {
        title: 'Camina por la estación',
        text: 'Muévete con WASD, las flechas o un clic en el piso. Cada rol tiene su cuarto: laboratorio, almacén, hangar y simulador. Al centro, la sala de misión.',
      },
      {
        title: 'Tus tareas',
        text: 'Aquí están las tareas de tu rol en esta etapa. La flecha dorada te lleva al puesto donde se hace la próxima.',
        target: '.world-objectives',
      },
      {
        title: 'Usa los puestos',
        text: 'Acércate a un puesto y presiona E (o haz clic en él). No hay botón de confirmar: la tarea queda hecha cuando la haces con tus manos.',
        target: '.world-objectives',
        todo: 'Haz una tarea.',
        baseline: tasksDone,
        waitFor: (ctx, before) => tasksDone(ctx) > before,
      },
      {
        title: 'La palanca de etapa',
        text: 'Cuando cada tripulante terminó lo suyo, cualquiera baja la palanca de la sala de misión (mantén E) y empieza la etapa siguiente.',
        target: '.world-team',
      },
    ],
  },
  {
    id: 'teamwork',
    title: 'Cooperar',
    icon: '🤝',
    whereText: 'En la Planificación',
    when: (ctx) => atStage('planning')(ctx) && Boolean(ctx.$('.world')),
    steps: [
      {
        title: 'Nadie trabaja solo',
        text: 'Cargar cajas es de todos: acércate al muelle, levanta una con E y llévala a donde va. Todos ven quién lleva qué.',
      },
      {
        title: 'Lo que haces queda',
        text: 'Algunas tareas dejan ventajas reales para el vuelo: el telescopio marca la zona del Prisma, el banco de pruebas baja las fallas. Se ven en el tablero de misión.',
        target: '.world-objectives',
      },
      {
        title: 'Hablen entre ustedes',
        text: 'El chat es la radio de la tripulación (Enter). Pregunten qué necesita cada quien antes de bajar la palanca.',
        target: '.world-buttons',
      },
    ],
  },

  // ---------------------------------------------------------- Mercado
  {
    id: 'market',
    title: 'El mercado',
    icon: '🛒',
    whereText: 'En la etapa Mercado',
    when: (ctx) => atStage('market')(ctx) && Boolean(ctx.$('.market')),
    steps: [
      {
        title: 'El presupuesto',
        text: 'Es de todo el equipo y no alcanza para todo. Ojo: el combustible se cobra aparte al despegar.',
        target: '.budget',
      },
      {
        title: 'Las fichas',
        text: 'Cada pieza dice para qué sirve y desde cuánto cuesta. Al abrirla ves sus versiones.',
        target: '.part-card',
        todo: 'Abre una ficha.',
        waitFor: (ctx) => Boolean(ctx.$('.part-card[open]')),
      },
      {
        title: 'Rareza y confiabilidad',
        text: 'Común, poco común, rara… Mejor rareza: rinde un poco más, falla menos y cuesta más. "Confiab." es la chance de que no falle cada vez que se usa.',
        target: '.part-card[open] .versions',
      },
      {
        title: 'Comprar',
        text: 'Solo Comercio compra. Elige la cantidad y presiona Comprar: lo comprado va a la Bodega.',
        roles: ['merchant'],
        target: '.part-card[open] .buy-button',
        todo: 'Compra una pieza.',
        baseline: inventoryCount,
        waitFor: (ctx, before) => inventoryCount(ctx) > before,
      },
      {
        title: 'Pedir',
        text: 'Tú no compras, pero puedes pedir una pieza: queda marcada para que Comercio la vea.',
        roles: ['scientist', 'engineer', 'pilot'],
        target: '.part-card[open] .ask-button',
      },
      {
        title: 'La bodega',
        text: 'Muestra lo comprado y qué le falta a la nave para la misión. Es la lista de compras del equipo.',
        target: '[data-tab="hold"]',
      },
    ],
  },
  {
    id: 'black',
    title: 'El mercado negro',
    icon: '🕶',
    roles: ['merchant'],
    whereText: 'En la pestaña Mercado negro',
    when: (ctx) => atStage('market', 'build', 'validation')(ctx) && Boolean(ctx.$('.seller')),
    steps: [
      {
        title: 'Más barato, sin garantía',
        text: 'Lo que dice la ficha lo dice el vendedor. Puede ser una ganga… o tener un defecto oculto que falla en pleno vuelo.',
        target: '.seller',
      },
      {
        title: 'La confianza del vendedor',
        text: 'Las estrellas dicen qué tan seguido cumple. Uno de ellos a veces cobra y desaparece.',
        target: '.seller-stars',
      },
      {
        title: 'Inspeccionar',
        text: 'La básica muestra el estado real; la avanzada, también el rendimiento y si hay defecto. Cuesta, pero reduce la duda.',
        target: '.inspect-button',
      },
    ],
  },

  // ---------------------------------------------------------- Construcción
  {
    id: 'builder',
    title: 'Armar el cohete',
    icon: '🔧',
    whereText: 'En la etapa Construcción',
    when: (ctx) => atStage('build', 'validation')(ctx) && Boolean(ctx.$('.builder')),
    steps: [
      {
        title: 'La bodega',
        text: 'Aquí están las piezas compradas que todavía no están puestas, agrupadas por dónde van: cuerpo, motores o equipo.',
        target: '.builder-hold',
      },
      {
        title: 'Poner una pieza',
        text: 'Arrastra una pieza al cohete. Cada etapa se pinta dorada si encaja o coral si no, y te dice por qué.',
        roles: ['engineer'],
        target: '.builder-hold .hold-item',
        todo: 'Pon una pieza en el cohete (arrastrando o con "Poner").',
        baseline: placedCount,
        waitFor: (ctx, before) => placedCount(ctx) > before,
      },
      {
        title: 'Cada pieza tiene su lugar',
        text: 'Abajo los motores, encima los tanques y la cápsula; el equipo se cuelga de los costados. Cada etapa quema un solo combustible.',
        target: '.builder-canvas',
      },
      {
        title: 'Quitar o mover',
        text: 'Toca una pieza puesta para ver su ficha, moverla de etapa o quitarla. "Deshacer" vuelve atrás.',
        roles: ['engineer'],
        target: '[data-do="undo"]',
      },
      {
        title: 'Lo ves en vivo',
        text: 'Solo Ingeniería arma, pero todos ven el cohete y sus números. Si algo no cierra, díganlo por el chat.',
        roles: ['scientist', 'merchant', 'pilot'],
        target: '.builder-canvas',
      },
    ],
  },
  {
    id: 'physics',
    title: 'Los números del cohete',
    icon: '📐',
    whereText: 'En el constructor, con piezas puestas',
    when: (ctx) => atStage('build', 'validation')(ctx) && Boolean(ctx.$('.dv-headline')),
    steps: [
      {
        title: 'Δv: el número más importante',
        text: 'Delta-v es cuánto puede cambiar su velocidad la nave con su combustible. Ir y volver de la Luna pide unos 18 000 m/s.',
        target: '.dv-headline',
      },
      {
        title: 'Empuje/peso',
        text: 'El empuje de los motores dividido por el peso. Menos de 1: el cohete no se levanta. Conviene 1,2 o más.',
        target: '.builder-stats .stat-list',
      },
      {
        title: 'Todo pesa',
        text: 'Cada pieza y cada kilo de combustible hay que empujarlo. Más combustible da más Δv, pero cada vez menos: por eso se usan etapas que se sueltan al vaciarse.',
        target: '.builder-stats .stat-list',
      },
      {
        title: '¿Alcanza para el viaje?',
        text: 'Esta línea vuela el plan "en papel" y dice hasta dónde llega. Lo técnico está en "Ver detalles técnicos".',
        target: '.plan-headline',
      },
    ],
  },
  {
    id: 'launch',
    title: 'Antes de despegar',
    icon: '✅',
    whereText: 'En la etapa Validación',
    when: (ctx) => atStage('validation')(ctx) && Boolean(ctx.$('.world')),
    steps: [
      {
        title: 'La revisión final',
        text: 'Ingeniería deja el cohete sin errores críticos en la consola de ensamblaje. Mientras tanto, los demás cargan la nave y preparan la cabina.',
        target: '.world-objectives',
      },
      {
        title: 'Todos a bordo',
        text: 'Para despegar, todos caminan hasta la plataforma de lanzamiento y Vuelo mantiene E. Ahí se llenan los tanques (se cobra el combustible) y ya no se puede cambiar nada.',
        target: '.world-objectives',
      },
    ],
  },

  // ---------------------------------------------------------- Vuelo
  {
    id: 'flight',
    title: 'Volar',
    icon: '🛰',
    whereText: 'Al despegar',
    when: (ctx) => atStage('flight', 'surface', 'return')(ctx) && Boolean(ctx.$('.world-flight:not([hidden])')),
    steps: [
      {
        title: 'A bordo',
        text: 'La nave tiene un compartimento por rol: motores, bodega, ciencia y cabina. Este panel muestra el tramo, el Δv que falta y la batería.',
        target: '.world-flight',
      },
      {
        title: 'Preparar el encendido',
        text: 'Antes de cada encendido, cada rol puede mejorar las chances: Ciencia fija la posición, Ingeniería ajusta los motores y Comercio asegura la carga.',
        target: '.world-flight .prep',
      },
      {
        title: 'Al timón',
        text: 'Pilotas cada encendido a mano: mantén la nariz sobre la marca y corta justo al llegar al Δv pedido. Si te pasas, ese combustible se pierde.',
        roles: ['pilot'],
        target: '.world-objectives',
        todo: 'Ve al timón y haz tu primer encendido.',
        waitFor: (ctx) => (ctx.data?.flight?.burns ?? 0) > 0,
      },
      {
        title: 'Tu parte en el vuelo',
        text: 'En el rastreador de estrellas fijas la posición antes de cada encendido. En la Luna, escaneas con E: cada círculo dice a qué distancia está el Prisma.',
        roles: ['scientist'],
        target: '.world-objectives',
      },
      {
        title: 'Tu parte en el vuelo',
        text: 'Ajustas los motores antes de cada encendido y manejas la energía en el tablero. Si algo se rompe, lo reparas donde está la avería.',
        roles: ['engineer'],
        target: '.world-objectives',
      },
      {
        title: 'Tu parte en el vuelo',
        text: 'Aseguras la carga suelta antes de cada encendido. Si algo se rompe, sacas el repuesto del pañol (se paga con lo que quedó) y lo llevas a la avería.',
        roles: ['merchant'],
        target: '.world-objectives',
      },
    ],
  },
  {
    id: 'emergency',
    title: 'Emergencias',
    icon: '⚠',
    whereText: 'Cuando algo falla en vuelo',
    when: (ctx) => ctx.screen === 'game' && ctx.data?.flight?.phase === 'emergency' && Boolean(ctx.$('.world-flight .emergency')),
    steps: [
      {
        title: 'Algo falló',
        text: 'La emergencia dice qué se rompió y de dónde venía la pieza. Las del mercado negro sin inspección fallan más.',
        target: '.world-flight .emergency',
      },
      {
        title: 'Se arregla entre dos',
        text: 'Comercio saca el repuesto y lo lleva hasta la avería (el puesto con borde coral). Ingeniería lo instala ahí. Vuelo puede decidir seguir sin reparar desde el timón.',
        target: '.world-objectives',
      },
    ],
  },
];
