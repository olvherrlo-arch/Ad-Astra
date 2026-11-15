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
    title: 'Cómo avanza una misión',
    icon: '🗺',
    whereText: 'Al empezar una misión',
    when: atStage('briefing'),
    steps: [
      {
        title: 'Las etapas',
        text: 'La misión avanza por etapas: planear, comprar, construir, revisar, volar, explorar y volver. Aquí ves en cuál están.',
        target: '.stage-track',
      },
      {
        title: 'Tu tarea',
        text: 'En cada etapa tu rol tiene una tarea. Las de los demás se abren con "Ver las tareas de todo el equipo".',
        target: '.my-task',
      },
      {
        title: 'El visto bueno',
        text: 'Cuando terminas tu parte, das el visto bueno. Aquí se ve quién ya lo dio.',
        target: '.team-strip',
      },
      {
        title: 'Una acción a la vez',
        text: 'Abajo siempre está la acción principal. Cuando los cuatro dieron el visto bueno, el anfitrión pasa a la siguiente etapa.',
        target: '.stage-footer',
        todo: 'Da tu visto bueno.',
        waitFor: (ctx) => ctx.roles.every((role) => ctx.data?.confirmed?.[role]),
      },
    ],
  },
  {
    id: 'teamwork',
    title: 'Cooperar',
    icon: '🤝',
    whereText: 'En la Planificación',
    when: atStage('planning'),
    steps: [
      {
        title: 'Las decisiones se encadenan',
        text: 'Un ejemplo: Ciencia necesita un instrumento que consume 500 W. ¿Quién más tiene que actuar?',
      },
      {
        title: 'Comercio',
        text: 'Revisa si el presupuesto alcanza para el instrumento y para los paneles que lo alimentan.',
        target: '.team-strip',
      },
      {
        title: 'Ingeniería y Vuelo',
        text: 'Ingeniería pone paneles y baterías que den esos 500 W. Vuelo cuida que la nave no pase horas en la sombra sin energía.',
      },
      {
        title: 'Por eso el visto bueno',
        text: 'Ninguna decisión es de un solo rol. Antes de dar el visto bueno, pregunten qué necesita cada quien.',
        target: '[aria-label="Chat"]',
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
    when: atStage('validation'),
    steps: [
      {
        title: 'La revisión',
        text: 'En rojo, lo que impide despegar. En dorado, riesgos que pueden aceptar. Las mejoras opcionales están en los detalles.',
        target: '.review, .review-clear',
      },
      {
        title: 'Al seguir, despegan',
        text: 'Cuando el anfitrión pasa de etapa, se llenan los tanques (se cobra el combustible) y la nave despega. Ya no se puede cambiar.',
        target: '.stage-footer',
      },
    ],
  },

  // ---------------------------------------------------------- Vuelo
  {
    id: 'flight',
    title: 'Volar',
    icon: '🛰',
    whereText: 'Al despegar',
    when: (ctx) => atStage('flight', 'surface', 'return')(ctx) && Boolean(ctx.$('.flight-roles')),
    steps: [
      {
        title: 'El mapa del viaje',
        text: 'La nave va de la Tierra a la Luna y vuelve, tramo por tramo. En la zona coral, detrás de la Luna, no hay señal sin repetidor.',
        target: '.flight-map',
      },
      {
        title: 'El tramo actual',
        text: 'Cada tramo pide un cambio de velocidad (Δv). La barra muestra cuánto llevan.',
        target: '.flight-leg',
      },
      {
        title: 'Encender los motores',
        text: 'Eliges cuántos m/s quemar. El guiado no es perfecto: si te quedas corto, corriges; si te pasas, ese combustible se pierde.',
        roles: ['pilot'],
        target: '.burn-presets',
      },
      {
        title: 'Tu primer encendido',
        text: '"Lo que falta" pone justo lo necesario. Luego presiona Encender motores.',
        roles: ['pilot'],
        target: '.flight-role.mine .fire-button',
        todo: 'Enciende los motores.',
        waitFor: (ctx) => (ctx.data?.flight?.burns ?? 0) > 0,
      },
      {
        title: 'La energía',
        text: 'En modo ahorro se apagan los instrumentos y la batería dura más. En la sombra de la Luna puede hacer falta.',
        roles: ['engineer'],
        target: '.mode-toggle',
      },
      {
        title: 'Tu parte en el vuelo',
        text: 'En la Luna, Ciencia busca el Prisma con el espectrómetro. Cada búsqueda gasta batería.',
        roles: ['scientist'],
        target: '.flight-roles',
      },
      {
        title: 'Tu parte en el vuelo',
        text: 'Si algo se rompe, Comercio paga el repuesto con lo que quedó del presupuesto. Cuidar ese dinero ahora vale.',
        roles: ['merchant'],
        target: '.flight-roles',
      },
      {
        title: 'La telemetría',
        text: 'Combustible de cada etapa, batería y si hay señal. Si el Δv en los tanques baja de lo que falta del viaje, no van a volver.',
        target: '.flight-telemetry',
      },
    ],
  },
  {
    id: 'emergency',
    title: 'Emergencias',
    icon: '⚠',
    whereText: 'Cuando algo falla en vuelo',
    when: (ctx) => ctx.screen === 'game' && ctx.data?.flight?.phase === 'emergency' && Boolean(ctx.$('.flight-emergency')),
    steps: [
      {
        title: 'Algo falló',
        text: 'La emergencia dice qué se rompió y de dónde venía la pieza. Las del mercado negro sin inspección fallan más.',
        target: '.flight-emergency',
      },
      {
        title: 'Elegir una salida',
        text: 'Cada salida pide que la acepten ciertos roles. Reparar suele pedir a Ingeniería y a Comercio: tienen que estar de acuerdo.',
        target: '.emergency-options',
      },
    ],
  },
];
