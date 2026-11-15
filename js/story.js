/**
 * HISTORIA (datos)
 * Los textos que la tripulación lee junta: el prólogo y el informe antes de cada misión.
 * Lo usan el navegador (para mostrarlos) y el servidor (para saber cuántas páginas hay).
 *
 * Cada página: { art, heading, text }.  `art` es el nombre de una ilustración de js/art.js;
 * cuando el equipo tenga dibujos finales, se cambian ahí sin tocar este archivo.
 *
 * Aztlán, el Prisma y su poder son ficción de Ad Astra: no son hechos científicos.
 */

/** @typedef {{ art: string, heading: string, text: string }} StoryPage */
/** @typedef {{ title: string, lastButton: string, pages: StoryPage[] }} Story */

/** @type {Story} */
export const PROLOGUE = {
  title: 'Origen de una leyenda',
  lastButton: 'Ver las misiones',
  pages: [
    {
      art: 'earth',
      heading: 'La Tierra se agota',
      text: 'Los recursos del planeta se están acabando. Siglos de sobreexplotación lo empujaron al borde del colapso.',
    },
    {
      art: 'ruins',
      heading: 'Aztlán',
      text: 'Entonces, un hallazgo geológico lo cambia todo: bajo la roca aparece una ciudad que se creía un mito. La antigua Aztlán.',
    },
    {
      art: 'carving',
      heading: 'El grabado',
      text: 'Entre sus ruinas, una piedra tallada cuenta una leyenda: un Prisma misterioso espera escondido en la cara oculta de la Luna.',
    },
    {
      art: 'bolt',
      heading: 'El rayo rojo',
      text: 'Dice la leyenda que el Prisma puede darle vida a un planeta entero, si se une a la energía de un rayo del planeta rojo: Marte.',
    },
    {
      art: 'moon',
      heading: 'Nadie lo sabe',
      text: 'Nadie sabe si la leyenda es cierta. Nadie ha visto el Prisma. Nadie ha vuelto de la cara oculta con una respuesta.',
    },
    {
      art: 'rocket',
      heading: 'Ad Astra',
      text: 'Solo hay una forma de averiguarlo: ir. Cuatro tripulantes, cada quien con su oficio, y un solo rumbo: hacia las estrellas.',
    },
  ],
};

/** Informe que se lee antes de cada misión (por id de misión). @type {Record<string, Story>} */
export const BRIEFINGS = {
  moon: {
    title: 'Informe de misión',
    lastButton: 'Empezar la misión',
    pages: [
      {
        art: 'carving',
        heading: 'Lo que sabemos',
        text: 'El grabado de Aztlán señala un punto en la cara oculta de la Luna. Si el Prisma existe, está ahí.',
      },
      {
        art: 'earth',
        heading: 'Por qué vamos',
        text: 'La Tierra no puede esperar. Antes de apostar el futuro a una leyenda, alguien tiene que ir a comprobarla.',
      },
      {
        art: 'moon',
        heading: 'El objetivo',
        text: 'Llegar al lado oculto de la Luna, encontrar el Prisma, recuperarlo y volver a la Tierra con la nave entera.',
      },
      {
        art: 'rocket',
        heading: 'Lo difícil',
        text: 'El presupuesto no alcanza para todo. Detrás de la Luna no hay señal directa con la Tierra. Y hay que guardar combustible para volver.',
      },
    ],
  },
};

/** La historia que toca leer en una escena, o null si en esa escena no se lee nada. */
export const getStory = (scene, missionId) => {
  if (scene === 'prologue') return PROLOGUE;
  if (scene === 'briefing') return BRIEFINGS[missionId] ?? null;
  return null;
};
