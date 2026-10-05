import Phaser from 'phaser';
import './style.css';
import { PALETTE } from './config/constants';
import { createInitialState, GameState } from './state/GameState';
import { TimeSystem } from './systems/TimeSystem';
import { DialogueSystem } from './systems/DialogueSystem';
import { SaveSystem } from './systems/SaveSystem';
import { hasLocation, safePosition } from './systems/LocationSystem';
import { findPoint, pointsOfKind, route, worldRoute } from './systems/Navigation';
import { zoneActivity, zoneAt } from './systems/Zones';
import { DEBUG } from './config/debug';
import { QUALITY, setQuality, type QualityLevel } from './config/quality';
import { placeInfo, placesOfType } from './systems/Places';
import { forceWeather, weatherAt } from './systems/Weather';
import { MetroEventManager } from './systems/MetroEventManager';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { CyclistView } from './world/CyclistView';
import { hdCompare } from './world/HumanArtHD';

import { PLAYER_COLORS, humanKey } from './world/TextureFactory';

import { withAppearance } from './systems/Appearance';
import { STREET_EVENTS } from './data/streetEvents';
import { StreetEvent } from './systems/StreetEvents';
import { getLocation } from './systems/LocationSystem';
import type { WorldScene as WorldSceneType } from './scenes/WorldScene';
import type { ForceOptions } from './systems/Pickpocket';
import { HUD } from './ui/HUD';
import { DialogueBox } from './ui/DialogueBox';
import { TargetHint } from './ui/TargetHint';
import { MetroDebug } from './ui/MetroDebug';
import { Announcer } from './ui/Announcer';
import { PlaceBanner } from './ui/PlaceBanner';
import { Menu } from './ui/Menu';
import { MapScreen } from './ui/MapScreen';
import { MobileControls } from './ui/MobileControls';
import { PlayerInput } from './systems/PlayerInput';
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
  input: new PlayerInput(),
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
// Joystick y botón de acción en pantallas táctiles; en un PC con ratón no aparecen.
new MobileControls(requireEl('#touch'), services.input);

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
/**
 * Herramientas de desarrollo de los eventos de calle. Sólo las crea el gancho de
 * consola de abajo (import.meta.env.DEV): en la versión publicada no se llama y
 * Vite la deja fuera. Cada orden actúa sobre la regla de verdad del evento
 * (StreetEvent.dev*), así que la escena la ve en el siguiente frame.
 */
function devFight() {
  const events = new Map(STREET_EVENTS.map((d) => [d.id, new StreetEvent(d, getLocation(d.location))]));
  const pick = (id?: string): StreetEvent => {
    const ev = events.get(id ?? STREET_EVENTS[0].id);
    if (!ev) throw new Error(`No hay evento '${id}'. Hay: ${[...events.keys()].join(', ')}`);
    return ev;
  };
  const now = (): number => state.day * 1440 + services.clock.minuteOfDay;
  const world = (): WorldSceneType => game.scene.getScene('World') as WorldSceneType;
  const status = (id?: string) => ({ id: pick(id).def.id, ...pick(id).devStatus(now()) });
  return {
    /** Empieza la pelea ahora: el corro casi formado y el primer asalto en unos segundos. */
    force: (id?: string) => (pick(id).devForce(now()), status(id)),
    /** Lleva al jugador al mirador del evento (la boca del callejón que da al patio). */
    goto: (id?: string) => {
      const ev = pick(id);
      world().teleport(ev.def.location, ev.def.vantage, 'up');
      return `${ev.def.name}: ${ev.def.location} (${ev.def.vantage.tx}, ${ev.def.vantage.ty})`;
    },
    /** Fija la pelea activa (sin fin) o la suelta; al soltarla, el corro se deshace. */
    pin: (on = true, id?: string) => (pick(id).devPin(now(), on), status(id)),
    /** La quita ya: el patio queda vacío hasta que acabe la noche del calendario. */
    despawn: (id?: string) => (pick(id).devDespawn(now()), status(id)),
    /** Vuelve al calendario: quita lo forzado, lo fijado y lo retirado (el evento no tiene otro enfriamiento). */
    resetCooldown: (id?: string) => (pick(id).devReset(), status(id)),
    status,
  };
}

if (import.meta.env.DEV) {
  // F3: modo depuración (bordes y nombres de zonas, panel del metro, bicis). Apagado al arrancar; en producción no existe.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'F3') return;
    e.preventDefault();
    DEBUG.mode = !DEBUG.mode;
  });
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
      // Zonas lógicas (data/zones.ts): lifesim.zoneAt('district', 48, 52), lifesim.zoneActivity(zona, {day, hour, minute}).
      zoneAt,
      zoneActivity,
      // Calidad gráfica (config/quality.ts): lifesim.quality('low'|'medium'|'high') la cambia y rehace el sitio; sin nada, dice la actual.
      quality: (level?: QualityLevel) => {
        if (level) {
          setQuality(level);
          const world = game.scene.getScene('World');
          world.scene.restart({ locationId: state.locationId, position: { x: state.position.x, y: state.position.y }, facing: state.facing });
        }
        return { ...QUALITY };
      },
      pointsOfKind,
      route,
      worldRoute,
      placeInfo,
      placesOfType,
      // El jugador a 28 × 42 (world/HumanArtHD.drawPlayerHD): lifesim.hdCompare() pone, junto a él y por parejas,
      // a la izquierda el ORIGINAL de 16 × 24 y a la derecha el HD (la textura que usa su sprite). Otra llamada lo quita.
      hdCompare: () => {
        const world = game.scene.getScene('World') as WorldSceneType;
        return hdCompare(world, { x: state.position.x, y: state.position.y + 26 }, [
          { label: 'jugador', colors: withAppearance(PLAYER_COLORS, state.appearanceOf('player')), live: (f, p) => ({ key: humanKey('player', f, p) }) },
        ]);
      },
      // Carteristas del metro (systems/Pickpocket), en un andén: lifesim.crime.forcePickpocket() y, para afinar,
      // forcePickpocket({ victim: 'player' | 'npc', outcome: 'success' | 'fail', seen: true | false }); .status(), .resetCooldown().
      crime: {
        forcePickpocket: (opts?: ForceOptions) => (game.scene.getScene('World') as WorldSceneType).metroSystem?.forcePickpocket(opts) ?? 'no estás en una estación de metro',
        status: () => (game.scene.getScene('World') as WorldSceneType).metroSystem?.pickpocketStatus() ?? 'no estás en una estación de metro',
        resetCooldown: () => (game.scene.getScene('World') as WorldSceneType).metroSystem?.resetPickpocketCooldown(),
      },
      // Bicis: lifesim.debugCyclists() pinta carril, posición simulada, recuadro pintado y velocidad; debugCyclists(false) lo quita.
      debugCyclists: (on = true) => { CyclistView.debug = on; },
      // Pelea callejera (data/streetEvents.ts): lifesim.fight.force(), .goto(), .pin(true|false), .despawn(),
      // .resetCooldown(), .status(). Sin argumento, la del patio de la Mayor; con uno, el id de otro evento.
      // Es la misma noche que las del calendario (systems/StreetEvents.ts): la misma gente, poses, corro y recogida.
      fight: devFight(),
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
