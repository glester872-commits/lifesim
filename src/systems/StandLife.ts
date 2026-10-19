// Sin Phaser: lo usan world/CrowdView (cómo reacciona cada espectador), world/StandView (la decoración de los fondos),
// WorldScene (los avisos, el sonido y el descanso) y scripts/check-stand-life.ts. Puro: todo sale del partido
// (systems/MatchPlay) y de la hora; nada se guarda, así que recargar, salir y volver o mirar dos veces no repite nada.
import { HALVES, LIVE_END } from '../data/matchPlay.ts';
import { AWAY_SHARE, CHANT, CHANTS_AWAY, CHANTS_GOAL, CHANTS_HOME, REACTION } from '../data/standLife.ts';
import { stageAt, WATCHED_STEP, type Side, type Timeline } from './MatchPlay.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import type { Pose } from '../world/HumanArt';

/**
 * El humor de la grada a cada minuto del partido: en calma, apretando en una ocasión, celebrando o lamentando un gol,
 * un «uy» tras una ocasión fallada y la respuesta al resultado al pitido final. Cada humor lleva un `id` estable
 * (el partido y el momento): es lo mismo consultarlo una vez que mil, y quien llega tarde ve el humor de ahora, no
 * los de antes.
 *
 *   attack   un equipo lleva el balón hacia la portería (del arranque de la jugada a lo decisivo)
 *   goal     tras un gol, `REACTION.goal` minutos, de más a menos
 *   miss     tras una ocasión sin gol, `REACTION.miss` minutos
 *   final    tras el pitido final, `REACTION.final` minutos; `side` es quien ha ganado (null, empate)
 *   calm     balón en juego sin nada especial, o antes del saque con las puertas abiertas
 *   break    el descanso, y tras la respuesta al final mientras la gente se va
 */
export type MoodKind = 'off' | 'calm' | 'break' | 'attack' | 'goal' | 'miss' | 'final';

export interface StandMood {
  kind: MoodKind;
  /** Quien ataca, marca o gana; null si no va con nadie (calma, empate). */
  side: Side | null;
  /** 0–1: lo fuerte que va (sube en la ocasión, baja tras el gol). */
  strength: number;
  /** Minutos de juego desde que empezó. */
  since: number;
  id: string;
}

/** A quién anima cada espectador: los de la camiseta, casi todos al Halcón; algunos, al rival; los demás, a nadie. */
export type Supporter = 'home' | 'away' | 'neutral';

const roll01 = (...parts: (string | number)[]): number => (hashSeed(...parts) % 1000) / 1000;

export function supporterOf(id: number, fan: boolean): Supporter {
  if (!fan) return 'neutral';
  return roll01('away-fan', id) < AWAY_SHARE ? 'away' : 'home';
}

const keyOf = (tl: Timeline): string => `${tl.match.day}:${tl.match.kickoff}`;

/** El humor de la grada `t` minutos después del saque. */
export function standMood(tl: Timeline, t: number): StandMood {
  const key = keyOf(tl);
  if (t < -90 || t > LIVE_END + 60) return { kind: 'off', side: null, strength: 0, since: 0, id: `${key}:off` };
  const stage = stageAt(t);
  if (stage === 'pre') return { kind: 'calm', side: null, strength: 0.3, since: t + 90, id: `${key}:pre` };
  if (stage === 'half') return { kind: 'break', side: null, strength: 0, since: t - HALVES.first.to, id: `${key}:half` };
  if (stage === 'full') {
    const d = t - LIVE_END;
    if (d >= REACTION.final) return { kind: 'break', side: null, strength: 0, since: d - REACTION.final, id: `${key}:after` };
    const [h, a] = tl.final;
    return { kind: 'final', side: h > a ? 'home' : a > h ? 'away' : null, strength: 1 - d / REACTION.final, since: d, id: `${key}:final` };
  }
  let reaction: StandMood | null = null;
  for (let i = tl.moments.length - 1; i >= 0; i--) {
    const m = tl.moments[i];
    const d = t - m.at;
    const len = m.goal ? REACTION.goal : REACTION.miss;
    if (d < 0 || d >= len) continue;
    reaction = { kind: m.goal ? 'goal' : 'miss', side: m.side, strength: 1 - d / len, since: d, id: `${key}:m${i}` };
    break;
  }
  const i = tl.moments.findIndex((m) => t >= m.start && t < m.at);
  const attack: StandMood | null = i < 0 ? null : (() => {
    const m = tl.moments[i];
    return { kind: 'attack', side: m.side, strength: (t - m.start) / (m.at - m.start), since: t - m.start, id: `${key}:a${i}` };
  })();
  // Una ocasión nueva corta lo que quedaba de la celebración (ya a menos): la grada mira otra vez al balón.
  if (reaction && attack) return reaction.since > 4 ? attack : reaction;
  return reaction ?? attack ?? { kind: 'calm', side: null, strength: 0.2, since: 0, id: `${key}:calm${stage}` };
}

// ------------------------------------------------------------ cánticos

export interface Chant {
  id: string;
  start: number;
  by: 'home' | 'away';
  line: string;
}

const chantCache = new Map<string, readonly Chant[]>();

/**
 * Los cánticos del partido, por semilla: uno al salir los equipos, uno cada `CHANT.every` minutos con el balón en
 * juego (nunca encima de una jugada) y el del gol tras cada gol de casa. Uno de cada cuatro, de los del rival.
 */
export function chantsOf(tl: Timeline): readonly Chant[] {
  const key = keyOf(tl);
  const hit = chantCache.get(key);
  if (hit) return hit;
  const rng = seededRng(hashSeed('arena-chants', tl.match.day, tl.match.kickoff, tl.match.rival));
  const line = (from: readonly string[]): string => from[Math.floor(rng() * from.length)].replace('{rival}', tl.match.rival);
  const out: Chant[] = [{ id: `${key}:c-pre`, start: -12, by: 'home', line: line(CHANTS_HOME) }];
  const busy = (s: number): boolean => tl.moments.some((m) => m.start - 1 < s + CHANT.length && s < m.end + 1);
  for (const half of [HALVES.first, HALVES.second]) {
    let s = half.from + 2 + rng() * 4;
    while (s + CHANT.length < half.to - 1) {
      const away = rng() < 0.25;
      if (!busy(s)) out.push({ id: `${key}:c${Math.round(s * 10)}`, start: s, by: away ? 'away' : 'home', line: line(away ? CHANTS_AWAY : CHANTS_HOME) });
      s += CHANT.every[0] + rng() * (CHANT.every[1] - CHANT.every[0]);
    }
  }
  tl.moments.forEach((m, i) => {
    if (m.goal && m.side === 'home') out.push({ id: `${key}:c-g${i}`, start: m.at + 3, by: 'home', line: line(CHANTS_GOAL) });
  });
  out.sort((a, b) => a.start - b.start);
  chantCache.set(key, out);
  return out;
}

/** El cántico que suena ahora (o null). */
export function chantAt(tl: Timeline, t: number): Chant | null {
  return chantsOf(tl).find((c) => t >= c.start && t < c.start + CHANT.length) ?? null;
}

// ------------------------------------------------------------ cada espectador

/**
 * Lo que hace un espectador sentado en su asiento a esa hora, o null para lo de siempre (sentado, respirando).
 * Con las poses que ya existen (world/HumanArt): de pie (0), los brazos arriba (21), el puño arriba (7, jaleando), el
 * móvil en alto para grabarlo (34, unos pocos tras un gol) y la mano a la cara (33, sentado: «uy», el gol en contra).
 *
 * Nadie a la vez que nadie: cada uno reacciona con su retraso (`REACTION.lag`), a su ritmo y no todos se suman. Con
 * `reduced` (prefers-reduced-motion) no hay vaivén: la misma reacción, quieta.
 */
export function spectatorPose(m: StandMood, who: Supporter, seed: number, nowMs: number, reduced: boolean, chant: Chant | null): Pose | null {
  if (m.kind === 'off') return null;
  const roll = (what: string): number => roll01(what, seed, m.id);
  const lag = ((seed % 7) / 6) * REACTION.lag;
  const period = 380 + (seed % 5) * 70;
  const alt = (poses: readonly Pose[], ms = period): Pose => (reduced ? poses[0] : poses[Math.floor((nowMs + seed * 137) / ms) % poses.length]);
  // Los neutrales tiran un poco hacia el de casa, pero se suman menos.
  const own = m.side === null ? null : who === 'away' ? m.side === 'away' : m.side === 'home';
  const joins = who === 'neutral' ? 0.45 : 0.9;
  switch (m.kind) {
    case 'goal':
      if (m.since < lag) return null;
      if (own) {
        if (roll('goal') > joins) return null;
        return m.strength > 0.45 ? alt([21, 7, 0]) : roll('graba') < 0.2 ? 34 : alt([7, 0], 600);
      }
      return m.strength > 0.4 && roll('pena') < 0.6 ? 33 : null;
    case 'miss':
      if (m.since < lag) return null;
      return own && roll('uy') < 0.75 * joins ? 33 : null;
    case 'attack':
      if (own) return m.strength > 0.35 + roll('rise') * 0.45 && roll('sigue') < joins ? 0 : null;
      return m.strength > 0.7 && roll('nervios') < 0.35 ? 33 : null;
    case 'final':
      if (m.since < lag) return null;
      if (m.side === null) return m.strength > 0.5 && roll('empate') < 0.5 ? 0 : null;
      if (own) return roll('fin') > joins ? null : m.strength > 0.5 ? alt([21, 7]) : alt([7, 0], 600);
      return m.strength > 0.4 && roll('derrota') < 0.7 ? 33 : null;
    default: {
      // Cantando con los suyos: el puño arriba y abajo, al ritmo.
      if (chant && (chant.by === who || (who === 'neutral' && chant.by === 'home' && roll('canta') < 0.3)) && roll('canta2') < 0.8) return alt([7, 4], 560);
      // De vez en cuando, alguien jalea un momento: la mitad, cada uno cada veintitantos segundos.
      if (m.kind === 'calm' && roll01('jalea', seed) < 0.5) {
        const cycle = 26_000 + (seed % 9) * 2_500;
        if ((nowMs + seed * 7_919) % cycle < 1_500) return 7;
      }
      return null;
    }
  }
}

// ------------------------------------------------------------ avisos y sonido

export type CueKind = 'whistle-start' | 'whistle-half' | 'whistle-second' | 'whistle-final' | 'chance' | 'goal-home' | 'goal-away' | 'miss' | 'chant';

export interface Cue {
  id: string;
  kind: CueKind;
  /** Lo que se lee en el marcador (sin sonido, también se entera). Los goles y las ocasiones ya los cuenta el marcador. */
  text?: string;
}

/**
 * Lo que suena (y se lee) al pasar el reloj de `last` a `abs` mirando: el silbato al empezar, al descanso, a la
 * segunda parte y al final; el rugido de una ocasión, el gol de casa, el lamento del gol en contra, el «uy» y los
 * cánticos. Igual que systems/MatchPlay.announcement: sin `last` (se acaba de llegar o de cargar) o tras un salto
 * de tiempo, nada; cada suceso, una vez, en su minuto.
 */
export function standCues(tl: Timeline, last: number | null, abs: number): Cue[] {
  if (last === null || abs <= last || abs - last > WATCHED_STEP) return [];
  const key = keyOf(tl);
  const a = last - tl.kickoff;
  const b = abs - tl.kickoff;
  const crossed = (x: number): boolean => x > a && x <= b;
  const out: { at: number; cue: Cue }[] = [];
  const [h, w] = tl.final;
  const result = h > w ? `gana el Halcón, ${h}–${w}.` : w > h ? `gana el ${tl.match.rival}, ${h}–${w}.` : `empate, ${h}–${w}.`;
  const whistles: [number, CueKind, string][] = [
    [HALVES.first.from, 'whistle-start', 'Pitido inicial: ¡empieza el partido!'],
    [HALVES.first.to, 'whistle-half', 'Pitido: descanso.'],
    [HALVES.second.from, 'whistle-second', 'Pitido: empieza la segunda parte.'],
    [LIVE_END, 'whistle-final', `Pitido final: ${result}`],
  ];
  for (const [at, kind, text] of whistles) if (crossed(at)) out.push({ at, cue: { id: `${key}:${kind}`, kind, text } });
  tl.moments.forEach((m, i) => {
    if (crossed(m.start + 0.5)) out.push({ at: m.start + 0.5, cue: { id: `${key}:chance${i}`, kind: 'chance' } });
    if (crossed(m.at)) out.push({ at: m.at, cue: { id: `${key}:at${i}`, kind: m.goal ? (m.side === 'home' ? 'goal-home' : 'goal-away') : 'miss' } });
  });
  for (const c of chantsOf(tl)) {
    if (!crossed(c.start)) continue;
    const who = c.by === 'home' ? 'La grada canta' : `Los del ${tl.match.rival} cantan`;
    out.push({ at: c.start, cue: { id: c.id, kind: 'chant', text: `${who}: «${c.line}»` } });
  }
  return out.sort((x, y) => x.at - y.at).map((o) => o.cue);
}
