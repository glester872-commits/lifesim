// Sin Phaser: lo usan data/npcs.ts (los aspectos), systems/People.ts (identidades
// y relaciones) y scripts/check-population.ts.
import {
  DYED_HAIR, FASHION_CLOTHES, FASHION_STYLE, HAIR_COLORS, INTERESTS, NEUTRAL_NAMES, ORIGINS, SKIN_TONES,
  type Build, type Fashion, type Gait, type Gender, type HairTexture, type Height, type Income, type Interest,
  type Orientation, type OriginPalette, type Posture, type Presentation, type Temperament,
} from '../data/identity.ts';
import { FIGHTER_PROFILES } from '../data/streetEvents.ts';
import type { HairStyle } from '../data/appearance.ts';
import type { NpcLook } from '../types/game.ts';
import { hashSeed, seededRng, type Rng } from './MetroDaily.ts';

/**
 * Quién es alguien. Sólo lo que decide lo que hace y con quién: nada de piel,
 * pelo ni origen (eso vive en su NpcLook y no vuelve aquí).
 */
export interface Identity {
  /** Índice en PASSENGER_LOOKS: su cuerpo en el atlas. */
  index: number;
  /** El id de su aspecto. */
  id: string;
  name: string;
  age: number;
  gender: Gender;
  /** Privado: no se ve en la interfaz. */
  trans: boolean;
  pronouns: 'ella' | 'él' | 'elle';
  presentation: Presentation;
  /** Privado: sólo decide con quién puede haber pareja. */
  orientation: Orientation;
  build: Build;
  height: Height;
  posture: Posture;
  gait: Gait;
  cane: boolean;
  interests: readonly Interest[];
  temperament: Temperament;
  /** 0–1: cuánto le tira salir con gente. */
  sociability: number;
  fashion: Fashion;
  income: Income;
  /** Vive en el barrio; si no, está de visita (turista o de paso). */
  resident: boolean;
  /** Id de data/places.ts; sin él, fuera del barrio. */
  work?: string;
}

/** Semilla del barrio: la misma gente en cada partida y en cada recarga. */
export const POPULATION_SEED = 'vallesco-2026';
/** Gente nueva, además de las caras de siempre (data/npcs.ts). Cada una, cuatro filas del atlas (con sus capas de tiempo). */
export const GENERATED_COUNT = 36;

type W<T extends string> = Readonly<Partial<Record<T, number>>>;

function pick<T extends string>(rng: Rng, weights: W<T>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [k, w] of entries) if ((roll -= w) <= 0) return k;
  return entries[entries.length - 1][0];
}

const oneOf = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

function darker(hex: string, k = 0.12): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (s: number): number => Math.round(((n >> s) & 255) * (1 - k));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------- lo que hace

function ageOf(rng: Rng): number {
  const band = pick(rng, { young: 20, adult: 35, middle: 28, older: 17 });
  const [lo, hi] = band === 'young' ? [17, 25] : band === 'adult' ? [26, 40] : band === 'middle' ? [41, 62] : [63, 86];
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function orientationOf(rng: Rng, g: Gender): Orientation {
  if (g === 'man') return pick(rng, { heterosexual: 76, gay: 9, bisexual: 9, pansexual: 3, asexual: 3 });
  if (g === 'woman') return pick(rng, { heterosexual: 74, lesbian: 8, bisexual: 12, pansexual: 3, asexual: 3 });
  return pick(rng, { bisexual: 30, pansexual: 25, gay: 12, lesbian: 12, asexual: 11, heterosexual: 10 });
}

/** Intereses: por edad (la noche tira menos a los setenta), nunca por género, origen u orientación. */
function interestsOf(rng: Rng, age: number, visitor: boolean): Interest[] {
  const w: Partial<Record<Interest, number>> = {};
  for (const i of INTERESTS) w[i] = 1;
  if (age > 50) Object.assign(w, { nightlife: 0.2, gaming: 0.3, skating: 0.1, reading: 1.8, food: 1.6, travelling: 1.4, cinema: 1.4 });
  if (age < 30) Object.assign(w, { nightlife: 1.8, gaming: 1.5, music: 1.5, skating: 1.2 });
  const out: Interest[] = visitor ? ['travelling'] : [];
  const n = 2 + (rng() < 0.4 ? 1 : 0);
  while (out.length < n) {
    const i = pick(rng, w);
    if (!out.includes(i)) out.push(i);
  }
  return out;
}

function fashionOf(rng: Rng, age: number, income: Income, interests: readonly Interest[], work: string | undefined, visitor: boolean): Fashion {
  const w: Partial<Record<Fashion, number>> = { casual: 5 };
  const has = (i: Interest): boolean => interests.includes(i);
  if (has('fitness') || has('football') || has('cycling')) Object.assign(w, { sportswear: 3, athletic: 2 });
  if (has('fashion')) Object.assign(w, { streetwear: 2, vintage: 2, luxury: income === 'high' ? 3 : 0.5 });
  if (has('music') || has('art') || has('tattoos')) Object.assign(w, { alternative: 2, vintage: (w.vintage ?? 0) + 1.5 });
  if (has('nightlife')) w.nightlife = 2.5;
  if (has('skating') || has('gaming')) w.streetwear = (w.streetwear ?? 0) + 2.5;
  if (work && ['office', 'bank', 'civic-office', 'study-center'].includes(work)) Object.assign(w, { office: 4, formal: income === 'high' ? 1.5 : 0.3 });
  if (work && ['hardware-store', 'fruit-shop', 'laundry', 'print-shop'].includes(work)) w.workwear = 3;
  if (visitor) w.tourist = 6;
  if (age > 55) Object.assign(w, { casual: 7, formal: (w.formal ?? 0) + 1, streetwear: (w.streetwear ?? 0) * 0.2, nightlife: (w.nightlife ?? 0) * 0.2 });
  if (age < 30) w.streetwear = (w.streetwear ?? 0) + 2;
  if (income === 'low') w.luxury = 0;
  if (income === 'high') w.luxury = (w.luxury ?? 0.5) * 2;
  return pick(rng, w);
}

const WORKPLACES = ['cafe', 'gym', 'clothing-store', 'supermarket', 'restaurant', 'office', 'nightclub', 'wine-bar', 'vintage-store', 'streetwear-store', 'thrift-store', 'tattoo-studio', 'coffee-molinillo', 'records-store', 'print-shop', 'pharmacy', 'hair-salon', 'bank', 'fruit-shop', 'hardware-store', 'study-center', 'civic-office'];

type Person = Omit<Identity, 'index' | 'id' | 'name' | 'build' | 'height' | 'posture'>;

/** Lo que es de la persona y no del aspecto: se genera igual para las caras de siempre y para las nuevas. */
function personOf(rng: Rng, fixed: { gender?: Gender; age?: number } = {}): Person {
  const visitor = rng() < 0.15;
  const age = fixed.age ?? ageOf(rng);
  const gender = fixed.gender ?? pick<Gender>(rng, { woman: 47, man: 47, nonbinary: 6 });
  const trans = gender === 'nonbinary' ? rng() < 0.5 : rng() < 0.05;
  const presentation = gender === 'woman'
    ? pick<Presentation>(rng, { feminine: 75, androgynous: 20, masculine: 5 })
    : gender === 'man' ? pick<Presentation>(rng, { masculine: 75, androgynous: 20, feminine: 5 }) : pick<Presentation>(rng, { androgynous: 60, feminine: 20, masculine: 20 });
  const income = pick<Income>(rng, { low: 30, mid: 50, high: 20 });
  const work = !visitor && age >= 18 && age <= 66 && rng() < 0.7 ? (rng() < 0.45 ? oneOf(rng, WORKPLACES) : undefined) : undefined;
  const interests = interestsOf(rng, age, visitor);
  const cane = age > 65 ? rng() < 0.4 : age > 40 && rng() < 0.04;
  return {
    age, gender, trans, presentation, income, work, interests, cane,
    pronouns: gender === 'woman' ? 'ella' : gender === 'man' ? 'él' : 'elle',
    orientation: orientationOf(rng, gender),
    gait: cane || age > 70 ? 'slow' : pick<Gait>(rng, { brisk: 30, steady: 55, slow: age > 60 ? 30 : 8 }),
    temperament: oneOf<Temperament>(rng, ['extrovertido', 'tranquilo', 'reservado', 'curioso', 'bromista']),
    sociability: 0.2 + rng() * 0.8,
    fashion: fashionOf(rng, age, income, interests, work, visitor),
    resident: !visitor,
  };
}

function bodyOf(rng: Rng, age: number, presentation: Presentation): { build: Build; height: Height; posture: Posture } {
  const old = age > 60;
  const build = pick<Build>(rng, {
    thin: 14, average: 34, athletic: old ? 4 : 14, muscular: old ? 1 : 6, stocky: 10,
    curvy: presentation === 'feminine' ? 14 : presentation === 'androgynous' ? 6 : 2, heavy: 12,
  });
  const height = pick<Height>(rng, { short: 25, average: 50, tall: 25 });
  const posture: Posture = age > 68 && rng() < 0.45 ? 'stooped' : rng() < 0.3 ? 'relaxed' : 'upright';
  return { build, height, posture };
}

// ---------------------------------------------------------- aspecto

const STYLE_WEIGHTS: Readonly<Record<HairTexture, Readonly<Record<Presentation, W<HairStyle>>>>> = {
  straight: {
    feminine: { long: 4, bob: 3, ponytail: 3, bun: 2, short: 1 },
    masculine: { short: 5, buzz: 2, long: 0.6, ponytail: 0.4 },
    androgynous: { short: 3, bob: 2, buzz: 1.5, ponytail: 1, long: 1 },
  },
  wavy: {
    feminine: { long: 4, bob: 3, ponytail: 2, bun: 2, curly: 1 },
    masculine: { short: 5, buzz: 1.5, curly: 1, long: 0.6 },
    androgynous: { short: 3, bob: 2, curly: 1, ponytail: 1 },
  },
  curly: {
    feminine: { curly: 4, long: 2, bun: 2, ponytail: 1 },
    masculine: { curly: 3, short: 3, buzz: 2 },
    androgynous: { curly: 3, short: 2, bun: 1 },
  },
  coily: {
    feminine: { afro: 3, braids: 3, locs: 2, bun: 2, buzz: 0.8 },
    masculine: { buzz: 3, afro: 2, locs: 2, braids: 1 },
    androgynous: { afro: 3, locs: 2, buzz: 2, braids: 1 },
  },
};

const INK = ['#2a2830', '#2f4a8c', '#3a3a44'] as const;

/** Su aspecto: la paleta de origen sólo decide piel, pelo y nombre. */
function lookOf(rng: Rng, id: string, p: Person, body: ReturnType<typeof bodyOf>, origin: OriginPalette): NpcLook {
  const texture = pick(rng, origin.texture);
  const greying = p.age > 50 && rng() < (p.age - 50) / 32;
  const loud = ['alternative', 'streetwear', 'nightlife'].includes(p.fashion);
  const hair = greying ? (p.age > 72 ? HAIR_COLORS.white : HAIR_COLORS.grey)
    : rng() < (loud ? 0.22 : 0.03) ? oneOf(rng, DYED_HAIR) : HAIR_COLORS[oneOf(rng, origin.hair)];
  const styles: Partial<Record<HairStyle, number>> = { ...STYLE_WEIGHTS[texture][p.presentation] };
  if (p.presentation === 'masculine') styles.bald = p.age > 45 ? 2.5 : 0.2;
  const [cloth, trousers] = oneOf(rng, FASHION_CLOTHES[p.fashion]);
  const fem = p.presentation === 'feminine';
  const masc = p.presentation === 'masculine';
  const inkChance = p.interests.includes('tattoos') ? 0.7 : loud ? 0.3 : 0.08;
  const ink = rng() < inkChance ? (['arm-r', 'arm-l', 'neck', 'hand-r'] as const).filter(() => rng() < 0.45).map((spot) => ({ spot, color: oneOf(rng, INK) })) : [];
  const sporty = p.fashion === 'sportswear' || p.fashion === 'athletic';
  return {
    id,
    style: FASHION_STYLE[p.fashion],
    cloth,
    clothDark: darker(cloth),
    trousers,
    shoes: sporty ? '#e6e0d4' : p.fashion === 'formal' || p.fashion === 'office' ? '#20232c' : undefined,
    hair,
    skin: SKIN_TONES[origin.skin[0] + Math.floor(rng() * (origin.skin[1] - origin.skin[0] + 1))],
    hairStyle: pick(rng, styles),
    ...body,
    cane: p.cane || undefined,
    facialHair: rng() < (masc ? 0.55 : p.presentation === 'androgynous' ? 0.1 : 0) ? oneOf(rng, ['stubble', 'moustache', 'beard'] as const) : undefined,
    brows: rng() < 0.3 ? 'thick' : rng() < 0.35 ? 'fine' : undefined,
    jaw: rng() < 0.25 ? 'square' : rng() < 0.33 ? 'narrow' : undefined,
    glasses: rng() < (p.age > 45 ? 0.45 : 0.2) ? (rng() < (p.fashion === 'luxury' || p.fashion === 'tourist' ? 0.5 : 0.15) ? 'dark' : 'clear') : undefined,
    piercing: rng() < (loud ? 0.35 : 0.06) ? (rng() < 0.6 ? 'nose' : 'brow') : undefined,
    earrings: rng() < (fem ? 0.45 : p.presentation === 'androgynous' ? 0.25 : 0.1) ? oneOf(rng, ['#e8c86a', '#d8d2c4']) : undefined,
    headphones: p.age < 40 && p.interests.some((i) => i === 'music' || i === 'gaming' || i === 'fitness') && rng() < 0.3 ? oneOf(rng, ['#232329', '#e6e0d4', '#b8423a']) : undefined,
    headscarf: fem && rng() < 0.04 ? oneOf(rng, ['#3f5d8c', '#8c5a6e', '#d8d2c4', '#3f6f5a']) : undefined,
    cap: rng() < (sporty || p.fashion === 'streetwear' || p.fashion === 'tourist' ? 0.3 : 0.05) ? oneOf(rng, ['#232329', '#b8423a', '#e6e0d4', '#3f5d78']) : undefined,
    bag: rng() < 0.35 ? oneOf(rng, ['#5a3a26', '#2a2830', '#c9a27a', '#7b5a3d']) : undefined,
    sleeves: rng() < 0.15 ? oneOf(rng, ['#e6e0d4', '#5c6fa8', '#232329']) : undefined,
    ink: ink.length ? ink : undefined,
  };
}

// ---------------------------------------------------------- generación

/** Reparte `n` plazas por peso (restos mayores): con 36 personas sale gente de cada origen. */
function quotas(n: number): string[] {
  const entries = Object.entries(ORIGINS);
  const total = entries.reduce((s, [, o]) => s + o.weight, 0);
  const exact = entries.map(([k, o]) => [k, (o.weight / total) * n] as const);
  const out = exact.map(([k, x]) => [k, Math.floor(x)] as [string, number]);
  let left = n - out.reduce((s, [, c]) => s + c, 0);
  const byRest = exact.map(([, x], i) => [i, x - Math.floor(x)] as const).sort((a, b) => b[1] - a[1]);
  for (const [i] of byRest) if (left-- > 0) out[i][1]++;
  return out.flatMap(([k, c]) => Array.from({ length: c }, () => k));
}

export interface Generated {
  look: NpcLook;
  person: Omit<Identity, 'index'>;
}

/**
 * La gente nueva, siempre la misma. Algunos salen de dos en dos, hermanos o
 * familia: comparten paleta (se parecen), no gustos.
 */
function generate(): { people: Generated[]; family: [number, number, 'siblings' | 'relatives'][] } {
  const rng = seededRng(hashSeed(POPULATION_SEED, 'orígenes'));
  const origins = quotas(GENERATED_COUNT).map((o) => [rng(), o] as const).sort((a, b) => a[0] - b[0]).map(([, o]) => o);
  const people: Generated[] = [];
  const family: [number, number, 'siblings' | 'relatives'][] = [];
  const used = new Set<string>();
  for (let i = 0; i < GENERATED_COUNT; i++) {
    const r = seededRng(hashSeed(POPULATION_SEED, 'vecino', i));
    // Familia: a veces la persona anterior pasa a ser hermano o pariente, con su paleta y una edad acorde.
    let origin = origins[i];
    let fixed: { age?: number } = {};
    const kin = i > 0 && r() < 0.18 ? i - 1 : -1;
    const kinType = r() < 0.6 ? 'siblings' : 'relatives';
    if (kin >= 0) {
      origin = origins[kin];
      const a = people[kin].person.age;
      const age = kinType === 'siblings' ? a + Math.round((r() - 0.5) * 12) : a > 45 ? a - 22 - Math.floor(r() * 10) : a + 22 + Math.floor(r() * 10);
      if (age >= 17 && age <= 88) fixed = { age };
    }
    const person = personOf(r, fixed);
    const body = bodyOf(r, person.age, person.presentation);
    const palette = ORIGINS[origin];
    const id = `vecino-${i + 1}`;
    const names = person.gender === 'nonbinary' || (person.presentation === 'androgynous' && r() < 0.3) ? NEUTRAL_NAMES : palette.names[person.gender];
    let name = oneOf(r, names);
    for (let k = 0; used.has(name) && k < 10; k++) name = oneOf(r, names);
    used.add(name);
    people.push({ look: lookOf(r, id, person, body, palette), person: { ...person, ...body, id, name } });
    if (kin >= 0 && fixed.age !== undefined) family.push([kin, i, kinType]);
  }
  return { people, family };
}

const GENERATED = generate();

/** Los aspectos nuevos, en orden: data/npcs.ts los pone detrás de las caras de siempre. */
export const GENERATED_LOOKS: readonly NpcLook[] = GENERATED.people.map((g) => g.look);
export const GENERATED_PEOPLE: readonly Generated[] = GENERATED.people;
/** Parentescos entre gente nueva (índices dentro de GENERATED_LOOKS). */
export const GENERATED_FAMILY: readonly (readonly [number, number, 'siblings' | 'relatives'])[] = GENERATED.family;

const FIGHTER_BUILD: Readonly<Record<1 | 2 | 3, Build>> = { 1: 'thin', 2: 'athletic', 3: 'muscular' };

/**
 * Las caras de siempre (data/npcs.ts, pasajero-N): conservan su aspecto y
 * ganan identidad. Quien pelea (data/streetEvents.ts) mantiene su género, su
 * edad y su cuerpo de ficha, y su dibujo no se toca (la pelea ya lo escala).
 * Al resto se le da cuerpo.
 */
export function authoredPerson(id: string): { person: Omit<Identity, 'index' | 'id' | 'name'>; body: Partial<NpcLook>; name: string } {
  const r = seededRng(hashSeed(POPULATION_SEED, 'cara', id));
  const fighter = FIGHTER_PROFILES.find((f) => f.look === id);
  const person = personOf(r, fighter ? { gender: fighter.gender, age: fighter.age } : {});
  const body = bodyOf(r, person.age, person.presentation);
  const palette = ORIGINS[pick(r, Object.fromEntries(Object.entries(ORIGINS).map(([k, o]) => [k, o.weight])))];
  const names = person.gender === 'nonbinary' ? NEUTRAL_NAMES : palette.names[person.gender];
  return {
    person: { ...person, ...body, ...(fighter ? { build: FIGHTER_BUILD[fighter.body], cane: false } : {}) },
    body: fighter ? {} : { ...body, cane: person.cane || undefined },
    name: oneOf(r, names),
  };
}
