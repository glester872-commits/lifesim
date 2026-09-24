// Imports con extensión .ts a propósito: sin Phaser, para que
// scripts/simulate-metro-events.ts ejecute exactamente este código.
import { METRO_EVENT_RULES } from '../config/metro.ts';
import { METRO_EVENTS } from '../data/metroEvents.ts';
import { crowdAt, metroDay, type CrowdLevel, type Rng } from './MetroDaily.ts';
import type { EventMemory } from '../types/game.ts';

/** De más común a más raro. Fija el cooldown global que aplica y el orden de tirada. */
export const RARITIES = ['ambient', 'interactive', 'important', 'exceptional'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Un evento que no cumple ninguna de estas funciones es ruido. */
export type Purpose =
  | 'WORLD_BUILDING'
  | 'CHARACTER_DEVELOPMENT'
  | 'RESOURCE_MANAGEMENT'
  | 'RELATIONSHIPS'
  | 'CAREER'
  | 'RISK'
  | 'OPPORTUNITY';

/**
 * Sólo lo que el juego tiene de verdad. Trabajo, estudios o reputación entran
 * aquí como una clave más cuando existan esos sistemas.
 */
export interface EventConditions {
  /** Hora de salida [desde, hasta), en horas; si desde > hasta, cruza medianoche. */
  hours?: readonly [number, number];
  weekend?: boolean;
  crowd?: readonly CrowdLevel[];
  /** Estación de destino (id de localización). */
  to?: readonly string[];
  minMoney?: number;
  /** Decisiones y eventos anteriores: todas presentes / ninguna presente. */
  flags?: readonly string[];
  notFlags?: readonly string[];
  npc?: { id: string; minAffinity: number };
}

export interface FollowUp {
  event: string;
  /** Días de juego hasta que puede aparecer [mín, máx]. */
  afterDays: readonly [number, number];
}

/** Dinero, energía y reloj son los recursos que ya existen; el resto es memoria. */
export interface EventEffects {
  money?: number;
  energy?: number;
  minutes?: number;
  flags?: readonly string[];
  npc?: { id: string; name: string; affinity?: number };
  followUps?: readonly FollowUp[];
}

export interface EventChoice {
  id: string;
  label: string;
  /** Lo que se le cuenta al jugador. Nunca cifras: las consecuencias se intuyen. */
  result: readonly string[];
  effects?: EventEffects;
}

export interface MetroEventDef {
  id: string;
  name: string;
  /** Para depurar y documentar; el jugador no lo ve. */
  description: string;
  rarity: Rarity;
  purpose: readonly Purpose[];
  /** Por viaje, si todo lo demás lo permite. */
  probability: number;
  /** Días de juego antes de poder repetirse. */
  cooldown: number;
  once?: boolean;
  /** Sólo sale si otro evento lo programó (followUps). */
  followUpOnly?: boolean;
  conditions?: EventConditions;
  speaker?: string;
  lines: readonly string[];
  /** Se aplican al ocurrir, antes de la decisión. */
  effects?: EventEffects;
  choices?: readonly EventChoice[];
}

export interface RideContext {
  day: number;
  hour: number;
  minute: number;
  money: number;
  energy: number;
  /** Destino. Sin él (listado de depuración fuera del andén), la condición `to` no se evalúa. */
  to?: string;
}

/** Recursos que el llamador aplica sobre GameState y el reloj. */
export interface EventOutcome {
  lines: readonly string[];
  money: number;
  energy: number;
  minutes: number;
}

const DAY_MIN = 24 * 60;
export const stamp = (ctx: RideContext): number => (ctx.day - 1) * DAY_MIN + ctx.hour * 60 + ctx.minute;

export function emptyMemory(): EventMemory {
  return {
    rides: 0,
    eventsSeen: {},
    choicesMade: [],
    importantNPCsMet: {},
    eventFlags: {},
    eventCooldowns: {},
    scheduled: [],
    // Lejos en el pasado, pero finitos: JSON convierte -Infinity en null.
    lastEventRide: -1_000,
    lastNarrativeAt: -1_000_000,
  };
}

const inHours = (hour: number, [from, to]: readonly [number, number]): boolean =>
  from <= to ? hour >= from && hour < to : hour >= from || hour < to;

/** Falla en arranque si los datos se contradicen, no a mitad de partida. */
export function validateMetroEvents(events: readonly MetroEventDef[]): void {
  const ids = new Set<string>();
  const targets = new Set<string>();
  for (const ev of events) {
    if (ids.has(ev.id)) throw new Error(`Evento duplicado: ${ev.id}`);
    ids.add(ev.id);
    if (ev.purpose.length === 0) throw new Error(`${ev.id}: sin función, es ruido`);
    if (!(ev.probability > 0 && ev.probability <= 1)) throw new Error(`${ev.id}: probabilidad fuera de (0, 1]`);
    if (ev.lines.length === 0) throw new Error(`${ev.id}: sin texto`);
    if (ev.choices && (ev.choices.length < 2 || ev.choices.length > 3)) throw new Error(`${ev.id}: 2 o 3 opciones`);
    for (const fx of [ev.effects, ...(ev.choices ?? []).map((c) => c.effects)]) {
      for (const f of fx?.followUps ?? []) targets.add(f.event);
    }
  }
  for (const t of targets) {
    if (!ids.has(t)) throw new Error(`Continuación a un evento inexistente: ${t}`);
  }
  for (const ev of events) {
    if (ev.followUpOnly && !targets.has(ev.id)) throw new Error(`${ev.id}: continuación que nadie programa`);
  }
}

/**
 * Eventos de viaje en metro. Casi todos los trayectos son normales: cada evento
 * tiene su probabilidad y su cooldown, y encima hay un cooldown global en viajes
 * y otro en horas para los que no son ambientales.
 *
 * Sin Phaser y sin tocar GameState: decide qué pasa y escribe en la memoria;
 * dinero, energía y minutos los aplica quien llama.
 */
export class MetroEventManager {
  private readonly events: readonly MetroEventDef[];
  private readonly store: { events: EventMemory };
  private readonly rng: Rng;
  private forced: MetroEventDef | null = null;
  private pending: MetroEventDef | null = null;

  constructor(store: { events: EventMemory }, rng: Rng = Math.random, events: readonly MetroEventDef[] = METRO_EVENTS) {
    validateMetroEvents(events);
    this.store = store;
    this.rng = rng;
    this.events = events;
  }

  private get memory(): EventMemory {
    return this.store.events;
  }

  /** Un viaje en tren. Devuelve el evento que ocurre, o null (lo normal). */
  onRide(ctx: RideContext): MetroEventDef | null {
    const mem = this.memory;
    const t = stamp(ctx);
    mem.rides += 1;
    mem.scheduled = mem.scheduled.filter((s) => s.until >= t);

    if (this.forced) {
      this.pending = this.forced;
      this.forced = null;
      return this.pending;
    }

    // Lo raro tira primero: si lo común fuera antes, lo raro casi nunca llegaría a tirar.
    const candidates = this.events
      .filter((ev) => this.whyNot(ev, ctx) === null)
      .map((ev) => ({ ev, order: RARITIES.indexOf(ev.rarity) + this.rng() * 0.5 }))
      .sort((a, b) => b.order - a.order);

    for (const { ev } of candidates) {
      if (this.rng() < ev.probability) {
        this.pending = ev;
        return ev;
      }
    }
    return null;
  }

  /** El evento del último viaje, una sola vez: lo recoge la estación de llegada. */
  takePending(): MetroEventDef | null {
    const ev = this.pending;
    this.pending = null;
    return ev;
  }

  /** Registra que ocurrió (y la decisión, si la hay) y devuelve lo que cambia. */
  resolve(ev: MetroEventDef, ctx: RideContext, choiceId?: string): EventOutcome {
    const mem = this.memory;
    const t = stamp(ctx);
    const choice = choiceId === undefined ? undefined : ev.choices?.find((c) => c.id === choiceId);
    if (ev.choices && !choice) throw new Error(`${ev.id}: opción desconocida ${choiceId}`);

    (mem.eventsSeen[ev.id] ??= []).push(ctx.day);
    mem.eventCooldowns[ev.id] = t + ev.cooldown * DAY_MIN;
    mem.lastEventRide = mem.rides;
    if (ev.rarity !== 'ambient') mem.lastNarrativeAt = t;
    mem.scheduled = mem.scheduled.filter((s) => s.event !== ev.id);
    if (choice) mem.choicesMade.push({ day: ctx.day, event: ev.id, choice: choice.id });

    const out = { lines: choice?.result ?? [], money: 0, energy: 0, minutes: 0 };
    for (const fx of [ev.effects, choice?.effects]) {
      if (!fx) continue;
      out.money += fx.money ?? 0;
      out.energy += fx.energy ?? 0;
      out.minutes += fx.minutes ?? 0;
      for (const flag of fx.flags ?? []) mem.eventFlags[flag] ??= ctx.day;
      if (fx.npc) this.meet(fx.npc, ctx.day);
      for (const f of fx.followUps ?? []) {
        const [min, max] = f.afterDays;
        const from = t + Math.round((min + this.rng() * (max - min)) * DAY_MIN);
        mem.scheduled.push({ event: f.event, from, until: from + METRO_EVENT_RULES.followUpWindowDays * DAY_MIN });
      }
    }
    return out;
  }

  private meet(npc: NonNullable<EventEffects['npc']>, day: number): void {
    const known = (this.memory.importantNPCsMet[npc.id] ??= {
      name: npc.name, firstDay: day, lastDay: day, encounters: 0, affinity: 0,
    });
    known.lastDay = day;
    known.encounters += 1;
    known.affinity += npc.affinity ?? 0;
  }

  /** null si el evento puede salir en este viaje; si no, el primer motivo. */
  whyNot(ev: MetroEventDef, ctx: RideContext): string | null {
    const mem = this.memory;
    const t = stamp(ctx);
    const c = ev.conditions ?? {};

    if (ev.once && mem.eventsSeen[ev.id]) return 'ya ocurrió';
    if (ev.followUpOnly && !mem.scheduled.some((s) => s.event === ev.id && t >= s.from && t <= s.until)) {
      return 'no programado';
    }
    if (t < (mem.eventCooldowns[ev.id] ?? -Infinity)) return 'cooldown propio';
    if (mem.rides - mem.lastEventRide <= METRO_EVENT_RULES.quietRides) return 'viaje tranquilo obligado';
    if (ev.rarity !== 'ambient' && t - mem.lastNarrativeAt < METRO_EVENT_RULES.narrativeGapHours * 60) {
      return 'pausa narrativa';
    }
    if (c.hours && !inHours(ctx.hour, c.hours)) return 'hora';
    const daily = metroDay(ctx.day);
    if (c.weekend !== undefined && daily.weekend !== c.weekend) return 'día de la semana';
    if (c.crowd && !c.crowd.includes(crowdAt(daily, ctx.hour, ctx.minute))) return 'afluencia';
    if (c.to && ctx.to !== undefined && !c.to.includes(ctx.to)) return 'destino';
    if (c.minMoney !== undefined && ctx.money < c.minMoney) return 'dinero';
    if (c.flags?.some((f) => !(f in mem.eventFlags))) return 'falta una decisión previa';
    if (c.notFlags?.some((f) => f in mem.eventFlags)) return 'excluido por una decisión previa';
    if (c.npc && (mem.importantNPCsMet[c.npc.id]?.affinity ?? -Infinity) < c.npc.minAffinity) return 'relación';
    return null;
  }

  // ------------------------------------------------------------ depuración

  /** El próximo viaje trae este evento, sin mirar condiciones ni cooldowns. */
  forceEvent(id: string): void {
    const ev = this.events.find((e) => e.id === id);
    if (!ev) throw new Error(`Evento desconocido: ${id}`);
    this.forced = ev;
  }

  listAvailableEvents(ctx: RideContext): { id: string; rarity: Rarity; probability: number; estado: string }[] {
    return this.events.map((ev) => ({
      id: ev.id,
      rarity: ev.rarity,
      probability: ev.probability,
      estado: this.whyNot(ev, ctx) ?? 'disponible',
    }));
  }

  inspectEventHistory(): EventMemory {
    return structuredClone(this.memory);
  }

  resetMetroEvents(): void {
    this.store.events = emptyMemory();
    this.forced = null;
    this.pending = null;
  }
}
