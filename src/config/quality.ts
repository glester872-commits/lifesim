/**
 * Calidad gráfica: un solo motor, con lo caro encendido o apagado. Sin imports
 * de valor: los scripts de node lo cargan tal cual.
 *
 *   high   → mapa de luz a resolución completa (sombras del sol nítidas),
 *            luz de farola en tres capas, polillas en las farolas, reflejos.
 *   medium → mapa de luz a media resolución, farola en capas, reflejos.
 *   low    → lo mínimo para un móvil lento: sin capas extra ni reflejos.
 *
 * Por defecto, high en escritorio y medium en pantallas táctiles. Se fuerza con
 * `?quality=low|medium|high` o `lifesim.quality('low')` en la consola (se
 * recuerda en este navegador y se aplica al volver a entrar en un sitio).
 */
export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityFlags {
  level: QualityLevel;
  /** Píxeles de mundo por píxel del mapa de luz. */
  lightmapScale: 1 | 2;
  /** Núcleo caliente y lavado de fachada de cada farola. */
  layeredLamps: boolean;
  /** Reflejos de las luces en el suelo mojado. */
  reflections: boolean;
  /** Polillas alrededor de las farolas encendidas. */
  moths: boolean;
  /** Resplandor cálido sumado bajo farolas y escaparates de noche (una capa a 1/4, repintada sólo al cambiar la luz). */
  glow: boolean;
}

const FLAGS: Readonly<Record<QualityLevel, Omit<QualityFlags, 'level'>>> = {
  high: { lightmapScale: 1, layeredLamps: true, reflections: true, moths: true, glow: true },
  medium: { lightmapScale: 2, layeredLamps: true, reflections: true, moths: false, glow: true },
  low: { lightmapScale: 2, layeredLamps: false, reflections: false, moths: false, glow: false },
};

const KEY = 'lifesim.quality';
const LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

function detect(): QualityLevel {
  if (typeof window === 'undefined') return 'high';
  const asked = new URLSearchParams(window.location.search).get('quality');
  if (asked && LEVELS.includes(asked as QualityLevel)) return asked as QualityLevel;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved && LEVELS.includes(saved as QualityLevel)) return saved as QualityLevel;
  } catch {
    // Sin almacenamiento (modo privado): se decide por el dispositivo.
  }
  return window.matchMedia?.('(pointer: coarse)').matches ? 'medium' : 'high';
}

export const QUALITY: QualityFlags = { level: 'high', ...FLAGS.high };

export function setQuality(level: QualityLevel): void {
  Object.assign(QUALITY, { level, ...FLAGS[level] });
  try {
    window.localStorage.setItem(KEY, level);
  } catch {
    // Sin almacenamiento: vale para esta sesión.
  }
}

const initial = detect();
Object.assign(QUALITY, { level: initial, ...FLAGS[initial] });
