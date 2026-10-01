import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { BuildingDef, LocationDef } from '../types/game';
import type { GameState } from '../state/GameState';
import { PROPS } from './tiles';
import type { GlowSpot, WindowSpot } from './BuildingArt';
import { make } from './paint';
import { isOpen, placeForInterior, placesOfType, type PlaceInfo } from '../systems/Places';
import { weatherAt, type Weather } from '../systems/Weather';
import { gradeAt, hex, profileAt, zonesOf } from '../systems/Districts';
import { every, wave } from './Motion';
import { backRows, facadeRows } from '../systems/LocationSystem';
import { DISTRICTS, type DistrictProfile } from '../data/districts';
import { QUALITY } from '../config/quality';
import { windowKind, windowRank } from './Detail';
import { LAMP_LIGHT } from './LampShadows';

/** Canal a canal: `a` por `b` (0xffffff no cambia nada). */
function multiply(a: number, b: number): number {
  const ch = (s: number): number => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** El cielo con el tiempo que hace: las nubes y la lluvia lo agrisan y lo enfrían, de día y de noche. */
export function weatherSky(sky: number, w: Weather): number {
  return multiply(sky, mix(0xffffff, 0x8a93aa, Math.min(1, w.cloud * 0.42 + w.rain * 0.3)));
}

/** Suelo mojado: más oscuro y algo más frío que el seco; los tejados, no (ya los agrisa el cielo). */
const wetGround = (sky: number, wet: number): number => multiply(sky, mix(0xffffff, 0xa9b1c2, wet * 0.55));

/**
 * La hora se ve en la calle, y el estado de cada sitio también.
 *
 * Fuera, un mapa de luz a media resolución multiplica la escena: el color del
 * cielo de la hora, las sombras del sol (que cambian de largo y de lado con la
 * hora), y encima las luces: farolas, rótulos y escaparates de los locales
 * abiertos, ventanas de las casas en las que hay alguien. Los tejados se quedan
 * con el cielo: ni el sol les pone sombra ni una farola los alumbra. Dentro, la
 * luz es la del local: su color, sus lámparas, y a oscuras si ha cerrado.
 *
 * Sin bloom ni degradados sobre los sprites: el mapa de luz es lo único suave
 * (y va por debajo de lo que brilla por sí mismo), así que los bordes del pixel
 * art quedan limpios. Se repinta sólo cuando cambia algo que se ve (el cielo,
 * el sol a pasos de diez minutos, qué locales están abiertos, cuántas casas
 * tienen luz); entre medias, el coste por frame es nulo.
 */

/** [hora, color del cielo]. Entre dos puntos se interpola. */
/**
 * Noche azul pizarra, no añil: la sombra deja leer el suelo y la gente (design/visual-reference).
 * Algo más honda que el crepúsculo para que el charco de cada farola se despegue de lo que no alumbra.
 */
const NIGHT = 0x414a7c;
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

// --------------------------------------------------------------------- sol

/**
 * El sol del barrio: hacia dónde caen las sombras, cuánto se alargan y cuánto
 * se notan. Sale a las 6:30 por el este (sombras largas hacia el oeste), a
 * mediodía las deja cortas y un poco al sureste (la luz del noroeste de todo el
 * arte, ART_BIBLE §5) y se pone a las 20:30 con sombras largas hacia el este.
 * De noche, nada: la luz la ponen las farolas.
 */
export interface Sun {
  /** Dirección de la sombra (unitaria, en px de mundo). */
  dx: number;
  dy: number;
  /** Largo relativo: 1 a media mañana; más de 2 al amanecer y al atardecer. */
  length: number;
  /** Cuánto oscurece la sombra, de 0 a 1. */
  strength: number;
}

const SUNRISE = 6.5;
const SUNSET = 20.5;

export function sunAt(hour: number): Sun {
  const t = (hour - SUNRISE) / (SUNSET - SUNRISE);
  if (t <= 0 || t >= 1) return { dx: 0, dy: 1, length: 0, strength: 0 };
  const elevation = Math.sin(Math.PI * t);
  const x = -1 + 2.2 * t;
  const y = 0.35 + 0.35 * elevation;
  const n = Math.hypot(x, y);
  return {
    dx: x / n,
    dy: y / n,
    length: Phaser.Math.Clamp(0.6 / Math.max(elevation, 0.05), 0.6, 2.6),
    // Con el sol a ras, la sombra se funde con la penumbra de la hora.
    strength: Phaser.Math.Clamp(elevation * 6, 0, 1),
  };
}

/** El sol se repinta a pasos de diez minutos de juego: cinco segundos reales, invisible al ojo. */
const SUN_STEP_H = 1 / 6;
/** Color de la sombra del sol: el azul del cielo, no negro. */
const SUN_SHADOW = 0x6a6f9a;
/** Cuánto oscurece como mucho (sobre el blanco del mediodía). */
const SUN_SHADOW_MAX = 0.34;

// ------------------------------------------------------------ las casas

/**
 * Parte de las ventanas de casa con luz, por hora: de noche no está todo el
 * mundo despierto ni fuera. Cada ventana tiene su número fijo y se enciende si
 * cae por debajo de la parte de esa hora: la misma casa se apaga cada noche a
 * la misma hora, y el barrio se va apagando poco a poco.
 */
const HOME_LIGHTS: readonly (readonly [number, number])[] = [
  [0, 0.34], [1, 0.18], [2, 0.1], [5, 0.08], [6, 0.2], [7, 0.42], [9, 0.25],
  [17, 0.32], [19, 0.6], [22, 0.6], [23, 0.48], [24, 0.34],
];

export function homeLightsAt(hour: number): number {
  for (let i = 1; i < HOME_LIGHTS.length; i++) {
    const [h1, s1] = HOME_LIGHTS[i];
    const [h0, s0] = HOME_LIGHTS[i - 1];
    if (hour <= h1) return s0 + (s1 - s0) * ((hour - h0) / (h1 - h0));
  }
  return HOME_LIGHTS[HOME_LIGHTS.length - 1][1];
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
const LIGHT_MASK = 'fx-lightmask';
/** Píxeles de mundo por píxel de la capa de resplandor: es una luz muy suave, se filtra en lineal. */
const GLOW_SCALE = 4;
/** Cuánto de cada luz se suma encima (0–1): lo justo para que el suelo bajo la farola se lea encendido, sin bloom. */
const GLOW = 0.2;
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

/** Lugar de cada edificio (data/places.ts): de él sale si su escaparate y su rótulo están encendidos. */
const PLACE_OF_BUILDING = new Map<string, PlaceInfo>(
  (['home', 'residence', 'business', 'transit', 'public'] as const).flatMap((t) => placesOfType(t)).flatMap((p) => (p.building ? [[p.building, p] as const] : [])),
);

/** Lo que echa sombra al sol: la huella de un edificio con su altura, o la base de algo alto. */
interface Caster {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Altura en px: lo que se alarga la sombra con el sol a media altura. */
  height: number;
  /** Mancha de copa al final de la sombra (árboles). */
  blob?: readonly [number, number];
}

export class Lighting {
  private readonly shade: Phaser.GameObjects.Rectangle;
  /** Farolas y lámparas: su linterna, encendida de noche (dentro, siempre que el local esté abierto). */
  private readonly lights: Phaser.GameObjects.Image[] = [];
  private readonly windows: Phaser.GameObjects.Graphics;
  private readonly windowSpots: readonly WindowSpot[];
  /** Lo que brilla (rótulos, pantallas, apliques): encima de la sombra de la hora, sin oscurecerse. */
  /** `flicker`: semilla del tartamudeo ocasional de ese rótulo (sin ella, luz fija). */
  private readonly emissives: { img: Phaser.GameObjects.Image; place?: PlaceInfo; flicker?: number }[] = [];
  /** Cuánto de noche era en el último repintado: la base del tartamudeo y del brillo del mojado. */
  private night = 0;
  private readonly state: GameState;
  /** Dentro: luz fija del local, lámparas encendidas si está abierto y sin cielo. */
  private readonly indoor: boolean;
  private readonly ambient: number;
  /** El lugar de este interior, si es uno: cerrado, a oscuras. */
  private readonly room: PlaceInfo | undefined;
  /** Luces que no dependen de nada más que de la noche: farolas, pantallas, la boca de metro. */
  private readonly fixedSources: LightSource[] = [];
  /** Las que sí: escaparates y rótulos de locales abiertos, ventanas de casas con alguien. Se rehacen con la hora. */
  private dynamicSources: LightSource[] = [];
  private readonly casters: Caster[] = [];
  private readonly doors: { b: BuildingDef; place: PlaceInfo }[] = [];
  private lightmap: Phaser.GameObjects.RenderTexture | null = null;
  private shadows: Phaser.GameObjects.Graphics | null = null;
  /** Reflejos del suelo mojado: el farol y el escaparate repetidos en el agua, en vertical y tenues. */
  private reflections: Phaser.GameObjects.Graphics | null = null;
  /**
   * El resplandor: lo que el mapa de luz no puede hacer. Multiplicando, una farola
   * como mucho devuelve al suelo su color de día; sumando un poco de su luz, el
   * granito bajo ella brilla dorado como en la referencia. A 1/4 de resolución y
   * repintado sólo cuando se repinta el mapa de luz: de coste por frame, nada.
   */
  private glow: Phaser.GameObjects.RenderTexture | null = null;
  /** Lo último pintado: si no cambia, no se repinta. */
  private lastKey = '';
  private readonly roofs: { x: number; y: number; w: number; h: number }[] = [];
  private roofBrush!: Phaser.GameObjects.Rectangle;
  /** Zonas con identidad (data/districts.ts), en px de mundo: su guion de color tiñe la luz del cielo. */
  private readonly zones: { x: number; y: number; w: number; h: number; profile: DistrictProfile }[];
  /** Color y fuerza de farola y escaparate donde cae (px de mundo): la temperatura de cada zona. */
  private readonly lampAt: (x: number, y: number) => readonly [number, number];
  /**
   * Píxeles de mundo por píxel del mapa de luz (config/quality.ts): a 1, las sombras
   * del sol salen nítidas; a 2, cuesta la cuarta parte y se ven más suaves.
   */
  private readonly lm: number = QUALITY.lightmapScale;
  /** Ventanas con la tele puesta: su luz sube y baja un poco, cada una a su ritmo. */
  private screens: { x: number; y: number; w: number; h: number; seed: number }[] = [];
  /** Linternas de farola de la calle (px de mundo): las polillas vuelan a su alrededor. */
  private readonly lampHeads: { x: number; y: number }[] = [];
  /** El pie de cada farola: de ahí salen las sombras largas de la gente (world/LampShadows). */
  private readonly lampFeet: { x: number; y: number }[] = [];
  /** Lo que se mueve en la luz cada frame (tele, polillas): una sola capa aditiva, vacía de día. */
  private fx: Phaser.GameObjects.Graphics | null = null;
  private fxAt = 0;
  private fxEmpty = true;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;

  constructor(scene: Phaser.Scene, def: LocationDef, built: { widthPx: number; heightPx: number; windows: readonly WindowSpot[]; glows: readonly GlowSpot[] }, state: GameState) {
    const { widthPx, heightPx } = built;
    this.state = state;
    this.camera = scene.cameras.main;
    this.indoor = def.kind === 'interior';
    this.ambient = def.ambient ? Number.parseInt(def.ambient.slice(1), 16) : 0xffffff;
    this.room = placeForInterior(def.id);
    this.windowSpots = built.windows;
    this.zones = zonesOf(def).map((z) => ({ x: z.tx * TILE, y: z.ty * TILE, w: z.w * TILE, h: z.h * TILE, profile: DISTRICTS[z.profile] }));
    this.lampAt = (x, y) => {
      const lamp = profileAt(def, Math.floor(x / TILE), Math.floor(y / TILE))?.lamp;
      return lamp ? [hex(lamp[0]), lamp[1]] : [WARM, 1];
    };
    // Con margen: la cámara puede enseñar algo más allá del borde del mapa.
    const m = TILE * 24;
    this.shade = scene.add
      .rectangle(-m, -m, widthPx + m * 2, heightPx + m * 2, 0xffffff)
      .setOrigin(0, 0)
      .setDepth(DEPTH)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.windows = scene.add.graphics().setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);

    for (const p of def.props) {
      const prop = PROPS[p.kind];
      const x = p.tx * TILE + ((prop.tilesWide ?? 1) * TILE) / 2;
      // Lo alto (troncos, farolas, columnas) echa sombra al sol desde su base.
      if (prop.cast) this.casters.push({ x: x - 2, y: (p.ty + 1) * TILE - 3, w: 4, h: 2, height: prop.cast, blob: prop.castBlob });
      if (!prop.light) continue;
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
        // Charco definido, no un baño: entre farola y farola queda la penumbra azul de la noche (design/visual-reference).
        const [w, h] = prop.light.pool ? [prop.light.pool[0] * 2.3, prop.light.pool[1] * 3.0] : [84, 50];
        const [warm, strength] = this.lampAt(x, baseY);
        const color = prop.light.cool ? COOL : warm;
        if (prop.light.pool && !prop.light.cool) {
          this.lampHeads.push({ x, y });
          this.lampFeet.push({ x, y: baseY });
        }
        const s = prop.light.cool ? 0.6 : strength;
        // Una farola en capas (config/quality.ts): primero lo que alcanza a la fachada de al lado, a la altura
        // de la linterna; luego el charco; encima, el núcleo casi blanco al pie. Sin halos gigantes: todo en el suelo y el muro.
        if (QUALITY.layeredLamps && prop.light.pool) this.fixedSources.push({ x, y: y + 10, w: w * 0.8, h: h * 1.5, color, strength: s * 0.32 });
        this.fixedSources.push({ x, y: baseY, w, h, color, strength: s });
        if (QUALITY.layeredLamps && prop.light.pool) this.fixedSources.push({ x, y: baseY - 1, w: w * 0.36, h: h * 0.34, color: mix(color, 0xffffff, 0.4), strength: Math.min(1, s * 1.05) });
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
      // Visual V3 trae su propio brillo, a su resolución (world/HdBuilder): el de 1× quedaría encima, borroso.
      if (def.art !== 'hd') this.emissives.push({ img: scene.add.image(x, (p.ty + 1) * TILE, prop.emissive).setOrigin(0.5, 1).setDepth(DEPTH + 2) });
      this.fixedSources.push({ x, y: (p.ty + 1) * TILE - 2, w: 56, h: 30, color: COOL, strength: 0.45 });
    }
    for (const g of built.glows) {
      const place = g.building ? PLACE_OF_BUILDING.get(g.building) : undefined;
      // Rótulo de un edificio sin lugar (un bloque cualquiera): no hay quien lo encienda.
      if (g.building && !place) continue;
      const img = scene.add.image(g.x, g.y, g.key).setOrigin(0, 0).setScale(g.scale ?? 1).setDepth(DEPTH + 2);
      if (g.additive) img.setBlendMode(Phaser.BlendModes.ADD);
      // Neón de la noche y rótulos del Carmen: fijos casi siempre y, de higos a brevas, un tartamudeo (tick). Con movimiento reducido, fijos.
      const flickers = !!place && (place.tags.includes('nightlife') || place.tags.includes('carmen')) && !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
      this.emissives.push({ img, place, flicker: flickers ? this.emissives.length + 1 : undefined });
      if (!place && !g.quiet) {
        // La boca de metro, siempre encendida, alumbra la acera de delante.
        const src = scene.textures.get(g.key).getSourceImage();
        const [sw, sh] = [src.width * (g.scale ?? 1), src.height * (g.scale ?? 1)];
        this.fixedSources.push({ x: g.x + sw / 2, y: g.y + sh, w: sw * 1.8, h: sh * 1.4, color: WARM, strength: 0.75 });
        // Y por la escalera sube la luz fría de los tubos de abajo: el hueco se ve encendido, no un agujero.
        this.fixedSources.push({ x: g.x + sw / 2, y: g.y + sh * 0.62, w: sw * 0.55, h: sh * 0.55, color: 0xdcecff, strength: 0.8 });
      }
    }

    if (!this.indoor) {
      for (const b of def.buildings ?? []) {
        if (b.style === 'metro') continue;
        const rows = facadeRows(b) + backRows(b);
        const top = b.front === 'n' ? b.ty + 1 : b.ty;
        // Una farola no alumbra los tejados ni el sol les pone la sombra del vecino: quedan con la luz del cielo.
        this.roofs.push({ x: b.tx * TILE, y: top * TILE, w: b.w * TILE, h: (b.h - rows) * TILE });
        // Cuantas más plantas, más sombra: un local bajo poca, un bloque de tres la de media calle; los fondos de tejados, como un bloque.
        const floors = b.front === 's' ? (b.floors ?? 1) : b.front === 'n' ? 1 : 0;
        this.casters.push({ x: b.tx * TILE, y: b.ty * TILE, w: b.w * TILE, h: b.h * TILE, height: TILE * (floors === 0 ? 2.2 : 1.6 + (floors - 1) * 1.1) });
        const place = PLACE_OF_BUILDING.get(b.id);
        if (place && b.doorX !== undefined && b.front && place.type === 'business') this.doors.push({ b, place });
      }
      makeLightMask(scene);
      this.shade.setVisible(false);
      this.lightmap = scene.add
        .renderTexture(0, 0, Math.ceil(widthPx / this.lm), Math.ceil(heightPx / this.lm))
        .setOrigin(0, 0)
        .setScale(this.lm)
        .setDepth(DEPTH)
        .setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.lightmap.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.roofBrush = new Phaser.GameObjects.Rectangle(scene, 0, 0, 1, 1, 0xffffff).setOrigin(0, 0);
      // Las sombras se dibujan en coordenadas del mundo y se reducen al mapa de luz al pintarlas.
      this.shadows = new Phaser.GameObjects.Graphics(scene).setScale(1 / this.lm);
      this.reflections = scene.add.graphics().setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
      if (QUALITY.glow) {
        this.glow = scene.add
          .renderTexture(0, 0, Math.ceil(widthPx / GLOW_SCALE), Math.ceil(heightPx / GLOW_SCALE))
          .setOrigin(0, 0)
          .setScale(GLOW_SCALE)
          .setDepth(DEPTH + 1)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.glow.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      this.fx = scene.add.graphics().setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
    }

    // Los focos son de la sala abierta: a la hora de cierre se apagan aunque sigas dentro.
    const place = this.room;
    if (def.strobe) this.strobe(scene, def.strobe, () => !place || isOpen(place, state.day, state.hour, state.minute));

    const update = (): void => this.update();
    state.on('change', update);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      state.off('change', update);
      this.shadows?.destroy();
      this.reflections?.destroy();
      this.fx?.destroy();
      this.roofBrush?.destroy();
    });
    LAMP_LIGHT.lamps = this.lampFeet;
    this.update();
  }

  /**
   * Focos de colores sobre la pista: saltan de sitio a cada pulso de la música
   * (el mismo compás al que baila la gente, 500 ms). Con movimiento reducido,
   * quietos.
   */
  private strobe(scene: Phaser.Scene, area: NonNullable<LocationDef['strobe']>, live: () => boolean): void {
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
    const on = live();
    spots.forEach((light) => light.setVisible(on));
    let beat = 0;
    scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        const open = live();
        spots.forEach((light) => light.setVisible(open));
        if (!open || calm) return;
        beat++;
        spots.forEach((light, i) => {
          if ((beat + i) % 2 === 1) return;
          scene.tweens.add({ targets: light, ...spot(i, beat), duration: 180, ease: 'Cubic.easeOut' });
          light.setTint(STROBE_COLORS[(i + beat) % STROBE_COLORS.length]);
        });
      },
    });
  }

  private opened(place: PlaceInfo): boolean {
    const { day, hour, minute } = this.state;
    return isOpen(place, day, hour, minute);
  }

  /**
   * Qué ventanas tienen luz ahora: el escaparate, si su local está abierto; la
   * casa, si le toca por la hora. Las pinta y deja en `dynamicSources` la luz que
   * echan a la acera (y la de la puerta de cada local abierto).
   */
  private relight(night: number, homes: number, wet: number): void {
    const g = this.windows.clear();
    this.screens = [];
    const sources: LightSource[] = [];
    this.windowSpots.forEach((w, i) => {
      const place = PLACE_OF_BUILDING.get(w.building);
      const lit = w.shop ? !!place && this.opened(place) : windowRank(i) < homes;
      if (!lit) return;
      // El local abierto se ve de lejos: su color, más fuerte que una casa.
      // La luz que cae a la acera: la de un local, bien visible; la de una casa, un charco tenue que se suma a la calle.
      const [body, top, pool] = w.shop ? [0.7, 0.45, 0.75] : [0.5, 0.3, 0.42];
      if (w.shop) {
        g.fillStyle(w.tone, body).fillRect(w.x, w.y, w.w, w.h);
        g.fillStyle(0xffffff, top).fillRect(w.x, w.y, w.w, 1);
      } else this.homeWindow(g, w, i);
      // Y un poco de esa luz cae en la acera, al pie del cristal.
      const warm = this.lampAt(w.x + w.w / 2, w.y + w.h + 6)[0];
      sources.push({ x: w.x + w.w / 2, y: w.y + w.h + 6, w: w.w * 2 + 20, h: 26, color: w.shop ? mix(warm, w.tone, 0.6) : warm, strength: pool });
    });
    // La puerta de un local abierto: un charco en el umbral, del color de dentro.
    for (const { b, place } of this.doors) {
      if (!this.opened(place)) continue;
      const pane = this.windowSpots.find((w) => w.building === b.id && w.shop);
      const x = b.doorX! * TILE + TILE / 2;
      const y = b.front === 'n' ? b.ty * TILE - 4 : (b.ty + b.h) * TILE + 6;
      const warm = this.lampAt(x, y)[0];
      sources.push({ x, y, w: 46, h: 28, color: pane ? mix(warm, pane.tone, 0.7) : warm, strength: 0.7 });
    }
    this.dynamicSources = sources;
    this.windows.setAlpha(night).setVisible(night > 0.05);
    // Con el suelo mojado, cada luz fuerte se repite debajo en una raya vertical: el reflejo, falso y barato.
    const r = this.reflections?.clear();
    if (r && QUALITY.reflections && wet > 0.15 && night > 0.05) {
      for (const l of [...this.fixedSources, ...sources]) {
        if (l.strength < 0.5) continue;
        r.fillStyle(l.color, 0.18 * wet * l.strength).fillRect(Math.round(l.x) - 1, Math.round(l.y) + 3, 3, 14);
        r.fillStyle(l.color, 0.1 * wet * l.strength).fillRect(Math.round(l.x) - 2, Math.round(l.y) + 6, 5, 6);
      }
    }
  }

  /**
   * Una ventana de casa con luz, cada una a su manera y siempre igual (su número
   * fijo): lámpara cálida, luz de fondo tenue, el azul de una tele, cortinas
   * corridas o persiana a medias; y en alguna, alguien de pie al trasluz. Un
   * poco de esa luz se queda en el muro alrededor del hueco.
   */
  private homeWindow(g: Phaser.GameObjects.Graphics, w: WindowSpot, i: number): void {
    const kind = windowKind(i);
    const color = kind === 'tv' ? 0x7fa8d8 : kind === 'dim' ? 0xa86a30 : 0xd08a3a;
    const alpha = kind === 'dim' ? 0.34 : kind === 'tv' ? 0.42 : 0.5;
    // El muro de alrededor recoge algo de luz: un marco tenue, no un halo.
    g.fillStyle(color, 0.07).fillRect(w.x - 2, w.y - 1, w.w + 4, w.h + 3);
    const someone = w.h >= 8 && w.w >= 4 && windowRank(i * 13 + 5) < 0.14;
    const cx = w.x + Math.floor(w.w / 2);
    for (let y = w.y; y < w.y + w.h; y++) {
      // Persiana a medias: la mitad de arriba con sus lamas.
      if (kind === 'blinds' && y < w.y + w.h * 0.55 && (y - w.y) % 2 === 1) continue;
      // Alguien al trasluz: cabeza de dos y hombros de cuatro, apoyado en el alféizar.
      const row = y - (w.y + w.h - 5);
      if (someone && row >= 0) {
        const [l, r] = row < 2 ? [cx - 1, cx + 1] : [cx - 2, cx + 2];
        g.fillStyle(color, alpha).fillRect(w.x, y, l - w.x, 1).fillRect(r, y, w.x + w.w - r, 1);
        continue;
      }
      g.fillStyle(color, alpha).fillRect(w.x, y, w.w, 1);
    }
    if (kind === 'curtain') {
      // Cortinas recogidas a los lados: la tela deja pasar menos luz.
      g.fillStyle(0x6a3a24, 0.35).fillRect(w.x, w.y, 1, w.h).fillRect(w.x + w.w - 1, w.y, 1, w.h);
    }
    g.fillStyle(kind === 'tv' ? 0xc8e0ff : 0xf0c070, 0.3).fillRect(w.x, w.y, w.w, 1);
    if (kind === 'tv') this.screens.push({ x: w.x, y: w.y, w: w.w, h: w.h, seed: i });
  }

  /** Las sombras del sol en coordenadas del mundo: la barrida de cada huella hacia donde cae la sombra. */
  private castShadows(sun: Sun, color: number): Phaser.GameObjects.Graphics {
    const g = this.shadows!.clear().fillStyle(color, 1);
    for (const c of this.casters) {
      const ox = sun.dx * c.height * sun.length;
      const oy = sun.dy * c.height * sun.length;
      const [l, t, r, b] = [c.x, c.y, c.x + c.w, c.y + c.h];
      // La sombra de una caja es su huella barrida: la cara de abajo y la del lado hacia el que cae.
      const side = ox >= 0 ? r : l;
      g.fillPoints([{ x: side, y: t }, { x: side + ox, y: t + oy }, { x: side + ox, y: b + oy }, { x: side, y: b }] as Phaser.Types.Math.Vector2Like[], true);
      g.fillPoints([{ x: l, y: b }, { x: r, y: b }, { x: r + ox, y: b + oy }, { x: l + ox, y: b + oy }] as Phaser.Types.Math.Vector2Like[], true);
      if (c.blob) {
        // La copa no es un óvalo: cuatro lóbulos fijos por árbol (del sitio donde está), y la luz se cuela entre ellos.
        const [bw, bh] = c.blob;
        const cx = c.x + c.w / 2 + ox;
        const cy = c.y + oy - 2;
        const seed = Math.imul(Math.round(c.x) * 73 + Math.round(c.y), 2654435761) >>> 0;
        for (let k = 0; k < 4; k++) {
          const r = (n: number): number => ((seed >>> (k * 7 + n)) & 31) / 31 - 0.5;
          g.fillEllipse(cx + r(0) * bw * 0.5, cy + r(3) * bh * 0.45, bw * (0.55 + (r(1) + 0.5) * 0.2), bh * (0.55 + (r(2) + 0.5) * 0.25));
        }
      }
    }
    return g;
  }

  /**
   * El mapa de luz: el cielo de la hora, las sombras del sol, cada luz en su
   * color y los tejados con el cielo limpio. Multiplicado con la escena, lo
   * iluminado recupera su color y lo demás se queda en la sombra.
   */
  private paintLightmap(sky: number, night: number, sun: Sun, wet: number): void {
    const map = this.lightmap!;
    const ground = wetGround(sky, wet);
    map.clear().fill(ground);
    this.paintZones(map, ground);
    if (sun.strength > 0.02) map.draw(this.castShadows(sun, mix(sky, SUN_SHADOW, SUN_SHADOW_MAX * sun.strength)));
    if (night >= 0.05) {
      map.beginDraw();
      for (const l of [...this.fixedSources, ...this.dynamicSources]) {
        map.stamp(LIGHT_MASK, undefined, l.x / this.lm, l.y / this.lm, {
          scaleX: l.w / MASK_SIZE / this.lm,
          scaleY: l.h / MASK_SIZE / this.lm,
          tint: l.color,
          alpha: Math.min(1, night * l.strength),
          blendMode: Phaser.BlendModes.NORMAL,
          skipBatch: true,
        });
      }
      map.endDraw();
    }
    // Con un rectángulo propio (fusión normal): fill() heredaría la suma de la última luz.
    const roof = this.roofBrush.setFillStyle(sky);
    for (const r of this.roofs) map.draw(roof.setPosition(r.x / this.lm, r.y / this.lm).setSize(r.w / this.lm, r.h / this.lm));
    this.paintGlow(night);
  }

  /** El resplandor de cada luz encendida, algo más recogido que su charco; los tejados, sin él. */
  private paintGlow(night: number): void {
    const glow = this.glow;
    if (!glow) return;
    glow.clear();
    glow.setVisible(night >= 0.05);
    if (night < 0.05) return;
    glow.beginDraw();
    for (const l of [...this.fixedSources, ...this.dynamicSources]) {
      if (l.strength < 0.3) continue;
      glow.stamp(LIGHT_MASK, undefined, l.x / GLOW_SCALE, l.y / GLOW_SCALE, {
        scaleX: (l.w * 0.8) / MASK_SIZE / GLOW_SCALE,
        scaleY: (l.h * 0.8) / MASK_SIZE / GLOW_SCALE,
        tint: l.color,
        alpha: Math.min(1, night * l.strength * GLOW),
        blendMode: Phaser.BlendModes.ADD,
        skipBatch: true,
      });
    }
    glow.endDraw();
    const roof = this.roofBrush!.setFillStyle(0xffffff);
    for (const r of this.roofs) glow.erase(roof.setPosition(r.x / GLOW_SCALE, r.y / GLOW_SCALE).setSize(r.w / GLOW_SCALE, r.h / GLOW_SCALE));
  }

  /**
   * El guion de color de cada zona: su tinte de la hora por encima del cielo.
   * El borde se funde en tres tiles (un tercio, la mitad, entero): se cruza de
   * una zona a otra sin ver la raya.
   */
  private paintZones(map: Phaser.GameObjects.RenderTexture, ground: number): void {
    const hour = this.state.hour + this.state.minute / 60;
    const brush = this.roofBrush;
    for (const z of this.zones) {
      brush.setFillStyle(multiply(ground, gradeAt(z.profile, hour)));
      [1 / 3, 1 / 2, 1].forEach((alpha, i) => {
        const inset = i * TILE;
        brush.setAlpha(alpha).setPosition((z.x + inset) / this.lm, (z.y + inset) / this.lm).setSize((z.w - inset * 2) / this.lm, (z.h - inset * 2) / this.lm);
        map.draw(brush);
      });
    }
    brush.setAlpha(1);
  }

  private update(): void {
    if (this.indoor) {
      // Un local cerrado se queda a oscuras: la luz de la calle que entra por el cristal, y nada más.
      const open = !this.room || this.opened(this.room);
      this.shade.setFillStyle(open ? this.ambient : mix(this.ambient, 0x2c3050, 0.62));
      for (const light of this.lights) light.setAlpha(0.5).setVisible(open);
      for (const e of this.emissives) e.img.setAlpha(1).setVisible(open);
      this.windows.setVisible(false);
      LAMP_LIGHT.night = 0;
      LAMP_LIGHT.sky = 0xffffff;
      return;
    }
    const hour = this.state.hour + this.state.minute / 60;
    const w = weatherAt(this.state.day, hour);
    const sky = weatherSky(skyAt(hour), w);
    const night = nightAt(hour);
    const clear = sunAt(Math.floor(hour / SUN_STEP_H) * SUN_STEP_H);
    // Con el cielo cubierto casi no hay sombra: la luz viene de todas partes.
    const sun = { ...clear, strength: clear.strength * (1 - w.cloud * 0.9) };
    const wet = Math.round(w.wet * 20) / 20;
    const homes = Math.round(homeLightsAt(hour) * 40) / 40;
    // Qué locales están abiertos, en una cadena: si nada cambia, no se repinta nada.
    const open = [...PLACE_OF_BUILDING.values()].filter((p) => p.hours && this.opened(p)).map((p) => p.id).join(',');
    const key = `${sky}|${sun.dx.toFixed(3)}|${sun.length.toFixed(3)}|${sun.strength.toFixed(2)}|${homes}|${open}|${night > 0.05}|${wet}|${this.zones.map((z) => gradeAt(z.profile, hour)).join()}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.relight(night, homes, wet);
      this.paintLightmap(sky, night, sun, wet);
    }
    this.windows.setAlpha(night).setVisible(night > 0.05);
    for (const light of this.lights) light.setAlpha(night).setVisible(night > 0.05);
    this.night = night;
    LAMP_LIGHT.night = night;
    LAMP_LIGHT.sky = sky;
    for (const e of this.emissives) {
      const on = night > 0.05 && (!e.place || this.opened(e.place));
      e.img.setAlpha(night).setVisible(on);
    }
  }

  /**
   * Cada frame, sólo lo que se mueve de la luz: el tartamudeo de un neón (una
   * vez cada 12–20 s, menos de medio segundo, cada rótulo a su hora) y el
   * reflejo del suelo mojado, que tiembla despacio como el agua.
   */
  tick(time: number): void {
    if (this.indoor) return;
    for (const e of this.emissives) {
      if (!e.flicker || !e.img.visible) continue;
      const period = 12_000 + (e.flicker * 2711) % 8000;
      const stutter = every(time, e.flicker, period, 420);
      e.img.setAlpha(this.night * (stutter && Math.floor(time / 70) % 3 === 0 ? 0.25 : 1));
    }
    if (this.reflections?.visible) this.reflections.setAlpha(0.7 + 0.3 * wave(time, 1900));
    this.animateLight(time);
  }

  /**
   * La tele de algunas casas (su luz sube y baja, cada una a su ritmo) y, en
   * calidad alta, dos o tres polillas alrededor de cada farola encendida que se
   * ve. Sólo de noche y sólo lo que está en cámara: de día la capa está vacía.
   */
  private animateLight(time: number): void {
    // A 30 veces por segundo basta para un parpadeo y unas polillas; vacía, ni se toca.
    if (!this.fx || time - this.fxAt < 33) return;
    this.fxAt = time;
    const idle = this.night < 0.05 || (this.screens.length === 0 && (!QUALITY.moths || this.night < 0.4));
    if (idle) {
      if (!this.fxEmpty) this.fx.clear();
      this.fxEmpty = true;
      return;
    }
    this.fxEmpty = false;
    const g = this.fx.clear();
    for (const s of this.screens) {
      const k = 0.5 + 0.5 * Math.sin(time / (170 + (s.seed % 5) * 40) + s.seed) * Math.sin(time / 1300 + s.seed * 3);
      g.fillStyle(0x9cc4ff, 0.14 * k * this.night).fillRect(s.x, s.y, s.w, s.h);
    }
    if (!QUALITY.moths || this.night < 0.4) return;
    const view = this.camera.worldView;
    for (const [i, l] of this.lampHeads.entries()) {
      if (l.x < view.x - 16 || l.x > view.right + 16 || l.y < view.y - 16 || l.y > view.bottom + 16) continue;
      for (let m = 0; m < 3; m++) {
        const t = time / (520 + m * 170) + i * 1.7 + m * 2.1;
        const x = l.x + Math.sin(t) * (4 + m * 2) + Math.sin(t * 2.7) * 1.5;
        const y = l.y - 2 + Math.cos(t * 1.3) * (3 + m) + Math.sin(t * 3.1);
        g.fillStyle(0xfff0c8, 0.55 * this.night).fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }
}
