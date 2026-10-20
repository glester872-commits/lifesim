// Sin Phaser: lo usan Menus, WorldScene, SaveSystem, main y scripts/check-housing.ts.
import { HOMES, UPGRADES, getHome, getUpgrade, type HomeDef, type UpgradeDef } from '../data/housing.ts';
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
}

export const startHousing = (): HousingState => ({ home: HOMES[0].id, owned: [] });

/** Una vivienda guardada, o la de partida: una partida anterior conserva su piso sin cobrar ni quitar nada. */
export function parseHousing(v: unknown): HousingState {
  const start = startHousing();
  if (typeof v !== 'object' || v === null) return start;
  const o = v as Record<string, unknown>;
  const home = HOMES.some((h) => h.id === o.home) ? (o.home as string) : start.home;
  const owned = Array.isArray(o.owned) ? [...new Set(o.owned.filter((id): id is string => typeof id === 'string' && UPGRADES.some((u) => u.id === id)))] : [];
  return { home, owned };
}

// ------------------------------------------------------------ qué hay dónde

export const fits = (u: UpgradeDef, homeId: string): boolean => !!u.placements[homeId];

/** Lo comprado que tiene sitio en esa casa (por defecto, la de ahora). */
export const installedIn = (h: HousingState, homeId = h.home): string[] => h.owned.filter((id) => fits(getUpgrade(id), homeId));

/** Lo comprado que no cabe ahí: en el trastero, intacto. */
export const storedIn = (h: HousingState, homeId = h.home): string[] => h.owned.filter((id) => !fits(getUpgrade(id), homeId));

const shortName = (home: HomeDef): string => home.name.split(' · ')[0].toLowerCase();

/** La localización de una casa con las mejoras puestas: los datos de siempre más lo de cada ranura. */
export function variantOf(home: HomeDef, ids: readonly string[]): LocationDef {
  const base = baseLocation(home.location);
  const placed = ids.flatMap((id) => getUpgrade(id).placements[home.id] ?? []);
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
  for (const home of HOMES) installLocation(variantOf(home, home.id === h.home ? installedIn(h) : []));
}

// ----------------------------------------------------------------- comprar

export interface BuyResult {
  ok: boolean;
  message: string;
  housing: HousingState;
  money: number;
}

export function buyBlocker(h: HousingState, id: string, money: number): string | null {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return 'Eso no está en el catálogo.';
  if (h.owned.includes(id)) return fits(u, h.home) ? 'Ya la tienes instalada.' : 'Ya la tienes: está en el trastero.';
  if (!fits(u, h.home)) return `No cabe en ${shortName(getHome(h.home))}: no se puede instalar en esta casa.`;
  if (money + 1e-9 < u.price) return `Te faltan ${euros(u.price - money)} (cuesta ${euros(u.price)}). Un turno o un encargo lo cubre; el catálogo sigue ahí.`;
  return null;
}

/** Antes de confirmar: lo que cuesta, dónde va y cómo queda el saldo. */
export function quote(h: HousingState, id: string, money: number): string {
  const u = getUpgrade(id);
  return `${u.name}. ${u.text} Se instala hoy mismo en ${shortName(getHome(h.home))}. Cuesta ${euros(u.price)}: saldo ${euros(money)} → ${euros(money - u.price)}.`;
}

/** Comprar e instalar: una sola vez (si ya es tuya, no cobra) y sólo si llega el dinero. */
export function buy(h: HousingState, id: string, money: number): BuyResult {
  const blocked = buyBlocker(h, id, money);
  if (blocked) return { ok: false, message: blocked, housing: h, money };
  const u = getUpgrade(id);
  return { ok: true, message: `${u.name} instalada.`, housing: { ...h, owned: [...h.owned, id] }, money: Math.round((money - u.price) * 100) / 100 };
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
