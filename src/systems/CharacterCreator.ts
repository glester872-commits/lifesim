// Sin Phaser: lo usan ui/CharacterCreator.ts y scripts/check-character.ts.
import { EYE_COLORS, HAIR_COLORS, HAIRSTYLES, SKIN_TONES, swatchColor, type Appearance, type HairStyle } from '../data/appearance.ts';
import { getGarment } from '../data/retail.ts';
import type { GameStateData } from '../types/game.ts';
import { createInitialState } from './SaveSystem.ts';
import { cleanName, DEFAULT_NAME } from './PlayerIdentity.ts';

/**
 * Creador de personaje (Alpha-04): sólo aspecto y nombre. Nada de esto toca dinero, forma física, cuerpo para
 * chocar ni ninguna regla: el resultado es GameStateData.identity, appearance.player y la ropa del armario.
 *
 * La ropa sale del catálogo de siempre (data/retail.ts), no de otro: lo elegido entra en el armario como si
 * se hubiera comprado y se puede cambiar luego en casa o en las tiendas. `null` es la ropa de serie del
 * jugador (sudadera, vaquero y zapatillas: TextureFactory.PLAYER_COLORS).
 */

export interface CreatorDraft {
  name: string;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  eyes: string;
  top: string | null;
  bottom: string | null;
  shoes: string | null;
}

export type CreatorCategory = Exclude<keyof CreatorDraft, 'name'>;
export const CATEGORIES: readonly CreatorCategory[] = ['skin', 'hair', 'hairColor', 'eyes', 'top', 'bottom', 'shoes'];

/** Prendas para empezar: básicas, de las que hay en las tiendas del barrio, ninguna pieza única. */
const START_TOPS = ['camiseta-basica', 'camiseta-grafica', 'camiseta-raya', 'camiseta-mostaza', 'camiseta-tirantes', 'sudadera-lila', 'sudadera-entreno', 'camisa-cuadros', 'rebeca-punto'];
const START_BOTTOMS = ['vaquero-gastado', 'pitillo-claro', 'cargo-negro', 'chandal-gris', 'jogger-verde', 'pana-marron'];
const START_SHOES = ['lona-blanca', 'zapatilla-retro', 'bota-cuero'];

/** Lo que se puede elegir en cada categoría, en orden. */
export const OPTIONS: { readonly [K in CreatorCategory]: readonly CreatorDraft[K][] } = {
  skin: SKIN_TONES.map((s) => s.id),
  hair: HAIRSTYLES.map((h) => h.id),
  hairColor: HAIR_COLORS.map((s) => s.id),
  eyes: EYE_COLORS.map((s) => s.id),
  top: [null, ...START_TOPS],
  bottom: [null, ...START_BOTTOMS],
  shoes: [null, ...START_SHOES],
};

export const CATEGORY_LABEL: Readonly<Record<CreatorCategory, string>> = {
  skin: 'Piel',
  hair: 'Peinado',
  hairColor: 'Color de pelo',
  eyes: 'Ojos',
  top: 'Arriba',
  bottom: 'Abajo',
  shoes: 'Calzado',
};

const SERIES: Readonly<Record<'top' | 'bottom' | 'shoes', string>> = { top: 'Sudadera naranja (de serie)', bottom: 'Vaquero oscuro (de serie)', shoes: 'Zapatillas negras (de serie)' };

/** El nombre de la opción elegida, para el botón y el lector de pantalla. */
export function optionLabel(category: CreatorCategory, value: string | null): string {
  if (category === 'top' || category === 'bottom' || category === 'shoes') return value ? getGarment(value).name : SERIES[category];
  if (category === 'hair') return HAIRSTYLES.find((h) => h.id === value)?.name ?? String(value);
  const list = category === 'skin' ? SKIN_TONES : category === 'hairColor' ? HAIR_COLORS : EYE_COLORS;
  return list.find((s) => s.id === value)?.name ?? String(value);
}

/** La muestra de color de la opción (piel, pelo, ojos, prenda), o undefined si no es de color (el peinado). */
export function optionColor(category: CreatorCategory, value: string | null): string | undefined {
  if (category === 'skin') return swatchColor(SKIN_TONES, value ?? undefined);
  if (category === 'hairColor') return swatchColor(HAIR_COLORS, value ?? undefined);
  if (category === 'eyes') return swatchColor(EYE_COLORS, value ?? undefined);
  if (category === 'top') return value ? getGarment(value).color : '#c9743f';
  if (category === 'bottom') return value ? getGarment(value).color : '#3c4152';
  if (category === 'shoes') return value ? getGarment(value).color : '#23262f';
  return undefined;
}

/** El personaje de serie: el mismo que llevaba una partida nueva antes del creador. */
export const BASE_DRAFT: CreatorDraft = { name: DEFAULT_NAME, skin: 'piel-4', hair: 'short', hairColor: 'negro', eyes: 'oscuro', top: null, bottom: null, shoes: null };

/** La opción siguiente (dir 1) o anterior (-1) de una categoría, dando la vuelta. */
export function cycle(d: CreatorDraft, category: CreatorCategory, dir: 1 | -1): CreatorDraft {
  const list = OPTIONS[category] as readonly (string | null)[];
  const at = Math.max(0, list.indexOf(d[category]));
  return { ...d, [category]: list[(at + dir + list.length) % list.length] };
}

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * ¿Se lee el pelo contra la cara? A 16 px, un pelo casi del color de la piel hace desaparecer la cabeza
 * (flequillo y frente se funden). Se mide la distancia de color, no sólo el brillo: un pelirrojo sobre piel
 * oscura se distingue por el tono aunque brillen parecido. Sin pelo no hay nada que leer.
 */
export function readable(d: CreatorDraft): boolean {
  if (d.hair === 'bald') return true;
  const [a, b] = [rgb(swatchColor(HAIR_COLORS, d.hairColor)!), rgb(swatchColor(SKIN_TONES, d.skin)!)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) >= 40;
}

/** Generador con semilla (mulberry32): la misma semilla, el mismo personaje. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un personaje al azar con esa semilla (el nombre se conserva). Nunca uno con el pelo fundido en la cara. */
export function randomDraft(seed: number, keep: Pick<CreatorDraft, 'name'> = BASE_DRAFT): CreatorDraft {
  const next = rng(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
  // Pocos intentos bastan (la mayoría de las combinaciones se leen) y siempre acaba: si no, el de serie.
  for (let i = 0; i < 12; i++) {
    const d: CreatorDraft = {
      name: keep.name,
      skin: pick(OPTIONS.skin),
      hair: pick(OPTIONS.hair),
      // Los tintes (los dos últimos), sólo de vez en cuando.
      hairColor: pick(next() < 0.85 ? OPTIONS.hairColor.slice(0, -2) : OPTIONS.hairColor),
      eyes: pick(OPTIONS.eyes),
      top: pick(OPTIONS.top),
      bottom: pick(OPTIONS.bottom),
      shoes: pick(OPTIONS.shoes),
    };
    if (readable(d)) return d;
  }
  return { ...BASE_DRAFT, name: keep.name };
}

/** El aspecto que se guarda (appearance.player): ids, nunca colores ni objetos. */
export function draftAppearance(d: CreatorDraft): Appearance {
  const a: Appearance = { hair: d.hair, skin: d.skin, hairColor: d.hairColor, eyes: d.eyes };
  if (d.top) a.top = d.top;
  if (d.bottom) a.bottom = d.bottom;
  if (d.shoes) a.shoes = d.shoes;
  return a;
}

/**
 * La partida nueva de ese personaje: la inicial de siempre (dinero, reloj, sitio, nadie conocido) con su nombre,
 * su aspecto y lo que lleva puesto en el armario. Nada sale de una partida anterior.
 */
export function newGameState(d: CreatorDraft): GameStateData {
  const base = createInitialState();
  const worn = [d.top, d.bottom, d.shoes].filter((g): g is string => g !== null);
  return { ...base, identity: { name: cleanName(d.name) }, appearance: { player: draftAppearance(d) }, wardrobe: worn };
}
