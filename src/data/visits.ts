import type { Beat, Opener, PlanDef, StoryMessage } from '../systems/Story.ts';

/**
 * La visita a casa del jugador (systems/Story + data/housing.ts), compartida por quien tiene historia. Cada personaje
 * aporta sus palabras; aquí está la mecánica una sola vez:
 *
 * - dos planes, `visita` (Olmo 7) y `visita-estudio` (Estudio), con su rutina de ese día: va a la casa, se sienta en el
 *   sofá y se vuelve a la suya (la hora de salida la pone su rutina; no queda nada reservado);
 * - la invitación (un hito que puede llegar por el móvil), con su plan según la casa donde vivas;
 * - una actividad compartida al hablar con ella durante la visita, que se recuerda (decisión `visita-plan`);
 * - lo que dice de la casa en el momento (una mejora instalada, si la hay) y al día siguiente (en persona o por móvil).
 */

export interface VisitText {
  /** Rutinas de data/characters.ts y el asiento del sofá de cada casa. */
  routine: string;
  routineStudio: string;
  sofa: string;
  sofaStudio: string;
  /** La flag de «ya es de su gente» y la del enfado (data/<npc>Story.ts). */
  friend: string;
  conflict: string;
  ask: readonly string[];
  yes: { label: string; reply: readonly string[] };
  no: { label: string; reply: readonly string[] };
  /** Al llegar (al cumplir el plan). */
  kept: readonly string[];
  /** Qué hacer juntos: la respuesta de cada elección. */
  together: { say: readonly string[]; tele: readonly string[]; picar: readonly string[]; casa: readonly string[] };
  /** Lo que dice al verlo (durante la visita) según lo que tengas instalado; sin mejora, `plain`. */
  notices: { sofa: readonly string[]; cuadro: readonly string[]; lampara: readonly string[]; plain: readonly string[] };
  /** Al día siguiente, en persona y por móvil. */
  next: { sofa: readonly string[]; cuadro: readonly string[]; lampara: readonly string[]; plain: readonly string[]; message: readonly string[] };
}

const ANY_DAY = [0, 1, 2, 3, 4, 5, 6];

export function visitPlans(t: VisitText): Record<string, PlanDef> {
  const kept = {
    say: t.kept,
    then: { social: { friendship: 4, trust: 3, mood: 5 }, mood: 10, event: 'visita' },
  };
  return {
    visita: { routine: t.routine, point: t.sofa, from: '19:30', until: '21:00', place: 'tu piso', days: ANY_DAY, kept },
    'visita-estudio': { routine: t.routineStudio, point: t.sofaStudio, from: '19:30', until: '21:00', place: 'tu estudio', days: ANY_DAY, kept },
  };
}

/** Las invitaciones (una por casa) y la actividad compartida. Van al final de los hitos, salvo la actividad (del día). */
export function visitBeats(t: VisitText): { invite: Beat[]; share: Beat } {
  const invite = (plan: string, home: string): Beat => ({
    id: plan,
    phone: true,
    offer: plan,
    when: { flags: [t.friend], notFlags: [t.conflict], home, since: { flag: t.friend, days: 3 }, cooldown: 5, chance: 0.5 },
    say: t.ask,
    choices: [
      { label: t.yes.label, reply: t.yes.reply, then: { social: { friendship: 2, trust: 1 }, mood: 3, event: 'promesa', decision: ['visita', 'si'] } },
      { label: t.no.label, reply: t.no.reply, then: { social: { mood: -1 }, mood: -2, event: 'visita-rechazada', decision: ['visita', 'no'] } },
    ],
  });
  return {
    invite: [invite('visita', 'olmo7'), invite('visita-estudio', 'estudio')],
    share: {
      id: 'visita-comparte',
      when: { recent: { event: 'visita', days: 0 }, cooldown: 1 },
      say: t.together.say,
      choices: [
        { label: 'Poner algo en la tele', reply: t.together.tele, then: { social: { friendship: 2, mood: 3 }, mood: 4, event: 'visita-tele', decision: ['visita-plan', 'tele'] } },
        { label: 'Preparar algo de picar', reply: t.together.picar, then: { social: { trust: 3 }, mood: 4, event: 'visita-picar', decision: ['visita-plan', 'picar'] } },
        { label: 'Enseñarle la casa', reply: t.together.casa, then: { social: { friendship: 1, trust: 2 }, mood: 5, event: 'visita-casa', decision: ['visita-plan', 'casa'] } },
      ],
    },
  };
}

/** Lo que reconoce de la casa: en el momento de la visita y al día siguiente. Delante de las aperturas genéricas. */
export function visitOpeners(t: VisitText): Opener[] {
  const during = { event: 'visita', days: 0 };
  const after = { event: 'visita', days: 1 };
  return [
    { when: { recent: during, has: 'sofa-lectura' }, text: t.notices.sofa },
    { when: { recent: during, has: 'cuadro-carmen' }, text: t.notices.cuadro },
    { when: { recent: during, has: 'lampara-pie' }, text: t.notices.lampara },
    { when: { recent: during }, text: t.notices.plain },
    { when: { ago: after, has: 'sofa-lectura' }, text: t.next.sofa },
    { when: { ago: after, has: 'cuadro-carmen' }, text: t.next.cuadro },
    { when: { ago: after, has: 'lampara-pie' }, text: t.next.lampara },
    { when: { ago: after }, text: t.next.plain },
  ];
}

export function visitMessages(t: VisitText): StoryMessage[] {
  return [{ id: 'visita', when: { ago: { event: 'visita', days: 1 } }, text: t.next.message }];
}
