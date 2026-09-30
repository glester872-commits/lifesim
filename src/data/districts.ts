import type { PropKind } from '../types/game.ts';
import type { TrafficBand } from './vehicles.ts';

/**
 * Identidad visual por zona (design/DISTRICTS.md). Una sola dirección de arte
 * (PALETTE, ART_BIBLE) y, encima, variación controlada: cada perfil sólo
 * empuja unos pocos por ciento el color de su suelo y de su luz, elige su kit
 * de calle y su gente. Nada de otra paleta: un barrio nuevo es otra mezcla de
 * lo mismo, no otro juego.
 *
 * Quien lee cada campo:
 *   wash, grade, lamp  → world/LocationBuilder (suelo) y world/Lighting (luz de la hora)
 *   kit                → systems/Dressing (micromobiliario por zona)
 *   crowd              → systems/StreetLife (qué ropa lleva la gente que va allí)
 *   vehicles           → systems/Traffic (qué pasa por el carril que la cruza)
 *   facades            → scripts/check-districts (qué edificios caben en la zona)
 */

export type DistrictId = 'residential' | 'commercial' | 'vintage' | 'nightlife' | 'park' | 'transit';

/** Estilo de ropa de la gente anónima (NpcLook.style). Sin estilo, 'everyday'. */
export type LookStyle = 'everyday' | 'smart' | 'street' | 'sport';

/** Las cuatro horas del guion de color: la zona se reconoce a cualquier hora. */
export type Phase = 'morning' | 'day' | 'sunset' | 'night';

export interface DistrictProfile {
  /**
   * Velo del suelo (#rrggbb, α): tiñe pavimento y calzada al hornearlos, por
   * debajo de edificios, props y gente. α ≤ 0,08: se nota al cruzar, no se lee como otro material.
   */
  wash: readonly [string, number];
  /**
   * Guion de color: multiplica la luz del cielo sobre la zona en cada fase. Casi
   * blanco de día (el granito sigue siendo granito); más marcado de noche.
   */
  grade: Readonly<Record<Phase, string>>;
  /** Luz de farola y escaparate de la zona: temperatura y fuerza (1 = la de siempre). */
  lamp: readonly [string, number];
  /**
   * Micromobiliario propio: `on` 'facade' lo arrima a las fachadas (carteles,
   * bicis); 'open', al suelo libre (arbustos en la hierba). `every`: una pieza
   * cada tantos tiles candidatos, de media. `max`: tope por zona.
   */
  kit?: { props: readonly PropKind[]; on: 'facade' | 'open'; every: number; max: number };
  /** Peso de cada estilo de ropa entre quienes van a la zona. */
  crowd: Readonly<Partial<Record<LookStyle, number>>>;
  /** Multiplicadores del tráfico que cruza la zona (id → factor), por franja; `all` vale siempre. */
  vehicles?: Readonly<Partial<Record<TrafficBand | 'all', Readonly<Record<string, number>>>>>;
  /** Estilos de edificio (BuildingDef.style) que caben en la zona; con '*' al final, prefijo ('res-*'). */
  facades: readonly string[];
  /** Cuánto se nota cada efecto de ambiente en la zona (world/Atmosphere.ts): 1 = lo normal, 0 = nada. */
  ambience?: Readonly<Partial<Record<AmbientFx, number>>>;
}

/** Efectos de ambiente que una zona puede subir o bajar. */
export type AmbientFx = 'leaf' | 'paper' | 'steam' | 'glint';

export const DISTRICTS: Readonly<Record<DistrictId, DistrictProfile>> = {
  // Calma: color apagado, luz de casa, poco rótulo; lo que hay en la acera es de vecinos.
  residential: {
    wash: ['#a89a88', 0.05],
    grade: { morning: '#fff4ea', day: '#fcfaf6', sunset: '#fff0e2', night: '#f2f0fa' },
    lamp: ['#ffcf8f', 0.85],
    kit: { props: ['planter', 'bike'], on: 'facade', every: 14, max: 8 },
    crowd: { everyday: 4, smart: 1, sport: 1.2, street: 0.4 },
    vehicles: { all: { van: 1.2, bus: 0.6 } },
    facades: ['home', 'res-*', 'civic', 'wine', 'backdrop'],
    ambience: { leaf: 1, paper: 0.4, steam: 0.8 },
  },
  // Calle Mayor y avenida: el granito de siempre, gente de recados y de oficina.
  commercial: {
    wash: ['#b8ae9c', 0.04],
    grade: { morning: '#fff6ec', day: '#ffffff', sunset: '#ffeedc', night: '#fbf4ea' },
    lamp: ['#ffc98a', 1],
    kit: { props: ['bin', 'planter'], on: 'facade', every: 18, max: 6 },
    crowd: { everyday: 3, smart: 2.5, street: 0.8, sport: 0.5 },
    vehicles: { all: { 'delivery-truck': 1.2 }, night: { taxi: 1.3 } },
    facades: ['res-*', 'gym', 'cafe', 'fashion', 'super', 'restaurant', 'office', 'hair', 'pharmacy', 'bank', 'fruit', 'hardware', 'study', 'laundry', 'club', 'backdrop'],
    ambience: { leaf: 0.6, paper: 1, steam: 1.2 },
  },
  // Calle del Carmen: ladrillo más rojo y cálido, carteles, bicis; la gente que más se viste para salir a la calle.
  vintage: {
    wash: ['#a4664e', 0.06],
    grade: { morning: '#fff0e6', day: '#fff9f2', sunset: '#ffe4d0', night: '#fbece6' },
    lamp: ['#ffb870', 1.05],
    kit: { props: ['poster', 'bike', 'poster', 'bike-rack'], on: 'facade', every: 2, max: 12 },
    crowd: { street: 5, everyday: 1.5, smart: 0.6, sport: 0.3 },
    vehicles: { all: { casual: 1.6, rental: 1.4, commuter: 0.7 } },
    facades: ['res-*', 'tattoo', 'vintage', 'coffee', 'records', 'streetwear', 'thrift', 'print'],
    ambience: { leaf: 1.2, paper: 1.6, steam: 1, glint: 1.2 },
  },
  // Noche: de día pasa desapercibida; al caer la luz es la zona más oscura con la luz más rosada.
  nightlife: {
    wash: ['#6e6070', 0.05],
    grade: { morning: '#f6f0f0', day: '#f8f6f6', sunset: '#f6e2e6', night: '#d8cce8' },
    lamp: ['#ffa27a', 1.15],
    kit: { props: ['ad-panel', 'bollard'], on: 'facade', every: 2, max: 4 },
    crowd: { street: 3, smart: 2, everyday: 1 },
    vehicles: { night: { taxi: 1.8 }, dawn: { taxi: 1.5 } },
    facades: ['club', 'wine', 'fruit', 'hair', 'pharmacy', 'res-*'],
    ambience: { leaf: 0.3, paper: 2, steam: 1.4, glint: 1.5 },
  },
  // Parque: verde en el suelo, luz más suave y fría de noche; bordes blandos con arbusto y hoja.
  park: {
    wash: ['#5c7c3e', 0.07],
    grade: { morning: '#f4fbe8', day: '#f8fcf0', sunset: '#fff2da', night: '#e6eef6' },
    lamp: ['#ffe0a8', 0.8],
    kit: { props: ['bush', 'leaves', 'bush'], on: 'open', every: 8, max: 10 },
    crowd: { sport: 4, everyday: 2.5, smart: 0.3, street: 0.8 },
    vehicles: { all: { casual: 1.5, commuter: 0.8, courier: 0.6 } },
    facades: ['civic', 'wine', 'res-*'],
    ambience: { leaf: 2.5, paper: 0.3, steam: 0.3, glint: 0.6 },
  },
  // Boca de metro: acero y granito, luz más neutra; la gente de paso de cualquier sitio.
  transit: {
    wash: ['#9aa0a6', 0.05],
    grade: { morning: '#f8f6f2', day: '#fbfbfb', sunset: '#fbeee2', night: '#dcdcf2' },
    lamp: ['#ffbe78', 1.05],
    crowd: { everyday: 3, smart: 2, street: 1, sport: 0.5 },
    facades: ['metro', 'home', 'res-*'],
    ambience: { leaf: 0.6, paper: 1.4, steam: 1.2 },
  },
};

/**
 * Horas ancla del guion de color, compartidas por todas las zonas (siguen al
 * cielo de world/Lighting): entre dos anclas se interpola.
 */
export const COLOR_SCRIPT: readonly (readonly [number, Phase])[] = [
  [0, 'night'],
  [5.5, 'night'],
  [7.5, 'morning'],
  [10, 'day'],
  [17.5, 'day'],
  [20, 'sunset'],
  [22, 'night'],
  [24, 'night'],
];
