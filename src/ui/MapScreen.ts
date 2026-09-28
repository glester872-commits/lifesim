import { PALETTE } from '../config/constants';
import type { GameState } from '../state/GameState';
import type { Vec2 } from '../types/game';
import { hoursLabel, isOpen } from '../systems/Places';
import { MapViewport, mapPositionOf, worldMapFor, type MapMarker, type MapPosition, type PoiCategory, type Terrain, type WorldMapData } from '../systems/WorldMap';

/**
 * El mapa (tecla M o el botón): una capa de DOM encima del juego, como el menú.
 * Lo que dibuja sale de systems/WorldMap.ts (el suelo, los edificios y los
 * lugares del mundo); aquí sólo se pinta, se encuadra y se toca. El suelo se
 * hornea una vez por mapa en un lienzo aparte y cada encuadre lo copia escalado:
 * arrastrar o hacer zoom no recalcula nada. Ni gente ni tráfico: el mapa abstrae.
 *
 * Abierto, la Scene para el mundo (WorldScene.update), así que no hay que
 * guardar ni rehacer nada al cerrarlo.
 */

/** Píxeles por tile del lienzo horneado: con esto, los bordes de los edificios se ven. */
const BAKE = 8;
/** Zoom al abrir: la calle en la que estás y las de alrededor. */
const OPEN_ZOOM = 14;
/** Por debajo de este zoom los nombres de calle estorban más que ayudan. */
const AREA_LABEL_ZOOM = 7;
/** Más de esto arrastrando ya no es un clic sobre un icono. */
const DRAG_SLOP = 6;

const GROUND: Readonly<Record<Terrain, string>> = {
  green: PALETTE.grassDark,
  path: PALETTE.cobble,
  sidewalk: PALETTE.pavementSeam,
  plaza: PALETTE.plaza,
  road: PALETTE.asphalt,
  bike: PALETTE.bikeLane,
  crossing: PALETTE.roadLine,
  water: PALETTE.water,
  rail: PALETTE.ballast,
  court: '#5f8a74',
  building: PALETTE.wallDark,
};

const BUILDING: Readonly<Record<WorldMapData['buildings'][number]['kind'], string>> = {
  home: PALETTE.amber,
  place: PALETTE.roofA,
  residential: PALETTE.roofB,
  backdrop: '#5a5760',
};

/** Icono de cada categoría: un signo de texto dentro de una placa de su color. */
const POI: Readonly<Record<PoiCategory, { glyph: string; color: string; name: string }>> = {
  home: { glyph: '⌂', color: PALETTE.amber, name: 'Tu casa' },
  metro: { glyph: 'M', color: '#d8433b', name: 'Metro' },
  bus: { glyph: 'B', color: '#3f7fbf', name: 'Autobús' },
  food: { glyph: '●', color: '#e08a3c', name: 'Comer y beber' },
  night: { glyph: '♪', color: '#ff6ab8', name: 'Noche' },
  shop: { glyph: '◆', color: '#6fd0c6', name: 'Tienda' },
  service: { glyph: '✂', color: '#b58be0', name: 'Servicio' },
  sport: { glyph: '▲', color: '#8fcf5a', name: 'Deporte' },
  work: { glyph: '■', color: '#a8a194', name: 'Trabajo' },
  civic: { glyph: '▣', color: '#c4bdb0', name: 'Servicio público' },
  park: { glyph: '♣', color: '#8fcf5a', name: 'Parque' },
  plaza: { glyph: '◇', color: PALETTE.plazaLit, name: 'Plaza' },
  door: { glyph: '▪', color: PALETTE.wallLit, name: 'Puerta' },
};

const FACING_DEG: Readonly<Record<string, number>> = { up: 0, right: 90, down: 180, left: 270 };

export class MapScreen {
  private readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly state: GameState;
  private readonly blocked: () => boolean;
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly layer: HTMLElement;
  private readonly you: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly whereEl: HTMLElement;
  private readonly view = new MapViewport();
  /** Suelo horneado por mapa: se hace la primera vez que se abre ese mapa. */
  private readonly baked = new Map<string, HTMLCanvasElement>();
  private map: WorldMapData | null = null;
  private here: MapPosition | null = null;
  /** Iconos y nombres de calle colocados sobre el mapa, con su punto en espacio del mapa. */
  private placed: { el: HTMLElement; at: Vec2; area: boolean }[] = [];
  /** El icono cuyo nombre se enseña, y si está fijado (clic o toque) o sólo por pasar el ratón. */
  private tipAt: MapMarker | null = null;
  private pinned = false;
  private opened = false;
  /** Dedos o ratón apretados: uno arrastra, dos hacen zoom. */
  private readonly pointers = new Map<number, Vec2>();
  private dragged = 0;
  private readonly onResize = (): void => this.fit();

  constructor(root: HTMLElement, button: HTMLButtonElement, state: GameState, blocked: () => boolean) {
    this.root = root;
    this.button = button;
    this.state = state;
    this.blocked = blocked;
    root.innerHTML = `
      <div class="map__frame">
        <header class="map__head">
          <p class="map__title"></p>
          <p class="map__where"></p>
        </header>
        <div class="map__stage">
          <canvas class="map__canvas"></canvas>
          <div class="map__layer"></div>
          <div class="map__you" aria-hidden="true"><span class="map__you-arrow"></span><span class="map__you-dot"></span><span class="map__you-label">Estás aquí</span></div>
          <div class="map__tip" hidden></div>
        </div>
        <footer class="map__foot">
          <p class="map__keys">M o Esc cierra · arrastra para moverte · rueda o pellizco para acercar</p>
          <div class="map__controls">
            <button type="button" data-act="out" aria-label="Alejar">−</button>
            <button type="button" data-act="in" aria-label="Acercar">+</button>
            <button type="button" data-act="center">◎ Dónde estoy</button>
            <button type="button" data-act="close">Cerrar</button>
          </div>
        </footer>
      </div>
    `;
    const pick = <T extends HTMLElement>(s: string): T => {
      const el = root.querySelector<T>(s);
      if (!el) throw new Error(`Mapa: falta ${s}`);
      return el;
    };
    this.stage = pick('.map__stage');
    this.canvas = pick('.map__canvas');
    this.layer = pick('.map__layer');
    this.you = pick('.map__you');
    this.tip = pick('.map__tip');
    this.titleEl = pick('.map__title');
    this.whereEl = pick('.map__where');

    button.addEventListener('click', () => {
      // Sin foco en el botón: Espacio o Intro no deben volver a pulsarlo mientras se juega.
      button.blur();
      this.toggle();
    });
    pick('.map__controls').addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      (e.target as HTMLElement).closest('button')?.blur();
      if (act === 'close') this.close();
      else if (act === 'center') this.centerOnPlayer();
      else if (act === 'in' || act === 'out') this.zoomBy(act === 'in' ? 1.5 : 1 / 1.5);
    });
    this.bindPointer();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }

  /** Abre el mapa del sitio donde estás, centrado en ti. No abre encima de un diálogo o un menú. */
  open(): void {
    if (this.opened || this.blocked()) return;
    this.here = mapPositionOf(this.state.locationId, this.state.position);
    if (!this.here) return;
    this.map = worldMapFor(this.here.mapId);
    this.opened = true;
    this.hideTip();
    this.root.classList.add('is-open');
    this.button.classList.add('is-hidden');
    this.titleEl.textContent = this.map.name;
    this.whereEl.textContent = this.describeHere();
    this.buildLayer();
    this.view.setMap(this.map.width, this.map.height);
    this.view.zoom = OPEN_ZOOM;
    window.addEventListener('resize', this.onResize);
    this.fit();
    this.centerOnPlayer();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.pointers.clear();
    this.root.classList.remove('is-open');
    this.button.classList.remove('is-hidden');
    this.hideTip();
    window.removeEventListener('resize', this.onResize);
  }

  centerOnPlayer(): void {
    if (this.here) this.view.centerOn(this.here);
    this.render();
  }

  private zoomBy(factor: number): void {
    const r = this.stage.getBoundingClientRect();
    this.view.zoomAt(factor, { x: r.width / 2, y: r.height / 2 });
    this.render();
  }

  /** «Estás dentro: Retales», o junto al sitio o en la calle más cercana. */
  private describeHere(): string {
    const here = this.here!;
    const map = this.map!;
    if (here.inside) return `Estás dentro: ${here.inside}`;
    const near = <T extends Vec2>(list: readonly T[], max: number): T | undefined =>
      list.map((m) => [m, Math.hypot(m.x - here.x, m.y - here.y)] as const).filter(([, d]) => d <= max).sort((a, b) => a[1] - b[1])[0]?.[0];
    const spot = near(map.markers, 2.5);
    const area = near(map.areas, 14);
    return spot ? `Estás junto a ${spot.label}` : area ? `Estás en ${area.name}` : `Estás en ${map.name}`;
  }

  // ------------------------------------------------------------- dibujo

  /** El suelo y los edificios, una vez por mapa, a BAKE píxeles por tile. */
  private bake(map: WorldMapData): HTMLCanvasElement {
    const hit = this.baked.get(map.id);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = map.width * BAKE;
    c.height = map.height * BAKE;
    const ctx = c.getContext('2d')!;
    map.terrain.forEach((row, y) => row.forEach((t, x) => {
      ctx.fillStyle = GROUND[t];
      ctx.fillRect(x * BAKE, y * BAKE, BAKE, BAKE);
      // Pasos de peatones: bandas, no un bloque claro.
      if (t === 'crossing') {
        ctx.fillStyle = PALETTE.asphalt;
        for (let i = 1; i < BAKE; i += 3) ctx.fillRect(x * BAKE, y * BAKE + i, BAKE, 1);
      }
    }));
    for (const b of map.buildings) {
      const [x, y, w, h] = [b.x * BAKE, b.y * BAKE, b.w * BAKE, b.h * BAKE];
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = BUILDING[b.kind];
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      // Luz del noroeste, como en el juego: canto claro arriba y a la izquierda.
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 1, y + 1, w - 2, 1);
      ctx.fillRect(x + 1, y + 1, 1, h - 2);
    }
    this.baked.set(map.id, c);
    return c;
  }

  /** Iconos y nombres de calles: DOM, para que el texto sea nítido a cualquier zoom. */
  private buildLayer(): void {
    const map = this.map!;
    const areas = map.areas.map((a) => {
      const el = document.createElement('span');
      el.className = 'map__area';
      el.textContent = a.name;
      return { el, at: a as Vec2, area: true };
    });
    const pois = map.markers.map((m) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `map__poi map__poi--${m.category}`;
      const look = POI[m.category];
      el.textContent = look.glyph;
      el.style.setProperty('--poi', look.color);
      el.setAttribute('aria-label', m.label);
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse' && !this.pinned) this.showTip(m);
      });
      el.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse' && !this.pinned) this.hideTip();
      });
      el.addEventListener('click', () => {
        if (this.dragged > DRAG_SLOP) return;
        if (this.pinned && this.tipAt === m) this.hideTip();
        else {
          this.showTip(m);
          this.pinned = true;
        }
      });
      return { el, at: m as Vec2, area: false };
    });
    this.layer.replaceChildren(...areas.map((a) => a.el), ...pois.map((p) => p.el));
    this.placed = [...areas, ...pois];
  }

  private showTip(m: MapMarker): void {
    const { day, hour, minute } = this.state;
    const p = m.place;
    const status = p?.hours ? (isOpen(p, day, hour, minute) ? 'Abierto ahora' : `Cerrado · ${hoursLabel(p)}`) : '';
    const name = document.createElement('strong');
    name.textContent = m.label;
    const kind = document.createElement('span');
    kind.textContent = [POI[m.category].name, status].filter(Boolean).join(' · ');
    this.tip.replaceChildren(name, kind);
    this.tip.hidden = false;
    this.tipAt = m;
    this.positionTip();
  }

  private hideTip(): void {
    this.tip.hidden = true;
    this.tipAt = null;
    this.pinned = false;
  }

  private positionTip(): void {
    if (this.tip.hidden || !this.tipAt) return;
    const s = this.view.toScreen(this.tipAt);
    this.tip.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y - 16)}px) translate(-50%, -100%)`;
  }

  /** Ajusta el lienzo al escenario (y a la densidad de píxeles) y repinta. */
  private fit(): void {
    if (!this.opened) return;
    const r = this.stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.view.setScreen(r.width, r.height);
    this.render();
  }

  private render(): void {
    if (!this.opened || !this.map || !this.here) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    const o = this.view.toScreen({ x: 0, y: 0 });
    const k = this.view.zoom / BAKE;
    ctx.setTransform(k * dpr, 0, 0, k * dpr, o.x * dpr, o.y * dpr);
    ctx.drawImage(this.bake(this.map), 0, 0);
    // Borde del barrio: más allá sigue la ciudad, pero lo que se pisa acaba aquí.
    ctx.strokeStyle = 'rgba(232,227,218,0.35)';
    ctx.lineWidth = 2 / k;
    ctx.strokeRect(0, 0, this.map.width * BAKE, this.map.height * BAKE);

    const showAreas = this.view.zoom >= AREA_LABEL_ZOOM;
    for (const { el, at, area } of this.placed) {
      const s = this.view.toScreen(at);
      el.hidden = area && !showAreas;
      el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -50%)`;
    }
    const you = this.view.toScreen(this.here);
    this.you.style.transform = `translate(${Math.round(you.x)}px, ${Math.round(you.y)}px)`;
    // Dentro de un edificio la orientación no dice nada: sin flecha.
    this.you.classList.toggle('is-inside', !!this.here.inside);
    this.you.style.setProperty('--facing', `${FACING_DEG[this.state.facing] ?? 180}deg`);
    this.positionTip();
  }

  // ------------------------------------------------------------ tocar

  private bindPointer(): void {
    const stage = this.stage;
    const local = (e: PointerEvent | WheelEvent): Vec2 => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.zoomAt(Math.exp(-e.deltaY * 0.0015), local(e));
      this.render();
    }, { passive: false });
    stage.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, local(e));
      if (this.pointers.size === 1) this.dragged = 0;
    });
    stage.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const now = local(e);
      if (this.pointers.size === 1) {
        this.dragged += Math.hypot(now.x - prev.x, now.y - prev.y);
        // Hasta pasar el umbral, puede ser un clic sobre un icono: no se mueve el mapa.
        if (this.dragged > DRAG_SLOP) {
          // Capturar es comodidad (seguir arrastrando fuera del mapa); si el puntero ya no existe, se arrastra igual.
          try {
            if (!stage.hasPointerCapture(e.pointerId)) stage.setPointerCapture(e.pointerId);
          } catch {
            /* puntero ya liberado: sin captura */
          }
          this.view.panBy(now.x - prev.x, now.y - prev.y);
        }
      } else if (this.pointers.size === 2) {
        // Pellizco: el zoom sigue la distancia entre los dedos, alrededor de su punto medio.
        const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(now.x - other.x, now.y - other.y);
        if (before > 0) this.view.zoomAt(after / before, { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 });
        this.dragged = Number.POSITIVE_INFINITY;
      }
      this.pointers.set(e.pointerId, now);
      this.render();
    });
    const up = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    // Un toque en el mapa vacío suelta el nombre fijado.
    stage.addEventListener('click', (e) => {
      if (this.dragged > DRAG_SLOP || (e.target as HTMLElement).closest('.map__poi')) return;
      this.hideTip();
    });
  }
}
