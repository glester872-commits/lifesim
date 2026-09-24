import { SAVE_KEY, SAVE_VERSION } from '../config/constants';
import type { EventMemory, Facing, GameStateData, SaveFile } from '../types/game';
import { emptyMemory } from './MetroEventManager';

/**
 * Backend de persistencia. localStorage es sólo la implementación actual:
 * IndexedDB o un backend entran implementando esta interfaz.
 */
export interface SaveStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export class LocalStorageAdapter implements SaveStorage {
  read(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  write(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Modo privado o cuota llena: la partida sigue, sólo no persiste.
    }
  }

  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignorado por el mismo motivo que write().
    }
  }
}

const FACINGS = new Set<string>(['up', 'down', 'left', 'right']);

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Memoria de eventos. Partidas anteriores no la tienen: empiezan con memoria
 * vacía en vez de descartarse. Un campo mal formado se vacía, no rompe la carga.
 */
function parseEvents(value: unknown): EventMemory {
  const empty = emptyMemory();
  if (!isRecord(value)) return empty;
  return {
    rides: isNumber(value.rides) ? value.rides : empty.rides,
    eventsSeen: isRecord(value.eventsSeen) ? (value.eventsSeen as EventMemory['eventsSeen']) : {},
    choicesMade: Array.isArray(value.choicesMade) ? (value.choicesMade as EventMemory['choicesMade']) : [],
    importantNPCsMet: isRecord(value.importantNPCsMet) ? (value.importantNPCsMet as EventMemory['importantNPCsMet']) : {},
    eventFlags: isRecord(value.eventFlags) ? (value.eventFlags as EventMemory['eventFlags']) : {},
    eventCooldowns: isRecord(value.eventCooldowns) ? (value.eventCooldowns as EventMemory['eventCooldowns']) : {},
    scheduled: Array.isArray(value.scheduled) ? (value.scheduled as EventMemory['scheduled']) : [],
    lastEventRide: isNumber(value.lastEventRide) ? value.lastEventRide : empty.lastEventRide,
    lastNarrativeAt: isNumber(value.lastNarrativeAt) ? value.lastNarrativeAt : empty.lastNarrativeAt,
  };
}

function parseState(value: unknown): GameStateData | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  const pos = s.position as Record<string, unknown> | undefined;

  if (
    !isNumber(s.money) ||
    !isNumber(s.energy) ||
    !isNumber(s.day) ||
    !isNumber(s.hour) ||
    !isNumber(s.minute) ||
    typeof s.locationId !== 'string' ||
    typeof s.facing !== 'string' ||
    !FACINGS.has(s.facing) ||
    !pos ||
    !isNumber(pos.x) ||
    !isNumber(pos.y)
  ) {
    return null;
  }

  return {
    money: s.money,
    energy: s.energy,
    day: s.day,
    hour: s.hour,
    minute: s.minute,
    locationId: s.locationId,
    position: { x: pos.x, y: pos.y },
    facing: s.facing as Facing,
    events: parseEvents(s.events),
  };
}

export class SaveSystem {
  private readonly storage: SaveStorage;

  constructor(storage: SaveStorage = new LocalStorageAdapter()) {
    this.storage = storage;
  }

  save(state: GameStateData): boolean {
    const file: SaveFile = { version: SAVE_VERSION, savedAt: Date.now(), state };
    try {
      this.storage.write(SAVE_KEY, JSON.stringify(file));
      return true;
    } catch {
      return false;
    }
  }

  load(): GameStateData | null {
    const raw = this.storage.read(SAVE_KEY);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return null;
      const file = parsed as Record<string, unknown>;
      if (file.version !== SAVE_VERSION) return null;
      return parseState(file.state);
    } catch {
      return null;
    }
  }

  clear(): void {
    this.storage.remove(SAVE_KEY);
  }
}
