/**
 * AZAR REPETIBLE
 * Números al azar que dependen de una semilla: la misma semilla da siempre la misma secuencia.
 * Lo usa el servidor para armar el mercado de cada misión (y el dibujo, para repetir sus motas).
 */

/** Devuelve una función que da un número entre 0 y 1 cada vez que se la llama. */
export const createRng = (seed) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Un número entre min y max. */
export const between = (rng, min, max) => min + rng() * (max - min);

/** Un elemento cualquiera de la lista. */
export const pick = (rng, list) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
