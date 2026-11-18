import type { PropKind } from '../types/game.ts';

/**
 * MET-05: luz y atmósfera de los andenes. Común a todos los de `platform()` (data/locations.ts): sale del trazado
 * PLATFORM_GROUND, no de una tabla por estación, y no se guarda en la partida.
 *
 * Luces: charcos de los tubos del techo sobre la fila de espera (fila 7), uno cada 4 tiles. La luz ocupa 2 tiles
 * desde `tx`, así que sus centros (5, 9, 13, 17) quedan simétricos en el andén (columnas 1–20). Esos `tx` en la fila 7 no pisan
 * ningún punto de espera, asiento, poste, NPC, ronda, spawn ni portal (scripts/check-metro-lighting.ts).
 */
const LIGHT_ROW = 7;
const LIGHT_TX = [4, 8, 12, 16] as const;

/** El prop de luz: invisible, `overhead` (ni colisiona ni hace sombra), con charco frío (world/tiles.ts). */
export const METRO_LIGHT_KIND: PropKind = 'metro-light';

/** El ambiente de interior del andén (QA-06: fijo, no sigue el ciclo del día). */
export const METRO_AMBIENT = '#dbe7f2';

/** Sombras discretas, en oscurecimiento (0–1): bajo el tren y el labio del andén sobre la vía. */
export const METRO_SHADOW = { train: 0.28, lip: 0.3 } as const;

/**
 * Bocas del túnel: oscurecimiento en escalón (proporcional, hacia el negro de fuera del mapa) de la columna de vía
 * del borde y de las dos siguientes.
 */
export const TUNNEL_CONTRAST: readonly [number, number, number] = [-0.35, -0.2, -0.1];

export interface StationLighting {
  stationId: string;
  kind: PropKind;
  lights: readonly { tx: number; ty: number }[];
  ambientColor: string;
  shadow: { train: number; lip: number };
  tunnelContrast: readonly [number, number, number];
}

export function stationLighting(stationId: string): StationLighting {
  return {
    stationId,
    kind: METRO_LIGHT_KIND,
    lights: LIGHT_TX.map((tx) => ({ tx, ty: LIGHT_ROW })),
    ambientColor: METRO_AMBIENT,
    shadow: { ...METRO_SHADOW },
    tunnelContrast: TUNNEL_CONTRAST,
  };
}
