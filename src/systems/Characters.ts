// Sin Phaser: lo usan WorldScene y scripts/check-characters.ts.
import type { Facing, SignalDef, TilePoint } from '../types/game.ts';
import { CHARACTERS, OUTINGS, type CharacterDef, type Routine, type Stop } from '../data/characters.ts';
import { findPoint, worldRoute } from './Navigation.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import { weekIndex } from './Calendar.ts';
import { getLocation } from './LocationSystem.ts';
import { crossingOf, minutesUntilWalk } from './Signals.ts';
import { isOpen, placeOfPoint } from './Places.ts';
import { weatherAt } from './Weather.ts';

/**
 * Dónde está un personaje con nombre es una función del reloj: nada que
 * simular fuera de cámara ni que guardar. Al recargar la partida, el reloj
 * guardado la vuelve a poner donde estaba; al entrar en un sitio, ya está allí
 * o va de camino. Sale de cada parada con el tiempo justo para llegar a la
 * siguiente a su hora, por el mismo worldRoute() que usará cualquier NPC.
 *
 * Qué rutina le toca cada día sale de una semilla (personaje y día): se puede
 * depurar, se repite al recargar y no todos los martes son iguales. Los días
 * empiezan a las 06:00, cuando todas las rutinas duermen en casa.
 *
 * Dentro de la rutina, cada día tiene además su versión (dailyRoutine): sale
 * unos minutos antes o después, a veces se salta un recado, cambia de mesa o
 * de banco y, si llueve, se queda a cubierto. Se decide una vez por día con su
 * semilla, así que tampoco hay saltos: a las 06:00 sigue estando en casa.
 */

const DAY = 24 * 60;
/** El día del personaje empieza a esta hora: la madrugada es de la noche anterior. */
export const DAY_STARTS = 6 * 60;
/** Lo mínimo que se queda en un sitio antes de irse al siguiente. */
const MIN_STAY = 10;
/** Por esperar un semáforo se puede salir antes y acortar la estancia hasta esto. */
const MIN_STAY_AT_LIGHTS = 2;

export interface Whereabouts {
  location: string;
  /** En tiles, con decimales mientras camina. */
  tx: number;
  ty: number;
  dir: Facing;
  moving: boolean;
  /** De camino, pero parado en un semáforo esperando el verde (sigue diciendo lo de ir). */
  waiting?: boolean;
  /** Dentro de un edificio sin interior (su casa): no se ve. */
  inside: boolean;
  /** Donde está o, si camina, a donde va. */
  stop: Stop;
  /** La rutina de hoy, para depurar. */
  routine: string;
}

interface Segment {
  location: string;
  a: TilePoint;
  b: TilePoint;
  /** Tiles recorridos al empezar el tramo. */
  from: number;
  length: number;
}

interface Trip {
  stop: Stop;
  arrive: number;
  /** Minutos de camino desde la parada anterior, esperas en los semáforos incluidas. */
  travel: number;
  segments: Segment[];
  /** Semáforos del camino: a qué distancia espera, cuándo llega (min tras salir) y cuánto espera. */
  crossings: CrossingWait[];
}

/** Un semáforo en el camino de un personaje, ya resuelto para su hora de salida. */
interface CrossingWait {
  at: number;
  reach: number;
  wait: number;
}

/** Tiles antes de las bandas en los que espera: de pie en el bordillo. */
const CURB = 0.6;

/**
 * Salida con semáforos: la más tardía que, esperando en rojo en cada paso,
 * llega a su hora. El semáforo es una función del reloj, así que el plan es
 * fijo y el personaje espera justo cuando el muñeco está en rojo. Si no hay
 * salida que cuadre sin robarle la estancia anterior, cruza sin esperar.
 */
function scheduleCrossings(segments: readonly Segment[], speed: number, arrive: number, slack: number): { travel: number; crossings: CrossingWait[] } {
  const walked = segments.reduce((s, seg) => s + seg.length, 0);
  const walkTime = walked / speed;
  const marks: { at: number; signal: SignalDef }[] = [];
  for (const s of segments) {
    const hit = crossingOf(getLocation(s.location).signals ?? [], s.a, s.b);
    if (hit) marks.push({ at: Math.max(0, s.from + hit.enter * s.length - CURB), signal: hit.signal });
  }
  if (marks.length === 0) return { travel: walkTime, crossings: [] };
  for (let early = 0; early <= slack; early += 0.25) {
    const depart = arrive - walkTime - early;
    const crossings: CrossingWait[] = [];
    let t = 0;
    let d = 0;
    for (const m of marks) {
      const reach = t + (m.at - d) / speed;
      const wait = minutesUntilWalk(m.signal, depart + reach);
      crossings.push({ at: m.at, reach, wait });
      t = reach + wait;
      d = m.at;
    }
    if (t + (walked - d) / speed <= walkTime + early + 1e-6) return { travel: walkTime + early, crossings };
  }
  return { travel: walkTime, crossings: [] };
}

/** Cuánto ha andado a `elapsed` minutos de salir, contando las esperas; `waiting`, si está parado en un semáforo. */
function progress(trip: Trip, speed: number, elapsed: number): { walked: number; waiting: boolean } {
  let t = 0;
  let d = 0;
  for (const c of trip.crossings) {
    if (elapsed < c.reach) return { walked: d + (elapsed - t) * speed, waiting: false };
    if (elapsed < c.reach + c.wait) return { walked: c.at, waiting: true };
    t = c.reach + c.wait;
    d = c.at;
  }
  return { walked: d + (elapsed - t) * speed, waiting: false };
}

const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function facingOf(dx: number, dy: number): Facing {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

/** Rutas y horas de salida de un día. Falla al arrancar si una parada es imposible. */
function plan(def: CharacterDef, routine: Routine): Trip[] {
  const who = `[${def.npc}/${routine.id}]`;
  return routine.stops.map((stop, i) => {
    const prev = routine.stops[(i - 1 + routine.stops.length) % routine.stops.length];
    if (!findPoint(stop.point)) throw new Error(`${who} punto desconocido ${stop.point}`);
    const legs = worldRoute(prev.point, stop.point);
    if (!legs) throw new Error(`${who} sin camino de ${prev.point} a ${stop.point}`);

    const segments: Segment[] = [];
    let walked = 0;
    for (const leg of legs) {
      for (let k = 1; k < leg.path.length; k++) {
        const a = leg.path[k - 1];
        const b = leg.path[k];
        const length = Math.hypot(b.tx - a.tx, b.ty - a.ty);
        if (length === 0) continue;
        segments.push({ location: leg.location, a, b, from: walked, length });
        walked += length;
      }
    }

    const arrive = minutesOf(stop.at);
    const travel = walked / def.speed;
    // Con una sola parada (un día entero en casa), la estancia es el día.
    const gap = (arrive - minutesOf(prev.at) + DAY) % DAY || DAY;
    if (gap - travel < MIN_STAY) {
      throw new Error(`${who} de ${prev.point} a ${stop.point} son ${Math.ceil(travel)} min andando: no le da tiempo a llegar a las ${stop.at}`);
    }
    // Los semáforos alargan el camino lo justo, sin comerse la estancia mínima de la parada anterior.
    const timed = scheduleCrossings(segments, def.speed, arrive, gap - travel - MIN_STAY_AT_LIGHTS);
    return { stop, arrive, travel: timed.travel, segments, crossings: timed.crossings };
  });
}

/** Dónde está a ese minuto del día (con decimales) siguiendo ese plan. */
function locate(trips: readonly Trip[], speed: number, minute: number, routine: string): Whereabouts {
  const t = ((minute % DAY) + DAY) % DAY;

  // ¿Va de camino? El viaje a una parada ocupa los `travel` minutos antes de llegar.
  for (const trip of trips) {
    const left = (trip.arrive - t + DAY) % DAY;
    if (left === 0 || left >= trip.travel) continue;
    const { walked, waiting } = progress(trip, speed, trip.travel - left);
    const seg = trip.segments.find((s) => walked < s.from + s.length) ?? trip.segments[trip.segments.length - 1];
    // Si ha llegado antes de su hora (esperó menos de lo previsto), espera ya en la parada.
    const last = trip.segments[trip.segments.length - 1];
    if (walked >= last.from + last.length) return atStop(trip.stop, routine);
    const k = Math.min(1, (walked - seg.from) / seg.length);
    return {
      location: seg.location,
      tx: seg.a.tx + (seg.b.tx - seg.a.tx) * k,
      ty: seg.a.ty + (seg.b.ty - seg.a.ty) * k,
      dir: facingOf(seg.b.tx - seg.a.tx, seg.b.ty - seg.a.ty),
      moving: true,
      waiting,
      inside: false,
      stop: trip.stop,
      routine,
    };
  }

  // Si no, está en la última parada a la que llegó.
  const here = trips.reduce((best, trip) =>
    (t - trip.arrive + DAY) % DAY < (t - best.arrive + DAY) % DAY ? trip : best,
  ).stop;
  return atStop(here, routine);
}

/** En la parada: en su punto, mirando hacia donde toca; dentro si es un portal. */
function atStop(here: Stop, routine: string): Whereabouts {
  const point = findPoint(here.point)!;
  return {
    location: point.location,
    tx: point.tx,
    ty: point.ty,
    dir: point.facing ?? 'down',
    moving: false,
    inside: point.kind === 'entrance',
    stop: here,
    routine,
  };
}

const PLANS = new Map<Routine, Trip[]>();
for (const def of CHARACTERS) {
  for (const routine of def.routines) {
    const trips = plan(def, routine);
    PLANS.set(routine, trips);
    // Todas duermen en casa al cambiar de día: así una rutina empalma con la siguiente sin saltos.
    const dawn = locate(trips, def.speed, DAY_STARTS, routine.id);
    if (dawn.moving || dawn.stop.point !== def.home) {
      throw new Error(`[${def.npc}/${routine.id}] a las 06:00 tiene que estar en casa (${def.home}), está en ${dawn.stop.point}`);
    }
    if (routine.outing && OUTINGS[routine.outing] === undefined) throw new Error(`[${def.npc}/${routine.id}] plan desconocido ${routine.outing}`);
  }
  for (let d = 0; d < 7; d++) {
    // La de lluvia y las de su historia no cuentan: tiene que haber una para cualquier día seco y sin nada especial.
    if (!def.routines.some((r) => !r.outing && !r.rain && !r.story && r.days.includes(d))) throw new Error(`[${def.npc}] sin rutina suelta para el día ${d}`);
  }
}

/**
 * Lo que cambia la rutina de un día más allá del calendario: si llueve y si su historia (systems/Story) ya lo ha
 * fijado. Se decide una vez por día y no se toca después: cambiarlo a mitad de día la teletransportaría.
 */
export interface DayContext {
  rainy?: boolean;
  /** Id de la rutina que manda ese día (Routine.story o cualquier otra). */
  forced?: string;
}

/** La rutina de cada día ya resuelta (WorldScene la fija por día con DayContext); sin ella, la del calendario. */
export type RoutinePicker = (day: number) => Routine;

export function tripsOf(routine: Routine): readonly Trip[] {
  return PLANS.get(routine)!;
}

// ================================================================
// LA VERSIÓN DE CADA DÍA
// ================================================================

/** Minutos (±) que se puede mover una parada: casi nada si es clase, trabajo o el metro; algo más lo demás. */
const FLEX = 10;
const FLEX_DUTY = 4;
/** Probabilidad de saltarse un recado opcional un día cualquiera. */
const SKIP = 0.3;
/** Probabilidad de ir al sitio de siempre cuando hay alternativas. */
const USUAL = 0.55;
/** Versiones guardadas (personaje, rutina, día, lluvia); se vacía de vez en cuando. */
const VARIANTS = new Map<string, Routine>();
const MAX_VARIANTS = 400;
const RAINY = new Map<number, boolean>();

/** Si ese día llueve por la mañana: lo mismo que decide las rutinas de lluvia (WorldScene.rainyDay). */
export function rainyDay(day: number): boolean {
  let r = RAINY.get(day);
  if (r === undefined) {
    r = weatherAt(day, 10).sky.endsWith('rain');
    if (RAINY.size > MAX_VARIANTS) RAINY.clear();
    RAINY.set(day, r);
  }
  return r;
}

/** Al aire libre: un punto de la calle que no es una puerta. */
function outdoor(point: string): boolean {
  const p = findPoint(point);
  return !!p && p.kind !== 'entrance' && getLocation(p.location).kind === 'exterior';
}

/** ¿Está abierto el sitio de ese punto a ese minuto del día del personaje? (La madrugada es del día siguiente.) */
function openAt(point: string, day: number, minute: number): boolean {
  const place = placeOfPoint(point);
  if (!place) return true;
  const m = ((Math.floor(minute) % DAY) + DAY) % DAY;
  return isOpen(place, m < DAY_STARTS ? day + 1 : day, Math.floor(m / 60), m % 60);
}

const hhmm = (m: number): string => {
  const t = ((Math.round(m) % DAY) + DAY) % DAY;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** Minutos desde las 06:00: el orden de las paradas dentro de su día. */
const sinceDawn = (hm: string): number => (minutesOf(hm) - DAY_STARTS + DAY) % DAY;

/** Una versión sirve si hay camino y tiempo, el sitio está abierto al llegar y al irse, y a las 06:00 está en casa. */
function viable(def: CharacterDef, routine: Routine, day: number): Trip[] | null {
  let trips: Trip[];
  try {
    trips = plan(def, routine);
  } catch {
    return null;
  }
  const dawn = locate(trips, def.speed, DAY_STARTS, routine.id);
  if (dawn.moving || dawn.stop.point !== def.home) return null;
  for (let i = 0; i < trips.length; i++) {
    const next = trips[(i + 1) % trips.length];
    const leave = next.arrive - next.travel;
    if (!openAt(trips[i].stop.point, day, trips[i].arrive) || !openAt(trips[i].stop.point, day, leave - 1)) return null;
  }
  return trips;
}

/**
 * La rutina de ese día en concreto. Las paradas se mueven unos minutos (sin cambiar de orden), un recado opcional
 * puede quedarse sin hacer, una parada con alternativas puede ir a otra mesa u otro banco y, si llueve, lo de
 * fuera que se pueda saltar se salta y lo que tenga alternativa a cubierto va ahí. Si esa versión no cuadra
 * (no llega, el sitio está cerrado), prueba sin mover horas y, si tampoco, se queda con la de siempre: nunca un
 * callejón sin salida. Los planes con otros (Routine.outing) y los de su historia (Routine.story) no se tocan:
 * tienen hora con alguien.
 */
export function dailyRoutine(def: CharacterDef, routine: Routine, day: number, rainy = false): Routine {
  if (routine.outing || routine.story || routine.stops.length < 3) return routine;
  const key = `${def.npc}|${routine.id}|${day}|${rainy ? 1 : 0}`;
  const known = VARIANTS.get(key);
  if (known) return known;

  const rng = seededRng(hashSeed('day', def.npc, routine.id, day));
  // Las tiradas, todas y en el mismo orden: que llueva no cambia lo demás que se decide ese día.
  const rolls = routine.stops.map(() => ({ skip: rng(), usual: rng(), which: rng(), shift: rng() }));
  const build = (moveTimes: boolean): Routine => {
    const stops: Stop[] = [];
    let last = -1;
    routine.stops.forEach((stop, i) => {
      const r = rolls[i];
      const out = outdoor(stop.point);
      if (stop.optional && ((rainy && out) || r.skip < SKIP)) return;
      let point = stop.point;
      const alts = stop.alt ?? [];
      const covered = alts.filter((a) => !outdoor(a));
      if (rainy && out && covered.length) point = covered[Math.floor(r.which * covered.length)];
      else if (alts.length && r.usual >= USUAL) point = alts[Math.floor(r.which * alts.length)];
      // Dos paradas seguidas en el mismo sitio (saltarse algo entre dos ratos en casa) son una sola.
      if (stops.length && stops[stops.length - 1].point === point) return;
      // Una obligación (dentro de la academia, el metro a la facultad) tiene poco margen; volver a casa, el normal.
      const flex = point !== def.home && findPoint(point)?.kind === 'entrance' ? FLEX_DUTY : FLEX;
      let at = stop.at;
      const moved = sinceDawn(stop.at) + Math.round((r.shift * 2 - 1) * flex);
      // Sin cruzar las 06:00 ni adelantar a la parada anterior.
      if (moveTimes && moved > last && moved > 0 && moved < DAY) at = hhmm(moved + DAY_STARTS);
      last = sinceDawn(at);
      stops.push(at === stop.at && point === stop.point ? stop : { ...stop, at, point });
    });
    return { ...routine, stops };
  };

  let chosen = routine;
  for (const candidate of [build(true), build(false)]) {
    const trips = viable(def, candidate, day);
    if (trips) {
      PLANS.set(candidate, trips);
      chosen = candidate;
      break;
    }
  }
  if (VARIANTS.size >= MAX_VARIANTS) {
    for (const v of VARIANTS.values()) if (!def.routines.includes(v)) PLANS.delete(v);
    VARIANTS.clear();
  }
  VARIANTS.set(key, chosen);
  return chosen;
}

/** Día del personaje (empieza a las 06:00) para un minuto absoluto: (día − 1)·1440 + minuto del día. */
export function characterDay(absMinute: number): number {
  return Math.floor((absMinute - DAY_STARTS) / DAY) + 1;
}

function solo(def: CharacterDef, day: number, salt: string, rainy = false): Routine {
  // Las de su historia nunca salen solas; la de lluvia, sólo si llueve.
  const today = def.routines.filter((r) => !r.outing && !r.story && (!r.rain || rainy) && r.days.includes(weekIndex(day)));
  // Una excepción de ese día manda sobre las rutinas normales (Routine.override).
  const overrides = today.filter((r) => r.override);
  const options = overrides.length ? overrides : today;
  const total = options.reduce((s, r) => s + r.weight, 0);
  let roll = seededRng(hashSeed('routine', def.npc, day, salt))() * total;
  for (const r of options) {
    roll -= r.weight;
    if (roll < 0) return r;
  }
  return options[options.length - 1];
}

/**
 * Rutina de ese día. Primero, los planes con otros: si sale, lo hacen todos
 * los que lo tienen. Si no, una suelta por peso; si repite la de ayer y había
 * otra posible, cambia de planes una vez.
 */
export function routineFor(def: CharacterDef, day: number, ctx: DayContext = {}): Routine {
  return dailyRoutine(def, baseRoutineFor(def, day, ctx), day, ctx.rainy);
}

/** La rutina del calendario, sin la versión del día (dailyRoutine). */
export function baseRoutineFor(def: CharacterDef, day: number, ctx: DayContext = {}): Routine {
  if (ctx.forced) {
    const forced = def.routines.find((r) => r.id === ctx.forced);
    if (forced) return forced;
  }
  for (const r of def.routines) {
    if (!r.outing || !r.days.includes(weekIndex(day))) continue;
    if (seededRng(hashSeed('outing', r.outing, day))() < OUTINGS[r.outing]) return r;
  }
  const first = solo(def, day, '', ctx.rainy);
  return first === solo(def, day - 1, '') ? solo(def, day, 'otra', ctx.rainy) : first;
}

/** Dónde está en ese minuto absoluto de partida ((día − 1)·1440 + minuto del día, con decimales). */
export function whereabouts(def: CharacterDef, absMinute: number, pick?: RoutinePicker): Whereabouts {
  const day = characterDay(absMinute);
  // Sin quien fije el día (Ada, el móvil), también cuenta la lluvia: el mismo día para todos.
  const routine = pick ? pick(day) : routineFor(def, day, { rainy: rainyDay(day) });
  return locate(tripsOf(routine), def.speed, absMinute, routine.id);
}

/** Minutos de retraso que recupera por minuto de juego mientras está parado. */
const CATCH_UP = 3;

/**
 * Tras pararse a hablar, un personaje va `lag` minutos por detrás de su
 * horario. Lo recupera acortando la parada en la que está, nunca andando más
 * deprisa ni apareciendo en otro sitio: si al recortar ya tendría que estar en
 * otra parte, sale tarde y lo intenta en la siguiente. Donde no se le ve (fuera
 * de `here` o dentro de casa), se pone al día de golpe. Devuelve el retraso que
 * le queda tras `minutes` de juego.
 */
export function catchUp(def: CharacterDef, now: number, lag: number, minutes: number, here: string, pick?: RoutinePicker): number {
  const seen = (w: Whereabouts): boolean => w.location === here && !w.inside;
  const was = whereabouts(def, now - lag, pick);
  if (seen(was) && was.moving) return lag;
  const still = (w: Whereabouts): boolean => (seen(w) ? !w.moving && seen(was) && w.stop.point === was.stop.point : !seen(was));
  if (still(whereabouts(def, now, pick))) return 0;
  const next = Math.max(0, lag - CATCH_UP * minutes);
  return still(whereabouts(def, now - next, pick)) ? next : lag;
}

/** Lo mismo, con la rutina fijada: para probar cada rutina aunque su día no salga. */
export function whereaboutsIn(def: CharacterDef, routine: Routine, minuteOfDay: number): Whereabouts {
  return locate(tripsOf(routine), def.speed, minuteOfDay, routine.id);
}
