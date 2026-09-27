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

export interface ServiceRole {
  label: string;
  line: string;
  /** Uniforme por defecto: id en UNIFORM_LOOKS (data/npcs.ts). Un local puede poner el suyo. */
  uniform: string;
  activity: ServiceActivity;
}

export const SERVICE_ROLES = {
  waiter: { label: 'Camarero', line: 'Enseguida te atiendo.', uniform: 'uniforme-sala', activity: 'serve' },
  bartender: { label: 'Barra', line: '¿Qué te pongo?', uniform: 'uniforme-noche', activity: 'post' },
  cashier: { label: 'Caja', line: '¿Lo pagas con tarjeta?', uniform: 'uniforme-tienda', activity: 'post' },
  security: { label: 'Seguridad', line: 'Dentro, tranquilidad. Fuera, lo que quieras.', uniform: 'uniforme-noche', activity: 'post' },
  'gym-staff': { label: 'Personal del gimnasio', line: 'Si usas la cinta, límpiala después.', uniform: 'uniforme-gym', activity: 'rounds' },
  'shop-worker': { label: 'Personal de tienda', line: 'Si buscas algo, dímelo.', uniform: 'uniforme-tienda', activity: 'rounds' },
  cook: { label: 'Cocina', line: 'Sale en cinco minutos.', uniform: 'uniforme-sala', activity: 'post' },
  receptionist: { label: 'Recepción', line: '¿Tienes cita?', uniform: 'uniforme-tienda', activity: 'post' },
  dj: { label: 'DJ', line: '(Señala los cascos y sonríe. No te oye.)', uniform: 'dj', activity: 'post' },
} as const satisfies Record<string, ServiceRole>;

export type ServiceId = keyof typeof SERVICE_ROLES;

export function serviceRole(id: ServiceId): ServiceRole {
  return SERVICE_ROLES[id];
}
