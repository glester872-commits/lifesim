import Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import type { LocationDef, TilePoint } from '../types/game';
import type { Agent } from '../systems/Crowd';
import type { Weather } from '../systems/Weather';
import type { EmergencyDef } from '../data/emergencies';
import { PASSENGER_LOOKS } from '../data/npcs';
import { incidentAt, phaseAt, stagingOf, type EmergencyPhase, type Incident, type Staging } from '../systems/Emergencies';
import { hashSeed } from '../systems/MetroDaily';
import { Character } from '../entities/Character';
import { CrowdView } from './CrowdView';
import { SmokeFx } from './SmokeFx';
import { make, px } from './paint';
import { LAYER, standing } from './Layers';

/** Ms reales entre bocanadas de humo con fuego y ya apagado: el emisor compartido (world/SmokeFx) tiene su propio tope. */
const PUFF_MS = 220;
const WISP_MS = 900;
/** Minutos de juego que tardan en ponerse en su sitio los curiosos y la dotación (y en irse). */
const SETTLE = 2;

/**
 * Cómo se ve una emergencia (systems/Emergencies.ts) en su barrio. Un número fijo de objetos creados una vez con la
 * escena (dos llamas, un chorro, la autobomba con su rotativo y la gente como una CrowdView más) que sólo se muestran,
 * se mueven o se esconden: sin tweens, timers ni listeners propios, y todo se va con la escena al cambiar de sitio.
 *
 * La autobomba aparece aparcada al llegar la dotación (su trayecto por la calle no se anima) y su fila base es sólida
 * mientras está; la puerta y la acera de la puerta se quedan siempre libres (scripts/check-emergencies.ts).
 */
export class EmergencyView {
  readonly def: EmergencyDef;
  /** Dotación y curiosos: CrowdView los pinta y WorldScene deja hablarles. */
  readonly agents: Agent[] = [];
  readonly crowd: CrowdView;
  phaseNow: EmergencyPhase = 'none';
  incident: Incident | null = null;
  /** Dónde se pone cada cosa en el portal del incidente en curso. */
  staging: Staging | null = null;
  private readonly scene: Phaser.Scene;
  private readonly loc: LocationDef;
  private readonly calls: () => Readonly<Record<string, number>>;
  private readonly flames: Phaser.GameObjects.Image[];
  private readonly water: Phaser.GameObjects.Image;
  private readonly engine: Phaser.GameObjects.Image | null;
  private readonly beacon: Phaser.GameObjects.Image;
  private readonly byId = new Map<number, Agent>();
  private lastPuff = 0;

  constructor(scene: Phaser.Scene, loc: LocationDef, def: EmergencyDef, weather: () => Weather, calls: () => Readonly<Record<string, number>>) {
    this.scene = scene;
    this.loc = loc;
    this.def = def;
    this.calls = calls;
    this.crowd = new CrowdView(scene, this, weather, true);
    // Dos llamas de 8 × 10 que se alternan: rojo de teja, naranja y el corazón amarillo de las farolas.
    for (const [i, lean] of [[0, 0], [1, 1]] as const) {
      make(scene, `fx-fire-${i}`, 8, 10, (ctx) => {
        px(ctx, PALETTE.brickLit, 1, 3 + lean, 6, 7 - lean);
        px(ctx, '#f08a24', 2, 2 + lean, 4, 7 - lean);
        px(ctx, '#f08a24', 3 + lean, 0, 2, 2 + lean);
        px(ctx, PALETTE.roadLine, 3, 5, 2, 4);
      });
    }
    make(scene, 'fx-beacon', 3, 2, (ctx) => px(ctx, '#5fb4ff', 0, 0, 3, 2));
    this.flames = [0, 1].map(() => scene.add.image(0, 0, 'fx-fire-0').setOrigin(0.5, 1).setVisible(false));
    // El chorro: un píxel blanco del motor estirado y girado (sin dibujar nada por frame).
    this.water = scene.add.image(0, 0, '__WHITE').setOrigin(0, 0.5).setTint(0xbfe3ff).setAlpha(0.8).setVisible(false);
    this.engine = scene.textures.exists('prop-fire-engine') ? scene.add.image(0, 0, 'prop-fire-engine').setOrigin(0.5, 1).setVisible(false) : null;
    this.beacon = scene.add.image(0, 0, 'fx-beacon').setVisible(false);
  }

  /** La fila base de la autobomba aparcada, en px, o null si ahora no está: WorldScene pone ahí un cuerpo sólido. */
  get engineRect(): Phaser.Geom.Rectangle | null {
    const e = this.staging?.engine;
    if (!e || !this.engineParked) return null;
    return new Phaser.Geom.Rectangle(e[0].tx * TILE, e[0].ty * TILE + 6, e.length * TILE, TILE - 6);
  }

  /** Lo que encuadra «Mirar»: la fachada del portal. */
  get ringRect(): Phaser.Geom.Rectangle {
    const d = this.staging?.door ?? { tx: 0, ty: 0 };
    return new Phaser.Geom.Rectangle((d.tx - 3) * TILE, (d.ty - 6) * TILE, 7 * TILE, 8 * TILE);
  }

  private get engineParked(): boolean {
    return this.phaseNow === 'extinguishing' || this.phaseNow === 'cleanup';
  }

  /** ¿Lo tiene cerca el jugador? A unos pasos de la puerta y con algo que ver. */
  noticedFrom(p: TilePoint): boolean {
    const d = this.staging?.door;
    return !!d && this.phaseNow !== 'none' && Math.abs(p.tx - d.tx) <= 6 && p.ty >= d.ty - 1 && p.ty <= d.ty + 5;
  }

  /** La persona más cercana a (x, y), para hablarle. */
  nearestPerson(x: number, y: number): Character | undefined {
    let best: Character | undefined;
    let d = Infinity;
    for (const c of this.crowd.people) {
      const dd = Math.hypot(c.x - x, c.y - y);
      if (c.visible && dd < d) [best, d] = [c, dd];
    }
    return best;
  }

  /** Quién está ahora (los curiosos): esas personas no andan a la vez por la calle (StreetLife.claimLooks). */
  get looks(): number[] {
    return this.agents.filter((a) => a.role === 'onlooker').map((a) => a.look);
  }

  /** `t`: minutos absolutos (día × 1440 + minuto del día); `time`: ms de la escena, para el humo y el parpadeo. */
  update(t: number, time: number): void {
    const inc = incidentAt(this.def, t, this.calls());
    if (inc?.site !== this.incident?.site || inc?.start !== this.incident?.start) this.staging = inc ? stagingOf(this.def, this.loc, inc.site) : null;
    this.incident = inc;
    this.phaseNow = phaseAt(inc, t);
    const s = this.staging;
    if (!inc || !s || this.phaseNow === 'none') return this.hide();

    const building = this.loc.buildings?.find((b) => b.id === inc.site);
    const roofY = building ? building.ty * TILE + 8 : (s.door.ty - 6) * TILE;
    const windowY = building ? (building.ty + building.h - 3) * TILE : (s.door.ty - 3) * TILE;
    // Las llamas, en dos ventanas del primer piso a los lados de la puerta; se van apagando a mitad de la extinción.
    const burning = this.phaseNow !== 'cleanup' && (this.phaseNow !== 'extinguishing' || t < inc.arrive + (inc.out - inc.arrive) * 0.6);
    const flick = Math.floor(time / 140) % 2;
    this.flames.forEach((f, i) => {
      const x = (s.door.tx + (i ? 2 : -2)) * TILE + TILE / 2;
      f.setVisible(burning && (i === 0 || this.phaseNow !== 'extinguishing')).setTexture(`fx-fire-${(flick + i) % 2}`).setPosition(x, windowY).setDepth(LAYER.overhead - 2);
    });
    // Humo: espeso con fuego, un hilo al final. Limitado por tiempo real y por el tope del emisor compartido.
    const every = burning ? PUFF_MS : WISP_MS;
    if (time - this.lastPuff >= every) {
      this.lastPuff = time;
      const fx = SmokeFx.of(this.scene);
      const x = (s.door.tx + (inc.seed % 3) - 1) * TILE + TILE / 2;
      if (burning) fx.puff(x, roofY, 2);
      else fx.wisp(x, roofY);
    }

    // La autobomba, aparcada desde que llega hasta que acaba; el rotativo parpadea mientras trabajan.
    const e = s.engine;
    const parked = this.engineParked && !!e;
    if (this.engine) {
      this.engine.setVisible(parked);
      if (parked && e) this.engine.setPosition(e[0].tx * TILE + (e.length * TILE) / 2, (e[0].ty + 1) * TILE).setDepth(standing((e[0].ty + 1) * TILE));
    }
    this.beacon.setVisible(parked && this.phaseNow === 'extinguishing' && Math.floor(time / 300) % 2 === 0);
    if (parked && e) this.beacon.setPosition(e[0].tx * TILE + (e.length * TILE) / 2, (e[0].ty - 1) * TILE + 3).setDepth(standing((e[0].ty + 1) * TILE) + 1);

    // La gente: los curiosos llegan con el humo y se van al recoger; la dotación baja de la autobomba al llegar.
    const want: { id: number; role: 'firefighter' | 'onlooker'; at: TilePoint; from: TilePoint; since: number; until: number }[] = [];
    const side = (p: TilePoint, dx: number): TilePoint => ({ tx: p.tx + dx, ty: p.ty });
    s.onlookers.forEach((p, i) => want.push({ id: i, role: 'onlooker', at: p, from: side(p, i % 2 ? 5 : -5), since: inc.start + 2 + i * 2, until: inc.out + 4 + i * 2 }));
    s.crew.forEach((p, i) => want.push({ id: 100 + i, role: 'firefighter', at: p, from: e ? e[i % e.length] : s.door, since: inc.arrive, until: inc.end - SETTLE }));
    const here = new Set<number>();
    for (const w of want) {
      if (t < w.since || t >= w.until + SETTLE) continue;
      here.add(w.id);
      let a = this.byId.get(w.id);
      if (!a) {
        const look = ((hashSeed(this.def.id, inc.seed, w.id) % PASSENGER_LOOKS.length) + PASSENGER_LOOKS.length) % PASSENGER_LOOKS.length;
        const crew = w.role === 'firefighter';
        a = {
          id: 9000 + w.id, kind: crew ? 'staff' : 'visitor', role: w.role, label: crew ? 'Bombero · Parque de Vallesco' : 'Vecina mirando', line: '', look,
          uniform: crew ? 'uniforme-bomberos' : undefined, x: w.from.tx, y: w.from.ty, dir: 'up', moving: false, state: 'WATCH', speed: 0, path: [], timer: 0, plan: [], leaveSoon: false, leaving: false,
        };
        this.byId.set(w.id, a);
        this.agents.push(a);
      }
      if (a.talking) continue;
      // Llegar y marcharse en línea recta por la acera, en SETTLE minutos; en su sitio, mirando a la fachada.
      const going = t >= w.until;
      const k = going ? Math.min(1, (t - w.until) / SETTLE) : Math.min(1, (t - w.since) / SETTLE);
      const [p0, p1] = going ? [w.at, w.from] : [w.from, w.at];
      const pool = w.role === 'firefighter' ? this.def.lines.crew : this.def.lines.onlooker;
      Object.assign(a, {
        x: p0.tx + (p1.tx - p0.tx) * k, y: p0.ty + (p1.ty - p0.ty) * k, moving: k < 1,
        dir: k < 1 ? (p1.tx > p0.tx ? 'right' : p1.tx < p0.tx ? 'left' : p1.ty > p0.ty ? 'down' : 'up') : 'up',
        state: w.role === 'firefighter' && this.phaseNow === 'extinguishing' ? 'WORK' : 'WATCH',
        line: pool[(inc.seed + w.id) % pool.length],
      });
    }
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const id = this.agents[i].id - 9000;
      if (here.has(id)) continue;
      this.byId.delete(id);
      this.agents.splice(i, 1);
    }

    // El chorro: del primer bombero a la llama que queda, mientras apagan.
    const nozzle = this.agents.find((a) => a.role === 'firefighter' && !a.moving);
    const target = this.flames[0];
    const spraying = this.phaseNow === 'extinguishing' && !!nozzle && target.visible;
    this.water.setVisible(spraying);
    if (spraying && nozzle) {
      const x0 = nozzle.x * TILE + TILE / 2;
      const y0 = (nozzle.y + 1) * TILE - 12;
      const dx = target.x - x0;
      const dy = target.y - 5 - y0;
      this.water.setPosition(x0, y0).setDisplaySize(Math.hypot(dx, dy), 2).setRotation(Math.atan2(dy, dx)).setAlpha(0.55 + 0.3 * flick).setDepth(LAYER.overhead - 1);
    }
  }

  private hide(): void {
    for (const f of this.flames) f.setVisible(false);
    this.water.setVisible(false);
    this.engine?.setVisible(false);
    this.beacon.setVisible(false);
    if (this.agents.length) {
      this.agents.length = 0;
      this.byId.clear();
    }
  }
}
