// Sin Phaser: lo usan scenes/WorldScene (el combate, frame a frame), ui/SparPanel (lo que se ve) y systems/Tournaments,
// y lo prueba scripts/check-sparring.ts.
import { KICKS } from './Taekwondo.ts';

/**
 * Combate de academia (taekwondo, boxeo o los ejercicios por parejas de MMA) contra un rival: dos personas en una línea, a una distancia que cada una
 * ajusta. Cada golpe tiene su preparación (se ve venir), su instante de contacto y su vuelta; puntúa sólo si en el
 * contacto el rival está a su alcance y no tiene la guardia arriba a tiempo. Un golpe limpio aturde un momento, empuja y
 * corta lo que el rival estuviera preparando. Gana quien más puntúa en dos asaltos; empate, punto de oro y, si tampoco,
 * decisión (golpes limpios, luego menos encajados, luego más paradas).
 *
 * Sin sangre ni lesiones: es la academia. El rival decide con su nivel (0–1) y su semilla: siempre igual con lo mismo.
 *
 * MMA (Academia MMA Arena): golpeo y lucha en la misma línea. Puños con las dos manos (jab con la izquierda, directo con
 * la derecha: cada mano su tiempo y su alcance), patadas frontal y circular con las dos piernas (la de delante, rápida;
 * la de atrás, más lenta y que vale más) y lucha por fases: de pie → clinch (sólo a distancia de agarre) → derribo
 * (se defiende con la base, la guardia mantenida) → suelo, arriba o abajo → control (tres fijaciones) o escape y vuelta
 * de pie. Cada intento tiene su preparación visible, su respuesta del otro y su recuperación, cuesta energía y equilibrio
 * (sin equilibrio no se derriba ni se escapa), y agarrados no se golpea. Soltarse del clinch: mantener atrás.
 */

export type Style = 'taekwondo' | 'boxing' | 'mma';
export type MoveId = 'front' | 'round' | 'side' | 'jab' | 'cross' | 'hook' | 'clinch' | 'takedown' | 'pin' | 'escape';
export type Side = 'L' | 'R';
/** Sesión de MMA: sólo puños, sólo patadas, sólo lucha o el ejercicio supervisado que pasa de una cosa a otra. */
export type Drill = 'punches' | 'kicks' | 'grappling' | 'mixed';
export type Phase = 'stand' | 'clinch' | 'ground';
export type Tech = 'punches' | 'kicks' | 'grappling';

export interface MoveDef {
  label: string;
  /** Distancia a la que puntúa [mín, máx] (tiles): más cerca se ahoga; más lejos, no llega. */
  reach: readonly [number, number];
  /** Ms hasta el contacto (preparación visible), sosteniendo y volviendo a la guardia. */
  windupMs: number;
  holdMs: number;
  recoverMs: number;
  points: number;
  energy: number;
}

const kick = (k: 'front' | 'round' | 'side', points: number): MoveDef => ({
  label: KICKS[k].label, reach: KICKS[k].reach, windupMs: KICKS[k].chamberMs + KICKS[k].extendMs, holdMs: KICKS[k].holdMs, recoverMs: KICKS[k].recoilMs, points, energy: KICKS[k].energy,
});

export const MOVES: Readonly<Record<MoveId, MoveDef>> = {
  // Taekwondo: la frontal es rápida y vale poco; la lateral llega más lejos y vale más.
  front: kick('front', 1),
  round: kick('round', 2),
  side: kick('side', 3),
  // Boxeo: el jab, rápido y largo; el directo, más fuerte; el gancho, corto y fuerte.
  jab: { label: 'Jab', reach: [0.5, 1.3], windupMs: 110, holdMs: 90, recoverMs: 140, points: 1, energy: 0.3 },
  cross: { label: 'Directo', reach: [0.5, 1.3], windupMs: 170, holdMs: 100, recoverMs: 180, points: 2, energy: 0.5 },
  hook: { label: 'Gancho', reach: [0.3, 0.9], windupMs: 200, holdMs: 110, recoverMs: 220, points: 2, energy: 0.6 },
  // Lucha (MMA). Entrar al clinch sólo a distancia de agarre; los demás, ya agarrados (la distancia la fija la fase).
  clinch: { label: 'Entrada al clinch', reach: [0.3, 0.95], windupMs: 260, holdMs: 120, recoverMs: 320, points: 0, energy: 0.6 },
  takedown: { label: 'Derribo', reach: [0, 9], windupMs: 450, holdMs: 150, recoverMs: 420, points: 2, energy: 1.2 },
  pin: { label: 'Fijación', reach: [0, 9], windupMs: 300, holdMs: 600, recoverMs: 300, points: 1, energy: 0.5 },
  escape: { label: 'Escape', reach: [0, 9], windupMs: 500, holdMs: 150, recoverMs: 600, points: 1, energy: 1 },
};

/** Los golpes que se eligen con 1/2/3. En MMA el puño lo decide la mano (J jab, K directo) y la lucha va aparte (G). */
export const STYLE_MOVES: Readonly<Record<Style, readonly MoveId[]>> = { taekwondo: ['front', 'round', 'side'], boxing: ['jab', 'cross', 'hook'], mma: ['jab', 'front', 'round'] };

/** Lo que vale en cada sesión de MMA. */
export const DRILL_MOVES: Readonly<Record<Drill, readonly MoveId[]>> = {
  punches: ['jab', 'cross'],
  kicks: ['front', 'round'],
  grappling: ['clinch', 'takedown', 'pin', 'escape'],
  mixed: ['jab', 'cross', 'front', 'round', 'clinch', 'takedown', 'pin', 'escape'],
};
export const DRILL_LABEL: Readonly<Record<Drill, string>> = { punches: 'Puños', kicks: 'Patadas', grappling: 'Lucha', mixed: 'Ejercicio supervisado' };
const GRAPPLE: ReadonlySet<MoveId> = new Set(['clinch', 'takedown', 'pin', 'escape']);
const KICK: ReadonlySet<MoveId> = new Set(['front', 'round', 'side']);
export const techOf = (id: MoveId): Tech => (GRAPPLE.has(id) ? 'grappling' : KICK.has(id) ? 'kicks' : 'punches');

/** Los botones 1/2/3 de una sesión: los golpes que admite (la lucha va con G). */
export const slotsOf = (b: Bout): readonly MoveId[] => (b.drill ? STYLE_MOVES.mma.filter((id) => DRILL_MOVES[b.drill!].includes(id)) : STYLE_MOVES[b.style]);

/**
 * El golpe tal como sale de esa extremidad. En MMA la pierna de atrás (derecha, guardia de diestro) tarda más en llegar,
 * llega algo más lejos, gasta más y vale un punto más; la de delante es la rápida. Taekwondo y boxeo, como siempre.
 */
export function specOf(style: Style, id: MoveId, side: Side): MoveDef {
  const d = MOVES[id];
  if (style !== 'mma' || !KICK.has(id)) return d;
  return side === 'R'
    ? { ...d, reach: [d.reach[0] + 0.1, d.reach[1] + 0.15], windupMs: Math.round(d.windupMs * 1.2), recoverMs: Math.round(d.recoverMs * 1.15), points: d.points + 1, energy: d.energy * 1.25 }
    : { ...d, windupMs: Math.round(d.windupMs * 0.9) };
}

export const SPAR = {
  /** Asaltos y lo que dura cada uno, y el descanso entre ellos (ms del combate). */
  rounds: 2,
  roundMs: 40_000,
  breakMs: 2_500,
  /** Punto de oro: lo que dura como mucho (ms). */
  goldenMs: 15_000,
  /** La guardia para un golpe sólo si está arriba al menos esto antes del contacto (ms): subirla tarde no vale. */
  blockReadyMs: 90,
  /** Lo que queda aturdido quien encaja un golpe limpio (ms), y cuánto le empuja (tiles). */
  stunMs: 380,
  knockback: 0.35,
  /** Distancia mínima entre los dos (no se atraviesan) y la línea en la que se mueven (tiles desde el sitio del jugador). */
  minGap: 0.45,
  bounds: [-1, 4] as const,
  /** Paso de cada uno (tiles por segundo); con la guardia arriba, la mitad. */
  speed: 1.6,
  /** Distancia a la que empiezan. */
  start: 2.6,
  /** MMA: equilibrio mínimo para derribar o escapar, lo que cuesta un intento parado y lo que se recupera por segundo. */
  balanceMin: 0.5,
  balanceCost: 0.4,
  balanceRegen: 0.3,
  /** MMA: distancia del clinch, ms con atrás mantenido para soltarse, fijaciones para el control y ms de suelo sin progreso. */
  clinchGap: 0.5,
  releaseMs: 400,
  pinsToControl: 3,
  groundStallMs: 12_000,
} as const;

export interface Fighter {
  /** Posición en la línea (tiles); el jugador mira a +, el rival a −. */
  x: number;
  dir: 1 | -1;
  move: { id: MoveId; side: Side; start: number; resolved: boolean } | null;
  blocking: boolean;
  blockSince: number;
  stunUntil: number;
  score: number;
  landed: number;
  taken: number;
  blocks: number;
  energy: number;
  /** MMA: equilibrio (0–1), ms manteniendo atrás en el clinch y técnica practicada de verdad (contactos a distancia). */
  balance: number;
  pull: number;
  tech: Record<Tech, number>;
}

export interface Bout {
  style: Style;
  /** Sesión de MMA (null en taekwondo y boxeo). */
  drill: Drill | null;
  /** MMA: de pie, en el clinch o en el suelo; quién está arriba; desde cuándo y fijaciones seguidas. */
  grip: { phase: Phase; top: 'p' | 'o' | null; since: number; pins: number };
  /** Ms de combate (sólo avanza con stepBout). */
  t: number;
  round: number;
  roundEnd: number;
  breakUntil: number;
  golden: boolean;
  level: number;
  rng: number;
  p: Fighter;
  o: Fighter;
  /** `tired`: lo que el rival ha perdido de nivel por cansancio (sube con cada golpe suyo; el descanso lo recupera en parte). */
  ai: { next: number; reactAt: number; react: 'block' | 'back' | null; tired: number };
  ended: boolean;
  won: boolean | null;
  /** Cómo acabó: por puntos, punto de oro o decisión. */
  how: 'puntos' | 'punto de oro' | 'decisión' | null;
}

export interface BoutInput {
  /** -1 alejarse, 0 quieto, 1 acercarse. */
  move: -1 | 0 | 1;
  block: boolean;
  attack?: { id: MoveId; side: Side } | null;
  /** MMA: la acción de lucha que toca en la fase (entrar al clinch, derribar, fijar o escapar). */
  grab?: boolean;
  /** Energía del jugador que queda (si se da, no se empieza lo que cueste más). */
  energy?: number;
}

export interface BoutEvent {
  who: 'p' | 'o';
  kind: 'hit' | 'blocked' | 'miss' | 'round' | 'end' | 'info';
  text: string;
}

const fighter = (x: number, dir: 1 | -1): Fighter => ({ x, dir, move: null, blocking: false, blockSince: 0, stunUntil: 0, score: 0, landed: 0, taken: 0, blocks: 0, energy: 0, balance: 1, pull: 0, tech: { punches: 0, kicks: 0, grappling: 0 } });

export function createBout(style: Style, level: number, seed: number, drill: Drill | null = null): Bout {
  return {
    style, drill: style === 'mma' ? (drill ?? 'mixed') : null, grip: { phase: 'stand', top: null, since: 0, pins: 0 }, t: 0, round: 1, roundEnd: SPAR.roundMs, breakUntil: 0, golden: false, level: Math.min(1, Math.max(0, level)), rng: (seed >>> 0) || 1,
    p: fighter(0, 1), o: fighter(SPAR.start, -1), ai: { next: 1_500, reactAt: -1, react: null, tired: 0 }, ended: false, won: null, how: null,
  };
}

const random = (b: Bout): number => {
  b.rng = (Math.imul(b.rng, 1664525) + 1013904223) >>> 0;
  return b.rng / 2 ** 32;
};

export const distanceOf = (b: Bout): number => Math.abs(b.o.x - b.p.x);
const spec = (b: Bout, m: NonNullable<Fighter['move']>): MoveDef => specOf(b.style, m.id, m.side);
export const moveTotal = (id: MoveId, d: MoveDef = MOVES[id]): number => d.windupMs + d.holdMs + d.recoverMs;
export type MovePhase = 'windup' | 'hold' | 'recover';
export function movePhase(f: Fighter, t: number, style: Style = 'boxing'): MovePhase | null {
  if (!f.move) return null;
  const d = specOf(style, f.move.id, f.move.side);
  const ms = t - f.move.start;
  if (ms < d.windupMs) return 'windup';
  if (ms < d.windupMs + d.holdMs) return 'hold';
  if (ms < moveTotal(f.move.id, d)) return 'recover';
  return null;
}

const busyIn = (b: Bout, f: Fighter): boolean => b.t < f.stunUntil || (f.move !== null && b.t < f.move.start + moveTotal(f.move.id, spec(b, f.move)));

/** MMA: la acción de lucha que toca a ese luchador en la fase de ahora. */
export function grappleFor(b: Bout, who: 'p' | 'o'): MoveId {
  const g = b.grip;
  if (g.phase === 'stand') return 'clinch';
  if (g.phase === 'clinch') return 'takedown';
  return g.top === who ? 'pin' : 'escape';
}

/**
 * Empezar un golpe o un intento: no con otro a medias, ni aturdido, ni con la guardia arriba, ni lo que no toca en la
 * sesión o en la fase (agarrados no se golpea), ni sin energía o sin equilibrio. Devuelve por qué no ('' si no hace falta decirlo).
 */
function attack(b: Bout, f: Fighter, id: MoveId, side: Side, energy = Infinity): string | null {
  if (busyIn(b, f) || f.blocking) return '';
  const allowed = b.drill ? DRILL_MOVES[b.drill] : STYLE_MOVES[b.style];
  if (!allowed.includes(id)) return b.drill ? `En esta sesión (${DRILL_LABEL[b.drill].toLowerCase()}) no toca.` : '';
  const who = f === b.p ? 'p' : 'o';
  if (b.style === 'mma' && (GRAPPLE.has(id) ? grappleFor(b, who) !== id : b.grip.phase !== 'stand')) return GRAPPLE.has(id) ? '' : 'Agarrados no se golpea: derriba, escapa o suéltate (atrás).';
  const d = specOf(b.style, id, side);
  if (f.energy + d.energy > energy) return 'Sin energía para eso: descansa o termina.';
  if ((id === 'takedown' || id === 'escape') && f.balance < SPAR.balanceMin) return 'Sin equilibrio todavía: recupera la base.';
  f.move = { id, side, start: b.t, resolved: false };
  f.energy += d.energy;
  return null;
}

/** Moverse en la línea, sin atravesar al otro ni salir del tatami (o del ring). Agarrados, nadie se desplaza. */
function step(b: Bout, f: Fighter, other: Fighter, toward: -1 | 0 | 1, dt: number): void {
  if (!toward || busyIn(b, f) || b.grip.phase !== 'stand') return;
  const speed = SPAR.speed * (f.blocking ? 0.5 : 1);
  let x = f.x + toward * f.dir * speed * (dt / 1000);
  x = Math.min(SPAR.bounds[1], Math.max(SPAR.bounds[0], x));
  if ((other.x - x) * f.dir < SPAR.minGap) x = other.x - f.dir * SPAR.minGap;
  f.x = x;
}

function setBlock(b: Bout, f: Fighter, on: boolean): void {
  const can = on && b.t >= f.stunUntil && !f.move;
  if (can && !f.blocking) f.blockSince = b.t;
  f.blocking = can;
}

const ready = (b: Bout, f: Fighter): boolean => f.blocking && b.t - f.blockSince >= SPAR.blockReadyMs;

/** MMA: cambiar de fase. Al volver de pie se separan a la distancia dada; al agarrarse, a la del clinch. */
function setPhase(b: Bout, phase: Phase, top: 'p' | 'o' | null, gap: number = SPAR.clinchGap): void {
  b.grip = { phase, top, since: b.t, pins: 0 };
  const mid = Math.min(SPAR.bounds[1] - gap / 2, Math.max(SPAR.bounds[0] + gap / 2, (b.p.x + b.o.x) / 2));
  b.p.x = mid - gap / 2;
  b.o.x = mid + gap / 2;
  for (const f of [b.p, b.o]) {
    f.pull = 0;
    f.blocking = false;
  }
}

/** El contacto de un intento de lucha (MMA): sale, se defiende o no llega. Cada respuesta dice por qué. */
function grappleContact(b: Bout, a: Fighter, d: Fighter, who: 'p' | 'o', m: NonNullable<Fighter['move']>, events: BoutEvent[]): void {
  const def = MOVES[m.id];
  const mine = who === 'p';
  const say = (kind: BoutEvent['kind'], me: string, them: string): void => { events.push({ who, kind, text: mine ? me : them }); };
  // La fase cambió mientras se preparaba (el otro se soltó, escapó o derribó antes): el intento se queda en nada.
  if (grappleFor(b, who) !== m.id) return say('miss', `${def.label}: la posición ya ha cambiado.`, `Su ${def.label.toLowerCase()} se queda en nada.`);
  const fail = (me: string, them: string): void => {
    a.balance = Math.max(0, a.balance - SPAR.balanceCost);
    d.blocks++;
    a.tech.grappling++;
    say('blocked', me, them);
  };
  if (m.id === 'clinch') {
    if (distanceOf(b) > def.reach[1]) return say('miss', 'Entrada al clinch: fuera de alcance, no hay agarre a distancia.', 'Su entrada al clinch no te alcanza.');
    if (ready(b, d)) {
      a.stunUntil = b.t + 250;
      return fail('Entrada al clinch: te la frena con la guardia arriba.', 'Frenas su entrada al clinch con la guardia.');
    }
    a.tech.grappling++;
    a.landed++;
    setPhase(b, 'clinch', null);
    return say('hit', 'Entras al clinch. Ahora: derribo (G o J/K), base (L) o soltarte (atrás).', 'Te mete en el clinch: base (L) contra su derribo, o atrás para soltarte.');
  }
  if (m.id === 'takedown') {
    if (ready(b, d)) return fail('Derribo: tiene la base puesta (guardia a tiempo). Pierdes equilibrio.', 'Defiendes el derribo con la base. Pierde equilibrio.');
    a.score += def.points;
    a.landed++;
    a.tech.grappling++;
    d.taken++;
    d.stunUntil = b.t + 300;
    d.move = null;
    setPhase(b, 'ground', who);
    return say('hit', `¡Derribo controlado! +${def.points}. Arriba: fija (G) para controlar.`, `Te derriba. +${def.points} para el rival. Abajo: escapa (G) cuando no fije.`);
  }
  if (m.id === 'pin') {
    if (ready(b, d)) return fail('Fijación: enmarca con los brazos y se te escurre.', 'Enmarcas con los brazos: su fijación no entra.');
    a.score += def.points;
    a.landed++;
    a.tech.grappling++;
    d.taken++;
    b.grip.pins++;
    if (b.grip.pins < SPAR.pinsToControl) return say('hit', `Fijación ${b.grip.pins} de ${SPAR.pinsToControl}. +${def.points}`, `Te fija (${b.grip.pins} de ${SPAR.pinsToControl}). Escapa antes del control.`);
    setPhase(b, 'stand', null, 1.4);
    return say('hit', 'Control completo. El instructor os levanta: de pie otra vez.', 'Te controla del todo. El instructor os levanta.');
  }
  // Escape: lo para quien está arriba con la guardia a tiempo o en pleno sostén de una fijación.
  const pinning = d.move?.id === 'pin' && movePhase(d, b.t, b.style) === 'hold';
  if (ready(b, d) || pinning) return fail(`Escape: ${pinning ? 'te tiene fijado' : 'te controla la cadera'}. Espera a que suelte y vuelve a intentarlo.`, `Controlas su escape${pinning ? ' con la fijación' : ''}.`);
  a.score += def.points;
  a.landed++;
  a.tech.grappling++;
  setPhase(b, 'stand', null, 1.4);
  return say('hit', `¡Escapas y te pones de pie! +${def.points}`, `Se te escapa y se levanta. +${def.points} para el rival.`);
}

/** El contacto de un golpe, una vez: puntúa, se para o no llega. */
function contact(b: Bout, a: Fighter, d: Fighter, who: 'p' | 'o', events: BoutEvent[]): void {
  const m = a.move;
  if (!m || m.resolved) return;
  const def = spec(b, m);
  if (b.t < m.start + def.windupMs) return;
  m.resolved = true;
  if (GRAPPLE.has(m.id)) return grappleContact(b, a, d, who, m, events);
  const dist = distanceOf(b);
  const name = `${def.label}${b.style !== 'boxing' && (KICK.has(m.id) || b.style === 'taekwondo') ? (m.side === 'L' ? ' izquierda' : ' derecha') : ''}`;
  const mine = who === 'p';
  // Un golpe que ya no puede salir (os habéis agarrado mientras se preparaba) no cuenta.
  if (b.grip.phase !== 'stand') {
    events.push({ who, kind: 'miss', text: mine ? `${name}: agarrados, no sale.` : `Su ${name.toLowerCase()} se queda en nada.` });
    return;
  }
  if (dist > def.reach[1] || dist < def.reach[0]) {
    events.push({ who, kind: 'miss', text: mine ? `${name}: ${dist > def.reach[1] ? 'no llega' : 'demasiado encima'}.` : `Su ${name.toLowerCase()} no te llega.` });
    return;
  }
  a.tech[techOf(m.id)]++;
  if (ready(b, d)) {
    d.blocks++;
    events.push({ who, kind: 'blocked', text: mine ? `${name}: te la para.` : `Paras su ${name.toLowerCase()}.` });
    return;
  }
  a.score += def.points;
  a.landed++;
  d.taken++;
  d.stunUntil = b.t + SPAR.stunMs;
  d.move = null;
  d.blocking = false;
  d.x = Math.min(SPAR.bounds[1], Math.max(SPAR.bounds[0], d.x + a.dir * SPAR.knockback));
  events.push({ who, kind: 'hit', text: mine ? `¡${name}! +${def.points}` : `Te entra su ${name.toLowerCase()}. +${def.points} para el rival.` });
}

/** El rival: busca su distancia, ataca a su ritmo y para o se aparta lo que ve venir, según su nivel. */
function rival(b: Bout): { move: -1 | 0 | 1; block: boolean } {
  const { o, p, ai } = b;
  // Cansado reacciona más tarde, para menos y ataca menos.
  const level = Math.max(0, b.level - ai.tired);
  const dist = distanceOf(b);
  const stand = b.grip.phase === 'stand';
  // Lo que ve venir: tras su reacción, para (más cuanto mejor es) o se aparta.
  if (p.move && !p.move.resolved && ai.reactAt < 0) {
    ai.reactAt = p.move.start + (380 - 220 * level);
    const r = random(b);
    ai.react = r < 0.25 + 0.55 * level ? 'block' : r < 0.45 + 0.4 * level ? 'back' : null;
  }
  if ((!p.move || p.move.resolved) && ai.reactAt >= 0 && b.t > ai.reactAt + 200) {
    ai.reactAt = -1;
    ai.react = null;
  }
  if (ai.reactAt >= 0 && b.t >= ai.reactAt && !o.move) {
    if (ai.react === 'block') return { move: 0, block: true };
    // Agarrados no se puede dar un paso atrás: se pone la base.
    if (ai.react === 'back') return stand ? { move: -1, block: false } : { move: 0, block: true };
  }
  // Atacar, si toca y está a su alcance. Agarrados, sólo la acción de lucha de la fase, y con equilibrio.
  const pool = b.drill ? DRILL_MOVES[b.drill] : STYLE_MOVES[b.style];
  const grab = grappleFor(b, 'o');
  const usable = stand
    ? pool.filter((id) => (!GRAPPLE.has(id) || id === 'clinch') && dist >= MOVES[id].reach[0] && dist <= MOVES[id].reach[1])
    : pool.includes(grab) && (grab === 'pin' || o.balance >= SPAR.balanceMin) ? [grab] : [];
  if (b.t >= ai.next && usable.length && !busyIn(b, o)) {
    const id = usable[Math.floor(random(b) * usable.length)];
    const side: Side = random(b) < 0.5 ? 'L' : 'R';
    attack(b, o, id, side);
    ai.tired = Math.min(0.3, ai.tired + specOf(b.style, id, side).energy * 0.03);
    ai.next = b.t + (1_500 - 700 * level) * (0.7 + 0.6 * random(b));
    return { move: 0, block: false };
  }
  if (!stand) return { move: 0, block: false };
  // Su distancia: la de su mejor golpe (el que más vale), sin pegarse ni irse; en lucha, la del agarre.
  const strikes = pool.filter((id) => !GRAPPLE.has(id));
  // En el ejercicio completo alterna tramos de golpeo y de lucha (seis segundos cada uno): se le ve venir a agarrar.
  const grappling = pool.includes('clinch') && (!strikes.length || Math.floor(b.t / 6_000) % 2 === 1);
  const best = grappling ? 'clinch' : strikes.reduce((a, id) => (MOVES[id].points > MOVES[a].points ? id : a));
  const want = (MOVES[best].reach[0] + MOVES[best].reach[1]) / 2;
  return { move: dist > want + 0.3 ? 1 : dist < want - 0.3 ? -1 : 0, block: false };
}

/** Avanza el combate `dt` ms (como mucho 50: tras una pausa no salta) con lo que hace el jugador. */
export function stepBout(b: Bout, dt0: number, input: BoutInput): BoutEvent[] {
  const events: BoutEvent[] = [];
  if (b.ended) return events;
  const dt = Math.max(0, Math.min(50, dt0));
  b.t += dt;
  if (b.t < b.breakUntil) return events;
  // Jugador. En MMA el puño lo decide la mano y, agarrados, J/K hacen la acción de lucha de la fase.
  setBlock(b, b.p, input.block);
  let want = input.attack ?? null;
  if (want && b.style === 'mma') {
    if (b.grip.phase !== 'stand') want = { id: grappleFor(b, 'p'), side: want.side };
    else if (want.id === 'jab' || want.id === 'cross') want = { id: want.side === 'L' ? 'jab' : 'cross', side: want.side };
  }
  if (input.grab && b.style === 'mma') want = { id: grappleFor(b, 'p'), side: 'R' };
  if (want) {
    const why = attack(b, b.p, want.id, want.side, input.energy);
    if (why) events.push({ who: 'p', kind: 'info', text: why });
  }
  step(b, b.p, b.o, b.p.blocking ? 0 : input.move, dt);
  // Soltarse del clinch: atrás mantenido un momento (no a la vez que un intento).
  if (b.grip.phase === 'clinch') {
    b.p.pull = input.move === -1 && !b.p.move ? b.p.pull + dt : 0;
    if (b.p.pull >= SPAR.releaseMs) {
      setPhase(b, 'stand', null, 1.2);
      events.push({ who: 'p', kind: 'info', text: 'Te sueltas del clinch y recuperas la distancia.' });
    }
  }
  for (const f of [b.p, b.o]) f.balance = Math.min(1, f.balance + SPAR.balanceRegen * (dt / 1000));
  // Rival.
  const r = rival(b);
  setBlock(b, b.o, r.block);
  step(b, b.o, b.p, r.move, dt);
  // Contactos (primero el jugador: si encaja, el del rival se corta).
  contact(b, b.p, b.o, 'p', events);
  contact(b, b.o, b.p, 'o', events);
  for (const f of [b.p, b.o]) if (f.move && b.t >= f.move.start + moveTotal(f.move.id, spec(b, f.move))) f.move = null;
  // Suelo sin progreso: el instructor os levanta (nadie se queda bloqueado abajo).
  if (b.grip.phase === 'ground' && b.t - b.grip.since >= SPAR.groundStallMs) {
    setPhase(b, 'stand', null, 1.4);
    events.push({ who: 'p', kind: 'info', text: 'Sin progreso en el suelo: el instructor os levanta.' });
  }
  // Punto de oro: el primero que puntúa gana.
  if (b.golden && b.p.score !== b.o.score) return finish(b, b.p.score > b.o.score, 'punto de oro', events);
  if (b.t < b.roundEnd) return events;
  if (!b.golden && b.round < SPAR.rounds) {
    b.round++;
    b.breakUntil = b.t + SPAR.breakMs;
    b.roundEnd = b.breakUntil + SPAR.roundMs;
    reset(b);
    events.push({ who: 'p', kind: 'round', text: `Fin del asalto ${b.round - 1}: ${b.p.score}–${b.o.score}. Descanso.` });
    return events;
  }
  if (b.p.score !== b.o.score) return finish(b, b.p.score > b.o.score, 'puntos', events);
  if (!b.golden) {
    b.golden = true;
    b.breakUntil = b.t + SPAR.breakMs;
    b.roundEnd = b.breakUntil + SPAR.goldenMs;
    reset(b);
    events.push({ who: 'p', kind: 'round', text: `Empate ${b.p.score}–${b.o.score}: punto de oro.` });
    return events;
  }
  // Decisión: más golpes limpios; luego menos encajados; luego más paradas. Si todo es igual, el rival (en casa).
  const { p, o } = b;
  const won = p.landed !== o.landed ? p.landed > o.landed : p.taken !== o.taken ? p.taken < o.taken : p.blocks > o.blocks;
  return finish(b, won, 'decisión', events);
}

function reset(b: Bout): void {
  b.p.x = 0;
  b.o.x = SPAR.start;
  b.grip = { phase: 'stand', top: null, since: b.t, pins: 0 };
  for (const f of [b.p, b.o]) {
    f.move = null;
    f.blocking = false;
    f.stunUntil = 0;
    f.pull = 0;
    f.balance = 1;
  }
  b.ai.reactAt = -1;
  b.ai.next = b.breakUntil + 1_200;
  // El descanso: recupera buena parte, no todo.
  b.ai.tired *= 0.4;
}

function finish(b: Bout, won: boolean, how: Bout['how'], events: BoutEvent[]): BoutEvent[] {
  b.ended = true;
  b.won = won;
  b.how = how;
  events.push({ who: 'p', kind: 'end', text: `${won ? 'Ganas' : 'Pierdes'} ${b.p.score}–${b.o.score} (${how}).` });
  return events;
}
