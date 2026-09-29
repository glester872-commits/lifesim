// Sin Phaser: lo usan el render (world/), la gente (StreetLife), el tráfico y scripts/check-districts.
import { COLOR_SCRIPT, DISTRICTS, type DistrictId, type DistrictProfile } from '../data/districts.ts';
import type { TrafficBand } from '../data/vehicles.ts';
import type { DistrictZone, LaneFlow, LocationDef, NpcLook } from '../types/game.ts';

const BANDS: readonly TrafficBand[] = ['dawn', 'morning', 'midday', 'evening', 'night'];

/** Las zonas del sitio en orden de pintado: primero la identidad de todo el sitio, luego cada zona (la última manda). */
export function zonesOf(def: LocationDef): DistrictZone[] {
  const w = def.ground[0].length;
  const h = def.ground.length;
  return [...(def.district ? [{ profile: def.district, tx: 0, ty: 0, w, h }] : []), ...(def.zones ?? [])];
}

export function districtAt(def: LocationDef, tx: number, ty: number): DistrictId | undefined {
  const zones = def.zones ?? [];
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (tx >= z.tx && tx < z.tx + z.w && ty >= z.ty && ty < z.ty + z.h) return z.profile;
  }
  return def.district;
}

export function profileAt(def: LocationDef, tx: number, ty: number): DistrictProfile | undefined {
  const id = districtAt(def, tx, ty);
  return id ? DISTRICTS[id] : undefined;
}

export const hex = (s: string): number => Number.parseInt(s.slice(1), 16);

function mix(a: number, b: number, k: number): number {
  const ch = (shift: number): number => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** El guion de color de la zona a esa hora: el tinte que multiplica su luz. */
export function gradeAt(p: DistrictProfile, hour: number): number {
  for (let i = 1; i < COLOR_SCRIPT.length; i++) {
    const [h1, p1] = COLOR_SCRIPT[i];
    const [h0, p0] = COLOR_SCRIPT[i - 1];
    if (hour <= h1) return mix(hex(p.grade[p0]), hex(p.grade[p1]), (hour - h0) / (h1 - h0));
  }
  return hex(p.grade.night);
}

/** Qué aspecto lleva quien va a esta zona: peso de cada look según su estilo y la mezcla de la zona. Sin zona, todos igual. */
export function lookWeights(looks: readonly NpcLook[], p: DistrictProfile | undefined): number[] {
  return looks.map((l) => (p ? (p.crowd[l.style ?? 'everyday'] ?? 0.2) : 1));
}

/**
 * El carril con lo que ponen las zonas que cruza: cada factor es la media a lo
 * largo del carril, así que un carril que pasa un tercio por el Carmen se lleva
 * un tercio de sus bicis de paseo. El `mix` del barrio sigue aparte.
 */
export function withDistrictLanes(def: LocationDef, flow: LaneFlow): LaneFlow {
  const w = def.ground[0].length;
  const lanes = flow.lanes.map((lane) => {
    const along = Array.from({ length: w }, (_, x) => profileAt(def, x, lane.row)?.vehicles);
    const ids = new Set(along.flatMap((v) => Object.values(v ?? {}).flatMap((m) => Object.keys(m ?? {}))));
    if (!ids.size) return lane;
    const byBand: Partial<Record<TrafficBand, Record<string, number>>> = {};
    for (const band of BANDS) {
      const m: Record<string, number> = {};
      for (const id of ids) m[id] = along.reduce((s, v) => s + (v?.all?.[id] ?? 1) * (v?.[band]?.[id] ?? 1), 0) / w;
      byBand[band] = m;
    }
    return { ...lane, mix: byBand };
  });
  return { ...flow, lanes };
}
