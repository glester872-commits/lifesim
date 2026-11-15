// Sin Phaser: lo usan StreetLife (viajes y gente de más), world/PopUpView, el inspector y scripts/check-popups.
import { POPUPS, type PopUpDef, type PopUpPiece, type StallVendorDef } from '../data/popups.ts';
import type { StallAnchor } from '../types/game.ts';
import { nightOwner } from './Calendar.ts';
import { getLocation } from './LocationSystem.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import { HEAVY_RAIN, weatherAt } from './Weather.ts';

export interface PopUpClock {
  day: number;
  hour: number;
  minute: number;
}

/** Cada semana del calendario (el día 1 es lunes). */
const weekOf = (day: number): number => Math.floor((day - 1) / 7);

const inHours = (h: readonly [number, number], t: number): boolean => (h[0] <= h[1] ? t >= h[0] && t < h[1] : t >= h[0] || t < h[1]);

interface Slot {
  def: PopUpDef;
  from: number;
  to: number;
}

/**
 * Cuándo está puesto un evento un día cualquiera de su duración, en horas desde las 00:00 de ese día: desde que se
 * monta hasta que se acaba de recoger (`teardown`, media hora si no dice; pasada la medianoche, más de 24).
 */
const teardownOf = (def: PopUpDef): number => def.teardown ?? 0.5;

function window(def: PopUpDef): readonly [number, number] {
  return [def.hours[0] - def.setup, def.hours[1] + (def.hours[1] <= def.hours[0] ? 24 : 0) + teardownOf(def)];
}

/**
 * Qué eventos hay esa semana y qué días. Una tirada por evento y semana, con
 * semilla fija: siempre la misma respuesta. Dos eventos chocan si comparten
 * algún día y en él se solapan las horas en que están puestos (con montaje y
 * recogida: no se montan dos a la vez en la misma acera); entonces sigue el de
 * más prioridad (el primero de data/popups.ts) y el otro se salta la semana
 * entera: no hay un pop-up de moda que sólo dure viernes y domingo. Un DJ a
 * las ocho de la tarde no choca con un mercadillo que recoge a las siete.
 */
const plans = new Map<string, readonly Slot[]>();

export function weekPlan(location: string, week: number): readonly Slot[] {
  const key = `${location}:${week}`;
  const hit = plans.get(key);
  if (hit) return hit;
  const out: Slot[] = [];
  for (const def of POPUPS) {
    if (def.location !== location) continue;
    const rng = seededRng(hashSeed('popup', def.id, week));
    if (rng() >= def.chance) continue;
    const from = week * 7 + 1 + def.days[Math.floor(rng() * def.days.length)];
    const to = from + (def.span ?? 1) - 1;
    const [s, e] = window(def);
    const clashes = out.some((o) => {
      if (!(o.from <= to && from <= o.to)) return false;
      const [os, oe] = window(o.def);
      return s < oe && os < e;
    });
    if (clashes) continue;
    out.push({ def, from, to });
  }
  plans.set(key, out);
  return out;
}

/** Los eventos de hoy (un mismo día puede haber dos si no coinciden en horas) y la hora, de la jornada que toca. */
function today(location: string, clock: PopUpClock): { slots: readonly Slot[]; t: number } {
  // La madrugada cuenta con la noche anterior: el DJ del sábado sigue siendo del sábado a las 00:30.
  const day = nightOwner(clock.day, clock.hour);
  const slots = weekPlan(location, weekOf(day)).filter((s) => day >= s.from && day <= s.to);
  return { slots, t: clock.hour + clock.minute / 60 };
}

const stormy = (def: PopUpDef, clock: PopUpClock): boolean =>
  def.outdoor && weatherAt(clock.day, clock.hour + clock.minute / 60).rain > HEAVY_RAIN;

/** El evento que está en marcha ahora: con la gente ya allí. */
export function activePopUp(location: string, clock: PopUpClock): PopUpDef | undefined {
  const { slots, t } = today(location, clock);
  return slots.find((s) => inHours(s.def.hours, t) && !stormy(s.def, clock))?.def;
}

/**
 * El evento cuyas piezas están puestas y cuánto: de 0 a 1 mientras se monta (un
 * rato antes de abrir), 1 abierto, y de 1 a 0 mientras se recoge (`teardown`
 * después de cerrar). Con lluvia fuerte, nada. Puro: sale del reloj y del clima.
 */
export function popUpProgress(location: string, clock: PopUpClock): { def: PopUpDef; progress: number } | undefined {
  const { slots, t } = today(location, clock);
  // La hora en la jornada de su noche: a las 00:30 del domingo, las 24:30 del sábado.
  const tt = t + (nightOwner(clock.day, clock.hour) !== clock.day ? 24 : 0);
  for (const s of slots) {
    const [from, to] = window(s.def);
    if (tt < from || tt >= to || stormy(s.def, clock)) continue;
    const close = to - teardownOf(s.def);
    const progress = tt < s.def.hours[0] ? (tt - from) / s.def.setup : tt < close ? 1 : (to - tt) / teardownOf(s.def);
    return { def: s.def, progress };
  }
  return undefined;
}

/**
 * El evento cuyas piezas están puestas: desde un rato antes de abrir (se está
 * montando) hasta que se acaba de recoger. La gente sólo viene mientras está en marcha.
 */
export const visiblePopUp = (location: string, clock: PopUpClock): PopUpDef | undefined => popUpProgress(location, clock)?.def;

/** Cuántas de `n` piezas se ven con ese progreso: al menos una mientras está puesto (el primer puesto ya se monta). */
export const piecesShown = (progress: number, n: number): number => Math.min(n, Math.max(1, Math.ceil(progress * n)));

export interface PopUpStall {
  id: string;
  /** La zona del ancla: lo que va entre el sitio y el tipo en su id (`casco.plaza.market.01` → `plaza`). */
  zone: string;
  tx: number;
  ty: number;
  piece: PopUpPiece;
  /** Si vende (PopUpDef.stalls.vendors, CAS-03): su nombre y su catálogo o tienda. */
  vendor?: StallVendorDef;
}

const stallCache = new Map<string, readonly PopUpStall[]>();

/**
 * Los puestos de un evento con `stalls`, en el orden en que se montan (por hash del id del ancla; se recogen al revés).
 * Un vendedor lleva la familia de lo que vende; la del resto sale del hash: dentro de cada zona se barajan las demás
 * anclas por hash y se reparten las familias por turno, así ninguna zona se queda sin alguna y no hay alternancia
 * par/impar en el suelo.
 */
export function popUpStalls(def: PopUpDef): readonly PopUpStall[] {
  if (!def.stalls) return [];
  const hit = stallCache.get(def.id);
  if (hit) return hit;
  const { types, families } = def.stalls;
  const vendors = new Map((def.stalls.vendors ?? []).map((v) => [v.anchor, v]));
  const zoneOf = (a: StallAnchor): string => a.id.split('.').slice(1, -2).join('.');
  const anchors = (getLocation(def.location).stallAnchors ?? []).filter((a) => types.includes(a.type));
  const h = (salt: string, id: string): number => hashSeed('popup-stall', salt, def.id, id);
  const piece = new Map<string, PopUpPiece>();
  for (const zone of new Set(anchors.map(zoneOf))) {
    anchors
      .filter((a) => zoneOf(a) === zone && !vendors.has(a.id))
      .sort((a, b) => h('family', a.id) - h('family', b.id))
      .forEach((a, i) => piece.set(a.id, families[i % families.length]));
  }
  const out = anchors
    .map((a) => {
      const vendor = vendors.get(a.id);
      return { id: a.id, zone: zoneOf(a), tx: a.tx, ty: a.ty, piece: vendor?.piece ?? piece.get(a.id)!, ...(vendor ? { vendor } : {}) };
    })
    .sort((a, b) => h('order', a.id) - h('order', b.id));
  stallCache.set(def.id, out);
  return out;
}

/**
 * Los puestos que venden ahora mismo en ese sitio (CAS-03): sólo mientras su evento está en marcha (activePopUp: ni
 * montando, ni recogiendo, ni con lluvia fuerte). Fuera de eso, ninguno.
 */
export function stallVendors(location: string, clock: PopUpClock): readonly (PopUpStall & { vendor: StallVendorDef })[] {
  const def = activePopUp(location, clock);
  if (!def) return [];
  return popUpStalls(def).filter((s): s is PopUpStall & { vendor: StallVendorDef } => !!s.vendor);
}

/**
 * Cuánta basura de más cae ahora (el `surge` de systems/Litter): 2 mientras se recoge un evento al aire libre con
 * puestos y hasta una hora después (el Gran Rastro, domingo de 15:00 a 18:00); 1 si no, o si la lluvia lo ha suspendido.
 */
export function popUpLitter(location: string, clock: PopUpClock): number {
  const { slots, t } = today(location, clock);
  const tt = t + (nightOwner(clock.day, clock.hour) !== clock.day ? 24 : 0);
  const hit = slots.some((s) => {
    if (!s.def.stalls || !s.def.outdoor || stormy(s.def, clock)) return false;
    const end = window(s.def)[1];
    return tt >= end - teardownOf(s.def) && tt < end + 1;
  });
  return hit ? 2 : 1;
}

/** Paseantes de más en la calle ahora. */
export const popUpCrowd = (location: string, clock: PopUpClock): number => activePopUp(location, clock)?.extra ?? 0;

/** Los eventos de los próximos `days` días desde `fromDay`, para el inspector y las pruebas. */
export function upcoming(location: string, fromDay: number, days: number): { day: number; id: string }[] {
  const out: { day: number; id: string }[] = [];
  for (let d = fromDay; d < fromDay + days; d++) {
    for (const slot of weekPlan(location, weekOf(d))) if (d >= slot.from && d <= slot.to) out.push({ day: d, id: slot.def.id });
  }
  return out;
}
