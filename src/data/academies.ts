/**
 * Academias: un centro de formación por disciplina, en un barrio elegido (no uno por calle). Todo lo que distingue a
 * una de otra está aquí; la lógica (systems/Academy: horario, cobro, bono; systems/Fitness: técnica y cansancio) es la
 * misma para todas. Una academia nueva es una entrada más, su interior (LocationDef con puestos `use`) y sus puestos en
 * data/stations.ts con `training: { academy }`: sin una línea de lógica por disciplina.
 *
 * Piloto: el boxeo, hoy Doble Guardia, con local propio en Cuatro Ríos (data/boxing.ts). Las demás, con la misma planta (data/academyRooms.ts) en el
 * gimnasio de su barrio: MMA en Forja (Vallesco) y baile en Velaria Club. El taekwondo tiene local propio: la Escuela de
 * Taekwondo Vallesco, en la Ronda de la Vía 34, con puerta a la calle (data/vallesco.ts, 'tkd-door').
 */

export type Discipline = 'boxing' | 'taekwondo' | 'mma' | 'dance';

export interface AcademyDef {
  id: Discipline;
  name: string;
  /** Interior donde se da la clase (LocationDef.id). */
  location: string;
  /** Quien la da, como se le ve en el menú. */
  instructor: string;
  /** Zona supervisada de combate: línea de cinco tiles libre de material. */
  spar?: { tx: number; ty: number; look: string; /** Nivel base del compañero de práctica (systems/Sparring, 0–1). */ level?: number };
  /** El ring (tiles): mientras hay combate se reserva entero y nadie más entra (scenes/WorldScene). */
  ring?: { tx: number; ty: number; w: number; h: number };
  /** Cuota mensual (systems/Academy.subscribe): € por un mes del calendario; incluye clases y sparring supervisado. */
  monthly?: { price: number };
  /** Clases de `hours[0]` a `hours[1]`, una cada `every` minutos; se entra hasta `grace` minutos tarde. */
  hours: readonly [number, number];
  every: number;
  grace: number;
  /** € por clase suelta. */
  fee: number;
  /** Bono: `classes` clases por `price` €, más barato que sueltas; se gasta una por clase empezada. */
  pass: { classes: number; price: number };
  /** Alumnos a la vez contando al jugador: la sala nunca se llena de más (el perfil de gente deja sitio). */
  capacity: number;
  /** Cómo se llama la técnica que se gana (Fitness.skills[id], de 0 a 100). */
  skill: string;
  lines: {
    /** Lo que dice quien la da, según lo avanzado (`progressedAt` puntos de técnica). */
    intro: string;
    progressed: string;
    /** Al terminar una clase. */
    after: string;
  };
  progressedAt: number;
}

export const ACADEMIES: Partial<Record<Discipline, AcademyDef>> = {
  boxing: {
    id: 'boxing',
    name: 'Doble Guardia',
    location: 'boxing',
    instructor: 'Inés',
    spar: { tx: 5, ty: 10, look: 'uniforme-gym', level: 0.15 },
    ring: { tx: 2, ty: 4, w: 11, h: 9 },
    monthly: { price: 45 },
    hours: [8, 22],
    every: 30,
    grace: 5,
    fee: 6,
    pass: { classes: 10, price: 48 },
    capacity: 6,
    skill: 'Técnica de boxeo',
    lines: {
      intro: 'Primero equilibrio y guardia. Te enseño una técnica cada vez.',
      progressed: 'Se nota la práctica: recuperas la guardia con más control. Sigue con pies y coordinación.',
      after: 'Inés asiente: mejor equilibrio y manos de vuelta a la guardia. La técnica mejora con práctica y descanso.',
    },
    progressedAt: 2,
  },
  mma: {
    id: 'mma',
    name: 'Academia MMA Forja',
    location: 'academy-mma',
    instructor: 'Rubén',
    hours: [9, 22],
    every: 30,
    grace: 5,
    fee: 8,
    pass: { classes: 10, price: 64 },
    capacity: 6,
    skill: 'Técnica de MMA',
    lines: {
      intro: 'Primero la base: postura, caer y levantarse. Luego, combinaciones.',
      progressed: 'Ya no te quedas plantado: entras, sales y te levantas rápido. Sigue con el suelo.',
      after: 'Rubén te tiende la mano para levantarte: mejor base y mejor guardia. Se gana con constancia.',
    },
    progressedAt: 2,
  },
  taekwondo: {
    id: 'taekwondo',
    name: 'Escuela de Taekwondo Vallesco',
    location: 'academy-tkd',
    instructor: 'Min-ji',
    spar: { tx: 5, ty: 10, look: 'dobok-verde' },
    hours: [10, 21],
    every: 30,
    grace: 5,
    fee: 6,
    pass: { classes: 10, price: 48 },
    capacity: 6,
    skill: 'Técnica de taekwondo',
    lines: {
      intro: 'Rodilla arriba, extiende y recoge. Primero la técnica; la altura vendrá.',
      progressed: 'Las patadas ya vuelven solas a la guardia. Sigue con las formas y la flexibilidad.',
      after: 'Min-ji asiente: patada más limpia y mejor equilibrio. La flexibilidad tarda semanas.',
    },
    progressedAt: 2,
  },
  dance: {
    id: 'dance',
    name: 'Estudio de Baile Velaria',
    location: 'academy-dance',
    instructor: 'Lucía',
    hours: [10, 22],
    every: 30,
    grace: 5,
    fee: 5,
    pass: { classes: 10, price: 40 },
    capacity: 6,
    skill: 'Baile',
    lines: {
      intro: 'Primero el ritmo en los pies; los brazos vienen solos.',
      progressed: 'Ya cuentas sin mirar los pies. Toca soltar los brazos en la coreografía.',
      after: 'Lucía aplaude el final: vas más a tiempo y con más soltura. El ritmo se asienta practicando.',
    },
    progressedAt: 2,
  },
};

export function getAcademy(id: string): AcademyDef | undefined {
  return ACADEMIES[id as Discipline];
}
