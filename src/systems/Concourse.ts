// Sin Phaser: lo usan WorldScene (el quiosco y la charla en la grada) y scripts/check-concourse.ts. Todo sale del
// partido de verdad (systems/MatchPlay) y de la hora: nada se inventa ni se guarda, salvo lo que ya se ha oído (lo
// lleva quien llama, en la memoria de charla de siempre).
import { ARENA_CLUB } from '../data/cityEvents.ts';
import { FAN_LINES, FAN_RECENT, type FanLine, type FanTopic, type Standing } from '../data/concourse.ts';
import { footballMinute, stageAt, stateAt, type Timeline } from './MatchPlay.ts';
import { hashSeed } from './MetroDaily.ts';
import type { Supporter } from './StandLife.ts';

const hhmm = (abs: number): string => {
  const m = ((Math.round(abs) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Si el quiosco atiende ahora (data/concourse.ts KIOSK_WINDOWS, en minutos desde el saque del partido de aquí) y, si
 * no, por qué y cuándo vuelve a abrir: hoy no hay partido, aún no han abierto las puertas, se está jugando (abre en el
 * descanso) o ya ha recogido.
 */
export function kioskService(windows: readonly (readonly [number, number])[], tl: Timeline | null, abs: number): { open: true } | { open: false; lines: string[] } {
  if (!tl) return { open: false, lines: ['Persiana bajada: sólo abre los días de partido.'] };
  const t = abs - tl.kickoff;
  if (windows.some(([a, b]) => t >= a && t < b)) return { open: true };
  const next = windows.find(([a]) => a > t);
  if (!next) return { open: false, lines: ['El quiosco ya ha cerrado: hoy no se sirve más.'] };
  if (t < windows[0][0]) return { open: false, lines: [`Aún está cerrado. Abre con las puertas, a las ${hhmm(tl.kickoff + next[0])}.`] };
  return { open: false, lines: [`Con el balón en juego no se atiende. Vuelve a abrir en el descanso, hacia las ${hhmm(tl.kickoff + next[0])}.`] };
}

// ------------------------------------------------------------ la charla

/** Lo que pasa en el partido para quien habla: de qué toca hablar y cómo va para los suyos. */
export interface FanMoment {
  topic: FanTopic;
  standing: Standing;
  /** «Nosotros» y «ellos» para quien habla. */
  us: string;
  them: string;
  /** El marcador, de casa a fuera, y el minuto de lo último que ha pasado. */
  score: string;
  minute: string;
  /** Se puede celebrar: un gol del Halcón de hace poco o su victoria al final. */
  celebrate: boolean;
  /** Se puede animar: antes del saque, jugando o en el descanso. */
  cheer: boolean;
}

/** De qué se habla `abs` con quien anima a `who` (los neutrales, como la grada de casa en la que están). */
export function fanMoment(tl: Timeline, abs: number, who: Supporter): FanMoment {
  const t = abs - tl.kickoff;
  const s = stateAt(tl, abs);
  const ours = who === 'away' ? 'away' : 'home';
  const [h, a] = s.score;
  const mine = ours === 'home' ? h - a : a - h;
  const standing: Standing = mine > 0 ? 'ahead' : mine < 0 ? 'behind' : 'level';
  const us = ours === 'home' ? ARENA_CLUB.short : tl.match.rival;
  const them = ours === 'home' ? tl.match.rival : ARENA_CLUB.short;
  const stage = stageAt(t);
  // Lo último decidido que ya ha pasado (nunca lo que viene).
  const last = [...tl.moments].reverse().find((m) => m.at <= t);
  const since = last ? t - last.at : Infinity;
  let topic: FanTopic;
  if (stage === 'pre') topic = 'pre';
  else if (stage === 'full') topic = standing === 'ahead' ? 'win' : standing === 'behind' ? 'loss' : 'draw';
  else if (last?.goal && since < FAN_RECENT.goal) topic = last.side === ours ? 'goal-us' : 'goal-them';
  else if (stage === 'half') topic = 'half';
  else if (last && !last.goal && since < FAN_RECENT.chance) topic = last.side === ours ? 'chance-us' : 'chance-them';
  else topic = 'match';
  const homeGoal = !!last?.goal && last.side === 'home' && since < FAN_RECENT.goal;
  return {
    topic,
    standing,
    us,
    them,
    score: `${h}–${a}`,
    minute: last ? (footballMinute(last.at) ?? '') : '',
    celebrate: stage === 'full' ? h > a : homeGoal,
    cheer: stage !== 'full',
  };
}

const fill = (text: string, m: FanMoment): string => text.replace('{us}', m.us).replace('{them}', m.them).replace('{score}', m.score).replace('{minute}', m.minute);

/**
 * Una frase del tema para quien habla: de las que le valen (su lado, cómo va el marcador), la primera que no ha dicho
 * aún (`heard`, lo que esta persona ya le ha dicho al jugador), en un orden suyo (`seed`), y de ésas la que hace más que no
 * se oye en la grada (`recent`, de lo más viejo a lo último): con cuatro frases por tema, cuatro aficionados seguidos no
 * repiten (EST-002). Si ya lo ha dicho todo, la que dijo hace más.
 */
export function fanLine(topic: FanTopic, m: FanMoment, who: Supporter, seed: number, heard: readonly string[], recent: readonly string[]): { id: string; text: string } {
  const side = who === 'away' ? 'away' : 'home';
  const pool = FAN_LINES.filter((l) => l.topic === topic && (!l.side || l.side === side) && (!l.standing || l.standing === m.standing));
  const order = [...pool].sort((x, y) => hashSeed(seed, x.id) - hashSeed(seed, y.id));
  const fresh = order.filter((l) => !heard.includes(l.id)).sort((x, y) => recent.lastIndexOf(x.id) - recent.lastIndexOf(y.id))[0];
  const pick: FanLine = fresh ?? [...order].sort((x, y) => heard.indexOf(x.id) - heard.indexOf(y.id))[0];
  return { id: pick.id, text: fill(pick.text, m) };
}

/** Lo que contesta a lo que hace el jugador (Animar, Celebrar): le alegra a los suyos y le escuece al rival. */
export function reactionTopic(action: 'cheer' | 'celebrate', who: Supporter): FanTopic {
  return `${action}-${who === 'away' ? 'them' : 'us'}`;
}
