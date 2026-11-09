// Sin Phaser: lo usan world/TextureFactory.ts, scenes/Menus.ts y scripts/check-economy.ts.
import { EYE_COLORS, FACTORY_HAIR_COLOR, getHair, HAIR_COLORS, HAIR_DYE, HAIR_EXTRA_MINUTES, HAIR_EXTRA_PRICE, HAIR_SERVICE_LINE, SKIN_TONES, swatchColor, type Appearance, type HairService, type HairStyle } from '../data/appearance.ts';
import { getGarment, type Sleeve } from '../data/retail.ts';
import { wearOf } from '../data/outfits.ts';
import { getDesign, getZone, TATTOO_COVER_PRICE, TATTOO_DESIGNS, TATTOO_REMOVE_MINUTES, TATTOO_REMOVE_PRICE, TATTOO_RETOUCH, type TattooZone } from '../data/tattoos.ts';
import type { HumanColors } from '../world/HumanArt.ts';
import type { NpcLook } from '../types/game.ts';
import { euros, type Wallet } from './Commerce.ts';

/** Píxeles de brazo que tapa cada manga (el brazo mide cinco). */
const SLEEVE_PX: Readonly<Record<Sleeve, number>> = { long: 5, short: 2, none: 0 };

/**
 * Manga de lo que lleva puesto: la de la prenda si se ha cambiado; si no, la de
 * fábrica (brazos del color de la piel, como Sara, es ir de tirantes).
 */
export function sleeveOf(base: HumanColors, changes: Appearance | undefined): Sleeve {
  if (changes?.top) return getGarment(changes.top).sleeve ?? 'long';
  return base.sleeves && base.sleeves === base.skin ? 'none' : 'long';
}

/** Tatuajes que se ven con esa ropa: los que la manga no tapa y no van bajo la camiseta. */
export function visibleTattoos(base: HumanColors, changes: Appearance | undefined): NonNullable<HumanColors['ink']> {
  const sleeve = sleeveOf(base, changes);
  return (changes?.tattoos ?? []).flatMap((t) => {
    const zone = getZone(t.zone);
    if (!zone.spot || zone.hiddenBy === 'always' || zone.hiddenBy.includes(sleeve)) return [];
    // La bufanda da dos vueltas al cuello: lo que va ahí queda debajo.
    if (zone.spot === 'neck' && changes?.scarf) return [];
    return [{ spot: zone.spot, color: getDesign(t.design).ink }];
  });
}

const rgbOf = (hex: string): number[] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Un iris es un píxel: si su color casi es el de la piel (ojos marrones en piel oscura) el ojo desaparece. Antes
 * que fingir el color, se oscurece hacia el contorno hasta que se separa de la piel; si ya se separa, tal cual.
 */
export function legibleIris(iris: string, skin: string): string {
  const s = rgbOf(skin);
  let c = rgbOf(iris);
  const ink = rgbOf('#1c1620');
  for (let k = 0; k < 4 && Math.hypot(c[0] - s[0], c[1] - s[1], c[2] - s[2]) < 48; k++) c = c.map((v, i) => Math.round(v + (ink[i] - v) * 0.35));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * El aspecto de alguien = el de fábrica + lo que ha cambiado. Sirve para el
 * jugador y para cualquier personaje con nombre: quien pinta pasa sus colores
 * de siempre y recibe los de hoy (peinado, ropa y los tatuajes que se ven). La
 * gente anónima no tiene cambios guardados: es de paso, y la siguiente vez es
 * otra persona.
 */
export function withAppearance(base: HumanColors, changes: Appearance | undefined): HumanColors {
  if (!changes) return base;
  const out: HumanColors = { ...base };
  if (changes.hair) out.hairStyle = changes.hair;
  // Colores del creador de personaje: sólo estética, nada de cuerpo ni de colisión. Un id desconocido no cambia nada.
  const skin = swatchColor(SKIN_TONES, changes.skin);
  if (skin) {
    // Los brazos al aire (sin manga) son del color de la piel: siguen siéndolo con la piel nueva.
    if (out.sleeves === out.skin) out.sleeves = skin;
    out.skin = skin;
  }
  out.hair = swatchColor(HAIR_COLORS, changes.hairColor) ?? out.hair;
  const eyes = swatchColor(EYE_COLORS, changes.eyes);
  if (eyes && changes.eyes !== 'oscuro') out.eyes = legibleIris(eyes, out.skin);
  if (changes.top) {
    const top = getGarment(changes.top);
    out.cloth = top.color;
    out.clothDark = top.dark ?? top.color;
    // La manga nueva manda: lo que quede de brazo por debajo, piel.
    out.sleeves = undefined;
    out.sleeveLen = SLEEVE_PX[top.sleeve ?? 'long'];
  }
  if (changes.bottom) {
    out.trousers = getGarment(changes.bottom).color;
    out.spots = undefined;
  }
  if (changes.shoes) out.shoes = getGarment(changes.shoes).color;
  // CV-08A: las gafas puestas, con su cristal y su montura (world/HumanArt las pinta de frente y de perfil).
  if (changes.glasses) {
    const g = getGarment(changes.glasses);
    out.glasses = g.lens ?? 'dark';
    out.glassesFrame = g.color;
  }
  // Gorra y bufanda: world/HumanArt las pinta en todas las poses, encima del pelo y del cuello.
  if (changes.cap) out.cap = getGarment(changes.cap).color;
  if (changes.scarf) out.scarf = getGarment(changes.scarf).color;
  // Quien viste prendas (el jugador): cada una cambia también el corte y el tejido que se pinta.
  if (base.outfit) {
    const worn = (['top', 'bottom', 'shoes'] as const).flatMap((slot) => {
      const id = changes[slot];
      return id ? [wearOf(id, getGarment(id).category)] : [];
    });
    out.outfit = Object.assign({ ...base.outfit }, ...worn);
  }
  const ink = visibleTattoos(base, changes);
  if (ink.length > 0) out.ink = ink;
  return out;
}

/** Ropa de trabajo temporal: conserva los rasgos y no modifica la apariencia guardada. */
export function withUniform(base: HumanColors, uniform: NpcLook | null): HumanColors {
  if (!uniform) return base;
  return {
    ...base,
    cloth: uniform.cloth,
    clothDark: uniform.clothDark,
    sleeves: uniform.sleeves,
    sleeveLen: undefined,
    trousers: uniform.trousers ?? base.trousers,
    badge: uniform.badge,
    // Sin corte personal, Garments no vuelve a vestir el chaleco con capucha, abrigo o pantalón corto. Con cinturón
    // (dobok, world/HumanArt), sin prenda encima que lo tape.
    outfit: uniform.belt ? undefined : uniform.outfit,
    belt: uniform.belt,
    ink: [],
    // De uniforme, sin gorra ni bufanda propias; las gafas se quedan. La apariencia guardada no cambia.
    cap: undefined,
    scarf: undefined,
  };
}

export interface Restyle {
  ok: boolean;
  wallet: Wallet;
  /** El aspecto después (igual que antes si no se pudo). */
  appearance: Appearance;
  message: string;
}

const paid = (w: Wallet, price: number): Wallet => ({ money: Math.round((w.money - price) * 100) / 100, inventory: { ...w.inventory }, cards: { ...w.cards } });

export interface HaircutQuote {
  service: HairService;
  price: number;
  minutes: number;
}

/**
 * Qué servicio es pasar de un peinado a otro. El pelo no crece en el juego: alargar o rizar no se prohíbe (sería un
 * callejón sin salida), es otro servicio y lleva su recargo. Alargar manda sobre rizar: un rapado no admite permanente.
 */
export function haircutQuote(wearing: HairStyle, hair: HairStyle, baseMinutes: number): HaircutQuote {
  const from = getHair(wearing);
  const to = getHair(hair);
  const service: HairService = to.length > from.length ? 'Extensiones' : to.curly && !from.curly ? 'Permanente' : 'Corte';
  const extra = service !== 'Corte';
  return { service, price: (to.price ?? 0) * (extra ? HAIR_EXTRA_PRICE : 1), minutes: baseMinutes * (extra ? HAIR_EXTRA_MINUTES : 1) };
}

/**
 * Cortarse el pelo: cobra lo que vale ese servicio (haircutQuote) y deja el peinado
 * nuevo en el aspecto. Pura, como las compras de systems/Commerce.ts: quien llama
 * aplica cartera y aspecto al estado y adelanta el reloj lo que dura.
 */
export function haircut(w: Wallet, current: Appearance, wearing: HairStyle, hair: HairStyle): Restyle {
  const def = getHair(hair);
  const refuse = (message: string): Restyle => ({ ok: false, wallet: w, appearance: current, message });
  if (def.price === undefined) return refuse(def.line);
  if (hair === wearing) return refuse('Ya lo llevas así.');
  const { service, price } = haircutQuote(wearing, hair, 0);
  if (w.money + 1e-9 < price) return refuse(`No te llega: cuesta ${euros(price)}.`);
  return { ok: true, wallet: paid(w, price), appearance: { ...current, hair }, message: HAIR_SERVICE_LINE[service] ?? def.line };
}

/** Teñirse: cambia sólo el color del pelo, al precio único de HAIR_DYE. Pura, como haircut. */
export function dyeHair(w: Wallet, current: Appearance, color: string): Restyle {
  const swatch = HAIR_COLORS.find((s) => s.id === color);
  const refuse = (message: string): Restyle => ({ ok: false, wallet: w, appearance: current, message });
  if (!swatch) return refuse('Ese color no lo tenemos.');
  if ((current.hairColor ?? FACTORY_HAIR_COLOR) === color) return refuse('Ya lo llevas de ese color.');
  if (w.money + 1e-9 < HAIR_DYE.price) return refuse(`No te llega: cuesta ${euros(HAIR_DYE.price)}.`);
  return { ok: true, wallet: paid(w, HAIR_DYE.price), appearance: { ...current, hairColor: color }, message: `${swatch.name}, de raíz a puntas. Una semana sin agua muy caliente.` };
}

/**
 * Tatuarse: un diseño en una zona libre. Cobra, y el tatuaje queda en el aspecto
 * (encima sólo se trabaja con reworkTattoo); que se vea o no depende de lo que se lleve puesto.
 */
export function tattoo(w: Wallet, current: Appearance, zone: TattooZone, design: string): Restyle {
  const def = getDesign(design);
  const refuse = (message: string): Restyle => ({ ok: false, wallet: w, appearance: current, message });
  if (def.not?.includes(zone)) return refuse(`${def.name} no cabe bien ahí. Mejor en otra zona.`);
  if (current.tattoos?.some((t) => t.zone === zone)) return refuse('Ahí ya tienes uno. Encima no se tatúa.');
  if (w.money + 1e-9 < def.price) return refuse(`No te llega: cuesta ${euros(def.price)}.`);
  return {
    ok: true,
    wallet: paid(w, def.price),
    appearance: { ...current, tattoos: [...(current.tattoos ?? []), { zone, design }] },
    message: `${def.name} en ${getZone(zone).name.toLowerCase()}. Film, crema dos veces al día y nada de sol en dos semanas.`,
  };
}

export type TattooAction = 'retouch' | 'cover' | 'remove';

export interface TattooWork {
  action: TattooAction;
  /** El diseño que queda; sin él, la zona se queda limpia. */
  design?: string;
  label: string;
  price: number;
  minutes: number;
}

const cents = (n: number): number => Math.round(n * 100) / 100;
const lightness = (hex: string): number => {
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** El diseño que se ve en la zona. En una partida heredada con duplicados, el último: es el que se pinta encima. */
export function tattooAt(current: Appearance, zone: TattooZone): string | undefined {
  return current.tattoos?.filter((t) => t.zone === zone).at(-1)?.design;
}

/**
 * Qué se puede hacer sobre lo que hay en una zona, con su precio y su rato, sacados del catálogo. Un diseño del mismo
 * estilo siempre es retoque aunque su tinta sea más oscura: es lo más barato. Eliminar siempre se puede.
 */
export function tattooWorks(current: Appearance, zone: TattooZone): TattooWork[] {
  const design = tattooAt(current, zone);
  if (!design) return [];
  const old = getDesign(design);
  const fits = TATTOO_DESIGNS.filter((d) => d.id !== old.id && !d.not?.includes(zone));
  return [
    ...fits.filter((d) => d.style === old.style).map((d): TattooWork => ({ action: 'retouch', design: d.id, label: `Retocar a ${d.name}`, price: cents(d.price * TATTOO_RETOUCH), minutes: Math.ceil(d.minutes * TATTOO_RETOUCH) })),
    ...fits.filter((d) => d.style !== old.style && lightness(d.ink) < lightness(old.ink)).map((d): TattooWork => ({ action: 'cover', design: d.id, label: `Cubrir con ${d.name}`, price: cents(d.price * TATTOO_COVER_PRICE), minutes: d.minutes })),
    { action: 'remove', label: 'Eliminar', price: cents(old.price * TATTOO_REMOVE_PRICE), minutes: old.minutes * TATTOO_REMOVE_MINUTES },
  ];
}

/** Retocar, cubrir o eliminar. Pura, como tattoo; sólo vale lo que ofrece tattooWorks. Deja una sola marca en la zona. */
export function reworkTattoo(w: Wallet, current: Appearance, zone: TattooZone, action: TattooAction, design?: string): Restyle {
  const refuse = (message: string): Restyle => ({ ok: false, wallet: w, appearance: current, message });
  const work = tattooWorks(current, zone).find((x) => x.action === action && x.design === design);
  if (!work) return refuse('Ese trabajo ahí no se puede hacer.');
  if (w.money + 1e-9 < work.price) return refuse(`No te llega: cuesta ${euros(work.price)}.`);
  const old = getDesign(tattooAt(current, zone)!).name;
  const rest = (current.tattoos ?? []).filter((t) => t.zone !== zone);
  const tattoos = design ? [...rest, { zone, design }] : rest;
  const { tattoos: _old, ...others } = current;
  const message = action === 'remove' ? `${old}, fuera. La piel tardará en calmarse: crema y nada de sol.`
    : action === 'retouch' ? `Retocado: ahora es ${getDesign(design!).name}. Film y crema dos semanas.`
    : `${getDesign(design!).name} tapa ${old}. Film y crema dos semanas.`;
  return { ok: true, wallet: paid(w, work.price), appearance: tattoos.length > 0 ? { ...others, tattoos } : others, message };
}

/** Distancia RGB y píxeles que hacen falta para que un cambio se lea a tamaño de juego (AVATAR-LV06.md, D8). */
const LEGIBLE_RGB = 48;
const LEGIBLE_PIXELS = 2;

/**
 * Compara dos sprites RGBA sobre cada suelo: `none`, no cambia nada visible; `legible`, se lee sobre todos;
 * `faint`, cambia pero sobre algún suelo no llega al umbral.
 */
export function lookChange(before: Uint8ClampedArray, after: Uint8ClampedArray, floors: readonly string[]): 'none' | 'legible' | 'faint' {
  let changed = false;
  let legible = true;
  for (const floor of floors) {
    const f = rgbOf(floor);
    const over = (d: Uint8ClampedArray, i: number, c: number): number => d[i + c] * (d[i + 3] / 255) + f[c] * (1 - d[i + 3] / 255);
    let strong = 0;
    for (let i = 0; i < before.length; i += 4) {
      const distance = Math.hypot(over(before, i, 0) - over(after, i, 0), over(before, i, 1) - over(after, i, 1), over(before, i, 2) - over(after, i, 2));
      if (distance > 0) changed = true;
      if (distance >= LEGIBLE_RGB) strong++;
    }
    if (strong < LEGIBLE_PIXELS) legible = false;
  }
  return !changed ? 'none' : legible ? 'legible' : 'faint';
}
