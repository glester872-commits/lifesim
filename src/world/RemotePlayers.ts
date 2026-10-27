import Phaser from 'phaser';
import { EYE_IDS, HAIR_COLOR_IDS, HAIR_IDS, SKIN_IDS, type Appearance, type HairStyle } from '../data/appearance';
import { GARMENTS } from '../data/retail';
import type { LookDTO, PlayerView, Pose, Presence } from '../net/protocol';
import { dropRemote, paintRemote } from './TextureFactory';
import { LAYER, standing } from './Layers';

/**
 * Alpha-06 · las personas de la sala (otros navegadores) en la escena: su aspecto, su nombre encima y su paso,
 * sólo si están en tu misma zona. Lo que dibuja viene del servidor (net/OnlineClient), nunca de la partida local:
 * no son NPC, no hablan con el sistema social ni chocan con nada.
 *
 * Posición: se pinta INTERP_MS por detrás de lo último recibido, entre dos muestras, para que 10 envíos por segundo
 * se vean como un paso continuo; un salto de más de SNAP_PX (puerta, metro, recarga) se coloca de golpe.
 */
const INTERP_MS = 120;
const SNAP_PX = 160;
const BUFFER = 20;

interface Sample {
  at: number;
  pose: Pose;
}

interface Avatar {
  key: string;
  name: string;
  presence: Presence;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  samples: Sample[];
}

/** Lo que llega de otro navegador, contra el catálogo de este: lo que no existe aquí se queda como viene de fábrica. */
export function lookToAppearance(look: LookDTO): Appearance {
  const out: Appearance = {};
  if (look.hair && HAIR_IDS.has(look.hair)) out.hair = look.hair as HairStyle;
  if (look.skin && SKIN_IDS.has(look.skin)) out.skin = look.skin;
  if (look.hairColor && HAIR_COLOR_IDS.has(look.hairColor)) out.hairColor = look.hairColor;
  if (look.eyes && EYE_IDS.has(look.eyes)) out.eyes = look.eyes;
  for (const slot of ['top', 'bottom', 'shoes'] as const) {
    const id = look[slot];
    if (id && GARMENTS.some((g) => g.id === id && g.slot === slot)) out[slot] = id;
  }
  return out;
}

/** Al revés: lo que se manda de uno mismo. Sólo ids de catálogo (sin tatuajes, sin nada de la partida). */
export function appearanceToLook(a: Appearance): LookDTO {
  const { hair, top, bottom, shoes, skin, hairColor, eyes } = a;
  return Object.fromEntries(Object.entries({ hair, top, bottom, shoes, skin, hairColor, eyes }).filter(([, v]) => typeof v === 'string')) as LookDTO;
}

/** La zona de la sala: el mapa o interior donde se está (LocationDef.id), en el formato del contrato. */
export const zoneOf = (locationId: string): string => locationId.toLowerCase().replace(/[^a-z0-9:_-]/g, '-').slice(0, 64) || 'desconocida';

let counter = 0;

export class RemotePlayers {
  private readonly avatars = new Map<string, Avatar>();
  private readonly scene: Phaser.Scene;
  private readonly zone: () => string;
  private readonly blocked: (session: string) => boolean;

  constructor(scene: Phaser.Scene, zone: () => string, blocked: (session: string) => boolean) {
    this.scene = scene;
    this.zone = zone;
    this.blocked = blocked;
  }

  get count(): number {
    return this.avatars.size;
  }

  /** La sala entera, al entrar o volver: lo que ya no está, se quita; lo que está, se pone o se pone al día. */
  reset(players: readonly PlayerView[], you: string): void {
    const keep = new Set(players.filter((p) => p.session !== you).map((p) => p.session));
    for (const session of [...this.avatars.keys()]) if (!keep.has(session)) this.remove(session);
    for (const p of players) if (p.session !== you) this.upsert(p);
  }

  upsert(p: PlayerView): void {
    let a = this.avatars.get(p.session);
    if (!a) {
      const key = `remote${++counter}`;
      paintRemote(this.scene, key, lookToAppearance(p.look));
      const sprite = this.scene.add.sprite(0, 0, `${key}-down-0`).setOrigin(0.5, 1).setVisible(false);
      const label = this.scene.add
        .text(0, 0, '', { fontFamily: 'monospace', fontSize: '9px', color: '#e8e3da', backgroundColor: 'rgba(17,19,28,0.72)', padding: { x: 2, y: 1 } })
        .setOrigin(0.5, 1)
        .setResolution(3)
        .setVisible(false);
      a = { key, name: p.name, presence: p.presence, sprite, label, samples: [] };
      this.avatars.set(p.session, a);
    } else {
      paintRemote(this.scene, a.key, lookToAppearance(p.look));
    }
    a.name = p.name;
    a.presence = p.presence;
    if (p.pose) this.moved(p.session, p.pose, true);
    this.paintLabel(a);
  }

  moved(session: string, pose: Pose, snap = false): void {
    const a = this.avatars.get(session);
    if (!a) return;
    const now = performance.now();
    const last = a.samples.at(-1);
    if (snap || !last || last.pose.zone !== pose.zone || Math.hypot(pose.x - last.pose.x, pose.y - last.pose.y) > SNAP_PX) a.samples = [];
    a.samples.push({ at: now, pose });
    if (a.samples.length > BUFFER) a.samples.splice(0, a.samples.length - BUFFER);
  }

  presence(session: string, presence: Presence): void {
    const a = this.avatars.get(session);
    if (!a) return;
    a.presence = presence;
    this.paintLabel(a);
  }

  remove(session: string): void {
    const a = this.avatars.get(session);
    if (!a) return;
    a.sprite.destroy();
    a.label.destroy();
    dropRemote(this.scene, a.key);
    this.avatars.delete(session);
  }

  clear(): void {
    for (const session of [...this.avatars.keys()]) this.remove(session);
  }

  /** Cada fotograma: dónde se ve a cada uno (interpolado) y con qué paso. */
  update(): void {
    const here = this.zone();
    const now = performance.now();
    const t = now - INTERP_MS;
    for (const [session, a] of this.avatars) {
      const s = a.samples;
      const last = s.at(-1);
      const show = !!last && last.pose.zone === here && !this.blocked(session);
      a.sprite.setVisible(show);
      a.label.setVisible(show);
      if (!show || !last) continue;
      let x = last.pose.x;
      let y = last.pose.y;
      const i = s.findIndex((p) => p.at > t);
      if (i > 0) {
        const p0 = s[i - 1];
        const p1 = s[i];
        const k = (t - p0.at) / Math.max(1, p1.at - p0.at);
        x = p0.pose.x + (p1.pose.x - p0.pose.x) * k;
        y = p0.pose.y + (p1.pose.y - p0.pose.y) * k;
      } else if (i === 0) {
        x = s[0].pose.x;
        y = s[0].pose.y;
      }
      // Sin noticias desde hace un rato (se ha parado o va con retraso): quieto donde se le vio por última vez.
      const moving = last.pose.m !== 0 && now - last.at < 500;
      const kind = !moving ? 'idle' : last.pose.m === 2 ? 'run' : 'walk';
      const anim = `${a.key}-${kind}-${last.pose.f}`;
      if (a.sprite.anims.currentAnim?.key !== anim) a.sprite.play(anim);
      a.sprite.setPosition(Math.round(x), Math.round(y)).setDepth(standing(y)).setAlpha(a.presence === 'reconnecting' ? 0.5 : 1);
      // El nombre, como la «E»: legible también de noche, por encima de la luz de la hora.
      a.label.setPosition(Math.round(x), Math.round(y) - 26).setDepth(LAYER.prompt);
    }
  }

  private paintLabel(a: Avatar): void {
    a.label.setText(a.presence === 'reconnecting' ? `${a.name} · reconectando` : a.name);
  }
}
