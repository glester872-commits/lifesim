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
  const stops = STOPS.filter((s) => s.id !== 'vallesco').sort((a, b) => Math.abs(a.order) - Math.abs(b.order)).slice(0, 4).map((s) => s.name.split(' · ')[0]);
  return {
    title: 'Transporte',
    text: `La boca de metro está en esta misma calle. Sin tarjeta no se sube: en la máquina del vestíbulo cuesta ${card ? euros(card.price) : 'poco'} con saldo. La ${line.name} va a ${stops.join(', ')} y más; ${line.minutesPerStop} min por parada y ${euros(line.fare)} el viaje.`,
  };
}

function jobStep(): TourStep {
  const job = JOBS[0];
  const lvl = job.levels[0];
  const stop = STOPS.find((s) => s.offMap === job.place);
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
