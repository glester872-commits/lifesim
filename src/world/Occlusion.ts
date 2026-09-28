import Phaser from 'phaser';
import { LAYER } from './Layers';

/**
 * Lo alto que se pone delante del jugador (la copa de un plátano, una farola,
 * la columna de carteles) se vuelve medio transparente mientras le tapa, y
 * vuelve a ser opaco al salir. El resto del tiempo el mundo tapa lo que tiene
 * que tapar: ir por detrás de un árbol se sigue viendo, pero nunca se pierde al
 * jugador de vista. Sólo el jugador: la gente y los coches se ocultan tras las
 * cosas como es debido.
 */

/** Más alto que esto (px) cuenta como algo que puede tapar a una persona. */
const TALL = 40;
/** Hasta dónde se desvanece. */
const FADED = 0.45;
/** Rapidez del fundido: fracción del camino por cada 100 ms. */
const EASE_PER_100MS = 0.8;

export class Occlusion {
  private readonly tall: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene) {
    // Lo que está de pie en el mundo (ordenado por Y), no lo del techo ni la luz: sólo props altos.
    this.tall = scene.children.list.filter(
      (o): o is Phaser.GameObjects.Image =>
        o instanceof Phaser.GameObjects.Image && o.depth > 0 && o.depth < LAYER.overhead && o.height >= TALL && o.originY === 1,
    );
  }

  /** `foot`: los pies del jugador. Se llama cada frame. */
  update(foot: { x: number; y: number }, deltaMs: number): void {
    // El cuerpo del jugador, de los pies a la cabeza.
    const left = foot.x - 6;
    const right = foot.x + 6;
    const top = foot.y - 22;
    const k = Math.min(1, (deltaMs / 100) * EASE_PER_100MS);
    for (const img of this.tall) {
      const w = img.displayWidth;
      // Tapa si está delante (sus pies más al sur) y su dibujo, sin contar la base, cae encima del cuerpo.
      const covers =
        img.depth > foot.y &&
        right > img.x - w / 2 &&
        left < img.x + w / 2 &&
        foot.y > img.y - img.displayHeight &&
        top < img.y - 6;
      const want = covers ? FADED : 1;
      if (img.alpha !== want) img.setAlpha(Math.abs(want - img.alpha) < 0.02 ? want : img.alpha + (want - img.alpha) * k);
    }
  }
}
