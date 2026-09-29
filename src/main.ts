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
import { forceWeather, weatherAt } from './systems/Weather';
import { MetroEventManager } from './systems/MetroEventManager';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { CyclistView } from './world/CyclistView';
import { HUD } from './ui/HUD';
import { DialogueBox } from './ui/DialogueBox';
import { TargetHint } from './ui/TargetHint';
import { MetroDebug } from './ui/MetroDebug';
import { Announcer } from './ui/Announcer';
import { PlaceBanner } from './ui/PlaceBanner';
import { Menu } from './ui/Menu';
import { MapScreen } from './ui/MapScreen';
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
const dialogue = new DialogueSystem();
const menu = new Menu(requireEl('#menu'));
const services: Services = {
  state,
  clock: new TimeSystem(state),
  dialogue,
  save,
  hint: new TargetHint(requireEl('#hint')),
  metroDebug: METRO_CONFIG.debug ? new MetroDebug(requireEl('#metro-debug')) : null,
  announcer: new Announcer(requireEl('#announce')),
  place: new PlaceBanner(requireEl('#place')),
  metroEvents: new MetroEventManager(state),
  menu,
  // No se abre encima de un diálogo o un menú: primero se termina lo que se estaba haciendo.
  map: new MapScreen(requireEl('#map'), requireEl('#map-button') as HTMLButtonElement, state, () => dialogue.isOpen || menu.isOpen),
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

/**
 * El lienzo va a la resolución física de la pantalla y el CSS lo estira a la
 * ventana (style.css). Con RESIZE iría en px CSS y el navegador lo escalaría
 * por el devicePixelRatio: a 125 % o 150 % los píxeles del juego salen de dos
 * anchos distintos y la imagen tiembla al caminar. Así el zoom entero de la
 * cámara (WorldScene.fitCamera) es entero en píxeles de verdad.
 */
const stage = requireEl('#game');
// El tamaño del contenedor, no window.innerWidth: en móvil éste va un paso por detrás del viewport.
const deviceSize = (): [number, number] => [
  Math.max(1, Math.round(stage.clientWidth * window.devicePixelRatio)),
  Math.max(1, Math.round(stage.clientHeight * window.devicePixelRatio)),
];
const [deviceWidth, deviceHeight] = deviceSize();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PALETTE.ink,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: deviceWidth,
    height: deviceHeight,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 } },
  },
  scene: [new BootScene(services), new WorldScene(services)],
});

// Girar el móvil, cambiar de monitor o hacer zoom en el navegador cambia el tamaño físico.
// El observador además recoge el tamaño definitivo: en móvil, al arrancar el
// módulo el viewport aún no se ha asentado y ningún `resize` lo corrige.
const fitCanvas = (): void => {
  const [w, h] = deviceSize();
  if (w !== game.scale.width || h !== game.scale.height) game.scale.resize(w, h);
};
new ResizeObserver(fitCanvas).observe(stage);
window.addEventListener('resize', fitCanvas);

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
      // Bicis: lifesim.debugCyclists() pinta carril, posición simulada, recuadro pintado y velocidad; debugCyclists(false) lo quita.
      debugCyclists: (on = true) => { CyclistView.debug = on; },
      // El tiempo: lifesim.weather.now() y, para probar, lifesim.weather.force({ rain: 0.9, celsius: 5 }) (null: el del calendario).
      weather: {
        now: () => weatherAt(state.day, state.hour + state.minute / 60),
        force: (w: Parameters<typeof forceWeather>[0]) => forceWeather(w),
      },
    },
  });
}

window.addEventListener('beforeunload', () => {
  save.save(state.snapshot);
});
