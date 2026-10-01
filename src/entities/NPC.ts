import Phaser from 'phaser';
import type { Facing, NpcDef } from '../types/game';
import { personAnim, personTexture } from '../world/TextureFactory';
import { HD_SCALE } from '../world/HdKit';
import { hdPeopleOn } from '../world/HdPeople';

export class NPC extends Phaser.Physics.Arcade.Sprite {
  readonly def: NpcDef;
  private readonly shadow: Phaser.GameObjects.Image;
  /** Hacia dónde mira en su puesto. */
  private readonly post: Facing;

  constructor(scene: Phaser.Scene, x: number, y: number, def: NpcDef, facing: Facing) {
    super(scene, x, y, ...personTexture(scene, def.id, facing));
    // En una escena con arte HD, la textura es 4× más grande: se pinta a su tamaño de mundo.
    if (hdPeopleOn()) this.setScale(HD_SCALE);
    this.def = def;

    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(y);

    scene.physics.add.existing(this, true);
    const body = this.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(12, 8);
    body.position.set(x - 6, y - 8);
    body.updateCenter();

    this.shadow = scene.add.image(x, y - 1, 'fx-shadow').setOrigin(0.5, 0.5).setDepth(y - 1);
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.shadow.destroy());

    // Respira, cada uno a su compás: una fila de gente idéntica en sincronía se nota.
    this.anims.play(personAnim(scene, def.id, 'idle', facing));
    this.anims.setProgress(Math.random());
    this.post = facing;
  }

  /** Mira a quien le habla sin dejar de respirar; sin argumento, vuelve a mirar hacia su puesto. */
  look(facing: Facing = this.post): void {
    this.anims.play(personAnim(this.scene, this.def.id, 'idle', facing), true);
  }
}
