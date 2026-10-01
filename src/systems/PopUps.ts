// Sin Phaser: lo usan StreetLife (viajes y gente de más), world/PopUpView, el inspector y scripts/check-popups.
import { POPUPS, type PopUpDef } from '../data/popups.ts';
import { nightOwner } from './Calendar.ts';
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
 * monta hasta media hora después de cerrar (pasada la medianoche, más de 24).
 */
function window(def: PopUpDef): readonly [number, number] {
  return [def.hours[0] - def.setup, def.hours[1] + (def.hours[1] <= def.hours[0] ? 24 : 0) + 0.5];
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
 * El evento cuyas piezas están puestas: desde un rato antes de abrir (se está
 * montando) hasta media hora después de cerrar (se recoge). La gente sólo
 * viene mientras está en marcha.
 */
export function visiblePopUp(location: string, clock: PopUpClock): PopUpDef | undefined {
  const { slots, t } = today(location, clock);
  return slots.find((s) => {
    const { hours, setup } = s.def;
    return inHours([(hours[0] - setup + 24) % 24, (hours[1] + 0.5) % 24], t) && !stormy(s.def, clock);
  })?.def;
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
