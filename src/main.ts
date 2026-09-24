import Phaser from 'phaser';
import './style.css';
import { PALETTE } from './config/constants';
import { createInitialState, GameState } from './state/GameState';
import { TimeSystem } from './systems/TimeSystem';
import { DialogueSystem } from './systems/DialogueSystem';
import { SaveSystem } from './systems/SaveSystem';
import { hasLocation, safePosition } from './systems/LocationSystem';
import { findPoint, pointsOfKind, route, worldRoute } from './systems/Navigation';
import { placeInfo, placesOfType } from './systems/Places';
import { MetroEventManager } from './systems/MetroEventManager';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { HUD } from './ui/HUD';
import { DialogueBox } from './ui/DialogueBox';
import { TargetHint } from './ui/TargetHint';
import { MetroDebug } from './ui/MetroDebug';
import { Announcer } from './ui/Announcer';
import { PlaceBanner } from './ui/PlaceBanner';
import { METRO_CONFIG } from './config/metro';
import type { Services } from './services';

function requireEl(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Falta el nodo ${selector}`);
  return el;
}

const save = new SaveSystem();
const loaded = save.load();
// Si el mapa cambió desde que se guardó y la posición cae dentro de algo, se
// aparece en la entrada de esa localización: la partida se conserva entera.
const initial =
  loaded && hasLocation(loaded.locationId)
    ? { ...loaded, position: safePosition(loaded.locationId, loaded.position, 'start') }
    : createInitialState();

const state = new GameState(initial);
const services: Services = {
  state,
  clock: new TimeSystem(state),
  dialogue: new DialogueSystem(),
  save,
  hint: new TargetHint(requireEl('#hint')),
  metroDebug: METRO_CONFIG.debug ? new MetroDebug(requireEl('#metro-debug')) : null,
  announcer: new Announcer(requireEl('#announce')),
  place: new PlaceBanner(requireEl('#place')),
  metroEvents: new MetroEventManager(state),
};

// La paleta vive en TypeScript; el CSS la consume desde aquí para no duplicarla.
const css = document.documentElement.style;
css.setProperty('--ink', PALETTE.ink);
css.setProperty('--night', PALETTE.night);
css.setProperty('--white', PALETTE.white);
css.setProperty('--amber', PALETTE.amber);
css.setProperty('--accent', PALETTE.glassLit);

new HUD(requireEl('#hud'), state);
new DialogueBox(requireEl('#dialogue'), services.dialogue);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PALETTE.ink,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 } },
  },
  scene: [new BootScene(services), new WorldScene(services)],
});

// Gancho de desarrollo para inspeccionar la partida desde la consola.
// Vite lo elimina del bundle de produccion.
if (import.meta.env.DEV) {
  const events = services.metroEvents;
  const now = () => ({ day: state.day, hour: state.hour, minute: state.minute, money: state.money, energy: state.energy });
  Object.assign(window, {
    lifesim: {
      game,
      services,
      // Depuración de eventos de metro. forceEvent actúa en el próximo viaje en tren.
      forceEvent: (id: string) => events.forceEvent(id),
      listAvailableEvents: (to?: string) => console.table(events.listAvailableEvents({ ...now(), to })),
      inspectEventHistory: () => events.inspectEventHistory(),
      resetMetroEvents: () => events.resetMetroEvents(),
      // Destinos del mundo para NPC futuros: lifesim.route('HOME_ENTRANCE', 'CAFE_ENTRANCE').
      findPoint,
      pointsOfKind,
      route,
      worldRoute,
      placeInfo,
      placesOfType,
    },
  });
}

window.addEventListener('beforeunload', () => {
  save.save(state.snapshot);
});
