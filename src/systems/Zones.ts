// Sin Phaser: lo usan StreetLife, world/ZoneDebugView y scripts/check-zones.
import { DISTRICT_IDENTITIES, NEUTRAL_IDENTITY, roleGroupOf, type DistrictIdentity } from '../data/districtIdentity.ts';
import { ZONES, type ZoneDef } from '../data/zones.ts';
import { nightOwner, weekIndex } from './Calendar.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import { outdoorAppeal, weatherAt } from './Weather.ts';

export interface ZoneClock {
  day: number;
  hour: number;
  minute: number;
}

const byLocation = new Map<string, ZoneDef[]>();

export function zonesIn(location: string): readonly ZoneDef[] {
  let list = byLocation.get(location);
  if (!list) byLocation.set(location, (list = ZONES.filter((z) => z.location === location)));
  return list;
}

export const inZone = (z: ZoneDef, tx: number, ty: number): boolean =>
  z.rects.some((r) => tx >= r.tx && tx < r.tx + r.w && ty >= r.ty && ty < r.ty + r.h);

/** La zona del tile (la última que lo contiene manda), o undefined si el sitio no tiene zonas. */
export function zoneAt(location: string, tx: number, ty: number): ZoneDef | undefined {
  const list = zonesIn(location);
  const x = Math.floor(tx);
  const y = Math.floor(ty);
  for (let i = list.length - 1; i >= 0; i--) if (inZone(list[i], x, y)) return list[i];
  return undefined;
}

const inHours = (h: readonly [number, number], t: number): boolean => (h[0] <= h[1] ? t >= h[0] && t < h[1] : t >= h[0] || t < h[1]);

/** La identidad del barrio de una zona (data/districtIdentity.ts); sin perfil, la neutra. */
export const identityOf = (districtId: string): DistrictIdentity => DISTRICT_IDENTITIES[districtId] ?? NEUTRAL_IDENTITY;

/** Cuánta afluencia pone el barrio a esa hora: sus franjas, y más (o menos) el fin de semana. */
export function districtDensity(id: DistrictIdentity, t: number, weekend: boolean): number {
  const band = id.density.bands.find(([from, to]) => t >= from && t < to);
  return (band ? band[2] : id.density.rest) * (weekend ? id.density.weekend : 1);
}

// Estado ligero de cada zona: su actividad por cuarto de hora. Nadie simulado, sólo un número.
const memo = new Map<string, number>();

/**
 * Cuánta vida tiene la zona ahora: 1 es lo normal del barrio. Sale de la hora,
 * del día (la madrugada, con la noche anterior), del tiempo si es al aire libre
 * y de una variación propia de cada día, fija para ese día: ningún martes igual
 * a otro, pero el mismo martes se ve igual al recargar.
 */
export function zoneActivity(z: ZoneDef, clock: ZoneClock): number {
  const t = clock.hour + clock.minute / 60;
  const key = `${z.id}:${clock.day}:${Math.floor(t * 4)}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const a = z.activity;
  const band = a.bands.find(([from, to]) => t >= from && t < to);
  let v = band ? band[2] : a.rest;
  const day = weekIndex(nightOwner(clock.day, clock.hour));
  if (day >= 5) v *= a.weekend ?? 1;
  v *= a.days?.[day] ?? 1;
  if (z.hours && !inHours(z.hours, t)) v *= 0.2;
  v *= 1 + (outdoorAppeal(weatherAt(clock.day, t)) - 1) * a.outdoor;
  // El carácter del barrio: sus horas fuertes y su fin de semana, por encima de lo que dice cada zona.
  v *= districtDensity(identityOf(z.districtId), t, day >= 5);
  const rng = seededRng(hashSeed('zone', z.id, nightOwner(clock.day, clock.hour)));
  v *= 1 + (rng() * 2 - 1) * a.variation;
  if (memo.size > 2_000) memo.clear();
  memo.set(key, v);
  return v;
}

/** Cuánto atrae la zona un viaje de ese tipo ahora: su actividad por su perfil de gente. */
export function zonePull(z: ZoneDef, role: string, clock: ZoneClock): number {
  const group = roleGroupOf(role);
  const district = group ? (identityOf(z.districtId).groups[group] ?? 1) : 1;
  return zoneActivity(z, clock) * (z.population.roles?.[role] ?? 1) * district;
}

/** Peso relativo de un evento de calle (por id) en la zona ahora; 0 si la zona no lo acoge. */
export function zoneEventChance(z: ZoneDef, eventId: string, clock: ZoneClock): number {
  return (z.events?.[eventId] ?? 0) * zoneActivity(z, clock) * identityOf(z.districtId).events;
}
