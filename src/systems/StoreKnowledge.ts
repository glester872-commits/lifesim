// Sin Phaser: lo usan scenes/Menus.ts y scripts/check-store-knowledge.ts.
import type { Facing, TilePoint } from '../types/game.ts';
import { DECATHLON_LAYOUT, type Checkout, type Department, type Rect } from '../data/decathlonLayout.ts';
import { DECATHLON_PROFILE, DECATHLON_STORE, SECTORS, sectorAt, type Sector } from '../data/decathlon.ts';
import type { StaffRole } from '../data/population.ts';
import { getOffer } from '../data/services.ts';
import { getGarment, getStore } from '../data/retail.ts';
import { STORE_REPLIES, type ReplyKey, type StoreQuery } from '../data/storeQueries.ts';
import type { Level } from '../config/population.ts';
import { levelAt, staffDay, staffOnShift, type Agent, type Clock } from './Crowd.ts';
import { LINE_SECTIONS, SECTION_LINES, VOICED_SECTIONS, type HourBand, type LineKind, type LineSection, type SectionLine, type StaffState } from '../data/sectionLines.ts';
import { placeInfo } from './Places.ts';
import { hashSeed } from './MetroDaily.ts';
import { euros } from './Commerce.ts';
import { soldOutList } from './Retail.ts';

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

/** `t`: hora de reloj con decimales, para los turnos `hours`; storeNow siempre la pone (sin ella, sólo días y nivel). */
export interface StoreNow { level: Level | null; weekday: number; t?: number }

export function storeNow(clock: Clock): StoreNow {
  const place = placeInfo(DECATHLON_PROFILE.place);
  const t = clock.hour + clock.minute / 60;
  if (!place) return { level: null, weekday: 0, t };
  return { level: levelAt(place, DECATHLON_PROFILE, clock), weekday: staffDay(place, clock), t };
}

export const onShift = (role: StaffRole, now: StoreNow): boolean => staffOnShift(role, now.level, now.weekday, now.t);

/** Cajas con cajero que cobran ahora (su `open`, la misma regla que el turno del cajero). El autopago nunca. */
export function openCheckouts(now: StoreNow): Checkout[] {
  return DECATHLON_LAYOUT.checkouts.filter((c) => c.kind === 'staffed'
    && staffOnShift({ service: 'cashier', points: [], days: c.open?.days, minLevel: c.open?.minLevel, hours: c.open?.hours }, now.level, now.weekday, now.t));
}

/** Lo que se vende de verdad (data/retail.ts `decathlon`), por nombre y con el precio de aquí. */
export function stockText(factor = 1, day?: number): string {
  const out = day === undefined ? [] : soldOutList('decathlon', day);
  const byName = new Map<string, number[]>();
  for (const line of getStore('decathlon').stock) {
    if (out.includes(line.garment)) continue;
    const name = getGarment(line.garment).name;
    byName.set(name, [...(byName.get(name) ?? []), Math.round(line.price * factor * 100) / 100]);
  }
  return listEs([...byName].map(([name, prices]) => `${name.toLowerCase()} a ${prices.sort((a, b) => a - b).map((p) => euros(p)).join(' o ')}`));
}

/** DEC-06 · Lo agotado hoy, dicho tras la lista (vacío si no falta nada). Sin pedidos ni reservas: no existen. */
export function soldOutText(day: number): string {
  const out = soldOutList('decathlon', day).map((g) => getGarment(g).name.toLowerCase());
  return out.length ? ` Hoy no tenemos ${listEs(out)}; mañana lo reponen.` : '';
}

const tillLabel = (cs: readonly Checkout[]): string => {
  const ns = cs.map((c) => c.id.replace('caja-', ''));
  return ns.length === 1 ? `la caja ${ns[0]}` : `las cajas ${listEs(ns)}`;
};

const dist = (a: TilePoint, b: Spot): number => Math.hypot(b.x - a.tx, b.y - a.ty);
const nearest = <T>(from: TilePoint, items: readonly T[], at: (t: T) => Spot): T =>
  items.reduce((best, t) => (dist(from, at(t)) < dist(from, at(best)) ? t : best));

/** Las dos últimas frases de cada colaborador en esta sesión (DEC-05): no se repiten. No se guarda. */
const lastSaid = new Map<string, string[]>();

/** Una variante por colaborador, consulta y día, saltando las dos últimas que dijo; nunca la inmediata anterior. */
function pick(staffKey: string, seed: string, day: number, variants: readonly string[]): string {
  const recent = lastSaid.get(staffKey) ?? [];
  const n = variants.length;
  let i = Math.abs(hashSeed(staffKey, seed, day)) % n;
  for (let k = 0; k < n && recent.includes(variants[i]); k++) i = (i + 1) % n;
  if (n > 1 && variants[i] === recent[recent.length - 1]) i = (i + 1) % n;
  lastSaid.set(staffKey, [...recent, variants[i]].slice(-2));
  return variants[i];
}

/** Una de las tres maneras, por colaborador, pregunta y día; sin repetir lo último que dijo. */
export function say(staffKey: string, queryId: string, day: number, key: ReplyKey, fill: Readonly<Record<string, string>>): string {
  const variants = STORE_REPLIES[key].map((t) => {
    const text = t.replace(/\{(\w+)\}/g, (_, k: string) => fill[k] ?? '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  });
  return pick(staffKey, queryId, day, variants);
}

/** DEC-05 · La sección por la que habla alguien de la tienda: su rol, no el tile donde esté. */
export function sectionOfRole(role?: StaffRole): LineSection {
  if (!role) return 'general';
  if (role.service === 'cashier') return 'cajas';
  const name = (role.label ?? '').replace('Sección de ', '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return (LINE_SECTIONS as readonly string[]).includes(name) ? (name as LineSection) : 'general';
}

/** Franjas de la tienda: mañana hasta las 14, tarde hasta las 19 y cierre después. */
export const hourBand = (clock: Clock): HourBand => (clock.hour < 14 ? 'manana' : clock.hour < 19 ? 'tarde' : 'cierre');

/** La caja `{n}` del puesto de un cajero (DECATHLON_PROFILE.lane) está 'ocupada': alguien parado en su caja pagando. */
export function cashierBusy(role: StaffRole, agents: readonly Agent[]): boolean {
  const [pre, post] = (DECATHLON_PROFILE.lane ?? '').split('{n}');
  if (post === undefined) return false;
  const n = role.points.find((p) => p.startsWith(pre) && p.endsWith(post))?.slice(pre.length, post ? -post.length : undefined);
  const till = DECATHLON_LAYOUT.checkouts.find((c) => c.id === `caja-${n}`)?.till;
  return !!till && agents.some((a) => !a.staffRole && !a.leaving && a.path.length === 0 && Math.round(a.x) === till.tx && Math.round(a.y) === till.ty);
}

/** El estado con que saluda (derivado, no guardado): de camino, cobrando, reponiendo o libre. */
export function staffState(role: StaffRole | undefined, agent: Agent | undefined, agents: readonly Agent[]): StaffState {
  if (!role || !agent) return 'disponible';
  if (agent.moving || agent.path.length > 0) return 'desplazandose';
  const section = sectionOfRole(role);
  if (section === 'cajas') return cashierBusy(role, agents) ? 'atendiendo' : 'disponible';
  if (section === 'general' && agent.point !== undefined && agent.timer > 0) return 'reponiendo';
  return 'disponible';
}

export interface LineCtx { staffKey: string; ref?: string; state?: StaffState; clock: Clock }

/** Las entradas que encajan, de la más concreta: un estado especial pesa más que la franja; «disponible» es el de siempre. */
function bestOf(section: LineSection, kind: LineKind, ctx: LineCtx): readonly string[] {
  const st = ctx.state ?? 'disponible';
  const band = hourBand(ctx.clock);
  const fit = SECTION_LINES.filter((e) => e.section === section && e.kind === kind && e.ref === ctx.ref
    && (e.state === undefined || e.state === st) && (e.hours === undefined || e.hours === band));
  const score = (e: SectionLine): number => (e.state && e.state !== 'disponible' ? 2 : 0) + (e.hours ? 1 : 0);
  const top = Math.max(-1, ...fit.map(score));
  return fit.filter((e) => score(e) === top).flatMap((e) => e.variations);
}

/** Una frase de la sección (exacta → sin estado o sin franja → `general`); undefined: el llamador dice la de antes. */
export function line(section: LineSection, kind: LineKind, ctx: LineCtx): string | undefined {
  const pool = bestOf(section, kind, ctx);
  const variants = pool.length > 0 ? pool : bestOf('general', kind, ctx);
  if (variants.length === 0) return undefined;
  return pick(ctx.staffKey, `${kind}:${ctx.ref ?? ''}:${ctx.state ?? ''}:${hourBand(ctx.clock)}`, ctx.clock.day, variants);
}

/** La sección con coletilla de un sector: por su id (probadores, natación…) o por su familia (montaña, fitness). */
function tipSectionOf(sectorId: string): LineSection | undefined {
  const s = sectorById(sectorId);
  const ids = LINE_SECTIONS as readonly string[];
  if (!s) return undefined;
  return ids.includes(s.id) ? (s.id as LineSection) : ids.includes(s.family) ? (s.family as LineSection) : undefined;
}

/** La coletilla tras «¿Dónde está…?» o «¿Dónde están los probadores?»: la de la primera sección consultada que la tenga. */
export function tipFor(q: StoreQuery, staffKey: string, clock: Clock): string | undefined {
  const ids = q.kind === 'fitting' ? ['probadores'] : q.kind === 'department' ? (DECATHLON_LAYOUT.departments.find((d) => d.id === q.ref)?.sectorIds ?? []) : [];
  // Primero las secciones sin colaborador propio (colectivos, natación, probadores): las demás ya hablan por sí mismas.
  const voiced = (s: LineSection | undefined): number => Number(s !== undefined && VOICED_SECTIONS.includes(s));
  const sections = ids.map(tipSectionOf).sort((a, b) => voiced(a) - voiced(b));
  for (const section of sections) {
    const text = section && SECTION_LINES.some((e) => e.section === section && e.kind === 'tip') ? line(section, 'tip', { staffKey, clock }) : undefined;
    if (text) return text;
  }
  return undefined;
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
  if (q.kind === 'stock') {
    const r = reply('stock', { lista: stockText(priceFactor, clock.day) });
    return { ...r, text: r.text + soldOutText(clock.day) };
  }
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
