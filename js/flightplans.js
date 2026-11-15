/**
 * PLANES DE VUELO
 * Los tramos de cada misión y cuánto cambio de velocidad (Δv) pide cada uno.
 * Los números no están escritos a mano: se calculan con js/physics.js a partir de las órbitas.
 *
 * QUÉ ES REAL Y QUÉ NO
 * - Las órbitas (200 km sobre la Tierra, 100 km sobre la Luna) y la distancia a la Luna son reales.
 * - El Δv de cada tramo sale de las fórmulas reales con simplificaciones: órbitas circulares en un
 *   mismo plano y un cuerpo a la vez (cónicas enlazadas).
 * - Las PÉRDIDAS son estimaciones redondas, no cálculos: lo que se gasta de más por pelear contra
 *   la gravedad y el aire al subir, y por frenar despacio al alunizar.
 * - La masa del Prisma es ficción del juego.
 *
 * Un tramo: { id, name, dv, body?, minTwr?, atmosphere?, needs?, release?, addMass?, note }
 *   body + minTwr  el vehículo necesita esa relación empuje/peso en ese cuerpo para poder hacerlo
 *   atmosphere     se despega dentro del aire: los motores rinden menos al principio
 *   needs          capacidades (js/catalog.js → CAPABILITIES) sin las que el tramo no se puede hacer
 *   release        capacidades cuya pieza se suelta al terminar el tramo (deja de pesar)
 *   addMass        masa que se sube a bordo al terminar el tramo (kg)
 *   stage          en qué etapa de la misión se vuela (flight | surface | return, de js/missions.js)
 *   hours          cuánto dura el tramo, con la espera que viene después (para la energía)
 *   sun            fracción de ese tiempo con luz del Sol sobre los paneles (0 a 1; estimación)
 *   farSide        la nave está detrás de la Luna: sin repetidor no hay señal directa con la Tierra
 *   relayCoverage  fracción del tramo en que el repetidor ve a la nave (depende de la órbita elegida)
 *   science        multiplicador de ciencia del lugar de alunizaje (valor de juego)
 *   legsRisk       multiplicador del riesgo para las patas al alunizar (valor de juego)
 */
import { DEFAULT_PLAN, ORBITS, SITES } from './missionplan.js';
import { BODIES, circularVelocity, escapeBurn, hohmann, orbitSpeed } from './physics.js';

const LOW_EARTH_ORBIT = 200_000; // m sobre la superficie
const LOW_LUNAR_ORBIT = 100_000;
const ASCENT_LOSSES = 1_600; //     m/s; estimación: gravedad y arrastre al subir, menos la ayuda de la rotación terrestre
const LANDING_MARGIN = 1.1; //      estimación: 10 % extra por frenar contra la gravedad lunar y la maniobra final
export const PRISM_MASS = 85; //    kg; ficción

const round = (value) => Math.round(value / 10) * 10;

/**
 * Los tramos del viaje a la Luna para un plan (js/missionplan.js): la órbita cambia el Δv con las
 * fórmulas reales; el lugar cambia el margen de alunizaje, el Sol en la superficie y la ciencia.
 * @param {{ site?: string, orbit?: string }} [plan]
 */
export const moonFlightPlan = (plan = DEFAULT_PLAN) => {
  const orbit = ORBITS[plan.orbit] ?? ORBITS[DEFAULT_PLAN.orbit];
  const site = SITES[plan.site] ?? SITES[DEFAULT_PLAN.site];
  const { earth, moon } = BODIES;
  const leo = earth.radius + LOW_EARTH_ORBIT;
  const llo = moon.radius + (orbit.altitude ?? LOW_LUNAR_ORBIT);

  // Tierra → Luna: media elipse desde la órbita baja hasta la distancia de la Luna.
  const toMoon = hohmann(earth.mu, leo, moon.orbitRadius);
  // Al llegar, la nave va más lento que la Luna: esa diferencia es la velocidad con la que "cae" hacia ella.
  const arrivalSpeed = circularVelocity(earth.mu, moon.orbitRadius) - orbitSpeed(earth.mu, moon.orbitRadius, (leo + moon.orbitRadius) / 2);
  const lunarCapture = escapeBurn(moon.mu, llo, arrivalSpeed);
  // Órbita lunar → suelo: bajar el punto más bajo hasta la superficie y frenar toda la velocidad al llegar.
  const descentEllipse = (llo + moon.radius) / 2;
  const landing = (circularVelocity(moon.mu, llo) - orbitSpeed(moon.mu, llo, descentEllipse) + orbitSpeed(moon.mu, moon.radius, descentEllipse)) * LANDING_MARGIN * site.landingFactor;
  const km = Math.round((llo - moon.radius) / 1000);

  return [
    {
      id: 'ascent', name: 'Subir a órbita terrestre', dv: round(circularVelocity(earth.mu, leo) + ASCENT_LOSSES),
      body: 'earth', minTwr: 1.15, atmosphere: true, stage: 'flight', hours: 0.2, sun: 1,
      note: `Velocidad de órbita a ${LOW_EARTH_ORBIT / 1000} km más unas pérdidas estimadas de ${ASCENT_LOSSES} m/s por gravedad y aire.`,
    },
    {
      id: 'tli', name: 'Transferencia a la Luna', dv: round(toMoon.dv1), stage: 'flight', hours: Math.round(toMoon.time / 3600), sun: 1,
      note: `Un encendido que estira la órbita hasta la distancia de la Luna. El viaje dura unos ${Math.round(toMoon.time / 86_400)} días.`,
    },
    {
      id: 'loi', name: `Entrar en órbita lunar (${km} km)`, dv: round(lunarCapture), release: ['relay'],
      stage: 'flight', hours: 4, sun: 0.5, farSide: true, relayCoverage: orbit.relayCoverage,
      note: `Frenar para que la Luna atrape a la nave en una órbita de ${km} km. Aquí se suelta el satélite repetidor, si se lleva.`,
    },
    {
      id: 'descent', name: `Alunizar: ${site.name}`, dv: round(landing), legsRisk: site.legsRisk,
      body: 'moon', minTwr: 1.3, needs: ['landing-gear', 'landing-engine'], stage: 'surface', hours: 1, sun: site.sun, farSide: true,
      note: 'Bajar de la órbita y frenar hasta posarse. Sin aire, todo el frenado lo hace el motor.',
    },
    {
      id: 'surface', name: 'Encontrar y cargar el Prisma', dv: 0, needs: ['prism-scan', 'prism-cargo'], addMass: PRISM_MASS,
      stage: 'surface', hours: 10, sun: site.sun, farSide: true, relayCoverage: orbit.relayCoverage, science: site.science,
      note: 'No gasta combustible, pero el Prisma suma masa para el viaje de vuelta. Mientras tanto, los instrumentos trabajan.',
    },
    {
      id: 'liftoff', name: 'Despegar de la Luna', dv: round(landing), body: 'moon', minTwr: 1.2,
      stage: 'surface', hours: 1, sun: site.sun, farSide: true,
      note: 'Lo mismo que alunizar, al revés.',
    },
    {
      id: 'tei', name: 'Volver hacia la Tierra', dv: round(lunarCapture), stage: 'return', hours: 4, sun: 0.5, farSide: true,
      note: 'Salir de la órbita lunar rumbo a la Tierra.',
    },
    {
      id: 'reentry', name: 'Reentrada', dv: 0, needs: ['heatshield'], stage: 'return', hours: Math.round(toMoon.time / 3600), sun: 1,
      note: 'El aire frena a la cápsula: no hace falta combustible, pero sí escudo térmico.',
    },
  ];
};

/**
 * El viaje a Marte (misión 2). Lo real: la transferencia de Hohmann entre las órbitas de la Tierra y Marte
 * alrededor del Sol (unos 8,5 meses) y el encendido que hace falta para salir de la órbita baja con esa
 * velocidad. Estimaciones redondas: la corrección de rumbo (en misiones reales son decenas de m/s) y el
 * frenado final con motores (el aire fino de Marte frena casi todo, pero no alcanza para posarse).
 * Valores de juego: las horas de cada tramo (en el crucero la nave "hiberna") y el Sol durante la tormenta.
 * Etapas de la misión: flight (viaje) → arrival (llegada) → surface (experimento) → storm → bloom.
 */
export const marsFlightPlan = () => {
  const { sun, earth, mars } = BODIES;
  const leo = earth.radius + LOW_EARTH_ORBIT;
  const transfer = hohmann(sun.mu, earth.orbitRadius, mars.orbitRadius);
  const days = Math.round(transfer.time / 86_400);
  const lowMarsOrbit = mars.radius + 300_000;
  return [
    {
      id: 'ascent', name: 'Subir a órbita terrestre', dv: round(circularVelocity(earth.mu, leo) + ASCENT_LOSSES),
      body: 'earth', minTwr: 1.15, atmosphere: true, stage: 'flight', hours: 0.2, sun: 1,
      note: `Velocidad de órbita a ${LOW_EARTH_ORBIT / 1000} km más unas pérdidas estimadas de ${ASCENT_LOSSES} m/s por gravedad y aire.`,
    },
    {
      id: 'tmi', name: 'Inyección hacia Marte', dv: round(escapeBurn(earth.mu, leo, transfer.dv1)), stage: 'flight', hours: 200, sun: 1,
      note: `Un encendido largo para escapar de la Tierra y quedar en una órbita alrededor del Sol que toca la de Marte. El viaje dura unos ${days} días.`,
    },
    {
      id: 'mcc', name: 'Corrección de rumbo', dv: 60, stage: 'flight', hours: 200, sun: 1,
      note: 'A mitad de camino, un error mínimo de rumbo ya son miles de kilómetros al llegar. Se corrige con un encendido corto (estimación).',
    },
    {
      id: 'moi', name: 'Entrar en órbita de Marte (300 km)', dv: round(escapeBurn(mars.mu, lowMarsOrbit, transfer.dv2)), stage: 'arrival', hours: 6, sun: 0.5,
      note: 'Al llegar, la nave va más rápido que Marte: hay que frenar para que el planeta la atrape. Desde la órbita se espera el momento de bajar.',
    },
    {
      id: 'entry', name: 'Entrada en la atmósfera de Marte', dv: 0, needs: ['heatshield'], stage: 'arrival', hours: 1, sun: 0.5,
      note: 'El aire de Marte es cien veces más fino que el de la Tierra, pero a esa velocidad igual quema: frena casi todo sin gastar combustible.',
    },
    {
      id: 'descent', name: 'Aterrizar en Marte', dv: 700, body: 'mars', minTwr: 1.3, needs: ['landing-gear', 'landing-engine'],
      stage: 'arrival', hours: 1, sun: 0.5,
      note: 'El aire fino no alcanza para posarse: el final se frena con motores (estimación). Marte tira más del doble que la Luna.',
    },
    {
      id: 'experiment', name: 'Preparar el experimento', dv: 0, needs: ['prism-cargo'], stage: 'surface', hours: 8, sun: 0.45, science: 1.2, gate: true,
      note: 'No gasta combustible. Los paneles rinden menos que en la Tierra: Marte recibe menos de la mitad de la luz.',
    },
    {
      id: 'storm', name: 'La tormenta', dv: 0, stage: 'storm', hours: 3, sun: 0.05, gate: true,
      note: 'El polvo tapa el Sol: la nave vive casi solo de sus baterías.',
    },
    {
      id: 'bloom', name: 'Registrar el resultado', dv: 0, stage: 'bloom', hours: 1, sun: 0.6, gate: true,
      endText: 'El rayo despertó al Prisma y Marte empezó a cambiar. La leyenda de Aztlán era cierta.',
      note: 'Queda dejar todo anotado y avisar a la Tierra.',
    },
  ];
};

/**
 * Vuelos de prueba del Sandbox: los mismos tramos reales del viaje lunar, recortados según el perfil
 * (js/missionplan.js → PROFILES). Todo se vuela en la etapa `flight`; no hay Prisma que buscar.
 * @param {{ site?: string, orbit?: string, profile?: string }} [plan]
 */
export const sandboxFlightPlan = (plan = DEFAULT_PLAN) => {
  const moon = moonFlightPlan(plan);
  const leg = (id) => ({ ...moon.find((item) => item.id === id), stage: 'flight' });
  if (plan.profile === 'landing') return ['ascent', 'tli', 'loi', 'descent', 'liftoff', 'tei', 'reentry'].map(leg);
  if (plan.profile === 'flyby') return ['ascent', 'tli', 'loi', 'tei', 'reentry'].map(leg);
  // Órbita baja: para volver basta bajar el punto más bajo de la órbita hasta el aire (60 km).
  const { earth } = BODIES;
  const leo = earth.radius + LOW_EARTH_ORBIT;
  const deorbit = circularVelocity(earth.mu, leo) - orbitSpeed(earth.mu, leo, (leo + earth.radius + 60_000) / 2);
  return [
    leg('ascent'),
    {
      id: 'deorbit', name: 'Frenar para volver', dv: round(deorbit), stage: 'flight', hours: 3, sun: 0.6,
      note: 'Un encendido corto hacia atrás baja la órbita hasta rozar el aire. El resto del frenado lo hace la atmósfera.',
    },
    { ...leg('reentry'), hours: 1 },
  ];
};

export const FLIGHT_PLANS = { moon: moonFlightPlan, mars: marsFlightPlan, sandbox: sandboxFlightPlan };

const cache = new Map();
/** El plan de vuelo de una misión para un plan elegido (se calcula una vez por combinación). */
export const flightPlanFor = (missionId, plan) => {
  const build = FLIGHT_PLANS[missionId];
  if (!build) return null;
  const key = `${missionId}:${plan?.site}:${plan?.orbit}:${plan?.profile}`;
  if (!cache.has(key)) cache.set(key, build(plan));
  return cache.get(key);
};

/** Δv total que pide un plan de vuelo. */
export const totalDeltaV = (legs) => legs.reduce((sum, leg) => sum + leg.dv, 0);
