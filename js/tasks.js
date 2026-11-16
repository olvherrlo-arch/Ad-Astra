/**
 * TAREAS (datos compartidos navegador/servidor)
 * Lo que cada rol HACE con las manos en cada etapa: caminar hasta un puesto y operarlo, cargar cosas
 * de un lado a otro, armar, calibrar, pilotear. Ya no existe "dar el visto bueno": un rol queda listo
 * cuando terminó sus tareas de la etapa, y la etapa avanza con la palanca de la sala de misión.
 *
 * Una tarea:
 *   id, stage, role      etapa de js/missions.js y rol que la hace
 *   kind                 cómo se hace:
 *                          minijuego   'tune' | 'dial' | 'wires' | 'timing' | 'switches' | 'order' | 'burnSim'
 *                          'carry'     llevar `count` objetos `item` del puesto `from` al puesto `to`
 *                          'menu'      se hace en una pantalla (mercado, constructor) y se cumple sola (`auto`)
 *                          'auto'      se cumple sola según el estado de la partida (`auto`)
 *   at / from, to        puestos de js/worldmaps.js
 *   title                el objetivo, como se lee en la lista de tareas
 *   verb                 lo que dice el cartel al acercarse ("E · …")
 *   how                  la instrucción del minijuego
 *   result               lo que queda anotado en la bitácora al terminar
 *   needs                tareas que tienen que estar hechas antes
 *   shared               cualquiera puede ayudar a hacerla (cargar cajas, por ejemplo)
 *   perk                 ventaja real que deja para el vuelo (js/tasks.js → PERKS; la aplica server/flight.js)
 *   send                 acción que se manda al terminar el minijuego, si no es la común `task:done`
 *
 * Las ventajas (`perk`) son valores de juego, no ciencia.
 */
import { installedUids, toPhysicsStages } from './assembly.js';
import { getMission, missionFor } from './missions.js';
import { validateRocket } from './rocket.js';
import { ARKS, fleetBuildable } from './fleet.js';
import { ROLES } from './shared.js';

export const MINIGAMES = ['tune', 'dial', 'wires', 'timing', 'switches', 'order', 'burnSim', 'landing'];

/** Ventajas que dejan las tareas de la estación para el vuelo. */
export const PERKS = {
  zone: 'El telescopio marcó la zona del Prisma en el mapa lunar.',
  regolith: 'Se eligió suelo firme para alunizar: las patas fallan la mitad.',
  scanner: 'Espectrómetro calibrado: detecta el Prisma desde más lejos.',
  sim: 'Piloto entrenado en el simulador: el despegue sale más preciso.',
  engines: 'Motores probados en el banco: fallan menos.',
  spares: 'Kit de repuestos a bordo: la primera reparación cuesta la mitad.',
};

/** Tramos del viaje a la Luna en orden, para el rompecabezas de la mesa de navegación. */
const ROUTE = ['Subir a órbita terrestre', 'Transferencia a la Luna', 'Entrar en órbita lunar', 'Alunizar', 'Despegar de la Luna', 'Volver hacia la Tierra', 'Reentrada'];
const CABIN_SWITCHES = ['Batería', 'Bombas', 'Guiado', 'Radio', 'Oxígeno', 'Luces', 'Giróscopos', 'Válvulas'];

const installed = (data) => (data.rocket ? installedUids(data.rocket).length : 0);
const noCritical = (data) => {
  const mission = missionFor(data);
  if (!data.rocket || !data.economy || !mission || installed(data) === 0) return false;
  const physical = toPhysicsStages(data.rocket, data.economy.inventory);
  return validateRocket(physical, mission, { credits: data.economy.credits }).critical.length === 0;
};

/** @type {any[]} */
export const TASKS = [
  // ---------- Informe: cada quien pone en marcha su puesto ----------
  {
    id: 'briefing.scope', stage: 'briefing', role: 'scientist', kind: 'tune', at: 'telescope', perk: 'zone',
    title: 'Enfocar el telescopio en la cara oculta de la Luna', verb: 'Usar el telescopio',
    how: 'Ajusta enfoque y ganancia hasta que tu señal coincida con la de la Luna.',
    result: 'encontró una anomalía en la cara oculta y marcó la zona de búsqueda',
  },
  {
    id: 'briefing.budget', stage: 'briefing', role: 'merchant', kind: 'carry', from: 'vault', to: 'terminal', count: 1, item: 'chip',
    title: 'Llevar la ficha de presupuesto de la caja fuerte a la terminal', verb: 'Sacar la ficha de presupuesto', dropVerb: 'Cargar la ficha en la terminal',
    result: 'activó el presupuesto y negoció 300 créditos de adelanto', credits: 300,
  },
  {
    id: 'briefing.power', stage: 'briefing', role: 'engineer', kind: 'wires', at: 'powerPanel',
    title: 'Conectar la energía de la torre de ensamblaje', verb: 'Abrir el tablero eléctrico',
    how: 'Une cada cable con el enchufe de su mismo color y símbolo.',
    result: 'conectó la energía de la torre de ensamblaje',
  },
  {
    id: 'briefing.window', stage: 'briefing', role: 'pilot', kind: 'timing', at: 'simulator',
    title: 'Ensayar la ventana de despegue en el simulador', verb: 'Entrar al simulador',
    how: 'Presiona cuando la marca pase por la ventana verde. Tres aciertos.',
    result: 'ensayó la ventana de despegue',
  },

  // ---------- Planificación ----------
  {
    id: 'planning.sample', stage: 'planning', role: 'scientist', kind: 'carry', from: 'sampleLocker', to: 'analyzer', count: 1, item: 'sample',
    title: 'Llevar la muestra de suelo lunar al analizador', verb: 'Tomar la muestra de regolito', dropVerb: 'Poner la muestra en el analizador',
    result: 'puso la muestra de regolito en el analizador',
  },
  {
    id: 'planning.analyze', stage: 'planning', role: 'scientist', kind: 'tune', at: 'analyzer', needs: ['planning.sample'], perk: 'regolith',
    title: 'Analizar la muestra para elegir el suelo de alunizaje', verb: 'Analizar la muestra',
    how: 'Sintoniza el espectro: iguala la frecuencia y la altura de la onda.',
    result: 'analizó el regolito y eligió suelo firme para alunizar',
  },
  {
    id: 'planning.stock', stage: 'planning', role: 'merchant', kind: 'carry', from: 'dock', to: 'scale', count: 3, item: 'crate', shared: true,
    title: 'Pesar la carga: llevar 3 cajas del muelle a la báscula', verb: 'Levantar una caja', dropVerb: 'Dejar la caja en la báscula',
    result: 'pesó la carga y recuperó 300 créditos de envases', credits: 300,
  },
  {
    id: 'planning.crane', stage: 'planning', role: 'engineer', kind: 'dial', at: 'crane',
    title: 'Calibrar la grúa del hangar', verb: 'Calibrar la grúa',
    how: 'Mantén la aguja dentro de la zona verde hasta llenar la barra.',
    result: 'calibró la grúa del hangar',
  },
  {
    id: 'planning.route', stage: 'planning', role: 'pilot', kind: 'order', at: 'navtable', game: { items: ROUTE },
    title: 'Ordenar las maniobras del viaje en la mesa de navegación', verb: 'Trazar la ruta',
    how: 'Toca las maniobras en el orden en que se vuelan, de la Tierra a la Luna y de vuelta.',
    result: 'trazó la ruta del viaje',
  },

  // ---------- Mercado ----------
  {
    id: 'market.calibrate', stage: 'market', role: 'scientist', kind: 'dial', at: 'bench', perk: 'scanner',
    title: 'Calibrar el espectrómetro en el banco', verb: 'Calibrar el espectrómetro',
    how: 'Mantén la aguja dentro de la zona verde hasta llenar la barra.',
    result: 'calibró el espectrómetro: detectará el Prisma desde más lejos',
  },
  {
    id: 'market.buy', stage: 'market', role: 'merchant', kind: 'menu', at: 'terminal', tool: 'market',
    title: 'Comprar las piezas en la terminal de suministros', verb: 'Abrir el mercado',
    auto: (data) => (data.economy?.inventory.length ?? 0) > 0,
  },
  {
    id: 'market.bench', stage: 'market', role: 'engineer', kind: 'timing', at: 'testbench', perk: 'engines',
    title: 'Probar un motor en el banco de pruebas', verb: 'Encender el banco de pruebas',
    how: 'Abre la válvula cuando la presión pase por la zona verde. Tres aciertos.',
    result: 'probó los motores en el banco: fallarán menos',
  },
  {
    id: 'market.sim', stage: 'market', role: 'pilot', kind: 'burnSim', at: 'simulator', perk: 'sim',
    title: 'Practicar un encendido en el simulador', verb: 'Practicar un encendido',
    how: 'Mantén la nariz sobre la marca y corta el motor justo al llegar al Δv pedido.',
    result: 'practicó un encendido en el simulador',
  },

  // ---------- Construcción ----------
  {
    id: 'build.instruments', stage: 'build', role: 'scientist', kind: 'carry', from: 'bench', to: 'cargoHatch', count: 1, item: 'instrument',
    title: 'Llevar los instrumentos del laboratorio a la compuerta de carga', verb: 'Tomar los instrumentos', dropVerb: 'Cargar los instrumentos',
    result: 'cargó los instrumentos en la nave',
  },
  {
    id: 'build.deliver', stage: 'build', role: 'merchant', kind: 'carry', from: 'dock', to: 'partsRack', count: 3, item: 'crate', shared: true,
    title: 'Llevar 3 cajas de piezas del muelle al estante del hangar', verb: 'Levantar una caja de piezas', dropVerb: 'Dejar la caja en el estante',
    result: 'entregó las piezas en el hangar',
  },
  {
    id: 'build.rocket', stage: 'build', role: 'engineer', kind: 'menu', at: 'assembly', tool: 'builder',
    title: 'Armar el cohete en la consola de ensamblaje', verb: 'Abrir el constructor',
    auto: (data) => installed(data) >= 3,
  },
  {
    id: 'build.cabin', stage: 'build', role: 'pilot', kind: 'switches', at: 'checklist', game: { labels: CABIN_SWITCHES, count: 5 },
    title: 'Configurar los interruptores de la cabina', verb: 'Configurar la cabina',
    how: 'Sigue la lista: activa cada interruptor en el orden que se pide.',
    result: 'dejó la cabina configurada',
  },

  // ---------- Validación ----------
  {
    id: 'validation.container', stage: 'validation', role: 'scientist', kind: 'carry', from: 'sampleLocker', to: 'cargoHatch', count: 1, item: 'container',
    title: 'Llevar el contenedor del Prisma a la compuerta de carga', verb: 'Tomar el contenedor del Prisma', dropVerb: 'Cargar el contenedor',
    result: 'cargó el contenedor del Prisma',
  },
  {
    id: 'validation.cargo', stage: 'validation', role: 'merchant', kind: 'carry', from: 'scale', to: 'cargoHatch', count: 2, item: 'crate', shared: true, perk: 'spares',
    title: 'Cargar 2 cajas de repuestos de la báscula a la nave', verb: 'Levantar una caja de repuestos', dropVerb: 'Cargar la caja en la nave',
    result: 'cargó el kit de repuestos: la primera reparación costará la mitad',
  },
  {
    id: 'validation.review', stage: 'validation', role: 'engineer', kind: 'menu', at: 'assembly', tool: 'builder',
    title: 'Dejar el cohete sin errores críticos', verb: 'Abrir el constructor',
    auto: noCritical,
  },
  {
    id: 'validation.fuel', stage: 'validation', role: 'engineer', kind: 'timing', at: 'pump',
    title: 'Purgar las líneas de combustible', verb: 'Operar la bomba',
    how: 'Abre la válvula cuando la presión pase por la zona verde. Tres aciertos.',
    result: 'purgó las líneas de combustible',
  },
  {
    id: 'validation.checklist', stage: 'validation', role: 'pilot', kind: 'switches', at: 'checklist', game: { labels: CABIN_SWITCHES, count: 6 },
    title: 'Hacer la lista de despegue en el tablero de cabina', verb: 'Hacer la lista de despegue',
    how: 'Sigue la lista: activa cada interruptor en el orden que se pide.',
    result: 'completó la lista de despegue',
  },

  // ---------- Superficie (el estado lo lleva server/flight.js; aquí solo se listan) ----------
  {
    id: 'surface.scan', stage: 'surface', role: 'scientist', kind: 'auto',
    title: 'Ubicar el Prisma: escanea y cruza las distancias', auto: (data) => Boolean(data.flight?.located || data.flight?.prism),
  },
  {
    id: 'surface.dig', stage: 'surface', role: 'engineer', kind: 'dial', at: 'site', send: { type: 'flight:dig' },
    title: 'Perforar donde está enterrado el Prisma', verb: 'Perforar', how: 'Mantén la presión del taladro en la zona verde.',
    auto: (data) => Boolean(data.flight?.dug || data.flight?.prism),
  },
  {
    id: 'surface.haul', stage: 'surface', role: 'merchant', kind: 'carry', from: 'site', to: 'hatch', count: 1, item: 'prism', shared: true,
    title: 'Cargar el Prisma hasta el módulo lunar', verb: 'Levantar el Prisma', dropVerb: 'Guardar el Prisma en el contenedor',
    auto: (data) => Boolean(data.flight?.prism),
  },
  {
    id: 'surface.solar', stage: 'surface', role: 'pilot', kind: 'timing', at: 'solar', send: { type: 'flight:solar' },
    title: 'Desplegar el panel solar de campo', verb: 'Desplegar el panel', how: 'Suelta cada traba cuando la marca pase por la zona verde.',
    auto: (data) => Boolean(data.flight?.solar),
  },
];

// ---------- Misión 2 (Marte) ----------
// La preparación usa los mismos puestos de la estación, con otro trabajo en cada uno.
const MARS_ROUTE = ['Subir a órbita terrestre', 'Inyección hacia Marte', 'Corrección de rumbo', 'Entrar en órbita de Marte', 'Entrada en la atmósfera', 'Aterrizar en Marte'];
const MARS_PREP = {
  'briefing.scope': { title: 'Seguir una tormenta de polvo de Marte con el telescopio', result: 'siguió una tormenta marciana y marcó la temporada de rayos', perk: undefined },
  'briefing.budget': { title: 'Llevar la ficha de presupuesto de la caja fuerte a la terminal' },
  'briefing.power': { title: 'Conectar la energía de la torre de ensamblaje' },
  'briefing.window': { title: 'Ensayar la ventana de lanzamiento a Marte (se abre cada 26 meses)', result: 'ensayó la ventana de lanzamiento a Marte' },
  'planning.sample': { title: 'Llevar el meteorito marciano al analizador', verb: 'Tomar el meteorito marciano', dropVerb: 'Poner el meteorito en el analizador', result: 'puso el meteorito marciano en el analizador' },
  'planning.analyze': { title: 'Analizar el meteorito para elegir la zona de aterrizaje', result: 'analizó el suelo marciano y eligió una zona firme para aterrizar' },
  'planning.stock': { title: 'Pesar la carga del experimento: 3 cajas del muelle a la báscula' },
  'planning.crane': { title: 'Calibrar la grúa para la nave interplanetaria' },
  'planning.route': { title: 'Ordenar las maniobras del viaje a Marte', how: 'Toca las maniobras en el orden en que se vuelan, de la Tierra a Marte.', result: 'trazó la ruta a Marte', game: { items: MARS_ROUTE } },
  'market.calibrate': { title: 'Calibrar los instrumentos del experimento en el banco', verb: 'Calibrar los instrumentos', result: 'calibró los instrumentos del experimento', perk: undefined },
  'market.buy': {},
  'market.bench': {},
  'market.sim': { title: 'Practicar la inyección hacia Marte en el simulador', result: 'practicó la inyección hacia Marte' },
  'build.instruments': { title: 'Llevar el módulo experimental del laboratorio a la compuerta de carga', verb: 'Tomar el módulo experimental', dropVerb: 'Cargar el módulo experimental', result: 'cargó el módulo experimental en la nave' },
  'build.deliver': {},
  'build.rocket': {},
  'build.cabin': {},
  'validation.container': { title: 'Llevar el Prisma en su contenedor a la compuerta de carga', verb: 'Tomar el contenedor con el Prisma', result: 'cargó el Prisma en la nave' },
  'validation.cargo': {},
  'validation.review': {},
  'validation.fuel': {},
  'validation.checklist': {},
};
TASKS.push(...TASKS.filter((task) => MARS_PREP[task.id]).map((task) => ({
  ...task, ...MARS_PREP[task.id], id: `mars.${task.id}`, mission: 'mars', needs: task.needs?.map((id) => `mars.${id}`),
})));

// En Marte (mapa `mars` de js/worldmaps.js). Cada etapa termina cuando Vuelo da el paso siguiente.
const RIG_ORDER = ['Base y anclajes', 'Torre', 'Brazo del Prisma', 'Pararrayos', 'Condensador'];
const mars = (stage, id, role, rest) => ({ id: `mars.${stage}.${id}`, mission: 'mars', stage, role, ...rest });
TASKS.push(
  // ---------- Superficie: explorar y armar el experimento ----------
  mars('surface', 'samples', 'scientist', { kind: 'carry', from: 'outcrop', to: 'labcart', count: 3, item: 'sample',
    title: 'Recoger 3 muestras de roca y llevarlas al laboratorio de campo', verb: 'Recoger una muestra de roca', dropVerb: 'Dejar la muestra en el laboratorio', result: 'juntó las muestras de roca marciana' }),
  mars('surface', 'params', 'scientist', { kind: 'tune', at: 'labcart', needs: ['mars.surface.samples'],
    title: 'Analizar las muestras y fijar los parámetros del experimento', verb: 'Analizar las muestras', how: 'Iguala tu señal con el espectro de la roca.', result: 'fijó los parámetros del experimento' }),
  mars('surface', 'signal', 'scientist', { kind: 'dial', at: 'outcrop',
    title: 'Medir la señal del Prisma en la formación rocosa', verb: 'Medir la señal del Prisma', how: 'Mantén la aguja en la zona verde: ahí la señal es más fuerte.', result: 'confirmó que este es el lugar: la roca responde al Prisma' }),
  mars('surface', 'unload', 'merchant', { kind: 'carry', from: 'hatch', to: 'depot', count: 3, item: 'crate', shared: true,
    title: 'Descargar 3 cajas de suministros al depósito', verb: 'Bajar una caja del módulo', dropVerb: 'Dejar la caja en el depósito', result: 'descargó los suministros' }),
  mars('surface', 'materials', 'merchant', { kind: 'carry', from: 'depot', to: 'rig', count: 2, item: 'crate', shared: true, needs: ['mars.surface.unload'],
    title: 'Llevar 2 cajas de materiales al lugar del aparato', verb: 'Levantar una caja de materiales', dropVerb: 'Entregar los materiales', result: 'entregó los materiales del aparato' }),
  mars('surface', 'rig', 'engineer', { kind: 'order', at: 'rig', needs: ['mars.surface.materials'], game: { items: RIG_ORDER },
    title: 'Armar el aparato del experimento, pieza por pieza', verb: 'Armar el aparato', how: 'Toca las piezas en el orden en que se montan, de abajo hacia arriba.', result: 'armó el aparato del experimento' }),
  mars('surface', 'cables', 'engineer', { kind: 'wires', at: 'rig', needs: ['mars.surface.rig'],
    title: 'Conectar los cables del aparato al generador', verb: 'Conectar los cables', how: 'Une cada cable con el enchufe de su mismo color y símbolo.', result: 'conectó el aparato al generador' }),
  mars('surface', 'power', 'engineer', { kind: 'dial', at: 'generator',
    title: 'Calibrar el generador', verb: 'Calibrar el generador', how: 'Mantén la aguja dentro de la zona verde hasta llenar la barra.', result: 'dejó el generador calibrado' }),
  mars('surface', 'link', 'pilot', { kind: 'timing', at: 'dish',
    title: 'Enlazar la antena de campo con la Tierra', verb: 'Apuntar la antena', how: 'Presiona cuando la marca pase por la ventana verde. Tres aciertos.', result: 'abrió el enlace con la Tierra' }),
  mars('surface', 'weather', 'pilot', { kind: 'tune', at: 'mast',
    title: 'Leer el mástil meteorológico: ¿cuándo llega la tormenta?', verb: 'Leer el mástil', how: 'Iguala tu señal con la presión del aire.', result: 'calculó cuándo llega la tormenta' }),
  mars('surface', 'prism', 'scientist', { kind: 'carry', from: 'hatch', to: 'rig', count: 1, item: 'prism', needs: ['mars.surface.cables'],
    title: 'Llevar el Prisma del módulo al aparato', verb: 'Sacar el Prisma del contenedor', dropVerb: 'Colocar el Prisma en el aparato', result: 'colocó el Prisma en el aparato' }),

  // ---------- Tormenta: sostener el experimento ----------
  mars('storm', 'hold', 'engineer', { kind: 'timing', at: 'rig',
    title: 'Sujetar el aparato contra las ráfagas', verb: 'Tensar los anclajes', how: 'Tensa cada anclaje justo cuando pasa la ráfaga. Tres aciertos.', result: 'sostuvo el aparato en pie' }),
  mars('storm', 'shields', 'merchant', { kind: 'carry', from: 'depot', to: 'rig', count: 2, item: 'crate', shared: true,
    title: 'Llevar 2 escudos de emergencia al aparato', verb: 'Tomar un escudo de emergencia', dropVerb: 'Poner el escudo', result: 'protegió el aparato del polvo' }),
  mars('storm', 'reading', 'scientist', { kind: 'tune', at: 'labcart',
    title: 'Mantener estable la lectura del Prisma', verb: 'Vigilar el Prisma', how: 'El Prisma vibra: iguala tu señal con la suya.', result: 'mantuvo estable la lectura del Prisma' }),
  mars('storm', 'link', 'pilot', { kind: 'dial', at: 'dish',
    title: 'Mantener el enlace a pesar de la interferencia', verb: 'Sostener el enlace', how: 'Mantén la aguja en la zona verde entre la estática.', result: 'mantuvo el enlace durante la tormenta' }),

  // ---------- El despertar: registrar lo que pasó ----------
  mars('bloom', 'record', 'scientist', { kind: 'tune', at: 'labcart',
    title: 'Registrar los resultados del experimento', verb: 'Registrar los resultados', how: 'Iguala tu señal con la nueva lectura del Prisma.', result: 'registró los resultados: el suelo cambió' }),
  mars('bloom', 'sprout', 'merchant', { kind: 'carry', from: 'outcrop', to: 'hatch', count: 1, item: 'sample', shared: true,
    title: 'Guardar una muestra del primer brote en el módulo', verb: 'Tomar una muestra del brote', dropVerb: 'Guardar la muestra', result: 'guardó la primera muestra de vida marciana' }),
  mars('bloom', 'secure', 'engineer', { kind: 'switches', at: 'rig', game: { labels: ['Condensador', 'Pararrayos', 'Generador', 'Anclajes', 'Sensores', 'Luces'], count: 5 },
    title: 'Apagar y asegurar el aparato', verb: 'Apagar el aparato', how: 'Sigue la lista: apaga cada sistema en el orden que se pide.', result: 'dejó el aparato apagado y seguro' }),
  mars('bloom', 'news', 'pilot', { kind: 'timing', at: 'dish',
    title: 'Transmitir la noticia a la Tierra', verb: 'Transmitir a la Tierra', how: 'Envía cada paquete cuando la marca pase por la ventana verde.', result: 'avisó a la Tierra: Marte está despertando' }),
);

// ---------- Misión 3 (Proyecto NOAH: cuatro arcas) ----------
// Mapas `yard` (astillero), `bridge` (puente de la flota) y `colony` (js/worldmaps.js).
// Una tarea con `ark` es de esa arca: si el arca se perdió en el viaje, ya no cuenta (`skip`).
const exo = (stage, id, role, rest) => ({ id: `exodus.${stage}.${id}`, mission: 'exodus', stage, role, ...rest });
const arkLost = (arkId) => (data) => Boolean(data.fleet?.journey?.arks?.[arkId]?.lost);
const FLEET_PLAN = ['Repartir los recursos', 'Construir las cuatro arcas', 'Lanzarlas una tras otra', 'Viajar en formación', 'Aterrizar en Marte', 'Fundar la colonia'];
const ENGINE_JOBS = { john: 'wires', ringo: 'dial', george: 'timing', paul: 'wires' };
const OWN_CARGO = {
  john: { item: 'instrument', what: 'los equipos técnicos' }, ringo: { item: 'container', what: 'las medicinas' },
  george: { item: 'sample', what: 'las semillas' }, paul: { item: 'chip', what: 'los archivos de la humanidad' },
};
TASKS.push(
  // ---------- Proyecto NOAH: conocer el astillero ----------
  exo('briefing', 'seeds', 'scientist', { kind: 'tune', at: 'biolab', title: 'Revisar el banco de semillas', verb: 'Revisar el banco de semillas', how: 'Iguala tu señal con la del banco: así se sabe que las semillas siguen vivas.', result: 'comprobó que el banco de semillas está vivo' }),
  exo('briefing', 'inventory', 'merchant', { kind: 'carry', from: 'depot', to: 'allot', count: 1, item: 'chip', title: 'Llevar el inventario del Proyecto NOAH a la mesa de recursos', verb: 'Tomar el inventario', dropVerb: 'Cargar el inventario en la mesa', result: 'cargó el inventario: ya se sabe con qué se cuenta' }),
  exo('briefing', 'power', 'engineer', { kind: 'wires', at: 'power', title: 'Dar energía al astillero', verb: 'Abrir el tablero eléctrico', how: 'Une cada cable con el enchufe de su mismo color y símbolo.', result: 'dio energía a las cuatro gradas' }),
  exo('briefing', 'plan', 'pilot', { kind: 'order', at: 'navdesk', game: { items: FLEET_PLAN }, title: 'Ordenar el plan de la flota', verb: 'Trazar el plan', how: 'Toca los pasos en el orden en que van a pasar.', result: 'trazó el plan de la flota' }),

  // ---------- Reparto: decidir ----------
  exo('planning', 'samples', 'scientist', { kind: 'carry', from: 'biolab', to: 'depot', count: 2, item: 'sample', title: 'Preparar 2 lotes de muestras biológicas para embarcar', verb: 'Tomar un lote de muestras', dropVerb: 'Dejar el lote en el depósito', result: 'dejó listas las muestras biológicas' }),
  exo('planning', 'allot', 'merchant', { kind: 'menu', at: 'allot', tool: 'fleet', title: 'Repartir los recursos: ninguna arca puede quedar vacía', verb: 'Abrir la mesa de recursos', auto: (data) => Boolean(data.fleet) && fleetBuildable(data.fleet) }),
  exo('planning', 'crane', 'engineer', { kind: 'dial', at: 'crane', title: 'Calibrar la grúa del astillero', verb: 'Calibrar la grúa', how: 'Mantén la aguja dentro de la zona verde hasta llenar la barra.', result: 'calibró la grúa del astillero' }),
  exo('planning', 'route', 'pilot', { kind: 'menu', at: 'allot', tool: 'fleet', title: 'Elegir la ruta de la flota (mesa de recursos)', verb: 'Abrir la mesa de recursos', auto: (data) => Boolean(data.fleet?.routeDecided) }),

  // ---------- Construcción: cuatro tareas por arca ----------
  ...ARKS.flatMap((ark) => [
    exo('build', `${ark.id}.materials`, 'merchant', { ark: ark.id, kind: 'carry', from: 'depot', to: `${ark.id}.cargo`, count: 2, item: 'crate', shared: true,
      title: `${ark.name}: llevar 2 cajas de materiales`, verb: `Levantar materiales para ${ark.name}`, dropVerb: `Entregar los materiales de ${ark.name}`, result: `entregó los materiales de ${ark.name}` }),
    exo('build', `${ark.id}.engines`, 'engineer', { ark: ark.id, kind: ENGINE_JOBS[ark.id], at: `${ark.id}.bay`, needs: [`exodus.build.${ark.id}.materials`],
      title: `${ark.name}: instalar la propulsión`, verb: `Instalar la propulsión de ${ark.name}`, how: 'Hazlo con cuidado: de esto depende que el arca despegue.', result: `instaló la propulsión de ${ark.name}` }),
    exo('build', `${ark.id}.cargo`, 'scientist', { ark: ark.id, kind: 'carry', from: 'biolab', to: `${ark.id}.cargo`, count: 1, item: OWN_CARGO[ark.id].item,
      title: `${ark.name}: cargar ${OWN_CARGO[ark.id].what}`, verb: `Tomar ${OWN_CARGO[ark.id].what}`, dropVerb: `Cargar en ${ark.name}`, result: `cargó ${OWN_CARGO[ark.id].what} en ${ark.name}` }),
    exo('build', `${ark.id}.nav`, 'pilot', { ark: ark.id, kind: 'switches', at: `${ark.id}.console`, game: { labels: ['Guiado', 'Radio', 'Giróscopos', 'Rastreador', 'Reloj', 'Enlace de flota'], count: 4 },
      title: `${ark.name}: configurar la navegación`, verb: `Configurar la navegación de ${ark.name}`, how: 'Sigue la lista: activa cada interruptor en el orden que se pide.', result: `dejó lista la navegación de ${ark.name}` }),
  ]),

  // ---------- Lanzamientos ----------
  exo('launch', 'seal', 'scientist', { kind: 'tune', at: 'biolab', title: 'Sellar la carga viva antes del despegue', verb: 'Sellar la carga viva', how: 'Iguala la presión de las cámaras con la de las arcas.', result: 'selló la carga viva' }),
  exo('launch', 'manifest', 'merchant', { kind: 'carry', from: 'allot', to: 'depot', count: 1, item: 'chip', title: 'Cerrar el manifiesto de la flota', verb: 'Tomar el manifiesto', dropVerb: 'Archivar el manifiesto', result: 'cerró el manifiesto: todo lo que viaja está anotado' }),
  ...ARKS.flatMap((ark) => [
    exo('launch', `${ark.id}.fuel`, 'engineer', { ark: ark.id, kind: 'dial', at: `${ark.id}.bay`, title: `${ark.name}: cargar combustible`, verb: `Cargar combustible en ${ark.name}`, how: 'Mantén la presión en la zona verde hasta llenar los tanques.', result: `llenó los tanques de ${ark.name}` }),
    exo('launch', `${ark.id}.go`, 'pilot', { ark: ark.id, kind: 'timing', at: `${ark.id}.console`, needs: [`exodus.launch.${ark.id}.fuel`], title: `${ark.name}: dar la orden de despegue`, verb: `Lanzar a ${ark.name}`, how: 'Da la orden cuando la marca pase por la ventana de lanzamiento. Tres aciertos.', result: `lanzó a ${ark.name}, ${ark.title}` }),
  ]),

  // ---------- Viaje de la flota (puente) ----------
  exo('fleet', 'course', 'pilot', { kind: 'burnSim', at: 'helm', title: 'Corregir el rumbo de la flota', verb: 'Corregir el rumbo', how: 'Mantén la nariz sobre la marca y corta el motor justo al llegar al Δv pedido.', result: 'corrigió el rumbo de las cuatro arcas' }),
  exo('fleet', 'formation', 'pilot', { kind: 'timing', at: 'formation', title: 'Mantener la formación', verb: 'Ajustar la formación', how: 'Ajusta cada arca cuando pase por su lugar. Tres aciertos.', result: 'mantuvo a la flota en formación' }),
  exo('fleet', 'garden', 'scientist', { kind: 'tune', at: 'bio', title: 'Vigilar los ecosistemas de George', verb: 'Vigilar los ecosistemas', how: 'Iguala la luz y la humedad con las que piden las plantas.', result: 'mantuvo vivos los ecosistemas de George' }),
  exo('fleet', 'stores', 'merchant', { kind: 'carry', from: 'loose', to: 'stores', count: 3, item: 'crate', shared: true, title: 'Repartir 3 cajas de víveres entre las arcas', verb: 'Levantar una caja de víveres', dropVerb: 'Enviar la caja por la esclusa', result: 'repartió los víveres entre las arcas' }),
  exo('fleet', 'repair', 'engineer', { kind: 'wires', at: 'engine', title: 'Reparar la avería de la nave insignia', verb: 'Reparar la avería', how: 'Vuelve a conectar cada cable con su enchufe.', result: 'reparó la avería en pleno viaje' }),
  exo('fleet', 'power', 'engineer', { kind: 'dial', at: 'breaker', title: 'Repartir la energía de la flota', verb: 'Repartir la energía', how: 'Mantén la aguja en la zona verde: ni de más ni de menos.', result: 'repartió la energía entre las arcas' }),

  // ---------- Llegada ----------
  exo('arrival', 'sites', 'scientist', { kind: 'tune', at: 'bio', title: 'Elegir los sitios de aterrizaje junto al verde nuevo', verb: 'Elegir los sitios', how: 'Iguala tu señal con la del suelo fértil.', result: 'eligió dónde baja cada arca' }),
  exo('arrival', 'secure', 'merchant', { kind: 'carry', from: 'loose', to: 'stores', count: 2, item: 'crate', shared: true, title: 'Asegurar 2 cajas sueltas para la entrada', verb: 'Levantar una caja suelta', dropVerb: 'Asegurar la caja', result: 'aseguró la carga para la entrada' }),
  exo('arrival', 'legs', 'engineer', { kind: 'timing', at: 'engine', title: 'Desplegar las patas de las arcas', verb: 'Desplegar las patas', how: 'Suelta cada traba cuando la marca pase por la zona verde.', result: 'desplegó las patas de las arcas' }),
  exo('arrival', 'entry', 'pilot', { kind: 'dial', at: 'formation', title: 'Guiar la entrada de la flota en la atmósfera', verb: 'Guiar la entrada', how: 'Mantén el ángulo de entrada en la zona verde.', result: 'guió la entrada de la flota' }),
  exo('arrival', 'landing', 'pilot', { kind: 'landing', at: 'helm', needs: ['exodus.arrival.entry'], title: 'Aterrizar a mano la primera arca', verb: 'Tomar los mandos: aterrizar', how: 'Pósate despacio y derecho. Las demás siguen tu huella.', result: 'posó la primera arca: las demás bajaron detrás' }),

  // ---------- La colonia: cada arca aporta lo suyo ----------
  exo('colony', 'john.tower', 'engineer', { ark: 'john', skip: arkLost('john'), kind: 'wires', at: 'tower', title: 'John: levantar la torre de energía y comunicaciones', verb: 'Conectar la torre', how: 'Une cada cable con su enchufe.', result: 'levantó la torre: la colonia tiene energía' }),
  exo('colony', 'john.beacon', 'pilot', { ark: 'john', skip: arkLost('john'), kind: 'timing', at: 'tower', needs: ['exodus.colony.john.tower'], title: 'John: encender el faro de navegación', verb: 'Encender el faro', how: 'Sincroniza el faro con los satélites. Tres aciertos.', result: 'encendió el faro de navegación' }),
  exo('colony', 'ringo.supplies', 'merchant', { ark: 'ringo', skip: arkLost('ringo'), kind: 'carry', from: 'ringo.ark', to: 'habitat', count: 3, item: 'crate', shared: true, title: 'Ringo: llevar 3 cajas de víveres y medicinas al hábitat', verb: 'Bajar una caja de Ringo', dropVerb: 'Guardar la caja en el hábitat', result: 'abasteció el hábitat' }),
  exo('colony', 'ringo.water', 'engineer', { ark: 'ringo', skip: arkLost('ringo'), kind: 'dial', at: 'habitat', title: 'Ringo: poner en marcha el agua', verb: 'Abrir el agua', how: 'Mantén la presión en la zona verde.', result: 'puso en marcha el agua del hábitat' }),
  exo('colony', 'george.seeds', 'scientist', { ark: 'george', skip: arkLost('george'), kind: 'carry', from: 'george.ark', to: 'garden', count: 3, item: 'sample', title: 'George: plantar 3 lotes de semillas', verb: 'Tomar un lote de semillas', dropVerb: 'Plantar las semillas', result: 'plantó los primeros cultivos' }),
  exo('colony', 'george.balance', 'scientist', { ark: 'george', skip: arkLost('george'), kind: 'tune', at: 'garden', needs: ['exodus.colony.george.seeds'], title: 'George: equilibrar el ecosistema del invernadero', verb: 'Equilibrar el ecosistema', how: 'Iguala luz y humedad con lo que piden las plantas.', result: 'equilibró el ecosistema' }),
  exo('colony', 'paul.archive', 'merchant', { ark: 'paul', skip: arkLost('paul'), kind: 'carry', from: 'paul.ark', to: 'school', count: 2, item: 'chip', shared: true, title: 'Paul: llevar 2 archivos de la humanidad a la escuela', verb: 'Tomar un archivo', dropVerb: 'Guardar el archivo en la escuela', result: 'guardó la historia de la humanidad en la escuela' }),
  exo('colony', 'paul.families', 'pilot', { ark: 'paul', skip: arkLost('paul'), kind: 'order', at: 'school', game: { items: ['Abrir la escotilla', 'Niños y mayores primero', 'Las familias', 'La tripulación', 'Cerrar el arca'] }, title: 'Paul: recibir a las familias', verb: 'Recibir a las familias', how: 'Toca los pasos en el orden en que bajan.', result: 'recibió a las primeras familias' }),

  // ---------- El Prisma ----------
  exo('finale', 'prism', 'scientist', { kind: 'carry', from: 'board', to: 'lever', count: 1, item: 'prism', title: 'Llevar el Prisma al monumento', verb: 'Tomar el Prisma', dropVerb: 'Colocar el Prisma en el monumento', result: 'colocó el Prisma en el monumento' }),
  exo('finale', 'offering', 'merchant', { kind: 'carry', from: 'habitat', to: 'lever', count: 1, item: 'container', shared: true, title: 'Llevar al monumento un puñado de tierra de la Tierra', verb: 'Tomar la tierra de la Tierra', dropVerb: 'Dejarla junto al Prisma', result: 'dejó tierra de la Tierra junto al Prisma' }),
  exo('finale', 'pedestal', 'engineer', { kind: 'switches', at: 'tower', game: { labels: ['Energía', 'Anclajes', 'Luces', 'Sensores', 'Enlace'], count: 4 }, title: 'Dar energía al monumento desde la torre', verb: 'Dar energía al monumento', how: 'Sigue la lista: activa cada sistema en orden.', result: 'dio energía al monumento' }),
  exo('finale', 'message', 'pilot', { kind: 'timing', at: 'school', title: 'Transmitir a quienes siguen en la Tierra', verb: 'Transmitir a la Tierra', how: 'Envía cada paquete cuando la marca pase por la ventana verde.', result: 'transmitió a la Tierra: hay un lugar para todos' }),
);

// ---------- Sandbox: nada es obligatorio salvo tener algo armado que pase la revisión ----------
TASKS.push(
  {
    id: 'sandbox.buy', mission: 'sandbox', stage: 'validation', role: 'merchant', kind: 'menu', at: 'terminal', tool: 'market',
    title: 'Comprar piezas en la terminal (créditos ilimitados)', verb: 'Abrir el mercado',
    auto: (data) => (data.economy?.inventory.length ?? 0) > 0,
  },
  {
    id: 'sandbox.build', mission: 'sandbox', stage: 'validation', role: 'engineer', kind: 'menu', at: 'assembly', tool: 'builder',
    title: 'Armar un cohete sin errores críticos', verb: 'Abrir el constructor',
    auto: noCritical,
  },
);

const BY_ID = new Map(TASKS.map((task) => [task.id, task]));
export const getTask = (id) => BY_ID.get(id);
/** Tareas de una etapa. Cada misión tiene las suyas (`task.mission`; sin ese campo son de la Luna). */
export const stageTasks = (stageId, missionId = 'moon') => TASKS.filter((task) => task.stage === stageId && (task.mission ?? 'moon') === (missionId ?? 'moon'));

/** ¿Está hecha esta tarea? Las `auto` se miran en el estado; las demás, en `data.tasks`. */
export const isTaskDone = (data, task) => Boolean(task.skip?.(data)) || (task.auto ? Boolean(task.auto(data)) : Boolean(data.tasks?.[task.id]?.done));

/** Cuántos objetos lleva entregados una tarea de cargar. */
export const taskProgress = (data, task) => data.tasks?.[task.id]?.progress ?? 0;

/**
 * Tareas que faltan para pasar de etapa. Solo cuentan las de los roles que tienen tripulante
 * conectado (`heldRoles`): un puesto libre no frena al resto (sus tareas quedan opcionales).
 */
export const missingTasks = (data, stageId, heldRoles = ROLES.map((role) => role.id)) =>
  stageTasks(stageId, data.missionId).filter((task) => heldRoles.includes(task.role) && !isTaskDone(data, task));

/** Un rol está listo cuando no le quedan tareas en la etapa. */
export const rolesReady = (data, stageId) =>
  Object.fromEntries(ROLES.map((role) => [role.id, stageTasks(stageId, data.missionId).every((task) => task.role !== role.id || isTaskDone(data, task))]));

// ---------- Trabajos de a bordo (en vuelo) ----------
/** Preparativos antes de cada encendido: cada uno mejora las chances (los aplica server/flight.js). */
export const PREP = {
  nav: { role: 'scientist', at: 'startracker', kind: 'tune', title: 'Fijar la posición con el rastreador de estrellas', verb: 'Fijar la posición', how: 'Alinea tu señal con la de la estrella guía.', gain: 'encendido más preciso' },
  trim: { role: 'engineer', at: 'trim', kind: 'dial', title: 'Ajustar la mezcla de los motores', verb: 'Ajustar los motores', how: 'Mantén la aguja de la mezcla en la zona verde.', gain: 'menos riesgo de falla' },
  cargo: { role: 'merchant', at: 'loose', kind: 'carry', title: 'Asegurar la carga suelta en los estantes', gain: 'la nave apunta mejor' },
};

/** Cosas que se cargan a bordo sin ser tareas de etapa. */
export const JOBS = {
  cargo: { id: 'cargo', role: 'merchant', shared: true, from: 'loose', to: 'racks', count: 2, item: 'crate', verb: 'Levantar una caja suelta', dropVerb: 'Asegurar la caja' },
  spare: { id: 'spare', role: 'merchant', shared: false, item: 'spare', verb: 'Sacar el repuesto' },
};

/** Dónde aparece cada avería, y de dónde sale el repuesto, según el mapa. */
export const FAULT_STATION = {
  mars: { engine: 'hatch', leak: 'hatch', antenna: 'dish', scanner: 'labcart' },
  ship: { engine: 'engineBay', leak: 'engineBay', antenna: 'antenna', scanner: 'scanner' },
  moon: { engine: 'hatch', leak: 'hatch', antenna: 'hatch', scanner: 'cart' },
};
export const SPARE_STATION = {
  mars: () => 'depot',
  ship: () => 'spares',
  moon: (kind) => (kind === 'scanner' ? 'hatch' : 'cart'),
};
