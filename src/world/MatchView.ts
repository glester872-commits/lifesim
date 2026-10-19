import Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { ARENA_CLUB } from '../data/cityEvents';
import { FORMATION, HOME_KIT, LIVE_END, RIVAL_KITS, type Kit } from '../data/matchPlay';
import { announcement, fixtureAt, pitchAt, stateAt, type Moment, type Timeline } from '../systems/MatchPlay';
import { make, px, shade, type Ctx } from './paint';

/**
 * El partido sobre el césped del estadio (LocationDef.pitch): las líneas del campo, catorce muñecos (siete por equipo),
 * el balón y el marcador. Todo sale de systems/MatchPlay a la hora del mundo: aquí no se decide nada, sólo se pinta.
 *
 *   - Los muñecos se crean una vez y se reutilizan (se esconden en el descanso y al acabar): ni uno nuevo por jugada.
 *   - El marcador se repinta a ratos (MARK_MS), no cada fotograma.
 *   - Un suceso se cuenta en el marcador sólo si se ha visto pasar (el reloj ha corrido por encima de su minuto):
 *     llegar con el partido empezado no celebra los goles de antes, y un salto de tiempo los resume en una línea.
 */
const MARK_MS = 200;
const NOTE_MS = 4_000;
const FIG_W = 6;
const FIG_H = 10;

const SKIN = ['#e0b08c', '#c48a64', '#8d5a3c', '#f0c8a8'];

function drawFigure(ctx: Ctx, shirt: string, shorts: string, frame: number, skin: string): void {
  px(ctx, PALETTE.hair, 2, 0, 2, 1);
  px(ctx, skin, 2, 1, 2, 1);
  px(ctx, shirt, 1, 2, 4, 4);
  px(ctx, shade(shirt, 0.18), 1, 2, 4, 1);
  px(ctx, skin, 0, 3, 1, 2);
  px(ctx, skin, 5, 3, 1, 2);
  px(ctx, shorts, 1, 6, 4, 2);
  const legs = frame === 0 ? [1, 4] : [2, 3];
  for (const x of legs) {
    px(ctx, shirt, x, 8, 1, 1);
    px(ctx, PALETTE.ink, x, 9, 1, 1);
  }
}

function kitTextures(scene: Phaser.Scene, kit: Kit): void {
  SKIN.forEach((skin, s) => {
    for (let f = 0; f < 2; f++) {
      make(scene, `mp-${kit.code}-${s}-${f}`, FIG_W, FIG_H, (ctx) => drawFigure(ctx, kit.shirt, kit.shorts, f, skin));
      make(scene, `mp-${kit.code}-gk-${s}-${f}`, FIG_W, FIG_H, (ctx) => drawFigure(ctx, kit.keeper, PALETTE.ink, f, skin));
    }
  });
}

const kitOf = (rival: string): Kit => RIVAL_KITS[rival] ?? { code: rival.slice(0, 3).toUpperCase(), shirt: '#efe9df', shorts: '#2b2b33', keeper: '#e8d23a' };

interface Figure {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  key: string;
  lastX: number;
  lastY: number;
}

export class MatchView {
  private readonly scene: Phaser.Scene;
  private readonly field: { x: number; y: number; w: number; h: number };
  private readonly lines: Phaser.GameObjects.Graphics;
  private readonly home: Figure[] = [];
  private readonly away: Figure[] = [];
  private readonly ball: Phaser.GameObjects.Image;
  private readonly ballShadow: Phaser.GameObjects.Ellipse;
  private readonly board: HTMLElement | null;
  private kits: { home: Kit; away: Kit } | null = null;
  private lastAbs: number | null = null;
  private markAt = 0;
  private noteUntil = 0;
  private note = '';
  private hidden = false;
  /** Medidas (lifesim.match): ms de cada actualización y cuántas van. */
  private cost = { total: 0, n: 0, max: 0 };

  constructor(scene: Phaser.Scene, pitch: { tx: number; ty: number; w: number; h: number }) {
    this.scene = scene;
    // El rectángulo de juego dentro del césped: un margen hasta las paredes y la línea de banda de abajo.
    this.field = { x: pitch.tx * TILE + 6, y: pitch.ty * TILE + 4, w: pitch.w * TILE - 12, h: pitch.h * TILE - 4 };
    const f = this.field;
    make(scene, 'mp-ball', 3, 3, (ctx) => {
      px(ctx, PALETTE.white, 0, 0, 3, 3);
      px(ctx, '#9aa0a4', 2, 2, 1, 1);
      px(ctx, PALETTE.ink, 1, 1, 1, 1);
    });
    // Las líneas, una vez: banda de arriba, medio campo, círculo central, las dos áreas y las porterías.
    this.lines = scene.add.graphics().setDepth(f.y - 2);
    const g = this.lines;
    g.lineStyle(1, 0xefe9df, 0.85);
    g.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
    g.lineBetween(f.x + f.w / 2 + 0.5, f.y, f.x + f.w / 2 + 0.5, f.y + f.h);
    g.strokeCircle(f.x + f.w / 2 + 0.5, f.y + f.h / 2, 14);
    const boxW = Math.round(f.w * 0.11);
    const boxH = Math.round(f.h * 0.56);
    g.strokeRect(f.x + 0.5, f.y + (f.h - boxH) / 2, boxW, boxH);
    g.strokeRect(f.x + f.w - boxW - 0.5, f.y + (f.h - boxH) / 2, boxW, boxH);
    g.fillStyle(0xefe9df, 0.9);
    g.fillRect(f.x - 4, f.y + f.h / 2 - 9, 4, 1);
    g.fillRect(f.x - 4, f.y + f.h / 2 + 8, 4, 1);
    g.fillRect(f.x + f.w, f.y + f.h / 2 - 9, 4, 1);
    g.fillRect(f.x + f.w, f.y + f.h / 2 + 8, 4, 1);
    g.fillStyle(0xd9d3c7, 0.35);
    g.fillRect(f.x - 4, f.y + f.h / 2 - 8, 4, 16);
    g.fillRect(f.x + f.w, f.y + f.h / 2 - 8, 4, 16);
    // Los muñecos, creados una vez: siete y siete. La textura cambia al conocer el rival.
    const figure = (): Figure => ({
      shadow: scene.add.ellipse(0, 0, 6, 2, 0x0e0f16, 0.28).setVisible(false),
      sprite: scene.add.image(0, 0, 'mp-ball').setOrigin(0.5, 1).setVisible(false),
      key: '',
      lastX: 0,
      lastY: 0,
    });
    for (let i = 0; i < FORMATION.length; i++) {
      this.home.push(figure());
      this.away.push(figure());
    }
    this.ballShadow = scene.add.ellipse(0, 0, 4, 2, 0x0e0f16, 0.3).setVisible(false);
    this.ball = scene.add.image(0, 0, 'mp-ball').setVisible(false);
    this.board = document.getElementById('match-board');
  }

  /** Objetos que pinta (para medir): siempre los mismos. */
  get objects(): number {
    return (this.home.length + this.away.length) * 2 + 3;
  }

  get stats(): { objects: number; updates: number; avgMs: number; maxMs: number; hidden: boolean } {
    return { objects: this.objects, updates: this.cost.n, avgMs: this.cost.n ? this.cost.total / this.cost.n : 0, maxMs: this.cost.max, hidden: this.hidden };
  }

  /** Dónde va el balón (px de mundo), o null si no está en juego: la cámara de la grada lo sigue en pantallas estrechas. */
  get ballX(): number | null {
    return this.ball.visible ? this.ball.x : null;
  }

  /** Para medir el coste: sin muñecos ni marcador (el estadio, igual). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) this.hideAll();
  }

  /** El partido que se juega aquí ahora (o null): el de hoy o el de anoche, mientras dure. */
  timeline(abs: number): Timeline | null {
    return fixtureAt(abs);
  }

  update(abs: number, now: number): void {
    const started = performance.now();
    const tl = this.hidden ? null : fixtureAt(abs);
    if (!tl) {
      this.hideAll();
      this.lastAbs = abs;
      return;
    }
    this.useKits(tl);
    const t = abs - tl.kickoff;
    const pitch = pitchAt(tl, t);
    const fx = (x: number): number => this.field.x + x * this.field.w;
    const fy = (y: number): number => this.field.y + y * this.field.h;
    for (const side of ['home', 'away'] as const) {
      const figures = side === 'home' ? this.home : this.away;
      figures.forEach((fig, i) => {
        const dot = pitch.show ? pitch[side][i] : undefined;
        if (!dot) {
          fig.sprite.setVisible(false);
          fig.shadow.setVisible(false);
          return;
        }
        const x = Math.round(fx(dot.x));
        const hop = pitch.celebrate === side && i > 0 ? Math.round(Math.abs(Math.sin(now / 120 + i)) * 2) : 0;
        const y = Math.round(fy(dot.y)) - hop;
        const moving = Math.abs(x - fig.lastX) + Math.abs(y + hop - fig.lastY) > 0;
        const frame = moving && Math.floor(now / 130 + i) % 2 === 1 ? 1 : 0;
        const kit = side === 'home' ? this.kits!.home : this.kits!.away;
        const key = `mp-${kit.code}-${i === 0 ? 'gk-' : ''}${(i + (side === 'home' ? 0 : 2)) % SKIN.length}-${frame}`;
        if (key !== fig.key) {
          fig.sprite.setTexture(key);
          fig.key = key;
        }
        const dive = pitch.dive === side && i === 0;
        fig.sprite.setPosition(x, y + 1).setDepth(y + 1).setAngle(dive ? (dot.y < 0.5 ? -70 : 70) : 0).setVisible(true);
        fig.shadow.setPosition(x, y + hop + 1).setDepth(y).setVisible(true);
        fig.lastX = x;
        fig.lastY = y + hop;
      });
    }
    const bx = Math.round(fx(pitch.ball.x));
    const by = Math.round(fy(pitch.ball.y));
    this.ball.setPosition(bx, by - 1).setDepth(by + 0.5).setVisible(pitch.show);
    this.ballShadow.setPosition(bx, by + 1).setDepth(by).setVisible(pitch.show);
    this.notice(tl, abs);
    if (now >= this.markAt) {
      this.markAt = now + MARK_MS;
      this.paintBoard(tl, abs, now);
    }
    this.lastAbs = abs;
    const ms = performance.now() - started;
    this.cost.total += ms;
    this.cost.n++;
    this.cost.max = Math.max(this.cost.max, ms);
  }

  destroy(): void {
    if (this.board) {
      this.board.hidden = true;
      this.board.replaceChildren();
    }
  }

  private useKits(tl: Timeline): void {
    const away = kitOf(tl.match.rival);
    if (this.kits?.away === away) return;
    this.kits = { home: HOME_KIT, away };
    kitTextures(this.scene, HOME_KIT);
    kitTextures(this.scene, away);
    for (const f of [...this.home, ...this.away]) f.key = '';
  }

  private hideAll(): void {
    for (const f of [...this.home, ...this.away]) {
      f.sprite.setVisible(false);
      f.shadow.setVisible(false);
    }
    this.ball.setVisible(false);
    this.ballShadow.setVisible(false);
    if (this.board) this.board.hidden = true;
  }

  private teamName(side: 'home' | 'away', tl: Timeline): string {
    return side === 'home' ? ARENA_CLUB.short : tl.match.rival;
  }

  /**
   * Lo que se cuenta al pasar: un suceso visto (el reloj ha corrido por encima de su minuto a ritmo normal) se anuncia
   * una vez; tras un salto de tiempo, sólo un resumen de los goles que se han perdido; al llegar, nada.
   */
  private notice(tl: Timeline, abs: number): void {
    const said = announcement(tl, this.lastAbs, abs);
    if (said.kind === 'none') return;
    const score = (at: number): string => {
      const s = stateAt(tl, tl.kickoff + at).score;
      return `${s[0]}–${s[1]}`;
    };
    if (said.kind === 'seen') {
      const m = said.moments[said.moments.length - 1];
      this.say(m.goal ? `¡Gol de ${this.teamName(m.side, tl)}! ${score(m.at)} (${m.minute})` : `${this.teamName(m.side, tl)}: ${m.pattern.label} (${m.minute})`);
      return;
    }
    const goals = said.moments.filter((m: Moment) => m.goal);
    if (goals.length) this.say(`Mientras tanto: ${goals.map((m) => `gol de ${this.teamName(m.side, tl)} (${m.minute})`).join(', ')}.`);
  }

  /** Una línea bajo el marcador unos segundos (también los silbatos y los cánticos de la grada: WorldScene). */
  say(text: string): void {
    this.note = text;
    this.noteUntil = this.scene.time.now + NOTE_MS;
    this.markAt = 0;
  }

  private paintBoard(tl: Timeline, abs: number, now: number): void {
    const board = this.board;
    if (!board) return;
    const s = stateAt(tl, abs);
    const t = abs - tl.kickoff;
    // Fuera de la hora del partido (antes de abrir puertas o mucho después), el marcador se apaga.
    if (t < -120 || t > LIVE_END + 60) {
      board.hidden = true;
      return;
    }
    const k = this.kits!;
    const team = (code: string, color: string): HTMLElement => {
      const el = document.createElement('span');
      el.className = 'match-board__team';
      el.style.setProperty('--kit', color);
      el.textContent = code;
      return el;
    };
    const score = document.createElement('b');
    score.className = 'match-board__score';
    score.textContent = s.stage === 'pre' ? '–' : `${s.score[0]} – ${s.score[1]}`;
    const clock = document.createElement('span');
    clock.className = 'match-board__clock';
    clock.textContent = s.clock;
    const row = document.createElement('p');
    row.className = 'match-board__row';
    row.append(team(k.home.code, k.home.shirt), score, team(k.away.code, k.away.shirt), clock);
    const children: HTMLElement[] = [row];
    if (now < this.noteUntil && this.note) {
      const note = document.createElement('p');
      note.className = 'match-board__note';
      note.textContent = this.note;
      children.push(note);
    }
    board.replaceChildren(...children);
    board.setAttribute('aria-label', `${ARENA_CLUB.short} ${s.score[0]}, ${tl.match.rival} ${s.score[1]}. ${s.clock}`);
    board.hidden = false;
  }
}
