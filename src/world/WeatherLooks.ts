import type { NpcLook } from '../types/game';
import { getNpc, PASSENGER_LOOKS } from '../data/npcs';
import { CHARACTERS } from '../data/characters';
import { HEAVY_RAIN, type Weather } from '../systems/Weather';
import { colorsOf } from './HumanArt';
import { shade } from './paint';

/**
 * La ropa de peatones anónimos y personajes con rutina según el tiempo.
 * Cada cara tiene tres versiones más, horneadas al arrancar con su
 * misma piel, pelo y pantalón: abrigada (abrigo y a veces bufanda), ligera
 * (manga corta o tirantes) y con la capucha puesta. Quién se pone qué sale de
 * su semilla y del tiempo que hace, por probabilidad: con frío no todo el mundo
 * lleva abrigo, con lluvia no todo el mundo saca el paraguas.
 */

export type Layer = 'coat' | 'light' | 'hood';
const LAYERS: readonly Layer[] = ['coat', 'light', 'hood'];

/** Paños de abrigo y de sudadera: lana, parka, camel, marino; nada de colores de verano. */
const COATS = ['#3a3a44', '#5a4a3a', '#2f3a4a', '#7a5a3f', '#4a5a4a', '#8a7a62', '#3f2f3a', '#56606e'] as const;
const SCARVES = ['#b8423a', '#d8b04a', '#3f6f8c', '#e6e0d4', '#6a8f4a', '#8c3f6a'] as const;

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Una versión de una cara: la misma persona, con otra ropa encima. */
function variant(base: NpcLook, layer: Layer): NpcLook {
  const c = colorsOf(base);
  const h = hash(base.id);
  // Lo que es de la persona, no de la ropa, queda fijo aunque cambie el id.
  const same: NpcLook = { ...base, id: `${base.id}~${layer}`, skin: c.skin, trousers: c.trousers, shoes: c.shoes, hairStyle: c.hairStyle };
  if (layer === 'coat') {
    const coat = COATS[h % COATS.length];
    return { ...same, cloth: coat, clothDark: shade(coat, -0.1), sleeves: undefined, sleeveLen: undefined, scarf: (h >>> 5) & 1 ? SCARVES[(h >>> 3) % SCARVES.length] : undefined };
  }
  if (layer === 'light') return { ...same, cap: undefined, sleeves: undefined, sleeveLen: (h >>> 2) & 1 ? 2 : 0 };
  const hoodie = COATS[(h >>> 7) % COATS.length];
  return { ...same, cloth: hoodie, clothDark: shade(hoodie, -0.1), sleeves: undefined, sleeveLen: undefined, cap: undefined, hood: base.headscarf ?? shade(hoodie, 0.04), earrings: undefined };
}

// Ropa de entrenar (vestuario del gimnasio): camisetas, tirantes, pantalón corto o largo y zapatillas, en varios
// colores. Cada persona tiene la suya, fija (sale de su id): la misma cara siempre entrena igual, y entre todos no hay dos iguales
// de seguido. Su piel, pelo, rasgos y cuerpo no cambian: sólo lo que lleva puesto. La de calle es la cara de siempre.
const GYM_TOPS = ['#e8e8ee', '#2f6fa8', '#c0493f', '#2f8a5a', '#e0a030', '#6a4aa8', '#2b2d33', '#d86a9a', '#4fb0c0', '#8a9aa8', '#e86a3a'] as const;
const GYM_BOTTOMS = ['#1c1c22', '#3a3f4a', '#23305a', '#5a2f3a', '#2f4a3a', '#4a4a52', '#6a6a76'] as const;
const GYM_SHOES = ['#f2f2f2', '#d9d9e0', '#20202a', '#e86a3a', '#3f8fd8', '#c0d84a'] as const;

/** La misma persona en ropa de entrenar: camiseta, tirantes o manga corta; pantalón y zapatillas deportivos. */
function gymVariant(base: NpcLook): NpcLook {
  const c = colorsOf(base);
  const h = hash(`gym:${base.id}`);
  const top = GYM_TOPS[h % GYM_TOPS.length];
  const style = (h >>> 4) % 3;
  return {
    ...base,
    id: `${base.id}~gym`,
    cloth: top,
    clothDark: shade(top, -0.12),
    skin: c.skin,
    hairStyle: c.hairStyle,
    // Tirantes (los brazos al aire), manga corta o camiseta a medio brazo.
    sleeves: style === 0 ? c.skin : undefined,
    sleeveLen: style === 1 ? 2 : style === 2 ? 3 : undefined,
    trousers: GYM_BOTTOMS[(h >>> 8) % GYM_BOTTOMS.length],
    shoes: GYM_SHOES[(h >>> 13) % GYM_SHOES.length],
    cap: undefined, hood: undefined, scarf: undefined, bag: undefined, headscarf: undefined,
  };
}

/** Todas las versiones, para hornearlas en el atlas de gente con sus animaciones (world/TextureFactory). */
const BASE_LOOKS = [...PASSENGER_LOOKS, ...CHARACTERS.map((c) => getNpc(c.npc))];
const GYM_LOOKS: readonly NpcLook[] = PASSENGER_LOOKS.map(gymVariant);
export const WEATHER_LOOKS: readonly NpcLook[] = [...BASE_LOOKS.flatMap((b) => LAYERS.map((l) => variant(b, l))), ...GYM_LOOKS];
const BY_ID = new Map(WEATHER_LOOKS.map((l) => [l.id, l]));

/** Su aspecto con la ropa de entrenar puesta (world/CrowdView, al cambiarse en el vestuario). */
export function gymLook(base: NpcLook): NpcLook {
  return BY_ID.get(`${base.id}~gym`) ?? base;
}

/** Azar fijo de cada persona para cada decisión: la misma persona decide igual con el mismo tiempo. */
const roll = (seed: number, what: string): number => (hash(`${what}:${seed}`) % 1000) / 1000;

/**
 * Qué capa lleva alguien con este tiempo. Con frío, más de la mitad abrigo; con
 * lluvia, algunos la capucha; con calor, manga corta; templado, casi todos como
 * siempre. null: su ropa de siempre.
 */
export function layerFor(seed: number, w: Weather): Layer | null {
  const r = roll(seed, 'ropa');
  const raining = w.rain > 0.08;
  if (w.temp === 'cold') return r < 0.6 ? 'coat' : raining && r < 0.78 ? 'hood' : null;
  if (raining) return r < 0.22 ? 'hood' : w.temp === 'warm' && r > 0.6 ? 'light' : null;
  if (w.temp === 'warm') return r < 0.55 ? 'light' : null;
  return r < 0.1 ? 'coat' : r > 0.86 ? 'light' : null;
}

/** La cara que se pinta: la de siempre o su versión para el tiempo que hace. */
export function dressedLook(base: NpcLook, seed: number, w: Weather): NpcLook {
  const layer = layerFor(seed, w);
  return (layer && BY_ID.get(`${base.id}~${layer}`)) || base;
}

/**
 * Quien sigue una rutina fija sale incluso con frío o calor: siempre adapta
 * la capa en los extremos. Con tiempo templado decide igual que un peatón.
 * Reutiliza los mismos aspectos; nombre y diálogo siguen en el NpcDef original.
 */
export function characterLook(base: NpcLook, seed: number, w: Weather): NpcLook {
  const layer = w.temp === 'cold' ? 'coat' : w.temp === 'warm' ? 'light' : layerFor(seed, w);
  return (layer && BY_ID.get(`${base.id}~${layer}`)) || base;
}

export const UMBRELLAS = 6;

/**
 * Si abre el paraguas (y cuál): con chaparrón, casi tres de cada cuatro; con
 * llovizna, menos de la mitad. Quien va con capucha no lo lleva. null: sin paraguas.
 */
export function umbrellaFor(seed: number, w: Weather, hooded: boolean): number | null {
  if (w.rain <= 0.08 || hooded) return null;
  const chance = w.rain > HEAVY_RAIN ? 0.72 : 0.42;
  return roll(seed, 'paraguas') < chance ? hash(`modelo:${seed}`) % UMBRELLAS : null;
}
