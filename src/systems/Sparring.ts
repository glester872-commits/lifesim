// Sin Phaser: lo usan scenes/WorldScene (el combate, frame a frame), ui/SparPanel (lo que se ve) y systems/Tournaments,
// y lo prueba scripts/check-sparring.ts.
import { KICKS } from './Taekwondo.ts';

/**
 * Combate de academia (taekwondo o boxeo) contra un rival: dos personas en una línea, a una distancia que cada una
 * ajusta. Cada golpe tiene su preparación (se ve venir), su instante de contacto y su vuelta; puntúa sólo si en el
 * contacto el rival está a su alcance y no tiene la guardia arriba a tiempo. Un golpe limpio aturde un momento, empuja y
 * corta lo que el rival estuviera preparando. Gana quien más puntúa en dos asaltos; empate, punto de oro y, si tampoco,
 * decisión (golpes limpios, luego menos encajados, luego más paradas).
 *
 * Sin sangre ni derribos: es la academia. El rival decide con su nivel (0–1) y su semilla: siempre igual con lo mismo.
 */

export type Style = 'taekwondo' | 'boxing';
export type MoveId = 'front' | 'round' | 'side' | 'jab' | 'cross' | 'hook';
export type Side = 'L' | 'R';

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
};

export const STYLE_MOVES: Readonly<Record<Style, readonly MoveId[]>> = { taekwondo: ['front', 'round', 'side'], boxing: ['jab', 'cross', 'hook'] };

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
}

export interface Bout {
  style: Style;
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
}

export interface BoutEvent {
  who: 'p' | 'o';
  kind: 'hit' | 'blocked' | 'miss' | 'round' | 'end';
  text: string;
}

const fighter = (x: number, dir: 1 | -1): Fighter => ({ x, dir, move: null, blocking: false, blockSince: 0, stunUntil: 0, score: 0, landed: 0, taken: 0, blocks: 0, energy: 0 });

export function createBout(style: Style, level: number, seed: number): Bout {
  return {
    style, t: 0, round: 1, roundEnd: SPAR.roundMs, breakUntil: 0, golden: false, level: Math.min(1, Math.max(0, level)), rng: (seed >>> 0) || 1,
    p: fighter(0, 1), o: fighter(SPAR.start, -1), ai: { next: 1_500, reactAt: -1, react: null, tired: 0 }, ended: false, won: null, how: null,
  };
}

const random = (b: Bout): number => {
  b.rng = (Math.imul(b.rng, 1664525) + 1013904223) >>> 0;
  return b.rng / 2 ** 32;
};

export const distanceOf = (b: Bout): number => Math.abs(b.o.x - b.p.x);
export const moveTotal = (id: MoveId): number => MOVES[id].windupMs + MOVES[id].holdMs + MOVES[id].recoverMs;
export type MovePhase = 'windup' | 'hold' | 'recover';
export function movePhase(f: Fighter, t: number): MovePhase | null {
  if (!f.move) return null;
  const d = MOVES[f.move.id];
  const ms = t - f.move.start;
  if (ms < d.windupMs) return 'windup';
  if (ms < d.windupMs + d.holdMs) return 'hold';
  if (ms < moveTotal(f.move.id)) return 'recover';
  return null;
}

const busy = (f: Fighter, t: number): boolean => t < f.stunUntil || (f.move !== null && t < f.move.start + moveTotal(f.move.id));

/** Empezar un golpe: no con otro a medias, ni aturdido, ni con la guardia arriba. */
function attack(b: Bout, f: Fighter, id: MoveId, side: Side): boolean {
  if (busy(f, b.t) || f.blocking || !STYLE_MOVES[b.style].includes(id)) return false;
  f.move = { id, side, start: b.t, resolved: false };
  f.energy += MOVES[id].energy;
  return true;
}

/** Moverse en la línea, sin atravesar al otro ni salir del tatami (o del ring). */
function step(b: Bout, f: Fighter, other: Fighter, toward: -1 | 0 | 1, dt: number): void {
  if (!toward || busy(f, b.t)) return;
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

/** El contacto de un golpe, una vez: puntúa, se para o no llega. */
function contact(b: Bout, a: Fighter, d: Fighter, who: 'p' | 'o', events: BoutEvent[]): void {
  const m = a.move;
  if (!m || m.resolved || b.t < m.start + MOVES[m.id].windupMs) return;
  m.resolved = true;
  const def = MOVES[m.id];
  const dist = distanceOf(b);
  const name = `${def.label}${b.style === 'taekwondo' ? (m.side === 'L' ? ' izquierda' : ' derecha') : ''}`;
  const mine = who === 'p';
  if (dist > def.reach[1] || dist < def.reach[0]) {
    events.push({ who, kind: 'miss', text: mine ? `${name}: ${dist > def.reach[1] ? 'no llega' : 'demasiado encima'}.` : `Su ${name.toLowerCase()} no te llega.` });
    return;
  }
  if (d.blocking && b.t - d.blockSince >= SPAR.blockReadyMs) {
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
    if (ai.react === 'back') return { move: -1, block: false };
  }
  // Atacar, si toca y está a su alcance.
  const usable = STYLE_MOVES[b.style].filter((id) => dist >= MOVES[id].reach[0] && dist <= MOVES[id].reach[1]);
  if (b.t >= ai.next && usable.length && !busy(o, b.t)) {
    const id = usable[Math.floor(random(b) * usable.length)];
    attack(b, o, id, random(b) < 0.5 ? 'L' : 'R');
    ai.tired = Math.min(0.3, ai.tired + MOVES[id].energy * 0.03);
    ai.next = b.t + (1_500 - 700 * level) * (0.7 + 0.6 * random(b));
    return { move: 0, block: false };
  }
  // Su distancia: la de su mejor golpe (el que más vale), sin pegarse ni irse.
  const best = STYLE_MOVES[b.style].reduce((a, id) => (MOVES[id].points > MOVES[a].points ? id : a));
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
  // Jugador.
  setBlock(b, b.p, input.block);
  if (input.attack) attack(b, b.p, input.attack.id, input.attack.side);
  step(b, b.p, b.o, b.p.blocking ? 0 : input.move, dt);
  // Rival.
  const r = rival(b);
  setBlock(b, b.o, r.block);
  step(b, b.o, b.p, r.move, dt);
  // Contactos (primero el jugador: si encaja, el del rival se corta).
  contact(b, b.p, b.o, 'p', events);
  contact(b, b.o, b.p, 'o', events);
  for (const f of [b.p, b.o]) if (f.move && b.t >= f.move.start + moveTotal(f.move.id)) f.move = null;
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
  for (const f of [b.p, b.o]) {
    f.move = null;
    f.blocking = false;
    f.stunUntil = 0;
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
