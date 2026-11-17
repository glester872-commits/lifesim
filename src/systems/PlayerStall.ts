// Sin Phaser: lo usan state/GameState, systems/SaveSystem, scenes/Menus, main.ts y scripts/check-player-stall.
/**
 * CAS-09 · Tu puesto en el Gran Rastro (data/playerStall.ts). Puro: cada transición devuelve un estado nuevo o un
 * rechazo, y quien llama aplica el dinero (state.as, source 'player-stall', movementId fijo) y guarda en el mismo paso.
 *
 * - Reservar cobra el alquiler para el próximo domingo con Rastro. Una reserva vigente a la vez.
 * - Poner a la venta NO saca el objeto de la bolsa (no hay depósito): retirar y cerrar no devuelven nada, y aceptar
 *   una oferta comprueba que la unidad sigue ahí (si la has regalado o vendido, la oferta se cae).
 * - Las ofertas salen deterministas por franja de media hora mientras el Rastro está en marcha: una por franja como
 *   mucho, aceptada o rechazada para siempre (el opId queda en `sales` o `declined`; repetir no cobra dos veces).
 * - Política del alquiler al cerrar (settle, el domingo desde las 17:00): si la lluvia fuerte impidió montar el Rastro
 *   ese domingo (activePopUp sin evento en todas las medias horas de 9:00 a 15:00), se devuelve el alquiler entero, una
 *   sola vez. Si el Rastro se montó, no hay reembolso, vendieras o no y vinieras o no: si no vienes, no.
 * - Límite de economía: la oferta nunca pasa de refPrice × OFFER_MAX (1,2), y refPrice es lo que pagaste (tique) o el
 *   precio de catálogo más bajo (≤ lo que pagaste en cualquier tienda). Por objeto vendido se gana como mucho el 20 % de
 *   su coste; un domingo (12 medias horas, una venta cada una) da como mucho 0,2 · Σcoste de lo vendido − alquiler.
 *   Un regalo sin catálogo ni tique vale defaultRef (3 €): como mucho 12 × 3,6 € = 43,2 € menos el alquiler.
 *   Lo que se pone por encima de refPrice × overpriceK (1,5) no recibe oferta («Lo miran y siguen.»).
 */
import { CATALOGS } from '../data/catalogs.ts';
import { ITEMS } from '../data/items.ts';
import { PLAYER_STALL } from '../data/playerStall.ts';
import { formatDate } from './Calendar.ts';
import { getLocation } from './LocationSystem.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import { activePopUp, upcoming, type PopUpClock } from './PopUps.ts';
import type { InspectDef } from '../types/game.ts';

export interface StallSale {
  opId: string;
  itemId: string;
  price: number;
  net: number;
}

export interface PlayerStallState {
  /** El domingo reservado. */
  day: number;
  /** El alquiler cobrado. */
  fee: number;
  listings: { itemId: string; price: number }[];
  sales: StallSale[];
  /** Ofertas rechazadas (opId): no vuelven. */
  declined: string[];
  /** Si llegaste a atender el puesto. */
  opened?: boolean;
  /** Cerrado (settle): lo devuelto del alquiler. */
  closed?: { refund: number };
}

export interface StallOffer {
  opId: string;
  itemId: string;
  price: number;
  buyer: string;
}

export type StallStep = { ok: true; stall: PlayerStallState } | { ok: false; message: string };

const OPEN = 9;
const CLOSE = 15;
/** Hasta cuándo se recoge: a partir de aquí el puesto se cierra y se hacen cuentas. */
export const SETTLE_HOUR = 17;
const OFFER_CHANCE = 0.7;
/** La oferta sale entre ref × OFFER_MIN y ref × OFFER_MAX (y nunca por encima de lo puesto). */
const OFFER_MIN = 0.6;
export const OFFER_MAX = 1.2;
const BUYERS = ['Una señora', 'Un chaval', 'Un señor con gorra', 'Una pareja'] as const;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const minuteOf = (c: PopUpClock): number => (c.day - 1) * 1440 + c.hour * 60 + c.minute;

/** «domingo 16 de mayo». */
export const sundayLabel = (day: number): string => formatDate(day, false).replace(',', '');

const sellable = (itemId: string): boolean => {
  const kind = ITEMS.find((i) => i.id === itemId)?.kind;
  return kind !== undefined && (PLAYER_STALL.kinds as readonly string[]).includes(kind);
};

const validPrice = (p: unknown): p is number => typeof p === 'number' && Number.isInteger(p) && p >= PLAYER_STALL.minPrice && p <= PLAYER_STALL.maxPrice;

/**
 * El inspect que la LocationDef pone en esa casilla (sus `lines` y su `stallDesk`). Donde hay un tablón del barrio
 * (PropDef.board), WorldScene no crea su interactable: lo sirve Menus.openBoard («Carteles», «Puesto en el Rastro»).
 */
export const boardNoticeAt = (location: string, tx: number, ty: number): InspectDef | undefined =>
  getLocation(location).inspects?.find((i) => i.tx === tx && i.ty === ty);

/** ¿El tablón de esa casilla alquila puesto? El id del pop-up si la LocationDef tiene ahí un inspect con `stallDesk`. */
export const stallDeskAt = (location: string, tx: number, ty: number): string | undefined => boardNoticeAt(location, tx, ty)?.stallDesk;

/** El próximo domingo con Rastro: hoy si es domingo y aún no han dado las 9 (y lo hay esta semana); si no, el siguiente. */
export function nextRastroDay(day: number, hour: number): number | undefined {
  return upcoming(PLAYER_STALL.location, hour < OPEN ? day : day + 1, 15).find((u) => u.id === PLAYER_STALL.popUp)?.day;
}

/** Reservar el puesto: cobra `fee` (quien llama lo aplica con movementId `ps-${day}-fee`). */
export function reserve(cur: PlayerStallState | undefined, money: number, clock: PopUpClock): StallStep {
  if (cur && !cur.closed) return { ok: false, message: `Ya tienes el puesto reservado para el ${sundayLabel(cur.day)}.` };
  if (money + 1e-9 < PLAYER_STALL.fee) return { ok: false, message: `No te llega: el puesto cuesta ${PLAYER_STALL.fee} €.` };
  const day = nextRastroDay(clock.day, clock.hour);
  if (day === undefined) return { ok: false, message: 'No hay Rastro a la vista.' };
  return { ok: true, stall: { day, fee: PLAYER_STALL.fee, listings: [], sales: [], declined: [] } };
}

/** Cuántas unidades de ese objeto llevas que aún no están a la venta. */
export const freeUnits = (stall: PlayerStallState, inventory: Readonly<Record<string, number>>, itemId: string): number =>
  (inventory[itemId] ?? 0) - stall.listings.filter((l) => l.itemId === itemId).length;

/** Los objetos que se pueden poner a la venta ahora: de la bolsa, de un tipo que vale y con alguna unidad libre. */
export const listable = (stall: PlayerStallState, inventory: Readonly<Record<string, number>>): string[] =>
  Object.keys(inventory).filter((id) => sellable(id) && freeUnits(stall, inventory, id) > 0);

export function list(stall: PlayerStallState, inventory: Readonly<Record<string, number>>, itemId: string, price: number): StallStep {
  if (stall.closed) return { ok: false, message: 'El puesto ya está cerrado.' };
  if (!sellable(itemId)) return { ok: false, message: 'Eso no se vende aquí.' };
  if (!validPrice(price)) return { ok: false, message: `El precio va de ${PLAYER_STALL.minPrice} a ${PLAYER_STALL.maxPrice} €, sin céntimos.` };
  if (freeUnits(stall, inventory, itemId) < 1) return { ok: false, message: 'No te quedan más de esos.' };
  if (stall.listings.length >= PLAYER_STALL.maxListings) return { ok: false, message: `En la mesa caben ${PLAYER_STALL.maxListings} cosas.` };
  return { ok: true, stall: { ...stall, listings: [...stall.listings, { itemId, price }] } };
}

/** Quitar algo de la mesa: no toca la bolsa (nunca salió de ella). */
export function withdraw(stall: PlayerStallState, index: number): StallStep {
  if (!stall.listings[index]) return { ok: false, message: 'Eso ya no está en la mesa.' };
  return { ok: true, stall: { ...stall, listings: stall.listings.filter((_, i) => i !== index) } };
}

export function isOpen(stall: PlayerStallState | undefined, clock: PopUpClock): boolean {
  return !!stall && clock.day === stall.day && !stall.closed && activePopUp(PLAYER_STALL.location, clock)?.id === PLAYER_STALL.popUp;
}

/** Apunta que has atendido el puesto (para el resumen). Sin cambio si ya estaba o no está abierto. */
export function markOpened(stall: PlayerStallState, clock: PopUpClock): StallStep {
  if (stall.opened || !isOpen(stall, clock)) return { ok: false, message: '' };
  return { ok: true, stall: { ...stall, opened: true } };
}

/**
 * Lo que vale un objeto para quien pasa: su tique más antiguo (lo que pagaste, FIFO como Retail.sellItem); sin tique, su
 * precio por unidad más bajo en los catálogos (data/catalogs.ts); si no se vende en ninguno, PLAYER_STALL.defaultRef.
 */
export function refPrice(itemId: string, paidItems: Readonly<Record<string, readonly number[]>>): number {
  const t = paidItems[itemId]?.[0];
  if (t !== undefined && Number.isFinite(t) && t > 0) return t;
  let best = Infinity;
  for (const c of CATALOGS) for (const p of c.products) if ('item' in p.effect && p.effect.item === itemId) best = Math.min(best, p.price / (p.effect.qty ?? 1));
  return Number.isFinite(best) ? best : PLAYER_STALL.defaultRef;
}

/**
 * Lo que pasa en tu puesto esta media hora: una oferta, 'overpriced' (se paran, lo miran y siguen: lo que eligen está
 * por encima de refPrice × overpriceK) o nada. Ni el sobreprecio ni el «nadie» gastan la franja. Determinista: mismo
 * día, franja, mesa y tiques, mismo resultado.
 */
export function pitchNow(stall: PlayerStallState | undefined, inventory: Readonly<Record<string, number>>, paidItems: Readonly<Record<string, readonly number[]>>, clock: PopUpClock): StallOffer | 'overpriced' | undefined {
  if (!stall || !isOpen(stall, clock)) return undefined;
  const k = Math.floor((clock.hour + clock.minute / 60 - OPEN) * 2);
  if (k < 0 || k >= (CLOSE - OPEN) * 2) return undefined;
  const opId = `ps-${stall.day}-${k}`;
  if (stall.sales.some((s) => s.opId === opId) || stall.declined.includes(opId)) return undefined;
  const live = stall.listings.filter((l) => (inventory[l.itemId] ?? 0) >= 1);
  if (!live.length) return undefined;
  const rng = seededRng(hashSeed('player-stall', stall.day, k));
  if (rng() >= OFFER_CHANCE) return undefined;
  const l = live[Math.floor(rng() * live.length)];
  const ref = refPrice(l.itemId, paidItems);
  if (l.price > ref * PLAYER_STALL.overpriceK) return 'overpriced';
  // Hacia abajo a 0,5: nunca por encima de lo puesto ni de ref × OFFER_MAX. Si eso no llega al mínimo, no hay oferta.
  const price = Math.floor(Math.min(l.price, ref * (OFFER_MIN + rng() * (OFFER_MAX - OFFER_MIN))) * 2) / 2;
  if (price < PLAYER_STALL.minPrice) return undefined;
  return { opId, itemId: l.itemId, price, buyer: BUYERS[Math.floor(rng() * BUYERS.length)] };
}

/** La oferta de esta media hora, si la hay (pitchNow sin el sobreprecio). */
export function offerNow(stall: PlayerStallState | undefined, inventory: Readonly<Record<string, number>>, paidItems: Readonly<Record<string, readonly number[]>>, clock: PopUpClock): StallOffer | undefined {
  const p = pitchNow(stall, inventory, paidItems, clock);
  return typeof p === 'object' ? p : undefined;
}

export type StallSaleStep =
  | { ok: true; stall: PlayerStallState; inventory: Record<string, number>; paidItems: Record<string, number[]>; amount: number }
  | { ok: false; message: string };

/**
 * Aceptar una oferta: sale una unidad de la bolsa con su tique más antiguo (FIFO, como systems/Retail.sellItem) y la
 * venta queda apuntada con su opId. El mismo opId otra vez se rechaza: no hay doble cobro.
 */
export function accept(stall: PlayerStallState, inventory: Readonly<Record<string, number>>, paidItems: Readonly<Record<string, number[]>>, offer: StallOffer): StallSaleStep {
  if (stall.sales.some((s) => s.opId === offer.opId)) return { ok: false, message: 'Esa venta ya está hecha.' };
  if (stall.closed || stall.declined.includes(offer.opId)) return { ok: false, message: 'Esa oferta ya no vale.' };
  const have = inventory[offer.itemId] ?? 0;
  if (have < 1) return { ok: false, message: 'Ya no lo llevas.' };
  const at = stall.listings.findIndex((l) => l.itemId === offer.itemId);
  if (at < 0) return { ok: false, message: 'Eso ya no está en la mesa.' };
  const inv = { ...inventory };
  if (have > 1) inv[offer.itemId] = have - 1;
  else delete inv[offer.itemId];
  const tiques = { ...paidItems };
  const left = (paidItems[offer.itemId] ?? []).slice(1);
  if (left.length) tiques[offer.itemId] = left;
  else delete tiques[offer.itemId];
  const price = round2(offer.price);
  return {
    ok: true,
    stall: { ...stall, listings: stall.listings.filter((_, i) => i !== at), sales: [...stall.sales, { opId: offer.opId, itemId: offer.itemId, price, net: price }] },
    inventory: inv,
    paidItems: tiques,
    amount: price,
  };
}

export function decline(stall: PlayerStallState, opId: string): StallStep {
  if (stall.declined.includes(opId) || stall.sales.some((s) => s.opId === opId)) return { ok: false, message: '' };
  return { ok: true, stall: { ...stall, declined: [...stall.declined, opId] } };
}

/** ¿Se montó el Rastro ese domingo? Con lluvia fuerte en todas sus medias horas, no. */
function rainedOut(day: number): boolean {
  for (let k = 0; k < (CLOSE - OPEN) * 2; k++) {
    const t = OPEN + k / 2;
    if (activePopUp(PLAYER_STALL.location, { day, hour: Math.floor(t), minute: (t % 1) * 60 })?.id === PLAYER_STALL.popUp) return false;
  }
  return true;
}

/** Cerrar el puesto desde el domingo a las 17:00 (ver la política arriba). Idempotente: cerrado, no cambia. */
export function settle(stall: PlayerStallState | undefined, clock: PopUpClock): StallStep {
  if (!stall || stall.closed) return { ok: false, message: '' };
  if (minuteOf(clock) < minuteOf({ day: stall.day, hour: SETTLE_HOUR, minute: 0 })) return { ok: false, message: '' };
  return { ok: true, stall: { ...stall, listings: [], closed: { refund: rainedOut(stall.day) ? stall.fee : 0 } } };
}

/** Las cuentas del puesto, sólo de lo apuntado. */
export function summary(stall: PlayerStallState): { fee: number; sold: number; income: number; refund: number; net: number } {
  const income = round2(stall.sales.reduce((a, s) => a + s.price, 0));
  const refund = stall.closed?.refund ?? 0;
  return { fee: stall.fee, sold: stall.sales.length, income, refund, net: round2(stall.sales.reduce((a, s) => a + s.net, 0) - stall.fee + refund) };
}

/** Lee el puesto guardado: lo dañado se descarta; sin día válido, sin puesto. */
export function parsePlayerStall(raw: unknown): PlayerStallState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.day !== 'number' || !Number.isInteger(r.day) || r.day < 1) return undefined;
  const fee = typeof r.fee === 'number' && Number.isFinite(r.fee) && r.fee >= 0 ? round2(r.fee) : PLAYER_STALL.fee;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
  const listings = arr(r.listings)
    .map(obj)
    .filter((l) => typeof l.itemId === 'string' && sellable(l.itemId) && validPrice(l.price))
    .map((l) => ({ itemId: l.itemId as string, price: l.price as number }))
    .slice(0, PLAYER_STALL.maxListings);
  const seen = new Set<string>();
  const sales: StallSale[] = [];
  for (const s of arr(r.sales).map(obj)) {
    const ok = typeof s.opId === 'string' && typeof s.itemId === 'string' && typeof s.price === 'number' && Number.isFinite(s.price)
      && s.price >= PLAYER_STALL.minPrice && s.price <= PLAYER_STALL.maxPrice && typeof s.net === 'number' && Number.isFinite(s.net);
    if (!ok || seen.has(s.opId as string)) continue;
    seen.add(s.opId as string);
    sales.push({ opId: s.opId as string, itemId: s.itemId as string, price: round2(s.price as number), net: round2(s.net as number) });
  }
  const declined = [...new Set(arr(r.declined).filter((d): d is string => typeof d === 'string'))];
  const c = obj(r.closed);
  const closed = r.closed !== undefined && typeof c.refund === 'number' && Number.isFinite(c.refund) ? { refund: Math.min(fee, Math.max(0, round2(c.refund))) } : undefined;
  return { day: r.day, fee, listings, sales, declined, ...(r.opened === true ? { opened: true } : {}), ...(closed ? { closed } : {}) };
}
