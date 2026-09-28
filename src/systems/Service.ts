// Sin Phaser: lo usan Crowd (dentro), StreetLife (terrazas) y CrowdView.
import { SERVICE_ROLES, type OfferId, type ServiceActivity, type ServiceId } from '../data/services.ts';
import type { LocationDef, TilePoint } from '../types/game.ts';
import { isWalkable } from './LocationSystem.ts';

/**
 * Lo común a todo el personal, esté donde esté: quién es (oficio, uniforme,
 * frase) y, si sirve mesas, a quién atiende ahora y dónde se pone. Crowd y
 * StreetLife mueven a su gente cada uno a su manera; la decisión es la misma.
 */

/** Lo que un local dice de un puesto; lo que falta lo pone el oficio. */
export interface Post {
  service: ServiceId;
  label?: string;
  line?: string;
  look?: string;
  offers?: OfferId;
}

export interface StaffIdentity {
  label: string;
  line: string;
  /** Id en UNIFORM_LOOKS. */
  look: string;
  activity: ServiceActivity;
  /** Lo que ofrece si el jugador le habla (data/services.ts): el del puesto o, si no, el del oficio. */
  offers?: OfferId;
}

export function identity(post: Post): StaffIdentity {
  const role = SERVICE_ROLES[post.service];
  const offers: OfferId | undefined = post.offers ?? ('offers' in role ? role.offers : undefined);
  return { label: post.label ?? role.label, line: post.line ?? role.line, look: post.look ?? role.uniform, activity: role.activity, offers };
}

/** Un cliente sentado al que se puede atender. */
export interface Seated {
  id: number;
  x: number;
  y: number;
}

/** Tiempo (ms) que pasa antes de volver a la misma mesa: nadie atiende dos veces seguidas al mismo. */
const RESERVE_MS = 25_000;

/**
 * A quién atiende: al que lleva más rato sin que nadie pase por su mesa. `served`
 * es la memoria compartida del local (cliente → ms en que se le atendió).
 */
export function nextCustomer(customers: readonly Seated[], served: Map<number, number>, now: number): Seated | undefined {
  let best: Seated | undefined;
  let bestAt = Infinity;
  for (const c of customers) {
    const at = served.get(c.id) ?? -Infinity;
    if (now - at < RESERVE_MS) continue;
    if (at < bestAt) {
      best = c;
      bestAt = at;
    }
  }
  return best;
}

/** Un tile libre y pisable junto al cliente, para quedarse de pie a su lado. */
export function besideTile(loc: LocationDef, at: TilePoint, taken: ReadonlySet<string>): TilePoint | undefined {
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
    const tile = { tx: at.tx + dx, ty: at.ty + dy };
    if (isWalkable(loc, tile.tx, tile.ty) && !taken.has(`${tile.tx},${tile.ty}`)) return tile;
  }
  return undefined;
}
