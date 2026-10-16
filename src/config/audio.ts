/**
 * Volumen del sonido de ambiente: apagado, bajo, medio o alto. Igual que la calidad gráfica (config/quality.ts):
 * se recuerda en este navegador (no en la partida: un guardado viejo o nuevo carga igual) y se fuerza con
 * `?audio=off|low|medium|high` o `lifesim.audio('low')`. En el juego, el botón «Sonido» o la tecla N.
 * Empieza bajo: la ciudad se oye de fondo, no por encima.
 */
export type AudioLevel = 'off' | 'low' | 'medium' | 'high';
export const AUDIO_LEVELS: readonly AudioLevel[] = ['off', 'low', 'medium', 'high'];
export const AUDIO_LABEL: Readonly<Record<AudioLevel, string>> = { off: 'apagado', low: 'bajo', medium: 'medio', high: 'alto' };
/** Ganancia general de cada nivel, antes del limitador. Alto sigue siendo discreto. */
export const AUDIO_GAIN: Readonly<Record<AudioLevel, number>> = { off: 0, low: 0.18, medium: 0.32, high: 0.5 };

const KEY = 'lifesim.audio';

export function loadAudioLevel(): AudioLevel {
  if (typeof window === 'undefined') return 'low';
  const asked = new URLSearchParams(window.location.search).get('audio');
  if (asked && AUDIO_LEVELS.includes(asked as AudioLevel)) return asked as AudioLevel;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved && AUDIO_LEVELS.includes(saved as AudioLevel)) return saved as AudioLevel;
  } catch {
    // Sin almacenamiento (modo privado): el de por defecto.
  }
  return 'low';
}

export function saveAudioLevel(level: AudioLevel): void {
  try {
    window.localStorage.setItem(KEY, level);
  } catch {
    // Sin almacenamiento: vale para esta sesión.
  }
}
