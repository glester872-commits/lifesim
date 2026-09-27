/**
 * Animales de la calle. Sin imports de valor: scripts/check-wildlife.ts y la
 * simulación de calles lo cargan tal cual.
 *
 * Los perros no tienen datos propios: salen con quien los pasea (los viajes con
 * `dog` de data/streets.ts). Las palomas viven en sitios concretos (una plaza,
 * los bancos, junto a una terraza) y siguen el ritmo del día: pocas al
 * amanecer, más a mediodía y ninguna de noche (duermen en las cornisas).
 */

/** Pelajes de perro (world/AnimalArt.ts): marrón, negro, crema, con manchas. */
export const DOG_LOOKS = 4;

export interface PigeonSpot {
  /** Punto con nombre de la localización alrededor del que picotean. */
  point: string;
  /** Radio en tiles en el que se mueven y a donde vuelven. */
  radius: number;
  /** Cuántas hay a la hora de más movimiento. */
  count: number;
  /** Junto a comida (una terraza, el quiosco): más a la hora de comer y de cenar. */
  food?: boolean;
}

export const PIGEON_SPOTS: Readonly<Record<string, readonly PigeonSpot[]>> = {
  district: [
    { point: 'PLAZA_FOUNTAIN', radius: 3, count: 7 },
    { point: 'PLAZA_BENCH_01', radius: 2, count: 3 },
    { point: 'PLAZA_BENCH_04', radius: 2, count: 3 },
    { point: 'NEWS_KIOSK', radius: 1.8, count: 2, food: true },
    { point: 'CAFE_TERRACE_01', radius: 2.2, count: 4, food: true },
    { point: 'RESTAURANT_TERRACE_01', radius: 1.8, count: 2, food: true },
    { point: 'PARK_BENCH_02', radius: 2.5, count: 4 },
    { point: 'METRO_PLAZUELA_BENCH', radius: 2.2, count: 4 },
  ],
};

/** [desde, hasta, parte de la bandada que hay] por hora del día; fuera de las bandas, ninguna. */
export const PIGEON_HOURS: readonly (readonly [number, number, number])[] = [
  [6.5, 8, 0.35],
  [8, 11, 0.7],
  [11, 16, 1],
  [16, 19, 0.85],
  [19, 21, 0.45],
];

/** Donde hay comida, a la hora de comer y de cenar aún más. */
export const FOOD_HOURS: readonly (readonly [number, number])[] = [
  [13, 15.5],
  [20, 21],
];
