import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { ZoneType } from '../data/zones';
import { zoneActivity, zoneAt, zonesIn, type ZoneClock } from '../systems/Zones';
import type { TilePoint } from '../types/game';

/**
 * Depuración de zonas (data/zones.ts): bordes, nombre y tipo sobre el mapa, y
 * abajo a la izquierda la zona del jugador con su actividad y su gente. Sólo
 * existe con el modo depuración encendido (config/debug.ts, F3 en desarrollo).
 */

const COLOR: Readonly<Record<ZoneType, number>> = {
  residential: 0xb0a080,
  plaza: 0x40c0ff,
  park: 0x40e060,
  main_road: 0xffffff,
  commercial: 0xffc040,
  metro: 0x6080ff,
  nightlife: 0xff40c0,
  restaurant_area: 0xff8040,
  gym_area: 0xff4040,
  special_event_area: 0xc040ff,
};

export class ZoneDebugView {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly panel: HTMLElement;
  private readonly location: string;
  private last = '';

  constructor(scene: Phaser.Scene, location: string) {
    this.location = location;
    const g = scene.add.graphics().setDepth(1_000_000);
    this.objects.push(g);
    for (const z of zonesIn(location)) {
      g.lineStyle(1, COLOR[z.type], 0.9);
      for (const r of z.rects) g.strokeRect(r.tx * TILE + 0.5, r.ty * TILE + 0.5, r.w * TILE - 1, r.h * TILE - 1);
      const r = z.rects[0];
      const label = scene.add.text(r.tx * TILE + 3, r.ty * TILE + 2, `${z.name}\n${z.type}`, {
        fontFamily: 'monospace', fontSize: '7px', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
      });
      this.objects.push(label.setDepth(1_000_001));
    }
    this.panel = document.createElement('pre');
    this.panel.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;background:#000a;color:#fff;font:11px monospace;z-index:50;pointer-events:none;white-space:pre';
    document.body.appendChild(this.panel);
  }

  update(player: TilePoint, clock: ZoneClock): void {
    const z = zoneAt(this.location, player.tx, player.ty);
    const text = z
      ? `ZONA ${z.name} (${z.id})\ntipo ${z.type} · ${z.districtId}\nactividad ${zoneActivity(z, clock).toFixed(2)}\ngente: ${z.population.label}`
      : 'ZONA —';
    if (text !== this.last) this.panel.textContent = this.last = text;
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.panel.remove();
  }
}
