// Sin Phaser: lo usan StreetEvents, AlleyDeals, Pickpocket, el gancho de consola de main.ts y scripts/check-event-lifecycle.ts.
import type { TilePoint } from '../types/game.ts';

/**
 * El ciclo de vida común de los sucesos del mundo (peleas de patio, trapicheo
 * en callejones, carteristas del metro). No es otro gestor de eventos: cada
 * sistema sigue llevando lo suyo a su manera (las peleas y el trapicheo salen
 * del reloj con semilla; el carterista es una máquina de estados) y aquí sólo
 * se nombra en qué punto está cada uno con las mismas palabras:
 *
 *   ELIGIBLE → SPAWNING → ACTIVE → RESOLUTION → CLEANUP → COOLDOWN → ELIGIBLE
 *
 * SPAWNING: llegan los participantes. ACTIVE: pasa. RESOLUTION: hay reacción
 * (un vigilante acude, el vigía avisa, el jugador mira). CLEANUP: ya está
 * decidido y la gente se va (sus papeles temporales desaparecen al salir).
 * COOLDOWN: no vuelve a pasar en ese sitio hasta `cooldownLeft`.
 */
export type Lifecycle = 'ELIGIBLE' | 'SPAWNING' | 'ACTIVE' | 'RESOLUTION' | 'CLEANUP' | 'COOLDOWN';

export type WorldEventType = 'fight' | 'alley' | 'pickpocket';

export interface EventParticipant {
  id: string;
  role: string;
}

export interface EventInfo {
  /** Único y estable: tipo:sitio (un suceso por sitio a la vez, nunca dos en el mismo ancla). */
  id: string;
  type: WorldEventType;
  location: string;
  anchor: TilePoint | null;
  lifecycle: Lifecycle;
  /** La fase con el nombre interno del sistema. */
  phase: string;
  /** Edad del suceso en curso y lo que le queda como mucho (minutos de juego o segundos, ver `unit`), o null sin suceso. */
  age: number | null;
  maxLeft: number | null;
  unit: 'min' | 's';
  participants: EventParticipant[];
  /** Quien acude (vigilantes): se suelta al acabar. */
  responders: string[];
  /** Cuánto falta para que vuelva a poder pasar (0: ya puede). */
  cooldownLeft: number;
  forced: boolean;
}

export const eventId = (type: WorldEventType, site: string): string => `${type}:${site}`;
