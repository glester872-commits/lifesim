// Sin Phaser: lo usan WorldScene y scripts/check-characters.ts.
import type { Facing, SignalDef, TilePoint } from '../types/game.ts';
import { CHARACTERS, OUTINGS, type CharacterDef, type Routine, type Stop } from '../data/characters.ts';
import { findPoint, worldRoute } from './Navigation.ts';
import { hashSeed, seededRng, weekIndex } from './MetroDaily.ts';
import { getLocation } from './LocationSystem.ts';
import { crossingOf, minutesUntilWalk } from './Signals.ts';

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
    if (!def.routines.some((r) => !r.outing && r.days.includes(d))) throw new Error(`[${def.npc}] sin rutina suelta para el día ${d}`);
  }
}

export function tripsOf(routine: Routine): readonly Trip[] {
  return PLANS.get(routine)!;
}

/** Día del personaje (empieza a las 06:00) para un minuto absoluto: (día − 1)·1440 + minuto del día. */
export function characterDay(absMinute: number): number {
  return Math.floor((absMinute - DAY_STARTS) / DAY) + 1;
}

function solo(def: CharacterDef, day: number, salt: string): Routine {
  const options = def.routines.filter((r) => !r.outing && r.days.includes(weekIndex(day)));
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
export function routineFor(def: CharacterDef, day: number): Routine {
  for (const r of def.routines) {
    if (!r.outing || !r.days.includes(weekIndex(day))) continue;
    if (seededRng(hashSeed('outing', r.outing, day))() < OUTINGS[r.outing]) return r;
  }
  const first = solo(def, day, '');
  return first === solo(def, day - 1, '') ? solo(def, day, 'otra') : first;
}

/** Dónde está en ese minuto absoluto de partida ((día − 1)·1440 + minuto del día, con decimales). */
export function whereabouts(def: CharacterDef, absMinute: number): Whereabouts {
  const routine = routineFor(def, characterDay(absMinute));
  return locate(tripsOf(routine), def.speed, absMinute, routine.id);
}

/** Lo mismo, con la rutina fijada: para probar cada rutina aunque su día no salga. */
export function whereaboutsIn(def: CharacterDef, routine: Routine, minuteOfDay: number): Whereabouts {
  return locate(tripsOf(routine), def.speed, minuteOfDay, routine.id);
}
