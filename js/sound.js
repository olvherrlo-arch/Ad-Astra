/**
 * SONIDOS Y MÚSICA
 * Todo lo genera el navegador (no hay archivos de audio). Tres volúmenes en Opciones (js/settings.js):
 * general, música y efectos, más "silenciar todo".
 *   efectos  → tonos cortos (`sounds.*`)
 *   música   → un fondo ambiental suave: acordes lentos que cambian cada pocos segundos
 * El navegador solo deja sonar audio después de un clic o una tecla: la música arranca sola con la
 * primera interacción. Si quieres sonidos propios, ponlos en assets/ y cámbialos aquí.
 */
import { getSettings, onSettings, setSettings } from './settings.js';

let audioContext = null;
/** @type {{ master: GainNode, music: GainNode, sfx: GainNode } | null} */
let buses = null;

/** Compatibilidad con el panel ⚙ del lobby: volumen general y silencio. */
export const getSoundPrefs = () => {
  const { master, muted } = getSettings();
  return { volume: master, muted };
};
export const setSoundPrefs = (changes) => setSettings({
  ...(changes.volume !== undefined ? { master: changes.volume } : {}),
  ...(changes.muted !== undefined ? { muted: changes.muted } : {}),
});

/** Ajusta los tres canales a lo que dicen las opciones (con una rampa corta para que no chasquee). */
const applyVolumes = () => {
  if (!buses || !audioContext) return;
  const prefs = getSettings();
  const at = audioContext.currentTime;
  buses.master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.master, at, 0.05);
  buses.music.gain.setTargetAtTime(prefs.music, at, 0.05);
  buses.sfx.gain.setTargetAtTime(prefs.sfx, at, 0.05);
};

const ensureAudio = () => {
  if (audioContext) return audioContext;
  audioContext = new AudioContext();
  const master = audioContext.createGain();
  const music = audioContext.createGain();
  const sfx = audioContext.createGain();
  music.connect(master);
  sfx.connect(master);
  master.connect(audioContext.destination);
  buses = { master, music, sfx };
  applyVolumes();
  return audioContext;
};

const silent = () => {
  const prefs = getSettings();
  return prefs.muted || prefs.master <= 0;
};

const tone = ({ from, to = from, duration, type = 'sine', gain = 0.15, delay = 0 }) => {
  if (silent() || getSettings().sfx <= 0) return;
  try {
    ensureAudio();
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    volume.gain.setValueAtTime(gain, start);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume).connect(buses.sfx);
    oscillator.start(start);
    oscillator.stop(start + duration);
  } catch {
    // Sin audio disponible: el juego sigue sin sonido.
  }
};

// ============================================================
//  Música ambiental
// ============================================================
// Acordes (frecuencias en Hz) de una progresión lenta y espacial: Re menor 9 → Si♭ maj7 → Fa add9 → Do sus2.
const CHORDS = [
  [146.83, 220.0, 261.63, 329.63],
  [116.54, 174.61, 220.0, 293.66],
  [174.61, 261.63, 329.63, 392.0],
  [130.81, 196.0, 293.66, 392.0],
];
const CHORD_SECONDS = 7;
let musicTimer = 0;
let chordIndex = 0;

/** Un acorde: cuatro voces suaves que entran y salen despacio, y una nota brillante arriba. */
const playChord = () => {
  if (!audioContext || !buses) return;
  const start = audioContext.currentTime + 0.05;
  const chord = CHORDS[chordIndex % CHORDS.length];
  chordIndex++;
  const voice = (frequency, gain, type, length, delay = 0) => {
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start + delay);
    oscillator.detune.setValueAtTime((Math.random() - 0.5) * 8, start + delay);
    volume.gain.setValueAtTime(0.0001, start + delay);
    volume.gain.exponentialRampToValueAtTime(gain, start + delay + length * 0.35);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + delay + length);
    oscillator.connect(volume).connect(buses.music);
    oscillator.start(start + delay);
    oscillator.stop(start + delay + length + 0.1);
  };
  chord.forEach((frequency, i) => voice(frequency, i === 0 ? 0.05 : 0.028, i === 0 ? 'sine' : 'triangle', CHORD_SECONDS + 2));
  voice(chord[2 + (chordIndex % 2)] * 2, 0.012, 'sine', 3.2, 1.5 + Math.random() * 2);
};

const musicWanted = () => !silent() && getSettings().music > 0;

/** Prende o apaga la música según las opciones. */
const updateMusic = () => {
  if (!audioContext) return;
  if (musicWanted() && !musicTimer) {
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    playChord();
    musicTimer = window.setInterval(playChord, CHORD_SECONDS * 1000);
  } else if (!musicWanted() && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = 0;
  }
};

/** La primera interacción despierta el audio (regla del navegador) y arranca la música. */
const wake = () => {
  try {
    ensureAudio();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    updateMusic();
  } catch {
    // Sin audio disponible.
  }
};
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', wake, { once: true, capture: true });
  window.addEventListener('keydown', wake, { once: true, capture: true });
  onSettings(() => {
    applyVolumes();
    updateMusic();
  });
}

export const sounds = {
  /** Alguien aparece en la nave. */
  pop: () => tone({ from: 260, to: 900, duration: 0.14, type: 'triangle', gain: 0.2 }),
  /** Cada segundo de la cuenta regresiva. */
  tick: () => tone({ from: 660, duration: 0.12, type: 'square', gain: 0.06 }),
  /** Despegue. */
  launch: () => {
    tone({ from: 140, to: 620, duration: 0.9, type: 'sawtooth', gain: 0.05 });
    tone({ from: 520, to: 1040, duration: 0.5, type: 'triangle', gain: 0.1, delay: 0.35 });
  },
  /** Revelación de roles: 'drum' = redoble de suspenso; 'hit' = golpe al dar vuelta tu carta. */
  reveal: (kind) => {
    if (kind === 'drum') {
      for (let i = 0; i < 6; i++) tone({ from: 110, to: 90, duration: 0.12, type: 'triangle', gain: 0.12, delay: i * 0.28 });
    } else {
      tone({ from: 70, to: 45, duration: 0.5, type: 'sine', gain: 0.25 });
      tone({ from: 660, to: 990, duration: 0.35, type: 'triangle', gain: 0.1, delay: 0.08 });
    }
  },
  /** Se pasa una página de la historia. */
  page: () => tone({ from: 420, to: 300, duration: 0.1, type: 'triangle', gain: 0.07 }),
  /** Algo salió bien en una tarea (minijuego terminado, caja entregada). */
  good: () => {
    tone({ from: 520, to: 780, duration: 0.12, type: 'triangle', gain: 0.12 });
    tone({ from: 780, to: 1170, duration: 0.18, type: 'triangle', gain: 0.12, delay: 0.1 });
  },
  /** Error o fuera de zona. */
  bad: () => tone({ from: 220, to: 130, duration: 0.22, type: 'sawtooth', gain: 0.06 }),
  /** Tomar, soltar o encajar algo. */
  pick: () => tone({ from: 340, to: 520, duration: 0.08, type: 'square', gain: 0.06 }),
  /** Motor empujando (se llama varias veces por segundo mientras dura). */
  thrust: (level = 1) => tone({ from: 70 + level * 30, to: 55, duration: 0.2, type: 'sawtooth', gain: 0.03 + level * 0.03 }),
  /** Mensaje nuevo en el chat. */
  message: () => tone({ from: 880, to: 1180, duration: 0.08, gain: 0.05 }),
};
