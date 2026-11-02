/**
 * ALPHA-10 · emergencias de la ciudad (systems/Emergencies.ts las lleva, world/EmergencyView.ts las pinta). Cada una es
 * una entrada de datos: de qué tipo es, en qué barrio, en qué portales puede pasar, quién acude y desde dónde, con qué
 * frecuencia y cuánto dura cada fase. Un accidente o un robo con aviso serán otra entrada con su `type`; el núcleo
 * (calendario con semilla, enfriamiento, fases y limpieza) no cambia.
 *
 * Sólo portales sin interior: un incendio nunca cierra una puerta que se use (ni tu casa, ni un local, ni el metro).
 */

export type EmergencyType = 'fire';

export interface EmergencyDef {
  id: string;
  type: EmergencyType;
  name: string;
  /** Localización exterior donde pasa (data/locations.ts). */
  location: string;
  /** Edificio desde cuya puerta sale la respuesta (el parque de bomberos). */
  station: string;
  /** Edificios donde puede empezar (ids de BuildingDef de `location`, sin `enter`). */
  sites: readonly string[];
  /** Probabilidad de que un día cualquiera haya uno. */
  chance: number;
  /** Hora en que puede empezar: [desde, hasta). */
  hours: readonly [number, number];
  /** Días sin otro después de uno (en este barrio). */
  cooldownDays: number;
  /** Minutos de juego de cada fase. `report`: hasta que algún vecino llama; `travel`: del aviso a llegar. */
  minutes: {
    report: readonly [number, number];
    travel: number;
    extinguish: readonly [number, number];
    cleanup: number;
  };
  /** Cuántos acuden y cuántos se paran a mirar, como mucho. */
  crew: number;
  onlookers: number;
  lines: {
    /** Lo que se ve al acercarse, por fase. */
    arrive: Readonly<Record<'smoke' | 'responding' | 'extinguishing' | 'cleanup', string>>;
    crew: readonly string[];
    onlooker: readonly string[];
    /** Llamar al 112 antes que nadie, y llamar cuando ya hay aviso. */
    call: string;
    called: string;
  };
}

export const EMERGENCIES: readonly EmergencyDef[] = [
  {
    id: 'fuego-ronda',
    type: 'fire',
    name: 'Humo en la Ronda',
    location: 'district',
    station: 'ronda-bomberos',
    sites: ['ronda-2', 'ronda-12', 'ronda-16', 'ronda-20', 'ronda-26', 'ronda-30'],
    chance: 0.12,
    hours: [9, 21],
    cooldownDays: 6,
    minutes: { report: [5, 10], travel: 6, extinguish: [24, 36], cleanup: 14 },
    crew: 2,
    onlookers: 3,
    lines: {
      arrive: {
        smoke: 'Sale humo por una ventana del segundo. Nadie ha llamado todavía.',
        responding: 'Ya han avisado: la sirena viene por la Ronda.',
        extinguishing: 'Los bomberos trabajan en el portal. Mejor mirar desde la otra acera.',
        cleanup: 'Ya está apagado. Recogen las mangueras y la gente vuelve a lo suyo.',
      },
      crew: ['Atrás, por favor. Desde la otra acera se ve igual.', 'Una sartén olvidada. Nada que no se arregle con ventilar.', 'Está controlado. Gracias por no ponerte en medio.'],
      onlooker: ['¿Será en el segundo? Ahí vive una señora mayor...', 'Ya han llamado, ya. Se oye la sirena.', 'Con lo cerca que está el parque, han tardado nada.'],
      call: 'Llamas al 112: dirección, qué ves y si hay alguien dentro. «Salen ahora mismo desde la Ronda.»',
      called: 'Llamas al 112. «Tenemos el aviso; ya van de camino. Gracias por llamar.»',
    },
  },
];

export function getEmergency(id: string): EmergencyDef {
  const def = EMERGENCIES.find((e) => e.id === id);
  if (!def) throw new Error(`emergencia desconocida: ${id}`);
  return def;
}
