// Sin Phaser: la gente anónima del barrio como personas. Lo usan StreetLife (a
// quién le toca cada viaje y con quién va), el inspector de desarrollo y
// scripts/check-population.ts.
import {
  BOND_RELATIONS, RELATION_LINES, ROLE_AFFINITY, TIE_LINES, VISITOR_ROLES,
  type Bond, type Fashion, type Gender, type Relation, type RelationType,
} from '../data/identity.ts';
import type { LookStyle } from '../data/districts.ts';
import { AUTHORED_PASSENGERS, PASSENGER_LOOKS, getNpc } from '../data/npcs.ts';
import { NAMED_PEOPLE, NAMED_RELATIONSHIPS, type NamedIdentity } from '../data/namedPeople.ts';
import { authoredPerson, GENERATED_FAMILY, GENERATED_PEOPLE, POPULATION_SEED, type Identity } from './Population.ts';
import { hashSeed, seededRng, type Rng } from './MetroDaily.ts';

export type { Identity };

const AUTHORED_FASHION: Readonly<Record<LookStyle, Fashion>> = { everyday: 'casual', smart: 'office', street: 'streetwear', sport: 'sportswear' };

/** Una por aspecto de PASSENGER_LOOKS, en el mismo orden. */
export const IDENTITIES: readonly Identity[] = [
  ...AUTHORED_PASSENGERS.map((l, index) => {
    const { person, name } = authoredPerson(l.id);
    // Su ropa de siempre manda sobre el estilo que le tocaba: el inspector no dice «lujo» de quien va en chándal.
    return { ...person, fashion: AUTHORED_FASHION[l.style ?? 'everyday'], index, id: l.id, name };
  }),
  ...GENERATED_PEOPLE.map((g, i) => ({ ...g.person, index: AUTHORED_PASSENGERS.length + i })),
];

if (IDENTITIES.length !== PASSENGER_LOOKS.length) throw new Error('Población: una identidad por aspecto');

// --------------------------------------------------------- atracción

/**
 * Si `a` puede sentirse atraído por `b` (sólo cuenta para parejas y flechazos).
 * Asexual no quiere decir sin pareja: aquí vale como panromántico.
 */
/** Lo único que decide la atracción: el género de cada cual y la orientación de quien siente. Vale para la gente anónima y para los personajes con nombre. */
type Attraction = Pick<Identity, 'gender' | 'orientation'>;

export function attractedTo(a: Attraction, b: Attraction): boolean {
  const g: Gender = b.gender;
  switch (a.orientation) {
    case 'heterosexual':
      return a.gender === 'man' ? g === 'woman' : a.gender === 'woman' ? g === 'man' : g !== 'nonbinary';
    case 'gay':
      return a.gender === 'woman' ? false : g === 'man' || g === 'nonbinary';
    case 'lesbian':
      return a.gender === 'man' ? false : g === 'woman' || g === 'nonbinary';
    default:
      return true;
  }
}

export const compatible = (a: Identity, b: Identity): boolean => a.index !== b.index && attractedTo(a, b) && attractedTo(b, a);

// --------------------------------------------------------- relaciones

export interface Relationship {
  a: number;
  b: number;
  type: RelationType;
}

const shared = (a: Identity, b: Identity): number => a.interests.filter((i) => b.interests.includes(i)).length;

/**
 * Las relaciones del barrio, siempre las mismas: grupos de amigos (lo más
 * común), parejas (sólo si se atraen los dos), ex, hermanos y familia,
 * compañeros de trabajo, pisos compartidos, vecinos de portal y algún
 * flechazo que no es mutuo. La amistad mira edad e intereses; nunca aspecto.
 */
function buildRelationships(): Relationship[] {
  const rng = seededRng(hashSeed(POPULATION_SEED, 'relaciones'));
  const out: Relationship[] = [];
  const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const taken = new Set<string>();
  const add = (a: number, b: number, type: RelationType): void => {
    if (a === b || taken.has(key(a, b))) return;
    taken.add(key(a, b));
    out.push({ a, b, type });
  };
  const people = shuffle(IDENTITIES, rng);
  const partnered = new Set<number>();

  // Familia de la gente nueva (se parecen).
  for (const [i, j, type] of GENERATED_FAMILY) add(AUTHORED_PASSENGERS.length + i, AUTHORED_PASSENGERS.length + j, type);

  // Parejas: casados, pareja de años o saliendo. Edades parecidas; nunca familia.
  for (const p of people) {
    if (partnered.has(p.index) || rng() > 0.2 * (0.5 + p.sociability)) continue;
    const q = people.find((o) => !partnered.has(o.index) && compatible(p, o) && Math.abs(o.age - p.age) <= Math.max(6, p.age * 0.2) && !taken.has(key(p.index, o.index)));
    if (!q) continue;
    partnered.add(p.index).add(q.index);
    add(p.index, q.index, Math.min(p.age, q.age) >= 30 && rng() < 0.5 ? 'married' : rng() < 0.6 ? 'couple' : 'dating');
  }

  // Grupos de amigos de dos a cuatro: la mayoría de la gente tiene uno.
  const inGroup = new Set<number>();
  for (const p of people) {
    if (inGroup.has(p.index) || rng() > 0.55 + p.sociability * 0.4) continue;
    const size = 1 + Math.floor(rng() * 3);
    const mates = people
      .filter((o) => o.index !== p.index && !inGroup.has(o.index) && o.resident === p.resident)
      .map((o) => [o, shared(p, o) * 2 - Math.abs(o.age - p.age) / 8 + rng() * 2] as const)
      .sort((x, y) => y[1] - x[1])
      .slice(0, size)
      .map(([o]) => o);
    if (!mates.length) continue;
    const group = [p, ...mates];
    for (const m of group) inGroup.add(m.index);
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) add(group[i].index, group[j].index, i === 0 && j === 1 && rng() < 0.5 ? 'best-friends' : 'friends');
  }

  // Ex: se atraían, no están juntos ahora.
  for (let n = 0; n < 4; n++) {
    const p = people[Math.floor(rng() * people.length)];
    const q = people.find((o) => compatible(p, o) && Math.abs(o.age - p.age) < 10 && !taken.has(key(p.index, o.index)));
    if (q) add(p.index, q.index, 'exes');
  }

  // Trabajo: quien trabaja en el mismo sitio del barrio.
  const byWork = new Map<string, Identity[]>();
  for (const p of IDENTITIES) if (p.work) byWork.set(p.work, [...(byWork.get(p.work) ?? []), p]);
  for (const list of byWork.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) add(list[i].index, list[j].index, 'coworkers');

  // Pisos compartidos: gente joven del barrio sin pareja, de dos en dos.
  const young = people.filter((p) => p.resident && p.age >= 18 && p.age < 36 && !partnered.has(p.index));
  for (let i = 0; i + 1 < young.length; i += 2) if (rng() < 0.5) add(young[i].index, young[i + 1].index, 'roommates');

  // Parentesco entre caras de siempre: dos pares de hermanos de edad parecida.
  const authored = people.filter((p) => p.index < AUTHORED_PASSENGERS.length);
  for (let n = 0, i = 0; n < 2 && i < authored.length; i++) {
    const p = authored[i];
    const q = authored.find((o) => o.index !== p.index && Math.abs(o.age - p.age) <= 8 && !taken.has(key(p.index, o.index)));
    if (q) {
      add(p.index, q.index, 'siblings');
      n++;
    }
  }

  // Flechazos: de uno hacia otro, sin que haga falta que sea mutuo (sí que le atraiga).
  for (let n = 0; n < 5; n++) {
    const p = people[Math.floor(rng() * people.length)];
    const q = people.find((o) => o.index !== p.index && attractedTo(p, o) && Math.abs(o.age - p.age) < 10 && !taken.has(key(p.index, o.index)));
    if (q) add(p.index, q.index, 'crush');
  }

  // Vecinos de vista: el resto se conoce poco.
  for (let n = 0; n < 12; n++) {
    const p = people[Math.floor(rng() * people.length)];
    const q = people[Math.floor(rng() * people.length)];
    if (p.resident && q.resident) add(p.index, q.index, 'acquaintances');
  }
  return out;
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const RELATIONSHIPS: readonly Relationship[] = buildRelationships();

const BY_PERSON = new Map<number, Relationship[]>();
for (const r of RELATIONSHIPS) {
  BY_PERSON.set(r.a, [...(BY_PERSON.get(r.a) ?? []), r]);
  BY_PERSON.set(r.b, [...(BY_PERSON.get(r.b) ?? []), r]);
}

export const relationsOf = (index: number): readonly Relationship[] => BY_PERSON.get(index) ?? [];
const other = (r: Relationship, index: number): number => (r.a === index ? r.b : r.a);

/** Qué es `b` para `a`. El flechazo sólo lo tiene quien lo siente. */
export function relation(a: number, b: number): Relation {
  const r = relationsOf(a).find((x) => other(x, a) === b);
  if (!r) return 'strangers';
  if (r.type === 'crush' && r.a !== a) return 'strangers';
  return r.type;
}

// --------------------------------------------------------- viajes y grupos

/**
 * Cuánto le pega a alguien un viaje de la calle (data/streets.ts, role). Lee
 * sólo edad, intereses, bastón, paso y si vive aquí.
 */
export function roleAffinity(p: Identity, role: string): number {
  if (!p.resident && !VISITOR_ROLES.has(role)) return 0.02;
  if (p.resident && role === 'tourist') return 0.02;
  const a = ROLE_AFFINITY[role];
  let w = 1;
  if (a?.interests?.some((i) => p.interests.includes(i))) w *= 2.5;
  if (a?.ages && (p.age < a.ages[0] || p.age > a.ages[1])) w *= 0.15;
  if (a?.active && p.cane) w *= 0.02;
  if (role === 'jogger' && p.gait === 'slow') w *= 0.2;
  return w;
}

/** Con quién sale alguien en un grupo de ese tipo: sus relaciones que valen, de más a menos cercanas. */
export function bondMates(index: number, bond: Bond): { index: number; type: RelationType }[] {
  const types = BOND_RELATIONS[bond];
  const me = IDENTITIES[index];
  return relationsOf(index)
    .filter((r) => types.includes(r.type))
    .map((r) => ({ index: other(r, index), type: r.type }))
    .filter(({ index: i }) => {
      const o = IDENTITIES[i];
      if (bond === 'gym') return o.interests.includes('fitness') || me.interests.includes('fitness');
      if (bond === 'tourists') return !o.resident && !me.resident;
      return true;
    })
    .sort((x, y) => types.indexOf(x.type) - types.indexOf(y.type));
}

/** Paso propio: con bastón o paso lento, más despacio; con prisa, más deprisa. */
export function paceOf(p: Identity): number {
  return (p.gait === 'brisk' ? 1.1 : p.gait === 'slow' ? 0.82 : 1) * (p.cane ? 0.8 : 1);
}

/** Lo que dice quien va con alguien: nombra a esa persona y lo que son. */
export function relationLine(type: RelationType, mate: Identity, seed: number): string {
  const lines = RELATION_LINES[type];
  const word = mate.gender === 'woman' ? 'hermana' : mate.gender === 'man' ? 'hermano' : 'hermane';
  return lines[seed % lines.length].replaceAll('{n}', mate.name).replaceAll('{hermano}', word);
}

// --------------------------------------------------------- personajes con nombre

if (NAMED_RELATIONSHIPS.some((r) => !NAMED_PEOPLE[r.a] || !NAMED_PEOPLE[r.b])) throw new Error('Relación con un personaje con nombre sin identidad');

/** La identidad de un personaje con nombre (data/namedPeople.ts). */
export const namedPerson = (id: string): NamedIdentity | undefined => NAMED_PEOPLE[id];

/** Qué es `b` para `a`, entre personajes con nombre. El flechazo sólo lo tiene quien lo siente. */
export function namedRelation(a: string, b: string): Relation {
  const r = NAMED_RELATIONSHIPS.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (!r) return 'strangers';
  if (r.type === 'crush' && r.a !== a) return 'strangers';
  return r.type;
}

// --------------------------------------------------------- de quién habla cada cual

/** Alguien de su vida, tal como lo nombra al hablar. */
export interface Tie {
  type: RelationType;
  name: string;
  gender: Gender;
}

/** Lo más cercano primero: es de lo que antes se habla. */
const TIE_ORDER: readonly RelationType[] = ['married', 'couple', 'dating', 'best-friends', 'siblings', 'roommates', 'friends', 'relatives', 'coworkers', 'exes'];

/**
 * La gente de la vida de alguien de la que hablaría: su pareja, sus amigos, su familia, con quién vive o trabaja.
 * Ni flechazos (son privados) ni conocidos de vista. De la gente anónima (`identity`) o de un personaje con nombre.
 */
export function tiesOf(who: { identity?: number; named?: string }): Tie[] {
  const out: Tie[] = [];
  if (who.identity !== undefined) {
    for (const r of relationsOf(who.identity)) {
      const o = IDENTITIES[other(r, who.identity)];
      if (o && TIE_LINES[r.type]) out.push({ type: r.type, name: o.name, gender: o.gender });
    }
  } else if (who.named) {
    for (const r of NAMED_RELATIONSHIPS) {
      if (r.a !== who.named && r.b !== who.named) continue;
      const id = r.a === who.named ? r.b : r.a;
      if (TIE_LINES[r.type]) out.push({ type: r.type, name: getNpc(id).name, gender: NAMED_PEOPLE[id].gender });
    }
  }
  return out.sort((x, y) => TIE_ORDER.indexOf(x.type) - TIE_ORDER.indexOf(y.type));
}

/** Lo que dice de esa persona: su nombre y lo que son, con la palabra del género de quien nombra. */
export function tieLine(tie: Tie, seed: number): string {
  const lines = TIE_LINES[tie.type] ?? [];
  const word = (m: string, f: string, n: string): string => (tie.gender === 'woman' ? f : tie.gender === 'man' ? m : n);
  return lines[seed % lines.length].replaceAll('{n}', tie.name).replaceAll('{amigo}', word('amigo', 'amiga', 'amigue')).replaceAll('{hermano}', word('hermano', 'hermana', 'hermane'));
}
