/**
 * HISTORIA (datos)
 * Las escenas que la tripulación ve junta: el prólogo y el informe antes de cada misión.
 * Lo usan el navegador (js/narrative.js las muestra como cinemáticas) y el servidor (para saber
 * cuántas escenas hay).
 *
 * Cada escena: { art, heading, text, camera?, speaker?, list? }
 *   art      nombre de una ilustración de js/art.js (los dibujos finales se cambian ahí)
 *   text     lo que se lee; se escribe solo, oración por oración, y un clic lo muestra entero
 *   camera   cómo se mueve la ilustración: in (acerca), out (aleja), left, right, up (se desliza)
 *   speaker  quién habla (si no está, es el narrador)
 *   list     puntos que aparecen uno tras otro debajo del texto (para lo que hay que llevar o hacer)
 *
 * Aztlán, el Prisma y su poder son ficción de Ad Astra: no son hechos científicos.
 */

/** @typedef {{ art: string, heading: string, text: string, camera?: string, speaker?: string, list?: string[] }} StoryPage */
/** @typedef {{ title: string, lastButton: string, pages: StoryPage[] }} Story */

/** @type {Story} */
export const PROLOGUE = {
  title: 'Origen de una leyenda',
  lastButton: 'Ver las misiones',
  pages: [
    {
      art: 'earth',
      camera: 'in',
      heading: 'La Tierra se agota',
      text: 'Los recursos del planeta se están acabando. Siglos de sobreexplotación lo empujaron al borde del colapso.',
    },
    {
      art: 'ruins',
      camera: 'up',
      heading: 'Aztlán',
      text: 'Entonces, un hallazgo geológico lo cambia todo: bajo la roca aparece una ciudad que se creía un mito. La antigua Aztlán.',
    },
    {
      art: 'carving',
      camera: 'right',
      heading: 'El grabado',
      text: 'Entre sus ruinas, una piedra tallada cuenta una leyenda: un Prisma misterioso espera escondido en la cara oculta de la Luna.',
    },
    {
      art: 'bolt',
      camera: 'in',
      heading: 'El rayo rojo',
      text: 'Dice la leyenda que el Prisma puede darle vida a un planeta entero, si se une a la energía de un rayo del planeta rojo: Marte.',
    },
    {
      art: 'moon',
      camera: 'left',
      heading: 'Nadie lo sabe',
      text: 'Nadie sabe si la leyenda es cierta. Nadie ha visto el Prisma. Nadie ha vuelto de la cara oculta con una respuesta.',
    },
    {
      art: 'rocket',
      camera: 'up',
      heading: 'Ad Astra',
      text: 'Solo hay una forma de averiguarlo: ir. Cuatro tripulantes, cada quien con su oficio, y un solo rumbo: hacia las estrellas.',
    },
  ],
};

/** Informe que se ve antes de cada misión (por id de misión): la historia y lo que hay que hacer. @type {Record<string, Story>} */
export const BRIEFINGS = {
  moon: {
    title: 'Misión 1 · Dark Side of the Moon',
    lastButton: 'Empezar la misión',
    pages: [
      {
        art: 'carving',
        camera: 'in',
        speaker: 'Control de misión',
        heading: 'Lo que sabemos',
        text: 'El grabado de Aztlán señala un punto en la cara oculta de la Luna. Si el Prisma existe, está ahí.',
      },
      {
        art: 'earth',
        camera: 'out',
        speaker: 'Control de misión',
        heading: 'Por qué vamos',
        text: 'La Tierra no puede esperar. Antes de apostar el futuro a una leyenda, alguien tiene que ir a comprobarla.',
      },
      {
        art: 'moon',
        camera: 'left',
        heading: 'El objetivo',
        text: 'Llegar al lado oculto de la Luna, encontrar el Prisma, recuperarlo y volver a la Tierra con la nave entera.',
      },
      {
        art: 'relay',
        camera: 'right',
        speaker: 'Control de misión',
        heading: 'Detrás de la Luna',
        text: 'Del lado oculto, la Luna tapa la señal con la Tierra. Un satélite repetidor en órbita lunar la mantiene. Sin él, allá volarán a ciegas.',
      },
      {
        art: 'rocket',
        camera: 'up',
        heading: 'Qué llevar',
        text: 'La nave tiene que poder ir, bajar, buscar y volver. Esto no puede faltar:',
        list: [
          'Etapas con motores y tanques para llegar y volver',
          'Patas y un motor de alunizaje para posarse',
          'Espectrómetro y contenedor para el Prisma',
          'Antena (y mejor, el repetidor) para hablar con la Tierra',
          'Paneles y baterías para las horas en la sombra',
        ],
      },
      {
        art: 'earth',
        camera: 'in',
        speaker: 'Control de misión',
        heading: 'Lo difícil',
        text: 'El presupuesto no alcanza para todo. Lo barato puede fallar. Y el combustible del regreso tiene que salir con ustedes desde la Tierra. Buena suerte.',
      },
    ],
  },
};

/** La historia que toca ver en una escena, o null si en esa escena no hay historia. */
export const getStory = (scene, missionId) => {
  if (scene === 'prologue') return PROLOGUE;
  if (scene === 'briefing') return BRIEFINGS[missionId] ?? null;
  return null;
};
