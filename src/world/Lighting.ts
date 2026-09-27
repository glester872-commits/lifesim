import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { LocationDef } from '../types/game';
import type { GameState } from '../state/GameState';
import { PROPS } from './tiles';
import type { GlowSpot, WindowSpot } from './BuildingArt';
import { make } from './paint';

/**
 * La hora se ve en la calle. Una capa que multiplica la escena con el color
 * del cielo (blanco a mediodía: no cambia nada) y, encima, las luces de los
 * props que declaran `light`, que se encienden al caer la tarde. Sólo en
 * exteriores: dentro, la luz es la del local.
 *
 * Sin bloom ni degradados de pantalla: un color plano por hora y charcos de
 * luz escalonados, como el resto del pixel art.
 */

/** [hora, color del cielo]. Entre dos puntos se interpola. */
/** Noche azul pizarra, no añil: la sombra deja leer el suelo y la gente (design/visual-reference). */
const NIGHT = 0x566090;
const SKY: readonly (readonly [number, number])[] = [
  [0, NIGHT],
  [5.5, NIGHT],
  [6.5, 0x8e84a6],
  [7.5, 0xf2d6be],
  [9, 0xffffff],
  [17.5, 0xffffff],
  [19, 0xffe0b8],
  [20.2, 0xd09486],
  [21.2, 0x6a6294],
  [22.2, NIGHT],
  [24, NIGHT],
];
/** Focos de la pista de baile: rosa, cian, violeta y ámbar de neón. */
const STROBE_COLORS = [0xff5ab0, 0x5ad8ff, 0xb07aff, 0xffd05a] as const;

/** Parte de las ventanas que se encienden de noche; siempre las mismas. */
const LIT_SHARE = 55;

/** Por encima de todo lo que se ordena por Y; por debajo del indicador de E. */
const DEPTH = 900_000;
/** Lo que brilla por sí mismo (rótulos, semáforos): encima de la sombra de la hora. */
export const EMISSIVE_DEPTH = DEPTH + 2;

function mix(a: number, b: number, k: number): number {
  const ch = (shift: number): number => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Cuánto de noche es a esa hora: 0 a pleno día, 1 con el cielo más oscuro. */
export function nightAt(hour: number): number {
  const green = (skyAt(hour) >> 8) & 255;
  return Phaser.Math.Clamp((255 - green) / (255 - ((NIGHT >> 8) & 255)), 0, 1);
}

export function skyAt(hour: number): number {
  for (let i = 1; i < SKY.length; i++) {
    const [h1, c1] = SKY[i];
    const [h0, c0] = SKY[i - 1];
    if (hour <= h1) return mix(c0, c1, (hour - h0) / (h1 - h0));
  }
  return SKY[SKY.length - 1][1];
}

/**
 * Charco de luz elíptico (2:1, el suelo visto desde arriba) en anillos
 * escalonados, sin degradado suave. Una textura por tamaño, compartida.
 */
function poolTexture(scene: Phaser.Scene, w: number, h: number): string {
  const key = `fx-pool-${w}x${h}`;
  make(scene, key, w, h, (ctx) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
        const a = d < 0.3 ? 0.42 : d < 0.55 ? 0.3 : d < 0.8 ? 0.16 : d < 1 ? 0.06 : 0;
        if (a === 0) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  });
  return key;
}

/** Una luz sobre el suelo: centro y tamaño en px del mundo. */
interface LightSource {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  strength: number;
}

/**
 * Las luces no se suman al cielo: lo sustituyen (fusión normal con el alfa de
 * la máscara). Sumadas, el azul del cielo sobrevive en el borde del charco y
 * lo vuelve rosa; interpoladas, el borde pasa de azul a ámbar sin matiz raro.
 */
const WARM = 0xffc27a;
const COOL = 0xa8d4ff;
/** El mapa de luz va a media resolución: los anillos son escalonados y a 2 px no se nota. */
const LM_SCALE = 2;
const LIGHT_MASK = 'fx-lightmask';
const MASK_SIZE = 64;

/** Caída suave y fuerte en el centro: el mapa de luz se filtra en lineal, la luz es lo único que no va a píxel. */
function makeLightMask(scene: Phaser.Scene): void {
  if (scene.textures.exists(LIGHT_MASK)) return;
  make(scene, LIGHT_MASK, MASK_SIZE, MASK_SIZE, (ctx) => {
    const r = MASK_SIZE / 2;
    for (let y = 0; y < MASK_SIZE; y++) {
      for (let x = 0; x < MASK_SIZE; x++) {
        const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
        const a = d < 1 ? (1 - d * d) ** 1.5 : 0;
        if (a === 0) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  });
  scene.textures.get(LIGHT_MASK).setFilter(Phaser.Textures.FilterMode.LINEAR);
}

export class Lighting {
  private readonly shade: Phaser.GameObjects.Rectangle;
  private readonly lights: Phaser.GameObjects.Image[] = [];
  private readonly windows: Phaser.GameObjects.Graphics;
  /** Lo que brilla (rótulos, pantallas, apliques): encima de la sombra de la hora, sin oscurecerse. */
  private readonly emissives: Phaser.GameObjects.Image[] = [];
  private readonly state: GameState;
  /** Dentro: luz fija del local, lámparas siempre encendidas y sin cielo. */
  private readonly indoor: boolean;
  private readonly ambient: number;
  /** Fuera: lo que alumbra el suelo, pintado sobre el color del cielo y multiplicado con la escena. */
  private readonly sources: LightSource[] = [];
  private lightmap: Phaser.GameObjects.RenderTexture | null = null;
  private lastSky = -1;
  private readonly roofs: { x: number; y: number; w: number; h: number }[] = [];
  private roofBrush!: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, def: LocationDef, built: { widthPx: number; heightPx: number; windows: readonly WindowSpot[]; glows: readonly GlowSpot[] }, state: GameState) {
    const { widthPx, heightPx } = built;
    this.state = state;
    this.indoor = def.kind === 'interior';
    this.ambient = def.ambient ? Number.parseInt(def.ambient.slice(1), 16) : 0xffffff;
    // Con margen: la cámara puede enseñar algo más allá del borde del mapa.
    const m = TILE * 24;
    this.shade = scene.add
      .rectangle(-m, -m, widthPx + m * 2, heightPx + m * 2, 0xffffff)
      .setOrigin(0, 0)
      .setDepth(DEPTH)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    // Ventanas encendidas: un cristal cálido por casa habitada, un solo trazo para todas.
    this.windows = scene.add.graphics().setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
    built.windows.forEach((w, i) => {
      if ((Math.imul(i + 1, 2654435761) >>> 0) % 100 >= LIT_SHARE) return;
      this.windows.fillStyle(0xd08a3a, 0.55).fillRect(w.x, w.y, w.w, w.h);
      this.windows.fillStyle(0xf0c070, 0.35).fillRect(w.x, w.y, w.w, 1);
      // Y un poco de esa luz cae en la acera, al pie del cristal.
      this.sources.push({ x: w.x + w.w / 2, y: w.y + w.h + 6, w: w.w * 2 + 20, h: 26, color: WARM, strength: 0.5 });
    });

    for (const p of def.props) {
      const prop = PROPS[p.kind];
      if (!prop.light) continue;
      const x = p.tx * TILE + ((prop.tilesWide ?? 1) * TILE) / 2;
      const y = (p.ty + 1) * TILE - prop.light.dy;
      const tint = prop.light.cool ? 0x9fd8ff : 0xf0b46a;
      const light = scene.add.image(x, y, 'fx-light').setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
      // Con charco, el halo es sólo el brillo de la linterna: la luz de verdad está en el suelo.
      // Fuera pasa lo mismo sin charco: el mapa de luz alumbra el suelo; un halo entero sería un círculo amarillo.
      if (prop.light.pool || !this.indoor) light.setScale(prop.light.pool ? 0.6 : 0.45);
      this.lights.push(light.setTint(tint));
      const baseY = (p.ty + 1) * TILE - 3;
      if (!this.indoor) {
        // Fuera, la luz del suelo la pone el mapa de luz: devuelve el color a lo que ilumina, gente incluida.
        const [w, h] = prop.light.pool ? [prop.light.pool[0] * 2.7, prop.light.pool[1] * 3.6] : [84, 50];
        this.sources.push({ x, y: baseY, w, h, color: prop.light.cool ? COOL : WARM, strength: prop.light.cool ? 0.6 : 1 });
      } else if (prop.light.pool) {
        const [w, h] = prop.light.pool;
        const pool = scene.add.image(x, baseY, poolTexture(scene, w, h)).setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
        this.lights.push(pool.setTint(tint));
      }
    }

    for (const p of def.props) {
      const prop = PROPS[p.kind];
      if (!prop.emissive) continue;
      const x = p.tx * TILE + ((prop.tilesWide ?? 1) * TILE) / 2;
      this.emissives.push(scene.add.image(x, (p.ty + 1) * TILE, prop.emissive).setOrigin(0.5, 1).setDepth(DEPTH + 2));
      this.sources.push({ x, y: (p.ty + 1) * TILE - 2, w: 56, h: 30, color: COOL, strength: 0.45 });
    }
    for (const g of built.glows) {
      this.emissives.push(scene.add.image(g.x, g.y, g.key).setOrigin(0, 0).setDepth(DEPTH + 2));
      // Un rótulo o una boca de metro encendidos alumbran la acera de delante.
      const src = scene.textures.get(g.key).getSourceImage();
      this.sources.push({ x: g.x + src.width / 2, y: g.y + src.height, w: src.width * 1.8, h: src.height * 1.4, color: WARM, strength: 0.75 });
    }

    if (!this.indoor) {
      makeLightMask(scene);
      this.shade.setVisible(false);
      this.lightmap = scene.add
        .renderTexture(0, 0, Math.ceil(widthPx / LM_SCALE), Math.ceil(heightPx / LM_SCALE))
        .setOrigin(0, 0)
        .setScale(LM_SCALE)
        .setDepth(DEPTH)
        .setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.lightmap.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.roofBrush = new Phaser.GameObjects.Rectangle(scene, 0, 0, 1, 1, 0xffffff).setOrigin(0, 0);
      // Una farola no alumbra los tejados: quedan con la luz del cielo.
      for (const b of def.buildings ?? []) {
        if (b.style === 'metro') continue;
        const floors = b.front === 's' ? (b.floors ?? 1) : b.front === 'n' ? 1 : 0;
        const top = b.front === 'n' ? b.ty + 1 : b.ty;
        this.roofs.push({ x: b.tx * TILE, y: top * TILE, w: b.w * TILE, h: (b.h - floors) * TILE });
      }
    }

    if (def.strobe) this.strobe(scene, def.strobe);

    const update = (): void => this.update();
    state.on('change', update);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => state.off('change', update));
    this.update();
  }

  /**
   * Focos de colores sobre la pista: saltan de sitio a cada pulso de la música
   * (el mismo compás al que baila la gente, 500 ms). Con movimiento reducido,
   * quietos.
   */
  private strobe(scene: Phaser.Scene, area: NonNullable<LocationDef['strobe']>): void {
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const spot = (i: number, beat: number): { x: number; y: number } => {
      const h = Math.imul(i * 7919 + beat * 104729 + 1, 2654435761) >>> 0;
      return {
        x: (area.tx + ((h % 1000) / 1000) * area.w) * TILE,
        y: (area.ty + ((Math.floor(h / 1000) % 1000) / 1000) * area.h) * TILE,
      };
    };
    const spots = STROBE_COLORS.map((color, i) => {
      const { x, y } = spot(i, 0);
      return scene.add.image(x, y, 'fx-light').setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(1.4).setAlpha(0.8);
    });
    if (calm) return;
    let beat = 0;
    scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        beat++;
        spots.forEach((light, i) => {
          if ((beat + i) % 2 === 1) return;
          scene.tweens.add({ targets: light, ...spot(i, beat), duration: 180, ease: 'Cubic.easeOut' });
          light.setTint(STROBE_COLORS[(i + beat) % STROBE_COLORS.length]);
        });
      },
    });
  }

  /**
   * El mapa de luz: el cielo de la hora y, encima, cada luz sumada en su color.
   * Multiplicado con la escena, lo iluminado recupera su color y lo demás se
   * queda en la sombra azul de la noche. Sólo se repinta si cambia el cielo,
   * y las luces son fijas: coste casi nulo por frame.
   */
  private paintLightmap(sky: number, night: number): void {
    const map = this.lightmap;
    if (!map || sky === this.lastSky) return;
    this.lastSky = sky;
    map.clear().fill(sky);
    if (night < 0.05) return;
    map.beginDraw();
    for (const l of this.sources) {
      map.stamp(LIGHT_MASK, undefined, l.x / LM_SCALE, l.y / LM_SCALE, {
        scaleX: l.w / MASK_SIZE / LM_SCALE,
        scaleY: l.h / MASK_SIZE / LM_SCALE,
        tint: l.color,
        alpha: Math.min(1, night * l.strength),
        blendMode: Phaser.BlendModes.NORMAL,
        skipBatch: true,
      });
    }
    map.endDraw();
    // Con un rectángulo propio (fusión normal): fill() heredaría la suma de la última luz.
    const roof = this.roofBrush.setFillStyle(sky);
    for (const r of this.roofs) map.draw(roof.setPosition(r.x / LM_SCALE, r.y / LM_SCALE).setSize(r.w / LM_SCALE, r.h / LM_SCALE));
  }

  private update(): void {
    if (this.indoor) {
      this.shade.setFillStyle(this.ambient);
      for (const light of this.lights) light.setAlpha(0.5).setVisible(true);
      for (const e of this.emissives) e.setAlpha(1).setVisible(true);
      this.windows.setVisible(false);
      return;
    }
    const sky = skyAt(this.state.hour + this.state.minute / 60);
    this.shade.setFillStyle(sky);
    const night = nightAt(this.state.hour + this.state.minute / 60);
    this.paintLightmap(sky, night);
    for (const light of this.lights) light.setAlpha(night).setVisible(night > 0.05);
    this.windows.setAlpha(night).setVisible(night > 0.05);
    for (const e of this.emissives) e.setAlpha(night).setVisible(night > 0.05);
  }
}
