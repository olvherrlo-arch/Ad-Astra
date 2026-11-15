/**
 * FÍSICA
 * Funciones puras (sin pantalla, sin red, sin azar): reciben números y devuelven números.
 * Las usan el navegador (para mostrar estadísticas) y el servidor (que es quien decide).
 * Todo en unidades del Sistema Internacional: kg, m, s, m/s, N, W, J.
 *
 * QUÉ ES REAL Y QUÉ NO
 * - Constantes físicas (G0, masas y radios de los cuerpos): valores reales publicados
 *   (g0 es la gravedad estándar exacta; μ y radios medios, de las hojas de datos planetarios de la NASA).
 * - Fórmulas: las reales (Tsiolkovski, vis-viva, Hohmann, arrastre).
 * - Simplificaciones, avisadas en cada función: órbitas circulares y en un mismo plano, cónicas
 *   enlazadas (un cuerpo a la vez), atmósfera exponencial, sin rotación del planeta.
 * - Los precios, rarezas y probabilidades de falla NO están aquí: son valores de juego (js/catalog.js).
 */

// ---------- Constantes ----------
/** Gravedad estándar (m/s²). Valor exacto por definición; convierte impulso específico (s) en velocidad de escape. */
export const G0 = 9.80665;
export const AU = 1.495978707e11; // unidad astronómica (m)
export const DAY = 86_400; // s
export const WATT_HOUR = 3_600; // J en 1 Wh

/**
 * Cuerpos. mu = G·masa (m³/s²), radius = radio medio (m), orbitRadius = radio de su órbita (m)
 * alrededor de `orbits`. atmosphere: densidad al nivel del suelo (kg/m³) y altura de escala (m)
 * de un modelo exponencial (aproximación).
 */
export const BODIES = {
  sun: { name: 'Sol', mu: 1.32712440018e20, radius: 6.957e8 },
  earth: { name: 'Tierra', mu: 3.986004418e14, radius: 6.371e6, orbits: 'sun', orbitRadius: AU, atmosphere: { density0: 1.225, scaleHeight: 8_500 } },
  moon: { name: 'Luna', mu: 4.9048695e12, radius: 1.7374e6, orbits: 'earth', orbitRadius: 3.844e8 },
  mars: { name: 'Marte', mu: 4.282837e13, radius: 3.3895e6, orbits: 'sun', orbitRadius: 1.523679 * AU, atmosphere: { density0: 0.020, scaleHeight: 11_100 } },
};

const positive = (value, name) => {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} debe ser un número mayor que cero (llegó ${value})`);
  return value;
};

// ---------- Cohetes ----------

/**
 * Ecuación del cohete de Tsiolkovski: Δv = Isp · g0 · ln(m0 / mf).
 * m0 = masa al encender, mf = masa al apagar (ya sin el combustible quemado). Devuelve m/s.
 */
export const deltaV = (isp, m0, mf) => {
  positive(isp, 'El impulso específico');
  positive(m0, 'La masa inicial');
  positive(mf, 'La masa final');
  if (mf > m0) throw new RangeError('La masa final no puede ser mayor que la inicial');
  return isp * G0 * Math.log(m0 / mf);
};

/** Combustible (kg) que hay que quemar para ganar `dv` partiendo de la masa `m0`. Es Tsiolkovski al revés. */
export const propellantFor = (dv, isp, m0) => {
  if (dv <= 0) return 0;
  return positive(m0, 'La masa inicial') * (1 - Math.exp(-dv / (positive(isp, 'El impulso específico') * G0)));
};

/** Gasto de combustible de un motor (kg/s): empuje / (Isp · g0). Motor apagado (empuje 0) = 0. */
export const massFlow = (thrust, isp) => (thrust <= 0 ? 0 : thrust / (positive(isp, 'El impulso específico') * G0));

/** Cuántos segundos tarda un motor en quemar `propellant` kg. */
export const burnTime = (propellant, thrust, isp) => {
  const flow = massFlow(thrust, isp);
  return flow > 0 ? Math.max(0, propellant) / flow : Infinity;
};

/**
 * Relación empuje/peso: empuje / (masa · gravedad del lugar).
 * Menos de 1 en un despegue vertical = el vehículo no se levanta.
 */
export const thrustToWeight = (thrust, mass, gravity) => Math.max(0, thrust) / (positive(mass, 'La masa') * positive(gravity, 'La gravedad'));

/**
 * Impulso específico de varios motores encendidos a la vez: empuje total / gasto total.
 * @param {{ thrust: number, isp: number }[]} engines
 */
export const combinedIsp = (engines) => {
  const running = engines.filter((engine) => engine.thrust > 0);
  if (running.length === 0) return 0;
  const thrust = running.reduce((sum, engine) => sum + engine.thrust, 0);
  return thrust / running.reduce((sum, engine) => sum + engine.thrust / engine.isp, 0);
};

/**
 * Un paso de encendido en el vacío y sin gravedad. `throttle` va de 0 (apagado) a 1.
 * Nunca gasta más combustible del que hay ni deja masas negativas.
 * Devuelve la masa y el combustible que quedan, lo quemado y el Δv ganado.
 */
export const burnStep = ({ mass, propellant }, thrust, isp, seconds, throttle = 1) => {
  const level = Math.min(1, Math.max(0, throttle));
  const available = Math.max(0, Math.min(propellant, mass));
  const burned = Math.min(available, massFlow(thrust * level, isp) * Math.max(0, seconds));
  if (burned <= 0) return { mass, propellant: available, burned: 0, dv: 0 };
  // Datos imposibles (más combustible que masa): se quema todo y no queda nada que acelerar.
  if (burned >= mass) return { mass: 0, propellant: 0, burned, dv: 0 };
  return { mass: mass - burned, propellant: available - burned, burned, dv: deltaV(isp, mass, mass - burned) };
};

/**
 * Centro de masa de piezas apiladas. Cada una: { mass, position } con la posición (m) de su centro.
 * Devuelve la posición del centro de masa, o 0 si no hay masa.
 */
export const centerOfMass = (parts) => {
  const total = parts.reduce((sum, part) => sum + part.mass, 0);
  return total > 0 ? parts.reduce((sum, part) => sum + part.mass * part.position, 0) / total : 0;
};

// ---------- Gravedad y órbitas ----------

/** Gravedad (m/s²) a una altura sobre la superficie de un cuerpo. */
export const gravityAt = (body, altitude = 0) => body.mu / (body.radius + altitude) ** 2;

/** Velocidad de una órbita circular de radio r (medido desde el centro). */
export const circularVelocity = (mu, r) => Math.sqrt(mu / positive(r, 'El radio'));

/** Velocidad para escapar del cuerpo desde el radio r. Siempre √2 veces la circular. */
export const escapeVelocity = (mu, r) => Math.sqrt((2 * mu) / positive(r, 'El radio'));

/** Vis-viva: velocidad en el punto r de una órbita de semieje mayor a. */
export const orbitSpeed = (mu, r, a) => Math.sqrt(mu * (2 / positive(r, 'El radio') - 1 / positive(a, 'El semieje')));

/** Cuánto tarda una vuelta completa en una órbita de semieje mayor a (tercera ley de Kepler). */
export const orbitalPeriod = (mu, a) => 2 * Math.PI * Math.sqrt(positive(a, 'El semieje') ** 3 / mu);

/**
 * Transferencia de Hohmann entre dos órbitas circulares del mismo plano (la más barata en combustible
 * con dos encendidos). dv1 = encendido de salida, dv2 = encendido de llegada, time = duración (media elipse).
 */
export const hohmann = (mu, r1, r2) => {
  const a = (r1 + r2) / 2;
  const dv1 = Math.abs(orbitSpeed(mu, r1, a) - circularVelocity(mu, r1));
  const dv2 = Math.abs(circularVelocity(mu, r2) - orbitSpeed(mu, r2, a));
  return { dv1, dv2, total: dv1 + dv2, time: orbitalPeriod(mu, a) / 2 };
};

/**
 * Encendido para pasar de una órbita circular baja (radio r) a una trayectoria de escape que llega
 * "al infinito" con velocidad vInfinity respecto del cuerpo. También sirve al revés (frenar para
 * quedar en órbita al llegar): el Δv es el mismo.
 */
export const escapeBurn = (mu, r, vInfinity) => Math.sqrt(vInfinity ** 2 + escapeVelocity(mu, r) ** 2) - circularVelocity(mu, r);

/** Ángulo (rad) de un cuerpo en su órbita circular en el instante t, partiendo de angle0. */
export const orbitAngle = (mu, orbitRadius, t, angle0 = 0) => angle0 + (2 * Math.PI * t) / orbitalPeriod(mu, orbitRadius);

/** Cada cuánto se repite la misma posición relativa entre dos cuerpos de periodos T1 y T2. */
export const synodicPeriod = (t1, t2) => 1 / Math.abs(1 / t1 - 1 / t2);

/**
 * Ventana de lanzamiento entre dos planetas de órbita circular alrededor del mismo cuerpo.
 * Devuelve el viaje de Hohmann y `phaseAngle` (rad): cuánto tiene que ir adelante (o atrás, si es
 * negativo) el destino respecto del origen en el momento de salir, para que esté ahí al llegar.
 */
export const transferWindow = (mu, rFrom, rTo) => {
  const transfer = hohmann(mu, rFrom, rTo);
  const targetTravel = (2 * Math.PI * transfer.time) / orbitalPeriod(mu, rTo);
  return { ...transfer, phaseAngle: Math.PI - targetTravel, synodic: synodicPeriod(orbitalPeriod(mu, rFrom), orbitalPeriod(mu, rTo)) };
};

// ---------- Atmósfera ----------

/** Densidad del aire (kg/m³) a una altura: modelo exponencial. Sin atmósfera = 0. */
export const airDensity = (body, altitude) =>
  (body.atmosphere ? body.atmosphere.density0 * Math.exp(-Math.max(0, altitude) / body.atmosphere.scaleHeight) : 0);

/** Arrastre aerodinámico (N): ½ · densidad · velocidad² · Cd · área frontal. */
export const dragForce = (density, velocity, dragCoefficient, area) => 0.5 * density * velocity ** 2 * dragCoefficient * area;

// ---------- Energía eléctrica ----------

/** Balance (W): lo que se genera menos lo que se consume. Negativo = se está gastando batería. */
export const powerBalance = (generated, consumed) => generated - consumed;

/**
 * Un paso de batería. energy y capacity en J; generated y consumed en W.
 * La batería nunca baja de 0 ni pasa de su capacidad. `shortfall` (J) es la energía que hizo
 * falta y no hubo: si es mayor que 0, algún equipo se quedó sin energía en ese paso.
 */
export const batteryStep = ({ energy, capacity }, generated, consumed, seconds) => {
  const wanted = Math.min(Math.max(0, energy), capacity) + powerBalance(generated, consumed) * Math.max(0, seconds);
  return { energy: Math.min(capacity, Math.max(0, wanted)), shortfall: Math.max(0, -wanted) };
};
