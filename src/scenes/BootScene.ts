import Phaser from 'phaser';
import { buildTextures, registerAnimations } from '../world/TextureFactory';
import type { Services } from '../services';
import type { WorldSceneData } from './WorldScene';

/**
 * No carga nada de disco: todo el arte se dibuja por código. Existe para que
 * WorldScene arranque con las texturas y animaciones ya registradas.
 */
export class BootScene extends Phaser.Scene {
  private readonly services: Services;

  constructor(services: Services) {
    super({ key: 'Boot' });
    this.services = services;
  }

  create(): void {
    buildTextures(this);
    registerAnimations(this);

    const { state } = this.services;
    const payload: WorldSceneData = {
      locationId: state.locationId,
      position: { x: state.position.x, y: state.position.y },
      facing: state.facing,
    };
    this.scene.start('World', payload);
  }
}
