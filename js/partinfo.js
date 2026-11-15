/**
 * CÓMO SE MUESTRA UNA PIEZA
 * Formatos de números y qué datos de cada tipo de pieza vale la pena mostrar.
 * Lo usan el mercado y (después) el constructor, para que una pieza se lea igual en todos lados.
 */
import { CONDITIONS, PROPELLANTS, TIERS } from './catalog.js';

/** Número con punto de miles y coma decimal, siempre igual (15.000 · 4.889 · 97,6) en navegador y servidor. */
export const number = (value, digits = 0) => {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  const [whole, decimals] = Math.abs(rounded).toString().split('.');
  return `${rounded < 0 ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${decimals ? `,${decimals}` : ''}`;
};
export const credits = (value) => `${number(Math.round(value))} cr`;
export const mass = (kg) => (kg >= 1000 ? `${number(kg / 1000, 1)} t` : `${number(Math.round(kg))} kg`);
export const force = (newtons) => (newtons >= 1e6 ? `${number(newtons / 1e6, 2)} MN` : `${number(newtons / 1e3)} kN`);
export const power = (watts) => `${number(Math.round(watts))} W`;
export const energy = (joules) => `${number(joules / 3.6e6, 1)} kWh`;
/** Probabilidad de que NO falle en un uso, en porcentaje. */
export const reliability = (failureRate) => `${number((1 - failureRate) * 100, 1)} %`;

export const tierOf = (id) => TIERS.find((tier) => tier.id === id) ?? TIERS[0];
export const conditionName = (id) => CONDITIONS[id]?.name ?? id;

/** Explicaciones cortas de los términos que aparecen en las fichas. */
export const GLOSSARY = {
  thrust: 'Empuje: la fuerza con la que el motor empuja la nave.',
  isp: 'Isp (impulso específico): cuánto rinde el combustible. Más segundos = más cambio de velocidad con el mismo combustible.',
  mass: 'Masa de la pieza vacía. Todo lo que pesa hay que empujarlo.',
  capacity: 'Combustible que le cabe al tanque.',
  reliability: 'Confiabilidad: probabilidad de que la pieza no falle cada vez que se usa (valor de juego).',
  powerOutput: 'Energía que genera.',
  powerDraw: 'Energía que consume mientras está encendida.',
  energyCapacity: 'Energía que puede guardar.',
};

/**
 * Las columnas que distinguen a una versión de otra, según el tipo de pieza.
 * Cada una: { key, label, value(pieza resuelta) }.
 */
export const versionColumns = (part) => {
  const columns = [];
  if (part.kind === 'engine') {
    columns.push({ key: 'thrust', label: 'Empuje', value: (item) => force(item.thrust) });
    columns.push({ key: 'isp', label: 'Isp', value: (item) => `${number(Math.round(item.isp))} s` });
  }
  if (part.powerOutput) columns.push({ key: 'powerOutput', label: 'Genera', value: (item) => power(item.powerOutput) });
  if (part.energyCapacity) columns.push({ key: 'energyCapacity', label: 'Guarda', value: (item) => energy(item.energyCapacity) });
  if (part.powerDraw) columns.push({ key: 'powerDraw', label: 'Consume', value: (item) => power(item.powerDraw) });
  if (part.science) columns.push({ key: 'science', label: 'Ciencia', value: (item) => `${item.science} pts` });
  if (part.dataRate) columns.push({ key: 'dataRate', label: 'Datos', value: (item) => `${number(item.dataRate)} MB/h` });
  if (part.downlink) columns.push({ key: 'downlink', label: 'Envía', value: (item) => `${number(item.downlink)} MB/h` });
  columns.push({ key: 'mass', label: 'Masa', value: (item) => mass(item.mass) });
  columns.push({ key: 'reliability', label: 'Confiab.', value: (item) => reliability(item.failureRate) });
  return columns;
};

/** Datos que no cambian con la rareza (van una sola vez en la ficha). */
export const fixedFacts = (part) => {
  const facts = [];
  if (part.propellant) facts.push(`Combustible: ${PROPELLANTS[part.propellant].name.toLowerCase()}`);
  if (part.kind === 'tank') facts.push(`Le caben ${mass(part.capacity)}`);
  if (part.kind === 'engine') facts.push(part.thrustSea > 0 ? `Al nivel del mar: ${force(part.thrustSea)}` : 'No funciona al nivel del mar');
  if (part.crew) facts.push(`Tripulación: ${part.crew}`);
  if (part.like) facts.push(`Aproximado, ${part.like}`);
  return facts;
};
