/**
 * Oficios del personal. Un camarero es un camarero en el café, en el
 * restaurante y en la terraza: mismo uniforme por defecto, misma frase y la
 * misma forma de trabajar. Cada local sólo dice qué oficio pone, dónde y
 * cuándo (data/population.ts dentro, data/streets.ts en la terraza); con `npc`,
 * el puesto lo ocupa un personaje con nombre.
 *
 * Tres formas de trabajar, sin IA:
 * - post: se queda en su puesto (caja, barra, cabina, puerta).
 * - rounds: va de uno a otro de sus puntos (reponer, sala del gimnasio).
 * - serve: va junto a un cliente sentado, le atiende un momento y vuelve.
 *
 * La vigilancia del metro (Marco, Iker, Rocío) tiene su propia máquina de
 * estados en systems/SecurityAI.ts: patrulla un andén, no un local.
 */
export type ServiceActivity = 'post' | 'rounds' | 'serve';

/**
 * Lo que ofrece alguien del personal cuando se le habla: un servicio de aspecto
 * (la barbera corta el pelo) o unas actividades con su precio y su rato (la
 * barra sirve copas). Es el paso Servicio → Interacción: el local pone al
 * oficio, el oficio lo que ofrece, y la oferta lleva a una transacción
 * (systems/Appearance.ts, systems/Activities.ts) que cambia el estado.
 */
export type ServiceOffer =
  | { kind: 'appearance'; slot: import('./appearance.ts').AppearanceSlot; title: string; greeting: string; minutes: number }
  | { kind: 'activities'; title: string; activities: readonly string[] }
  /** Una tienda de ropa (data/retail.ts): su género y sus precios, cobrados por systems/Retail.ts. */
  | { kind: 'retail'; store: string; minutes: number };

export const SERVICE_OFFERS = {
  haircut: { kind: 'appearance', slot: 'hair', title: 'Barbería Nati · corte', greeting: 'Siéntate. ¿Cómo lo quieres?', minutes: 30 },
  // Lo que dura cada tatuaje va en su diseño (data/tattoos.ts); `minutes` es la consulta.
  tattoo: { kind: 'appearance', slot: 'tattoos', title: 'Tinta Carmen · tatuaje', greeting: '¿Dónde lo quieres? Primero la zona, luego el diseño.', minutes: 10 },
  'shop-hilo': { kind: 'retail', store: 'hilo', minutes: 10 },
  'shop-retales': { kind: 'retail', store: 'retales', minutes: 15 },
  'shop-archivo': { kind: 'retail', store: 'archivo', minutes: 10 },
  'shop-vuelta': { kind: 'retail', store: 'vuelta', minutes: 20 },
  'shop-suela': { kind: 'retail', store: 'suela', minutes: 10 },
  'club-bar': { kind: 'activities', title: 'Barra · Sala Órbita', activities: ['club-drink', 'club-water'] },
  'wine-bar': { kind: 'activities', title: 'Barra · La Cepa', activities: ['wine-glass', 'wine-board'] },
  'bar-ribera': { kind: 'activities', title: 'Barra · Bar Ribera', activities: ['bar-cana', 'bar-tinto', 'bar-refresco'] },
} as const satisfies Record<string, ServiceOffer>;

export type OfferId = keyof typeof SERVICE_OFFERS;

export function getOffer(id: OfferId): ServiceOffer {
  return SERVICE_OFFERS[id];
}

export interface ServiceRole {
  label: string;
  line: string;
  /** Uniforme por defecto: id en UNIFORM_LOOKS (data/npcs.ts). Un local puede poner el suyo. */
  uniform: string;
  activity: ServiceActivity;
  /** Lo que ofrece si se le habla; un local puede poner otra cosa (StaffRole.offers). */
  offers?: OfferId;
}

export const SERVICE_ROLES = {
  waiter: { label: 'Camarero', line: 'Enseguida te atiendo.', uniform: 'uniforme-sala', activity: 'serve' },
  bartender: { label: 'Barra', line: '¿Qué te pongo?', uniform: 'uniforme-noche', activity: 'post' },
  // Quien lleva una barra con clientes de pie y en taburete: va y viene entre sus puntos de servicio (tirador, estantería, caja) y se vuelve a quien le toca (systems/Crowd.serveDrink).
  barkeeper: { label: 'Barra', line: '¿Qué te pongo?', uniform: 'uniforme-noche', activity: 'rounds' },
  cashier: { label: 'Caja', line: '¿Lo pagas con tarjeta?', uniform: 'uniforme-tienda', activity: 'post' },
  security: { label: 'Seguridad', line: 'Dentro, tranquilidad. Fuera, lo que quieras.', uniform: 'uniforme-noche', activity: 'post' },
  'gym-staff': { label: 'Personal del gimnasio', line: 'Si usas la cinta, límpiala después.', uniform: 'uniforme-gym', activity: 'rounds' },
  'shop-worker': { label: 'Personal de tienda', line: 'Si buscas algo, dímelo.', uniform: 'uniforme-tienda', activity: 'rounds' },
  cook: { label: 'Cocina', line: 'Sale en cinco minutos.', uniform: 'uniforme-sala', activity: 'post' },
  receptionist: { label: 'Recepción', line: '¿Tienes cita?', uniform: 'uniforme-tienda', activity: 'post' },
  dj: { label: 'DJ', line: '(Señala los cascos y sonríe. No te oye.)', uniform: 'dj', activity: 'post' },
  barber: { label: 'Barbería', line: 'Si tienes prisa, vuelve mañana.', uniform: 'uniforme-barbero', activity: 'serve', offers: 'haircut' },
  'tattoo-artist': { label: 'Tatuador', line: 'Si te tiembla el pulso, a mí no.', uniform: 'uniforme-tatuaje', activity: 'serve', offers: 'tattoo' },
} as const satisfies Record<string, ServiceRole>;

export type ServiceId = keyof typeof SERVICE_ROLES;

export function serviceRole(id: ServiceId): ServiceRole {
  return SERVICE_ROLES[id];
}
