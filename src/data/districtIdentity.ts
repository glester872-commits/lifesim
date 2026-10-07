/**
 * La identidad de comportamiento de cada barrio (el distrito de la ciudad, no la zona del mapa). Complementa a:
 *   data/districts.ts → cómo se ve y qué ropa lleva la gente (perfil visual por zona)
 *   data/zones.ts     → cuánta vida y de qué tipo tiene cada trozo del mapa
 * Esto es lo que hace que un barrio entero se comporte como él mismo: sus horas fuertes, a qué se dedica su gente,
 * cuánto tráfico y cuántas bicis lleva, cuánta vigilancia, cuántos sucesos. Un barrio nuevo es una entrada más
 * aquí y su `districtId` en las zonas: ningún sistema pregunta por nombres de barrio.
 *
 * Quien lee cada campo:
 *   density    → systems/Zones.zoneActivity (afluencia por hora y día, a todas las zonas del barrio)
 *   groups     → systems/Zones.zonePull (a qué viajes tira el barrio: ocio nocturno, compras, deporte…)
 *   events     → systems/Zones.zoneEventChance (sucesos de calle)
 *   traffic    → systems/Districts.withDistrictLanes (coches, bicis y repartos por carril)
 *   scooters   → systems/Districts.withDistrictLanes (patinetes eléctricos: 0 no hay ninguno; sólo sale donde todo el carril lo permite)
 *   security   → systems/MetroDaily.securityFor (rondas del vigilante de sus estaciones; siempre hay uno)
 *   ambience   → world/Atmosphere (efectos de ambiente: hojas, papeles, vapor)
 *
 * Nada de esto toca a la gente por su origen: no hay campos de procedencia, renta ni delito.
 */

export type RoleGroup = 'nightlife' | 'retail' | 'leisure' | 'sport' | 'commute' | 'social' | 'food' | 'tourism' | 'family';

/** Franjas [desde, hasta, factor] sobre la afluencia de las zonas del barrio (1 = la de la zona). */
export type DensityBands = readonly (readonly [number, number, number])[];

export interface DistrictIdentity {
  name: string;
  /** Qué es, en una línea (inspector y documentación). */
  tagline: string;
  density: { bands: DensityBands; rest: number; weekend: number };
  /** Cuánto tira el barrio de cada tipo de viaje (sin entrada, 1). */
  groups: Readonly<Partial<Record<RoleGroup, number>>>;
  /** Tráfico relativo (1 = el del carril tal cual): coches, bicis y repartos. */
  traffic: { vehicles: number; bikes: number; deliveries: number };
  /** Patinetes eléctricos (data/bikes.ts 'scooter'): 0 = ninguno en el barrio; >0, cuánto pesan frente a otras bicis. */
  scooters: number;
  /** Presencia de vigilancia: >1 más rondas, <1 más fijo en su puesto. Siempre hay vigilante donde hay puesto. */
  security: number;
  /** Peso de los sucesos de calle (peleas, pop-ups, trapicheos): 1 = lo normal. */
  events: number;
  /** Volumen de los efectos de ambiente (hojas, papeles, vapor): 1 = lo normal. */
  ambience: number;
}

/** De qué tipo es cada viaje de la gente (TripRule.role en data/streets.ts): por prefijo o nombre, el primero que cuadra. */
export const ROLE_GROUPS: readonly (readonly [RegExp, RoleGroup])[] = [
  [/^(club|bar-night|bar-smoke|rincon-night|rincon-smoke|rincon-vermut|night|carmen-prenight|gamer|popup-dj)/, 'nightlife'],
  [/^(carmen-(browse|outfit|hang|wait)|window-shopper|shopper|late-shop|sneaker|tattoo|piercing|popup-(market|art|queue)|kiosk|errands|bakery)/, 'retail'],
  [/^(hoops|calisthenics|cali-|court-|gym|jogger|skate)/, 'sport'],
  [/^(commuter|metro-arrival|office|bus|returning|passer)/, 'commute'],
  [/^(terrace|brunch|coffee|diner|bar-terrace|rincon-breakfast|ice-cream)/, 'food'],
  [/^(tourist)/, 'tourism'],
  [/^(plaza-(family|elders|couple|rest)|park-elders|park-gathering)/, 'family'],
  [/^(river|riverside|couple-walk|park|plaza|stroller|dog-walker|reader|carmen-(couple|friends|bench)|metro-meet)/, 'leisure'],
];

export const roleGroupOf = (role: string): RoleGroup | undefined => ROLE_GROUPS.find(([re]) => re.test(role))?.[1];

/** Un barrio sin perfil se comporta como la ciudad sin más: todo a 1. */
export const NEUTRAL_IDENTITY: DistrictIdentity = {
  name: 'Ciudad', tagline: 'sin carácter propio',
  density: { bands: [], rest: 1, weekend: 1 }, groups: {}, traffic: { vehicles: 1, bikes: 1, deliveries: 1 }, scooters: 0, security: 1, events: 1, ambience: 1,
};

export const DISTRICT_IDENTITIES: Readonly<Record<string, DistrictIdentity>> = {
  // ------------------------------------------------------------------ los que tienen mapa
  vallesco: {
    name: 'Barrio Vallesco', tagline: 'vida local equilibrada: vecinos, trabajo y rutinas de barrio',
    density: { bands: [[7, 9.5, 1.1], [9.5, 17, 1], [17, 21, 1.05], [21, 24, 0.9]], rest: 0.95, weekend: 1 },
    groups: { commute: 1.05, food: 1.15, family: 1.1, retail: 0.95, nightlife: 0.85 },
    traffic: { vehicles: 1, bikes: 1, deliveries: 1 },
    scooters: 0, // Barrio Vallesco: sin patinetes eléctricos
    security: 1, events: 1, ambience: 1,
  },
  // La Calle del Carmen: moda, tatuajes, discos y zapatillas; gente joven de tiendas y de ocio.
  vintage: {
    name: 'Calle Vintage', tagline: 'moda, tatuajes y creativos: gente joven mirando escaparates',
    density: { bands: [[10, 13, 0.9], [13, 17, 1.05], [17, 22, 1.3], [22, 24, 1.1]], rest: 0.6, weekend: 1.25 },
    groups: { retail: 1.4, nightlife: 1.15, leisure: 1.1, commute: 0.5, family: 0.6, food: 1.1 },
    traffic: { vehicles: 0.5, bikes: 1.4, deliveries: 0.8 },
    scooters: 0, // está dentro del mapa de Vallesco: tampoco
    security: 0.8, events: 1.3, ambience: 1.2,
  },
  // Ribera Norte: agua, terrazas, pista y bar; lo mejor es la tarde-noche.
  ribera: {
    name: 'Ribera Norte', tagline: 'ocio, deporte y bar junto al agua: se anima al atardecer',
    density: { bands: [[7, 10, 0.9], [10, 16, 0.8], [16, 19, 1.2], [19, 23, 1.45], [23, 24, 0.7]], rest: 0.5, weekend: 1.3 },
    groups: { sport: 1.4, leisure: 1.4, social: 1.3, food: 1.2, nightlife: 1.1, commute: 0.6, retail: 0.7 },
    traffic: { vehicles: 0.3, bikes: 1.5, deliveries: 0.5 },
    scooters: 1, // Ribera Norte: ocio junto al agua, carril bici propio
    security: 0.9, events: 1.1, ambience: 1.1,
  },
  // ------------------------------------------------- futuros: perfiles listos, sin mapa todavía
  velaria: {
    name: 'Velaria', tagline: 'premium, tranquilo y de negocios',
    density: { bands: [[7, 10, 1.2], [10, 18, 1], [18, 22, 0.8], [22, 24, 0.4]], rest: 0.3, weekend: 0.7 },
    groups: { commute: 1.4, food: 1.2, retail: 1.2, nightlife: 0.5, family: 0.8, sport: 1.1 },
    traffic: { vehicles: 0.9, bikes: 0.8, deliveries: 1.2 },
    scooters: 0.4,
    security: 1.5, events: 0.5, ambience: 0.6,
  },
  'puerta-central': {
    name: 'Puerta Central', tagline: 'mucha gente: turismo, compras y transporte',
    density: { bands: [[7, 10, 1.4], [10, 21, 1.6], [21, 24, 1.2]], rest: 0.7, weekend: 1.3 },
    groups: { tourism: 1.8, retail: 1.5, commute: 1.5, food: 1.3, nightlife: 1.1, family: 0.9 },
    traffic: { vehicles: 1.3, bikes: 1, deliveries: 1.5 },
    scooters: 1.5,
    security: 1.4, events: 1.2, ambience: 1.4,
  },
  'cuatro-rios': {
    name: 'Cuatro Ríos', tagline: 'flujo urbano denso y cotidiano, de muchos orígenes y oficios',
    density: { bands: [[6.5, 9.5, 1.4], [9.5, 17, 1.1], [17, 21, 1.3], [21, 24, 0.8]], rest: 0.6, weekend: 1.1 },
    groups: { commute: 1.4, food: 1.3, retail: 1.2, family: 1.3, social: 1.2, nightlife: 0.9 },
    traffic: { vehicles: 1.2, bikes: 1.1, deliveries: 1.4 },
    scooters: 1,
    security: 1, events: 1, ambience: 1.2,
  },
  arena: {
    name: 'Arena', tagline: 'días de partido y de evento',
    density: { bands: [[10, 16, 0.7], [16, 23, 1.6], [23, 24, 0.9]], rest: 0.4, weekend: 1.8 },
    groups: { social: 1.6, food: 1.4, sport: 1.5, nightlife: 1.2, commute: 0.8 },
    traffic: { vehicles: 1.2, bikes: 0.9, deliveries: 1 },
    scooters: 1.2,
    security: 1.6, events: 2, ambience: 1.5,
  },
  luna: {
    name: 'Luna', tagline: 'el barrio de la noche',
    density: { bands: [[8, 17, 0.35], [17, 21, 0.9], [21, 24, 1.8], [0, 6, 1.9]], rest: 0.5, weekend: 1.5 },
    groups: { nightlife: 2, social: 1.4, food: 1.2, retail: 0.6, commute: 0.5, family: 0.3 },
    traffic: { vehicles: 0.9, bikes: 0.8, deliveries: 1.3 },
    scooters: 1.2,
    security: 1.3, events: 1.5, ambience: 1.4,
  },
};

/** El barrio de cada sitio del juego (LocationDef.id): las calles y las estaciones que hay en él. */
export const LOCATION_DISTRICT: Readonly<Record<string, string>> = {
  district: 'vallesco',
  'vallesco-station': 'vallesco',
  ribera: 'ribera',
  'ribera-station': 'ribera',
};
