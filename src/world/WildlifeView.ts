import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { LocationDef, TilePoint } from '../types/game';
import { hashSeed, seededRng } from '../systems/MetroDaily';
import type { StreetLife } from '../systems/StreetLife';
import { Dogs, Pigeons, type Dog, type Pigeon } from '../systems/Wildlife';
import { buildAnimalTextures, dogFrame, pigeonFrame } from './AnimalArt';

/** Palomas en vuelo: por encima de la gente y los árboles, por debajo de la luz de la hora. */
const SKY_DEPTH = 850_000;
const LEASH_COLOR = 0x2a2430;

interface DogSprite {
  body: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  leash: Phaser.GameObjects.Graphics;
}

interface BirdSprite {
  body: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

/**
 * Pinta los perros y las palomas de systems/Wildlife.ts. Las palomas tienen
 * un sprite fijo cada una (el pozo se reutiliza: vuelan, se esconden y
 * vuelven); los perros, uno mientras dura el paseo. Nada tiene cuerpo físico.
 */
export class WildlifeView {
  private readonly scene: Phaser.Scene;
  private readonly street: StreetLife;
  private readonly dogs: Dogs;
  private readonly pigeons: Pigeons;
  private readonly dogSprites = new Map<number, DogSprite>();
  private readonly birdSprites: BirdSprite[];

  constructor(scene: Phaser.Scene, loc: LocationDef, street: StreetLife, day: number, hour: number, player: TilePoint) {
    this.scene = scene;
    this.street = street;
    buildAnimalTextures(scene);
    this.dogs = new Dogs(loc, Math.random);
    // Mismo día y hora, mismas palomas en los mismos sitios al entrar.
    this.pigeons = new Pigeons(loc, seededRng(hashSeed('pigeons', loc.id, day, Math.floor(hour * 2))));
    this.pigeons.populate(hour, player);
    this.birdSprites = this.pigeons.birds.map((b) => ({
      body: scene.add.image(0, 0, 'animals', pigeonFrame(b.look, 'stand')).setOrigin(0.5, 1).setVisible(false),
      shadow: scene.add.image(0, 0, 'fx-shadow').setScale(0.4, 0.5).setVisible(false),
    }));
  }

  update(dt: number, time: number, hour: number, player: TilePoint, playerMoving: boolean): void {
    this.dogs.update(dt, this.street.agents);
    // Asusta lo que se mueve: la gente andando, los perros y el jugador si camina. Quien está sentado, no.
    const threats: TilePoint[] = [];
    for (const a of this.street.agents) if (a.moving) threats.push({ tx: a.x, ty: a.y });
    for (const d of this.dogs.dogs.values()) threats.push({ tx: d.x, ty: d.y });
    if (playerMoving) threats.push(player);
    this.pigeons.update(dt, hour, threats, player);

    this.pigeons.birds.forEach((b, i) => this.drawBird(b, this.birdSprites[i], time));
    this.drawDogs(time);
  }

  private drawBird(b: Pigeon, s: BirdSprite, time: number): void {
    const visible = b.state !== 'away';
    s.body.setVisible(visible);
    s.shadow.setVisible(visible);
    if (!visible) return;
    const x = Math.round(b.x * TILE + TILE / 2);
    const y = Math.round(b.y * TILE + TILE - 2);
    const phase = time + b.id * 97;
    let pose = 'stand';
    if (b.state === 'flee' || b.state === 'land') pose = Math.floor(phase / 80) % 2 ? 'fly1' : 'fly2';
    else if (b.state === 'walk') pose = Math.floor(phase / 130) % 2 ? 'walk1' : 'walk2';
    else if (b.state === 'peck') pose = Math.floor(phase / 220) % 3 === 0 ? 'stand' : 'peck';
    s.body.setFrame(pigeonFrame(b.look, pose)).setFlipX(b.dir < 0).setPosition(x, y - Math.round(b.z));
    s.body.setDepth(b.z > 6 ? SKY_DEPTH : y);
    // La sombra se queda en el suelo y se aclara al subir.
    s.shadow.setPosition(x, y).setDepth(y - 1).setAlpha(Math.max(0.15, 0.8 - b.z / 40));
  }

  private drawDogs(time: number): void {
    for (const [id, d] of this.dogs.dogs) {
      let s = this.dogSprites.get(id);
      if (!s) {
        s = {
          body: this.scene.add.image(0, 0, 'animals', dogFrame(d.look, 'stand')).setOrigin(0.5, 1),
          shadow: this.scene.add.image(0, 0, 'fx-shadow').setScale(0.8),
          leash: this.scene.add.graphics(),
        };
        this.dogSprites.set(id, s);
      }
      this.drawDog(d, s, time);
    }
    for (const [id, s] of this.dogSprites) {
      if (this.dogs.dogs.has(id)) continue;
      s.body.destroy();
      s.shadow.destroy();
      s.leash.destroy();
      this.dogSprites.delete(id);
    }
  }

  private drawDog(d: Dog, s: DogSprite, time: number): void {
    const x = Math.round(d.x * TILE + TILE / 2);
    const y = Math.round(d.y * TILE + TILE - 1);
    let pose = d.state === 'sit' ? 'sit' : d.state === 'sniff' ? 'sniff' : 'stand';
    if (d.moving) {
      const beat = d.state === 'trot' ? 85 : 140;
      pose = Math.floor((time + d.owner * 53) / beat) % 2 ? 'walk1' : 'walk2';
    }
    s.body.setFrame(dogFrame(d.look, pose)).setFlipX(d.dir === 'left').setPosition(x, y).setDepth(y);
    s.shadow.setPosition(x, y - 1).setDepth(y - 1);

    // La correa: de la mano del dueño al collar, combándose un poco si va floja.
    s.leash.clear();
    const owner = d.orphan ? undefined : this.street.agents.find((a) => a.id === d.owner);
    if (!owner) return;
    const hx = owner.x * TILE + TILE / 2 + (d.x < owner.x ? -4 : 4);
    const hy = owner.y * TILE + TILE - 9;
    const cx = x + (d.dir === 'left' ? -4 : 4) * (pose === 'sit' ? 0.5 : 1);
    const cy = y - (pose === 'sniff' ? 4 : 7);
    const slack = Math.max(0, 3 - Math.hypot(hx - cx, hy - cy) / 8);
    s.leash.lineStyle(1, LEASH_COLOR, 0.9);
    s.leash.beginPath();
    s.leash.moveTo(hx, hy);
    s.leash.lineTo((hx + cx) / 2, (hy + cy) / 2 + slack);
    s.leash.lineTo(cx, cy);
    s.leash.strokePath();
    s.leash.setDepth(Math.max(y, owner.y * TILE + TILE) + 1);
  }
}
