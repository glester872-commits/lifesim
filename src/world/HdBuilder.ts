import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { BuildingDef, LocationDef } from '../types/game';
import { PROPS } from './tiles';
import { seat, standing } from './Layers';
import type { BuiltLocation } from './LocationBuilder';
import type { GlowSpot, WindowSpot } from './BuildingArt';
import { drawHdBuilding, type HdGlow } from './HdArchitecture';
import { paintHdGround } from './HdGround';
import { CANOPY_TINTS_HD, hdProp, hdPropGlow, metroLogo } from './HdProps';
import { ellipse, hash, HD_SCALE, hgrad, line, makeHd, rect, rgba, rrect, softShadow, speckle, tone, vgrad, type Ctx } from './HdKit';

/**
 * Construcción de un sitio pintado en alta definición (LocationDef.art = 'hd',
 * Visual V3, design/VISUAL_V3.md). Las mismas reglas que buildLocation —los
 * datos de la localización mandan, los sólidos salen de solidMask— con otro
 * pincel: el suelo y las fachadas se pintan en un único lienzo 4×, los props
 * son texturas 4× ordenadas por Y y la boca de metro es una pieza propia en
 * tres capas (el hueco en el suelo, los pretiles de los lados y el arco del
 * fondo, cada uno a su profundidad).
 *
 * Cada textura se dibuja una sola vez por sesión: al volver a entrar se reusa.
 */

type Rect = { x: number; y: number; w: number; h: number };
/** Un prop ya colocado: su textura, dónde cae (px de mundo) y la Y de su pie. */
type Silhouette = Rect & { key: string; baseY: number };

/**
 * Borra de un brillo (lienzo en coordenadas de mundo) la silueta de los props
 * que quedan por delante de él (su pie más al sur que `behindY`).
 */
function cutFronts(scene: Phaser.Scene, ctx: Ctx, fronts: readonly Silhouette[], area: Rect, behindY: number): void {
  ctx.globalCompositeOperation = 'destination-out';
  for (const f of fronts) {
    if (f.baseY <= behindY) continue;
    if (f.x > area.x + area.w || f.x + f.w < area.x || f.y > area.y + area.h || f.y + f.h < area.y) continue;
    const src = scene.textures.get(f.key).getSourceImage() as CanvasImageSource;
    ctx.drawImage(src, f.x, f.y, f.w, f.h);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Lo que el lienzo del suelo devolvió al pintarse, para no volver a pintarlo al reentrar. */
const baked = new Map<string, { windows: WindowSpot[]; glows: HdGlow[] }>();

// ------------------------------------------------------------------ boca de metro

/** Medidas de la boca a partir de su huella (px de mundo). */
function metroBox(b: BuildingDef): { x0: number; x1: number; y0: number; y1: number; hx0: number; hx1: number; wallY: number; stepY: number } {
  const x0 = b.tx * TILE;
  const x1 = (b.tx + b.w) * TILE;
  const y0 = b.ty * TILE;
  const y1 = (b.ty + b.h) * TILE;
  // El hueco: entre pretiles de 7 px; al fondo, el muro de azulejo que se ve de frente.
  return { x0, x1, y0, y1, hx0: x0 + 9, hx1: x1 - 9, wallY: y0 + 12, stepY: y0 + 30 };
}

/**
 * El hueco de la escalera, pintado en el suelo: muro del fondo de azulejo blanco
 * con el pasillo encendido, peldaños de granito que oscurecen según bajan, los
 * cantos de los muros laterales, pasamanos y la banda amarilla del primer peldaño.
 */
function drawMetroPit(ctx: Ctx, b: BuildingDef): void {
  const { x0, x1, y0, y1, hx0, hx1, wallY, stepY } = metroBox(b);
  const w = hx1 - hx0;
  const cx = (x0 + x1) / 2;
  // Corona de granito alrededor (lo que pisan los pretiles) y su sombra en la plaza.
  softShadow(ctx, cx, y1 - 2, (x1 - x0) * 0.6, 6, 0.35);
  rect(ctx, '#8d8a84', x0, y0 + 2, x1 - x0, y1 - y0 - 2);
  speckle(ctx, rgba('#3a3630', 0.25), x0, y0 + 2, x1 - x0, y1 - y0 - 2, 260, 41, 0.3);

  // Muro del fondo: azulejo biselado blanco con una cenefa azul, sucio abajo.
  vgrad(ctx, hx0, wallY, w, stepY - wallY, '#dfe3e2', '#a9b0b2');
  for (let y = wallY + 1.5; y < stepY; y += 2.2) rect(ctx, rgba('#7c8689', 0.35), hx0, y, w, 0.25);
  for (let row = 0, y = wallY; y < stepY; row++, y += 2.2) {
    for (let x = hx0 + (row % 2) * 2; x < hx1; x += 4) rect(ctx, rgba('#7c8689', 0.25), x, y, 0.25, 2.2);
  }
  rect(ctx, '#1d3f8f', hx0, wallY + 4.5, w, 1.6);
  rect(ctx, '#d4202a', hx0, wallY + 6.1, w, 0.5);
  vgrad(ctx, hx0, stepY - 6, w, 6, rgba('#3a3226', 0), rgba('#3a3226', 0.35));
  // El pasillo de abajo, encendido: el hueco no es un agujero, lleva a algún sitio.
  const dw = 18;
  rrect(ctx, '#33414a', cx - dw / 2 - 1, wallY + 7.5, dw + 2, stepY - wallY - 7.5, 1);
  vgrad(ctx, cx - dw / 2, wallY + 8.5, dw, stepY - wallY - 8.5, '#f4fbff', '#9fc2d6');
  rect(ctx, rgba('#ffffff', 0.7), cx - dw / 2 + 1, wallY + 9, dw - 2, 0.6);
  // Al fondo del pasillo, alguien de espaldas y la línea del andén.
  rect(ctx, '#b9cdd8', cx - dw / 2, stepY - 4, dw, 4);
  rect(ctx, '#2a3640', cx + 3, stepY - 9, 2.2, 5.5);
  ellipse(ctx, '#2a3640', cx + 4.1, stepY - 10, 1.1, 1.1);
  // Carteles a los lados de la puerta, con su marco.
  for (const [px, c1, c2] of [[hx0 + 3, '#e8b04a', '#2b4f8a'], [hx1 - 11, '#c84a6a', '#f2e2c4']] as const) {
    rect(ctx, '#2a3036', px - 0.5, wallY + 7.5, 8.5, 10);
    vgrad(ctx, px, wallY + 8, 7.5, 9, c1, c2);
    rect(ctx, rgba('#ffffff', 0.85), px + 1, wallY + 9, 5, 1);
    rect(ctx, rgba('#ffffff', 0.5), px + 1, wallY + 14.5, 3.5, 0.6);
  }

  // Peldaños: bajan hacia el fondo; cuanto más hondo, menos luz del cielo.
  const steps = Math.floor((y1 - stepY) / 3.6);
  for (let i = 0; i < steps; i++) {
    const y = stepY + i * 3.6;
    const depth = 1 - i / steps;
    const tread = tone('#a8a29a', -0.62 * depth);
    rect(ctx, tread, hx0, y, w, 3.6);
    speckle(ctx, rgba('#000000', 0.18), hx0, y, w, 3.6, 40, 70 + i, 0.25);
    // Canto del peldaño: tira metálica antideslizante y la sombra del de arriba.
    rect(ctx, tone('#c9c4ba', -0.5 * depth), hx0, y, w, 0.6);
    rect(ctx, rgba('#08060c', 0.35 * depth + 0.1), hx0, y + 0.6, w, 0.5);
    // Desgaste en el centro de cada peldaño.
    ellipse(ctx, rgba('#ffffff', 0.05 + 0.04 * (1 - depth)), cx - 6, y + 1.8, 6, 1);
    ellipse(ctx, rgba('#ffffff', 0.05 + 0.04 * (1 - depth)), cx + 6, y + 1.8, 6, 1);
  }
  // El primer peldaño: banda amarilla de aviso.
  rect(ctx, '#d6b23a', hx0, y1 - 3.6, w, 0.9);
  // Muros laterales del hueco: su cara de dentro se ve en escorzo.
  for (const [x, dir] of [[hx0, 1], [hx1, -1]] as const) {
    const face = 3.2;
    const fx = dir > 0 ? x : x - face;
    hgrad(ctx, fx, wallY, face, y1 - wallY, dir > 0 ? '#3a3a3c' : '#5a5a58', dir > 0 ? '#5a5a58' : '#3a3a3c');
    vgrad(ctx, fx, wallY, face, y1 - wallY, rgba('#08060c', 0.45), rgba('#08060c', 0));
    // Pasamanos de acero en ménsulas.
    const rx = dir > 0 ? x + face + 0.8 : x - face - 1.4;
    line(ctx, '#20262b', 0.9, [rx, stepY - 2, rx, y1 - 1]);
    line(ctx, rgba('#e6edf2', 0.6), 0.35, [rx - 0.2, stepY - 2, rx - 0.2, y1 - 1]);
    for (let y = stepY + 2; y < y1; y += 8) rect(ctx, '#20262b', Math.min(rx, x) - 0.2, y, Math.abs(rx - x) + 0.6, 0.6);
  }
  // Sombra que el muro del fondo echa sobre los primeros peldaños de abajo.
  vgrad(ctx, hx0, stepY, w, 8, rgba('#08060c', 0.45), rgba('#08060c', 0));
}

/** Pretiles laterales de granito con su barandilla de forja: lo que tapa a quien pasa por detrás. */
function drawMetroSides(ctx: Ctx, b: BuildingDef, ox: number, oy: number): void {
  const { x0, x1, y0, y1 } = metroBox(b);
  const top = 5;
  for (const px of [x0, x1 - 9]) {
    const x = px - ox;
    const ya = y0 + 2 - oy;
    const yb = y1 - oy;
    // Cara sur del pretil (la que mira a la cámara) y su lomo.
    rect(ctx, '#6f6b65', x, yb - top, 9, top);
    rect(ctx, '#57534e', x, yb - 1.2, 9, 1.2);
    speckle(ctx, rgba('#2a2620', 0.3), x, yb - top, 9, top, 20, px, 0.3);
    rect(ctx, '#b4afa6', x, ya - top, 9, yb - ya);
    rect(ctx, '#c9c4ba', x, ya - top, 9, 0.8);
    rect(ctx, '#9a958c', x + 7.6, ya - top, 1.4, yb - ya);
    speckle(ctx, rgba('#4a463e', 0.25), x, ya - top, 9, yb - ya, 60, px + 3, 0.3);
    // Barandilla: pasamanos verde oscuro, balaustres y la bola del remate.
    const rx = x + 4.5;
    const rail = 9;
    for (let y = ya - top + 3; y <= yb - top; y += 3.2) line(ctx, '#1d2a24', 0.55, [rx, y, rx, y - rail], 'butt');
    line(ctx, '#1d2a24', 1.1, [rx, ya - top - rail + 2, rx, yb - top - rail]);
    line(ctx, rgba('#7fa08f', 0.7), 0.35, [rx - 0.35, ya - top - rail + 2, rx - 0.35, yb - top - rail]);
    rect(ctx, '#1d2a24', rx - 1, yb - top - rail, 2, rail);
    ellipse(ctx, '#1d2a24', rx, yb - top - rail - 1.2, 1.4, 1.4);
    ellipse(ctx, rgba('#9fc0ae', 0.6), rx - 0.5, yb - top - rail - 1.7, 0.5, 0.5);
  }
}

/** Alto del arco del fondo por encima del suelo: rótulo, rombo y farolas. */
const ARCH_H = 58;

/**
 * El fondo de la boca: pretil norte y, encima, el arco de forja con el rótulo
 * azul de METRO, el rombo rojo y dos farolillos. Es lo primero que se lee
 * desde la avenida.
 */
function drawMetroArch(ctx: Ctx, b: BuildingDef, glow: boolean): void {
  const { x0, x1 } = metroBox(b);
  const w = x1 - x0;
  const cx = w / 2;
  const base = ARCH_H; // el pie del pretil norte, en coordenadas de la textura
  const pl = 9;
  const pr = w - 9;
  if (!glow) {
    // Pretil norte: lomo de granito y su cara al sur.
    rect(ctx, '#b4afa6', 0, base - 14, w, 9);
    rect(ctx, '#c9c4ba', 0, base - 14, w, 0.8);
    rect(ctx, '#6f6b65', 9, base - 5, w - 18, 5);
    speckle(ctx, rgba('#4a463e', 0.25), 0, base - 14, w, 14, 120, 7, 0.3);
    // Barandilla norte entre los postes.
    for (let x = pl + 2; x < pr - 1; x += 3) line(ctx, '#1d2a24', 0.55, [x, base - 11, x, base - 20], 'butt');
    line(ctx, '#1d2a24', 1.1, [pl, base - 20, pr, base - 20]);
    line(ctx, rgba('#7fa08f', 0.7), 0.35, [pl, base - 20.4, pr, base - 20.4]);
    // Postes del arco: fuste de fundición con basa y capitel.
    for (const px of [pl + 1, pr - 1]) {
      rrect(ctx, '#1d2a24', px - 2.2, base - 15, 4.4, 3, 0.6);
      rect(ctx, '#1d2a24', px - 1.3, base - 50, 2.6, 36);
      rect(ctx, rgba('#7fa08f', 0.55), px - 1, base - 50, 0.5, 36);
      rect(ctx, '#1d2a24', px - 2, base - 51.5, 4, 2);
      // Farolillo colgado del poste.
      rect(ctx, '#1d2a24', px - 0.4, base - 46, 0.8, 2);
      rrect(ctx, '#1d2a24', px - 1.9, base - 44.2, 3.8, 5, 0.6);
      rect(ctx, '#f3d79a', px - 1.2, base - 43.4, 2.4, 3.4);
    }
    // Viga con volutas que une los postes por debajo del rótulo.
    line(ctx, '#1d2a24', 0.9, [pl + 2, base - 30, cx - 10, base - 33, cx + 10, base - 33, pr - 2, base - 30]);
    for (const s of [-1, 1]) {
      ctx.strokeStyle = '#1d2a24';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(cx + s * 14, base - 33.5, 2.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Rótulo: caja azul con la palabra y el nombre de la estación, el rombo encima.
  const bw = pr - pl - 6;
  const by = base - 49;
  if (!glow) {
    rrect(ctx, '#11182a', cx - bw / 2 - 1, by - 1, bw + 2, 13, 1);
    softShadow(ctx, cx, by + 13.5, bw * 0.5, 1.6, 0.4);
  }
  rrect(ctx, '#1d3f8f', cx - bw / 2, by, bw, 11, 0.8);
  vgrad(ctx, cx - bw / 2, by, bw, 5, rgba('#ffffff', 0.18), rgba('#ffffff', 0));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 5.4px sans-serif';
  ctx.fillText('METRO', cx, by + 6.2);
  ctx.font = '2.6px sans-serif';
  ctx.fillStyle = '#c8d8ff';
  ctx.fillText('VALLESCO', cx, by + 9.6);
  metroLogo(ctx, cx, by - 5, 5.2);
  if (glow) {
    for (const px of [pl + 1, pr - 1]) rect(ctx, '#fff0c8', px - 1.2, base - 43.4, 2.4, 3.4);
  }
}

/**
 * Lo que brilla dentro del hueco de noche: el pasillo encendido y los tubos del
 * muro (se pinta encima de la luz, como un rótulo).
 */
function drawMetroPitGlow(ctx: Ctx, b: BuildingDef, ox: number, oy: number): void {
  const { x0, x1, wallY, stepY } = metroBox(b);
  const cx = (x0 + x1) / 2 - ox;
  const dw = 18;
  vgrad(ctx, cx - dw / 2, wallY + 8.5 - oy, dw, stepY - wallY - 8.5, rgba('#f4fbff', 0.95), rgba('#9fc2d6', 0.6));
  // El reflejo en los peldaños: un rastro frío que se apaga hacia arriba.
  vgrad(ctx, cx - dw / 2 - 2, stepY - oy, dw + 4, 16, rgba('#bcd8ea', 0.35), rgba('#bcd8ea', 0));
}

// ------------------------------------------------------------------ construcción

export function buildHdLocation(scene: Phaser.Scene, def: LocationDef): Pick<BuiltLocation, 'windows' | 'glows'> {
  const widthPx = def.ground[0].length * TILE;
  const heightPx = def.ground.length * TILE;
  const buildings = def.buildings ?? [];
  const metros = buildings.filter((b) => b.style === 'metro');

  // Suelo y fachadas: un único lienzo (2176 × 1344 en el prototipo), pintado una vez por sesión.
  const groundKey = `hd-ground-${def.id}`;
  let result = baked.get(def.id);
  makeHd(scene, groundKey, widthPx, heightPx, (ctx) => {
    paintHdGround(ctx, def);
    const windows: WindowSpot[] = [];
    const glows: HdGlow[] = [];
    buildings.forEach((b, i) => {
      if (b.style === 'metro') return;
      const r = drawHdBuilding(ctx, b, hash(i + 1, b.tx, b.ty) % 997);
      windows.push(...r.windows);
      glows.push(...r.glows);
    });
    for (const m of metros) drawMetroPit(ctx, m);
    result = { windows, glows };
    baked.set(def.id, result);
  });
  scene.add.image(0, 0, groundKey).setOrigin(0, 0).setScale(HD_SCALE).setDepth(-10);

  const windows = result?.windows ?? [];
  const glows: GlowSpot[] = [];

  // Props: texturas HD ancladas abajo al centro, por Y; lo plano ya está en el suelo.
  const fronts: Silhouette[] = [];
  for (const placement of def.props) {
    const prop = PROPS[placement.kind];
    if (prop.flat) continue;
    const art = hdProp(scene, placement.kind, placement.tx, placement.ty);
    if (!art) continue;
    const x = placement.tx * TILE + ((prop.tilesWide ?? 1) * TILE) / 2;
    const baseY = placement.ty * TILE + TILE;
    const img = scene.add.image(x, baseY, art.key).setOrigin(0.5, 1).setScale(HD_SCALE).setDepth(prop.mount ? seat(baseY) : standing(baseY));
    if (prop.castBlob) img.setTint(CANOPY_TINTS_HD[(placement.tx * 7 + placement.ty * 13) % CANOPY_TINTS_HD.length]);
    fronts.push({ key: art.key, x: x - art.w / 2, y: baseY - art.h, w: art.w, h: art.h, baseY });
    const glow = hdPropGlow(scene, placement.kind);
    if (glow) glows.push({ key: glow, x: x - art.w / 2, y: baseY - art.h, scale: HD_SCALE, quiet: true, additive: true });
  }

  // Los rótulos, escaparates y farolillos de fachada: una textura por pieza, encima de la luz de noche,
  // con un hueco donde un árbol o una farola se les pone delante (si no, brillarían a través de la copa).
  result?.glows.forEach((g, i) => {
    const key = makeHd(scene, `hd-glow-${def.id}-${i}`, g.w, g.h, (ctx) => {
      ctx.translate(-g.x, -g.y);
      g.draw(ctx);
      cutFronts(scene, ctx, fronts, { x: g.x, y: g.y, w: g.w, h: g.h }, g.y + g.h);
    });
    glows.push({ key, x: g.x, y: g.y, scale: HD_SCALE, quiet: true, additive: true });
  });

  // La boca de metro en capas: pretiles (por delante de quien pasa por detrás) y el arco del fondo.
  for (const m of metros) {
    const { x0, x1, y0, y1, wallY } = metroBox(m);
    const w = x1 - x0;
    const sideKey = makeHd(scene, `hd-metro-sides-${m.id}`, w, y1 - y0 + 16, (ctx) => drawMetroSides(ctx, m, x0, y0 - 16));
    scene.add.image(x0, y1, sideKey).setOrigin(0, 1).setScale(HD_SCALE).setDepth(standing(y1));
    const archKey = makeHd(scene, `hd-metro-arch-${m.id}`, w, ARCH_H, (ctx) => drawMetroArch(ctx, m, false));
    // El pie del pretil norte cae en el muro del fondo: quien camina por la acera de arriba queda detrás.
    scene.add.image(x0, wallY + 2, archKey).setOrigin(0, 1).setScale(HD_SCALE).setDepth(standing(wallY + 2));
    const archGlow = makeHd(scene, `hd-metro-arch-glow-${m.id}`, w, ARCH_H, (ctx) => {
      drawMetroArch(ctx, m, true);
      ctx.translate(-x0, -(wallY + 2 - ARCH_H));
      cutFronts(scene, ctx, fronts, { x: x0, y: wallY + 2 - ARCH_H, w, h: ARCH_H }, wallY + 2);
    });
    glows.push({ key: archGlow, x: x0, y: wallY + 2 - ARCH_H, scale: HD_SCALE, quiet: true, additive: true });
    // El hueco encendido: este sí alumbra la plaza (luz cálida delante, fría por la escalera).
    const pitGlow = makeHd(scene, `hd-metro-pit-glow-${m.id}`, w, y1 - wallY, (ctx) => drawMetroPitGlow(ctx, m, x0, wallY));
    glows.push({ key: pitGlow, x: x0, y: wallY, scale: HD_SCALE });
  }


  return { windows, glows };
}
