import { PALETTE, TILE } from '../config/constants';
import { PASSENGER_LOOKS } from '../data/npcs';
import type { Facing } from '../types/game';
import { hashSeed, seededRng, type Rng } from '../systems/MetroDaily';
import { colorsOf, type Pose } from '../world/HumanArt';
import { drawPersonFine } from '../world/HumanArtHD';
import { drawResidentialFacade, drawResidentialRoof, type FacadeBay } from '../world/ResidentialArt';
import { px, type Ctx } from '../world/paint';
import { mix } from '../world/Surfaces';

/**
 * La portada (title.ts): una calle de Vallesco al atardecer, pintada por código como el resto del mundo. Las fachadas son
 * las del juego (world/ResidentialArt, con el acabado clásico de Alpha-03) y la gente, la de la calle (HumanArtHD); el
 * cielo, el skyline, los árboles y las farolas se pintan aquí con paleta corta y bandas, sin degradados ni desenfoque.
 *
 * Todo se hornea una vez por tamaño de pantalla en lienzos a resolución lógica (un píxel de arte = `scale` píxeles CSS,
 * siempre entero, y el navegador lo agranda sin suavizar). Por fotograma sólo se copian esas capas y se mueven las nubes
 * y unos pocos peatones, a 15 fps. Con movimiento reducido no se anima nada. `stop()` lo quita todo: ni bucle ni escuchas.
 */

const STOREY = TILE * 2;
const FPS = 15;
/** Cuándo se encienden las luces (s desde que se abre la portada): unas ventanas, las farolas, el resto. */
const STAGE_AT = [0, 3.5, 8] as const;
/** Ventanas encendidas en cada fase (cada una tiene su umbral fijo: la que se enciende ya no se apaga). */
const LIT_SHARE = [0.25, 0.45, 0.7] as const;

// Atardecer: de violeta arriba a ámbar en el horizonte, el tono girando (no sólo aclarando) banda a banda.
const SKY = ['#2c2c58', '#433a6e', '#6a4574', '#9a5070', '#c86566', '#e5855c', '#f2aa63', '#f6c97c'] as const;
const SKYLINE = ['#5b4468', '#4c3a5c', '#6f5272'] as const; // cuerpo, sombra, canto al sol
const CLOUD = ['#b87185', '#e59a8e', '#f6c39a'] as const; // panza, cuerpo, borde encendido
const LEAF = ['#3e5a34', PALETTE.leaf, '#7c9a46', '#b2a64e'] as const; // honda, base, luz, luz de poniente
const LAMP = '#ffd98a';
const WARM = '#f7cfb2'; // la luz de la hora, multiplicada sobre la calle
const AWNINGS: readonly (readonly [string, string])[] = [['#2f4a3a', '#e6dcc0'], ['#8c2f2f', '#e6dcc0'], ['#c8302a', PALETTE.white], ['#e6dcc0', '#a8552f'], ['#2c5fa8', '#f2c230']];
const WALLS: readonly { wall: string; mat: 'stucco' | 'brick' | 'ashlar'; roof: string; clay: boolean }[] = [
  { wall: PALETTE.wall, mat: 'stucco', roof: PALETTE.roofA, clay: true },
  { wall: PALETTE.brick, mat: 'brick', roof: PALETTE.roofA, clay: false },
  { wall: PALETTE.stone, mat: 'ashlar', roof: PALETTE.roofB, clay: false },
  { wall: '#d9b48a', mat: 'stucco', roof: PALETTE.roofA, clay: true },
  { wall: '#c98e6a', mat: 'stucco', roof: PALETTE.roofB, clay: false },
  { wall: '#e2cfa8', mat: 'stucco', roof: PALETTE.roofA, clay: true },
];
const SHUTTERS = ['#4f6f4a', '#3f5f78', '#6e5038', '#8a4a3a'] as const;

const canvas = (w: number, h: number): [HTMLCanvasElement, Ctx] => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return [c, c.getContext('2d', { willReadFrequently: true })!];
};

/** Un píxel de arte = `scale` px CSS, entero. En vertical se baja la escala para que quepa más calle de ancho. */
export function titleScale(width: number, height: number): number {
  return Math.max(2, Math.min(Math.round(height / 240), Math.floor(width / 120)));
}

/** Disco relleno a píxeles (el sol, el halo de las farolas): sin antialias. */
function disc(ctx: Ctx, color: string, cx: number, cy: number, r: number): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    px(ctx, color, cx - half, cy + y, half * 2 + 1, 1);
  }
}

// ------------------------------------------------------------------ capas horneadas

function paintSky(ctx: Ctx, w: number, horizon: number): void {
  const band = Math.ceil(horizon / SKY.length);
  for (let i = 0; i < SKY.length; i++) px(ctx, SKY[i], 0, i * band, w, band);
  // Paso de una banda a la siguiente: tramado ordenado en tres filas (25 %, 50 %, 75 % del tono de abajo), no un degradado.
  for (let i = 1; i < SKY.length; i++) {
    const y0 = i * band;
    for (let x = 0; x < w; x++) {
      if (x % 4 === 0) px(ctx, SKY[i], x, y0 - 3);
      if (x % 2 === 1) px(ctx, SKY[i], x, y0 - 2);
      if (x % 4 !== 2) px(ctx, SKY[i], x, y0 - 1);
    }
  }
  px(ctx, SKY[SKY.length - 1], 0, (SKY.length - 1) * band, w, horizon);
  // El sol bajo, a la derecha, medio escondido tras los tejados: corona, cuerpo y dos rayas de bruma delante.
  const sx = Math.round(w * 0.72);
  const sy = horizon - 10;
  disc(ctx, '#f9d88e', sx, sy, 15);
  disc(ctx, '#fde9b4', sx, sy, 12);
  disc(ctx, '#fff6d8', sx, sy, 8);
  px(ctx, SKY[SKY.length - 2], sx - 18, sy - 2, 36, 1);
  px(ctx, SKY[SKY.length - 2], sx - 14, sy + 3, 28, 1);
}

/** Los tejados lejanos: bloques, chimeneas, antenas, una cúpula y una torre con chapitel; alguna ventana encendida. */
function paintSkyline(ctx: Ctx, w: number, base: number, rng: Rng, stage: number): void {
  const [body, dark, lit] = SKYLINE;
  let x = -Math.floor(rng() * 20);
  const dome = Math.floor(w * (0.18 + rng() * 0.2));
  const tower = Math.floor(w * (0.55 + rng() * 0.3));
  while (x < w) {
    const bw = 14 + Math.floor(rng() * 26);
    const bh = 26 + Math.floor(rng() * 34);
    px(ctx, body, x, base - bh, bw, bh);
    px(ctx, lit, x, base - bh, bw, 1);
    px(ctx, dark, x + bw - 2, base - bh + 1, 2, bh - 1);
    if (rng() < 0.5) px(ctx, body, x + 3 + Math.floor(rng() * (bw - 6)), base - bh - 4, 2, 4); // chimenea
    if (rng() < 0.3) px(ctx, dark, x + 2 + Math.floor(rng() * (bw - 4)), base - bh - 7, 1, 7); // antena
    for (let wy = base - bh + 4; wy < base - 4; wy += 6) {
      for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
        const r = rng();
        if (r < 0.08 + stage * 0.07) px(ctx, r < 0.04 ? '#f6c97c' : '#d99a5a', wx, wy, 1, 2);
      }
    }
    x += bw;
  }
  // La cúpula (iglesia de barrio, ficticia) y la torre del reloj: lo que dice «ciudad vieja» de lejos.
  const dh = base - 62;
  px(ctx, body, dome - 12, dh, 24, 62);
  for (let y = 0; y < 12; y++) {
    const half = Math.round(Math.sqrt(144 - y * y));
    px(ctx, body, dome - half, dh - y, half * 2, 1);
  }
  px(ctx, lit, dome - 9, dh - 9, 4, 1);
  px(ctx, body, dome - 2, dh - 18, 4, 6);
  px(ctx, dark, dome, dh - 24, 1, 6);
  px(ctx, dark, dome - 2, dh - 22, 5, 1);
  const th = base - 78;
  px(ctx, body, tower - 5, th, 10, 78);
  px(ctx, dark, tower + 3, th, 2, 78);
  for (let y = 0; y < 14; y++) px(ctx, body, tower - 5 + Math.floor(y / 3), th - y, 10 - 2 * Math.floor(y / 3), 1);
  disc(ctx, '#e8c27a', tower, th + 8, 2);
  px(ctx, dark, tower, th + 7, 1, 2);
}

/** La fila de casas del juego, de punta a punta, con sus toldos en los bajos con escaparate. */
function paintStreet(ctx: Ctx, w: number, ground: number, rng: Rng, stage: number): void {
  let x = -Math.floor(rng() * 40);
  let k = 0;
  while (x < w) {
    const n = 3 + Math.floor(rng() * 4);
    const floors = 2 + Math.floor(rng() * 3);
    const look = WALLS[(k + Math.floor(rng() * WALLS.length)) % WALLS.length];
    const door = 1 + Math.floor(rng() * (n - 2));
    const bays: FacadeBay[] = Array.from({ length: n }, (_, i) => ({
      ground: i === door ? 'door' : rng() < 0.75 ? 'window' : 'wall',
      groundLit: true,
      upper: Array.from({ length: floors - 1 }, () => {
        const window = rng() < 0.85;
        // El umbral sale siempre de la tirada: las tres fases tiran igual y sólo cambia hasta dónde se enciende.
        const r = rng();
        return { window, lit: window && r < LIT_SHARE[stage], blind: [3, 6, 9, 5][Math.floor(rng() * 4)] };
      }),
    }));
    const bw = n * TILE;
    const fh = floors * STOREY;
    const roof = 18;
    const seed = 900 + k * 37;
    const [r, rctx] = canvas(bw, roof);
    drawResidentialRoof(rctx, bw, roof, look.roof, seed, { clay: look.clay, laundry: k % 3 === 1, classic: true });
    ctx.drawImage(r, x, ground - fh - roof);
    const [f, fctx] = canvas(bw, fh);
    drawResidentialFacade(fctx, {
      bays, floors, wall: look.wall, lit: PALETTE.amber, seed, number: 2 + k * 4, mat: look.mat,
      shutter: SHUTTERS[k % SHUTTERS.length], leaf: PALETTE.wood, flowers: k % 2 === 0, balconies: look.mat === 'ashlar', classic: true,
    });
    ctx.drawImage(f, x, ground - fh);
    // Toldos de rayas sobre cada tramo de escaparates seguidos: la planta baja es de comercios.
    const colors = AWNINGS[(k + seed) % AWNINGS.length];
    for (let i = 0; i < n; ) {
      if (bays[i].ground !== 'window' || rng() < 0.3) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < n && bays[j + 1].ground === 'window') j++;
      const ax = x + i * TILE + 1;
      const aw = (j - i + 1) * TILE - 2;
      const ay = ground - STOREY + 3;
      for (let s = 0; s < aw; s++) px(ctx, Math.floor(s / 3) % 2 ? colors[1] : colors[0], ax + s, ay, 1, 4);
      px(ctx, PALETTE.outline, ax, ay - 1, aw, 1);
      for (let s = 0; s < aw; s += 3) px(ctx, Math.floor(s / 3) % 2 ? colors[1] : colors[0], ax + s, ay + 4, 2, 1); // flecos
      ctx.globalAlpha = 0.35;
      px(ctx, PALETTE.ink, ax, ay + 5, aw, 2);
      ctx.globalAlpha = 1;
      i = j + 1;
    }
    x += bw;
    k++;
  }
}

/** Acera de losas, bordillo y calzada con su raya; todo tibio con la luz de la hora. */
function paintGround(ctx: Ctx, w: number, h: number, ground: number, rng: Rng): void {
  const walk = 22;
  const slab = mix(PALETTE.pavement, '#c9a088', 0.25);
  px(ctx, slab, 0, ground, w, walk);
  for (let y = ground; y < ground + walk; y += 6) {
    px(ctx, PALETTE.pavementSeam, 0, y, w, 1);
    const off = ((y - ground) / 6) % 2 ? 6 : 0;
    for (let x = off; x < w; x += 12) px(ctx, PALETTE.pavementSeam, x, y, 1, 6);
  }
  for (let i = 0; i < w * 0.4; i++) px(ctx, mix(slab, '#e9c9a8', 0.4), Math.floor(rng() * w), ground + 1 + Math.floor(rng() * (walk - 2)));
  // Sombra de contacto al pie de las fachadas.
  ctx.globalAlpha = 0.3;
  px(ctx, PALETTE.ink, 0, ground, w, 2);
  ctx.globalAlpha = 1;
  px(ctx, PALETTE.kerb, 0, ground + walk, w, 2);
  px(ctx, mix(PALETTE.kerb, PALETTE.ink, 0.35), 0, ground + walk + 2, w, 1);
  const road = mix(PALETTE.asphalt, '#5a4050', 0.25);
  px(ctx, road, 0, ground + walk + 3, w, h - ground - walk - 3);
  const lane = ground + walk + 3 + Math.floor((h - ground - walk - 3) / 2);
  for (let x = 4; x < w; x += 20) px(ctx, mix(PALETTE.roadLine, '#f2aa63', 0.2), x, lane, 10, 1);
}

/** Árboles y farolas en el bordillo: lo que va delante de la gente. `lit`: farolas encendidas. */
function paintCurb(ctx: Ctx, w: number, ground: number, lit: boolean, seed: number): void {
  const curb = ground + 21;
  const rng = seededRng(hashSeed('title-curb', seed));
  for (let x = 18 + Math.floor(rng() * 20); x < w + 20; x += 64 + Math.floor(rng() * 24)) {
    // Plátano de sombra: alcorque, tronco y copa a manchas, con el poniente en el canto derecho.
    px(ctx, mix(PALETTE.trunk, PALETTE.ink, 0.3), x - 4, curb - 1, 9, 2);
    px(ctx, PALETTE.trunk, x - 1, curb - 26, 3, 25);
    px(ctx, '#7a5a40', x + 1, curb - 26, 1, 25);
    const cy = curb - 40;
    const rows: readonly number[] = [6, 10, 13, 14, 15, 15, 15, 14, 13, 11, 8, 5];
    rows.forEach((half, i) => px(ctx, i > 6 ? LEAF[0] : LEAF[1], x - half, cy + i * 2 - 6, half * 2, 2));
    for (let i = 0; i < 26; i++) {
      const lx = x - 12 + Math.floor(rng() * 22);
      const ly = cy - 4 + Math.floor(rng() * 12);
      px(ctx, rng() < 0.5 ? LEAF[2] : LEAF[0], lx, ly, 2, 2);
    }
    for (let i = 0; i < 7; i++) px(ctx, LEAF[3], x + 6 + Math.floor(rng() * 8), cy - 3 + Math.floor(rng() * 14), 2, 1);
    // Farola fernandina, ficticia: pie, fuste, brazo y farol.
    const lx = x + 32;
    if (lx > w + 4) continue;
    px(ctx, PALETTE.iron, lx - 2, curb - 2, 5, 2);
    px(ctx, PALETTE.iron, lx, curb - 34, 1, 32);
    px(ctx, PALETTE.iron, lx - 2, curb - 36, 5, 2);
    px(ctx, PALETTE.iron, lx - 1, curb - 39, 3, 1);
    if (lit) {
      ctx.globalAlpha = 0.16;
      disc(ctx, LAMP, lx, curb - 34, 10);
      ctx.globalAlpha = 0.28;
      disc(ctx, LAMP, lx, curb - 34, 5);
      ctx.globalAlpha = 0.22;
      px(ctx, LAMP, lx - 6, curb - 1, 13, 2); // el charco de luz en la acera
      ctx.globalAlpha = 1;
      px(ctx, '#fff2c8', lx - 1, curb - 35, 3, 1);
    } else px(ctx, '#7d7a6e', lx - 1, curb - 35, 3, 1);
  }
}

// ------------------------------------------------------------------ gente y nubes

interface Walker {
  look: number;
  x: number;
  feet: number;
  speed: number;
  facing: Facing;
  phase: number;
}

const WALK: readonly Pose[] = [1, 0, 2, 0];

function personFrames(look: number): Record<string, HTMLCanvasElement> {
  const colors = colorsOf(PASSENGER_LOOKS[look]);
  const out: Record<string, HTMLCanvasElement> = {};
  for (const facing of ['left', 'right'] as const) {
    for (const pose of [0, 1, 2] as const) {
      const [c, ctx] = canvas(16, 24);
      drawPersonFine(ctx, facing, pose, colors);
      out[`${facing}-${pose}`] = c;
    }
  }
  return out;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
}

/** Una nube larga de poniente: tres bultos, panza en sombra y el canto de abajo a la derecha encendido por el sol. */
function paintCloud(ctx: Ctx, c: Cloud): void {
  const x = Math.round(c.x);
  const { y, w } = c;
  const a = Math.floor(w * 0.18);
  const b = Math.floor(w * 0.42);
  px(ctx, CLOUD[1], x + a, y - 4, Math.floor(w * 0.3), 4);
  px(ctx, CLOUD[1], x + a - 2, y - 2, Math.floor(w * 0.3) + 4, 2);
  px(ctx, CLOUD[1], x + b, y - 7, Math.floor(w * 0.34), 7);
  px(ctx, CLOUD[1], x + b - 2, y - 5, Math.floor(w * 0.34) + 4, 5);
  px(ctx, CLOUD[1], x, y, w, 3);
  px(ctx, CLOUD[0], x + 2, y + 3, w - 4, 2);
  px(ctx, CLOUD[0], x + 6, y + 5, w - 14, 1);
  px(ctx, CLOUD[2], x + b + 2, y - 7, Math.floor(w * 0.34) - 4, 1);
  px(ctx, CLOUD[2], x + a + 1, y - 4, Math.floor(w * 0.3) - 3, 1);
  px(ctx, CLOUD[2], x + w - 8, y + 3, 6, 1);
}

// ------------------------------------------------------------------ la escena

export interface TitleScene {
  stop(): void;
}

/** Monta la portada en `host` y la anima. */
export function startTitleScene(host: HTMLElement): TitleScene {
  const view = document.createElement('canvas');
  view.className = 'title__scene-art';
  host.append(view);
  const out = view.getContext('2d')!;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const frames = new Map<number, Record<string, HTMLCanvasElement>>();

  let W = 0;
  let H = 0;
  let sky: HTMLCanvasElement | null = null;
  let city: HTMLCanvasElement[] = [];
  let curbOff: HTMLCanvasElement | null = null;
  let curbOn: HTMLCanvasElement | null = null;
  let walkers: Walker[] = [];
  let clouds: Cloud[] = [];

  const build = (): void => {
    const scale = titleScale(window.innerWidth, window.innerHeight);
    W = Math.ceil(window.innerWidth / scale);
    H = Math.ceil(window.innerHeight / scale);
    view.width = W;
    view.height = H;
    view.style.width = `${W * scale}px`;
    view.style.height = `${H * scale}px`;
    const ground = H - 46;
    // El horizonte, por encima de los tejados más bajos: entre casa y casa asoman el sol y la ciudad vieja.
    const horizon = ground - 118;
    let ctx: Ctx;
    [sky, ctx] = canvas(W, H);
    paintSky(ctx, W, horizon);
    // Las tres fases de luz comparten semilla: lo que cambia es sólo qué ventanas brillan.
    city = [0, 1, 2].map((stage) => {
      const [c, cctx] = canvas(W, H);
      // La base del skyline queda por debajo del tejado más bajo (2 plantas + azotea): sólo asoma por encima de las casas.
      paintSkyline(cctx, W, ground - 70, seededRng(hashSeed('title-skyline', W)), stage);
      paintStreet(cctx, W, ground, seededRng(hashSeed('title-street', W)), stage);
      paintGround(cctx, W, H, ground, seededRng(hashSeed('title-ground', W)));
      // La luz de la hora: un tono cálido multiplicado, más hondo según anochece, sólo donde hay ciudad (el cielo, no).
      const [mask, mctx] = canvas(W, H);
      mctx.drawImage(c, 0, 0);
      cctx.globalCompositeOperation = 'multiply';
      cctx.fillStyle = mix(WARM, '#c9a2b4', stage * 0.25);
      cctx.fillRect(0, 0, W, H);
      cctx.globalCompositeOperation = 'destination-in';
      cctx.drawImage(mask, 0, 0);
      cctx.globalCompositeOperation = 'source-over';
      return c;
    });
    [curbOff, ctx] = canvas(W, H);
    paintCurb(ctx, W, ground, false, W);
    [curbOn, ctx] = canvas(W, H);
    paintCurb(ctx, W, ground, true, W);
    // Gente: pocos, según el ancho (de 2 a 6), en los dos sentidos y a distintas alturas de acera.
    const rng = seededRng(hashSeed('title-people', W));
    const count = Math.max(2, Math.min(6, Math.floor(W / 70)));
    walkers = Array.from({ length: count }, (_, i) => ({
      look: Math.floor(rng() * PASSENGER_LOOKS.length),
      x: rng() * W,
      feet: ground + 9 + Math.floor(rng() * 10),
      speed: 9 + rng() * 6,
      facing: i % 2 ? 'left' : 'right',
      phase: rng() * 4,
    }));
    walkers.sort((a, b) => a.feet - b.feet);
    for (const w of walkers) if (!frames.has(w.look)) frames.set(w.look, personFrames(w.look));
    // Las nubes, repartidas por el cielo que queda sobre los tejados.
    clouds = Array.from({ length: 3 }, (_, i) => ({ x: rng() * W, y: 14 + Math.floor((i * Math.max(12, horizon - 30)) / 3) + Math.floor(rng() * 6), w: 30 + Math.floor(rng() * 30) }));
  };

  const started = performance.now();
  const draw = (now: number): void => {
    if (!sky || !curbOn || !curbOff) return;
    const t = reduced ? STAGE_AT[2] + 1 : (now - started) / 1000;
    const stage = t >= STAGE_AT[2] ? 2 : t >= STAGE_AT[1] ? 1 : 0;
    // Las farolas parpadean dos veces al encenderse.
    const flick = t - STAGE_AT[1];
    const lamps = stage >= 1 && !(flick < 0.12 || (flick > 0.3 && flick < 0.38));
    out.clearRect(0, 0, W, H);
    out.drawImage(sky, 0, 0);
    for (const c of clouds) paintCloud(out, c);
    out.drawImage(city[stage], 0, 0);
    for (const w of walkers) {
      const pose = reduced ? 0 : WALK[Math.floor(w.phase) % WALK.length];
      out.drawImage(frames.get(w.look)![`${w.facing}-${pose}`], Math.round(w.x) - 8, w.feet - 24);
    }
    out.drawImage(lamps ? curbOn : curbOff, 0, 0);
  };

  let last = 0;
  let raf = 0;
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = (now - last) / 1000;
    if (dt < 1 / FPS) return;
    last = now;
    const step = Math.min(dt, 0.25);
    for (const w of walkers) {
      w.x += (w.facing === 'right' ? 1 : -1) * w.speed * step;
      w.phase += w.speed * step * 0.35;
      if (w.x > W + 12) w.x = -12;
      if (w.x < -12) w.x = W + 12;
    }
    for (const c of clouds) {
      c.x += 0.6 * step;
      if (c.x > W + 4) c.x = -c.w - 4;
    }
    draw(now);
  };

  let resizeTimer = 0;
  const onResize = (): void => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      build();
      draw(performance.now());
    }, 150);
  };

  build();
  draw(performance.now());
  window.addEventListener('resize', onResize);
  // Con movimiento reducido, quieta y con las luces ya encendidas (sólo se rehace al cambiar el tamaño).
  if (!reduced) raf = requestAnimationFrame(tick);
  return {
    stop(): void {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      view.remove();
      frames.clear();
      city = [];
      sky = curbOn = curbOff = null;
    },
  };
}

// ------------------------------------------------------------------ el logotipo

/** Letras de 8 de alto con trazo de dos píxeles; la barra doble va inclinada. */
const LOGO: Readonly<Record<string, readonly string[]>> = {
  L: ['XX....', 'XX....', 'XX....', 'XX....', 'XX....', 'XX....', 'XXXXXX', 'XXXXXX'],
  I: ['XX', 'XX', 'XX', 'XX', 'XX', 'XX', 'XX', 'XX'],
  F: ['XXXXXX', 'XXXXXX', 'XX....', 'XXXXX.', 'XXXXX.', 'XX....', 'XX....', 'XX....'],
  E: ['XXXXXX', 'XXXXXX', 'XX....', 'XXXXX.', 'XXXXX.', 'XX....', 'XXXXXX', 'XXXXXX'],
  S: ['.XXXXX', 'XXXXXX', 'XX....', 'XXXXX.', '.XXXXX', '....XX', 'XXXXXX', 'XXXXX.'],
  M: ['XX....XX', 'XXX..XXX', 'XXXXXXXX', 'XX.XX.XX', 'XX....XX', 'XX....XX', 'XX....XX', 'XX....XX'],
  '/': ['...XX', '...XX', '..XX.', '..XX.', '.XX..', '.XX..', 'XX...', 'XX...'],
};
const LOGO_TEXT = ['L', 'I', 'F', 'E', '/', '/', 'S', 'I', 'M'] as const;
const LOGO_INK = { light: '#fff4e0', base: PALETTE.white, low: '#d9b48a', shadow: '#1c1620' };
const LOGO_ACCENT = { light: '#ffd49a', base: PALETTE.amber, low: '#c97a3a' };
/** Separación tras cada letra: una columna, salvo entre las dos barras (van juntas, como un solo signo). */
const gap = (i: number): number => (i < LOGO_TEXT.length - 1 && !(LOGO_TEXT[i] === '/' && LOGO_TEXT[i + 1] === '/') ? 1 : 0);

/** Tamaño del logotipo en píxeles de arte (con margen para el contorno y la sombra). */
export const LOGO_W = LOGO_TEXT.reduce((w, ch, i) => w + LOGO[ch][0].length + gap(i), 0) + 4;
export const LOGO_H = 12;

/**
 * Pinta LIFE//SIM a resolución de arte en `c` y lo agranda `scale` veces sin suavizar. Crema con la fila de arriba más
 * clara y la de abajo tostada (el tono gira, no sólo oscurece), sombra dura de un píxel y la doble barra en ámbar, el
 * color de la ciudad encendida.
 */
export function paintLogo(c: HTMLCanvasElement, scale: number): void {
  c.width = LOGO_W;
  c.height = LOGO_H;
  c.style.width = `${LOGO_W * scale}px`;
  c.style.height = `${LOGO_H * scale}px`;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, LOGO_W, LOGO_H);
  // Contorno oscuro de un píxel alrededor de cada letra (se lee sobre el cielo naranja y sobre el panel), sombra dura
  // debajo a la derecha y, encima, el relleno.
  for (const pass of ['outline', 'shadow', 'fill'] as const) {
    let x = 2;
    LOGO_TEXT.forEach((ch, i) => {
      const glyph = LOGO[ch];
      const ink = ch === '/' ? LOGO_ACCENT : LOGO_INK;
      glyph.forEach((row, y) => {
        [...row].forEach((cell, cx) => {
          if (cell !== 'X') return;
          if (pass === 'outline') px(ctx, LOGO_INK.shadow, x + cx - 1, y + 1, 3, 3);
          else if (pass === 'shadow') px(ctx, LOGO_INK.shadow, x + cx + 2, y + 4, 1, 1);
          else px(ctx, y === 0 ? ink.light : y >= 6 ? ink.low : ink.base, x + cx, y + 2, 1, 1);
        });
      });
      x += glyph[0].length + gap(i);
    });
  }
}
