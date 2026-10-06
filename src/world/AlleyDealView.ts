import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { ALLEY_LINES, type AlleySpotDef } from '../data/alleyDeals';
import type { LocationDef, TilePoint } from '../types/game';
import type { Agent } from '../systems/Crowd';
import type { Weather } from '../systems/Weather';
import { AlleyDeal, GLARE, type DealPresence } from '../systems/AlleyDeals';
import { CrowdView } from './CrowdView';
import { LAYER } from './Layers';

/** Lo que se lee al acercarse: lo que hace, no lo que es. */
const LABEL = { seller: 'Alguien esperando', lookout: 'Alguien en la esquina', associate: 'Alguien charlando', buyer: 'Alguien de paso' } as const;

/**
 * Cómo se ve un rato de trapicheo (systems/AlleyDeals.ts): la gente de siempre,
 * pintada por una CrowdView más (se les puede hablar; contestan seco y eso basta
 * para que se vayan). Sin objetos ni dinero a la vista: el intercambio es un
 * momento hablando de cerca. Si te han visto, quien está más cerca dice algo
 * corto y se van todos.
 *
 * `AlleyDealView.debug` (sólo desde la consola de desarrollo) dibuja el sitio y
 * lo que pasa en él.
 */
export class AlleyDealView {
  static debug = false;
  readonly deal: AlleyDeal;
  readonly agents: Agent[] = [];
  readonly crowd: CrowdView;
  private readonly scene: Phaser.Scene;
  private readonly byId = new Map<number, Agent>();
  private readonly shout: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Graphics | null = null;
  private overlayText: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene, loc: LocationDef, spot: AlleySpotDef, weather: () => Weather) {
    this.scene = scene;
    this.deal = new AlleyDeal(spot, loc);
    this.crowd = new CrowdView(scene, this, weather, true);
    const style = { fontFamily: 'monospace', fontSize: '7px', color: PALETTE.pavementLit, stroke: PALETTE.ink, strokeThickness: 2, padding: { x: 1, y: 1 } };
    this.shout = scene.add.text(0, 0, '', style).setOrigin(0.5, 1).setResolution(3).setDepth(LAYER.light + 2).setVisible(false);
  }

  get spot(): AlleySpotDef {
    return this.deal.spot;
  }

  /** `t`: minutos absolutos. `authorities`: tiles de quien lleva uniforme por aquí (hoy, nadie en la calle). */
  update(t: number, player: TilePoint, authorities: readonly TilePoint[] = []): void {
    // Hablarles es quedarse a mirar: se acabó.
    if (this.agents.some((a) => a.talking)) this.deal.interrupt(t, 'player', player);
    this.deal.observe(t, player, authorities);
    const present = this.deal.presentAt(t);
    const here = new Set<number>();
    for (const p of present) {
      const m = p.member;
      here.add(m.id);
      let a = this.byId.get(m.id);
      if (!a) {
        const lines = ALLEY_LINES[m.role];
        a = { id: m.id, kind: 'visitor', role: `alley-${m.role}`, label: LABEL[m.role], line: lines[m.seed % lines.length], look: m.look, x: 0, y: 0, dir: 'down', moving: false, state: 'WAIT', speed: 0, path: [], timer: 0, plan: [], leaveSoon: false, leaving: false };
        this.byId.set(m.id, a);
        this.agents.push(a);
      }
      // Quien habla con el jugador se queda quieto hasta despedirse; luego sigue con los demás.
      if (!a.talking) Object.assign(a, { look: m.look, x: p.x, y: p.y, dir: p.dir, moving: p.moving, state: p.state });
    }
    for (let i = this.agents.length - 1; i >= 0; i--) {
      if (here.has(this.agents[i].id) || this.agents[i].talking) continue;
      this.byId.delete(this.agents[i].id);
      this.agents.splice(i, 1);
    }
    this.sayNoticed(t, present, player);
    this.drawDebug(t);
  }

  /** Te han visto: durante la mirada, una frase corta de quien está más cerca. */
  private sayNoticed(t: number, present: readonly DealPresence[], player: TilePoint): void {
    const cut = this.deal.interruption(t);
    const glaring = cut?.why === 'player' && t >= cut.at && t < cut.at + GLARE + 1;
    const still = present.filter((p) => !p.moving);
    if (!glaring || !still.length) {
      this.shout.setVisible(false);
      return;
    }
    const near = still.reduce((a, b) => (Math.hypot(a.x - player.tx, a.y - player.ty) <= Math.hypot(b.x - player.tx, b.y - player.ty) ? a : b));
    const line = ALLEY_LINES.noticed[near.member.seed % ALLEY_LINES.noticed.length];
    this.shout.setText(line).setPosition(near.x * TILE + TILE / 2, Math.max(14, near.y * TILE - 10)).setVisible(true);
  }

  private drawDebug(t: number): void {
    if (!AlleyDealView.debug) {
      this.overlay?.setVisible(false);
      this.overlayText?.setVisible(false);
      return;
    }
    const a = this.spot.area;
    this.overlay ??= this.scene.add.graphics().setDepth(LAYER.light + 5);
    this.overlayText ??= this.scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '6px', color: '#ffd166', backgroundColor: '#000a' }).setResolution(3).setDepth(LAYER.light + 6);
    const s = this.deal.devStatus(t);
    this.overlay.clear().lineStyle(1, s.phase === 'none' ? 0x5ad8ff : 0xff6b6b, 0.9).strokeRect(a.tx * TILE, a.ty * TILE, a.w * TILE, a.h * TILE).setVisible(true);
    this.overlayText.setText(`${this.spot.name}: ${s.phase} · enfriamiento ${s.cooldown}`).setPosition(a.tx * TILE, a.ty * TILE - 8).setVisible(true);
  }
}
