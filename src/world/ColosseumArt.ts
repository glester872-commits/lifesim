import { PALETTE, TILE } from '../config/constants.ts';
import { COLOSSEUM_SHAPE, colosseumOuterHeight, colosseumPassage } from '../data/colosseo.ts';
import { px, shade, type Ctx } from './paint.ts';

type Pixel = readonly [number, number];

const { x, y, rx, ry, pitX, pitY, inner, bays } = COLOSSEUM_SHAPE;
const CX = x * TILE;
const CY = y * TILE;
const RX = rx * TILE;
const RY = ry * TILE;
const PIT_X = pitX * TILE;
const PIT_Y = pitY * TILE;
const TAU = Math.PI * 2;
const STEP = TAU / bays;
const TRAVERTINE = '#c7b496';
const LIMESTONE = '#e2d4b6';
const BRICK = '#a07459';
const TUFF = '#ae967a';
const SHADE = '#4f4038';
const VOID = '#302b2a';
const MOSS = '#6c6b4f';

export const COLOSSEUM_DEPTH = { north: CY - RY * inner + 8, south: CY + RY * inner } as const;

function polygon(ctx: Ctx, color: string, points: readonly Pixel[]): void {
  const rows = points.map((p) => p[1]);
  for (let row = Math.floor(Math.min(...rows)); row < Math.ceil(Math.max(...rows)); row++) {
    const intersections: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if (row + 0.5 < Math.min(y0, y1) || row + 0.5 >= Math.max(y0, y1)) continue;
      intersections.push(x0 + (x1 - x0) * (row + 0.5 - y0) / (y1 - y0));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.ceil(intersections[i] - 0.5);
      const right = Math.ceil(intersections[i + 1] - 0.5);
      if (right > left) px(ctx, color, left, row, right - left, 1);
    }
  }
}

const point = (angle: number, scale: number, rise = 0): Pixel =>
  [CX + Math.cos(angle) * RX * scale, CY + Math.sin(angle) * RY * scale - rise];

function wedge(ctx: Ctx, color: string, angle: number, end: number, r1: number, r2: number, rise = 0): void {
  polygon(ctx, color, [point(angle, r1, rise), point(end, r1, rise), point(end, r2, rise), point(angle, r2, rise)]);
}

function disk(ctx: Ctx, color: string, a: number, b: number): void {
  for (let row = -Math.floor(b); row <= Math.floor(b); row++) {
    const half = Math.floor(a * Math.sqrt(Math.max(0, 1 - (row / b) ** 2)));
    px(ctx, color, CX - half, CY + row, half * 2 + 1, 1);
  }
}

function paintPit(ctx: Ctx): void {
  disk(ctx, shade(LIMESTONE, 0.07), PIT_X + 9, PIT_Y + 7);
  disk(ctx, '#8b7966', PIT_X + 6, PIT_Y + 5);
  disk(ctx, VOID, PIT_X + 2, PIT_Y + 2);

  const deckEdge = 54;
  const pitRect = (color: string, left: number, top: number, width: number, height: number): void => {
    for (let row = Math.max(-Math.floor(PIT_Y), top); row < Math.min(PIT_Y, top + height); row++) {
      const half = Math.floor(PIT_X * Math.sqrt(1 - (row / PIT_Y) ** 2));
      const start = Math.max(-half, left);
      const end = Math.min(half, left + width);
      if (end > start) px(ctx, color, CX + start, CY + row, end - start, 1);
    }
  };

  pitRect('#675a49', -145, -86, 282, 172);
  // Sombra del borde alto y tierra húmeda repartida en bolsas, como en las fotos del hipogeo.
  for (let row = -85; row < 86; row++) {
    const sector = Math.floor(Math.max(0, 22 - (row + 85)) / 5);
    if (sector) pitRect(shade(SHADE, sector * -0.024), -145, row, 282, 1);
  }
  for (let i = 0; i < 370; i++) {
    const dx = ((i * 73 + (i >> 3) * 19 + 17) % 274) - 137;
    const dy = ((i * 41 + (i >> 2) * 23 + 7) % 170) - 85;
    const moss = ((dx + 139) >> 5) % 3 === 1 && (dy < -30 || dy > 26);
    pitRect(moss ? shade(MOSS, i % 3 * 0.02) : i % 3 === 0 ? '#7e6b52' : '#55473a', dx, dy, 1 + i % 5, 1);
  }

  // Muros discontinuos y cámaras de distinta anchura. El centro queda como eje largo.
  const lanes: readonly (readonly [number, readonly (readonly [number, number])[]])[] = [
    [-67, [[-92, -62], [-49, 45], [59, 113]]],
    [-51, [[-126, -81], [-77, -22], [-11, 134]]],
    [-34, [[-131, -10], [2, 38], [46, 133]]],
    [-17, [[-136, -114], [-99, 42], [51, 133]]],
    [15, [[-136, -61], [-47, 28], [40, 131]]],
    [33, [[-127, -94], [-84, -15], [-1, 126]]],
    [48, [[-128, 11], [24, 120]]],
    [64, [[-98, -54], [-42, 98]]],
  ];
  const wall = (left: number, top: number, width: number, cap: number, base: string): void => {
    const depth = 6 + ((left + top + 230) % 5);
    pitRect(VOID, left + 2, top + 4, width + 2, cap + depth);
    pitRect(shade(base, -0.18), left, top + 1, width, cap + depth);
    pitRect(shade(base, -0.23), left + 1, top + cap + 4, width - 1, 1);
    pitRect(base, left, top - 4, width, cap + 3);
    for (let i = 0; i < width; i += 5 + ((left + 140) % 4)) {
      const stoneW = Math.min(width - i, 4 + ((i + top + 88) % 3));
      const worn = (i + left + top + 230) % 7 < 2;
      if (stoneW <= 0) continue;
      pitRect(shade(base, worn ? 0.025 : 0.17), left + i, top - 4 + Number(worn), stoneW, 2);
      pitRect(shade(base, -0.10), left + i, top + cap - 2, 1, depth);
      if ((i + top + 90) % 4 === 0) pitRect(SHADE, left + i, top + cap + 1, Math.min(3, stoneW), 3);
    }
  };

  lanes.forEach(([row, sections], lane) => {
    for (const [left, right] of sections) {
      wall(left, row, right - left, 4 + (lane % 3), lane % 2 === 0 ? TUFF : BRICK);
      for (let pier = left + 14; pier < right - 5; pier += 16 + ((lane + pier + 140) % 11)) {
        if ((pier + lane) % 4 !== 0) wall(pier, row + 4, 3 + (lane % 3), 3 + ((pier + 140) % 5), TUFF);
      }
    }
  });

  // Tarima contemporánea, limitada a un extremo de la elipse.
  pitRect('#4f4135', deckEdge - 8, -85, 97, 170);
  pitRect('#786649', deckEdge - 4, -85, 93, 170);
  pitRect('#c5b496', deckEdge, -85, 90, 170);
  for (let row = -82; row < 86; row += 4) {
    pitRect(row % 8 === 2 ? '#a89476' : '#b9a587', deckEdge, row, 90, 1);
    pitRect('#deceb0', deckEdge + (row % 9 + 9) % 9, row + 1, 1, 2);
  }
  for (let row = -78; row < 83; row += 13) {
    pitRect('#69533c', deckEdge - 3, row, 3, 4);
    pitRect('#9e886a', deckEdge + 13 + ((row + 78) % 37), row, 2, 3);
  }
  pitRect('#eadbbe', deckEdge, -84, 2, 169);

  // Pasamanos de la pasarela, en tramos cortos para que la elipse conserve el contorno de píxel.
  for (let n = 0; n < 160; n++) {
    const a = TAU * n / 160;
    const b = a + TAU / 160;
    const rail = (angle: number, y: number): Pixel =>
      [CX + (PIT_X + 5) * Math.cos(angle), CY + (PIT_Y + 5) * Math.sin(angle) - y];
    polygon(ctx, '#4a4841', [rail(a, 5), rail(b, 5), rail(b, 4), rail(a, 4)]);
  }
  for (let post = 0; post < 98; post++) {
    const angle = TAU * post / 98;
    const pxX = CX + Math.round((PIT_X + 5) * Math.cos(angle));
    const pxY = CY + Math.round((PIT_Y + 5) * Math.sin(angle));
    px(ctx, PALETTE.iron, pxX, pxY - 5, 2, 6);
    px(ctx, PALETTE.metalLit, pxX, pxY - 5);
  }
}

export function colosseumGround(ctx: Ctx): void {
  // Sombra de contacto: recorta el monumento sobre el adoquín sin sustituir su textura.
  ctx.save();
  for (let bay = 0; bay < bays; bay++) {
    const a = bay * STEP;
    const hasOuter = colosseumOuterHeight(bay) > 0;
    const edge = hasOuter ? 1 : inner;
    if (colosseumPassage(a + STEP / 2)) continue;
    ctx.globalAlpha = 0.11;
    wedge(ctx, '#3d3334', a, a + STEP, edge, edge + (hasOuter ? 0.040 : 0.068));
    ctx.globalAlpha = 0.23;
    wedge(ctx, '#3d3334', a, a + STEP, edge - 0.007, edge + 0.031);
  }
  ctx.restore();
  for (let bay = 0; bay < bays; bay++) {
    const a = bay * STEP;
    const end = a + STEP;
    const tone = (bay * 11 % 5 - 2) * 0.014;
    if (!colosseumOuterHeight(bay)) {
      wedge(ctx, shade(LIMESTONE, tone - 0.09), a, end, 0.865, 1.008);
      wedge(ctx, shade(TRAVERTINE, tone - 0.18), a, end, 0.935, 0.951);
      wedge(ctx, shade(LIMESTONE, tone + 0.05), a, end, 0.976, 0.987);
      for (let joint = 0; joint < 3; joint++) {
        const t = a + 0.011 + joint * 0.025 + (bay % 4) * 0.002;
        const edge = 0.891 + joint * 0.026;
        wedge(ctx, shade(TUFF, tone - 0.07), t, t + 0.004, edge, edge + 0.027);
      }
      if (bay % 3 !== 1 && !colosseumPassage(a + STEP / 2)) {
        wedge(ctx, '#8f7f6a', a + 0.015, a + 0.036, 0.97, 1.002);
        wedge(ctx, '#d6c5a5', a + 0.012, a + 0.034, 0.962, 0.992, 3);
      }
    }
    wedge(ctx, shade('#b5a58c', tone), a, end, 0.48, inner + 0.004);
    wedge(ctx, shade(TUFF, tone - 0.13), a, end, 0.802, 0.815);
    wedge(ctx, shade(LIMESTONE, tone - 0.04), a, end, 0.814, 0.830);
    if (colosseumPassage(a + STEP / 2) || bay % 10 === 0) {
      wedge(ctx, shade(LIMESTONE, tone), a + 0.003, end - 0.003, 0.49, 0.80);
      for (let row = 0; row < 7; row++) {
        const r = 0.56 + row * 0.033;
        wedge(ctx, '#9b8c76', a + 0.003, end - 0.003, r, r + 0.009);
      }
      continue;
    }

    // Grada por sectores, con unos paños caídos que dejan ver el relleno.
    const abrasion = (bay * 23) % 11;
    const collapse = (bay >= 23 && bay <= 29) || (bay >= 46 && bay <= 49) || (bay >= 64 && bay <= 70);
    const breakRow = 1 + Math.floor(1.6 * (1 + Math.sin(bay * 1.5)));
    wedge(ctx, shade(collapse || abrasion < 3 ? BRICK : TUFF, tone - 0.03), a, end, 0.50, 0.785);
    for (let row = 0; row < 7; row++) {
      if (collapse && row >= breakRow && row <= breakRow + 2) {
        const brokenRim = 0.546 + row * 0.032;
        wedge(ctx, shade(TUFF, tone - 0.1), a + 0.013, a + 0.036, brokenRim, brokenRim + 0.021);
        continue;
      }
      if ((bay * 7 + row * 13) % 19 < (abrasion < 3 ? 7 : 2)) continue;
      const r = 0.548 + row * 0.032;
      const sun = -0.075 * Math.sin(a + 0.9);
      wedge(ctx, shade(TUFF, tone + sun - 0.115), a, end, r - 0.006, r + 0.005);
      wedge(ctx, shade(TRAVERTINE, tone + sun), a, end, r + 0.005, r + 0.027);
      wedge(ctx, shade(LIMESTONE, tone + sun + 0.025), a, end, r + 0.005, r + 0.012);
      if ((bay + row * 5) % 9 < 6) {
        const joint = a + 0.021 + ((bay * 3 + row) % 7) * 0.005;
        wedge(ctx, shade(TUFF, tone + sun - 0.14), joint, joint + 0.006, r + 0.004, r + 0.025);
      }
    }
    if (collapse && bay % 2 === 1) {
      // Radiales expuestos bajo la grada, entre planos de piedra conservada.
      wedge(ctx, shade(BRICK, -0.13), a + 0.020, a + 0.044, 0.69, 0.819);
      wedge(ctx, shade(TUFF, 0.06), a + 0.012, a + 0.032, 0.69, 0.819, 3);
      wedge(ctx, shade(LIMESTONE, -0.035), a + 0.014, a + 0.025, 0.73, 0.816, 4);
    }
  }
  paintPit(ctx);
}

function wallBay(ctx: Ctx, bay: number, radius: number, height: number, outer: boolean, night: boolean): void {
  const a = bay * STEP;
  const b = a + STEP;
  const mid = a + STEP / 2;
  const p0 = point(a, radius);
  const p1 = point(b, radius);
  const projected = Math.abs(p0[0] - p1[0]);
  if (projected < 0.9) return;
  const sun = Math.round((-Math.cos(mid) * 0.095 + (((bay * 19) % 9) - 4) * 0.009) * 50) / 50;
  const stone = shade(outer ? TRAVERTINE : bay % 7 < 4 ? BRICK : TUFF, sun);
  const loc = (u: number, v: number): Pixel =>
    [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u - v];
  const face = (color: string, u0: number, u1: number, v0: number, v1: number): void =>
    polygon(ctx, color, [loc(u0, v0), loc(u1, v0), loc(u1, v1), loc(u0, v1)]);

  if (!night) {
    face(stone, 0, 1, 0, height);
    face(shade(stone, -0.20), 0, 1, 0, 2);
    face(shade(stone, -0.12), 0, 1, 2, 5);
    for (let v = 6; v < height - 4; v += outer ? 6 : 5) {
      const joint = (bay * 17 + v * 7) % 11;
      const u = joint * 0.046;
      face(shade(stone, -0.075), u, Math.min(1, u + 0.41 + (joint % 3) * 0.15), v, v + 1);
      face(shade(stone, 0.067), u, Math.min(1, u + 0.3), v + 1, v + 2);
      const vertical = 0.17 + joint * 0.053;
      face(shade(stone, -0.11), vertical, vertical + 0.05, v - 3, v);
      if (projected >= 12 && joint % 3 !== 0) {
        const chip = (bay + v * 13) % 13 / 16;
        face(shade(stone, joint % 2 === 0 ? -0.15 : 0.1), chip, chip + 0.075, v + 2, v + 3);
      }
    }
  }

  const floor = outer ? 31 : 25;
  const levels = outer ? 3 : 2;
  for (let level = 0; level < levels; level++) {
    const base = level * floor + 3;
    const openingH = floor - 9;
    if (height - base < 13 || projected < 4) continue;
    const archH = Math.min(9, openingH * 0.47);
    const rise = Math.min(height - 2, base + openingH);
    const jamb = rise - archH;
    if (night) {
      if ((bay * 3 + level) % 7 < 5) {
        face('#8e5f41', 0.26, 0.74, base + 1, base + 8);
        face('#bb7b43', 0.30, 0.7, base + 1, base + 5);
        face('#de9b58', 0.39, 0.62, base + 1, base + 3);
      }
      continue;
    }

    // Dovelas, bóveda oscura y un lateral interior visible según la curva.
    for (let v = base; v < rise; v++) {
      const t = Math.max(0, (v + 0.5 - jamb) / archH);
      const half = 0.32 * Math.sqrt(1 - t * t);
      const rim = (Math.floor((v - base) / 2) + bay) % 4;
      face(shade(stone, rim === 0 ? -0.075 : 0.13), Math.max(0, 0.408 - half), Math.min(1, 0.592 + half), v, v + 1);
      const depth = t > 0.32 ? '#292627' : VOID;
      face(v < base + 3 ? '#796654' : depth, 0.5 - half, 0.5 + half, v, v + 1);
      if (half > 0.08 && v > base + 1) {
        const litSide = Math.cos(mid) < 0;
        const bevel = (1 - t * 0.63) * 0.125;
        face(t > 0.32 ? SHADE : '#645344', litSide ? 0.5 - half : 0.5 + half - bevel,
          litSide ? 0.5 - half + bevel : 0.5 + half, v, v + 1);
      }
    }
    if (outer && projected >= 8 && rise > base + 13) {
      face(shade(stone, -0.17), 0.015, 0.16, base + 1, rise - 2);
      face(shade(stone, 0.14), 0.018, 0.087, base + 2, rise - 3);
      face(shade(stone, -0.095), 0, 0.187, base, base + 1);
      face(shade(stone, 0.16), 0, 0.166, base + 1, base + 3);
      face(shade(stone, 0.15), 0, 0.18 + 0.025 * level, rise - 3, rise - 1);
      face(shade(stone, -0.14), 0.016, 0.172 + 0.019 * level, rise - 1, rise);
    }
    const cornice = (level + 1) * floor;
    if (cornice + 1 < height) {
      face(shade(stone, -0.14), 0, 1, cornice - 3, cornice - 1);
      face(shade(LIMESTONE, sun), 0, 1, cornice - 1, cornice + 1);
      if (outer) face(shade(stone, 0.084), 0, 1, cornice + 1, cornice + 2);
    }
  }

  if (night) return;
  if (outer && height > 109 && projected >= 5) {
    face(shade(stone, -0.15), 0.02, 0.17, 95, height - 4);
    face(shade(stone, 0.14), 0.02, 0.113, 96, height - 5);
    if (bay % 2 === 0) {
      face(shade(stone, 0.15), 0.37, 0.65, 101, 113);
      face(SHADE, 0.42, 0.60, 102, 111);
      face(shade(stone, -0.12), 0.38, 0.65, 100, 101);
    }
  }

  // Canto superior y núcleo expuesto donde falta el siguiente paño.
  face(shade(stone, -0.11), 0, 1, height - 3, height - 2);
  face(shade(LIMESTONE, sun + (outer ? 0 : -0.12)), 0, 1, height - 2, height);
  const back = radius - (outer ? 0.049 : 0.060);
  wedge(ctx, shade(outer ? LIMESTONE : TUFF, sun), a, b, radius, back, height);
  if (!outer && bay % 6 < 2 && projected > 5) {
    wedge(ctx, shade(stone, -0.12), a + 0.014, a + 0.036, radius, radius - 0.074, height - 1);
  }
  if (outer) {
    const next = colosseumOuterHeight(bay + 1);
    if (next < height - 6) {
      polygon(ctx, shade(BRICK, sun - 0.08), [point(b, radius, height), point(b, back, height), point(b, back, next), point(b, radius, next)]);
      for (let course = next + 4; course < height - 1; course += 4) {
        polygon(ctx, shade(BRICK, sun - 0.17), [point(b, radius, course), point(b, back, course), point(b, back, course + 1), point(b, radius, course + 1)]);
      }
    }
  }
}

export function colosseumWalls(ctx: Ctx, side: 'north' | 'south', night = false): void {
  if (side === 'north') {
    for (let bay = 0; bay < bays; bay++) {
      const height = colosseumOuterHeight(bay);
      if (height) wallBay(ctx, bay, 1, height, true, night);
    }
  }
  for (let bay = 0; bay < bays; bay++) {
    const angle = (bay + 0.5) * STEP;
    const front = Math.sin(angle) > 0;
    if (front !== (side === 'south') || colosseumPassage(angle)) continue;
    const broken = (bay * 13) % 12;
    const height = front ? 26 + broken + (bay % 9 < 2 ? 11 : 0) : 39 + broken + (bay % 11 < 3 ? 9 : 0);
    wallBay(ctx, bay, inner, height, false, night);
  }
}
