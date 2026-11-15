/**
 * CIENCIA Y DATOS
 * Mientras la tripulación está en la superficie, cada instrumento que funciona produce datos
 * (`dataRate`, MB por hora). La ciencia solo cuenta si esos datos llegan a la Tierra:
 *
 *   capacidad = antenas (`downlink`, MB/h) × horas en la superficie × cobertura + memoria a bordo
 *
 * En la cara oculta no hay vista directa a la Tierra: la cobertura es la del satélite repetidor
 * (depende de la órbita elegida en js/missionplan.js) o cero si no hay repetidor.
 * Lo que no cabe se pierde. Más instrumentos = más ciencia posible, pero también más masa, energía,
 * costo y datos que hay que poder mandar. Ese es el equilibrio.
 *
 * El modelo es simple y los números (ciencia, datos por hora, memoria) son valores de juego; el orden
 * de magnitud del enlace (cientos a miles de MB por hora) es parecido al de misiones reales.
 * Funciones puras: las usan el constructor (estimación) y el servidor (lo que de verdad pasó).
 */

export const ONBOARD_STORAGE = 2_000; // MB que la nave guarda y trae de vuelta (valor de juego)

/**
 * @param {{ items: any[], leg: any, relay: boolean, saving?: boolean }} input
 *   items   piezas a bordo (resueltas; `failed` = rota)
 *   leg     el tramo de la superficie (js/flightplans.js: hours, farSide, relayCoverage, science)
 *   relay   hay satélite repetidor funcionando en órbita
 *   saving  la nave estuvo en modo ahorro (los instrumentos apagados)
 */
export const scienceReport = ({ items, leg, relay, saving = false }) => {
  const works = (item) => !item.failed;
  const instruments = items.filter((item) => item.science > 0);
  const hours = leg?.hours ?? 0;
  const siteFactor = leg?.science ?? 1;
  const coverage = leg?.farSide ? (relay ? (leg.relayCoverage ?? 0.5) : 0) : 1;
  const active = saving ? [] : instruments.filter(works);
  const generated = active.reduce((sum, item) => sum + item.dataRate * hours, 0);
  const downlink = items.filter((item) => works(item) && item.downlink > 0).reduce((sum, item) => sum + item.downlink, 0);
  const capacity = downlink * hours * coverage + ONBOARD_STORAGE;
  const sentFraction = generated > 0 ? Math.min(1, capacity / generated) : 0;
  const max = Math.round(instruments.reduce((sum, item) => sum + item.science, 0) * siteFactor);
  const value = Math.round(active.reduce((sum, item) => sum + item.science, 0) * siteFactor * sentFraction);
  return {
    value, //                 puntos de ciencia que llegan a la Tierra
    max, //                   lo máximo con los instrumentos a bordo, si todo se manda
    generated: Math.round(generated), // MB producidos
    sent: Math.round(Math.min(generated, capacity)), // MB que llegan
    capacity: Math.round(capacity),
    coverage,
    instruments: instruments.map((item) => ({ name: item.name, science: item.science, dataRate: item.dataRate, working: works(item) && !saving })),
  };
};
