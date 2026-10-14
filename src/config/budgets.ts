import type { QualityLevel } from './quality.ts';

/**
 * Presupuestos de rendimiento por calidad (config/quality.ts): lo que el sitio cargado puede tener a la vez.
 * Medidos en Chrome de escritorio (high) y con la calidad baja como referencia de un móvil modesto.
 * Sin imports de valor: los scripts de node lo cargan tal cual.
 *
 *   agents     gente simulada en el sitio (calle + local + andén); la calle ya se recorta sola si el frame pasa
 *              de 22 ms (systems/StreetLife.crowdBudget) y nunca baja del 55 %
 *   near       de ésos, los que se simulan enteros (a menos de 30 tiles del jugador); el resto, a pasos gruesos
 *   vehicles   coches y bicis en sus carriles
 *   particles  partículas de ambiente vivas (world/Atmosphere: hojas, papeles, vapor)
 *   tweens     animaciones en marcha (props animados, puertas, luces)
 *   objects    objetos en la escena de Phaser (todo lo que se pinta o puede pintarse)
 *
 * Fuera del sitio cargado no hay nada: los demás barrios son estado lógico calculado del reloj (systems/World.ts).
 * `lifesim.perf()` compara lo de ahora con esto; scripts/check-world-integration.ts, los picos de diseño.
 */
export interface Budget {
  agents: number;
  near: number;
  vehicles: number;
  particles: number;
  tweens: number;
  objects: number;
}

export const BUDGETS: Readonly<Record<QualityLevel, Budget>> = {
  high: { agents: 110, near: 80, vehicles: 24, particles: 64, tweens: 160, objects: 4200 },
  medium: { agents: 95, near: 70, vehicles: 20, particles: 48, tweens: 140, objects: 4000 },
  low: { agents: 75, near: 55, vehicles: 16, particles: 0, tweens: 120, objects: 3600 },
};
