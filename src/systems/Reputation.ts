// Sin Phaser: lo usan GameState, SaveSystem, Menus, Phone y scripts/check-reputation.ts.
import { DISTRICT_IDENTITIES } from '../data/districtIdentity.ts';
import {
  REPUTATION_EVENT_SPAN, REPUTATION_MAX, REPUTATION_MAX_REASONS, REPUTATION_MIN, REPUTATION_PRICE_SPAN,
  REPUTATION_TONE_HIGH, REPUTATION_TONE_LOW, REPUTATION_TRIGGERS,
  type EventPolarity,
} from '../data/reputation.ts';
import { districtAt } from './World.ts';
import { getJob } from '../data/jobs.ts';
import { STOPS } from '../data/transit.ts';
import { settle, type JobProgress } from './Jobs.ts';

/** MAP-07: lo que un barrio sabe de ti. `reasons`, los últimos motivos (y la memoria para no contar dos veces uno). */
export interface ZoneReputation {
  zoneId: string;
  value: number;
  /** Día de juego del último cambio. */
  lastUpdated: number;
  reasons: { id: string; delta: number; day: number }[];
}

export type Reputation = Record<string, ZoneReputation>;
export type Tone = 'hostil' | 'neutral' | 'amistoso';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const known = (zoneId: string): boolean => Object.prototype.hasOwnProperty.call(DISTRICT_IDENTITIES, zoneId);

/** Una reputación nueva con el cambio aplicado. El mismo `reasonId` dos veces, o un barrio que no existe, no cambia nada. */
export function apply(rep: Reputation, zoneId: string | null | undefined, delta: number, reasonId: string, day: number): Reputation {
  if (!zoneId || !known(zoneId) || !Number.isFinite(delta)) return rep;
  const cur = rep[zoneId] ?? { zoneId, value: 0, lastUpdated: day, reasons: [] };
  if (cur.reasons.some((r) => r.id === reasonId)) return rep;
  const reasons = [...cur.reasons, { id: reasonId, delta, day }].slice(-REPUTATION_MAX_REASONS);
  return { ...rep, [zoneId]: { zoneId, value: clamp(cur.value + delta, REPUTATION_MIN, REPUTATION_MAX), lastUpdated: day, reasons } };
}

/** Lo que se cobra en el barrio: −10 % a +100, +10 % a −100. */
export function priceFactor(value: number): number {
  return clamp(1 - (REPUTATION_PRICE_SPAN * value) / 100, 1 - REPUTATION_PRICE_SPAN, 1 + REPUTATION_PRICE_SPAN);
}

export type { EventPolarity };

/** Multiplicador de la probabilidad de un evento: 1 a reputación neutra o a favor; hasta 1 + SPAN en el extremo que le toca. */
export function eventWeightFactor(value: number, polarity: EventPolarity): number {
  if (!Number.isFinite(value)) return 1;
  const v = clamp(value, REPUTATION_MIN, REPUTATION_MAX);
  const lean = polarity === 'negative' ? -v : v;
  return 1 + (REPUTATION_EVENT_SPAN * Math.max(0, lean)) / 100;
}

export function tone(value: number): Tone {
  return value <= REPUTATION_TONE_LOW ? 'hostil' : value >= REPUTATION_TONE_HIGH ? 'amistoso' : 'neutral';
}

/** Un local con `minReputation` (data/places.ts) no te atiende por debajo de ella; sin ella, siempre. */
export function canEnter(value: number, minReputation?: number): boolean {
  return minReputation === undefined || value >= minReputation;
}

/** El barrio de un sitio (los interiores, el de la calle a la que salen); null si no tiene. */
export function zoneOf(locationId: string): string | null {
  let z: string | undefined;
  try {
    z = districtAt(locationId);
  } catch {
    return null; // districtAt lanza ante un id desconocido (getLocation); aquí "sin barrio" basta y no rompe la puerta.
  }
  return z && known(z) ? z : null;
}

export function valueIn(rep: Reputation, zoneId: string | null): number {
  return zoneId ? (rep[zoneId]?.value ?? 0) : 0;
}

/**
 * MAP-07b: repasa el contrato (Jobs.settle) y resta cada falta nueva en el barrio de la estación del puesto
 * (JobDef.place es una parada de STOPS), con la clave `missed:<empleo>:<día>`: repetirlo no cuenta dos veces.
 */
export function settleWithReputation(job: JobProgress, reputation: Reputation, now: number, day: number): { progress: JobProgress; missed: number[]; fired: boolean; reputation: Reputation } {
  const { progress, missed, fired } = settle(job, now);
  const station = STOPS.find((s) => s.id === getJob(job.job).place)?.station;
  const zone = station ? zoneOf(station) : null;
  let rep = reputation;
  for (const d of missed) rep = apply(rep, zone, REPUTATION_TRIGGERS['shift-missed'].delta, `missed:${job.job}:${d}`, day);
  return { progress, missed, fired, reputation: rep };
}

/** Cómo se lee un motivo: por su prefijo (`shift:…`) y, si dos comparten prefijo, por su delta. */
export function reasonLabel(r: { id: string; delta: number }): string {
  const prefix = r.id.split(':')[0];
  const all = Object.values(REPUTATION_TRIGGERS).filter((t) => t.prefix === prefix);
  return (all.find((t) => t.delta === r.delta) ?? all[0])?.label ?? 'Algo que hiciste';
}

/** Lo que venga del guardado: sólo barrios conocidos y números finitos (con clamp). Lo demás, fuera; basura, {}. */
export function parseReputation(value: unknown): Reputation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Reputation = {};
  for (const [zoneId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!known(zoneId) || typeof raw !== 'object' || raw === null) continue;
    const z = raw as Record<string, unknown>;
    if (typeof z.value !== 'number' || !Number.isFinite(z.value)) continue;
    const reasons = Array.isArray(z.reasons)
      ? z.reasons.flatMap((r: unknown) => {
          if (typeof r !== 'object' || r === null) return [];
          const x = r as Record<string, unknown>;
          return typeof x.id === 'string' && typeof x.delta === 'number' && Number.isFinite(x.delta) && typeof x.day === 'number' && Number.isFinite(x.day)
            ? [{ id: x.id, delta: x.delta, day: x.day }]
            : [];
        }).slice(-REPUTATION_MAX_REASONS)
      : [];
    const lastUpdated = typeof z.lastUpdated === 'number' && Number.isFinite(z.lastUpdated) ? z.lastUpdated : 1;
    out[zoneId] = { zoneId, value: clamp(z.value, REPUTATION_MIN, REPUTATION_MAX), lastUpdated, reasons };
  }
  return out;
}
