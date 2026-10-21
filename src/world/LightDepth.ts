import Phaser from 'phaser';
import { LAYER } from './Layers';

type Light = Phaser.GameObjects.Image | Phaser.GameObjects.Graphics | Phaser.GameObjects.RenderTexture;
interface Item {
  obj: Light;
  /** La Y del suelo donde está: lo que se ordena por Y con el pie más abajo (más cerca) la tapa. -Infinity: en el muro o en el suelo, detrás de todo. */
  foot: () => number;
}
type Occluder = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Margen alrededor de lo que se ve: la cámara de este frame aún no se ha movido cuando se compone. */
const MARGIN = 32;

/**
 * HD-03: la luz respeta la profundidad. El mapa de luz multiplica toda la escena desde arriba, así que lo que brilla
 * encima de la noche (ventanas y escaparates, la tele, los halos de las farolas, rótulos, semáforos, faros) iba por
 * encima de todo y se pintaba sobre quien pasaba por delante. Aquí cada luz con su pie en el mundo se compone en dos
 * texturas del tamaño de la vista (una que suma, otra normal), y quien está delante (más abajo en Y: gente, coches,
 * bicis, árboles) la recorta con su silueta al píxel; lo que está aún más delante que esa persona se vuelve a pintar
 * encima. Las luces registradas no las pinta la cámara (camera.ignore): sólo esta composición.
 *
 * Un componente por escena (LightDepth.of): world/Lighting, SignalView, TrafficView, CyclistView y PopUpView
 * registran sus luces; las entidades (entities/*) y los props altos (LocationBuilder) se registran como lo que tapa.
 */
export class LightDepth {
  private static readonly scenes = new WeakMap<Phaser.Scene, LightDepth>();
  /** Desarrollo (lifesim.lightDepth(false)): sin recorte, como antes, para comparar en el mismo sitio. */
  static cutout = true;

  static of(scene: Phaser.Scene): LightDepth {
    let d = LightDepth.scenes.get(scene);
    if (!d) {
      d = new LightDepth(scene);
      LightDepth.scenes.set(scene, d);
    }
    return d;
  }

  private readonly add: Item[] = [];
  private readonly normal: Item[] = [];
  private readonly occluders = new Set<Occluder>();
  private layers: { add: Phaser.GameObjects.RenderTexture; normal: Phaser.GameObjects.RenderTexture } | null = null;

  private readonly scene: Phaser.Scene;

  private constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.compose, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.compose, this);
      LightDepth.scenes.delete(scene);
    });
  }

  /** Una luz con su pie en el mundo. La cámara deja de pintarla; su dueño la sigue moviendo, encendiendo y apagando. */
  light(obj: Light, foot: number | (() => number)): void {
    this.scene.cameras.main.ignore(obj);
    (obj.blendMode === Phaser.BlendModes.ADD ? this.add : this.normal).push({ obj, foot: typeof foot === 'number' ? () => foot : foot });
    obj.once(Phaser.GameObjects.Events.DESTROY, () => {
      for (const list of [this.add, this.normal]) {
        const i = list.findIndex((it) => it.obj === obj);
        if (i >= 0) list.splice(i, 1);
      }
    });
  }

  /** Algo que se ordena por Y (su `depth` es su pie) y tapa la luz de lo que tiene detrás. */
  occluder(obj: Occluder): void {
    this.occluders.add(obj);
    obj.once(Phaser.GameObjects.Events.DESTROY, () => this.occluders.delete(obj));
  }

  /**
   * Las dos texturas, del tamaño de la vista más grande vista hasta ahora: se rehacen si la vista crece y nunca se
   * encogen (RenderTexture.resize dejaba de pintar fuera del tamaño de antes; una textura algo grande no cuesta nada).
   */
  private ensureLayers(w: number, h: number): { add: Phaser.GameObjects.RenderTexture; normal: Phaser.GameObjects.RenderTexture } {
    if (this.layers && this.layers.add.width >= w && this.layers.add.height >= h) return this.layers;
    const W = Math.max(w, this.layers?.add.width ?? 0);
    const H = Math.max(h, this.layers?.add.height ?? 0);
    this.layers?.add.destroy();
    this.layers?.normal.destroy();
    const make = (depth: number, blend: number): Phaser.GameObjects.RenderTexture => {
      const rt = this.scene.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(depth).setBlendMode(blend);
      rt.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      return rt;
    };
    this.layers = { add: make(LAYER.glow, Phaser.BlendModes.ADD), normal: make(LAYER.emissive, Phaser.BlendModes.NORMAL) };
    return this.layers;
  }

  private compose(): void {
    const view = this.scene.cameras.main.worldView;
    const x0 = Math.floor(view.x) - MARGIN;
    const y0 = Math.floor(view.y) - MARGIN;
    const x1 = Math.ceil(view.right) + MARGIN;
    const y1 = Math.ceil(view.bottom) + MARGIN;
    const seen = (b: Box): boolean => b.r > x0 && b.l < x1 && b.b > y0 && b.t < y1;
    const lit = (list: Item[]): { obj: Light; box: Box; foot: number }[] => {
      const out: { obj: Light; box: Box; foot: number }[] = [];
      for (const it of list) {
        if (!it.obj.visible || it.obj.alpha <= 0) continue;
        const box = boxOf(it.obj);
        if (seen(box)) out.push({ obj: it.obj, box, foot: it.foot() });
      }
      return out;
    };
    const add = lit(this.add);
    const normal = lit(this.normal);
    if (!add.length && !normal.length) {
      this.layers?.add.setVisible(false);
      this.layers?.normal.setVisible(false);
      return;
    }
    const layers = this.ensureLayers(x1 - x0, y1 - y0);
    const front: { o: Occluder; box: Box }[] = [];
    for (const o of this.occluders) {
      if (!o.visible || o.alpha <= 0) continue;
      const box = boxOf(o);
      if (seen(box)) front.push({ o, box });
    }
    for (const [rt, items] of [[layers.add, add], [layers.normal, normal]] as const) {
      rt.setVisible(items.length > 0);
      if (!items.length) continue;
      rt.setPosition(x0, y0);
      rt.camera.setScroll(x0, y0);
      rt.clear();
      rt.draw(items.map((i) => i.obj));
      // Quién tapa alguna luz que tiene detrás, y qué luces tiene a su vez delante (se repintan encima del hueco).
      const cut: Occluder[] = [];
      const redo = new Set<Light>();
      for (const { o, box } of front) {
        let hides = false;
        for (const i of items) {
          if (!overlap(box, i.box)) continue;
          if (i.foot < o.depth) hides = true;
          else redo.add(i.obj);
        }
        if (hides) cut.push(o);
      }
      if (!cut.length || !LightDepth.cutout) continue;
      rt.erase(cut);
      // ponytail: una luz delante de una persona y detrás de otra, con las dos encima, vuelve sobre la segunda; raro (dos personas y una luz en el mismo píxel).
      if (redo.size) rt.draw([...redo]);
    }
  }
}

const EVERYWHERE: Box = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity };

/** El rectángulo que ocupa en el mundo (una capa Graphics, que cubre todo el sitio, en todas partes). */
function boxOf(o: Light | Occluder): Box {
  if (o instanceof Phaser.GameObjects.Graphics) return EVERYWHERE;
  const w = o.displayWidth;
  const h = o.displayHeight;
  const l = o.x - o.originX * w;
  const t = o.y - o.originY * h;
  return { l, t, r: l + w, b: t + h };
}

const overlap = (a: Box, b: Box): boolean => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
