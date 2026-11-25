import { JOBS } from './jobs.ts';
import { STOPS, LINES } from './transit.ts';
import { CATALOGS } from './catalogs.ts';
import { HOMES } from './housing.ts';
import { LOCATIONS } from './locations.ts';
import { WEEK, WEEKDAY_SHORT } from '../systems/Calendar.ts';
import { getActivity } from './activities.ts';

/**
 * La guía del principio (systems/Agenda, `tour`): casa, transporte, trabajo y contactos, en cinco pasos cortos y
 * saltables. Los datos salen de donde viven (el horario del puesto, las paradas, lo que hay en casa), así que la
 * guía no se queda vieja al cambiarlos. La misma lista se puede releer en el móvil (app Hoy).
 */

export interface TourStep {
  title: string;
  text: string;
}

const two = (n: number): string => String(n).padStart(2, '0');
const euros = (n: number): string => `€${n.toFixed(2).replace('.', ',').replace(',00', '')}`;

function homeStep(): TourStep {
  const home = HOMES[0];
  const loc = LOCATIONS.find((l) => l.id === home.location);
  const things = (loc?.spots ?? []).filter((s) => s.activities.length).map((s) => {
    const sleep = s.activities.map(getActivity).find((x) => x.id === 'sleep');
    return sleep ? `${s.name.toLowerCase()} (dormir son ${sleep.minutes / 60} h)` : s.name.toLowerCase();
  });
  return { title: 'Casa', text: `Tu casa está en ${home.name.split(' · ').pop()}, el portal de delante. Dentro: ${things.join(', ')}. Cada cosa lleva su rato y el reloj lo cuenta.` };
}

function transportStep(): TourStep {
  const line = LINES[0];
  const card = CATALOGS.find((c) => c.id === 'transport-machine')?.products.find((p) => p.effect && 'issue' in p.effect && p.effect.issue);
  const stops = STOPS.filter((s) => s.line === line.id && s.id !== 'vallesco').sort((a, b) => Math.abs(a.order) - Math.abs(b.order)).slice(0, 4).map((s) => s.name.split(' · ')[0]);
  return {
    title: 'Transporte',
    text: `La boca de metro está en esta misma calle. Sin tarjeta no se sube: en la máquina del vestíbulo cuesta ${card ? euros(card.price) : 'poco'} con saldo. La ${line.name} va a ${stops.join(', ')} y más; ${line.minutesPerStop} min por parada y ${euros(line.fare)} el viaje.`,
  };
}

function jobStep(): TourStep {
  const job = JOBS[0];
  const lvl = job.levels[0];
  const stop = STOPS.find((s) => s.id === job.place);
  const days = lvl.days.map((d) => WEEKDAY_SHORT[WEEK[d]]).join(', ');
  return {
    title: 'Trabajo',
    text: `En ${job.employer} (en metro, parada ${stop?.name.split(' · ')[0] ?? 'de la línea'}) buscan personal: pregunta junto a las cajas. Los turnos son ${days} de ${two(lvl.start)}:00 a ${two(lvl.start + lvl.hours)}:00, por ${euros(lvl.wage)}. Sin contrato, se pueden hacer turnos sueltos.`,
  };
}

const CONTACTS: TourStep = {
  title: 'Contactos',
  text: 'La gente con nombre se conoce hablando (E). Con algo de confianza, pídele el número; luego, en el móvil (P), Mensajes y Contactos.',
};

const DAY: TourStep = {
  title: 'Tu día',
  text: 'Arriba, bajo la hora, siempre está lo siguiente que tienes, con su sitio y lo que se tarda. En el móvil, la app Hoy lo detalla y guarda esta guía. El mapa (M) y las compras paran el reloj; el móvil y las conversaciones, no.',
};

export const TOUR: readonly TourStep[] = [homeStep(), transportStep(), jobStep(), CONTACTS, DAY];

// ================================================================
// VID-12 · Los primeros días con narrativa guiada: cuatro hitos. Sólo textos; qué está hecho lo decide
// systems/Agenda.guideProgress con lo que ya guarda la partida. Precios, tarjeta y puesto, de sus datos.
// ================================================================

export type GuideId = 'vecino' | 'metro' | 'trabajo' | 'social';

export interface GuideMilestoneDef {
  id: GuideId;
  title: string;
  text: string;
  /** Etiquetas de los pasos, en el orden que evalúa guideProgress. */
  steps: readonly string[];
  /** Lo siguiente que hacer según en qué paso se esté: clave → texto. `{falta}` = euros que faltan. */
  hints: Readonly<Record<string, string>>;
}

/** El producto que emite la tarjeta de transporte en la máquina del vestíbulo. */
export const TRANSPORT_CARD = CATALOGS.find((c) => c.id === 'transport-machine')?.products.find((p) => p.effect && 'issue' in p.effect && p.effect.issue);
/** Id de la tarjeta en la cartera (wallet.cards). */
export const GUIDE_CARD = TRANSPORT_CARD?.effect && 'card' in TRANSPORT_CARD.effect ? TRANSPORT_CARD.effect.card : 'transport';

function metroMilestone(): GuideMilestoneDef {
  const line = LINES[0];
  const price = TRANSPORT_CARD ? euros(TRANSPORT_CARD.price) : 'su precio';
  return {
    id: 'metro', title: 'Coger el metro',
    text: `La tarjeta sale en la máquina del vestíbulo (${price}, con saldo). Cada viaje, ${euros(line.fare)}; ${line.minutesPerStop} min por parada.`,
    steps: ['Sacar la tarjeta de transporte', 'Hacer un viaje', 'Salir a la calle en otra estación'],
    hints: {
      card: `Entra en la boca de metro y saca la tarjeta en la máquina del vestíbulo (${price}).`,
      money: `La tarjeta cuesta ${price}: te faltan {falta}. Un turno suelto o un trabajo lo cubre.`,
      ride: `Baja al andén y sube a un tren de la ${line.name}: el billete son ${euros(line.fare)}.`,
      topup: `A la tarjeta no le llega para un viaje (${euros(line.fare)}): recarga la tarjeta en la máquina del vestíbulo.`,
      exit: 'Sal de la estación a la calle por la escalera.',
    },
  };
}

function jobMilestone(): GuideMilestoneDef {
  const job = JOBS[0];
  const stop = STOPS.find((s) => s.id === job.place);
  const where = `${job.employer} (parada ${stop?.name.split(' · ')[0] ?? 'de la línea'})`;
  return {
    id: 'trabajo', title: 'Buscar trabajo',
    text: `En ${where} buscan personal. Puedes pedir el puesto, decir que no a la oferta o hacer un turno suelto.`,
    steps: ['Pedir un puesto, firmarlo o hacer un turno suelto'],
    hints: {
      ask: `Ve a ${where} y pregunta junto a las cajas.`,
      // {cuando}: «a las 09:00», «mañana a las 09:00»… del horario del local (systems/Places.nextOpening).
      closed: `${job.employer.split(' ')[0]} abre {cuando}; mientras, saca la tarjeta o habla con tus vecinos, y luego ve a ${where} y pregunta junto a las cajas.`,
    },
  };
}

export const GUIDE: readonly GuideMilestoneDef[] = [
  {
    id: 'vecino', title: 'Conocer a un vecino',
    text: 'La gente con nombre se conoce hablando (E): que se presente o que te dé su número.',
    steps: ['Que alguien se presente o te dé su número'],
    // {nombre}/{donde}: quién se presenta y dónde está ahora (systems/Opportunities.nowAt); {quienes}: todos; {luego}: `later` o `back`.
    hints: {
      talk: 'Habla (E) con alguien con nombre de tu calle hasta que se presente.',
      here: '{nombre} está {donde}: háblale (E) hasta que se presente.',
      walking: '{nombre} va por la calle ahora: búscala y háblale (E).',
      // {dentro}: «en casa» si todas lo están; «dentro» si alguna está en un sitio que no es su casa.
      home: 'Ahora no hay nadie a la vista ({quienes}, {dentro}). {luego}',
      later: '{cuando}, {nombre} suele estar {donde}: ve allí y háblale (E).',
      back: 'Vuelve más tarde a la calle.',
    },
  },
  metroMilestone(),
  jobMilestone(),
  {
    id: 'social', title: 'Quedar con alguien',
    text: 'Un café o un plan, propuesto por ti o por la otra persona. Hace falta algo de trato.',
    steps: ['Proponer un plan', 'Recibir una invitación', 'Que se acepte', 'Ir a la quedada'],
    hints: {
      trust: 'Aún no hay trato para invitar: sigue charlando con tu vecino (con más amistad sale «Invitar a un café»).',
      propose: 'Invita a un café en persona (E) o propónselo por Mensajes (P).',
      wait: 'Espera la respuesta en Mensajes (P).',
      attend: 'Ve a la quedada a su hora: la tienes en la app Hoy.',
    },
  },
];
