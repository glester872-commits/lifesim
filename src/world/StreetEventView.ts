import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { Facing, LocationDef, TilePoint } from '../types/game';
import type { Agent } from '../systems/Crowd';
import type { Weather } from '../systems/Weather';
import { StreetEvent, fighterPoses, type EventPhase, type Night, type Presence } from '../systems/StreetEvents';
import type { StreetEventDef } from '../data/streetEvents';
import { PASSENGER_LOOKS } from '../data/npcs';
import { Character } from '../entities/Character';
import { CrowdView } from './CrowdView';
import { colorsOf, drawHuman, FIGHT_POSES, type Pose } from './HumanArt';
import { make, px } from './paint';
import { PLAYER_H, PLAYER_W } from './TextureFactory';

/**
 * Cómo se ve un evento de calle (systems/StreetEvents.ts): el corro con la
 * gente de siempre (una CrowdView más, así que se les puede hablar como a
 * cualquiera, y la ropa y el paraguas los pone el tiempo) y los dos que pelean
 * con sus poses de perfil, horneadas aparte y sólo para ellos.
 *
 * Estilizado y sin sangre: guardia, un golpe que se ve venir, alguien que
 * retrocede y un destello blanco de cinco píxeles. Lo demás lo cuenta el corro.
 */

const fightKey = (look: string, facing: Facing, pose: Pose): string => `fight-${look}-${facing}-${pose}`;

/** Las poses de pelea de un aspecto, de perfil: 8 texturas de 16 × 24, sólo para quien pelea y una vez. */
function bakeFighter(scene: Phaser.Scene, lookIndex: number): void {
  const look = PASSENGER_LOOKS[lookIndex];
  if (scene.textures.exists(fightKey(look.id, 'left', 10))) return;
  const colors = colorsOf(look);
  for (const facing of ['left', 'right'] as const) {
    for (const pose of FIGHT_POSES) make(scene, fightKey(look.id, facing, pose), PLAYER_W, PLAYER_H, (ctx) => drawHuman(ctx, facing, pose, colors));
  }
}

const LABEL: Readonly<Record<string, string>> = {
  spectator: 'Alguien del corro',
  watcher: 'Alguien mirando desde lejos',
  lookout: 'Alguien en la boca del callejón',
};

export class StreetEventView {
  readonly def: StreetEventDef;
  readonly event: StreetEvent;
  /** El corro, como gente de la calle: CrowdView los pinta y WorldScene deja hablarles. */
  readonly agents: Agent[] = [];
  readonly crowd: CrowdView;
  private readonly scene: Phaser.Scene;
  private readonly fighters: Character[];
  private readonly impact: Phaser.GameObjects.Image;
  private readonly byId = new Map<number, Agent>();
  /** Lo último calculado: la fase y si la pelea ocupa el corro (WorldScene pone ahí un cuerpo sólido). */
  phaseNow: EventPhase = 'none';
  ringActive = false;
  private present: Presence[] = [];
  /**
   * Retraso de cada uno (minutos de juego): quien habla con el jugador se para
   * (su reloj no avanza) y, al despedirse, sigue desde donde estaba, un poco
   * detrás de los demás; nunca se desliza ni salta. Se olvida al cambiar de noche.
   */
  private readonly lags = new Map<number, number>();
  private lastT: number | null = null;
  private lastNight: Night | null = null;

  constructor(scene: Phaser.Scene, loc: LocationDef, def: StreetEventDef, weather: () => Weather) {
    this.scene = scene;
    this.def = def;
    this.event = new StreetEvent(def, loc);
    this.crowd = new CrowdView(scene, this, weather, true);
    const nobody = { ...PASSENGER_LOOKS[0], name: '', lines: [] };
    this.fighters = [new Character(scene, nobody, 1), new Character(scene, nobody, 2)];
    for (const f of this.fighters) f.place(null);
    make(scene, 'fx-impact', 5, 5, (ctx) => {
      px(ctx, '#ffffff', 2, 0, 1, 5);
      px(ctx, '#ffffff', 0, 2, 5, 1);
    });
    this.impact = scene.add.image(0, 0, 'fx-impact').setVisible(false);
  }

  /** El corro en px: donde pelean no se entra. */
  get ringRect(): Phaser.Geom.Rectangle {
    const r = this.event.ring;
    return new Phaser.Geom.Rectangle(r[0].tx * TILE, r[0].ty * TILE + 6, r.length * TILE, TILE - 6);
  }

  /** ¿Lo tiene delante el jugador? Dentro del sitio (con un tile de margen) y con alguien ya en su sitio. */
  noticedFrom(p: TilePoint): boolean {
    const a = this.def.area;
    const near = p.tx >= a.tx - 1 && p.tx <= a.tx + a.w && p.ty >= a.ty - 1 && p.ty <= a.ty + a.h;
    return near && this.phaseNow !== 'none' && this.present.some((q) => !q.moving);
  }

  /** La persona del corro más cercana a (x, y), para hablarle. */
  nearestPerson(x: number, y: number): Character | undefined {
    let best: Character | undefined;
    let d = Infinity;
    for (const c of this.crowd.people) {
      const dd = Math.hypot(c.x - x, c.y - y);
      if (c.visible && dd < d) [best, d] = [c, dd];
    }
    return best;
  }

  /** `t`: minutos absolutos (día × 1440 + minuto del día), los de systems/StreetEvents. */
  update(t: number, time: number): void {
    const night = this.event.nightAt(t);
    this.phaseNow = this.event.phase(t);
    if (night !== this.lastNight) {
      this.lags.clear();
      this.lastNight = night;
    }
    const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;
    for (const a of this.agents) if (a.talking) this.lags.set(a.id, (this.lags.get(a.id) ?? 0) + dt);
    this.present = night.happens
      ? night.members.map((m) => this.event.memberAt(night, m, t - (this.lags.get(m.id) ?? 0))).filter((p): p is Presence => p !== null)
      : [];
    const lines = this.def.lines;
    const said = this.phaseNow === 'gathering' ? lines.gathering : this.phaseNow === 'fight' || this.phaseNow === 'break' ? lines.fight : lines.dispersing;

    // El corro: un agente por persona, el mismo objeto mientras siga aquí.
    const here = new Set<number>();
    for (const p of this.present) {
      const m = p.member;
      if (m.role === 'fighter') continue;
      here.add(m.id);
      let a = this.byId.get(m.id);
      if (!a) {
        a = { id: m.id, kind: 'visitor', role: m.role, label: LABEL[m.role], line: '', look: m.look, x: 0, y: 0, dir: 'down', moving: false, state: 'WATCH', speed: 0, path: [], timer: 0, plan: [], leaveSoon: false, leaving: false };
        this.byId.set(m.id, a);
        this.agents.push(a);
      }
      const pool = m.role === 'lookout' ? lines.lookout : said;
      Object.assign(a, { look: m.look, x: p.x, y: p.y, dir: p.dir, moving: p.moving, state: p.state, line: pool[m.seed % pool.length] });
    }
    for (let i = this.agents.length - 1; i >= 0; i--) {
      if (here.has(this.agents[i].id)) continue;
      this.byId.delete(this.agents[i].id);
      this.agents.splice(i, 1);
    }

    // Los dos que pelean: andando, como cualquiera; en su sitio, con sus poses de perfil.
    const poses = fighterPoses(night, t);
    let flash: { x: number; y: number } | null = null;
    let atRing = 0;
    this.fighters.forEach((sprite, i) => {
      const slot = this.def.fighters[i];
      const p = this.present.find((q) => q.member.role === 'fighter' && q.member.slot === slot);
      if (!p) {
        sprite.place(null);
        return;
      }
      const look = PASSENGER_LOOKS[p.member.look];
      if (sprite.def.id !== look.id) sprite.reuse({ ...look, name: 'Alguien que pelea', lines: [] }, p.member.seed);
      const facing = slot.facing === 'left' ? 'left' : 'right';
      sprite.place({ tx: p.x, ty: p.y, dir: p.moving ? p.dir : facing, moving: p.moving }, time);
      if (p.moving) return;
      atRing++;
      bakeFighter(this.scene, p.member.look);
      const f = poses[i];
      sprite.anims.stop();
      sprite.setTexture(fightKey(look.id, facing, f.pose));
      sprite.shiftX(facing === 'right' ? f.dx : -f.dx);
      if (f.hit) flash = { x: sprite.x + (facing === 'right' ? 9 : -9), y: sprite.y - 15 };
    });
    this.ringActive = atRing === 2 && (this.phaseNow === 'fight' || this.phaseNow === 'break');
    const hit = flash as { x: number; y: number } | null;
    if (hit) this.impact.setPosition(Math.round(hit.x), Math.round(hit.y)).setDepth(hit.y + 20).setAlpha(0.85).setVisible(true);
    else this.impact.setVisible(false);
  }
}
