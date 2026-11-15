/**
 * TABLA DE RÉCORDS (servidor)
 * Cada misión terminada deja una fila: tripulación, misión, resultado, puntos del equipo, ciencia,
 * plan elegido, dificultad e intentos. Se guardan las mejores en memoria y en `data/records.json`
 * (si el disco no deja escribir, por ejemplo en algunos servidores gratis, quedan solo en memoria).
 *
 * El orden premia lo que pide el reto: primero las misiones cumplidas, después los puntos del equipo.
 * Solo se guarda lo público (nombres de piloto y números): nada que identifique a nadie fuera del juego.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'records.json');
export const RECORDS_KEPT = 50;

/** @typedef {{ team: string[], missionId: string, missionTitle: string, ok: boolean, points: number, science: number, scienceMax: number, site: string | null, orbit: string | null, difficulty: string, attempt: number, objectives: string, at: number }} MissionRecord */

const load = () => {
  try {
    const saved = JSON.parse(readFileSync(FILE, 'utf8'));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

/** @type {MissionRecord[]} */
let records = [];
let persistOn = false;

/** Lo llama server.js al arrancar: lee la tabla guardada y desde ahí guarda cada cambio (las pruebas no). */
export const useRecordFile = () => {
  persistOn = true;
  records = load();
};

const rank = (a, b) => Number(b.ok) - Number(a.ok) || b.points - a.points || b.science - a.science || a.at - b.at;

/** Las mejores misiones, ya ordenadas. */
export const listRecords = (limit = 20) => records.slice(0, limit);

/**
 * Anota una misión terminada y devuelve su puesto en la tabla (1 = el mejor), o null si no entró.
 * @param {MissionRecord} entry
 * @param {{ persist?: boolean }} [options]
 */
export const addRecord = (entry, { persist = persistOn } = {}) => {
  records = [...records, entry].sort(rank).slice(0, RECORDS_KEPT);
  if (persist) {
    try {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE, JSON.stringify(records, null, 1));
    } catch {
      // Sin disco: la tabla dura mientras el servidor esté prendido.
    }
  }
  const place = records.indexOf(entry);
  return place === -1 ? null : place + 1;
};

/** Para las pruebas: empieza con la tabla vacía. */
export const resetRecords = () => { records = []; };
