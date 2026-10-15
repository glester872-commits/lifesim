// Sin Phaser: world/LitterView.ts lo pinta, systems/StreetLife.ts lo limpia con la gente de limpieza viaria
// y scripts/check-litter.ts lo simula durante días con exactamente esta lógica.
import type { LocationDef, TilePoint } from '../types/game.ts';
import { absMinute } from './Handoff.ts';
import { ROADWAY, isStandable } from './LocationSystem.ts';
import { hashSeed, seededRng, type Rng } from './MetroDaily.ts';
import { zoneActivity, zoneAt, type ZoneClock } from './Zones.ts';
import { matchLitter } from './Match.ts';
import { LOCATION_DISTRICT } from '../data/districtIdentity.ts';
import type { ZoneType } from '../data/zones.ts';
import { PROPS } from '../world/tiles.ts';

export type LitterKind = 'paper' | 'cup' | 'wrapper' | 'can' | 'takeaway';

export interface LitterItem {
  id: number;
  kind: LitterKind;
  tx: number;
  ty: number;
  /** Minuto absoluto de juego en que cayó y cuánto dura si nadie lo recoge. */
  born: number;
  ttl: number;
  /** Quién (id de agente) va a recogerlo; `failed`, que nadie ha podido llegar y no se vuelve a intentar. */
  claimedBy?: number;
  failed?: boolean;
}

/** Como mucho tanta basura a la vez en toda la calle: nunca un suelo sucio, sólo lo justo para que se vea la vida. */
export const LITTER_CAP = 8;
/** Y en un mismo rincón (LOCAL_R tiles alrededor de donde cae): un foco, no un vertedero. */
export const LOCAL_CAP = 3;
const LOCAL_R = 3;
/** Con una papelera (cualquier PropDef.waste) a menos de BIN_R tiles, se tira al suelo bastante menos. */
const BIN_R = 5;
const BIN_DAMP = 0.35;
/** Cada cuántos minutos de juego se decide si cae algo, y la probabilidad base de cada decisión. */
const TICK_MINUTES = 5;
const DROP_CHANCE = 0.12;
/** Cuánto dura sin que nadie lo recoja (el viento, el camión de baldeo): de dos a cinco horas de juego. */
const TTL: readonly [number, number] = [120, 300];

/** Qué se ensucia: dónde cae según lo que lo rodea. */
interface Source {
  tx: number;
  ty: number;
  kinds: readonly LitterKind[];
  weight: number;
  /** Mesa de terraza: pesa según la gente que hay sentada alrededor. */
  table?: boolean;
  /** Sitio de noche (la cola, la puerta a fumar): pesa más de madrugada. */
  night?: boolean;
  /** Hay papelera cerca: se tira menos al suelo. */
  binned: boolean;
}

/** Lo que ensucia la gente al usarlo. Una papelera no: es donde va la basura, no de donde sale. */
const PROP_SOURCES: Readonly<Record<string, { kinds: readonly LitterKind[]; weight: number; table?: boolean }>> = {
  'cafe-table': { kinds: ['cup', 'takeaway', 'paper'], weight: 1.2, table: true },
  'plaza-bench': { kinds: ['wrapper', 'cup'], weight: 0.4 },
  bench: { kinds: ['wrapper', 'cup'], weight: 0.2 },
  'bus-stop': { kinds: ['paper', 'cup'], weight: 0.5 },
  kiosk: { kinds: ['paper', 'wrapper', 'can'], weight: 0.5 },
  vending: { kinds: ['can', 'wrapper'], weight: 0.6 },
};

/** Cuánto ensucia cada tipo de zona: casi nada en lo residencial y en el parque, algo donde se come, se sale o se compra. */
const ZONE_FACTOR: Readonly<Partial<Record<ZoneType, number>>> = {
  residential: 0.1, park: 0.15, main_road: 0.3, plaza: 1, commercial: 1, metro: 1, nightlife: 1.5, restaurant_area: 1.5, gym_area: 0.3, special_event_area: 1.2,
};

export class Litter {
  items: LitterItem[] = [];
  /** Totales, para comprobar que no crece sin freno. */
  spawned = 0;
  removed = 0;
  private nextId = 1;
  private nextAt = -1;
  private readonly sources: Source[] = [];
  private readonly loc: LocationDef;

  constructor(loc: LocationDef) {
    this.loc = loc;
    const bins = loc.props.filter((p) => PROPS[p.kind].waste);
    const binned = (tx: number, ty: number): boolean => bins.some((b) => Math.hypot(b.tx - tx, b.ty - ty) <= BIN_R);
    for (const p of loc.props) {
      const def = PROP_SOURCES[p.kind];
      if (def) this.sources.push({ tx: p.tx, ty: p.ty, kinds: def.kinds, weight: def.weight, table: def.table, binned: binned(p.tx, p.ty) });
    }
    // La cola y la puerta de fumar de la noche (los puntos de la calle).
    for (const [id, p] of Object.entries(loc.points ?? {})) {
      if (/SMOKE|QUEUE/.test(id)) this.sources.push({ tx: p.tx, ty: p.ty, kinds: ['can', 'cup', 'paper'], weight: 1.2, night: true, binned: binned(p.tx, p.ty) });
    }
  }

  get size(): number {
    return this.items.length;
  }

  /**
   * Lo que cae al empezar: un rastro pequeño de lo que lleva el día, con edades repartidas (la escena se rehace al
   * entrar). Casi nada a media mañana, recién barrido; algo más tras la comida y de madrugada, cuando se ha salido.
   */
  seed(clock: ZoneClock, crowdNear: (tx: number, ty: number) => number): void {
    const now = absMinute(clock.day, clock.hour, clock.minute);
    const h = clock.hour;
    const attempts = (h >= 14 && h < 18) || h >= 22 || h < 4 ? 3 : h >= 6 && h < 9 ? 2 : 1;
    for (let i = 0; i < attempts; i++) {
      const item = this.drop(clock, now, crowdNear, seededRng(hashSeed('litter-seed', this.loc.id, clock.day, i, Math.floor(now / 30))));
      if (item) item.born = now - Math.floor(((item.ttl * 0.8) * (i + 1)) / attempts);
    }
    this.nextAt = now + TICK_MINUTES;
  }

  /** Cada pocos minutos de juego decide si cae algo; lo viejo se va solo. */
  update(clock: ZoneClock, crowdNear: (tx: number, ty: number) => number): void {
    const now = absMinute(clock.day, clock.hour, clock.minute);
    if (this.nextAt < 0) this.nextAt = now;
    if (now < this.nextAt) return;
    this.nextAt = now + TICK_MINUTES;
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (now - this.items[i].born > this.items[i].ttl) {
        this.items.splice(i, 1);
        this.removed++;
      }
    }
    const rng = seededRng(hashSeed('litter', this.loc.id, now));
    // Después del partido (systems/Match) cae mucho más y cabe más en el suelo: vasos, papeles, latas; la limpieza viaria
    // lo recoge igual. Sin partido, surge 1: lo de siempre.
    const surge = matchLitter(LOCATION_DISTRICT[this.loc.id], clock);
    const cap = Math.round(LITTER_CAP * Math.min(2.5, surge));
    const local = Math.round(LOCAL_CAP * Math.min(2, surge));
    // Menos probable cuanto más lleno esté el cupo: el suelo no se llena.
    for (let k = 0; k < Math.ceil(surge); k++) {
      if (rng() < DROP_CHANCE * Math.min(1, surge - k) * (1 - this.items.length / cap)) this.drop(clock, now, crowdNear, rng, cap, local);
    }
  }

  /** La basura más cercana a (x, y) a menos de `radius` tiles que nadie más va a recoger. */
  nearest(x: number, y: number, radius: number, who: number, alive: (id: number) => boolean): LitterItem | undefined {
    let best: LitterItem | undefined;
    let bestD = radius;
    for (const it of this.items) {
      if (it.failed || (it.claimedBy !== undefined && it.claimedBy !== who && alive(it.claimedBy))) continue;
      const d = Math.hypot(it.tx - x, it.ty - y);
      if (d < bestD) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  remove(id: number): void {
    const i = this.items.findIndex((it) => it.id === id);
    if (i < 0) return;
    this.items.splice(i, 1);
    this.removed++;
  }

  private drop(clock: ZoneClock, now: number, crowdNear: (tx: number, ty: number) => number, rng: Rng, cap = LITTER_CAP, local = LOCAL_CAP): LitterItem | undefined {
    if (this.items.length >= cap) return undefined;
    const t = clock.hour + clock.minute / 60;
    const night = t >= 20 || t < 3;
    const meal = (t >= 13 && t < 16) || (t >= 20 && t < 23);
    const options: [Source, number][] = [];
    for (const s of this.sources) {
      const zone = zoneAt(this.loc.id, s.tx, s.ty);
      // Fuera de toda zona (un sitio sin vida) cae poco; en una zona, lo que dé su tipo por lo animada que esté.
      let w = s.weight * (zone ? (ZONE_FACTOR[zone.type] ?? 1) * zoneActivity(zone, clock) : 0.1);
      if (s.table) w *= (meal ? 1.8 : 1) * (0.3 + Math.min(3, crowdNear(s.tx, s.ty)) * 0.9);
      if (s.night) w *= night ? 2 : 0.05;
      if (s.binned) w *= BIN_DAMP;
      // El rincón ya tiene su foco: lo siguiente cae en otra parte (o no cae).
      if (this.items.filter((it) => Math.abs(it.tx - s.tx) <= LOCAL_R && Math.abs(it.ty - s.ty) <= LOCAL_R).length >= local) w = 0;
      if (w > 0) options.push([s, w]);
    }
    const total = options.reduce((n, [, w]) => n + w, 0);
    if (total <= 0) return undefined;
    let roll = rng() * total;
    const source = options.find(([, w]) => (roll -= w) < 0)?.[0] ?? options[options.length - 1][0];
    const at = this.spot(source, rng);
    if (!at) return undefined;
    const item: LitterItem = {
      id: this.nextId++, kind: source.kinds[Math.floor(rng() * source.kinds.length)], tx: at.tx, ty: at.ty,
      born: now, ttl: TTL[0] + Math.floor(rng() * (TTL[1] - TTL[0])),
    };
    this.items.push(item);
    this.spawned++;
    return item;
  }

  /** Un tile libre pegado a la fuente: suelo de acera o plaza, nunca calzada, ni pared, ni encima de otra basura. */
  private spot(s: Source, rng: Rng): TilePoint | undefined {
    const near: TilePoint[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = s.tx + dx;
        const ty = s.ty + dy;
        const ch = this.loc.ground[ty]?.[tx];
        if (ch === undefined || ROADWAY.has(ch) || !isStandable(this.loc, tx, ty)) continue;
        if (this.items.some((it) => it.tx === tx && it.ty === ty)) continue;
        near.push({ tx, ty });
      }
    }
    return near.length ? near[Math.floor(rng() * near.length)] : undefined;
  }
}
