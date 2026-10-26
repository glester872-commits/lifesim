// Sin Phaser: lo usan world/MatchView (lo que se ve), WorldScene (avanzar hasta el próximo momento) y
// scripts/check-match-play.ts. Puro: el partido sale del calendario (systems/Match) y de la hora, nada más.
import { AMBIENT_PASS, FORMATION, GOAL_CHANCE, HALVES, HOME_SHARE, JITTER, LIVE_END, MOMENT_MINUTES, MOMENTS, PATTERNS, SLOTS, type Pattern } from '../data/matchPlay.ts';
import { matchOn, type Match } from './Match.ts';
import { hashSeed, seededRng, type Rng } from './MetroDaily.ts';

/**
 * El partido del Estadio del Halcón minuto a minuto, el mismo para todos: se mire, se llegue tarde, se duerma, se vaya
 * en metro o no se pise el Arena. De cada partido del calendario (systems/Match.matchOn: día, saque y rival) sale, por
 * semilla, su lista de momentos (ocasiones y goles, cada uno con su jugada de data/matchPlay.ts) y, de ahí, el
 * marcador a cualquier hora: un gol cuenta desde su minuto exacto, ni antes ni después, y nada se decide al mirar.
 *
 * Los tiempos van en minutos de reloj del mundo: `abs` es el minuto absoluto (día 1 a las 00:00 = 0, con fracción) y
 * `t`, los minutos desde el saque. Un partido que cruce la medianoche no cambia nada: todo es `abs`.
 */

export type Side = 'home' | 'away';
export type MatchStage = 'pre' | 'first' | 'half' | 'second' | 'full';

export interface Moment {
  /** Minutos desde el saque del instante decisivo (el gol, la parada): la hora del suceso. */
  at: number;
  start: number;
  end: number;
  side: Side;
  pattern: Pattern;
  goal: boolean;
  /** El minuto de fútbol, como en el marcador: 34', 45+1, 90+2. */
  minute: string;
}

export interface Timeline {
  match: Match;
  /** Minuto absoluto del saque. */
  kickoff: number;
  moments: readonly Moment[];
  final: readonly [number, number];
}

const DAY = 1440;
/** Un suceso cuenta desde su minuto exacto: el margen sólo absorbe el redondeo de sumar y restar el saque. */
const EPS = 1e-9;
export const absOf = (c: { day: number; hour: number; minute: number }, carry = 0): number => (c.day - 1) * DAY + c.hour * 60 + c.minute + carry;

/** El minuto de fútbol de un instante (minutos desde el saque), o null fuera de juego (antes, descanso, después). */
export function footballMinute(t: number): string | null {
  for (const h of [HALVES.first, HALVES.second]) {
    if (t < h.from || t >= h.to) continue;
    const m = h.base + Math.floor(t - h.from) + 1;
    return m > h.regulation ? `${h.regulation}+${m - h.regulation}` : `${m}'`;
  }
  return null;
}

export function stageAt(t: number): MatchStage {
  if (t < HALVES.first.from) return 'pre';
  if (t < HALVES.first.to) return 'first';
  if (t < HALVES.second.from) return 'half';
  if (t < HALVES.second.to) return 'second';
  return 'full';
}

function pick(rng: Rng, from: readonly Pattern[]): Pattern {
  let r = rng() * from.reduce((s, p) => s + p.weight, 0);
  for (const p of from) if ((r -= p.weight) < 0) return p;
  return from[from.length - 1];
}

const cache = new Map<string, Timeline>();

/** Los momentos de un partido: misma semilla (día, saque y rival), mismos momentos, siempre. */
export function timelineOf(match: Match): Timeline {
  const key = `${match.day}:${match.kickoff}:${match.rival}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = seededRng(hashSeed('arena-timeline', match.day, match.kickoff, match.rival));
  const count = MOMENTS[0] + Math.floor(rng() * (MOMENTS[1] - MOMENTS[0] + 1));
  const slots = [...SLOTS].map((s) => ({ s, r: rng() })).sort((a, b) => a.r - b.r).slice(0, count).map((x) => x.s).sort((a, b) => a - b);
  const moments: Moment[] = [];
  for (const slot of slots) {
    const side: Side = rng() < HOME_SHARE ? 'home' : 'away';
    const goal = rng() < GOAL_CHANCE;
    const pattern = pick(rng, PATTERNS.filter((p) => p.goal === goal));
    const half = slot < HALVES.first.to ? HALVES.first : HALVES.second;
    let at = slot + (rng() * 2 - 1) * JITTER;
    // Nunca dos a la vez: si el anterior aún no ha acabado, éste espera; y todo dentro de su parte.
    const prev = moments[moments.length - 1];
    if (prev) at = Math.max(at, prev.end + 0.5 + pattern.decisive * MOMENT_MINUTES);
    const start = at - pattern.decisive * MOMENT_MINUTES;
    const end = start + MOMENT_MINUTES;
    if (start < half.from + 1 || end > half.to - 0.5) continue;
    moments.push({ at, start, end, side, pattern, goal, minute: footballMinute(at)! });
  }
  const final: [number, number] = [moments.filter((m) => m.goal && m.side === 'home').length, moments.filter((m) => m.goal && m.side === 'away').length];
  const timeline: Timeline = { match, kickoff: (match.day - 1) * DAY + match.kickoff, moments, final };
  cache.set(key, timeline);
  return timeline;
}

/** El partido que importa a esa hora absoluta: el de hoy o el de anoche, hasta una hora después del final. */
export function fixtureAt(abs: number): Timeline | null {
  const day = Math.floor(abs / DAY) + 1;
  for (const d of [day, day - 1]) {
    const m = matchOn(d);
    if (!m) continue;
    const tl = timelineOf(m);
    if (abs < tl.kickoff + LIVE_END + 60) return tl;
  }
  return null;
}

export interface MatchState {
  stage: MatchStage;
  /** Minutos desde el saque. */
  t: number;
  score: [number, number];
  /** 34', 45+1, «Descanso», «Final», o la hora del saque antes de empezar. */
  clock: string;
  /** El momento en juego ahora, y por dónde va (0–1). */
  moment: Moment | null;
  progress: number;
  /** Lo que ya ha pasado (lo decisivo, antes de ahora), en orden. */
  past: readonly Moment[];
}

const hh = (abs: number): string => `${String(Math.floor((abs % DAY) / 60)).padStart(2, '0')}:${String(Math.floor(abs % 60)).padStart(2, '0')}`;

/** El estado del partido a esa hora absoluta. Lo mismo para quien lo ve y para quien no. */
export function stateAt(tl: Timeline, abs: number): MatchState {
  const t = abs - tl.kickoff;
  const stage = stageAt(t);
  const past = tl.moments.filter((m) => m.at <= t + EPS);
  const score: [number, number] = [past.filter((m) => m.goal && m.side === 'home').length, past.filter((m) => m.goal && m.side === 'away').length];
  const moment = tl.moments.find((m) => t >= m.start && t < m.end) ?? null;
  const clock = stage === 'pre' ? `Saque ${hh(tl.kickoff)}` : stage === 'half' ? 'Descanso' : stage === 'full' ? 'Final' : footballMinute(t)!;
  return { stage, t, score, clock, moment, progress: moment ? (t - moment.start) / MOMENT_MINUTES : 0, past };
}

/** Un salto de reloj mayor que esto (minutos) no es verlo: es pasar el rato (dormir, el metro, avanzar). */
export const WATCHED_STEP = 3;

/**
 * Qué se cuenta al pasar el reloj de `last` a `abs` mirando el campo: lo que se ha visto pasar a ritmo normal
 * (`seen`: cada suceso una vez, en su minuto), lo que se ha perdido en un salto (`missed`: sólo un resumen) o nada.
 * Sin `last` (se acaba de llegar o de cargar) no se cuenta nada: los goles de antes no se celebran como nuevos.
 */
export function announcement(tl: Timeline, last: number | null, abs: number): { kind: 'none' } | { kind: 'seen' | 'missed'; moments: Moment[] } {
  if (last === null || abs <= last) return { kind: 'none' };
  const crossed = tl.moments.filter((m) => m.at > last - tl.kickoff + EPS && m.at <= abs - tl.kickoff + EPS);
  if (!crossed.length) return { kind: 'none' };
  return abs - last <= WATCHED_STEP ? { kind: 'seen', moments: crossed } : { kind: 'missed', moments: crossed };
}

/**
 * «Ver hasta el próximo momento»: a qué minuto absoluto se salta y qué se verá. El saque, cada ocasión (se llega justo
 * antes de que empiece la jugada), el descanso (cuando abre el quiosco: EST-003), la segunda parte y el final; nunca más
 * allá del final. Null si ya ha acabado.
 */
export function nextMoment(tl: Timeline, abs: number): { abs: number; minutes: number; what: string } | null {
  const t = abs - tl.kickoff;
  if (t >= LIVE_END) return null;
  // Se apunta medio minuto antes de cada jugada y se redondea hacia arriba (el reloj salta minutos enteros): se llega
  // como mucho medio minuto después de que empiece, siempre antes de lo decisivo, y en un solo salto.
  // [a dónde se apunta, desde cuándo ya ha pasado, qué es]: una jugada sigue siendo la próxima mientras no haya empezado.
  const marks: [number, number, string][] = [
    [HALVES.first.from, HALVES.first.from, 'el saque'],
    ...tl.moments.map((m): [number, number, string] => [m.start - 0.5, m.start, 'la próxima ocasión']),
    [HALVES.first.to, HALVES.first.to, 'el descanso'],
    [HALVES.second.from, HALVES.second.from, 'la segunda parte'],
    [LIVE_END, LIVE_END, 'el final'],
  ];
  // Con una jugada en marcha, lo próximo es lo de después de ella.
  const now = tl.moments.find((m) => t >= m.start && t < m.end);
  const next = marks.filter(([, gone]) => gone > t + 0.05 && (!now || gone >= now.end)).sort((a, b) => a[0] - b[0])[0];
  if (!next) return null;
  // Nunca más allá del final: si queda menos de un minuto, no hay nada que adelantar.
  const minutes = Math.min(Math.max(1, Math.ceil(next[0] - t)), Math.floor(LIVE_END - t));
  if (minutes < 1) return null;
  return { abs: abs + minutes, minutes, what: next[2] };
}

// ------------------------------------------------------------ el campo: dónde están el balón y los jugadores

export interface Dot {
  x: number;
  y: number;
}

export interface Pitch {
  /** Si hay jugadores en el campo (antes del calentamiento, en el descanso y al acabar, no). */
  show: boolean;
  ball: Dot;
  home: Dot[];
  away: Dot[];
  /** Quien celebra un gol ahora (los suyos corren juntos). */
  celebrate: Side | null;
  /** El portero que se lanza (parada) o null. */
  dive: Side | null;
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => k * k * (3 - 2 * k);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Hacia dónde ataca cada equipo: el local, a la derecha en la primera parte y a la izquierda en la segunda. */
export const attacksRight = (side: Side, t: number): boolean => (side === 'home') === (t < HALVES.second.from);
/** Del campo de un equipo (x 0 = su portería) al campo absoluto (x 0 = la portería de la izquierda). */
const toField = (side: Side, t: number, p: Dot): Dot => (attacksRight(side, t) ? { ...p } : { x: 1 - p.x, y: p.y });

/** El balón en una jugada a la fracción u, en el campo de quien ataca. */
function beatAt(p: Pattern, u: number): Dot {
  const b = p.beats;
  for (let i = 1; i < b.length; i++) {
    if (u > b[i].u) continue;
    const k = ease(clamp((u - b[i - 1].u) / Math.max(1e-6, b[i].u - b[i - 1].u), 0, 1));
    return { x: lerp(b[i - 1].x, b[i].x, k), y: lerp(b[i - 1].y, b[i].y, k) };
  }
  return { x: b[b.length - 1].x, y: b[b.length - 1].y };
}

/** Dónde se pone el portero según el balón (en el campo de su equipo). */
const keeperY = (ballY: number): number => clamp(lerp(0.5, ballY, 0.35), 0.38, 0.62);

/** Un equipo en su formación, que se desplaza con el balón (en el campo de ese equipo). Igual tenga o no el balón: no salta al perderlo. */
function block(ballX: number, ballY: number, sway: number): Dot[] {
  const push = (ballX - 0.5) * 0.5;
  return FORMATION.map(([x, y], i) => i === 0
    ? { x, y: keeperY(ballY) }
    : { x: clamp(x + push + Math.sin(sway + i * 1.7) * 0.015, 0.06, 0.97), y: clamp(lerp(y, ballY, 0.18) + Math.cos(sway * 0.8 + i) * 0.02, 0.04, 0.96) });
}

/**
 * Jugadores según el balón: cada equipo en su bloque y, de los dos, quien está cerca va a por él (cuanto más cerca,
 * más pegado; cada uno por su lado). Sólo depende de dónde está el balón, no de quién lo tiene: nadie salta al cambiar
 * la posesión ni aparece de golpe junto a él.
 */
function arrange(t: number, ball: Dot): { home: Dot[]; away: Dot[] } {
  const sway = t * 1.3;
  const field = (side: Side): Dot[] => {
    const own = attacksRight(side, t) ? ball : { x: 1 - ball.x, y: ball.y };
    const team = block(own.x, own.y, sway + (side === 'home' ? 0 : 2)).map((p) => toField(side, t, p));
    const foot = { x: ball.x + (attacksRight(side, t) ? -0.014 : 0.014), y: ball.y + (side === 'home' ? 0.04 : -0.03) };
    for (let i = 1; i < team.length; i++) {
      const w = clamp(1 - Math.hypot(team[i].x - ball.x, team[i].y - ball.y) / 0.15, 0, 1);
      team[i] = { x: lerp(team[i].x, foot.x, w), y: lerp(team[i].y, foot.y, w) };
    }
    return team;
  };
  return { home: field('home'), away: field('away') };
}

/** El juego normal entre momentos: pases de un equipo, a veces un robo; no decide nada del partido. */
function ambient(tl: Timeline, t: number, from: number, start: Dot, until: number, into: { at: Dot; owner: Side } | null): { ball: Dot; owner: Side } {
  // Antes de una jugada, el hueco se reparte en pases iguales y el último deja el balón donde empieza, justo a tiempo.
  const passes = into ? Math.max(1, Math.round((until - from) / AMBIENT_PASS)) : Infinity;
  const pass = into ? (until - from) / passes : AMBIENT_PASS;
  const k = Math.floor((t - from) / pass);
  const target = (i: number): { at: Dot; owner: Side } => {
    if (i < 0) return { at: start, owner: 'home' };
    if (into && i >= passes - 1) return into;
    const r = seededRng(hashSeed('arena-ambient', tl.match.day, Math.floor(from * 10), i));
    const owner: Side = seededRng(hashSeed('arena-possession', tl.match.day, Math.floor(from * 10), Math.floor(i / 3)))() < 0.5 ? 'home' : 'away';
    const slot = FORMATION[1 + Math.floor(r() * (FORMATION.length - 1))];
    const own = { x: clamp(slot[0] + (r() - 0.5) * 0.2, 0.15, 0.85), y: clamp(slot[1] + (r() - 0.5) * 0.2, 0.08, 0.92) };
    return { at: toField(owner, t, own), owner };
  };
  const a = target(k - 1);
  const b = target(k);
  const u = ease(clamp((t - from - k * pass) / pass, 0, 1));
  return { ball: { x: lerp(a.at.x, b.at.x, u), y: lerp(a.at.y, b.at.y, u) }, owner: b.owner };
}

const CENTRE: Dot = { x: 0.5, y: 0.5 };

/** El campo a esa hora (minutos desde el saque). Mismo t, misma imagen: no guarda nada entre llamadas. */
export function pitchAt(tl: Timeline, t: number): Pitch {
  const empty: Pitch = { show: false, ball: CENTRE, home: [], away: [], celebrate: null, dive: null };
  const stage = stageAt(t);
  if (stage === 'half' || stage === 'full' || t < -20) return empty;
  if (stage === 'pre') {
    // El calentamiento: cada equipo en su campo, moviéndose un poco; el balón, en el centro.
    // Cuanto más cerca del saque, más quietos en su sitio: a la hora en punto ya están donde empieza el partido.
    const { home, away } = arrange(0, CENTRE);
    const loose = clamp(-t / 10, 0, 1);
    const jog = (p: Dot, i: number): Dot => ({ x: lerp(p.x, clamp((p.x - 0.5) * 0.8 + 0.5 + Math.sin(t * 0.9 + i) * 0.02, 0.05, 0.95), loose), y: lerp(p.y, p.y + Math.cos(t * 0.7 + i) * 0.03, loose) });
    return { ...empty, show: true, home: home.map(jog), away: away.map(jog), ball: CENTRE };
  }
  const half = stage === 'first' ? HALVES.first : HALVES.second;
  const moments = tl.moments.filter((m) => m.start >= half.from && m.end <= half.to);
  const now = moments.find((m) => t >= m.start && t < m.end);
  if (now) {
    const u = (t - now.start) / MOMENT_MINUTES;
    const ball = toField(now.side, t, beatAt(now.pattern, u));
    const after = u >= now.pattern.decisive;
    const placed = arrange(t, { x: clamp(ball.x, 0, 1), y: ball.y });
    const defending: Side = now.side === 'home' ? 'away' : 'home';
    const keeperGoal = toField(defending, t, { x: 0.03, y: 0.5 });
    const saveBeat = now.pattern.beats.find((b) => b.say === 'save');
    // La estirada: el portero va hacia el balón al acercarse la parada y vuelve a su sitio después, sin saltos.
    const reach = saveBeat ? clamp(1 - Math.abs(u - saveBeat.u) / 0.12, 0, 1) : 0;
    const keepers = defending === 'home' ? placed.home : placed.away;
    keepers[0] = { x: lerp(keeperGoal.x, lerp(keeperGoal.x, clamp(ball.x, 0, 1), 0.8), reach), y: lerp(keepers[0].y, ball.y, reach) };
    if (now.goal && after) {
      // Celebración: los que atacaban corren juntos hacia el córner y vuelven a su sitio para sacar del centro.
      const team = now.side === 'home' ? placed.home : placed.away;
      const corner = toField(now.side, t, { x: 0.88, y: 0.08 });
      const k = ease(clamp((u - now.pattern.decisive) / 0.12, 0, 1)) * (1 - ease(clamp((u - 0.86) / 0.14, 0, 1)));
      for (let i = 2; i < team.length; i++) team[i] = { x: lerp(team[i].x, corner.x + Math.sin(t * 6 + i) * 0.02, k), y: lerp(team[i].y, corner.y + 0.05 + (i % 3) * 0.04, k) };
    }
    return { show: true, ball, home: placed.home, away: placed.away, celebrate: now.goal && after && u < 0.86 ? now.side : null, dive: reach > 0.5 ? defending : null };
  }
  // Entre jugadas: desde el saque de la parte o desde donde acabó la anterior (al centro tras un gol).
  const before = [...moments].reverse().find((m) => m.end <= t);
  const next = moments.find((m) => m.start > t) ?? null;
  const from = before ? before.end : half.from;
  const start = before ? toField(before.side, before.end - 1e-3, beatAt(before.pattern, 1)) : CENTRE;
  const into = next ? { at: toField(next.side, next.start, beatAt(next.pattern, 0)), owner: next.side } : null;
  const { ball } = ambient(tl, t, from, start, next ? next.start : half.to, into);
  const placed = arrange(t, ball);
  return { show: true, ball, home: placed.home, away: placed.away, celebrate: null, dive: null };
}
