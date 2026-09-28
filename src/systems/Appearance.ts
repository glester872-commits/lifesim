// Sin Phaser: lo usan world/TextureFactory.ts, scenes/Menus.ts y scripts/check-economy.ts.
import { getHair, type Appearance, type HairStyle } from '../data/appearance.ts';
import { getGarment, type Sleeve } from '../data/retail.ts';
import { getDesign, getZone, type TattooZone } from '../data/tattoos.ts';
import type { HumanColors } from '../world/HumanArt.ts';
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
    return [{ spot: zone.spot, color: getDesign(t.design).ink }];
  });
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
  const ink = visibleTattoos(base, changes);
  if (ink.length > 0) out.ink = ink;
  return out;
}

export interface Restyle {
  ok: boolean;
  wallet: Wallet;
  /** El aspecto después (igual que antes si no se pudo). */
  appearance: Appearance;
  message: string;
}

const paid = (w: Wallet, price: number): Wallet => ({ money: Math.round((w.money - price) * 100) / 100, inventory: { ...w.inventory }, cards: { ...w.cards } });

/**
 * Cortarse el pelo: cobra lo que vale ese corte y deja el peinado nuevo en el
 * aspecto. Pura, como las compras de systems/Commerce.ts: quien llama aplica
 * cartera y aspecto al estado y adelanta el reloj lo que dura.
 */
export function haircut(w: Wallet, current: Appearance, wearing: HairStyle, hair: HairStyle): Restyle {
  const def = getHair(hair);
  const refuse = (message: string): Restyle => ({ ok: false, wallet: w, appearance: current, message });
  if (def.price === undefined) return refuse(def.line);
  if (hair === wearing) return refuse('Ya lo llevas así.');
  if (w.money + 1e-9 < def.price) return refuse(`No te llega: cuesta ${euros(def.price)}.`);
  return { ok: true, wallet: paid(w, def.price), appearance: { ...current, hair }, message: def.line };
}

/**
 * Tatuarse: un diseño en una zona libre. Cobra, y el tatuaje queda en el aspecto
 * para siempre; que se vea o no depende de lo que se lleve puesto.
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
