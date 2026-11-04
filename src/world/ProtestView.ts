import Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import type { Facing, LocationDef, SignalDef, TilePoint } from '../types/game';
import type { Agent } from '../systems/Crowd';
import type { Weather } from '../systems/Weather';
import type { ProtestDef } from '../data/protests';
import { PASSENGER_LOOKS } from '../data/npcs';
import { bannerText, lookOrder, Protest, protestRoute, type ProtestMember, type ProtestPhase } from '../systems/Protest';
import { CrowdView } from './CrowdView';
import { make, px } from './paint';
import { LAYER, standing } from './Layers';

/** Tiles por minuto de juego andando hasta su sitio y de vuelta. */
const WALK = 8;
/** La pancarta: tela de 40 × 12 entre dos palos que bajan hasta las manos. */
const BANNER_W = 44;
const BANNER_H = 22;
/** El borde de abajo de la pancarta, en px por encima de los pies: a la altura de las manos alzadas. */
const BANNER_LIFT = 26;

const POLICE_LINE = 'Buenas tardes. Todo tranquilo, circulen con calma.';

const stepDir = (a: TilePoint, b: TilePoint): Facing => (b.tx > a.tx ? 'right' : b.tx < a.tx ? 'left' : b.ty > a.ty ? 'down' : 'up');

/** A `d` tiles del principio del camino. */
function along(path: readonly TilePoint[], d: number): { x: number; y: number; dir: Facing } {
  if (path.length < 2) return { x: path[0].tx, y: path[0].ty, dir: 'down' };
  const i = Math.min(path.length - 2, Math.max(0, Math.floor(d)));
  const f = Math.min(1, Math.max(0, d - i));
  const [a, b] = [path[i], path[i + 1]];
  return { x: a.tx + (b.tx - a.tx) * f, y: a.ty + (b.ty - a.ty) * f, dir: stepDir(a, b) };
}

/**
 * Cómo se ve una concentración vecinal (systems/Protest.ts): su gente es una CrowdView más (se les habla como a
 * cualquiera), llega andando desde una entrada del barrio, se queda en su sitio mirando al centro y se va igual.
 * La mitad lleva pancarta; las pancartas son un pozo fijo de imágenes y textos creados una vez con la escena.
 */
export class ProtestView {
  readonly def: ProtestDef;
  readonly protest: Protest;
  readonly agents: Agent[] = [];
  readonly crowd: CrowdView;
  private readonly loc: LocationDef;
  private readonly byId = new Map<number, Agent>();
  private readonly banners: { image: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text; shown: string }[];
  private readonly routes = new Map<string, TilePoint[]>();
  private dayStart: number | null = null;
  private order: number[] = [];
  private phase: ProtestPhase = 'none';
  /** El corte de calzada (def.closure) como semáforo de Traffic.close, creado una vez. */
  readonly closure: SignalDef | undefined;

  /** La calle está cortada: del montaje a la dispersión; en la limpieza ya se reabre (fase de la última update()). */
  get closing(): boolean {
    return this.phase === 'setup' || this.phase === 'active' || this.phase === 'dispersal';
  }

  /** Los manifestantes presentes (la policía va de uniforme): no andan a la vez por la calle (StreetLife.claimLooks). */
  get looks(): number[] {
    return this.agents.filter((a) => a.role === 'manifestante').map((a) => a.look);
  }

  constructor(scene: Phaser.Scene, loc: LocationDef, def: ProtestDef, weather: () => Weather) {
    this.loc = loc;
    this.def = def;
    this.closure = def.closure ? { id: `${def.id}-closure`, ...def.closure } : undefined;
    this.protest = new Protest(def, loc);
    this.crowd = new CrowdView(scene, this, weather, true);
    make(scene, 'fx-protest-banner', BANNER_W, BANNER_H, (ctx) => {
      px(ctx, PALETTE.woodDark, 1, 0, 2, BANNER_H);
      px(ctx, PALETTE.woodDark, BANNER_W - 3, 0, 2, BANNER_H);
      px(ctx, PALETTE.wood, 1, 0, 1, BANNER_H);
      px(ctx, PALETTE.wood, BANNER_W - 3, 0, 1, BANNER_H);
      px(ctx, PALETTE.outline, 2, 1, BANNER_W - 4, 12);
      px(ctx, PALETTE.white, 3, 2, BANNER_W - 6, 10);
    });
    const style = { fontFamily: 'monospace', fontSize: '6px', color: PALETTE.ink, align: 'center' };
    this.banners = def.banners.map(() => ({
      image: scene.add.image(0, 0, 'fx-protest-banner').setOrigin(0.5, 1).setVisible(false),
      text: scene.add.text(0, 0, '', style).setOrigin(0.5, 0.5).setResolution(3).setDepth(LAYER.light + 1).setVisible(false),
      shown: '',
    }));
  }

  private route(m: ProtestMember, leg: 'in' | 'out'): TilePoint[] {
    const key = `${m.id}:${leg}`;
    let r = this.routes.get(key);
    if (!r) {
      // ponytail: sin camino (no debería pasar, scripts/check-protest-view.ts) va en línea recta.
      r = protestRoute(this.loc, m, leg) ?? (leg === 'in' ? [m.entry, m.slot] : [m.slot, m.exit]);
      this.routes.set(key, r);
    }
    return r;
  }

  /** `t`: minutos absolutos (día × 1440 + minuto del día), los de systems/Protest. */
  update(t: number, _time: number): void {
    const day = this.protest.dayAt(t);
    if (day.start !== this.dayStart) {
      this.dayStart = day.start;
      this.routes.clear();
      this.order = lookOrder(this.def.id, day.day, PASSENGER_LOOKS.map((l) => l.id));
    }
    this.phase = this.protest.phase(t);
    const active = this.phase === 'active';
    const center = this.def.center;
    const here = new Set<number>();
    let used = 0;
    for (const m of this.protest.presentAt(t)) {
      here.add(m.id);
      const police = m.role === 'policia';
      let a = this.byId.get(m.id);
      if (!a) {
        a = {
          id: m.id, kind: 'visitor', role: m.role, label: police ? 'Agente de policía' : 'Manifestante', line: '', look: 0,
          uniform: police ? 'uniforme-policia' : undefined, x: m.entry.tx, y: m.entry.ty, dir: 'down', moving: true, state: 'WATCH',
          speed: 0, path: [], timer: 0, plan: [], leaveSoon: false, leaving: false,
        };
        this.byId.set(m.id, a);
        this.agents.push(a);
      }
      if (!a.talking) {
        const lema = m.banner ?? this.def.banners[m.id % this.def.banners.length];
        const look = police ? 0 : this.order[(m.id - 1) % this.order.length];
        const inPath = this.route(m, 'in');
        const outPath = this.route(m, 'out');
        const walkedIn = (t - m.arrive) * WALK;
        const walkedOut = (t - (m.leave - (outPath.length - 1) / WALK)) * WALK;
        const p = walkedOut > 0 ? along(outPath, walkedOut) : walkedIn < inPath.length - 1 ? along(inPath, walkedIn) : null;
        const dx = center.tx - m.slot.tx;
        const dy = center.ty - m.slot.ty;
        const face: Facing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';
        Object.assign(a, {
          look, x: p ? p.x : m.slot.tx, y: p ? p.y : m.slot.ty, dir: p ? p.dir : face, moving: !!p, leaving: walkedOut > 0,
          line: police ? POLICE_LINE : `«${lema}». Venimos a pedirlo con calma.`,
        });
      }
      // La pancarta, sólo en su sitio y durante el acto.
      if (!m.banner || !active || a.moving || used >= this.banners.length) continue;
      const b = this.banners[used++];
      const text = bannerText(this.def, m.banner).join('\n');
      if (b.shown !== text) {
        b.shown = text;
        b.text.setScale(1).setText(text);
        b.text.setScale(Math.min(1, (BANNER_W - 8) / Math.max(1, b.text.width)));
      }
      const cx = a.x * TILE + TILE / 2;
      const feet = (a.y + 1) * TILE;
      b.image.setPosition(cx, feet - BANNER_LIFT).setDepth(standing(feet) + 1).setVisible(true);
      b.text.setPosition(cx, feet - BANNER_LIFT - BANNER_H + 7).setVisible(true);
    }
    for (let i = used; i < this.banners.length; i++) {
      this.banners[i].image.setVisible(false);
      this.banners[i].text.setVisible(false);
    }
    for (let i = this.agents.length - 1; i >= 0; i--) {
      if (here.has(this.agents[i].id)) continue;
      this.byId.delete(this.agents[i].id);
      this.agents.splice(i, 1);
    }
  }

  destroy(): void {
    for (const b of this.banners) {
      b.image.destroy();
      b.text.destroy();
    }
    this.agents.length = 0;
    this.byId.clear();
  }
}
