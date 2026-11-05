/**
 * Zoom elegido por el jugador: posición en los niveles de world/PixelScale.zoomLevels (el primero al acercar, fino).
 * 0 = el zoom de siempre. Se recuerda en este navegador (patrón de config/quality).
 */
const KEY = 'lifesim.zoom';

function load(): number {
  try {
    const n = Number(window.localStorage.getItem(KEY));
    return Number.isInteger(n) ? n : 0;
  } catch {
    return 0; // Sin almacenamiento: vale para esta sesión.
  }
}

let current = load();
const listeners = new Set<() => void>();

export const zoomPreference = {
  get: (): number => current,
  /** Quien llama ya lo ha recortado al rango de su pantalla (WorldScene.zoomBy): así no se acumulan pasos de más. */
  set(step: number): void {
    if (step === current) return;
    current = step;
    try {
      window.localStorage.setItem(KEY, String(step));
    } catch {
      // Sin almacenamiento: vale para esta sesión.
    }
    listeners.forEach((cb) => cb());
  },
  /** Devuelve la función que deja de escuchar. */
  onChange(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
