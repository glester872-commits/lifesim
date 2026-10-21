import Phaser from 'phaser';
import type { Facing, NpcDef } from '../types/game';
import { personFrame, personScale, personTexture, showPerson } from '../world/TextureFactory';
import { LightDepth } from '../world/LightDepth';

export class NPC extends Phaser.Physics.Arcade.Sprite {
  readonly def: NpcDef;
  private readonly shadow: Phaser.GameObjects.Image;
  /** Hacia dónde mira en su puesto. */
  private readonly post: Facing;
  private facing: Facing;

  constructor(scene: Phaser.Scene, x: number, y: number, def: NpcDef, facing: Facing) {
    super(scene, x, y, personTexture(def.id), personFrame(def.id, facing));
    // Tapa la luz que tiene detrás: ventanas, halos, rótulos, semáforos (world/LightDepth).
    LightDepth.of(scene).occluder(this);
    this.def = def;

    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    // Igual que Character y Walker: el aspecto de 28 × 42 mide en el mundo lo mismo que los de 16 × 24.
    this.setScale(personScale(def.id));
    this.setDepth(y);

    scene.physics.add.existing(this, true);
    const body = this.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(12, 8);
    body.position.set(x - 6, y - 8);
    body.updateCenter();

    this.shadow = scene.add.image(x, y - 1, 'fx-shadow').setOrigin(0.5, 0.5).setDepth(y - 1);
    // Siempre a la vista en su puesto: retiene su ropa de 28 × 42 (si la lleva) hasta que se va con la escena.
    showPerson(null, def.id);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      showPerson(def.id, null);
      this.shadow.destroy();
    });

    // Respira, cada uno a su compás: una fila de gente idéntica en sincronía se nota.
    this.anims.play(`npc-${def.id}-idle-${facing}`);
    this.anims.setProgress(Math.random());
    this.post = facing;
    this.facing = facing;
  }

  /** Mira a quien le habla sin dejar de respirar; sin argumento, vuelve a mirar hacia su puesto. */
  look(facing: Facing = this.post): void {
    this.facing = facing;
    this.anims.play(`npc-${this.def.id}-idle-${facing}`, true);
  }

  /** Su ropa de 28 × 42 acaba de estar lista (o se ha tirado): la talla del mundo y su respiración, con la textura nueva. El cuerpo es fijo. */
  protected preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.scaleX === personScale(this.def.id)) return;
    this.setScale(personScale(this.def.id));
    this.anims.play(`npc-${this.def.id}-idle-${this.facing}`);
  }
}
