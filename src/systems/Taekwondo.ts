// Sin Phaser: lo usan scenes/WorldScene (la clase de patadas, frame a frame), scenes/Menus (cinturón y examen) y
// ui/KickDrill (lo que se ve), y lo prueba scripts/check-taekwondo.ts.

/**
 * Taekwondo: los pies mandan. Una clase es una serie de órdenes de la instructora («circular, derecha») con su
 * compás; el jugador elige patada y pierna y, si hace falta, se acerca o se aleja del pao. Cada patada tiene sus
 * fases (recogida, extensión, contacto y vuelta) y llega a una distancia: sólo cuenta si en el instante de contacto el
 * pie llega al pao y hay una orden en su ventana. Una patada resuelve como mucho una orden, y una orden, una vez.
 *
 * El avance (coordinación, flexibilidad, equilibrio; la técnica es Fitness.skills.taekwondo) sale de lo que se hizo
 * bien, con rendimientos decrecientes en el día, y los cinturones piden asistencia y técnica reales y un examen.
 */

export type Kick = 'front' | 'round' | 'side';
export type Leg = 'L' | 'R';
export const KICK_ORDER: readonly Kick[] = ['front', 'round', 'side'];

export interface KickDef {
  label: string;
  /** Distancia del pie al pao, en tiles, a la que llega bien [mín, máx]: más cerca se queda encogida; más lejos, no llega. */
  reach: readonly [number, number];
  /** Energía de cada patada. */
  energy: number;
  /** Ms de cada fase: recogida, extensión hasta el contacto, sostener y volver a la guardia. */
  chamberMs: number;
  extendMs: number;
  holdMs: number;
  recoilMs: number;
}

export const KICKS: Readonly<Record<Kick, KickDef>> = {
  front: { label: 'Frontal', reach: [0.8, 1.6], energy: 0.6, chamberMs: 120, extendMs: 110, holdMs: 110, recoilMs: 160 },
  round: { label: 'Circular', reach: [0.9, 1.7], energy: 0.8, chamberMs: 150, extendMs: 130, holdMs: 120, recoilMs: 180 },
  side: { label: 'Lateral', reach: [1.3, 2.3], energy: 1, chamberMs: 170, extendMs: 140, holdMs: 140, recoilMs: 200 },
};

export const LEG_LABEL: Readonly<Record<Leg, string>> = { L: 'izquierda', R: 'derecha' };

/**
 * Boxeo en el saco (Doble Guardia): el jab sale con la mano adelantada (la izquierda, guardia de diestro) y el directo con
 * la atrasada (la derecha); 'guard' es la orden de subir la guardia a tiempo (la manopla de la instructora). Cada golpe con
 * sus fases y su alcance, como las patadas: no es el mismo golpe pintado de otro color.
 */
export type Punch = 'jab' | 'cross';
export type Strike = Kick | Punch | 'guard';
export type DrillSet = 'kicks' | 'punches';

export const STRIKES: Readonly<Record<Strike, KickDef>> = {
  ...KICKS,
  jab: { label: 'Jab', reach: [0.6, 1.5], energy: 0.3, chamberMs: 70, extendMs: 60, holdMs: 90, recoilMs: 130 },
  cross: { label: 'Directo', reach: [0.6, 1.4], energy: 0.45, chamberMs: 110, extendMs: 80, holdMs: 100, recoilMs: 170 },
  guard: { label: 'Guardia', reach: [0, 99], energy: 0, chamberMs: 0, extendMs: 0, holdMs: 0, recoilMs: 0 },
};

/** Qué golpe sale con cada mano en el saco: el jab con la adelantada, el directo con la atrasada. */
export const PUNCH_OF: Readonly<Record<Leg, Punch>> = { L: 'jab', R: 'cross' };

/** Cómo se nombra el golpe (con su pierna o su mano). */
const strikeName = (k: Strike, side: Leg): string => (k === 'jab' || k === 'cross' ? `${STRIKES[k].label} (mano ${LEG_LABEL[side]})` : `${STRIKES[k].label} ${LEG_LABEL[side]}`);

/** Ventanas de contacto alrededor del compás de cada orden (ms). */
export const PERFECT_MS = 140;
export const GOOD_MS = 320;

export const kickTotal = (k: Strike): number => STRIKES[k].chamberMs + STRIKES[k].extendMs + STRIKES[k].holdMs + STRIKES[k].recoilMs;
export const contactDelay = (k: Strike): number => STRIKES[k].chamberMs + STRIKES[k].extendMs;

export type Phase = 'chamber' | 'extend' | 'recoil';
/** En qué fase va una patada `ms` después de empezar; null si ya ha vuelto a la guardia. */
export function kickPhase(k: Strike, ms: number): Phase | null {
  const d = STRIKES[k];
  if (ms < d.chamberMs) return 'chamber';
  if (ms < d.chamberMs + d.extendMs + d.holdMs) return 'extend';
  if (ms < kickTotal(k)) return 'recoil';
  return null;
}

export interface Cue {
  kick: Strike;
  leg: Leg;
  /** Ms desde el empiece en que el pie debe tocar el pao. */
  at: number;
}

export type Grade = 'perfect' | 'good' | 'wrong-leg' | 'wrong-kick' | 'miss';

export interface Drill {
  cues: Cue[];
  results: (Grade | null)[];
  exam: boolean;
  /** Patadas (taekwondo) o golpes al saco (boxeo). */
  set: DrillSet;
  /** Desde cuándo está la guardia arriba (ms de la clase), o -1. */
  guardSince: number;
  /** El golpe en curso. */
  current: { kick: Strike; leg: Leg; start: number; resolved: boolean } | null;
  kicks: number;
  energy: number;
  /** Patadas que tocaron el pao sin orden a tiempo, y las que no llegaron (o llegaron encogidas). */
  offBeat: number;
  short: number;
  long: number;
  /** Por patada y pierna, cuántas no salieron bien: de aquí sale lo que dice la instructora. */
  faults: Record<string, number>;
}

/** Lo que acaba de pasar con una patada, para que se vea y se oiga al momento. */
export interface KickEvent {
  contact: boolean;
  grade?: Grade;
  text: string;
}

const rngOf = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};

/**
 * Las órdenes de una clase: frontal, circular y lateral, siempre con las dos piernas y,
 * en el examen, las tres patadas con cada pierna. El compás se aprieta algo con el nivel.
 */
export function createDrill(seed: number, level: number, exam = false, set: DrillSet = 'kicks'): Drill {
  const rng = rngOf(seed);
  if (set === 'punches') return punchDrill(rng, level);
  // Las tres patadas desde la primera clase; el nivel sólo aprieta el compás.
  const kinds: Kick[] = ['front', 'round', 'side'];
  const n = exam ? 10 : 8;
  const gap = Math.max(1_300, 1_800 - level * 25);
  const cues: Cue[] = [];
  const must: [Kick, Leg][] = exam ? KICK_ORDER.flatMap((k): [Kick, Leg][] => [[k, 'L'], [k, 'R']]) : [['front', 'L'], ['round', 'R'], ['side', 'L'], ['round', 'L']];
  for (let i = 0; i < n; i++) {
    const [kick, leg] = i < must.length ? must[i] : [kinds[Math.floor(rng() * kinds.length)], rng() < 0.5 ? 'L' : 'R'] as [Kick, Leg];
    cues.push({ kick, leg, at: 2_400 + i * gap });
  }
  // Mezcladas, pero con el compás en orden.
  for (let i = cues.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cues[i].kick, cues[j].kick, cues[i].leg, cues[j].leg] = [cues[j].kick, cues[i].kick, cues[j].leg, cues[i].leg];
  }
  return { cues, results: cues.map(() => null), exam, set, guardSince: -1, current: null, kicks: 0, energy: 0, offBeat: 0, short: 0, long: 0, faults: {} };
}

/** Lo que separa el jab del directo en una combinación (ms): la cadencia de las dos manos. */
export const COMBO_MS = 380;

/**
 * El saco: jab, directo, la combinación jab–directo (dos órdenes seguidas, a la cadencia de las manos) y la guardia, en
 * orden mezclado y siempre con las dos manos. El compás se aprieta algo con el nivel.
 */
function punchDrill(rng: () => number, level: number): Drill {
  const gap = Math.max(1_150, 1_550 - level * 25);
  const units: ('jab' | 'cross' | 'combo' | 'guard')[] = ['jab', 'cross', 'combo', 'guard', 'combo', 'jab', 'cross'];
  for (let i = units.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [units[i], units[j]] = [units[j], units[i]];
  }
  const cues: Cue[] = [];
  let at = 2_400;
  for (const u of units) {
    if (u === 'combo') {
      cues.push({ kick: 'jab', leg: 'L', at }, { kick: 'cross', leg: 'R', at: at + COMBO_MS });
      at += COMBO_MS;
    } else cues.push({ kick: u, leg: u === 'cross' ? 'R' : 'L', at });
    at += gap;
  }
  return { cues, results: cues.map(() => null), exam: false, set: 'punches', guardSince: -1, current: null, kicks: 0, energy: 0, offBeat: 0, short: 0, long: 0, faults: {} };
}

/** Patear: si la anterior aún no ha vuelto a la guardia, no sale otra (no se encadenan dos a la vez). */
export function startKick(d: Drill, kick: Strike, leg: Leg, t: number): boolean {
  if (kick === 'guard' || d.guardSince >= 0) return false;
  // Una patada tiene que acabar entera; un golpe con una mano, sólo llegar y empezar a volver: la otra mano sale mientras
  // (la combinación jab–directo). Con la misma mano, no: tiene que volver a la cara.
  const c = d.current;
  const free = c && d.set === 'punches' && c.leg !== leg ? contactDelay(c.kick) + STRIKES[c.kick].holdMs : c ? kickTotal(c.kick) : 0;
  if (c && t < c.start + free) return false;
  d.current = { kick, leg, start: t, resolved: false };
  d.kicks++;
  d.energy += STRIKES[kick].energy;
  return true;
}

const fault = (d: Drill, kick: Strike, leg: Leg): void => {
  const key = `${kick}:${leg}`;
  d.faults[key] = (d.faults[key] ?? 0) + 1;
};

/**
 * Avanza la clase a `t` con el jugador a `distance` tiles del pao. Devuelve lo que ha pasado en el contacto de la
 * patada en curso (si toca ahora) o null. Las órdenes cuyo compás ya pasó sin patada quedan falladas.
 */
export function stepDrill(d: Drill, t: number, distance: number, guard = false): KickEvent | null {
  let event: KickEvent | null = null;
  // La guardia: arriba desde cuándo (no se golpea con ella arriba: startKick).
  if (guard && d.guardSince < 0 && !(d.current && t < d.current.start + kickTotal(d.current.kick))) d.guardSince = t;
  if (!guard) d.guardSince = -1;
  // Las órdenes de guardia se resuelven en su compás: arriba a tiempo, bien; tarde, buena; abajo, fallada.
  for (let i = 0; i < d.cues.length; i++) {
    if (d.cues[i].kick !== 'guard' || d.results[i] !== null || t < d.cues[i].at) continue;
    const up = d.guardSince >= 0;
    const grade: Grade = up ? (t - d.guardSince >= 120 ? 'perfect' : 'good') : 'miss';
    d.results[i] = grade;
    if (!up) fault(d, 'guard', 'L');
    event = { contact: up, grade, text: up ? (grade === 'perfect' ? '¡Guardia! Arriba a tiempo.' : 'Guardia, justa. Súbela antes.') : 'La manopla te encuentra con la guardia abajo.' };
  }
  const k = d.current;
  if (k && !k.resolved && t >= k.start + contactDelay(k.kick)) {
    k.resolved = true;
    const contact = k.start + contactDelay(k.kick);
    const def = STRIKES[k.kick];
    const name = strikeName(k.kick, k.leg);
    if (distance > def.reach[1]) {
      d.long++;
      fault(d, k.kick, k.leg);
      event = { contact: false, text: `${name}: no llega. Acércate.` };
    } else if (distance < def.reach[0]) {
      d.short++;
      fault(d, k.kick, k.leg);
      event = { contact: false, text: `${name}: muy encima, sale ${d.set === 'punches' ? 'ahogado' : 'encogida'}. Atrás un paso.` };
    } else {
      // Toca el pao: la orden pendiente más cercana a este instante, si cae en su ventana.
      let best = -1;
      for (let i = 0; i < d.cues.length; i++) {
        if (d.results[i] !== null || d.cues[i].kick === 'guard' || Math.abs(contact - d.cues[i].at) > GOOD_MS) continue;
        if (best < 0 || Math.abs(contact - d.cues[i].at) < Math.abs(contact - d.cues[best].at)) best = i;
      }
      if (best < 0) {
        d.offBeat++;
        event = { contact: true, text: `${name}: ${d.set === 'punches' ? 'toca el saco' : 'toca el pao'}, pero fuera de compás.` };
      } else {
        const cue = d.cues[best];
        const grade: Grade = cue.kick !== k.kick ? 'wrong-kick' : cue.leg !== k.leg ? 'wrong-leg' : Math.abs(contact - cue.at) <= PERFECT_MS ? 'perfect' : 'good';
        d.results[best] = grade;
        if (grade === 'wrong-kick' || grade === 'wrong-leg') fault(d, cue.kick, cue.leg);
        event = {
          contact: true,
          grade,
          text: grade === 'perfect' ? `¡${name}! Limpia y a tiempo.` : grade === 'good' ? `${name}. Bien; un pelo fuera de compás.` : grade === 'wrong-leg' ? `Era con la ${LEG_LABEL[cue.leg]}.` : d.set === 'punches' ? `Era el ${STRIKES[cue.kick].label.toLowerCase()} (mano ${LEG_LABEL[cue.leg]}).` : `Era ${STRIKES[cue.kick].label.toLowerCase()}.`,
        };
      }
    }
  }
  for (let i = 0; i < d.cues.length; i++) {
    if (d.results[i] === null && d.cues[i].kick !== 'guard' && t > d.cues[i].at + GOOD_MS && !(k && !k.resolved)) {
      d.results[i] = 'miss';
      fault(d, d.cues[i].kick, d.cues[i].leg);
    }
  }
  return event;
}

/** La orden que toca ahora (la primera sin resolver), o -1 si ya no quedan. */
export const nextCue = (d: Drill): number => d.results.findIndex((r) => r === null);

export const drillDone = (d: Drill, t: number): boolean => nextCue(d) < 0 && (!d.current || t >= d.current.start + kickTotal(d.current.kick));

export interface DrillSummary {
  perfect: number;
  good: number;
  wrong: number;
  missed: number;
  total: number;
  /** De 0 a 1: lo bien hecho (perfecta 1, buena 0,7) sobre lo pedido. */
  accuracy: number;
  /** De 0 a 1: cuánta clase se llegó a hacer (órdenes resueltas). */
  done: number;
}

export function summarize(d: Drill): DrillSummary {
  const count = (g: Grade): number => d.results.filter((r) => r === g).length;
  const perfect = count('perfect');
  const good = count('good');
  const wrong = count('wrong-leg') + count('wrong-kick');
  const missed = count('miss');
  const total = d.cues.length;
  return { perfect, good, wrong, missed, total, accuracy: (perfect + good * 0.7) / total, done: d.results.filter((r) => r !== null).length / total };
}

/** Lo que dice la instructora al acabar: lo que de verdad pasó, no una frase hecha. */
export function coachLines(d: Drill, s: DrillSummary, coach: string): string[] {
  const lines: string[] = [];
  const punches = d.set === 'punches';
  if (s.accuracy >= 0.85) lines.push(punches ? `${coach}: «Muy bien. Las dos manos salen y vuelven a la cara.»` : `${coach}: «Muy bien. Las dos piernas responden y el pie vuelve a la guardia.»`);
  else if (s.accuracy >= 0.55) lines.push(`${coach}: «Vas bien. Ahora, más limpio.»`);
  else lines.push(`${coach}: «Despacio. Primero la técnica; la velocidad viene sola.»`);
  if (d.long > d.short && d.long > 0) lines.push(punches ? 'Golpeas desde lejos: un paso adelante y que el brazo llegue estirado.' : 'Se te quedan cortas: mide la distancia antes de soltar la pierna.');
  else if (d.short > 0) lines.push(punches ? 'Muy pegado al saco: los golpes salen ahogados. Un paso atrás.' : 'Pateas muy encima del pao: un paso atrás y la pierna sale entera.');
  if (d.offBeat > 1) lines.push(punches ? 'Escucha la cuenta: golpeas antes de la orden.' : 'Escucha la cuenta: pateas antes de la orden.');
  const worst = Object.entries(d.faults).sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 2) {
    const [kick, leg] = worst[0].split(':') as [Strike, Leg];
    lines.push(kick === 'guard' ? 'La guardia se te queda abajo cuando llega la manopla. Súbela antes.' : punches ? `El ${STRIKES[kick].label.toLowerCase()} (mano ${LEG_LABEL[leg]}) es el que más falla. Repítelo despacio.` : `La ${STRIKES[kick].label.toLowerCase()} con la ${LEG_LABEL[leg]} es la que más falla. Repítela despacio.`);
  }
  return lines;
}

// ------------------------------------------------------------------ progreso y cinturones

export interface TkdProgress {
  coordination: number;
  flexibility: number;
  balance: number;
  /** Índice en BELTS. */
  belt: number;
  /** Clases a las que ha venido de verdad (con algo bien hecho), una por clase pagada. */
  attended: number;
  /** Comienzo (minuto absoluto) de la última clase contada: la misma no cuenta dos veces. */
  lastSlot: number;
  /** Día y clases contadas ese día: la tercera rinde menos. */
  day: number;
  today: number;
}

export const START_TKD: TkdProgress = { coordination: 0, flexibility: 0, balance: 0, belt: 0, attended: 0, lastSlot: -1, day: 0, today: 0 };

export interface Belt {
  name: string;
  color: string;
  /** Lo que pide el examen para llegar a él. */
  attended: number;
  technique: number;
}

export const BELTS: readonly Belt[] = [
  { name: 'blanco', color: '#f2efe6', attended: 0, technique: 0 },
  { name: 'amarillo', color: '#e8c33a', attended: 4, technique: 4 },
  { name: 'verde', color: '#3f8f4a', attended: 10, technique: 10 },
  { name: 'azul', color: '#2f5f9e', attended: 18, technique: 18 },
  { name: 'rojo', color: '#b8323a', attended: 28, technique: 28 },
  { name: 'negro', color: '#141414', attended: 40, technique: 40 },
];

/** Nota mínima del examen para aprobar. */
export const EXAM_PASS = 0.75;

const clamp = (v: number): number => Math.min(100, Math.max(0, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;
const room = (v: number): number => Math.pow(1 - v / 100, 1.4);
const DAILY = [1, 1, 0.6, 0.35, 0.15] as const;

/** Si puede examinarse ahora del siguiente cinturón; si no, por qué. */
export function examReady(p: TkdProgress, technique: number): { ok: true; belt: Belt } | { ok: false; reason: string } {
  const next = BELTS[p.belt + 1];
  if (!next) return { ok: false, reason: 'Ya tienes el negro. Ahora, a enseñar.' };
  if (p.attended < next.attended) return { ok: false, reason: `Para el ${next.name} te faltan ${next.attended - p.attended} clases.` };
  if (technique < next.technique) return { ok: false, reason: `Para el ${next.name} te falta técnica (${technique.toFixed(1)} de ${next.technique}).` };
  return { ok: true, belt: next };
}

/**
 * Lo que deja una clase hecha. `slot` es la clase pagada (systems/Academy): sólo cuenta como asistencia una vez y si se
 * hizo algo bien. El avance va con lo bien hecho, cuesta más cuanto más alto y rinde menos a partir de la tercera del día.
 * En un examen aprobado, el cinturón siguiente.
 */
export function applyDrill(p0: TkdProgress, d: Drill, slot: number, day: number, technique: number): { next: TkdProgress; promoted: Belt | null; counted: boolean } {
  const s = summarize(d);
  const today = p0.day === day ? p0.today : 0;
  const k = s.accuracy * DAILY[Math.min(today, DAILY.length - 1)];
  const kicked = (kick: Kick): number => d.cues.filter((c, i) => c.kick === kick && (d.results[i] === 'perfect' || d.results[i] === 'good')).length / d.cues.length;
  const counted = slot !== p0.lastSlot && s.accuracy > 0 && s.done >= 0.5;
  let next: TkdProgress = {
    ...p0,
    coordination: round2(clamp(p0.coordination + 1.2 * k * room(p0.coordination))),
    flexibility: round2(clamp(p0.flexibility + (0.5 + 1.5 * (kicked('round') + kicked('side'))) * k * room(p0.flexibility))),
    balance: round2(clamp(p0.balance + 1 * k * room(p0.balance))),
    day,
    today: counted ? today + 1 : today,
    attended: p0.attended + (counted ? 1 : 0),
    lastSlot: counted ? slot : p0.lastSlot,
  };
  let promoted: Belt | null = null;
  if (d.exam && s.accuracy >= EXAM_PASS && examReady(p0, technique).ok) {
    promoted = BELTS[p0.belt + 1];
    next = { ...next, belt: p0.belt + 1 };
  }
  return { next, promoted, counted };
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Lee lo guardado: sin ello (partidas anteriores), nada; lo mal formado se repone y no rompe la carga. */
export function parseTkd(v: unknown): TkdProgress | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const r = v as Record<string, unknown>;
  return {
    coordination: num(r.coordination, 0, 100, 0),
    flexibility: num(r.flexibility, 0, 100, 0),
    balance: num(r.balance, 0, 100, 0),
    belt: Math.round(num(r.belt, 0, BELTS.length - 1, 0)),
    attended: Math.round(num(r.attended, 0, 100_000, 0)),
    lastSlot: Math.round(num(r.lastSlot, -1, Number.MAX_SAFE_INTEGER, -1)),
    day: Math.round(num(r.day, 0, Number.MAX_SAFE_INTEGER, 0)),
    today: Math.round(num(r.today, 0, 1000, 0)),
  };
}
