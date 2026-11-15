/**
 * SONIDOS
 * Efectos generados por el navegador (no hay archivos de audio). Volumen en el botón ⚙.
 * Si quieres sonidos propios, ponlos en assets/ y cámbialos aquí.
 */
import { storage } from './connection.js';

let audioContext = null;
let prefs = storage.get('adastra.sound', { volume: 0.6, muted: false });

export const getSoundPrefs = () => ({ ...prefs });

export const setSoundPrefs = (changes) => {
  prefs = { ...prefs, ...changes };
  storage.set('adastra.sound', prefs);
};

const tone = ({ from, to = from, duration, type = 'sine', gain = 0.15, delay = 0 }) => {
  if (prefs.muted || prefs.volume <= 0) return;
  try {
    audioContext ??= new AudioContext();
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    volume.gain.setValueAtTime(gain * prefs.volume, start);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  } catch {
    // Sin audio disponible: el juego sigue sin sonido.
  }
};

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
  /** Mensaje nuevo en el chat. */
  message: () => tone({ from: 880, to: 1180, duration: 0.08, gain: 0.05 }),
};
