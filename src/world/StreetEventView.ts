import Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import type { Facing, LocationDef, TilePoint } from '../types/game';
import type { Agent } from '../systems/Crowd';
import type { Weather } from '../systems/Weather';
import { StreetEvent, fightFrame, type EventPhase, type Night, type Presence } from '../systems/StreetEvents';
import type { FighterProfile, StreetEventDef } from '../data/streetEvents';
import { PASSENGER_LOOKS } from '../data/npcs';
import { Character } from '../entities/Character';
import { CrowdView } from './CrowdView';
import { colorsOf, drawHuman, FIGHT_POSES, type Pose } from './HumanArt';
import { make, px } from './paint';
import { PLAYER_H, PLAYER_W } from './TextureFactory';
import { LAYER } from './Layers';

/**
 * Cómo se ve un evento de calle (systems/StreetEvents.ts): el corro con la
 * gente de siempre (una CrowdView más, así que se les puede hablar como a
 * cualquiera, y la ropa y el paraguas los pone el tiempo) y los dos que pelean
 * con sus poses de perfil, horneadas aparte y sólo para ellos.
 *
 * Estilizado y sin sangre: guardia, un golpe que se ve venir, alguien que
 * retrocede y un destello blanco de cinco píxeles. Lo demás lo cuenta el corro.
 */

const fightKey = (look: string, facing: Facing, pose: Pose, side: number): string => `fight-${look}-${side}-${facing}-${pose}`;

/** Diez poses de perfil por lado, horneadas una vez con margen para el gesto y el tamaño corporal. */
function bakeFighter(scene: Phaser.Scene, profile: FighterProfile, side: number): void {
  const look = PASSENGER_LOOKS.find((l) => l.id === profile.look)!;
  if (scene.textures.exists(fightKey(look.id, 'left', 31, side))) return;
  // La misma persona, sin bolso mientras pelea. La categoría corporal se ve,
  // pero la huella de colisión sigue siendo exactamente la del evento anterior.
  const colors = colorsOf({ ...look, bag: undefined, cap: undefined });
  const cell = document.createElement('canvas');
  cell.width = PLAYER_W;
  cell.height = PLAYER_H;
  const ctx = cell.getContext('2d');
  if (!ctx) return;
  const width = profile.body === 1 ? 14 : profile.body === 3 ? 18 : 16;
  const height = profile.body === 1 ? 23 : profile.body === 3 ? 25 : 24;
  for (const facing of ['left', 'right'] as const) {
    for (const pose of FIGHT_POSES) make(scene, fightKey(look.id, facing, pose, side), 24, 28, (dest) => {
      ctx.clearRect(0, 0, PLAYER_W, PLAYER_H);
      drawHuman(ctx, facing, pose, colors);
      // Dos cintas discretas permiten seguir a quién anima o apuesta cada vecino.
      px(ctx, side === 0 ? PALETTE.brickLit : PALETTE.glass, facing === 'right' ? 7 : 6, 12, 3, 2);
      dest.imageSmoothingEnabled = false;
      dest.drawImage(cell, Math.floor((24 - width) / 2), 28 - height, width, height);
    });
  }
}

const LABEL: Readonly<Record<string, string>> = {
  spectator: 'Alguien del corro',
  watcher: 'Alguien mirando desde lejos',
  lookout: 'Alguien en la boca del callejón',
  bookmaker: 'La persona de la libreta',
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
  private readonly comic: Phaser.GameObjects.Text;
  private readonly flow: Phaser.GameObjects.Text;
  private readonly tension: Phaser.GameObjects.Text;
  private readonly bookLabel: Phaser.GameObjects.Text;
  private readonly shouts: Phaser.GameObjects.Text[];
  private readonly money: Phaser.GameObjects.Image[];
  private readonly bookSlip: Phaser.GameObjects.Image;
  private readonly byId = new Map<number, Agent>();
  /** Lo último calculado: la fase y si la pelea ocupa el corro (WorldScene pone ahí un cuerpo sólido). */
  phaseNow: EventPhase = 'none';
  ringActive = false;
  private present: Presence[] = [];

  /** Quién está ahora en el corro (también quien pelea): esas personas no pueden andar a la vez por la calle (StreetLife.claimLooks). */
  get looks(): number[] {
    return this.present.map((p) => p.member.look);
  }
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
    const textStyle = { fontFamily: 'monospace', fontSize: '7px', fontStyle: 'bold', color: PALETTE.roadLine, stroke: PALETTE.ink, strokeThickness: 2, padding: { x: 1, y: 1 } };
    // Un pequeño pozo de efectos, sin tweens, timers ni objetos nuevos por golpe.
    this.comic = scene.add.text(0, 0, '', { ...textStyle, fontSize: '10px' }).setOrigin(0.5, 1).setResolution(3).setDepth(LAYER.light + 4).setVisible(false);
    this.tension = scene.add.text(0, 0, '', textStyle).setOrigin(0.5, 1).setResolution(3).setDepth(LAYER.light + 2).setVisible(false);
    this.flow = scene.add.text(0, 0, '', { ...textStyle, fontSize: '6px' }).setOrigin(0.5, 0).setResolution(3).setDepth(LAYER.light + 1).setVisible(false);
    this.bookLabel = scene.add.text(0, 0, 'apuestas · €5 / €10 / €20', { ...textStyle, fontSize: '6px' }).setOrigin(0.5, 1).setResolution(3).setDepth(LAYER.light + 1).setVisible(false);
    this.shouts = Array.from({ length: 2 }, () => scene.add.text(0, 0, '', textStyle).setOrigin(0.5, 1).setResolution(3).setDepth(LAYER.light + 2).setVisible(false));
    make(scene, 'fx-bet-cash', 7, 5, (ctx) => {
      px(ctx, PALETTE.outline, 0, 0, 7, 5);
      px(ctx, PALETTE.grassLit, 1, 1, 5, 3);
      px(ctx, PALETTE.roadLine, 3, 2, 1, 1);
    });
    this.money = Array.from({ length: 3 }, () => scene.add.image(0, 0, 'fx-bet-cash').setVisible(false));
    make(scene, 'fx-bet-book', 7, 8, (ctx) => {
      px(ctx, PALETTE.woodDark, 0, 0, 7, 8);
      px(ctx, PALETTE.white, 1, 1, 5, 6);
      for (const y of [2, 4, 6]) px(ctx, PALETTE.ink, 2, y, y === 4 ? 2 : 3, 1);
    });
    this.bookSlip = scene.add.image(0, 0, 'fx-bet-book').setVisible(false);
    make(scene, 'fx-alley-tag', 28, 8, (ctx) => {
      // Una pintada pequeña y torcida; las cajas y la lámpara de pinza ya son del patio.
      for (const [x, y, w, h] of [[0, 1, 2, 6], [2, 1, 5, 1], [4, 4, 2, 4], [8, 0, 2, 7], [10, 1, 5, 1], [13, 2, 2, 5], [17, 1, 2, 6], [19, 3, 6, 1], [23, 0, 2, 7]]) px(ctx, PALETTE.bikeLane, x, y, w, h);
    });
    scene.add.image((def.area.tx + def.area.w / 2) * TILE, (def.area.ty + 0.4) * TILE, 'fx-alley-tag').setDepth(LAYER.decal);
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
      const side = m.bet?.side ?? m.support ?? 0;
      const backed = night.fighters[side].nickname;
      const winner = night.fighters[night.winner].nickname;
      const result = night.raidAt === null && this.phaseNow === 'dispersing';
      const line = m.role === 'bookmaker'
        ? night.raidAt !== null && t >= night.raidAt ? 'Cierra la libreta. Cada cual por su lado.' : result ? winner + ' ha ganado. La libreta manda; cobrad y salid sin ruido.' : 'Cinco, diez o veinte. Rojo: ' + night.fighters[0].nickname + '; azul: ' + night.fighters[1].nickname + '. Todo en esta libreta, nada de fotos.'
        : m.bet ? result ? side === night.winner ? '¡' + backed + '! Hoy recupero mis ' + m.bet.stake + ' y algo más.' : 'Mis ' + m.bet.stake + ' se han ido con ' + backed + '. La próxima miro sin apostar.' : 'He puesto €' + m.bet.stake + ' por ' + backed + '. Mira cómo guarda la distancia.'
        : p.shout ?? pool[m.seed % pool.length];
      Object.assign(a, { look: m.look, x: p.x, y: p.y, dir: p.dir, moving: p.moving, state: p.state, line });
    }
    for (let i = this.agents.length - 1; i >= 0; i--) {
      if (here.has(this.agents[i].id)) continue;
      this.byId.delete(this.agents[i].id);
      this.agents.splice(i, 1);
    }

    // Los dos que pelean: andando, como cualquiera; en su sitio, con sus poses de perfil.
    const frame = fightFrame(night, t);
    const poses = frame.poses;
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
      bakeFighter(this.scene, night.fighters[i], i);
      const f = poses[i];
      sprite.anims.stop();
      sprite.setTexture(fightKey(look.id, facing, f.pose, i));
      sprite.shiftX(facing === 'right' ? f.dx : -f.dx);
      if (frame.contact && i !== frame.attacker) flash = { x: sprite.x + (facing === 'right' ? 4 : -4), y: sprite.y - 15 };
    });
    this.ringActive = atRing === 2 && (this.phaseNow === 'fight' || this.phaseNow === 'break');
    const hit = flash as { x: number; y: number } | null;
    if (hit) this.impact.setPosition(Math.round(hit.x), Math.round(hit.y)).setDepth(hit.y + 20).setAlpha(0.85).setVisible(true);
    else this.impact.setVisible(false);
    // Una palabra sólo en parte de los golpes que llegan. Los esquives no dan destello ni texto.
    this.comic.setVisible(!!hit && frame.comic !== null);
    this.tension.setVisible(atRing === 2 && frame.stage === 'argument');
    if (this.tension.visible) this.tension.setText(Math.floor(t) % 2 ? '¿Mucho hablar?' : '¡En guardia!').setPosition(this.event.center.tx * TILE + TILE / 2, Math.max(16, this.event.center.ty * TILE - 2));
    if (hit && frame.comic) this.comic.setText(frame.comic).setPosition(hit.x, Math.max(16, hit.y - 7)).setColor(frame.strong ? PALETTE.roadLine : PALETTE.pavementLit);
    const result = night.raidAt === null && (frame.stage === 'finish' && t >= night.rounds[night.rounds.length - 1][1] - 2 || this.phaseNow === 'dispersing' && t < night.end + 5);
    const stages: Readonly<Record<string, string>> = { 'face-off': 'Cara a cara', argument: 'Unas palabras...', stance: 'En guardia', exchange: 'Asalto', overwhelmed: night.fighters[night.winner].nickname + ' presiona', finish: result ? 'Gana ' + night.fighters[night.winner].nickname : 'Fin del asalto', break: 'Respiran · la libreta sigue', ended: result ? 'Gana ' + night.fighters[night.winner].nickname : 'Cada cual por su lado' };
    this.flow.setVisible(atRing === 2 && frame.stage !== 'waiting' && this.phaseNow !== 'none');
    if (this.flow.visible) this.flow.setText((stages[frame.stage] ?? '') + ' · ' + night.fighters[0].nickname + ' / ' + night.fighters[1].nickname).setPosition(this.event.center.tx * TILE + TILE / 2, (this.event.center.ty + 3) * TILE);
    const book = this.present.find((p) => p.member.role === 'bookmaker' && !p.moving);
    this.bookLabel.setVisible(!!book);
    this.bookSlip.setVisible(!!book);
    if (book) {
      this.bookLabel.setPosition(book.x * TILE + TILE / 2, Math.max(14, book.y * TILE - 7));
      this.bookSlip.setPosition(book.x * TILE + TILE / 2 + 1, (book.y + 1) * TILE - 10).setDepth((book.y + 1) * TILE + 2);
    }
    const cash = this.present.filter((p) => !p.moving && (p.member.role === 'bookmaker' || p.betting)).sort((a, b) => Number(b.member.role === 'bookmaker') - Number(a.member.role === 'bookmaker'));
    for (const [i, image] of this.money.entries()) {
      const p = cash[i];
      image.setVisible(!!p);
      if (p) image.setPosition(p.x * TILE + TILE / 2 + (p.member.role === 'bookmaker' ? 7 : 3), (p.y + 1) * TILE - 9).setDepth((p.y + 1) * TILE + 1);
    }
    // Dos voces como máximo, breves y legibles, siguiendo el mismo reloj que el público.
    const voices = this.present.filter((p) => !p.moving && p.shout && p.member.role !== 'fighter' && p.member.role !== 'bookmaker');
    const shift = Math.floor(t / 2);
    for (const [i, label] of this.shouts.entries()) {
      const p = voices.length ? voices[(shift + i) % voices.length] : undefined;
      label.setVisible(!!p && i < voices.length);
      if (p) label.setText(p.shout!).setPosition(p.x * TILE + TILE / 2, Math.max(14, p.y * TILE - 10));
    }
  }
}
