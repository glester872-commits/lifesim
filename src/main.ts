import Phaser from 'phaser';
import './style.css';
import { PALETTE } from './config/constants';
import { GameState } from './state/GameState';
import { TimeSystem } from './systems/TimeSystem';
import { DialogueSystem } from './systems/DialogueSystem';
import { restore, SaveSystem } from './systems/SaveSystem';
import { findPoint, pointsOfKind, route, worldRoute } from './systems/Navigation';
import { zoneActivity, zoneAt } from './systems/Zones';
import { DEBUG } from './config/debug';
import { QUALITY, setQuality, type QualityLevel } from './config/quality';
import { placeInfo, placesOfType } from './systems/Places';
import { forceWeather, weatherAt } from './systems/Weather';
import { dateOf, dayOfDate, formatDate, SEASON_LABEL } from './systems/Calendar';
import { handoffs } from './systems/Handoff';
import { MetroEventManager } from './systems/MetroEventManager';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { CyclistView } from './world/CyclistView';
import { HD_SCALE, hdCompare } from './world/HumanArtHD';
import { riderTexture } from './world/CyclistArt';
import { BIKES } from './data/bikes';
import { PASSENGER_LOOKS } from './data/npcs';
import { ALLEY_SPOTS } from './data/alleyDeals';
import { AlleyDeal } from './systems/AlleyDeals';
import { AlleyDealView } from './world/AlleyDealView';

/** Lo que pone lifesim.scaleCompare() (sólo en desarrollo). */
let scaleShown: Phaser.GameObjects.GameObject[] = [];

import { SCALE } from './config/scale';
import { HD_PERSON, PLAYER_COLORS, humanKey, personFrame, personScale, personTexture } from './world/TextureFactory';

import { withAppearance } from './systems/Appearance';
import { STREET_EVENTS } from './data/streetEvents';
import { STORIES } from './data/saraStory';
import { StreetEvent } from './systems/StreetEvents';
import { eventId, type EventInfo } from './systems/WorldEvents';
import { auditableLocations, auditVenues, lastTransitionError } from './systems/VenueAudit';
import { getLocation } from './systems/LocationSystem';
import type { WorldScene as WorldSceneType } from './scenes/WorldScene';
import { HUD } from './ui/HUD';
import { DialogueBox } from './ui/DialogueBox';
import { TargetHint } from './ui/TargetHint';
import { MetroDebug } from './ui/MetroDebug';
import { Announcer } from './ui/Announcer';
import { PlaceBanner } from './ui/PlaceBanner';
import { Menu } from './ui/Menu';
import { MapScreen } from './ui/MapScreen';
import { PhoneScreen } from './ui/Phone';
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
// Si el mapa cambió desde que se guardó (un sitio renombrado, una posición que ahora cae dentro de algo),
// systems/SaveSystem.restore recoloca al jugador y conserva el resto de la partida.
const initial = restore(loaded);

const state = new GameState(initial);
const dialogue = new DialogueSystem();
const menu = new Menu(requireEl('#menu'));
// Ni el móvil encima del mapa ni el mapa encima del móvil: primero se cierra uno.
const phone = new PhoneScreen(requireEl('#phone'), requireEl('#phone-button') as HTMLButtonElement, requireEl('#phone-toast'), state, () => dialogue.isOpen || menu.isOpen || services.map.isOpen);
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
  map: new MapScreen(requireEl('#map'), requireEl('#map-button') as HTMLButtonElement, state, () => dialogue.isOpen || menu.isOpen || phone.isOpen),
  input: new PlayerInput(),
  phone,
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

/**
 * Todos los sucesos del mundo con el mismo ciclo (systems/WorldEvents), sólo en desarrollo:
 * lifesim.events.list() (tabla: id, ciclo, fase, edad, participantes, quien acude, enfriamiento),
 * .active(), .inspect(id), .force(id), .resolve(id), .cancel(id), .resetCooldown(id).
 * Ids: fight:<evento>, alley:<sitio> y, dentro de una estación, pickpocket:<estación>.
 * No es otro gestor: cada orden va al sistema de siempre (StreetEvents, AlleyDeals, Pickpocket).
 */
function devEvents() {
  const fights = new Map(STREET_EVENTS.map((d) => [eventId('fight', d.id), new StreetEvent(d, getLocation(d.location))]));
  const deals = new Map(ALLEY_SPOTS.map((s) => [eventId('alley', s.id), new AlleyDeal(s, getLocation(s.location))]));
  const now = (): number => state.day * 1440 + services.clock.minuteOfDay;
  const metro = () => (game.scene.getScene('World') as WorldSceneType).metroSystem;
  /** El carterista de la calle de aquí (systems/Pickpocket), si hay calle con gente. */
  const street = () => (game.scene.getScene('World') as WorldSceneType).streetSystem?.pickpocket;
  const all = (): EventInfo[] => {
    const crime = metro()?.pickpocketLifecycle();
    const robbery = street()?.lifecycle();
    return [...[...fights.values()].map((f) => f.lifecycle(now())), ...[...deals.values()].map((d) => d.lifecycle(now())), ...(crime ? [crime] : []), ...(robbery ? [robbery] : [])];
  };
  const inspect = (id: string): EventInfo => {
    const e = all().find((x) => x.id === id);
    if (!e) throw new Error(`No hay suceso '${id}'. Hay: ${all().map((x) => x.id).join(', ')}`);
    return e;
  };
  const act = (id: string, what: 'force' | 'resolve' | 'cancel' | 'reset'): string => {
    const t = now();
    const f = fights.get(id);
    if (f) return what === 'force' ? (f.devForce(t), 'forzada') : what === 'resolve' ? f.devResolve(t) : what === 'cancel' ? f.devCancel(t) : (f.devReset(), 'enfriamiento quitado');
    const d = deals.get(id);
    if (d) return what === 'force' ? (d.devForce(t), 'forzado') : what === 'resolve' ? d.devResolve(t) : what === 'cancel' ? d.devCancel(t) : (d.devReset(), 'enfriamiento quitado');
    const sp = street();
    if (sp && id === sp.lifecycle().id) {
      const world = game.scene.getScene('World') as WorldSceneType;
      if (what === 'force') return world.debugStreetPickpocket(false).reason;
      if (what === 'resolve') return sp.resolve();
      if (what === 'cancel') return sp.cancel();
      return (sp.resetCooldown(), 'enfriamiento quitado');
    }
    const m = metro();
    if (id.startsWith('pickpocket:') && m) {
      if (what === 'force') return m.debugPickpocket() ? 'en marcha' : 'nadie libre en el andén para robar';
      if (what === 'resolve') return m.resolvePickpocket();
      if (what === 'cancel') return m.cancelPickpocket();
      // Sin enfriamiento propio: el siguiente robo lo decide el reloj de microeventos de la estación.
      return 'sin enfriamiento que quitar';
    }
    return inspect(id).id;
  };
  const row = (e: EventInfo) => ({
    id: e.id,
    ciclo: e.lifecycle,
    fase: e.phase,
    edad: e.age === null ? '—' : `${Math.round(e.age)} ${e.unit}`,
    quedaComoMucho: e.maxLeft === null ? '—' : `${Math.round(e.maxLeft)} ${e.unit}`,
    participantes: e.participants.length,
    acuden: e.responders.join(', ') || '—',
    enfriamiento: e.cooldownLeft > 0 ? `${Math.round(e.cooldownLeft)} ${e.unit}` : '—',
    forzado: e.forced,
  });
  return {
    list: () => {
      const rows = all().map(row);
      console.table(rows);
      return rows;
    },
    active: () => all().filter((e) => e.lifecycle !== 'ELIGIBLE' && e.lifecycle !== 'COOLDOWN').map(row),
    inspect,
    force: (id: string) => ({ result: act(id, 'force'), ...row(inspect(id)) }),
    resolve: (id: string) => ({ result: act(id, 'resolve'), ...row(inspect(id)) }),
    cancel: (id: string) => ({ result: act(id, 'cancel'), ...row(inspect(id)) }),
    resetCooldown: (id: string) => ({ result: act(id, 'reset'), ...row(inspect(id)) }),
  };
}

/**
 * Trapicheo en callejones (systems/AlleyDeals), sólo en desarrollo: lifesim.alley.spots(), .status(id?),
 * .force(id?), .cancel(id?), .authority(id?) (prueba la retirada por alguien de uniforme), .goto(id?),
 * .zones(true|false) (dibuja los sitios y su estado) y .reset(id?) (quita el enfriamiento).
 */
function devAlley() {
  const deals = new Map(ALLEY_SPOTS.map((s) => [s.id, new AlleyDeal(s, getLocation(s.location))]));
  const pick = (id?: string): AlleyDeal => {
    const d = deals.get(id ?? ALLEY_SPOTS[0].id);
    if (!d) throw new Error(`No hay sitio '${id}'. Hay: ${[...deals.keys()].join(', ')}`);
    return d;
  };
  const now = (): number => state.day * 1440 + services.clock.minuteOfDay;
  const status = (id?: string) => ({ id: pick(id).spot.id, ...pick(id).devStatus(now()) });
  return {
    spots: () => ALLEY_SPOTS.map((s) => ({ id: s.id, name: s.name, area: s.area, odds: s.odds })),
    status,
    force: (id?: string) => (pick(id).devForce(now()), status(id)),
    cancel: (id?: string) => (pick(id).interrupt(now(), 'dev'), status(id)),
    authority: (id?: string) => (pick(id).interrupt(now(), 'authority'), status(id)),
    reset: (id?: string) => (pick(id).devReset(), status(id)),
    goto: (id?: string) => {
      const s = pick(id).spot;
      const at = s.entries[0];
      (game.scene.getScene('World') as WorldSceneType).teleport(s.location, at, 'up');
      return `${s.name}: ${s.location} (${at.tx}, ${at.ty})`;
    },
    zones: (on = true) => {
      AlleyDealView.debug = on;
      return on ? 'sitios a la vista' : 'ocultos';
    },
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
      // Microeventos de estación para desarrollo.
      metro: {
        pickpocket: () => {
          const world = game.scene.getScene('World') as WorldSceneType;
          return world.debugMetroPickpocket();
        },
      },

// Prompt 57: depuración del sistema social.
// Ejemplos:
// lifesim.social.get('sara')
// lifesim.social.dateReady('sara')
// lifesim.social.friend('ada')
// lifesim.social.reset('sara')
social: {
  get: (id = 'sara') => {
    return state.socialOf(id);
  },

  set: (
    id: string,
    changes: Partial<
      ReturnType<
        typeof state.socialOf
      >
    >,
  ) => {
    const profile =
      state.socialOf(id);

    Object.assign(
      profile,
      changes,
    );

    state.setSocialProfile(
      id,
      profile,
    );

    services.save.save(
      state.snapshot,
    );

    return state.socialOf(
      id,
    );
  },

  friend: (
    id = 'sara',
  ) => {
    const profile =
      state.socialOf(id);

    profile.friendship = 45;
    profile.trust = 30;
    profile.attraction = 10;
    profile.romance = 0;
    profile.mood = 70;
    profile.encounters =
      Math.max(
        profile.encounters,
        5,
      );

    state.setSocialProfile(
      id,
      profile,
    );

    services.save.save(
      state.snapshot,
    );

    return state.socialOf(
      id,
    );
  },

  flirtReady: (
    id = 'sara',
  ) => {
    const profile =
      state.socialOf(id);

    profile.friendship = 30;
    profile.trust = 25;
    profile.attraction = 38;
    profile.romance = 10;
    profile.mood = 70;
    profile.encounters =
      Math.max(
        profile.encounters,
        4,
      );

    state.setSocialProfile(
      id,
      profile,
    );

    services.save.save(
      state.snapshot,
    );

    return state.socialOf(
      id,
    );
  },

  dateReady: (
    id = 'sara',
  ) => {
    const profile =
      state.socialOf(id);

    profile.friendship = 50;
    profile.trust = 45;
    profile.attraction = 60;
    profile.romance = 35;
    profile.mood = 80;
    profile.encounters =
      Math.max(
        profile.encounters,
        6,
      );

    state.setSocialProfile(
      id,
      profile,
    );

    services.save.save(
      state.snapshot,
    );

    return state.socialOf(
      id,
    );
  },

  reset: (
    id = 'sara',
  ) => {
    state.setSocialProfile(
      id,
      {
        friendship: 0,
        attraction: 0,
        trust: 0,
        romance: 0,
        mood: 50,

        encounters: 0,

        contactExchanged: false,

        datesAccepted: 0,
        datesRejected: 0,

        flirtSuccesses: 0,
        flirtFailures: 0,

        memories: [],
      },
    );

    services.save.save(
      state.snapshot,
    );

    return state.socialOf(
      id,
    );
  },
},

      // Historia de un personaje con nombre (systems/Story, data/saraStory.ts): lifesim.story.get('sara') da flags,
      // ánimo, plan, lo vivido, decisiones, rutina de hoy y dónde está; .flag('sara', 'sara_tattoo') activa una flag
      // (sólo las que existen; false la quita) y .mood('sara', 20) le pone el ánimo. Se guarda al momento.
      story: {
        get: (id = 'sara') => (game.scene.getScene('World') as WorldSceneType).debugStory(id),
        flag: (id: string, flag: string, on = true) => {
          const def = STORIES[id];
          if (!def) throw new Error(`${id} no tiene historia`);
          if (!(flag in def.flags)) throw new Error(`flag desconocida: ${flag} (hay: ${Object.keys(def.flags).join(', ')})`);
          const story = state.storyOf(id, def.baseMood);
          if (on) story.flags[flag] ??= state.day;
          else delete story.flags[flag];
          state.setStory(id, story);
          services.save.save(state.snapshot);
          return Object.keys(story.flags);
        },
        mood: (id: string, mood: number) => {
          const def = STORIES[id];
          if (!def) throw new Error(`${id} no tiene historia`);
          const story = state.storyOf(id, def.baseMood);
          story.mood = Math.max(0, Math.min(100, mood));
          state.setStory(id, story);
          services.save.save(state.snapshot);
          return story.mood;
        },
      },

      // El móvil (systems/Phone): lifesim.phone.get() da hilos, pendientes y planes. Para tener el número de
      // alguien sin pedírselo: lifesim.social.set('sara', { contactExchanged: true }).
      phone: { get: () => state.phone },
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
      // Escala (sólo en desarrollo): lifesim.scaleCompare() pone en fila, junto al jugador y en su misma línea de suelo,
      // un peatón, un patinador, un ciclista, un turismo y un autobús con las texturas del juego a 1:1. Otra llamada lo quita.
      scaleCompare: () => {
        const world = game.scene.getScene('World') as WorldSceneType;
        if (scaleShown.length) {
          scaleShown.forEach((o) => o.destroy());
          scaleShown = [];
          return 'quitado';
        }
        const base = state.position.y + 12;
        let x = state.position.x + 14;
        const put = (key: string, frame: number | undefined, scale: number, label: string): void => {
          const img = world.add.image(x, base, key, frame).setOrigin(0, 1).setScale(scale).setDepth(base + 200);
          const t = world.add.text(x, base + 2, label, { fontFamily: 'monospace', fontSize: '24px', color: '#fff', backgroundColor: '#000a' }).setScale(0.25).setDepth(base + 201);
          scaleShown.push(img, t);
          x += img.displayWidth + 8;
        };
        put(humanKey('player', 'right', 0), undefined, HD_SCALE, 'peatón');
        put(riderTexture(world, { look: PASSENGER_LOOKS[0], bike: BIKES.find((b) => b.frame === 'skate')!, color: 0, helmet: false, pack: false }), 0, 1, 'tabla');
        put(riderTexture(world, { look: PASSENGER_LOOKS[0], bike: BIKES.find((b) => b.frame === 'scooter')!, color: 0, helmet: true, pack: false }), 0, 1, 'patinete');
        put(riderTexture(world, { look: PASSENGER_LOOKS[0], bike: BIKES[0], color: 0, helmet: true, pack: false }), 0, 1, 'bici');
        put('veh-compact-0', undefined, 1, 'coche');
        put('veh-bus-0', undefined, 1, 'autobús');
        // Mobiliario a la misma escala (config/scale.ts): banco, banco de plaza, farola, marquesina y árbol.
        for (const [key, label] of [['prop-bench', 'banco'], ['prop-plaza-bench', 'banco plaza'], ['prop-street-lamp', 'farola'], ['prop-bus-stop', 'marquesina'], ['prop-tree-0', 'árbol']]) put(key, undefined, 1, label);
        return `persona ${SCALE.personH} px; peatón / tabla / bici < coche < autobús; banco, farola, marquesina y árbol`;
      },
      // Auditoría visual (sólo en desarrollo): lifesim.lineup() pone en fila, junto al jugador y a 1:1, a quien sale en el juego
      // con cada ruta de dibujo: jugador, anónimo de 16 × 24, anónimo de 28 × 42, con nombre, de servicio, seguridad y ciclista.
      // Devuelve lo que mide cada uno en el mundo (píxeles opacos). Otra llamada lo quita.
      lineup: () => {
        const world = game.scene.getScene('World') as WorldSceneType;
        if (scaleShown.length) {
          scaleShown.forEach((o) => o.destroy());
          scaleShown = [];
          return 'quitado';
        }
        const base = state.position.y + 12;
        let x = state.position.x + 14;
        const sizes: string[] = [];
        const measure = (key: string, frame: string | number | undefined, scale: number): string => {
          const fr = world.textures.getFrame(key, frame);
          const c = document.createElement('canvas');
          c.width = fr.cutWidth;
          c.height = fr.cutHeight;
          const cx = c.getContext('2d')!;
          cx.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, c.width, c.height);
          const d = cx.getImageData(0, 0, c.width, c.height).data;
          let [x0, y0, x1, y1] = [1e9, 1e9, -1, -1];
          for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) if (d[(j * c.width + i) * 4 + 3] > 40) [x0, y0, x1, y1] = [Math.min(x0, i), Math.min(y0, j), Math.max(x1, i), Math.max(y1, j)];
          return `${((x1 - x0 + 1) * scale).toFixed(1)}×${((y1 - y0 + 1) * scale).toFixed(1)} (celda ${c.width}×${c.height}, escala ${scale.toFixed(2)}, pies a ${((c.height - 1 - y1) * scale).toFixed(1)} px)`;
        };
        const put = (label: string, key: string, frame: string | number | undefined, scale: number): void => {
          const img = world.add.image(x, base, key, frame).setOrigin(0, 1).setScale(scale).setDepth(base + 200);
          const shadow = world.add.image(x + img.displayWidth / 2, base - 1, 'fx-shadow').setDepth(base + 199);
          const t = world.add.text(x, base + 2 + (sizes.length % 2) * 7, label, { fontFamily: 'monospace', fontSize: '24px', color: '#fff', backgroundColor: '#000a' }).setScale(0.25).setDepth(base + 201);
          scaleShown.push(img, shadow, t);
          sizes.push(`${label}: ${measure(key, frame, scale)}`);
          x += Math.max(img.displayWidth, 18) + 14;
        };
        const person = (label: string, id: string): void => put(label, personTexture(id), personFrame(id, 'down'), personScale(id));
        put('jugador', humanKey('player', 'down', 0), undefined, HD_SCALE);
        person('anónimo', PASSENGER_LOOKS[0].id);
        person('anónimo HD', HD_PERSON ?? PASSENGER_LOOKS[0].id);
        person('con nombre', 'sara');
        person('servicio', 'uniforme-sala');
        person('seguridad', 'marco');
        put('ciclista', riderTexture(world, { look: PASSENGER_LOOKS[0], bike: BIKES[0], color: 0, helmet: true, pack: false }), 0, 1);
        return sizes.join(' | ');
      },
      // Carteristas del metro (MetroSystem.startPickpocket: un pasajero roba a otro, seguridad persigue, retiene y
      // escolta), en un andén: lifesim.crime.forcePickpocket(), .status() (el ciclo común), .resolve(), .cancel().
      crime: {
        // Metro o calle: en una estación, el robo de siempre; en la calle, el de la calle (sólo con mucha gente y en zonas que lo
        // permitan: si no, lo rechaza y dice por qué). forceOnPlayer() va a por el jugador; stats() cuenta lo que ha pasado.
        forcePickpocket: () => {
          const world = game.scene.getScene('World') as WorldSceneType;
          const m = world.metroSystem;
          if (m) return m.debugPickpocket() ? 'en marcha' : 'nadie libre en el andén para robar';
          return world.debugStreetPickpocket(false).reason;
        },
        forceOnPlayer: () => (game.scene.getScene('World') as WorldSceneType).debugStreetPickpocket(true).reason,
        stats: () => ({ ...((game.scene.getScene('World') as WorldSceneType).streetSystem?.pickpocket.stats ?? {}) }),
        status: () => {
          const world = game.scene.getScene('World') as WorldSceneType;
          return world.metroSystem?.pickpocketLifecycle() ?? world.streetSystem?.pickpocket.lifecycle() ?? 'aquí no hay robos posibles';
        },
        resolve: () => {
          const world = game.scene.getScene('World') as WorldSceneType;
          return world.metroSystem?.resolvePickpocket() ?? world.streetSystem?.pickpocket.resolve() ?? 'aquí no hay robos posibles';
        },
        cancel: () => {
          const world = game.scene.getScene('World') as WorldSceneType;
          return world.metroSystem?.cancelPickpocket() ?? world.streetSystem?.pickpocket.cancel() ?? 'aquí no hay robos posibles';
        },
      },
      // Patinetes eléctricos: lifesim.scooter() fuerza uno por el borde del carril bici del sitio, si el barrio lo permite
      // (data/districtIdentity.ts scooters: en Vallesco, no; en la Ribera, sí) y dice cuántos hay.
      scooter: () => (game.scene.getScene('World') as WorldSceneType).debugScooter(),
      // Bicis: lifesim.debugCyclists() pinta carril, posición simulada, recuadro pintado y velocidad; debugCyclists(false) lo quita.
      debugCyclists: (on = true) => { CyclistView.debug = on; },
      // Pelea callejera (data/streetEvents.ts): lifesim.fight.force(), .goto(), .pin(true|false), .despawn(),
      // .resetCooldown(), .status(). Sin argumento, la del patio de la Mayor; con uno, el id de otro evento.
      // Es la misma noche que las del calendario (systems/StreetEvents.ts): la misma gente, poses, corro y recogida.
      fight: devFight(),
      alley: devAlley(),
      events: devEvents(),
      // Locales de un barrio (systems/VenueAudit): lifesim.venues.audit('ribera') — cada fachada con su estado (se
      // entra, vivienda o quiosco), puerta e interior registrados, entrada y vuelta pisables, caminos, horario y gente;
      // .lastError() da el último fallo al cruzar una puerta.
      venues: {
        audit: (location = state.locationId) => {
          const rows = auditVenues(location).map((r) => ({
            local: r.name, estado: r.kind, lugar: r.place ?? '—', interior: r.interior ?? '—', puerta: r.entrance, interiorOk: r.interiorRegistered,
            entradaOk: r.interiorSpawnOk, vueltaOk: r.exteriorSpawnOk && r.exitReturnsHere, caminos: r.pathsOk, horario: r.hours, gente: r.population, problemas: r.problems.join(' | ') || '—',
          }));
          console.table(rows);
          return rows;
        },
        locations: () => auditableLocations(),
        lastError: () => lastTransitionError(),
      },
      // NPC atascados (systems/Recovery): lifesim.npc.status() da atascados, peldaños y recuperaciones por sistema;
      // .force() corta el paso al NPC que anda más cerca y lo da por atascado; .reset() quita obstáculos y estado.
      // Con F3, el inspector muestra el total y, del más cercano, destino, tiempo parado y peldaño.
      npc: {
        status: () => (game.scene.getScene('World') as WorldSceneType).recoveryStatus(),
        force: () => (game.scene.getScene('World') as WorldSceneType).forceStuck(),
        reset: () => (game.scene.getScene('World') as WorldSceneType).resetRecovery(),
      },
      // El tiempo: lifesim.weather.now() y, para probar, lifesim.weather.force({ rain: 0.9, celsius: 5 }) (null: el del calendario).
      weather: {
        now: () => weatherAt(state.day, state.hour + state.minute / 60),
        force: (w: Parameters<typeof forceWeather>[0]) => forceWeather(w),
      },
      // Quien entró por una puerta delante del jugador (systems/Handoff): lifesim.handoff() saca la cola en una tabla
      // (persona, de dónde, a dónde, cuándo entró, hasta cuándo se queda, si ya salió) y, si estás dentro de un local
      // o en el metro, quién de esa cola está ahora mismo en la sala.
      handoff: () => {
        const hm = (abs: number | undefined): string => (abs === undefined ? '—' : `${String(Math.floor((abs % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(abs % 60)).padStart(2, '0')}`);
        console.table(handoffs().map((h) => ({
          token: h.token, persona: PASSENGER_LOOKS[h.look]?.id, de: `${h.from} (${h.door})`, a: `${h.place} → ${h.interior}`,
          entro: hm(h.enteredAt), seQueda: `${Math.round(h.leaveAt - h.enteredAt)} min`, sale: hm(h.leaveAt), salio: hm(h.exitedAt), metro: h.transit,
        })));
        return (game.scene.getScene('World') as WorldSceneType).handoffOccupancy();
      },
      // La fecha del mundo (systems/Calendar): lifesim.date.now(), .set(2028, 2, 28, 23, 50), .addDays(1), .addMonths(1).
      // Sólo hacia delante y con el reloj de verdad (TimeSystem.advanceMinutes): cada medianoche se avisa y lo diario se
      // reinicia como al jugar. Hacia atrás no: los cooldowns y los planes ya guardados quedarían en el futuro.
      date: (() => {
        const now = (): string => {
          const d = dateOf(state.day);
          return `${formatDate(state.day)} — ${String(state.hour).padStart(2, '0')}:${String(state.minute).padStart(2, '0')} · ${SEASON_LABEL[d.season]} (día ${state.day} de la partida)`;
        };
        const to = (day: number, hour = state.hour, minute = state.minute): string => {
          const delta = (day - state.day) * 1440 + (hour - state.hour) * 60 + (minute - state.minute);
          if (delta < 0) return `no se vuelve atrás: ${now()}`;
          services.clock.advanceMinutes(delta);
          return now();
        };
        return {
          now,
          set: (year: number, month: number, dom: number, hour?: number, minute?: number) => to(dayOfDate(year, month, dom), hour, minute),
          addDays: (n = 1) => to(state.day + n),
          addMonths: (n = 1) => {
            const d = dateOf(state.day);
            const m = d.month - 1 + n;
            const year = d.year + Math.floor(m / 12);
            const month = (m % 12) + 1;
            // El 31 de enero + 1 mes es el último de febrero, no el 3 de marzo.
            const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
            return to(dayOfDate(year, month, Math.min(d.dom, last)));
          },
        };
      })(),
    },
  });
}

window.addEventListener('beforeunload', () => {
  save.save(state.snapshot);
});
