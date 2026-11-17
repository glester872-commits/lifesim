// Sin Phaser: lo usan scenes/Menus.ts y scripts/check-store-knowledge.ts.
import type { Facing, TilePoint } from '../types/game.ts';
import { DECATHLON_LAYOUT, type Checkout, type Department, type Rect } from '../data/decathlonLayout.ts';
import { DECATHLON_PROFILE, DECATHLON_STORE, SECTORS, sectorAt, type Sector } from '../data/decathlon.ts';
import type { StaffRole } from '../data/population.ts';
import { getOffer } from '../data/services.ts';
import { getGarment, getStore } from '../data/retail.ts';
import { STORE_REPLIES, type ReplyKey, type StoreQuery } from '../data/storeQueries.ts';
import type { Level } from '../config/population.ts';
import { levelAt, staffDay, staffOnShift, type Clock } from './Crowd.ts';
import { placeInfo } from './Places.ts';
import { hashSeed } from './MetroDaily.ts';
import { euros } from './Commerce.ts';

/**
 * DEC-01 · Lo que sabe quien atiende en la sala de Decathlon: dónde está cada sección respecto a él (del plano, no de
 * texto escrito), qué departamento es, quién la lleva y si trabaja hoy, qué cajas cobran ahora y qué ropa se vende de
 * verdad. Las preguntas y las frases son data/storeQueries.ts. Arriba (y menor) es el fondo; abajo a la derecha, la
 * puerta y las cajas.
 */

/** Desde dónde se orienta si no se sabe dónde está quien contesta: la entrada. */
export const STORE_ENTRY: TilePoint = { tx: DECATHLON_STORE.spawns.entry.tx, ty: DECATHLON_STORE.spawns.entry.ty };

export interface Spot { x: number; y: number }
export const centerOf = (r: Rect): Spot => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });

/** Tiles de margen: dentro de él, «a esta altura» o «recto». */
const NEAR = 3;

export interface Heading { h: 'izquierda' | 'derecha' | null; v: 'fondo' | 'entrada' | null }

export function heading(from: TilePoint, to: Spot): Heading {
  const dx = to.x - from.tx;
  const dy = to.y - from.ty;
  return { h: dx < -NEAR ? 'izquierda' : dx > NEAR ? 'derecha' : null, v: dy < -NEAR ? 'fondo' : dy > NEAR ? 'entrada' : null };
}

/** El camino desde quien habla, en palabras: fondo/entrada según y, izquierda/derecha según x. */
export function pathTo(from: TilePoint, to: Spot, inside = false): string {
  if (inside) return 'aquí mismo, donde estamos';
  const { h, v } = heading(from, to);
  const side = h ? `a la ${h}` : '';
  if (v === 'fondo') return h ? `hacia el fondo y luego ${side}` : 'todo recto hacia el fondo';
  if (v === 'entrada') return h ? `hacia la entrada y luego ${side}` : 'todo recto hacia la entrada';
  return h ? `${side}, a esta misma altura` : 'aquí al lado';
}

/** La frase entera de cómo llegar: si ya está ahí o al lado, una sola expresión; si no, «Desde aquí, …». */
export function goTo(from: TilePoint, to: Spot, inside = false): string {
  if (inside) return 'Aquí mismo, donde estamos.';
  const p = pathTo(from, to);
  return p === 'aquí al lado' ? 'Justo aquí al lado.' : `Desde aquí, ${p}.`;
}

/** Hacia dónde se gira quien lo indica (el eje que más pesa); nada si ya está encima. */
export function facingTo(from: TilePoint, to: Spot): Facing | undefined {
  const dx = to.x - from.tx;
  const dy = to.y - from.ty;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return undefined;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}

/** Dónde queda un rectángulo en la nave, sin mirar quién pregunta. */
export function whereIs(r: Rect): string {
  const { x, y } = centerOf(r);
  const v = y <= 10 ? 'al fondo' : y >= 33 ? 'delante, cerca de las cajas' : 'en el centro de la nave';
  const h = x <= 12 ? 'a la izquierda del todo' : x >= 61 ? 'pegado a la pared de la derecha' : x < 30 ? 'a la izquierda' : x > 48 ? 'a la derecha' : 'por el medio';
  return `${v}, ${h}`;
}

/** La única unión de listas de las respuestas: comas y «y» sólo antes del último. */
export const listEs = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;

/** La etiqueta de una sección: lo de antes del «·» (las dos Raquetas son «Raqueta»). */
export const labelOf = (s: Sector): string => s.name.split(' · ')[0];

/** Cómo se nombra entre `among`: su nombre entero, o la etiqueta si otra con la misma se llama distinto. */
const nameIn = (s: Sector, among: readonly Sector[]): string =>
  among.some((o) => labelOf(o) === labelOf(s) && o.name !== s.name) ? labelOf(s) : s.name;

/** Secciones agrupadas por zona, cada etiqueta una sola vez: «Camping, al fondo, a la derecha y en el centro…; …». */
export function describe(sectors: readonly Sector[]): string {
  const byName = new Map<string, string[]>();
  for (const s of sectors) {
    const name = nameIn(s, sectors);
    const wheres = byName.get(name) ?? [];
    const where = whereIs(s.rect);
    if (!wheres.includes(where)) wheres.push(where);
    byName.set(name, wheres);
  }
  const groups = new Map<string, string[]>();
  for (const [name, wheres] of byName) {
    const where = listEs(wheres);
    groups.set(where, [...(groups.get(where) ?? []), name]);
  }
  return [...groups].map(([where, names]) => `${listEs(names)}, ${where}`).join('; ');
}

export const sectorById = (id: string): Sector | undefined => SECTORS.find((s) => s.id === id);

export function departmentOf(sectorId: string): Department | undefined {
  return DECATHLON_LAYOUT.departments.find((d) => d.sectorIds.includes(sectorId));
}

/** Las secciones de la ronda de alguien de sala: las de sus puntos (data/decathlon.ts `floor`). */
export function sectionsOf(role: StaffRole): string[] {
  const ids = role.points.flatMap((id) => {
    const pt = DECATHLON_STORE.points?.[id];
    const s = pt ? sectorAt(pt.tx, pt.ty) : undefined;
    return s ? [s.id] : [];
  });
  return [...new Set(ids)];
}

/** Quien lleva una sección con consejo propio (las offers `advice` con preguntas); Reposición no cuenta. */
export function advisers(): StaffRole[] {
  return DECATHLON_PROFILE.staff.filter((r) => {
    if (!r.offers) return false;
    const o = getOffer(r.offers);
    return o.kind === 'advice' && o.questions.length > 0;
  });
}

export const adviserFor = (sectorId: string): StaffRole | undefined => advisers().find((r) => sectionsOf(r).includes(sectorId));

export interface StoreNow { level: Level | null; weekday: number }

export function storeNow(clock: Clock): StoreNow {
  const place = placeInfo(DECATHLON_PROFILE.place);
  if (!place) return { level: null, weekday: 0 };
  return { level: levelAt(place, DECATHLON_PROFILE, clock), weekday: staffDay(place, clock) };
}

export const onShift = (role: StaffRole, now: StoreNow): boolean => staffOnShift(role, now.level, now.weekday);

/** Cajas con cajero que cobran ahora (su `open`, la misma regla que el turno del cajero). El autopago nunca. */
export function openCheckouts(now: StoreNow): Checkout[] {
  return DECATHLON_LAYOUT.checkouts.filter((c) => c.kind === 'staffed'
    && staffOnShift({ service: 'cashier', points: [], days: c.open?.days, minLevel: c.open?.minLevel }, now.level, now.weekday));
}

/** Lo que se vende de verdad (data/retail.ts `decathlon`), por nombre y con el precio de aquí. */
export function stockText(factor = 1): string {
  const byName = new Map<string, number[]>();
  for (const line of getStore('decathlon').stock) {
    const name = getGarment(line.garment).name;
    byName.set(name, [...(byName.get(name) ?? []), Math.round(line.price * factor * 100) / 100]);
  }
  return listEs([...byName].map(([name, prices]) => `${name.toLowerCase()} a ${prices.sort((a, b) => a - b).map((p) => euros(p)).join(' o ')}`));
}

const tillLabel = (cs: readonly Checkout[]): string => {
  const ns = cs.map((c) => c.id.replace('caja-', ''));
  return ns.length === 1 ? `la caja ${ns[0]}` : `las cajas ${listEs(ns)}`;
};

const dist = (a: TilePoint, b: Spot): number => Math.hypot(b.x - a.tx, b.y - a.ty);
const nearest = <T>(from: TilePoint, items: readonly T[], at: (t: T) => Spot): T =>
  items.reduce((best, t) => (dist(from, at(t)) < dist(from, at(best)) ? t : best));

/** La última frase de cada colaborador en esta sesión: no se repite seguida. No se guarda. */
const lastSaid = new Map<string, string>();

/** Una de las tres maneras, por colaborador, pregunta y día; si es la que acaba de decir, la siguiente. */
export function say(staffKey: string, queryId: string, day: number, key: ReplyKey, fill: Readonly<Record<string, string>>): string {
  const variants = STORE_REPLIES[key].map((t) => {
    const text = t.replace(/\{(\w+)\}/g, (_, k: string) => fill[k] ?? '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  });
  let i = Math.abs(hashSeed(staffKey, queryId, day)) % variants.length;
  if (variants[i] === lastSaid.get(staffKey)) i = (i + 1) % variants.length;
  lastSaid.set(staffKey, variants[i]);
  return variants[i];
}

export interface Asker {
  /** Quién responde (su etiqueta): la memoria de qué dijo la última vez. */
  key: string;
  /** Dónde está ahora, en tiles. */
  tile: TilePoint;
  role?: StaffRole;
}

export interface Reply { text: string; toward?: Facing }

/** La respuesta a una pregunta de data/storeQueries.ts desde donde está quien la contesta, a esta hora. */
export function answer(q: StoreQuery, who: Asker, clock: Clock, priceFactor = 1): Reply {
  const reply = (key: ReplyKey, fill: Record<string, string>, to?: Spot): Reply =>
    ({ text: say(who.key, q.id, clock.day, key, fill), toward: to ? facingTo(who.tile, to) : undefined });
  const here = sectorAt(who.tile.tx, who.tile.ty);
  const toSector = (s: Sector): { ir: string; at: Spot } =>
    ({ ir: goTo(who.tile, centerOf(s.rect), here?.id === s.id), at: centerOf(s.rect) });

  if (q.kind === 'department') {
    const dep = DECATHLON_LAYOUT.departments.find((d) => d.id === q.ref);
    const sectors = (dep?.sectorIds ?? []).flatMap((id) => sectorById(id) ?? []);
    const near = nearest(who.tile, sectors, (s) => centerOf(s.rect));
    const go = toSector(near);
    // La más cercana se nombra una vez (con su camino); el resto, sin repetir su etiqueta.
    const others = sectors.filter((s) => labelOf(s) !== labelOf(near));
    const resto = others.length > 0 ? ` Lo demás: ${describe(others)}.` : '';
    return reply('department', { cerca: nameIn(near, sectors), ir: go.ir, resto }, go.at);
  }
  if (q.kind === 'stock') return reply('stock', { lista: stockText(priceFactor) });
  if (q.kind === 'racks') {
    const racks = DECATHLON_STORE.racks ?? [];
    const spot = (r: TilePoint): Spot => ({ x: r.tx, y: r.ty });
    const rack = nearest(who.tile, racks, spot);
    const bySector = new Map<string, string[]>();
    for (const r of racks) {
      const s = sectorAt(r.tx, r.ty)?.name ?? 'su perchero';
      // «Camisetas y sudaderas» son dos cosas: van a la misma lista, no se encadenan con otra «y».
      bySector.set(s, [...(bySector.get(s) ?? []), ...r.name.toLowerCase().split(' y ')]);
    }
    const lista = [...bySector].map(([s, names]) => `${listEs(names)}, en ${s}`).join('; ');
    return reply('racks', { lista, ir: goTo(who.tile, spot(rack), dist(who.tile, spot(rack)) < 2) }, spot(rack));
  }
  if (q.kind === 'fitting') {
    const s = sectorById('probadores')!;
    const go = toSector(s);
    return reply('fitting', { donde: whereIs(s.rect), ir: go.ir }, go.at);
  }
  const now = storeNow(clock);
  if (q.kind === 'tills') {
    const open = openCheckouts(now);
    if (open.length === 0) return reply('tills-none', {});
    const spot = (c: Checkout): Spot => ({ x: c.till.tx, y: c.till.ty });
    const till = nearest(who.tile, open, spot);
    return reply('tills', { cajas: tillLabel(open), ir: goTo(who.tile, spot(till)) }, spot(till));
  }
  // adviser
  const role = DECATHLON_PROFILE.staff.find((r) => r.label === q.ref);
  if (!role) throw new Error(`StoreKnowledge: nadie lleva «${q.ref}» (data/storeQueries.ts ADVISED)`);
  const quien = `la ${(role.label ?? '').toLowerCase()}`;
  if (who.role === role) return reply('adviser-me', {});
  const sectors = sectionsOf(role).flatMap((id) => sectorById(id) ?? []);
  if (onShift(role, now)) return reply('adviser-mate', { quien, secciones: describe(sectors) });
  const near = nearest(who.tile, sectors, (s) => centerOf(s.rect));
  const go = toSector(near);
  return reply('adviser-none', { quien, secciones: describe(sectors), ir: go.ir }, go.at);
}
