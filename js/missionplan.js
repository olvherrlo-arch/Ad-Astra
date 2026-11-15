/**
 * PLAN DE LA MISIÓN: dónde alunizar y a qué altura orbitar la Luna
 * Una decisión del equipo antes de despegar (la pueden cambiar Vuelo o Ciencia hasta el despegue,
 * acción `plan:set`). Cambia de verdad el viaje (js/flightplans.js):
 *
 *   Órbita   La altura de la órbita lunar cambia el Δv de entrar en órbita, de bajar y de subir
 *            (se calcula con las fórmulas reales) y cuánto tiempo ve el satélite repetidor al
 *            lugar de alunizaje (cobertura: estimación del juego).
 *   Lugar    Los tres lugares existen en la cara oculta. Lo que cambia entre ellos (ciencia, riesgo
 *            para las patas, horas de Sol y margen de alunizaje) son VALORES DE JUEGO inspirados
 *            en lo que se sabe de cada lugar, no mediciones.
 *
 * No hay un plan perfecto: más ciencia pide más energía, más datos, más riesgo o más combustible.
 */

export const ORBITS = {
  low: {
    id: 'low', name: 'Órbita baja · 100 km', altitude: 100_000, relayCoverage: 0.5,
    text: 'Bajar y volver a subir cuesta menos combustible, pero el repetidor pasa rápido sobre el lugar: hay señal la mitad del tiempo.',
  },
  high: {
    id: 'high', name: 'Órbita alta · 1 000 km', altitude: 1_000_000, relayCoverage: 0.9,
    text: 'El repetidor ve el lugar casi todo el tiempo (más datos a la Tierra), pero bajar y subir pide más Δv.',
  },
};

export const SITES = {
  tsiolkovskiy: {
    id: 'tsiolkovskiy', name: 'Cráter Tsiolkovski', science: 1, legsRisk: 1, sun: 0.5, landingFactor: 1,
    text: 'Fondo liso de lava oscura. El alunizaje más tranquilo y Sol la mitad del tiempo.',
  },
  apollo: {
    id: 'apollo', name: 'Cuenca Apolo', science: 1.35, legsRisk: 1.7, sun: 0.5, landingFactor: 1.05,
    text: 'Rocas muy variadas de las profundidades: más ciencia, pero el suelo es quebrado y las patas sufren.',
  },
  pole: {
    id: 'pole', name: 'Polo sur (cuenca Aitken)', science: 1.7, legsRisk: 1.3, sun: 0.2, landingFactor: 1.06,
    text: 'Puede haber hielo en los cráteres en sombra: la mayor ciencia, pero casi sin Sol para los paneles.',
  },
};

export const DEFAULT_PLAN = Object.freeze({ site: 'tsiolkovskiy', orbit: 'low' });

/** El plan de una partida (con valores por defecto si falta algo). */
export const planOf = (data) => ({
  site: SITES[data?.plan?.site] ? data.plan.site : DEFAULT_PLAN.site,
  orbit: ORBITS[data?.plan?.orbit] ? data.plan.orbit : DEFAULT_PLAN.orbit,
});
