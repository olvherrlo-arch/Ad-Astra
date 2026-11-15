/**
 * PLANOS DE EJEMPLO
 * Cohetes ya armados, escritos como listas de piezas. Sirven para las pruebas (un diseño que se
 * sabe que funciona) y, más adelante, como punto de partida en el constructor.
 *
 * Un plano: { name, stages: [[id de pieza, ...], ...] } con las etapas de abajo hacia arriba y,
 * dentro de cada etapa, las piezas también de abajo hacia arriba.
 */
import { resolvePart } from './catalog.js';

const times = (count, partId) => Array.from({ length: count }, () => partId);

export const EXAMPLE_BLUEPRINTS = {
  /** Cinco etapas, todo con piezas comunes: llega a la Luna y vuelve con muy poco margen. */
  moon: {
    name: 'Lunar de referencia',
    stages: [
      [...times(5, 'engine-atm-l'), ...times(3, 'tank-kero-l'), 'separator'], //           despegue
      [...times(2, 'engine-vac-l'), ...times(2, 'tank-hydro-l'), 'separator'], //          hasta la órbita terrestre
      [...times(2, 'engine-vac-s'), ...times(2, 'tank-hydro-m'), 'separator'], //          hacia la Luna y entrada en órbita
      [...times(2, 'engine-lander'), 'landing-legs', ...times(2, 'tank-hyper-m'), 'separator'], // alunizaje (se queda en la Luna)
      [
        ...times(2, 'engine-orbital'), 'tank-hyper-m', 'tank-hyper-s', 'thrusters', //     despegue lunar y regreso
        'life-support', 'battery', 'battery', 'solar-panel', 'solar-panel',
        'antenna', 'relay-sat', 'spectrometer', 'sample-vault', 'capsule', 'nose-cone',
      ],
    ],
  },
};

/**
 * Convierte un plano en un cohete con piezas reales.
 * `version` elige rareza, calidad y estado para todas las piezas (por defecto: comunes y nuevas);
 * también puede ser una función (id de pieza) → versión, para mezclar.
 */
export const buildFromBlueprint = (blueprint, version = {}) => ({
  stages: blueprint.stages.map((partIds) => ({
    items: partIds.map((partId) => resolvePart({ partId, ...(typeof version === 'function' ? version(partId) : version) })),
  })),
});
