// Sin Phaser: lo usan WorldScene y scripts/check-quedadas.ts.
/**
 * VID-05 · Quedadas en casa (F2): el puente entre una quedada (systems/SocialEvents) y los planes de historia de cada
 * invitada (systems/Story), su resolución por reloj y lo que recuerda cada una. Todo puro: entra estado, sale estado.
 *
 * - Cada invitada que acepta tiene su plan de visita de esa casa, uno por asiento (data/visits.ts seatPlanId): ir o
 *   faltar lo sigue resolviendo su historia (watchPlan/missPlan, con su recuerdo).
 * - El jugador «llega» la primera vez que está en el venue dentro de la franja; eso queda en `playerPresence` y no se
 *   vuelve a mirar.
 * - Al cerrar, un recuerdo agrupado por invitada que vino (`memoryEventIds`, una vez) y, si llegó tarde, confianza −1.
 */

import { HOMES, seatsFor, type HomeDef } from '../data/housing.ts';
import { STORIES } from '../data/saraStory.ts';
import { GATHERING_EVENTS, seatPlanId } from '../data/visits.ts';
import { postMessage, whenLabel, type Availability, type PhoneState } from './Phone.ts';
import { applyDelta, noteSocialMemory, relationshipState, type SocialProfile } from './Social.ts';
import {
  addInvitee, cancelEvent, createEvent, decideInvite, eventMemoryId, LATE_MINUTES, MAX_INVITEES, resolveEvent,
  type EventFacts, type PlanOutcome, type SocialEvent, type SocialEventsState,
} from './SocialEvents.ts';
import { acceptPlan, cancelStoryPlan, noteEvent, planDayFrom, type NamedStory, type StoryNow } from './Story.ts';

type Stories = Readonly<Record<string, NamedStory>>;
type Profiles = Readonly<Record<string, SocialProfile>>;

/** Día de reloj en que empieza (las quedadas son de tarde: coincide con el día del personaje). */
export const eventDay = (ev: Pick<SocialEvent, 'start'>): number => Math.floor(ev.start / 1440) + 1;

/** La casa del venue (HomeDef.location). */
export const homeOfEvent = (ev: Pick<SocialEvent, 'venueId'>): HomeDef | undefined => HOMES.find((h) => h.location === ev.venueId);

/** Los planes de visita de esa casa, uno por asiento. */
const seatPlans = (home: HomeDef): string[] => seatsFor(home).map((_, i) => seatPlanId(home, i));

/** Su plan es de esta quedada (de un asiento de esta casa, ese día). */
function ownPlan(ev: SocialEvent, story: NamedStory | undefined): NamedStory['plan'] {
  const home = homeOfEvent(ev);
  const p = story?.plan ?? null;
  return home && p && p.day === eventDay(ev) && seatPlans(home).includes(p.id) ? p : null;
}

// ponytail: el nombre sale del id (sara → Sara); si un id deja de ser el nombre, pasar los nombres desde CHARACTERS.
const nameOf = (npc: string): string => npc.charAt(0).toUpperCase() + npc.slice(1);

/**
 * Por cada invitada que aceptó, su plan de visita en un asiento distinto (en orden de invitación). No pisa un plan
 * suyo ya pendiente ni pasa de los asientos de la casa. Devuelve sólo las historias que cambian.
 */
export function bridgeGathering(ev: SocialEvent, stories: Stories): Record<string, NamedStory> {
  const home = homeOfEvent(ev);
  const out: Record<string, NamedStory> = {};
  if (!home) return out;
  // Los asientos ya ocupados por quien ya tiene su plan de esta quedada (una invitada sumada después no los pisa).
  const taken = new Set(ev.invited.map((i) => (i.status === 'accepted' ? ownPlan(ev, stories[i.npc]) : null)).filter((p) => p?.status === 'pending').map((p) => p!.id));
  const free = seatPlans(home).filter((p) => !taken.has(p));
  let seat = 0;
  for (const inv of ev.invited) {
    if (inv.status !== 'accepted') continue;
    const def = STORIES[inv.npc];
    const story = stories[inv.npc];
    const plan = free[seat];
    if (!def || !story || !plan || !def.plans[plan] || story.plan?.status === 'pending') continue;
    out[inv.npc] = acceptPlan(story, def, { id: plan, day: eventDay(ev) });
    seat++;
  }
  return out;
}

/** El umbral de relación para invitar a casa, uno solo para la opción del móvil y para decideInvite: de amiga para arriba. */
export function relationOk(profile: SocialProfile): boolean {
  const r = relationshipState(profile);
  return r !== 'STRANGER' && r !== 'ACQUAINTANCE';
}

/** Asientos de la quedada: los de la casa, sin pasar de MAX_INVITEES. */
const capacityOf = (home: HomeDef): number => Math.min(MAX_INVITEES, seatsFor(home).length);

/** La quedada abierta en la que está (aceptada), si la hay. */
export const openGatheringOf = (events: SocialEventsState | undefined, npc: string): SocialEvent | undefined =>
  events?.events.find((e) => e.status === 'open' && e.invited.some((i) => i.npc === npc && i.status === 'accepted'));

/**
 * Lo que el móvil ofrece en su hilo: «Invitar a casa» con historia, con plan de visita de la casa donde vives, su
 * número y relación suficiente (y sin estar ya en una quedada abierta); «Anular la quedada» si está en una abierta.
 */
export function homeOffer(npc: string, profile: SocialProfile | undefined, home: HomeDef | undefined, events: SocialEventsState | undefined): { invite: boolean; gathering: boolean } {
  const gathering = !!openGatheringOf(events, npc);
  const def = STORIES[npc];
  const invite = !gathering && !!def && !!home && !!def.plans[home.visitPlan] && profile?.contactExchanged === true && relationOk(profile);
  return { invite, gathering };
}

const minutesOf = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export interface InviteHomeInput {
  npc: string;
  home: HomeDef;
  events: SocialEventsState;
  /** Las historias de la invitada y de quien ya esté en la quedada de ese día (el puente mira sus asientos). */
  stories: Stories;
  profile: SocialProfile;
  phone: PhoneState;
  now: StoryNow;
  /** Minuto absoluto de ahora. */
  at: number;
  /** Lo que estará haciendo en ese minuto absoluto (systems/Phone.statusOf). */
  status: (abs: number) => Availability;
}
export interface InviteHomeResult {
  accept: boolean;
  /** Lo que contesta en el hilo: día y hora si acepta, el motivo si no. */
  reply: string;
  day: number;
  socialEvents: SocialEventsState;
  stories: Record<string, NamedStory>;
  /** Hora «HH:MM» de su plan de visita ('' si no hay plan). */
  from: string;
}

/**
 * «Invitar a casa» por el móvil. El día: el de la quedada abierta en esa casa que aún tenga sitio o, si no, el primer
 * día futuro de su plan de visita en que el jugador está libre (Story.planDayFrom con StoryNow.free). Decide con
 * decideInvite sobre hechos reales y, si acepta, crea la quedada (o la suma) y le fija su plan de visita (bridgeGathering).
 */
export function inviteHome(i: InviteHomeInput): InviteHomeResult {
  const { npc, home, events, stories, profile, phone, now, at } = i;
  const def = STORIES[npc];
  const plan = def?.plans[home.visitPlan];
  const no = (reason: string, day = 0): InviteHomeResult => ({ accept: false, reply: reason, day, socialEvents: events, stories: {}, from: plan?.from ?? '' });
  if (!def || !plan) return no('No sé quién eres');
  const from = minutesOf(plan.from);
  const until = minutesOf(plan.until);
  const open = events.events.find((e) => e.status === 'open' && e.venueId === home.location && e.start > at
    && e.invited.filter((v) => v.status === 'accepted').length < capacityOf(home)
    && !e.invited.some((v) => v.npc === npc && v.status === 'accepted'));
  const day = open ? eventDay(open) : planDayFrom(plan, now.day + 1, now.free);
  const start = (day - 1) * 1440 + from;
  const decision = decideInvite({
    npc,
    hasContact: profile.contactExchanged,
    relationOk: relationOk(profile),
    mood: profile.mood,
    busyPlan: stories[npc]?.plan?.status === 'pending',
    noDay: now.free ? !now.free(day, from, until) : false,
    statusAtStart: i.status(start),
    conflict: phone.plans.some((p) => p.npc === npc && p.day === day && (p.status === 'accepted' || p.status === 'proposed')),
    alreadyInvitedThatDay: events.events.some((e) => e.status !== 'cancelled' && eventDay(e) === day && e.invited.some((v) => v.npc === npc && v.status === 'accepted')),
  });
  if (!decision.accept) return no(decision.reason, day);
  const made = open
    ? addInvitee(events, open.id, npc, decision, at, capacityOf(home))
    : createEvent(events, { venueId: home.location, day, startMin: from, endMin: until, invitees: [{ npc, decision }], now: at });
  const ev = made.state.events.find((e) => e.id === made.id);
  if (!made.created || !ev) return no(made.reason || 'Ese día no puedo', day);
  const bridged = bridgeGathering(ev, stories);
  if (!bridged[npc]) return no('Ese día no puedo', day);
  return { accept: true, reply: `Vale, ${whenLabel(day, now.day)} a las ${plan.from} en tu casa.`, day, socialEvents: made.state, stories: bridged, from: plan.from };
}

/** Al mudarse: se anulan las quedadas abiertas en la casa que se deja (cada una con su aviso), sin mirar qué casa es. */
export function cancelGatheringsAt(
  events: SocialEventsState, venueId: string, stories: Stories, profiles: Profiles, phone: PhoneState, now: StoryNow, at: number,
): (GatheringChange & { phone: PhoneState; notified: string[] }) | null {
  let acc: GatheringChange & { phone: PhoneState; notified: string[] } = { socialEvents: events, stories: {}, profiles: {}, phone, notified: [] };
  let changed = false;
  for (const ev of events.events) {
    if (ev.status !== 'open' || ev.venueId !== venueId) continue;
    const done = cancelGathering(acc.socialEvents, ev.id, { ...stories, ...acc.stories }, { ...profiles, ...acc.profiles }, acc.phone, now, at);
    if (!done) continue;
    changed = true;
    acc = { socialEvents: done.socialEvents, phone: done.phone, stories: { ...acc.stories, ...done.stories }, profiles: { ...acc.profiles, ...done.profiles }, notified: [...acc.notified, ...done.notified] };
  }
  return changed ? acc : null;
}

export interface GatheringChange {
  socialEvents: SocialEventsState;
  stories: Record<string, NamedStory>;
  profiles: Record<string, SocialProfile>;
}

/** El jugador anula la quedada: el evento, el plan de cada invitada (Story.cancelStoryPlan suelta su rutina si es otro día) y un aviso en su hilo. */
export function cancelGathering(
  events: SocialEventsState, id: string, stories: Stories, profiles: Profiles, phone: PhoneState, now: StoryNow, at: number,
): (GatheringChange & { phone: PhoneState; notified: string[] }) | null {
  const ev = events.events.find((e) => e.id === id);
  const cancelled = cancelEvent(events, id, at);
  if (!ev || !cancelled.ok) return null;
  const out: GatheringChange & { phone: PhoneState; notified: string[] } = { socialEvents: cancelled.state, stories: {}, profiles: {}, phone, notified: [] };
  for (const inv of ev.invited) {
    if (inv.status !== 'accepted') continue;
    const def = STORIES[inv.npc];
    const story = stories[inv.npc];
    const profile = profiles[inv.npc];
    if (def && story && profile && ownPlan(ev, story)?.status === 'pending') {
      const done = cancelStoryPlan(story, profile, def, now);
      if (done) {
        out.stories[inv.npc] = done.story;
        out.profiles[inv.npc] = done.profile;
      }
    }
    out.phone = postMessage(out.phone, inv.npc, 'me', 'Tengo que anular la quedada en casa. Lo siento mucho; otro día os vuelvo a invitar.', at);
    out.notified.push(inv.npc);
  }
  return out;
}

/** Lo que se sabe de la quedada ahora: el plan de cada invitada y cuándo llegó el jugador (lo ya anotado no se vuelve a mirar). */
export function gatheringFacts(ev: SocialEvent, stories: Stories, here: string, at: number): EventFacts {
  const plans: Record<string, PlanOutcome> = {};
  for (const inv of ev.invited) plans[inv.npc] = ownPlan(ev, stories[inv.npc])?.status ?? 'pending';
  const arrivedAt = ev.playerPresence === 'on-time' ? ev.start
    : ev.playerPresence === 'late' ? ev.start + LATE_MINUTES + 1
    : inSlot(ev, here, at) ? at : null;
  return { plans, arrivedAt };
}

/** En la casa de la quedada y dentro de su franja: la única regla de «el jugador está en la quedada». */
const inSlot = (ev: SocialEvent, here: string, at: number): boolean => here === ev.venueId && at >= ev.start && at < ev.end;

/** El jugador está en la quedada abierta o en marcha de esta invitada (aceptada): para su plan, eso es estar juntos. */
export const playerInGathering = (events: SocialEventsState | undefined, npc: string, here: string, at: number): boolean =>
  !!events?.events.some((e) => (e.status === 'open' || e.status === 'running') && inSlot(e, here, at)
    && e.invited.some((i) => i.npc === npc && i.status === 'accepted'));

/** Anota en su historia lo de hoy, una vez: de qué hablará (data/visits.ts visitOpeners y el beat `gather`). */
function noteOnce(s: NamedStory, id: string, now: StoryNow): boolean {
  if (s.events.some((e) => e.id === id && e.day === now.day)) return false;
  noteEvent(s, id, now);
  return true;
}

/**
 * Cada minuto de juego con alguna quedada abierta o en marcha: la resuelve por reloj, anota en cada historia que la
 * quedada está pasando y, al cerrarse, el recuerdo agrupado (una vez por invitada) y el −1 de confianza si llegaste tarde.
 */
export function tickGatherings(events: SocialEventsState, stories: Stories, profiles: Profiles, here: string, at: number, now: StoryNow): GatheringChange | null {
  const live = events.events.filter((e) => e.status === 'open' || e.status === 'running');
  if (live.length === 0) return null;
  const facts: Record<string, EventFacts> = {};
  for (const ev of live) facts[ev.id] = gatheringFacts(ev, stories, here, at);
  const resolved = resolveEvent(events, at, facts);
  const out: GatheringChange = { socialEvents: resolved, stories: {}, profiles: {} };
  const story = (npc: string): NamedStory | undefined => out.stories[npc] ?? (stories[npc] ? structuredClone(stories[npc]) : undefined);

  const next = resolved.events.map((ev): SocialEvent => {
    if (!live.some((l) => l.id === ev.id)) return ev;
    const guests = ev.invited.filter((i) => i.status === 'accepted');
    if (ev.status === 'running') {
      const came = guests.filter((i) => ownPlan(ev, stories[i.npc])?.status === 'kept');
      const both = came.length === 2;
      came.forEach((inv, i) => {
        const s = story(inv.npc);
        if (!s) return;
        let changed = noteOnce(s, GATHERING_EVENTS.solo, now);
        if (both) changed = noteOnce(s, GATHERING_EVENTS.both, now) || changed;
        if (both && i === 0) changed = noteOnce(s, GATHERING_EVENTS.toOther, now) || changed;
        if (changed) out.stories[inv.npc] = s;
      });
      return ev;
    }
    if (ev.status !== 'closed') return ev;
    const ids = new Set(ev.memoryEventIds);
    const end = Math.floor(((ev.end % 1440) + 1440) % 1440);
    for (const inv of guests) {
      const mid = eventMemoryId(ev, inv.npc);
      const profile = out.profiles[inv.npc] ?? profiles[inv.npc];
      // Faltó: el recuerdo ya lo deja su historia (Story.missPlan); no se apunta otro.
      if (ids.has(mid) || inv.attendance === 'absent' || !profile) continue;
      const others = guests.filter((g) => g.npc !== inv.npc && g.attendance !== 'absent').map((g) => nameOf(g.npc));
      let p = noteSocialMemory(profile, {
        kind: 'SHARED_EVENT', outcome: ev.outcome === 'bien' ? 'positive' : 'neutral',
        day: Math.floor(ev.end / 1440) + 1, hour: Math.floor(end / 60), minute: end % 60,
        note: others.length ? `la quedada en casa con ${others.join(' y ')}` : 'la quedada en tu casa',
      });
      if (ev.playerPresence === 'late') p = applyDelta(p, { friendship: 0, attraction: 0, trust: -1, romance: 0, mood: 0 });
      out.profiles[inv.npc] = p;
      ids.add(mid);
    }
    return ids.size === ev.memoryEventIds.length ? ev : { ...ev, memoryEventIds: [...ids] };
  });
  out.socialEvents = next.every((e, i) => e === resolved.events[i]) ? resolved : { v: 1, events: next };
  return out.socialEvents === events && Object.keys(out.stories).length === 0 && Object.keys(out.profiles).length === 0 ? null : out;
}
