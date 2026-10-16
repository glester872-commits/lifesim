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

export type DistrictId = 'residential' | 'commercial' | 'vintage' | 'nightlife' | 'park' | 'transit' | 'riverside' | 'dense' | 'stadium' | 'premium' | 'centre';

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
  /**
   * Afina `crowd` por moda de cada persona (data/identity.ts, Fashion): multiplica el peso de quien viste así.
   * Para que una zona atraiga más punk o más oficina sin que toda su gente vaya igual.
   */
  fashion?: Readonly<Partial<Record<import('./identity.ts').Fashion, number>>>;
  /** Multiplicadores del tráfico que cruza la zona (id → factor), por franja; `all` vale siempre. */
  vehicles?: Readonly<Partial<Record<TrafficBand | 'all', Readonly<Record<string, number>>>>>;
  /** Estilos de edificio (BuildingDef.style) que caben en la zona; con '*' al final, prefijo ('res-*'). */
  facades: readonly string[];
  /** Cuánto se nota cada efecto de ambiente en la zona (world/Atmosphere.ts): 1 = lo normal, 0 = nada. */
  ambience?: Readonly<Partial<Record<AmbientFx, number>>>;
}

/** Efectos de ambiente que una zona puede subir o bajar. */
export type AmbientFx = 'leaf' | 'paper' | 'steam';

export const DISTRICTS: Readonly<Record<DistrictId, DistrictProfile>> = {
  // Ribera: la luz del agua. Verde azulado en el suelo, cielo algo más frío de día y más cálido y largo al atardecer; la
  // gente que sale a pasear, correr o jugar. Vivienda moderna, terrazas, ocio y deporte.
  riverside: {
    wash: ['#6f9aa8', 0.05],
    grade: { morning: '#f2f8fb', day: '#fdfefe', sunset: '#ffe9d4', night: '#dfe6f6' },
    lamp: ['#ffd49c', 1.1],
    kit: { props: ['planter', 'bush'], on: 'open', every: 10, max: 6 },
    crowd: { sport: 3, everyday: 2.4, street: 1.3, smart: 1 },
    vehicles: { all: { casual: 1.8, rental: 1.8, skater: 4, commuter: 0.6 } },
    facades: ['res-*', 'bar', 'cafe', 'restaurant', 'super', 'arcade', 'sports', 'gym', 'pharmacy', 'coffee', 'backdrop'],
    ambience: { leaf: 1.6, paper: 0.5, steam: 0.7 },
  },
  // Calma: color apagado, luz de casa, poco rótulo; lo que hay en la acera es de vecinos.
  residential: {
    wash: ['#a89a88', 0.05],
    grade: { morning: '#fff4ea', day: '#fcfaf6', sunset: '#fff0e2', night: '#f2f0fa' },
    lamp: ['#ffcf8f', 0.85],
    kit: { props: ['planter', 'bike'], on: 'facade', every: 14, max: 8 },
    crowd: { everyday: 4, smart: 1, sport: 1.2, street: 0.4 },
    vehicles: { all: { van: 1.2, bus: 0.6 } },
    // Con su comercio de planta baja: el horno, la tienda de alimentación y el bar de abajo.
    facades: ['home', 'res-*', 'civic', 'wine', 'bakery', 'grocer', 'bar', 'backdrop'],
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
    // Mezcla, no uniforme: más ropa de calle, vintage, punk o skate que en otro sitio, pero con mucha ropa normal, oficina y deporte.
    crowd: { street: 2.7, everyday: 2.3, smart: 1, sport: 0.8 },
    fashion: { vintage: 1.9, alternative: 2.2, punk: 2.4, skate: 2.4, experimental: 2.6, designer: 1.8, streetwear: 1.3, nightlife: 1.2, tourist: 1.4 },
    // Bicis de paseo y de alquiler, y patinadores por el carril del Carmen.
    vehicles: { all: { casual: 1.6, rental: 1.4, commuter: 0.7, skater: 7 } },
    facades: ['res-*', 'tattoo', 'vintage', 'coffee', 'records', 'streetwear', 'thrift', 'print', 'sneaker', 'piercing', 'bar'],
    ambience: { leaf: 1.2, paper: 1.6, steam: 1 },
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
    ambience: { leaf: 0.3, paper: 2, steam: 1.4 },
  },
  // Parque: verde en el suelo, luz más suave y fría de noche; bordes blandos con arbusto y hoja.
  park: {
    wash: ['#5c7c3e', 0.07],
    grade: { morning: '#f4fbe8', day: '#f8fcf0', sunset: '#fff2da', night: '#e6eef6' },
    lamp: ['#ffe0a8', 0.8],
    kit: { props: ['bush', 'leaves', 'bush'], on: 'open', every: 8, max: 10 },
    crowd: { sport: 4, everyday: 2.5, smart: 0.3, street: 0.8 },
    vehicles: { all: { casual: 1.5, commuter: 0.8, courier: 0.6, skater: 3 } },
    facades: ['civic', 'wine', 'res-*'],
    ambience: { leaf: 2.5, paper: 0.3, steam: 0.3 },
  },
  // Cuatro Ríos: ciudad densa de diario. Suelo más gastado y polvoriento, luz de escaparate algo más fuerte, cajas,
  // armarios de la luz y carteles contra las fachadas; furgonetas y repartos de sobra, poco coche de lujo.
  dense: {
    wash: ['#a08f7c', 0.06],
    grade: { morning: '#fff3e6', day: '#fbf8f2', sunset: '#ffe8d2', night: '#ece6f2' },
    lamp: ['#ffc07e', 1.1],
    kit: { props: ['utility-box', 'crates', 'poster', 'bike', 'ad-panel'], on: 'facade', every: 6, max: 12 },
    crowd: { everyday: 4, street: 1.6, smart: 1.2, sport: 1 },
    vehicles: { all: { van: 1.6, 'small-truck': 1.5, 'delivery-truck': 1.4, premium: 0.4, courier: 1.6 }, morning: { bus: 1.4 }, evening: { bus: 1.3 } },
    facades: ['res-*', 'super', 'fruit', 'bakery', 'restaurant', 'hair', 'phone', 'gym', 'pharmacy', 'grocer', 'fashion', 'streetwear', 'arcade', 'laundry', 'cafe', 'backdrop'],
    ambience: { leaf: 0.5, paper: 1.6, steam: 1.3 },
  },
  // Velaria: piedra clara y limpia, luz cálida de escaparate y de farola de forja, jardineras y bolardos en vez de cajas y
  // carteles. Más ropa de oficina, sastrería y lujo que en ningún sitio, sin que deje de verse de todo; más berlinas,
  // taxis y VTC, pocas furgonetas (los repartos, de madrugada y a primera hora).
  premium: {
    wash: ['#c8bca4', 0.04],
    grade: { morning: '#fff6ea', day: '#fffdf8', sunset: '#ffecd6', night: '#f4ecf6' },
    lamp: ['#ffcc88', 1.15],
    kit: { props: ['planter-box', 'bollard', 'planter-box'], on: 'facade', every: 9, max: 10 },
    crowd: { smart: 3.2, everyday: 2.4, street: 0.8, sport: 0.8 },
    fashion: { luxury: 2.6, office: 2, formal: 1.8, designer: 1.8, tourist: 1.3 },
    vehicles: {
      all: { premium: 2.4, vtc: 3, suv: 1.3, taxi: 1.4, 'taxi-hybrid': 1.4, van: 0.6, 'small-truck': 0.5, 'delivery-truck': 0.5, city: 0.8 },
      morning: { van: 1.6, 'small-truck': 1.5 },
      night: { vtc: 1.5, taxi: 1.3 },
    },
    facades: ['res-*', 'boutique', 'jewel', 'hotel', 'gallery', 'gourmet', 'fine', 'clinic', 'salon', 'cafe', 'gym', 'wine', 'metro', 'backdrop'],
    ambience: { leaf: 0.8, paper: 0.3, steam: 0.6 },
  },
  // Puerta Central: el granito gastado del centro, luz de escaparate fuerte, papeleras, paneles y bicis contra las
  // fachadas. De todo y de todas partes: más turista y más ropa de calle que en ningún sitio, con oficina y diario de
  // sobra. Autobuses, taxis y repartos; algún coche bueno, no muchos.
  centre: {
    wash: ['#b0a48e', 0.05],
    grade: { morning: '#fff4e8', day: '#fffcf6', sunset: '#ffe8d0', night: '#f2eaf2' },
    lamp: ['#ffc684', 1.15],
    kit: { props: ['bin', 'ad-panel', 'bike-rack', 'bollard'], on: 'facade', every: 7, max: 12 },
    crowd: { everyday: 3.2, smart: 2, street: 1.8, sport: 0.9 },
    fashion: { tourist: 2.6, streetwear: 1.2, office: 1.1 },
    vehicles: {
      all: { bus: 1.6, taxi: 1.5, 'taxi-hybrid': 1.4, van: 1.3, 'delivery-truck': 1.2, courier: 1.4, premium: 0.8 },
      night: { taxi: 1.8, vtc: 1.4 },
    },
    // 'police': la comisaría de la plaza (systems/Police).
    facades: ['res-*', 'souvenir', 'fashion', 'restaurant', 'cafe', 'metro', 'police', 'backdrop'],
    ambience: { leaf: 0.6, paper: 1.6, steam: 1.2 },
  },
  // Distrito Arena: hormigón del estadio y granito de la explanada; farola cálida casi blanca (lo frío, las torres de focos). La gente, de chándal y de
  // camiseta del equipo más que de oficina; furgonetas de catering y algún autobús.
  stadium: {
    wash: ['#9aa4a8', 0.05],
    grade: { morning: '#f6f8fa', day: '#fbfcfc', sunset: '#ffeedd', night: '#e6eef8' },
    lamp: ['#ffe6c8', 1.15],
    kit: { props: ['bin', 'bollard', 'ad-panel'], on: 'facade', every: 8, max: 8 },
    crowd: { sport: 3.5, everyday: 2.5, street: 1.5, smart: 0.4 },
    vehicles: { all: { van: 1.4, bus: 1.2, taxi: 1.3, premium: 0.5 } },
    facades: ['res-*', 'stadium', 'team-store', 'sports', 'bar', 'restaurant', 'cafe', 'metro', 'backdrop'],
    ambience: { leaf: 0.4, paper: 1.8, steam: 0.8 },
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
