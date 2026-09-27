/**
 * Actividades: cosas que llevan un rato de verdad y lo cobran en reloj.
 * Trabajar un turno, entrenar, comer fuera, estudiar, dormir: todas son una
 * duración, unos requisitos, un coste y un resultado. systems/Activities.ts
 * dice si se puede y qué pasa; quien la lanza adelanta el reloj con
 * TimeSystem.advanceMinutes(), así que el mundo entero sigue a esa hora
 * (personajes, locales, calle, metro, luz): todo sale del reloj.
 *
 * Los sitios sin mapa (OFF_MAP_PLACES) se visitan en tren y enseñan sus
 * actividades en un menú. Cuando un sitio tenga mapa, sus actividades se
 * podrán ofrecer en un punto de su interior sin tocarlas.
 */

export interface ActivityDef {
  id: string;
  name: string;
  /** Minutos de reloj que pasan. */
  minutes: number;
  requires?: {
    /** Energía mínima para empezar. */
    energy?: number;
    /** Sólo se empieza en esta franja [desde, hasta) en horas. */
    start?: readonly [number, number];
    /** Días en que se puede (0 lunes … 6 domingo). */
    days?: readonly number[];
  };
  /** Euros que cuesta hacerla. */
  cost?: number;
  /** Lo que gasta de la bolsa (cocinar gasta la compra). Sin ello en el inventario, no se puede. */
  consumes?: { item: string; qty?: number };
  /** Lo que cambia al acabar: dinero que se gana y energía (negativa si cansa). */
  effects: { money?: number; energy?: number };
  /** Lo que se cuenta al acabar. */
  lines: readonly string[];
}

export interface OffMapPlace {
  id: string;
  name: string;
  /** Lo que se ve al llegar. */
  arrival: string;
  activities: readonly string[];
}

export const ACTIVITIES: readonly ActivityDef[] = [
  {
    id: 'work-decathlon',
    name: 'Turno en Decathlon (6 h)',
    minutes: 6 * 60,
    requires: { energy: 30, start: [8, 16], days: [0, 1, 2, 3, 4, 5] },
    effects: { money: 54, energy: -35 },
    lines: [
      'Seis horas entre cajas de zapatillas, la sección de montaña y gente que pregunta por una talla que no existe.',
      'Al acabar el turno te pagan €54. Los pies no opinan lo mismo.',
    ],
  },
  {
    id: 'browse-decathlon',
    name: 'Dar una vuelta por la tienda (40 min)',
    minutes: 40,
    effects: { energy: -2 },
    lines: ['Pruebas una bici estática, una tienda de campaña y una pelota que no pensabas comprar. No compras nada.'],
  },
];

/**
 * Segunda tanda: lo que se hace dentro de los sitios del barrio (spots en
 * data/locations.ts y data/interiors.ts). Dormir y cocinar en casa; comer en
 * Casa Tomás.
 */
export const PLACE_ACTIVITIES: readonly ActivityDef[] = [
  {
    id: 'sleep',
    name: 'Dormir (8 h)',
    minutes: 8 * 60,
    effects: { energy: 70 },
    lines: ['Te metes en la cama y el mundo sigue sin ti un rato.', 'Te despiertas con la marca de la almohada en la cara.'],
  },
  {
    id: 'nap',
    name: 'Echar una siesta (1 h)',
    minutes: 60,
    effects: { energy: 14 },
    lines: ['Cierras los ojos «cinco minutos». Es una hora.'],
  },
  {
    id: 'cook',
    name: 'Cocinar algo decente (45 min)',
    minutes: 45,
    consumes: { item: 'groceries' },
    effects: { energy: 30 },
    lines: ['Arroz, un huevo, verdura salteada. No es un restaurante, pero es tuyo y es caliente.', 'Te sobra para mañana. No te sobrará.'],
  },
  {
    id: 'restaurant-lunch',
    name: 'Menú del día (1 h)',
    minutes: 60,
    requires: { start: [13, 16] },
    cost: 11,
    effects: { energy: 32 },
    lines: ['Lentejas, merluza, flan. Pan y vino o gaseosa.', 'El camarero se sabe el pedido antes de que lo digas.'],
  },
  {
    id: 'restaurant-dinner',
    name: 'Cenar a la carta (1 h 30 min)',
    minutes: 90,
    requires: { start: [20, 23] },
    cost: 22,
    effects: { energy: 36 },
    lines: ['Croquetas, pulpo y una tarta de queso que no sabías que necesitabas.'],
  },
];

export const OFF_MAP_PLACES: readonly OffMapPlace[] = [
  {
    id: 'decathlon',
    name: 'Decathlon · Polígono Norte',
    arrival: 'Una nave enorme junto a la autovía. Dentro huele a neumático nuevo.',
    activities: ['work-decathlon', 'browse-decathlon'],
  },
];

const BY_ID = new Map([...ACTIVITIES, ...PLACE_ACTIVITIES].map((a) => [a.id, a]));

export function getActivity(id: string): ActivityDef {
  const a = BY_ID.get(id);
  if (!a) throw new Error(`Actividad desconocida: ${id}`);
  return a;
}

export function getOffMapPlace(id: string): OffMapPlace {
  const place = OFF_MAP_PLACES.find((p) => p.id === id);
  if (!place) throw new Error(`Sitio sin mapa desconocido: ${id}`);
  for (const a of place.activities) getActivity(a);
  return place;
}
