// Sin Phaser: lo usan Menus, WorldScene, SaveSystem, main y scripts/check-housing.ts.
import { HOMES, SLOTS, UPGRADES, getHome, getUpgrade, type HomeDef, type Placement, type UpgradeDef } from '../data/housing.ts';
import { STORIES } from '../data/saraStory.ts';
import type { LocationDef, TilePoint } from '../types/game.ts';
import { euros } from './Commerce.ts';
import { allLocations, baseLocation, installLocation, isWalkable } from './LocationSystem.ts';
import type { NamedStory } from './Story.ts';

/**
 * La vivienda del jugador: en qué casa vive y qué mejoras ha comprado. Funciones puras sobre el estado guardado
 * (GameStateData.housing); quien las usa aplica el resultado (dinero, guardado) y vuelve a instalar la casa.
 *
 * `owned` es la identidad de lo comprado: una mejora está o no está, no se compra dos veces. Qué está instalado y
 * qué guardado en el trastero no se guarda: sale de la casa donde vives (si la mejora tiene sitio ahí, está
 * instalada; si no, espera guardada y vuelve a instalarse sola cuando vuelvas a una casa donde quepa). Así nada se
 * pierde al mudarse, ni en silencio.
 */

export interface HousingState {
  /** Id de la vivienda activa (data/housing.ts HOMES). */
  home: string;
  /** Ids de las mejoras compradas. */
  owned: string[];
  /**
   * Mejora → ranura elegida (data/housing.ts SLOTS). Sólo cuenta si esa ranura es una de las suyas en la casa de ahora
   * y está libre; si no, va a la primera libre (layout). Sin elegir nada (una partida anterior), falta.
   */
  slots?: Record<string, string>;
}

export const startHousing = (): HousingState => ({ home: HOMES[0].id, owned: [] });

/** Una vivienda guardada, o la de partida: una partida anterior conserva su piso sin cobrar ni quitar nada. */
export function parseHousing(v: unknown): HousingState {
  const start = startHousing();
  if (typeof v !== 'object' || v === null) return start;
  const o = v as Record<string, unknown>;
  const home = HOMES.some((h) => h.id === o.home) ? (o.home as string) : start.home;
  const owned = Array.isArray(o.owned) ? [...new Set(o.owned.filter((id): id is string => typeof id === 'string' && UPGRADES.some((u) => u.id === id)))] : [];
  const raw = typeof o.slots === 'object' && o.slots !== null ? (o.slots as Record<string, unknown>) : {};
  const slots = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => owned.includes(e[0]) && typeof e[1] === 'string'));
  return Object.keys(slots).length ? { home, owned, slots } : { home, owned };
}

// ------------------------------------------------------------ qué hay dónde

/** Las ranuras donde puede ir una mejora en esa casa, en orden de preferencia (ninguna: no cabe). */
export function optionsOf(u: UpgradeDef, homeId: string): readonly Placement[] {
  const p = u.placements[homeId];
  return !p ? [] : 'slot' in p ? [p] : p;
}

export const fits = (u: UpgradeDef, homeId: string): boolean => optionsOf(u, homeId).length > 0;

/** Primera letra en mayúscula: los avisos que empiezan por una ranura («La esquina del salón ya la ocupa…»). */
const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** Cómo se llama una ranura de una casa: «la esquina del salón». */
export const slotName = (homeId: string, slot: string): string => SLOTS[homeId]?.[slot]?.name ?? slot;

/**
 * Qué hay en cada ranura de esa casa (ranura → mejora y su colocación). Lo comprado, por orden de compra, va a la ranura
 * elegida (h.slots) si es suya y está libre, o a la primera libre de las suyas; lo que no encuentra sitio, al trastero.
 * Una ranura, una cosa: esto decide en un solo sitio qué está puesto, y recolocar mueve, nunca duplica.
 */
export function layout(h: HousingState, homeId = h.home): Map<string, { id: string; placement: Placement }> {
  const used = new Map<string, { id: string; placement: Placement }>();
  for (const id of h.owned) {
    const free = optionsOf(getUpgrade(id), homeId).filter((p) => !used.has(p.slot));
    const pick = free.find((p) => p.slot === h.slots?.[id]) ?? free[0];
    if (pick) used.set(pick.slot, { id, placement: pick });
  }
  return used;
}

/** Lo comprado que está puesto en esa casa (por defecto, la de ahora). */
export const installedIn = (h: HousingState, homeId = h.home): string[] => [...layout(h, homeId).values()].map((v) => v.id);

/** Lo comprado que no cabe ahí (o cuyas ranuras están todas ocupadas): en el trastero, intacto. */
export function storedIn(h: HousingState, homeId = h.home): string[] {
  const placed = installedIn(h, homeId);
  return h.owned.filter((id) => !placed.includes(id));
}

/** Las ranuras de esta mejora que están libres en la casa de ahora (o que ya ocupa ella misma). */
export function freeSlots(h: HousingState, id: string): Placement[] {
  const taken = layout(h);
  return optionsOf(getUpgrade(id), h.home).filter((p) => (taken.get(p.slot)?.id ?? id) === id);
}

/** Quién ocupa una ranura de la casa de ahora, o undefined si está libre. */
export const occupant = (h: HousingState, slot: string): string | undefined => layout(h).get(slot)?.id;

const shortName = (home: HomeDef): string => home.name.split(' · ')[0].toLowerCase();

/** La localización de una casa con las mejoras puestas: los datos de siempre más lo de cada ranura. */
export function variantOf(home: HomeDef, h: HousingState | null): LocationDef {
  const base = baseLocation(home.location);
  const placed = h ? [...layout(h, home.id).values()].map((v) => v.placement) : [];
  return {
    ...base,
    props: [...base.props, ...placed.flatMap((p) => p.props)],
    spots: [...(base.spots ?? []), ...placed.flatMap((p) => p.spots ?? [])],
    inspects: [...(base.inspects ?? []), ...placed.flatMap((p) => p.inspects ?? [])],
  };
}

/**
 * Pone las casas como toca: la de ahora con sus mejoras, la otra tal cual los datos. Después, colisiones,
 * interacciones y rutas (LocationSystem.getLocation) salen de lo mismo. Se llama al cargar, al comprar y al mudarse.
 */
export function installAll(h: HousingState): void {
  for (const home of HOMES) installLocation(variantOf(home, home.id === h.home ? h : null));
}

// ----------------------------------------------------------------- comprar

export interface BuyResult {
  ok: boolean;
  message: string;
  housing: HousingState;
  money: number;
}

export function buyBlocker(h: HousingState, id: string, money: number, slot?: string): string | null {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return 'Eso no está en el catálogo.';
  if (h.owned.includes(id)) return installedIn(h).includes(id) ? 'Ya la tienes instalada: se tiene una sola. Desde el catálogo de casa se puede cambiar de sitio.' : 'Ya la tienes: está en el trastero.';
  if (!fits(u, h.home)) return `No cabe en ${shortName(getHome(h.home))}: no se puede instalar en esta casa.`;
  const free = freeSlots(h, id);
  if (!free.length) {
    const taken = optionsOf(u, h.home).map((p) => `${slotName(h.home, p.slot)} la ocupa ${getUpgrade(occupant(h, p.slot)!).name.toLowerCase()}`);
    return `No queda sitio: ${taken.join(' y ')}. Recoloca algo desde el catálogo de casa.`;
  }
  if (slot !== undefined && !free.some((p) => p.slot === slot)) {
    const who = occupant(h, slot);
    return who ? `${cap(slotName(h.home, slot))} ya la ocupa ${getUpgrade(who).name.toLowerCase()}.` : 'Ahí no va.';
  }
  if (money + 1e-9 < u.price) return `Te faltan ${euros(u.price - money)} (cuesta ${euros(u.price)}). Un turno o un encargo lo cubre; el catálogo sigue ahí.`;
  return null;
}

/** Antes de confirmar: lo que cuesta, dónde va y cómo queda el saldo. */
export function quote(h: HousingState, id: string, money: number): string {
  const u = getUpgrade(id);
  return `${u.name}. ${u.text} Se instala hoy mismo en ${shortName(getHome(h.home))}. Cuesta ${euros(u.price)}: saldo ${euros(money)} → ${euros(money - u.price)}.`;
}

/** Comprar e instalar: una sola vez (si ya es tuya, no cobra) y sólo si llega el dinero. */
export function buy(h: HousingState, id: string, money: number, slot?: string): BuyResult {
  const blocked = buyBlocker(h, id, money, slot);
  if (blocked) return { ok: false, message: blocked, housing: h, money };
  const u = getUpgrade(id);
  const at = slot ?? freeSlots(h, id)[0].slot;
  return {
    ok: true,
    message: `${u.name} instalada en ${slotName(h.home, at)}.`,
    housing: { ...h, owned: [...h.owned, id], slots: { ...h.slots, [id]: at } },
    money: Math.round((money - u.price) * 100) / 100,
  };
}

/** Cambiar de ranura algo ya instalado: a otra de las suyas que esté libre. No cobra ni crea otra: sólo cambia dónde está. */
export function relocate(h: HousingState, id: string, slot: string): { ok: boolean; message: string; housing: HousingState } {
  const fail = (message: string): { ok: boolean; message: string; housing: HousingState } => ({ ok: false, message, housing: h });
  if (!installedIn(h).includes(id)) return fail('Eso no está puesto en esta casa.');
  const u = getUpgrade(id);
  if (!optionsOf(u, h.home).some((p) => p.slot === slot)) return fail(`${u.name} no va en ${slotName(h.home, slot)}.`);
  const who = occupant(h, slot);
  if (who === id) return fail(`Ya está en ${slotName(h.home, slot)}.`);
  if (who) return fail(`${cap(slotName(h.home, slot))} ya la ocupa ${getUpgrade(who).name.toLowerCase()}.`);
  return { ok: true, message: `${u.name}: ahora en ${slotName(h.home, slot)}.`, housing: { ...h, slots: { ...h.slots, [id]: slot } } };
}

// ----------------------------------------------------------------- mudarse

export function moveBlocker(h: HousingState, toId: string, free: number, overdue: boolean): string | null {
  const to = HOMES.find((x) => x.id === toId);
  if (!to) return 'Esa casa no existe.';
  if (to.id === h.home) return 'Ya vives aquí.';
  if (!to.move) return 'No se puede alquilar.';
  if (overdue) return 'Tienes pagos vencidos. Ponte al día en Cuentas antes de mudarte.';
  if (free + 1e-9 < to.move.free) return `Aún no llegas: para mudarte hace falta tener ${euros(to.move.free)} libres (cartera menos lo que debes) y ahora tienes ${euros(Math.max(0, free))}. La mudanza cuesta ${euros(to.move.fee)}.`;
  return null;
}

const nameList = (ids: readonly string[]): string => ids.map((id) => getUpgrade(id).name).join(', ');

/** Antes de mudarse: coste, requisitos y consecuencias, con lo que se traslada y lo que se guarda. */
export function moveSummary(h: HousingState, toId: string): string {
  const from = getHome(h.home);
  const to = getHome(toId);
  const carried = installedIn(h, to.id);
  const parked = storedIn(h, to.id);
  const parts = [
    `${to.name}. ${to.text}`,
    to.move ? `Mudanza y fianza: ${euros(to.move.fee)}, una vez. Requisito: ${euros(to.move.free)} libres (cartera menos lo que debes) y ningún pago vencido.` : '',
    `Alquiler: ${euros(from.rent)} → ${euros(to.rent)} a la semana, desde el próximo periodo que se anuncie; lo ya anunciado no cambia.`,
    'Tu ropa, tatuajes, bolsa, tarjetas y dinero van contigo.',
    carried.length ? `Se trasladan y se instalan: ${nameList(carried)}.` : '',
    parked.length ? `No caben y se guardan en el trastero, sin perderse (vuelven a instalarse si regresas a una casa donde quepan): ${nameList(parked)}.` : '',
    'Una visita ya quedada se pasa a la casa nueva, a la misma hora.',
    'Apareces en la casa nueva; la anterior ya no es tuya y no se entra sin volver a alquilarla.',
  ];
  return parts.filter(Boolean).join(' ');
}

export function move(h: HousingState, toId: string, money: number, free: number, overdue: boolean): BuyResult {
  const blocked = moveBlocker(h, toId, free, overdue);
  if (blocked) return { ok: false, message: blocked, housing: h, money };
  const to = getHome(toId);
  const fee = to.move!.fee;
  if (money + 1e-9 < fee) return { ok: false, message: `No te llega para la mudanza (${euros(fee)}).`, housing: h, money };
  return { ok: true, message: `Te mudas a ${to.name}.`, housing: { ...h, home: toId }, money: Math.round((money - fee) * 100) / 100 };
}

/**
 * Al mudarse, la visita ya quedada (o propuesta) se pasa a la casa nueva: mismo día, misma hora y su rutina
 * fijada. Sin esto, alguien llamaría a la puerta de una casa que ya no es tuya. Devuelve las historias cambiadas.
 */
export function movePlans(stories: Readonly<Record<string, NamedStory>>, fromId: string, toId: string): Record<string, NamedStory> {
  const from = getHome(fromId).visitPlan;
  const to = getHome(toId).visitPlan;
  const out: Record<string, NamedStory> = {};
  for (const [npc, story] of Object.entries(stories)) {
    const def = STORIES[npc];
    if (!def?.plans[to]) continue;
    const s = structuredClone(story);
    let changed = false;
    if (s.plan?.id === from && s.plan.status === 'pending') {
      s.plan = { ...s.plan, id: to };
      s.routines[String(s.plan.day)] = def.plans[to].routine;
      changed = true;
    }
    if (s.offer?.plan === from) {
      s.offer = { ...s.offer, plan: to };
      changed = true;
    }
    if (changed) out[npc] = s;
  }
  return out;
}

// --------------------------------------------------- volver a casa, por datos

/** La puerta de la calle de la casa de ahora (localización y spawn): de ahí se sale y a ahí se vuelve. */
export function homeDoor(h: HousingState): { location: string; spawn: string } {
  const door = getHome(h.home).door;
  const street = allLocations().find((l) => (l.buildings ?? []).some((b) => b.id === door));
  if (!street) throw new Error(`La puerta ${door} no está en ningún mapa`);
  return { location: street.id, spawn: door };
}

/** Dónde aparece quien entra: el spawn de la entrada de la casa de ahora. */
export const homeEntry = (h: HousingState): { location: string; spawn: string } => ({ location: getHome(h.home).location, spawn: 'entry' });

/** ¿Se puede llegar andando de un tile a otro, o a uno pegado a él si el destino es un mueble? */
export function reaches(loc: LocationDef, a: TilePoint, b: TilePoint): boolean {
  if (a.tx === b.tx && a.ty === b.ty) return true;
  const key = (x: number, y: number): string => `${x},${y}`;
  const seen = new Set([key(a.tx, a.ty)]);
  const queue: TilePoint[] = [a];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = cur.tx + dx;
      const ty = cur.ty + dy;
      if (tx === b.tx && ty === b.ty) return true;
      if (seen.has(key(tx, ty)) || !isWalkable(loc, tx, ty)) continue;
      seen.add(key(tx, ty));
      queue.push({ tx, ty });
    }
  }
  return false;
}

/** El alquiler que se anuncia desde ahora (systems/Household.sync lo pone en los periodos nuevos). */
export const rentsOf = (h: HousingState): Record<string, number> => ({ rent: getHome(h.home).rent });
