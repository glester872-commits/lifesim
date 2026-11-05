// Sin Phaser: lo usan title.ts, main.ts y scripts/check-save-slots.ts.
import { SAVE_KEY } from '../config/constants.ts';
import { getLocation } from './LocationSystem.ts';
import { inspectRaw, LocalStorageAdapter, SaveSystem, type SaveStorage } from './SaveSystem.ts';

/**
 * Ranuras de partida (LV-02). No es otro sistema de guardado: cada ranura es un SaveSystem de siempre (validación
 * antes de escribir, copia de seguridad, partida ilegible apartada, importar) sobre su propio espacio de claves.
 *
 *   ranura 1 → lifesim.save, lifesim.save.backup, lifesim.save.unreadable  (las de siempre: la partida que ya
 *              había ES la ranura 1, sin copiarla, moverla ni reescribirla; no hay migración que pueda fallar)
 *   ranura n → lifesim.save.slot<n>, lifesim.save.slot<n>.backup, lifesim.save.slot<n>.unreadable
 *
 * Además, por ranura, un resumen pequeño (`….meta`) para la lista sin leer ni restaurar la partida entera, con la
 * suma de comprobación del texto guardado: si no coincide (se cortó entre las dos escrituras, o se tocó a mano),
 * la lista no se fía de él y lo rehace desde la partida. Lo compartido (sonido, calidad, zoom) no va por ranura.
 */
export const SLOT_IDS = [1, 2, 3] as const;
export type SlotId = (typeof SLOT_IDS)[number];
/** La última ranura jugada: «Continuar» la abre. */
export const ACTIVE_SLOT_KEY = 'lifesim.activeSlot';
const PROBE_KEY = 'lifesim.probe';

/** Lo que enseña la lista de una ranura. */
export interface SlotSummary {
  name: string;
  savedAt: number | null;
  day: number;
  hour: number;
  minute: number;
  locationId: string;
  money: number;
  version: number;
  /** FNV-1a del texto guardado (8 cifras hex). */
  checksum: string;
}

export type SlotStatus = 'vacia' | 'guardada' | 'danada' | 'sin-verificar';
export interface SlotView {
  id: SlotId;
  status: SlotStatus;
  summary: SlotSummary | null;
}

/** Suma de comprobación barata del texto guardado (no es seguridad: detecta escrituras a medias o retoques). */
export function checksum(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** La clave de `key` en la ranura `id` (la 1 conserva las de siempre). */
export function slotKey(id: SlotId, key: string): string {
  if (id === 1 || !key.startsWith(SAVE_KEY)) return key;
  return `${SAVE_KEY}.slot${id}${key.slice(SAVE_KEY.length)}`;
}

const metaKey = (id: SlotId): string => `${slotKey(id, SAVE_KEY)}.meta`;

/** El resumen de un texto de partida, sólo si es una partida que arranca (inspectRaw). */
export function summarize(raw: string): SlotSummary | null {
  const info = inspectRaw(raw);
  if (info.status !== 'ok') return null;
  const s = info.state;
  let version = 1;
  try {
    const v = (JSON.parse(raw) as { version?: unknown }).version;
    if (typeof v === 'number') version = v;
  } catch {
    // inspectRaw ya lo ha leído.
  }
  return { name: s.identity?.name ?? '', savedAt: info.savedAt, day: s.day, hour: s.hour, minute: s.minute, locationId: s.locationId, money: s.money, version, checksum: checksum(raw) };
}

function readMeta(base: SaveStorage, id: SlotId): SlotSummary | null {
  const raw = base.read(metaKey(id));
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Partial<SlotSummary>;
    const ok = typeof m.name === 'string' && typeof m.day === 'number' && typeof m.hour === 'number' && typeof m.minute === 'number'
      && typeof m.locationId === 'string' && typeof m.money === 'number' && typeof m.version === 'number' && typeof m.checksum === 'string'
      && (m.savedAt === null || typeof m.savedAt === 'number');
    return ok ? (m as SlotSummary) : null;
  } catch {
    return null;
  }
}

/**
 * El almacenamiento de una ranura. Escribir la partida escribe después su resumen; si el resumen no cabe, la
 * partida ya está bien guardada y la lista lo rehará (no se informa de fallo por un resumen).
 */
export function slotStorage(base: SaveStorage, id: SlotId): SaveStorage {
  return {
    read: (key) => base.read(slotKey(id, key)),
    write: (key, value) => {
      base.write(slotKey(id, key), value);
      if (key !== SAVE_KEY) return;
      const meta = summarize(value);
      try {
        if (meta) base.write(metaKey(id), JSON.stringify(meta));
      } catch {
        // Sin sitio para el resumen: la lista lo calculará desde la partida.
      }
    },
    remove: (key) => {
      base.remove(slotKey(id, key));
      if (key === SAVE_KEY) base.remove(metaKey(id));
    },
  };
}

/** Lo que hay en una ranura. Con resumen fiable (misma suma que el texto guardado) no restaura la partida. */
export function viewSlot(base: SaveStorage, id: SlotId): SlotView {
  const raw = base.read(slotKey(id, SAVE_KEY));
  if (!raw) return { id, status: 'vacia', summary: null };
  const meta = readMeta(base, id);
  if (meta && meta.checksum === checksum(raw)) return { id, status: 'guardada', summary: meta };
  // Sin resumen o con uno viejo: se lee la partida (una vez) y, si arranca, se rehace el resumen.
  const fresh = summarize(raw);
  if (!fresh) return { id, status: 'danada', summary: null };
  try {
    base.write(metaKey(id), JSON.stringify(fresh));
    return { id, status: 'guardada', summary: fresh };
  } catch {
    return { id, status: 'sin-verificar', summary: fresh };
  }
}

export function activeSlot(base: SaveStorage): SlotId {
  const n = Number(base.read(ACTIVE_SLOT_KEY));
  return (SLOT_IDS as readonly number[]).includes(n) ? (n as SlotId) : 1;
}

export function setActiveSlot(base: SaveStorage, id: SlotId): boolean {
  try {
    base.write(ACTIVE_SLOT_KEY, String(id));
    return true;
  } catch {
    return false;
  }
}

/** Almacenamiento en memoria: se pierde al recargar. Para cuando el navegador no deja guardar, y para los checks. */
export class MemoryStorage implements SaveStorage {
  readonly data = new Map<string, string>();
  read(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  write(key: string, value: string): void {
    this.data.set(key, value);
  }
  remove(key: string): void {
    this.data.delete(key);
  }
}

/** ¿Deja el navegador escribir? (incógnito estricto, almacenamiento bloqueado, cuota a cero). */
export function storageWorks(base: SaveStorage): boolean {
  try {
    base.write(PROBE_KEY, '1');
    const ok = base.read(PROBE_KEY) === '1';
    base.remove(PROBE_KEY);
    return ok;
  } catch {
    return false;
  }
}

let shared: { base: SaveStorage; persistent: boolean } | null = null;
/**
 * El almacenamiento del juego, uno para la pantalla de inicio y la partida: el del navegador, o, si no deja
 * escribir, uno en memoria (se puede jugar, pero nada sobrevive a recargar; la pantalla de inicio lo dice).
 */
export function gameStorage(): { base: SaveStorage; persistent: boolean } {
  if (!shared) {
    const local = new LocalStorageAdapter();
    shared = storageWorks(local) ? { base: local, persistent: true } : { base: new MemoryStorage(), persistent: false };
  }
  return shared;
}

/** El SaveSystem de una ranura. */
export function slotSave(base: SaveStorage, id: SlotId): SaveSystem {
  return new SaveSystem(slotStorage(base, id));
}

/** Para la lista: nombre del sitio sin romper si el mapa cambió. */
export function placeName(locationId: string): string {
  try {
    return getLocation(locationId).name;
  } catch {
    return locationId;
  }
}
