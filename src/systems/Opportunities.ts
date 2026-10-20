// Sin Phaser: lo usan main.ts (HUD), ui/Phone (app Hoy) y scripts/check-week.ts.
import { OPPORTUNITIES, type OpportunityCond, type OpportunityDef } from '../data/opportunities.ts';
import { JOBS } from '../data/jobs.ts';
import { COURSES } from '../data/study.ts';
import { CATALOGS } from '../data/catalogs.ts';
import { CHARACTERS } from '../data/characters.ts';
import { STORIES } from '../data/saraStory.ts';
import { UPGRADES } from '../data/housing.ts';
import { LINES, STOPS } from '../data/transit.ts';
import { getNpc } from '../data/npcs.ts';
import { WEEK, WEEKDAY_SHORT } from './Calendar.ts';
import { rainyDay, routineFor, whereabouts } from './Characters.ts';
import { euros } from './Commerce.ts';
import { fits, startHousing, type HousingState } from './Housing.ts';
import { owed, startHousehold, type HouseholdState } from './Household.ts';
import { activePlan, createPhone, type PhoneState } from './Phone.ts';
import { emptyStudy } from './Study.ts';
import type { GameStateData } from '../types/game.ts';
import { placeOfPoint } from './Places.ts';
import { routineOn, type StoryState } from './Story.ts';
import type { JobProgress } from './Jobs.ts';
import type { SocialState } from './Social.ts';
import type { StudyState } from './Study.ts';

/**
 * Qué se puede hacer ahora que todavía no se ha hecho (data/opportunities.ts), leído del estado de siempre: nada de
 * esto se guarda. Cada oportunidad sale mientras su condición se cumple y se va al aprovecharla; las que se
 * rechazan siguen ahí. Lo que dice de una persona (dónde está ahora) sale de su rutina de verdad, la misma que la
 * dibuja en el mundo (con el día que le fije su historia).
 */

export interface OpportunityInput {
  now: number;
  money: number;
  job: JobProgress | null;
  study: StudyState;
  household: HouseholdState;
  housing: HousingState;
  cards: Readonly<Record<string, number>>;
  social: SocialState;
  phone: PhoneState;
  stories: StoryState;
}

export interface Opportunity {
  id: string;
  title: string;
  text: string;
  via: OpportunityDef['via'];
}

type Stage = 'unmet' | 'met' | 'number' | 'planned';

function stageOf(npc: string, input: OpportunityInput): Stage {
  const p = input.social[npc];
  if (!p || p.encounters === 0) return 'unmet';
  if (!p.contactExchanged) return 'met';
  const planned = input.stories[npc]?.plan?.status === 'pending' || !!activePlan(input.phone, npc, input.now);
  return planned ? 'planned' : 'number';
}

/** La mejora más barata que cabe en la casa de ahora y no tienes. */
function cheapestUpgrade(h: HousingState): (typeof UPGRADES)[number] | undefined {
  return UPGRADES.filter((u) => fits(u, h.home) && !h.owned.includes(u.id)).sort((a, b) => a.price - b.price)[0];
}

const free = (input: OpportunityInput): number => Math.round((input.money - owed(input.household)) * 100) / 100;

function holds(c: OpportunityCond, input: OpportunityInput): boolean {
  if ('job' in c) return c.job === 'active' ? input.job?.status === 'active' : input.job?.status !== 'active';
  if ('card' in c) {
    const card = input.cards.transport;
    return c.card === false ? card === undefined : card !== undefined && card + 1e-9 < 2 * LINES[0].fare;
  }
  if ('course' in c) {
    const p = input.study.course;
    const course = p && COURSES.find((x) => x.id === p.id);
    const done = !!p?.passed || (!!course && p!.attended.length >= course.lessons.length);
    return c.course === 'none' ? !p : c.course === 'active' ? !!p && !done : done;
  }
  if ('goal' in c) return !input.household.goal;
  if ('person' in c) return stageOf(c.person, input) === c.stage;
  const u = cheapestUpgrade(input.housing);
  if (!u) return false;
  return c.upgrade === 'affordable' ? free(input) >= u.price : free(input) < u.price;
}

/** Dónde está ahora quien tiene rutina, dicho en corto: «en Café Pausa», «de camino a algún sitio», «en su casa». */
export function nowAt(npc: string, input: OpportunityInput): string {
  const def = CHARACTERS.find((c) => c.npc === npc);
  if (!def) return 'por el barrio';
  const story = input.stories[npc];
  const pick = (day: number) => routineFor(def, day, { rainy: rainyDay(day), forced: story ? routineOn(story, day) : undefined });
  const w = whereabouts(def, input.now, pick);
  if (w.moving) return 'de camino a algún sitio';
  if (w.inside && w.stop.point === def.home) return (input.now % 1440) < 8 * 60 ? 'durmiendo en su casa' : 'en su casa';
  const place = placeOfPoint(w.stop.point)?.name.split(' · ')[0];
  return place ? `en ${place}` : 'por la calle';
}

function fill(text: string, input: OpportunityInput, def: OpportunityDef): string {
  const job = JOBS[0];
  const lvl = job.levels[0];
  const course = COURSES[0];
  const u = cheapestUpgrade(input.housing);
  const person = def.when.find((c): c is Extract<OpportunityCond, { person: string }> => 'person' in c)?.person;
  const card = CATALOGS.find((c) => c.id === 'transport-machine')?.products.find((p) => p.effect && 'issue' in p.effect && p.effect.issue);
  const hh = (n: number): string => `${String(n).padStart(2, '0')}:00`;
  const values: Record<string, () => string> = {
    empleador: () => job.employer,
    parada: () => STOPS.find((s) => s.offMap === job.place)?.name.split(' · ')[0] ?? 'el polígono',
    turno: () => `${lvl.days.map((d) => WEEKDAY_SHORT[WEEK[d]]).join(', ')} de ${hh(lvl.start)} a ${hh(lvl.start + lvl.hours)} por ${euros(lvl.wage)}`,
    curso: () => course.name,
    matricula: () => euros(course.fee),
    clases: () => `${course.lessons.length} clases de ${course.hours} h a las ${hh(course.start)} (${course.days.map((d) => WEEKDAY_SHORT[WEEK[d]]).join(' y ')})`,
    persona: () => (person ? getNpc(person).name : ''),
    ahora: () => (person ? nowAt(person, input) : ''),
    mejora: () => u?.name ?? '',
    precio: () => (u ? euros(u.price) : ''),
    libre: () => euros(Math.max(0, free(input) - (def.id === 'mejora' && u ? u.price : 0))),
    tarjeta: () => (card ? euros(card.price) : ''),
    saldo: () => euros(input.cards.transport ?? 0),
  };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => values[k]?.() ?? m);
}

/** La entrada a partir de la partida (GameState.snapshot), con el minuto absoluto de ahora. */
export function opportunityInput(s: GameStateData, now: number): OpportunityInput {
  return {
    now, money: s.money, job: s.job ?? null, study: s.study ?? emptyStudy(), household: s.household ?? startHousehold(s.day),
    housing: s.housing ?? startHousing(), cards: s.cards, social: s.social ?? {}, phone: s.phone ?? createPhone(), stories: s.stories ?? {},
  };
}

/** Las oportunidades de ahora, en el orden de los datos. */
export function opportunities(input: OpportunityInput): Opportunity[] {
  return OPPORTUNITIES.filter((d) => d.when.every((c) => holds(c, input) && (!('person' in c) || !!STORIES[c.person])))
    .map((d) => ({ id: d.id, title: fill(d.title, input, d), text: fill(d.text, input, d), via: d.via }));
}
