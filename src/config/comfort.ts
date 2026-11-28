/**
 * Confort de lectura y de vista (UXN-01): tamaño de texto, contraste de diálogos, duración de mensajes, pistas
 * de interacción y parpadeos. Como el sonido (config/audio.ts), se recuerda en este navegador y no en la partida:
 * un guardado viejo o nuevo carga igual. Se elige en Ajustes de la pantalla de inicio (title.ts) y se aplica al
 * documento con atributos `data-comfort-*` que lee style.css; el juego consulta `comfortNow()`, que es memoria.
 * Nada aquí toca window, document ni localStorage al cargar el módulo: scripts/check-comfort.ts lo corre en node.
 */
export type Comfort = {
  text: 'normal' | 'large';
  contrast: 'normal' | 'high';
  messages: 'normal' | 'long';
  hints: 'visible' | 'hidden';
  flashes: 'normal' | 'reduced';
};

export const COMFORT_KEY = 'lifesim.comfort';
const VERSION = 1;

/** Los valores admitidos de cada campo, el primero es el predeterminado. Lo que no está aquí no se lee. */
export const COMFORT_OPTIONS: { readonly [K in keyof Comfort]: readonly Comfort[K][] } = {
  text: ['normal', 'large'],
  contrast: ['normal', 'high'],
  messages: ['normal', 'long'],
  hints: ['visible', 'hidden'],
  flashes: ['normal', 'reduced'],
};
export const COMFORT_FIELDS: readonly (keyof Comfort)[] = ['text', 'contrast', 'messages', 'hints', 'flashes'];
export const DEFAULT_COMFORT: Readonly<Comfort> = { text: 'normal', contrast: 'normal', messages: 'normal', hints: 'visible', flashes: 'normal' };

type ComfortStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): ComfortStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Almacenamiento bloqueado: leer o guardar falla igual que sin él.
    return null;
  }
}

/** Lo guardado, campo a campo: uno inválido vuelve a su predeterminado; JSON roto, otra forma u otra versión, todos. */
export function parseComfort(raw: string | null): Comfort {
  if (raw === null) return { ...DEFAULT_COMFORT };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_COMFORT };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_COMFORT };
  const rec = data as Record<string, unknown>;
  if (rec.v !== VERSION) return { ...DEFAULT_COMFORT };
  const pick = <K extends keyof Comfort>(k: K): Comfort[K] => ((COMFORT_OPTIONS[k] as readonly unknown[]).includes(rec[k]) ? (rec[k] as Comfort[K]) : DEFAULT_COMFORT[k]);
  return { text: pick('text'), contrast: pick('contrast'), messages: pick('messages'), hints: pick('hints'), flashes: pick('flashes') };
}

export function loadComfort(storage: ComfortStorage | null = browserStorage()): Comfort {
  try {
    return parseComfort(storage?.getItem(COMFORT_KEY) ?? null);
  } catch {
    return { ...DEFAULT_COMFORT };
  }
}

/** Escribe sólo COMFORT_KEY. Falso si el navegador no deja (bloqueado o lleno): quien llama lo dice. */
export function saveComfort(c: Comfort, storage: ComfortStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(COMFORT_KEY, JSON.stringify({ v: VERSION, text: c.text, contrast: c.contrast, messages: c.messages, hints: c.hints, flashes: c.flashes }));
    return true;
  } catch {
    return false;
  }
}

/** Lo que lee style.css: `:root[data-comfort-text="large"]` y compañía. */
export function applyComfort(c: Comfort, root: Pick<HTMLElement, 'dataset'> | null = typeof document === 'undefined' ? null : document.documentElement): void {
  if (!root) return;
  root.dataset.comfortText = c.text;
  root.dataset.comfortContrast = c.contrast;
  root.dataset.comfortMessages = c.messages;
  root.dataset.comfortHints = c.hints;
  root.dataset.comfortFlashes = c.flashes;
}

export function sameComfort(a: Comfort, b: Comfort): boolean {
  return COMFORT_FIELDS.every((k) => a[k] === b[k]);
}

let confirmed: Comfort | null = null;

/** Lo confirmado (guardado o cargado al arrancar). Memoria y sin copia: se puede preguntar cada frame. */
export function comfortNow(): Readonly<Comfort> {
  if (!confirmed) confirmed = loadComfort();
  return confirmed;
}

export function setConfirmed(c: Comfort): void {
  confirmed = { ...c };
}

/** Cuánto se ve un mensaje que se va solo: el doble con «Duración de mensajes: Larga». */
export function messageMs(normalMs: number): number {
  return comfortNow().messages === 'long' ? normalMs * 2 : normalMs;
}
