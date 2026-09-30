import type { DistrictId } from './districts.ts';

/**
 * Zonas lógicas del mapa: el mismo mapa continuo, pero cada trozo se comporta
 * como un sitio distinto de la ciudad. Sin muros, sin cargas: sólo datos que
 * los sistemas consultan con systems/Zones.zoneAt().
 *
 * No sustituye a data/districts.ts: aquel decide cómo se ve el suelo y la luz
 * (`LocationDef.zones`); esto decide cuánta vida hay y de qué tipo. Cada zona
 * apunta a su perfil visual con `ambience`.
 *
 * Quien lee cada campo:
 *   rects, population, activity, hours  → systems/StreetLife (a dónde va la gente)
 *   todo                                → world/ZoneDebugView (modo depuración, F3 en desarrollo)
 *   traffic, events                     → de momento sólo se consultan (zoneEventChance, depuración)
 *
 * Un barrio nuevo (Calle Vintage, centro, zona de oficinas) es otra lista con
 * su `location`: nada de código por zona.
 */

export type ZoneType =
  | 'residential'
  | 'plaza'
  | 'park'
  | 'main_road'
  | 'commercial'
  | 'metro'
  | 'nightlife'
  | 'restaurant_area'
  | 'gym_area'
  | 'special_event_area';

/** Rectángulo en tiles. Una zona con forma rara son varios. */
export interface ZoneRect {
  tx: number;
  ty: number;
  w: number;
  h: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  type: ZoneType;
  /** LocationDef.id donde está: 'district' es Barrio Vallesco. */
  location: string;
  /** Distrito de la ciudad al que pertenece (para barrios futuros: 'vallesco', 'centro'…). */
  districtId: string;
  rects: readonly ZoneRect[];
  /**
   * Quién hay: `label` para leerlo, `roles` multiplica los viajes (data/streets.ts,
   * TripRule.role) que acaban aquí. Sin entrada, 1.
   */
  population: { label: string; roles?: Readonly<Record<string, number>> };
  /**
   * Cuánta vida hay según la hora: [desde, hasta, factor] (1 = lo normal del
   * barrio; fuera de las bandas, `rest`). `weekend` multiplica sábado y domingo
   * (la madrugada cuenta como la noche anterior); `days` afina por día (lunes = 0).
   * `outdoor`: cuánto le afecta el mal tiempo (0 nada, 1 todo).
   * `variation`: cuánto cambia de un día a otro (±), para que no haya dos iguales.
   */
  activity: {
    bands: readonly (readonly [number, number, number])[];
    rest: number;
    weekend?: number;
    days?: Readonly<Partial<Record<number, number>>>;
    outdoor: number;
    variation: number;
  };
  /** Horas en las que la zona «funciona»; fuera, la actividad baja a un 20 %. Si cierra antes de abrir, pasa de medianoche. */
  hours?: readonly [number, number];
  /** Tráfico relativo al del barrio (1 = igual): coches, bicis, repartos. */
  traffic?: { vehicles: number; bikes: number; deliveries: number };
  /** Perfil visual y de ambiente (data/districts.ts). */
  ambience: DistrictId;
  /** Peso de cada evento de calle (data/streetEvents.ts, por id) en esta zona. */
  events?: Readonly<Record<string, number>>;
  tags?: readonly string[];
}

// Día de oficina: pico al ir y al volver, y a mediodía.
const COMMUTE: ZoneDef['activity']['bands'] = [[7, 9.5, 1.5], [9.5, 13, 0.9], [13, 15, 1.2], [15, 17.5, 0.9], [17.5, 20.5, 1.4], [20.5, 23, 0.8]];

// El orden importa: la última zona que contiene el tile manda (como data/districts.ts).
export const ZONES: readonly ZoneDef[] = [
  // Por defecto, todo el barrio es de vecinos: poca gente, portales.
  {
    id: 'vallesco-residencial', name: 'Calles residenciales', type: 'residential', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 0, ty: 0, w: 110, h: 56 }],
    population: { label: 'vecinos, gente que entra y sale de casa', roles: { returning: 1.3, 'dog-walker': 1.2, errands: 0.8 } },
    activity: { bands: [[7, 9, 1.1], [9, 13, 0.7], [13, 15, 0.8], [15, 19, 0.8], [19, 22, 1.1], [22, 24, 0.5]], rest: 0.25, weekend: 0.9, outdoor: 0.4, variation: 0.1 },
    ambience: 'residential',
  },
  {
    id: 'calle-mayor', name: 'Calle Mayor', type: 'commercial', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 0, ty: 16, w: 74, h: 3 }, { tx: 22, ty: 19, w: 3, h: 10 }],
    population: { label: 'compras, recados, escaparates', roles: { shopper: 1.3, errands: 1.2, 'window-shopper': 1.3, coffee: 1.1 } },
    activity: { bands: [[8, 10, 0.8], [10, 14, 1.3], [14, 17, 0.9], [17, 21, 1.4], [21, 23, 0.7]], rest: 0.2, weekend: 1.1, days: { 6: 0.6 }, outdoor: 0.5, variation: 0.12 },
    hours: [9, 22],
    traffic: { vehicles: 0.4, bikes: 0.6, deliveries: 1.5 },
    ambience: 'commercial',
    tags: ['shops'],
  },
  {
    id: 'avenida', name: 'Avenida de Vallesco', type: 'main_road', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 0, ty: 29, w: 110, h: 8 }],
    population: { label: 'mucha gente de paso, bus, bicis, repartos', roles: { commuter: 1.4, office: 1.2, bus: 1.3, passer: 1.3 } },
    activity: { bands: COMMUTE, rest: 0.35, weekend: 0.8, outdoor: 0.3, variation: 0.08 },
    traffic: { vehicles: 1, bikes: 1, deliveries: 1.3 },
    ambience: 'commercial',
  },
  {
    id: 'plaza-fuente', name: 'Plaza de la Fuente', type: 'plaza', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 30, ty: 6, w: 21, h: 10 }],
    population: { label: 'bancos, quiosco, charlas, niños y mayores', roles: { reader: 1.3, stroller: 1.2, 'metro-meet': 1.1 } },
    activity: { bands: [[8, 11, 0.9], [11, 14, 1.3], [14, 17, 0.8], [17, 21.5, 1.4], [21.5, 23.5, 0.7]], rest: 0.15, weekend: 1.3, outdoor: 0.9, variation: 0.15 },
    ambience: 'commercial',
    tags: ['outdoor', 'social'],
  },
  {
    id: 'gimnasio', name: 'Puerta del Gimnasio Forja', type: 'gym_area', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 36, ty: 5, w: 9, h: 2 }],
    population: { label: 'gente que entra a entrenar', roles: { gym: 1.2 } },
    activity: { bands: [[6.5, 9.5, 1.4], [9.5, 13, 0.7], [13, 15, 1], [15, 18, 0.8], [18, 22, 1.5]], rest: 0.1, weekend: 0.7, outdoor: 0.1, variation: 0.1 },
    hours: [6, 23],
    ambience: 'commercial',
  },
  {
    id: 'terraza-tomas', name: 'Terraza de Casa Tomás', type: 'restaurant_area', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 25, ty: 16, w: 10, h: 3 }],
    population: { label: 'comidas y cenas en terraza', roles: { diner: 1.3, 'terrace-meal': 1.3 } },
    activity: { bands: [[13, 16, 1.6], [16, 20.5, 0.6], [20.5, 23.5, 1.5]], rest: 0.1, weekend: 1.3, outdoor: 0.8, variation: 0.15 },
    hours: [12, 24],
    ambience: 'commercial',
  },
  {
    id: 'terraza-pausa', name: 'Terraza de la Pausa', type: 'restaurant_area', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 52, ty: 16, w: 10, h: 3 }],
    population: { label: 'cafés, desayunos, terraza', roles: { coffee: 1.3, terrace: 1.3, brunch: 1.2 } },
    activity: { bands: [[7.5, 11, 1.5], [11, 13, 0.9], [16, 19, 1.2]], rest: 0.4, weekend: 1.2, outdoor: 0.8, variation: 0.15 },
    hours: [7, 22],
    ambience: 'commercial',
  },
  {
    id: 'plazuela-metro', name: 'Plazuela del Metro', type: 'metro', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 22, ty: 37, w: 15, h: 9 }],
    population: { label: 'viajeros, esperas, oleadas de cada tren', roles: { 'metro-arrival': 1.3, 'metro-meet': 1.3, commuter: 1.3 } },
    activity: { bands: COMMUTE, rest: 0.3, weekend: 0.75, outdoor: 0.2, variation: 0.08 },
    hours: [6, 1.5],
    ambience: 'transit',
    tags: ['transit'],
  },
  {
    id: 'parque-olmo', name: 'Parque del Olmo', type: 'park', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 36, ty: 50, w: 38, h: 5 }],
    population: {
      label: 'paseantes, corredores, perros, gente sentada, parejas',
      roles: { jogger: 1.3, 'dog-walker': 1.3, 'park-talk': 1.2, 'park-stroll': 1.2, park: 1.2, reader: 1.1 },
    },
    activity: { bands: [[7, 9.5, 1.1], [9.5, 12, 0.8], [12, 16, 0.9], [16, 21, 1.5], [21, 23, 0.5]], rest: 0.1, weekend: 1.4, days: { 6: 1.2 }, outdoor: 1, variation: 0.18 },
    ambience: 'park',
    tags: ['outdoor', 'green'],
  },
  {
    id: 'calle-carmen', name: 'Calle del Carmen', type: 'commercial', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 74, ty: 37, w: 36, h: 14 }],
    population: {
      label: 'tiendas vintage, cafés, parejas y grupos',
      roles: { 'carmen-browse': 1.3, 'carmen-couple': 1.2, 'carmen-friends': 1.2, 'carmen-bench': 1.1, 'tattoo-client': 1.1 },
    },
    activity: { bands: [[10, 12, 0.7], [12, 14.5, 1.1], [14.5, 17, 0.8], [17, 21.5, 1.5], [21.5, 24, 0.9]], rest: 0.2, weekend: 1.4, days: { 0: 0.8 }, outdoor: 0.6, variation: 0.2 },
    hours: [10, 24],
    traffic: { vehicles: 0.2, bikes: 1.5, deliveries: 0.6 },
    ambience: 'vintage',
    tags: ['vintage', 'shops'],
  },
  // Noche: por la mañana casi nada, sube al anochecer, lo más alto de madrugada.
  {
    id: 'orbita', name: 'Puerta de la Sala Órbita', type: 'nightlife', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 10, ty: 16, w: 12, h: 3 }],
    population: { label: 'cola, fumadores, grupos que salen', roles: { 'club-queue': 1.4, 'club-goer': 1.3, 'club-smoke': 1.3, 'club-leaving': 1.2, 'night-walker': 1.2 } },
    activity: { bands: [[0, 6, 1.8], [6, 11, 0.1], [11, 19, 0.4], [19, 22, 0.8], [22, 24, 1.4]], rest: 0.4, days: { 3: 1.1, 4: 1.4, 5: 1.5 }, outdoor: 0.3, variation: 0.2 },
    hours: [21, 6],
    ambience: 'nightlife',
    tags: ['night'],
  },
  {
    id: 'la-cepa', name: 'La Cepa', type: 'nightlife', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 27, ty: 49, w: 9, h: 6 }],
    population: { label: 'copas tranquilas, citas', roles: { 'night-walker': 1.2 } },
    activity: { bands: [[0, 1.5, 1.1], [6, 17, 0.2], [17, 19, 0.7], [19, 24, 1.4]], rest: 0.3, days: { 4: 1.2, 5: 1.3 }, outdoor: 0.4, variation: 0.15 },
    hours: [18, 1],
    ambience: 'nightlife',
    tags: ['night', 'date'],
  },
  // El solar de las cajas, al norte, y el pasaje que lleva a él: vacío casi siempre.
  {
    id: 'solar-cajas', name: 'Solar de las cajas', type: 'special_event_area', location: 'district', districtId: 'vallesco',
    rects: [{ tx: 68, ty: 0, w: 18, h: 4 }, { tx: 74, ty: 4, w: 2, h: 12 }],
    population: { label: 'nadie de día; corros algunas noches' },
    activity: { bands: [[0, 4, 0.6], [22, 24, 0.5]], rest: 0.05, weekend: 1.5, outdoor: 0.8, variation: 0.3 },
    ambience: 'residential',
    events: { 'patio-mayor': 1 },
    tags: ['hidden', 'night'],
  },
];
